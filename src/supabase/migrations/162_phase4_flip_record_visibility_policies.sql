-- NEU-012 Phase 4 — bring the remaining owned-record tables under the dial model.
-- Replaces wide-open / RLS-off visibility with (feature-access AND dial). Writes
-- are tied to visibility on the blanket-policy tables; service_role bypasses and
-- existing write gates are preserved. Special cases: tickets keep participant
-- access; liquidations keep the evoucher-link + Accounting access.

-- ── PROJECTS (assignment-aware, like bookings) ──────────────────────────────
drop policy if exists "Authenticated full access" on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view') or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_booking('projects', created_by, manager_id, supervisor_id, handler_id));
create policy projects_insert on public.projects for insert to authenticated with check (true);
create policy projects_update on public.projects for update to authenticated using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view') or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_booking('projects', created_by, manager_id, supervisor_id, handler_id)) with check (true);
create policy projects_delete on public.projects for delete to authenticated using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view') or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_booking('projects', created_by, manager_id, supervisor_id, handler_id));

-- ── PROJECT_BOOKINGS (inherits the parent project's visibility) ─────────────
drop policy if exists "Authenticated full access" on public.project_bookings;
create policy project_bookings_select on public.project_bookings for select to authenticated using (
  exists (select 1 from public.projects pr where pr.id = project_bookings.project_id
    and (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view') or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
    and current_user_can_view_booking('projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)));
create policy project_bookings_insert on public.project_bookings for insert to authenticated with check (true);
create policy project_bookings_update on public.project_bookings for update to authenticated using (
  exists (select 1 from public.projects pr where pr.id = project_bookings.project_id
    and current_user_can_view_booking('projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id))) with check (true);
create policy project_bookings_delete on public.project_bookings for delete to authenticated using (
  exists (select 1 from public.projects pr where pr.id = project_bookings.project_id
    and current_user_can_view_booking('projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)));

-- ── TRANSACTIONS ────────────────────────────────────────────────────────────
drop policy if exists "Authenticated full access" on public.transactions;
create policy transactions_select on public.transactions for select to authenticated using (
  (current_user_has_module_permission('acct_financials','view') or current_user_has_module_permission('acct_journal','view'))
  and current_user_can_view_record('transactions', created_by));
create policy transactions_insert on public.transactions for insert to authenticated with check (true);
create policy transactions_update on public.transactions for update to authenticated using (
  (current_user_has_module_permission('acct_financials','view') or current_user_has_module_permission('acct_journal','view'))
  and current_user_can_view_record('transactions', created_by)) with check (true);
create policy transactions_delete on public.transactions for delete to authenticated using (
  (current_user_has_module_permission('acct_financials','view') or current_user_has_module_permission('acct_journal','view'))
  and current_user_can_view_record('transactions', created_by));

-- ── JOURNAL_ENTRIES ─────────────────────────────────────────────────────────
drop policy if exists "Authenticated full access" on public.journal_entries;
create policy journal_entries_select on public.journal_entries for select to authenticated using (
  (current_user_has_module_permission('acct_journal','view') or current_user_has_module_permission('acct_financials','view'))
  and current_user_can_view_record('journal_entries', created_by));
create policy journal_entries_insert on public.journal_entries for insert to authenticated with check (true);
create policy journal_entries_update on public.journal_entries for update to authenticated using (
  (current_user_has_module_permission('acct_journal','view') or current_user_has_module_permission('acct_financials','view'))
  and current_user_can_view_record('journal_entries', created_by)) with check (true);
create policy journal_entries_delete on public.journal_entries for delete to authenticated using (
  (current_user_has_module_permission('acct_journal','view') or current_user_has_module_permission('acct_financials','view'))
  and current_user_can_view_record('journal_entries', created_by));

-- ── BUDGET_REQUESTS (only fix SELECT visibility; keep write gates) ──────────
alter policy budget_requests_select on public.budget_requests using (
  current_user_has_module_permission('bd_budget_requests','view')
  and current_user_can_view_record('budget_requests', requested_by));

-- ── CRM_ACTIVITIES (Activities) ─────────────────────────────────────────────
alter policy crm_activities_select on public.crm_activities using (
  current_user_has_module_permission('bd_activities','view')
  and current_user_can_view_record('activities', user_id));

-- ── TICKETS (dial on creator OR you're a participant) ───────────────────────
alter policy tickets_select on public.tickets using (
  current_user_can_view_record('tickets', created_by)
  or exists (select 1 from public.ticket_participants tp where tp.ticket_id = tickets.id and tp.participant_user_id = get_my_profile_id()));

-- ── FINANCIAL_STATEMENT_FILINGS ─────────────────────────────────────────────
drop policy if exists filings_write on public.financial_statement_filings;
alter policy filings_read on public.financial_statement_filings using (
  current_user_has_module_permission('acct_statements','view')
  and current_user_can_view_record('financial_filings', prepared_by));
create policy filings_insert on public.financial_statement_filings for insert to authenticated with check (true);
create policy filings_update on public.financial_statement_filings for update to authenticated using (
  current_user_has_module_permission('acct_statements','view')
  and current_user_can_view_record('financial_filings', prepared_by)) with check (true);
create policy filings_delete on public.financial_statement_filings for delete to authenticated using (
  current_user_has_module_permission('acct_statements','view')
  and current_user_can_view_record('financial_filings', prepared_by));

-- ── LIQUIDATION_SUBMISSIONS (add dial; keep evoucher-link + Accounting) ─────
alter policy liquidation_submissions_select on public.liquidation_submissions using (
  current_user_can_view_record('liquidations', submitted_by)
  or ((auth.uid())::text in (select e.created_by from public.evouchers e where e.id = liquidation_submissions.evoucher_id))
  or exists (select 1 from public.users u where u.id = (auth.uid())::text and u.department = any(array['Accounting','Executive'])));

-- ── MEMOS (RLS was OFF) ─────────────────────────────────────────────────────
alter table public.memos enable row level security;
create policy memos_select on public.memos for select to authenticated using (
  current_user_has_module_permission('exec_memos','view')
  and current_user_can_view_record('memos', created_by));
create policy memos_insert on public.memos for insert to authenticated with check (true);
create policy memos_update on public.memos for update to authenticated using (
  current_user_has_module_permission('exec_memos','view')
  and current_user_can_view_record('memos', created_by)) with check (true);
create policy memos_delete on public.memos for delete to authenticated using (
  current_user_has_module_permission('exec_memos','view')
  and current_user_can_view_record('memos', created_by));
