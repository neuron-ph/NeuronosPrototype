-- 139_service_aware_baseline_role_default.sql
-- NEU-012 Phase 1 (Decision 2): make the role-default fallback in the grant
-- resolver SERVICE-AWARE and BASELINE-ONLY.
--
-- Problem: current_user_effective_module_grant's last-resort fallback (used when
-- a user has no per-user override key and no applied profile) selected the single
-- newest active profile matching (target_role, target_department), ignoring
-- service AND mixing in custom (is_baseline = false) profiles. On Operations this
-- means up to 8 profiles collide on (Operations, staff) and a random one
-- (newest) wins — and a hand-assigned custom profile like "CUSTOMS DECLARANT"
-- could silently become everyone's default.
--
-- Fix: the role-default fallback now (a) considers ONLY baseline templates
-- (is_baseline = true), and (b) matches the user's service_type, preferring the
-- exact-service baseline, then a service-less baseline. There is exactly one
-- baseline per (department, role, service), so the result is deterministic.
-- Custom profiles are only ever applied when explicitly assigned
-- (permission_overrides.applied_profile_id) — never as a default.
--
-- Only the final fallback block changes; the override-grant and applied-profile
-- layers are preserved exactly.

create or replace function public.current_user_effective_module_grant(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_role text;
  v_department text;
  v_service text;
  v_override_grants jsonb := '{}'::jsonb;
  v_applied_profile_id uuid;
  v_profile_grants jsonb := '{}'::jsonb;
  v_role_profile_grants jsonb := '{}'::jsonb;
begin
  select u.id, u.role, u.department, u.service_type
    into v_user_id, v_role, v_department, v_service
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  -- Layer 1: per-user override grants (highest precedence)
  select coalesce(po.module_grants, '{}'::jsonb), po.applied_profile_id
    into v_override_grants, v_applied_profile_id
  from public.permission_overrides po
  where po.user_id = v_user_id
  limit 1;

  if v_override_grants ? p_key then
    return coalesce((v_override_grants ->> p_key)::boolean, false);
  end if;

  -- Layer 2: explicitly assigned profile (any profile, baseline or custom)
  if v_applied_profile_id is not null then
    select coalesce(ap.module_grants, '{}'::jsonb)
      into v_profile_grants
    from public.access_profiles ap
    where ap.id = v_applied_profile_id
      and ap.is_active = true
    limit 1;

    if v_profile_grants ? p_key then
      return coalesce((v_profile_grants ->> p_key)::boolean, false);
    end if;
  end if;

  -- Layer 3: role-default fallback — BASELINE templates only, SERVICE-AWARE.
  -- One baseline per (department, role, service) => deterministic.
  select coalesce(ap.module_grants, '{}'::jsonb)
    into v_role_profile_grants
  from public.access_profiles ap
  where ap.is_active = true
    and ap.is_baseline = true
    and ap.target_role = v_role
    and (ap.target_department = v_department or ap.target_department is null)
    and (ap.target_service = v_service or ap.target_service is null)
  order by
    case when ap.target_department = v_department then 0 else 1 end,
    case
      when ap.target_service is not distinct from v_service then 0
      when ap.target_service is null then 1
      else 2
    end,
    ap.updated_at desc
  limit 1;

  if v_role_profile_grants ? p_key then
    return coalesce((v_role_profile_grants ->> p_key)::boolean, false);
  end if;

  return false;
end;
$function$;
