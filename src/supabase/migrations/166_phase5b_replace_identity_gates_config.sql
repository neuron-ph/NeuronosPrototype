-- NEU-012 Phase 5b slice 2 — replace legacy identity gates on the config /
-- master-data cluster. Mapping (verified holder counts on dev):
--   profile_* (23 tables)        is_executive() ALL     -> drop (exec_profiling granted policies already exist)
--   booking_(sub)service_catalog is_executive() ALL     -> exec_profiling create/edit/delete
--   department/service_assignment_roles, operational_services, org_settings
--                                exec identity          -> exec_profiling:edit
--   team_memberships/eligibilities Exec|HR dept         -> hr:edit | exec_users:edit
--   booking_assignments          Operations|Exec dept   -> any ops_<service> create|edit | ops_projects_bookings_tab create|edit
--   assignment_profiles(+items)  all-depts write        -> same booking-assignment gate; read opened (was "not HR")
--   consignees                   dept lists             -> customers edit | booking create gates; delete = customers delete
--   contract_activity/attachments/bookings               -> inherit parent contract (quotations RLS does the work);
--                                                          contract_activity update/delete = pricing_contracts edit/delete
-- Deliberately kept (semantic, not identity-gating):
--   evouchers dept-routing clause (approver must match requestor department)
--   calendar_events team visibility (calendar is outside the dial by decision)

-- ── profile_* : drop the redundant legacy exec write policies ────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename like 'profile\_%' and policyname like '%\_write\_exec'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── booking service catalogs ─────────────────────────────────────────────────
drop policy bsc_write_exec on public.booking_service_catalog;
create policy bsc_write on public.booking_service_catalog for all to authenticated
  using (current_user_has_module_permission('exec_profiling','edit')
      or current_user_has_module_permission('exec_profiling','delete'))
  with check (current_user_has_module_permission('exec_profiling','create')
      or current_user_has_module_permission('exec_profiling','edit'));

drop policy if exists bssc_write_exec on public.booking_subservice_catalog;
create policy bssc_write on public.booking_subservice_catalog for all to authenticated
  using (current_user_has_module_permission('exec_profiling','edit')
      or current_user_has_module_permission('exec_profiling','delete'))
  with check (current_user_has_module_permission('exec_profiling','create')
      or current_user_has_module_permission('exec_profiling','edit'));

-- ── assignment / org config ──────────────────────────────────────────────────
alter policy department_assignment_roles_write on public.department_assignment_roles
  using (current_user_has_module_permission('exec_profiling','edit'))
  with check (current_user_has_module_permission('exec_profiling','edit'));
alter policy service_assignment_roles_write_exec on public.service_assignment_roles
  using (current_user_has_module_permission('exec_profiling','edit'))
  with check (current_user_has_module_permission('exec_profiling','edit'));
alter policy operational_services_write_exec on public.operational_services
  using (current_user_has_module_permission('exec_profiling','edit'))
  with check (current_user_has_module_permission('exec_profiling','edit'));
alter policy org_settings_write on public.org_settings
  using (current_user_has_module_permission('exec_profiling','edit'))
  with check (current_user_has_module_permission('exec_profiling','edit'));

alter policy team_memberships_write_admin on public.team_memberships
  using (current_user_has_module_permission('hr','edit')
      or current_user_has_module_permission('exec_users','edit'))
  with check (current_user_has_module_permission('hr','edit')
      or current_user_has_module_permission('exec_users','edit'));
alter policy team_role_eligibilities_write_admin on public.team_role_eligibilities
  using (current_user_has_module_permission('hr','edit')
      or current_user_has_module_permission('exec_users','edit'))
  with check (current_user_has_module_permission('hr','edit')
      or current_user_has_module_permission('exec_users','edit'));

-- ── booking assignments + saved defaults ─────────────────────────────────────
create or replace function public.current_user_can_write_booking_assignments() returns boolean
language sql stable security invoker set search_path to 'public' as $$
  select current_user_has_module_permission('ops_forwarding','edit')
      or current_user_has_module_permission('ops_brokerage','edit')
      or current_user_has_module_permission('ops_trucking','edit')
      or current_user_has_module_permission('ops_marine_insurance','edit')
      or current_user_has_module_permission('ops_others','edit')
      or current_user_has_module_permission('ops_forwarding','create')
      or current_user_has_module_permission('ops_brokerage','create')
      or current_user_has_module_permission('ops_trucking','create')
      or current_user_has_module_permission('ops_marine_insurance','create')
      or current_user_has_module_permission('ops_others','create')
      or current_user_has_module_permission('ops_projects_bookings_tab','create')
      or current_user_has_module_permission('ops_projects_bookings_tab','edit')
$$;

alter policy booking_assignments_write on public.booking_assignments
  using (public.current_user_can_write_booking_assignments())
  with check (public.current_user_can_write_booking_assignments());
alter policy assignment_profiles_write on public.assignment_profiles
  using (public.current_user_can_write_booking_assignments())
  with check (public.current_user_can_write_booking_assignments());
alter policy assignment_profile_items_write on public.assignment_profile_items
  using (public.current_user_can_write_booking_assignments())
  with check (public.current_user_can_write_booking_assignments());
-- reads were "department <> 'HR'" — open them (config metadata, read-only)
alter policy assignment_profiles_select on public.assignment_profiles using (true);
alter policy assignment_profile_items_select on public.assignment_profile_items using (true);

-- ── consignees (master data written from CRM + booking creation) ─────────────
alter policy consignees_select on public.consignees using (true);
alter policy consignees_insert on public.consignees
  with check (current_user_has_module_permission('bd_customers','edit')
      or current_user_has_module_permission('bd_customers','create')
      or current_user_has_module_permission('pricing_customers','edit')
      or current_user_has_module_permission('pricing_customers','create')
      or public.current_user_can_write_booking_assignments());
alter policy consignees_update on public.consignees
  using (current_user_has_module_permission('bd_customers','edit')
      or current_user_has_module_permission('pricing_customers','edit')
      or public.current_user_can_write_booking_assignments())
  with check (current_user_has_module_permission('bd_customers','edit')
      or current_user_has_module_permission('pricing_customers','edit')
      or public.current_user_can_write_booking_assignments());
alter policy consignees_delete on public.consignees
  using (current_user_has_module_permission('bd_customers','delete')
      or current_user_has_module_permission('pricing_customers','delete'));

-- ── contract sub-records: inherit the parent contract (quotations RLS) ──────
alter policy contract_activity_insert on public.contract_activity
  with check (exists (select 1 from public.quotations q where q.id = contract_activity.contract_id));
alter policy contract_activity_update on public.contract_activity
  using (current_user_has_module_permission('pricing_contracts','edit')
      or current_user_has_module_permission('bd_contracts','edit'))
  with check (current_user_has_module_permission('pricing_contracts','edit')
      or current_user_has_module_permission('bd_contracts','edit'));
alter policy contract_activity_delete on public.contract_activity
  using (current_user_has_module_permission('pricing_contracts','delete'));

alter policy contract_attachments_insert on public.contract_attachments
  with check (exists (select 1 from public.quotations q where q.id = contract_attachments.contract_id));
alter policy contract_attachments_update on public.contract_attachments
  using (exists (select 1 from public.quotations q where q.id = contract_attachments.contract_id))
  with check (exists (select 1 from public.quotations q where q.id = contract_attachments.contract_id));
alter policy contract_attachments_delete on public.contract_attachments
  using (exists (select 1 from public.quotations q where q.id = contract_attachments.contract_id));

alter policy contract_bookings_insert on public.contract_bookings
  with check (exists (select 1 from public.quotations q where q.id = contract_bookings.contract_id));
alter policy contract_bookings_update on public.contract_bookings
  using (exists (select 1 from public.quotations q where q.id = contract_bookings.contract_id))
  with check (exists (select 1 from public.quotations q where q.id = contract_bookings.contract_id));
alter policy contract_bookings_delete on public.contract_bookings
  using (exists (select 1 from public.quotations q where q.id = contract_bookings.contract_id));
