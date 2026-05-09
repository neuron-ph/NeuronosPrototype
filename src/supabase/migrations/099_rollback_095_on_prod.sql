-- 099_rollback_095_on_prod.sql
-- Rollback of 095_access_configuration_source_of_truth.sql.
-- Applied to prod to restore the legacy is_executive() / is_manager_or_above()
-- access model. Dev keeps 095 (and 096/097/098) for continued testing.

-- ---------------------------------------------------------------------------
-- 1. Drop the strict policies introduced by 095
-- ---------------------------------------------------------------------------

drop policy if exists "access_profiles_select" on public.access_profiles;
drop policy if exists "access_profiles_manage" on public.access_profiles;
drop policy if exists "overrides_select" on public.permission_overrides;
drop policy if exists "overrides_manage" on public.permission_overrides;
drop policy if exists "teams_manage" on public.teams;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trade_parties','profile_locations','profile_countries','dispatch_people','vehicles',
    'profile_modes','profile_movements','profile_incoterms','profile_cargo_types','profile_cargo_natures',
    'profile_brokerage_types','profile_customs_entries','profile_customs_entry_procedures','profile_truck_types',
    'profile_selectivity_colors','profile_examinations','profile_container_types','profile_package_types',
    'profile_preferential_treatments','profile_credit_terms','profile_cpe_codes','profile_service_statuses',
    'profile_industries','profile_lead_sources','profile_carriers','profile_forwarders','service_providers'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_create_granted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_granted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_granted', table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Convert scope vocabulary back, restore old check constraint
-- ---------------------------------------------------------------------------

alter table public.permission_overrides
  drop constraint if exists permission_overrides_scope_check;

update public.permission_overrides
set scope = case scope
  when 'department' then 'department_wide'
  when 'selected_departments' then 'cross_department'
  when 'all' then 'full'
  when 'team' then 'department_wide'
  when 'own' then 'department_wide'
  else scope
end;

alter table public.permission_overrides
  add constraint permission_overrides_scope_check
  check (scope in ('department_wide', 'cross_department', 'full'));

-- ---------------------------------------------------------------------------
-- 3. Drop the visibility columns added by 095
-- ---------------------------------------------------------------------------

alter table public.access_profiles
  drop constraint if exists access_profiles_visibility_scope_check;

alter table public.access_profiles
  drop column if exists visibility_scope,
  drop column if exists visibility_departments;

-- ---------------------------------------------------------------------------
-- 4. Drop the helper functions introduced by 095
-- ---------------------------------------------------------------------------

drop function if exists public.current_user_can_manage_teams() cascade;
drop function if exists public.current_user_can_manage_access_profiles() cascade;
drop function if exists public.current_user_can_manage_admin_users() cascade;
drop function if exists public.current_user_has_module_permission(text, text) cascade;
drop function if exists public.current_user_effective_module_grant(text) cascade;

-- ---------------------------------------------------------------------------
-- 5. Restore pre-095 policies
-- ---------------------------------------------------------------------------

-- access_profiles (mirrors migration 094)
create policy "access_profiles_select"
  on public.access_profiles
  for select
  to authenticated
  using (
    public.is_executive()
    or exists (
      select 1
      from public.users u
      left join public.permission_overrides po on po.user_id = u.id
      where u.auth_id = auth.uid()
        and (
          (po.module_grants ->> 'exec_users:view')              = 'true'
          or (po.module_grants ->> 'exec_users:create')         = 'true'
          or (po.module_grants ->> 'exec_users:edit')           = 'true'
          or (po.module_grants ->> 'admin_users_tab:view')      = 'true'
          or (po.module_grants ->> 'admin_users_tab:create')    = 'true'
          or (po.module_grants ->> 'admin_users_tab:edit')      = 'true'
          or (po.module_grants ->> 'admin_access_profiles_tab:view') = 'true'
        )
    )
  );

create policy "access_profiles_manage"
  on public.access_profiles
  for all
  to authenticated
  using (public.is_executive())
  with check (public.is_executive());

-- permission_overrides (mirrors migration 019)
create policy "overrides_select"
  on public.permission_overrides
  for select
  to authenticated
  using (
    user_id = public.get_my_profile_id()
    or public.is_executive()
  );

create policy "overrides_manage"
  on public.permission_overrides
  for all
  to authenticated
  using (public.is_executive())
  with check (public.is_executive());

-- teams (mirrors migration 019)
create policy "teams_manage"
  on public.teams
  for all
  to authenticated
  using (public.is_executive())
  with check (public.is_executive());

-- ---------------------------------------------------------------------------
-- 6. Restore Profiling write policies (mirrors migrations 061, 062, 090)
--    For tables that originally had three write policies (write_exec / write_manager / update_manager),
--    restore all three. For tables with single write_exec only, restore that.
-- ---------------------------------------------------------------------------

-- Tables with write_exec + write_manager + update_manager
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trade_parties','profile_locations','dispatch_people','vehicles','service_providers'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_executive()) with check (public.is_executive())',
      table_name || '_write_exec', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_manager_or_above())',
      case when table_name = 'service_providers' then 'service_providers_write_mgr' else table_name || '_write_manager' end,
      table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_manager_or_above()) with check (public.is_manager_or_above())',
      case when table_name = 'service_providers' then 'service_providers_update_mgr' else table_name || '_update_manager' end,
      table_name);
  end loop;
end $$;

-- Executive-only write tables
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profile_countries','profile_modes','profile_movements','profile_incoterms','profile_cargo_types',
    'profile_cargo_natures','profile_brokerage_types','profile_customs_entries','profile_customs_entry_procedures',
    'profile_truck_types','profile_selectivity_colors','profile_examinations','profile_container_types',
    'profile_package_types','profile_preferential_treatments','profile_credit_terms','profile_cpe_codes',
    'profile_service_statuses','profile_industries','profile_lead_sources','profile_carriers','profile_forwarders'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_executive()) with check (public.is_executive())',
      table_name || '_write_exec', table_name);
  end loop;
end $$;
