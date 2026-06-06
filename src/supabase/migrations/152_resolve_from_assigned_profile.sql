-- NEU-012 Contract #4+#5 (Phase 2), Slice 3 — flip enforcement to the assigned profile.
--
-- Every user now has users.access_profile_id pointing at one explicit profile
-- (Slice 2, snapshot-verified == their prior effective access). Flip the three
-- resolvers to read that profile ONLY: exact key lookup, no override merge, no
-- parent->child cascade, no role-derived fallback. This makes app + DB read the
-- identical explicit set and is the moment "Access Profile = the single truth"
-- becomes real for enforcement. permission_overrides is now unused by these
-- functions (dropped in Slice 5 after a fresh grep proves zero references).

create or replace function public.current_user_effective_module_grant(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_grants jsonb;
begin
  select ap.module_grants into v_grants
  from public.users u
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where u.auth_id = auth.uid()
  limit 1;

  if v_grants is null then
    return false;
  end if;
  if v_grants ? p_key then
    return coalesce((v_grants ->> p_key)::boolean, false);
  end if;
  return false;
end;
$function$;

create or replace function public.current_user_visibility_scope()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_scope text;
begin
  select ap.visibility_scope into v_scope
  from public.users u
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where u.auth_id = auth.uid()
  limit 1;
  -- No role-derived fallback (strict): a user with no/empty profile scope gets
  -- the most restrictive 'own'. Visibility is configured on the profile, period.
  return coalesce(v_scope, 'own');
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
  v_depts text[];
begin
  select ap.visibility_departments into v_depts
  from public.users u
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where u.auth_id = auth.uid()
  limit 1;
  return coalesce(v_depts, array[]::text[]);
end;
$function$;
