-- 228_decouple_all_record_reads_from_module_gate.sql
--
-- Completes the migration-217 doctrine for EVERY remaining record type:
--   MODULE grant   -> PAGE / nav access ONLY (enforced in the frontend RouteGuard).
--   VISIBILITY dial -> the SOLE lock on reading a row.
--
-- 217 decoupled contacts/customers/quotations/projects/contracts. This drops the
-- module-gate AND-branch from the rest of the SELECT policies so the dial alone
-- governs reads. Records are cross-module (a booking's money shows in Accounting
-- AND Operations; a journal entry spans both), so a row read must not hinge on
-- one module's grant.
--
-- Scope: SELECT only. INSERT / UPDATE / DELETE stay module-gated — being able to
-- READ a row must not let you write it. Confidential and down-dialed
-- (own/team/department) reads stay enforced by the dial resolvers, which default
-- to 'own' (fail-closed). Additive workflow branches (the e-voucher approver
-- path) are preserved verbatim — they grant extra access, they never restrict.
--
-- activity_log is intentionally untouched: it is the executive audit log, not a
-- cross-module business record with a dial.
--
-- PRE-STEP (atomic with the policy changes below — no leak window): tighten stale
-- financial dials. Many non-accounting users carry org_wide/everything dials on
-- financial types, set in the old "make everything cross-departmental" era when
-- the MODULE grant was still the real gate (migration 215). Removing that gate
-- would make those dials live and expose financials. Downgrade them to 'own'
-- BEFORE dropping the gate. Accounting + executives are left untouched.

do $$
declare fin text[] := array['invoices','collections','billings','expenses','transactions','journal_entries','evouchers','financial_filings','liquidations'];
begin
  update public.permission_overrides po
  set visibility_scopes = po.visibility_scopes || coalesce(
        (select jsonb_object_agg(k,'"own"'::jsonb) from unnest(fin) k
         where po.visibility_scopes->>k in ('org_wide','everything')),'{}'::jsonb)
  from public.users u
  where u.id = po.user_id and u.is_active
    and u.department not in ('Accounting','Executive')
    and exists (select 1 from unnest(fin) k where po.visibility_scopes->>k in ('org_wide','everything'));

  update public.access_profiles ap
  set visibility_scopes = ap.visibility_scopes || coalesce(
        (select jsonb_object_agg(k,'"own"'::jsonb) from unnest(fin) k
         where ap.visibility_scopes->>k in ('org_wide','everything')),'{}'::jsonb)
  where coalesce(ap.target_department,'') <> 'Accounting'
    and coalesce(ap.target_role,'') <> 'executive'
    and exists (select 1 from unnest(fin) k where ap.visibility_scopes->>k in ('org_wide','everything'));
end $$;

-- ── bookings: dial-only ──────────────────────────────────────────────────────
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
for select to authenticated using (
  current_user_can_view_booking(
    ('bookings_' || replace(lower(coalesce(service_type, 'others')), ' ', '_')),
    created_by, manager_id, supervisor_id, handler_id, id, confidential)
);

-- ── money tables: dial-only ──────────────────────────────────────────────────
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
for select to authenticated using (
  current_user_can_view_record('invoices', created_by)
);

drop policy if exists collections_select on public.collections;
create policy collections_select on public.collections
for select to authenticated using (
  current_user_can_view_record('collections', created_by)
);

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
for select to authenticated using (
  current_user_can_view_record('expenses', created_by)
);

-- billing_line_items carry no per-row owner; the 'billings' dial governs them
-- (org_wide/everything see all, otherwise none) — same as before, minus the gate.
drop policy if exists billing_line_items_select on public.billing_line_items;
create policy billing_line_items_select on public.billing_line_items
for select to authenticated using (
  current_user_can_view_record('billings', null)
);

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
for select to authenticated using (
  current_user_can_view_record('transactions', created_by)
);

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
for select to authenticated using (
  current_user_can_view_record('journal_entries', created_by)
);

drop policy if exists filings_read on public.financial_statement_filings;
create policy filings_read on public.financial_statement_filings
for select to authenticated using (
  current_user_can_view_record('financial_filings', prepared_by)
);

-- ── e-vouchers: dial-only read, PLUS the additive department-approver branch ──
drop policy if exists evouchers_select on public.evouchers;
create policy evouchers_select on public.evouchers
for select to authenticated using (
  current_user_can_view_record('evouchers', created_by)
  or (
    current_user_has_module_permission('my_evouchers', 'approve')
    and coalesce(pending_approver_department, (details ->> 'requestor_department')) = get_my_department()
  )
);

-- ── BD record types: dial-only ───────────────────────────────────────────────
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
for select to authenticated using (
  current_user_can_view_record('tasks', owner_id)
  or current_user_can_view_record('tasks', assigned_to)
);

drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select on public.crm_activities
for select to authenticated using (
  current_user_can_view_record('activities', user_id)
);

drop policy if exists budget_requests_select on public.budget_requests;
create policy budget_requests_select on public.budget_requests
for select to authenticated using (
  current_user_can_view_record('budget_requests', requested_by)
);

-- ── junction tables: gate by PARENT record visibility, not module ────────────
drop policy if exists contract_rate_versions_select on public.contract_rate_versions;
create policy contract_rate_versions_select on public.contract_rate_versions
for select to authenticated using (
  exists (
    select 1 from public.quotations q
    where q.id = contract_rate_versions.contract_id
      and current_user_can_view_record_v2(
            'contracts', q.id, coalesce(q.prepared_by, q.created_by), q.confidential)
  )
);

drop policy if exists project_bookings_select on public.project_bookings;
create policy project_bookings_select on public.project_bookings
for select to authenticated using (
  exists (
    select 1 from public.projects pr
    where pr.id = project_bookings.project_id
      and current_user_can_view_booking(
            'projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)
  )
);
