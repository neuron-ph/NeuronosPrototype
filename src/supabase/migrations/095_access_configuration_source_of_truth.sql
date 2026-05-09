-- 095_access_configuration_source_of_truth.sql
-- Make Access Configuration the canonical source of truth for access decisions
-- across access profile management and the Profiling module.

-- ---------------------------------------------------------------------------
-- 1. Canonical visibility fields and scope vocabulary
-- ---------------------------------------------------------------------------

alter table public.access_profiles
  add column if not exists visibility_scope text,
  add column if not exists visibility_departments text[];

alter table public.access_profiles
  drop constraint if exists access_profiles_visibility_scope_check;

alter table public.access_profiles
  add constraint access_profiles_visibility_scope_check
  check (
    visibility_scope is null
    or visibility_scope in ('own', 'team', 'department', 'selected_departments', 'all')
  );

alter table public.permission_overrides
  drop constraint if exists permission_overrides_scope_check;

update public.permission_overrides
set scope = case scope
  when 'department_wide' then 'department'
  when 'cross_department' then 'selected_departments'
  when 'full' then 'all'
  else scope
end;

alter table public.permission_overrides
  add constraint permission_overrides_scope_check
  check (scope in ('own', 'team', 'department', 'selected_departments', 'all'));

-- ---------------------------------------------------------------------------
-- 2. Canonical access helper functions
-- ---------------------------------------------------------------------------

create or replace function public.current_user_effective_module_grant(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_role text;
  v_department text;
  v_override_grants jsonb := '{}'::jsonb;
  v_applied_profile_id uuid;
  v_profile_grants jsonb := '{}'::jsonb;
  v_role_profile_grants jsonb := '{}'::jsonb;
begin
  select u.id, u.role, u.department
  into v_user_id, v_role, v_department
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  select
    coalesce(po.module_grants, '{}'::jsonb),
    po.applied_profile_id
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

  select coalesce(ap.module_grants, '{}'::jsonb)
  into v_role_profile_grants
  from public.access_profiles ap
  where ap.is_active = true
    and ap.target_role = v_role
    and (ap.target_department = v_department or ap.target_department is null)
  order by
    case when ap.target_department = v_department then 0 else 1 end,
    ap.updated_at desc
  limit 1;

  if v_role_profile_grants ? p_key then
    return coalesce((v_role_profile_grants ->> p_key)::boolean, false);
  end if;

  return false;
end;
$$;

create or replace function public.current_user_has_module_permission(p_module_id text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_effective_module_grant(p_module_id || ':' || p_action);
$$;

create or replace function public.current_user_can_manage_admin_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_has_module_permission('exec_users', 'view')
    or public.current_user_has_module_permission('exec_users', 'create')
    or public.current_user_has_module_permission('exec_users', 'edit')
    or public.current_user_has_module_permission('exec_users', 'delete')
    or public.current_user_has_module_permission('admin_users_tab', 'view')
    or public.current_user_has_module_permission('admin_users_tab', 'create')
    or public.current_user_has_module_permission('admin_users_tab', 'edit')
    or public.current_user_has_module_permission('admin_users_tab', 'delete');
$$;

create or replace function public.current_user_can_manage_access_profiles()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_can_manage_admin_users()
    or public.current_user_has_module_permission('admin_access_profiles_tab', 'view')
    or public.current_user_has_module_permission('admin_access_profiles_tab', 'create')
    or public.current_user_has_module_permission('admin_access_profiles_tab', 'edit')
    or public.current_user_has_module_permission('admin_access_profiles_tab', 'delete');
$$;

create or replace function public.current_user_can_manage_teams()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_can_manage_admin_users()
    or public.current_user_has_module_permission('admin_teams_tab', 'view')
    or public.current_user_has_module_permission('admin_teams_tab', 'create')
    or public.current_user_has_module_permission('admin_teams_tab', 'edit')
    or public.current_user_has_module_permission('admin_teams_tab', 'delete');
$$;

-- ---------------------------------------------------------------------------
-- 3. Access Configuration RLS
-- ---------------------------------------------------------------------------

alter table public.access_profiles enable row level security;
alter table public.permission_overrides enable row level security;
alter table public.teams enable row level security;

drop policy if exists "access_profiles_select" on public.access_profiles;
drop policy if exists "access_profiles_manage" on public.access_profiles;
create policy "access_profiles_select"
  on public.access_profiles
  for select
  to authenticated
  using (public.current_user_can_manage_access_profiles());
create policy "access_profiles_manage"
  on public.access_profiles
  for all
  to authenticated
  using (public.current_user_can_manage_access_profiles())
  with check (public.current_user_can_manage_access_profiles());

drop policy if exists "overrides_select" on public.permission_overrides;
drop policy if exists "overrides_manage" on public.permission_overrides;
create policy "overrides_select"
  on public.permission_overrides
  for select
  to authenticated
  using (
    user_id = public.get_my_profile_id()
    or public.current_user_can_manage_admin_users()
  );
create policy "overrides_manage"
  on public.permission_overrides
  for all
  to authenticated
  using (public.current_user_can_manage_admin_users())
  with check (public.current_user_can_manage_admin_users());

drop policy if exists "teams_manage" on public.teams;
create policy "teams_manage"
  on public.teams
  for all
  to authenticated
  using (public.current_user_can_manage_teams())
  with check (public.current_user_can_manage_teams());

-- ---------------------------------------------------------------------------
-- 4. Profiling writes are grant-driven, not executive-only
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trade_parties',
    'profile_locations',
    'profile_countries',
    'dispatch_people',
    'vehicles',
    'profile_modes',
    'profile_movements',
    'profile_incoterms',
    'profile_cargo_types',
    'profile_cargo_natures',
    'profile_brokerage_types',
    'profile_customs_entries',
    'profile_customs_entry_procedures',
    'profile_truck_types',
    'profile_selectivity_colors',
    'profile_examinations',
    'profile_container_types',
    'profile_package_types',
    'profile_preferential_treatments',
    'profile_credit_terms',
    'profile_cpe_codes',
    'profile_service_statuses',
    'profile_industries',
    'profile_lead_sources',
    'profile_carriers',
    'profile_forwarders',
    'service_providers'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_create_granted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_granted', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_granted', table_name);
  end loop;
end $$;

drop policy if exists "trade_parties_write_exec" on public.trade_parties;
drop policy if exists "trade_parties_write_manager" on public.trade_parties;
drop policy if exists "trade_parties_update_manager" on public.trade_parties;
drop policy if exists "profile_locations_write_exec" on public.profile_locations;
drop policy if exists "profile_locations_write_manager" on public.profile_locations;
drop policy if exists "profile_locations_update_manager" on public.profile_locations;
drop policy if exists "profile_countries_write_exec" on public.profile_countries;
drop policy if exists "dispatch_people_write_exec" on public.dispatch_people;
drop policy if exists "dispatch_people_write_manager" on public.dispatch_people;
drop policy if exists "dispatch_people_update_manager" on public.dispatch_people;
drop policy if exists "vehicles_write_exec" on public.vehicles;
drop policy if exists "vehicles_write_manager" on public.vehicles;
drop policy if exists "vehicles_update_manager" on public.vehicles;
drop policy if exists "service_providers_write_exec" on public.service_providers;
drop policy if exists "service_providers_write_mgr" on public.service_providers;
drop policy if exists "service_providers_update_mgr" on public.service_providers;
drop policy if exists "profile_carriers_write_exec" on public.profile_carriers;
drop policy if exists "profile_forwarders_write_exec" on public.profile_forwarders;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'trade_parties',
    'profile_locations',
    'profile_countries',
    'dispatch_people',
    'vehicles',
    'profile_modes',
    'profile_movements',
    'profile_incoterms',
    'profile_cargo_types',
    'profile_cargo_natures',
    'profile_brokerage_types',
    'profile_customs_entries',
    'profile_customs_entry_procedures',
    'profile_truck_types',
    'profile_selectivity_colors',
    'profile_examinations',
    'profile_container_types',
    'profile_package_types',
    'profile_preferential_treatments',
    'profile_credit_terms',
    'profile_cpe_codes',
    'profile_service_statuses',
    'profile_industries',
    'profile_lead_sources',
    'profile_carriers',
    'profile_forwarders',
    'service_providers'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_user_has_module_permission(''exec_profiling'', ''create''))',
      table_name || '_create_granted',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.current_user_has_module_permission(''exec_profiling'', ''edit'') or public.current_user_has_module_permission(''exec_profiling'', ''delete'')) with check (public.current_user_has_module_permission(''exec_profiling'', ''edit'') or public.current_user_has_module_permission(''exec_profiling'', ''delete''))',
      table_name || '_update_granted',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.current_user_has_module_permission(''exec_profiling'', ''delete''))',
      table_name || '_delete_granted',
      table_name
    );
  end loop;
end $$;
