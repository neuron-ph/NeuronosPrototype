-- 100_broaden_access_profiles_select.sql
-- Allow all authenticated users to SELECT access_profiles so the new
-- PermissionProvider can resolve role-default fallbacks for users without
-- an applied_profile_id. Mutation (manage) stays locked to admins.
-- Profiles are role-config templates, not sensitive per-user data.

drop policy if exists "access_profiles_select" on public.access_profiles;

create policy "access_profiles_select"
  on public.access_profiles
  for select
  to authenticated
  using (true);
