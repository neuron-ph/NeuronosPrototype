-- 217_record_reads_drop_module_gate.sql
--
-- Decouple RECORD READS from MODULE ownership.
--
-- Before this migration, reading a row required passing TWO chained locks:
--   1. module lock  — do you hold the <module>:view grant that houses this type?
--   2. visibility   — current_user_can_view_record_v2 (the per-type "dial":
--                     org_wide / department / team / own, plus confidential)
-- They were ANDed, so a booking-maker who legitimately reaches projects/
-- contracts/customers org-wide (dial = org_wide) was still blocked because she
-- doesn't own the Projects/Contracts module. That broke the booking-creation
-- container picker ("No active projects or contracts found").
--
-- Doctrine going forward:
--   * MODULE grant  -> controls PAGE/nav visibility ONLY. Already enforced in
--     the frontend (RouteGuard checks the grant directly, independent of RLS),
--     so dropping the module lock from row reads does NOT expose any page.
--   * VISIBILITY dial -> the SOLE lock on reading a row. Confidential rows and
--     down-dialed types (department/team/own) stay protected exactly as before.
--
-- Scope: SELECT (read) policies ONLY. UPDATE/DELETE stay module-gated — being
-- able to LINK a record must not let you EDIT or DELETE it.
--
-- Net effect: every policy below only RELAXES (removes a lock); none removes
-- access. The quotations escape-hatch branches are preserved verbatim.

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
for select to authenticated
using (
  current_user_can_view_record_v2('projects', id, created_by, confidential)
);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
for select to authenticated
using (
  current_user_can_view_record_v2('customers', id, created_by, confidential)
);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
for select to authenticated
using (
  current_user_can_view_record_v2('contacts', id, created_by, confidential)
);

-- ---------------------------------------------------------------------------
-- quotations (quotations + contracts share this table via quotation_type)
-- Remove ONLY the module predicate from the primary branch; keep the
-- booking/project escape-hatch OR-branch unchanged so nobody loses access.
-- ---------------------------------------------------------------------------
drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations
for select to authenticated
using (
  current_user_can_view_record_v2(
    case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
    id, coalesce(prepared_by, created_by), confidential
  )
  or (
    quotation_type = 'contract'
    and confidential = false
    and (
      exists (
        select 1 from bookings b
        where b.contract_id = quotations.id
          and (current_user_can_act_on_booking('view') or current_user_has_module_permission('acct_bookings', 'view'))
          and current_user_can_view_booking(
            ('bookings_' || replace(lower(coalesce(b.service_type, 'others')), ' ', '_')),
            b.created_by, b.manager_id, b.supervisor_id, b.handler_id, b.id, b.confidential)
      )
      or exists (
        select 1 from projects pr
        where pr.quotation_id = quotations.id
          and (current_user_has_module_permission('bd_projects', 'view')
               or current_user_has_module_permission('pricing_projects', 'view')
               or current_user_has_module_permission('ops_projects', 'view')
               or current_user_has_module_permission('acct_projects', 'view'))
          and current_user_can_view_booking('projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)
      )
    )
  )
);
