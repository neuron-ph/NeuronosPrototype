-- NEU-012 Phase 5a — create-gate the owned-record open INSERTs (with_check was
-- `true` on all of these). Gates mirror each table's select-policy module list.
-- Breakage-checked on dev data: every gate has non-zero holders, and all
-- quotation editors (whose accept flow auto-creates a project) hold a
-- projects:create grant.
--
-- Deliberately NOT gated here:
--   tickets          — anyone may raise a ticket (by design)
--   journal_entries  — written as a side-effect by ~10 legacy flows (e-voucher
--                      disbursement, invoice/collection GL posting, FX reval);
--                      gating it correctly is part of Phase 5b's EV-workflow →
--                      grants conversion.

alter policy projects_insert on public.projects
  with check (
    current_user_has_module_permission('bd_projects','create')
    or current_user_has_module_permission('pricing_projects','create')
    or current_user_has_module_permission('ops_projects','create')
    or current_user_has_module_permission('acct_projects','create')
  );

alter policy budget_requests_insert on public.budget_requests
  with check (current_user_has_module_permission('bd_budget_requests','create'));

alter policy memos_insert on public.memos
  with check (current_user_has_module_permission('exec_memos','create'));

alter policy filings_insert on public.financial_statement_filings
  with check (current_user_has_module_permission('acct_statements','create'));

-- transactions: only written by the accounting Post-to-Ledger / Transactions panels.
alter policy transactions_insert on public.transactions
  with check (
    current_user_has_module_permission('acct_financials','create')
    or current_user_has_module_permission('acct_financials','edit')
    or current_user_has_module_permission('acct_journal','create')
    or current_user_has_module_permission('acct_journal','edit')
  );

-- project_bookings: link rows inherit the parent project — anyone who can see
-- the project (its RLS does the work) may link a booking to it.
alter policy project_bookings_insert on public.project_bookings
  with check (exists (select 1 from public.projects p where p.id = project_bookings.project_id));
