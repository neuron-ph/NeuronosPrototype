-- NEU-012 Contract #4+#5 (Phase 2) — COURSE CORRECTION, Slice 1: re-add the override overlay.
--
-- Migration 152 flipped the resolver to read the assigned profile ONLY, on the
-- (wrong) reading that "kill overrides" meant "kill all per-user customization".
-- Corrected model (Marcus, 2026-06-05): users sit on a SHARED Access Profile and
-- may carry VISIBLE, clickable per-user customization on top. The override layer
-- (permission_overrides.module_grants) stays as that visible delta; only hidden /
-- self-enforcing settings (the umbrellas, already gone) die.
--
--   effective(key) = override[key]  if the override has the key
--                  = profile[key]   else if the assigned profile has the key
--                  = false          otherwise
--
-- Explicit, no parent->child cascade at read, no role-derived fallback. App
-- (PermissionProvider) and DB read this identically. The base is the assigned
-- users.access_profile_id (Slice 2), NOT permission_overrides.applied_profile_id.
--
-- Behavioural no-op today: every user is currently on their snapshot profile,
-- which already absorbed their override, so overlay == profile-only for all 60
-- users (verified: 0 differing grants / 18,755 checked). It becomes load-bearing
-- when Slice 2 re-points users onto shared profiles + a real personal delta.
--
-- Scope: module-grant resolver only. The visibility funcs (current_user_visibility_scope
-- / _departments) stay profile-only here; they are realigned under Contract #6.

create or replace function public.current_user_effective_module_grant(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_profile_id uuid;
  v_override_grants jsonb := '{}'::jsonb;
  v_profile_grants jsonb;
begin
  select u.id, u.access_profile_id
    into v_user_id, v_profile_id
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  -- Layer 1 — visible per-user customization. If this key is present in the
  -- override it wins, explicitly (true OR false). No cascade.
  select coalesce(po.module_grants, '{}'::jsonb)
    into v_override_grants
  from public.permission_overrides po
  where po.user_id = v_user_id
  limit 1;

  if v_override_grants ? p_key then
    return coalesce((v_override_grants ->> p_key)::boolean, false);
  end if;

  -- Layer 2 — the assigned (shared) Access Profile base.
  select ap.module_grants
    into v_profile_grants
  from public.access_profiles ap
  where ap.id = v_profile_id
    and ap.is_active = true
  limit 1;

  if v_profile_grants is not null and v_profile_grants ? p_key then
    return coalesce((v_profile_grants ->> p_key)::boolean, false);
  end if;

  -- No role fallback, no cascade: absent => denied.
  return false;
end;
$function$;
