-- NEU-012 Phase 2 correction, Slice 2 (cont.) — overlay the per-user scope on the
-- visibility resolvers, so re-pointing users onto SHARED profiles is net-zero on
-- record visibility (Layer 2), not just module grants (Layer 1).
--
-- Re-pointing (mig 154) moved which profile supplies a user's visibility_scope.
-- Migration 152 had made current_user_visibility_scope read the profile ONLY, so
-- re-pointing drifted 8 users' record visibility. Their intended per-user scope is
-- preserved intact in permission_overrides.scope (NOT NULL), and the snapshot tool
-- had set every snapshot profile's scope == that override scope (verified: 29/29
-- shadow users match). So overlaying the override scope reproduces every user's
-- pre-correction visibility exactly (net-zero) while removing the drift — and it
-- re-aligns the DB with the client, which already reads override scope (useDataScope).
--
-- This is the Layer-2 analog of the Slice-1 grant overlay (mig 153), nothing more.
-- The substance of Contract #6 (make scope CONFIGURABLE & visible, drop the role
-- derivation, remove hardcoded dept allow-lists in current_user_can_view_record,
-- app==DB coherence) is still pending and untouched here.

create or replace function public.current_user_visibility_scope()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_override_scope text;
  v_profile_scope text;
begin
  select u.id into v_user_id
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return 'own'; end if;

  -- Layer 2 per-user override scope wins (visible customization), mirroring grants.
  select po.scope into v_override_scope
  from public.permission_overrides po where po.user_id = v_user_id limit 1;
  if v_override_scope is not null then
    return v_override_scope;
  end if;

  select ap.visibility_scope into v_profile_scope
  from public.users u
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where u.id = v_user_id limit 1;
  return coalesce(v_profile_scope, 'own');
end;
$function$;

create or replace function public.current_user_visibility_departments()
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_override_depts text[];
  v_profile_depts text[];
begin
  select u.id into v_user_id
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return array[]::text[]; end if;

  select po.departments into v_override_depts
  from public.permission_overrides po where po.user_id = v_user_id limit 1;
  if v_override_depts is not null and array_length(v_override_depts, 1) > 0 then
    return v_override_depts;
  end if;

  select ap.visibility_departments into v_profile_depts
  from public.users u
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where u.id = v_user_id limit 1;
  return coalesce(v_profile_depts, array[]::text[]);
end;
$function$;
