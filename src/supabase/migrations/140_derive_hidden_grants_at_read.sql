-- 140_derive_hidden_grants_at_read.sql
-- NEU-012 Phase 1 CORRECTION of migration 137.
--
-- 137 derived hidden/umbrella module grants (ops_bookings, ops_projects) AT WRITE
-- TIME via triggers on access_profiles + permission_overrides. That is WRONG for
-- permission_overrides, because an override row stores only a SPARSE DELTA layered
-- on top of a profile — not a complete grant set. Deriving the umbrella on a
-- delta that lacks the source service keys computes OR(...) = false and writes
-- e.g. ops_bookings:create=false INTO the override, which then SHADOWS the true
-- value from the user's profile/baseline (resolver layer 1 wins). Real impact:
-- Jayson (Pricing Manager) — profile PRICING MANAGER grants marine/others create,
-- but his override carried ops_bookings:create=false, so the resolver denied and
-- the (now grant-driven) Create Booking button disappeared.
--
-- Correct model: hidden/umbrella keys are DERIVED, never stored or looked up
-- literally. We derive them AT READ TIME on the user's fully-resolved grants —
-- i.e. ops_bookings:action = OR over the 5 service modules of each source's OWN
-- fully-resolved effective grant (which already merges override → profile →
-- baseline). Recursion depth is 1 (sources are never hidden).
--
-- This migration:
--   1. Drops the 137 write-triggers (keeps the derive function; now unused by triggers).
--   2. Rewrites current_user_effective_module_grant to derive hidden keys at read,
--      preserving 139's service-aware, baseline-only role-default fallback.
--   3. Strips the manufactured ops_bookings:* / ops_projects:* artifacts from
--      permission_overrides deltas (they must never live in a delta).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Stop deriving at write
-- ────────────────────────────────────────────────────────────────────────────

drop trigger if exists access_profiles_resolve_hidden_grants on public.access_profiles;
drop trigger if exists permission_overrides_resolve_hidden_grants on public.permission_overrides;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Resolver: layered literal lookup for normal keys; OR-of-sources for hidden
-- ────────────────────────────────────────────────────────────────────────────

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
  v_module text;
  v_action text;
begin
  v_module := split_part(p_key, ':', 1);
  v_action := split_part(p_key, ':', 2);

  -- Hidden/umbrella modules are DERIVED at read time from their source modules,
  -- each resolved through the full layer stack. (Recursion depth 1.)
  if v_module = 'ops_bookings' then
    return public.current_user_effective_module_grant('ops_forwarding:' || v_action)
        or public.current_user_effective_module_grant('ops_brokerage:' || v_action)
        or public.current_user_effective_module_grant('ops_trucking:' || v_action)
        or public.current_user_effective_module_grant('ops_marine_insurance:' || v_action)
        or public.current_user_effective_module_grant('ops_others:' || v_action);
  elsif v_module = 'ops_projects' then
    return public.current_user_effective_module_grant('bd_projects:' || v_action)
        or public.current_user_effective_module_grant('pricing_projects:' || v_action);
  end if;

  -- Normal key: layered literal lookup (override → applied profile → baseline).
  select u.id, u.role, u.department, u.service_type
    into v_user_id, v_role, v_department, v_service
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  select coalesce(po.module_grants, '{}'::jsonb), po.applied_profile_id
    into v_override_grants, v_applied_profile_id
  from public.permission_overrides po
  where po.user_id = v_user_id
  limit 1;

  if v_override_grants ? p_key then
    return coalesce((v_override_grants ->> p_key)::boolean, false);
  end if;

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

  -- Role-default fallback: BASELINE templates only, SERVICE-AWARE (migration 139).
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

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Hidden/umbrella keys are DERIVED at read, never stored. Strip any stored
--    ops_bookings:* / ops_projects:* from BOTH tables so nothing reads a stale
--    or shadowing value (the app derives them too via deriveHiddenModuleGrants).
-- ────────────────────────────────────────────────────────────────────────────

update public.permission_overrides po
set module_grants = (
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(po.module_grants) e
  where e.key not like 'ops_bookings:%'
    and e.key not like 'ops_projects:%'
)
where po.module_grants is not null
  and po.module_grants <> '{}'::jsonb
  and (po.module_grants ?| array[
        'ops_bookings:view','ops_bookings:create','ops_bookings:edit',
        'ops_bookings:approve','ops_bookings:delete','ops_bookings:export',
        'ops_projects:view','ops_projects:create','ops_projects:edit',
        'ops_projects:approve','ops_projects:delete','ops_projects:export'
      ]);

update public.access_profiles ap
set module_grants = (
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(ap.module_grants) e
  where e.key not like 'ops_bookings:%'
    and e.key not like 'ops_projects:%'
)
where ap.module_grants is not null
  and ap.module_grants <> '{}'::jsonb
  and (ap.module_grants ?| array[
        'ops_bookings:view','ops_bookings:create','ops_bookings:edit',
        'ops_bookings:approve','ops_bookings:delete','ops_bookings:export',
        'ops_projects:view','ops_projects:create','ops_projects:edit',
        'ops_projects:approve','ops_projects:delete','ops_projects:export'
      ]);
