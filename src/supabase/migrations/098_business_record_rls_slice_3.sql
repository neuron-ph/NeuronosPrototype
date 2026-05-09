-- 098_business_record_rls_slice_3.sql
-- Source-of-truth RLS for slice 3: approvals + finance.
-- Tables: evouchers, evoucher_line_items, billing_line_items, invoices,
--         collections, expenses.
-- Policy shape: grant-only checks (these tables are not strongly
-- ownership-scoped — finance/accounting documents are typically broadly
-- readable within the company once you have the right grant).
-- evouchers (and evoucher_line_items) keep an "own" carve-out via
-- my_evouchers grants for the document creator.

-- ---------------------------------------------------------------------------
-- 1. evouchers
-- ---------------------------------------------------------------------------

drop policy if exists "evouchers_select" on public.evouchers;
drop policy if exists "evouchers_insert" on public.evouchers;
drop policy if exists "evouchers_update" on public.evouchers;
drop policy if exists "evouchers_delete" on public.evouchers;

create policy "evouchers_select" on public.evouchers for select to authenticated
using (
  public.current_user_has_module_permission('acct_evouchers','view')
  or (created_by = public.get_my_profile_id()
      and public.current_user_has_module_permission('my_evouchers','view'))
  or (transaction_type = 'budget_request'
      and public.current_user_has_module_permission('bd_budget_requests','view'))
);

create policy "evouchers_insert" on public.evouchers for insert to authenticated
with check (
  public.current_user_has_module_permission('acct_evouchers','create')
  or public.current_user_has_module_permission('my_evouchers','create')
  or public.current_user_has_module_permission('bd_budget_requests','create')
);

create policy "evouchers_update" on public.evouchers for update to authenticated
using (
  public.current_user_has_module_permission('acct_evouchers','edit')
  or public.current_user_has_module_permission('acct_evouchers','approve')
  or (created_by = public.get_my_profile_id()
      and public.current_user_has_module_permission('my_evouchers','edit'))
  or (transaction_type = 'budget_request'
      and (public.current_user_has_module_permission('bd_budget_requests','edit')
           or public.current_user_has_module_permission('bd_budget_requests','approve')))
)
with check (
  public.current_user_has_module_permission('acct_evouchers','edit')
  or public.current_user_has_module_permission('acct_evouchers','approve')
  or (created_by = public.get_my_profile_id()
      and public.current_user_has_module_permission('my_evouchers','edit'))
  or (transaction_type = 'budget_request'
      and (public.current_user_has_module_permission('bd_budget_requests','edit')
           or public.current_user_has_module_permission('bd_budget_requests','approve')))
);

create policy "evouchers_delete" on public.evouchers for delete to authenticated
using (
  public.current_user_has_module_permission('acct_evouchers','delete')
  or (created_by = public.get_my_profile_id()
      and public.current_user_has_module_permission('my_evouchers','delete'))
);

-- ---------------------------------------------------------------------------
-- 2. evoucher_line_items — cascade off parent evoucher access
-- ---------------------------------------------------------------------------

drop policy if exists "evoucher_line_items_select" on public.evoucher_line_items;
drop policy if exists "evoucher_line_items_insert" on public.evoucher_line_items;
drop policy if exists "evoucher_line_items_update" on public.evoucher_line_items;
drop policy if exists "evoucher_line_items_delete" on public.evoucher_line_items;

create policy "evoucher_line_items_select" on public.evoucher_line_items for select to authenticated
using (
  exists (
    select 1 from public.evouchers ev where ev.id = evoucher_line_items.evoucher_id
  )
);

create policy "evoucher_line_items_insert" on public.evoucher_line_items for insert to authenticated
with check (
  exists (
    select 1 from public.evouchers ev where ev.id = evoucher_line_items.evoucher_id
  )
);

create policy "evoucher_line_items_update" on public.evoucher_line_items for update to authenticated
using (
  exists (
    select 1 from public.evouchers ev where ev.id = evoucher_line_items.evoucher_id
  )
)
with check (
  exists (
    select 1 from public.evouchers ev where ev.id = evoucher_line_items.evoucher_id
  )
);

create policy "evoucher_line_items_delete" on public.evoucher_line_items for delete to authenticated
using (
  exists (
    select 1 from public.evouchers ev where ev.id = evoucher_line_items.evoucher_id
  )
);

-- ---------------------------------------------------------------------------
-- 3. billing_line_items
-- ---------------------------------------------------------------------------

drop policy if exists "billing_line_items_select" on public.billing_line_items;
drop policy if exists "billing_line_items_insert" on public.billing_line_items;
drop policy if exists "billing_line_items_update" on public.billing_line_items;
drop policy if exists "billing_line_items_delete" on public.billing_line_items;

create policy "billing_line_items_select" on public.billing_line_items for select to authenticated
using (
  public.current_user_has_module_permission('acct_financials','view')
  or public.current_user_has_module_permission('accounting_financials_billings_tab','view')
  or public.current_user_has_module_permission('acct_billings','view')
  or public.current_user_has_module_permission('acct_bookings','view')
  or public.current_user_has_module_permission('ops_bookings_billings_tab','view')
  or public.current_user_has_module_permission('ops_projects_billings_tab','view')
  or public.current_user_has_module_permission('pricing_contracts_billings_tab','view')
);

create policy "billing_line_items_insert" on public.billing_line_items for insert to authenticated
with check (
  public.current_user_has_module_permission('acct_financials','create')
  or public.current_user_has_module_permission('accounting_financials_billings_tab','create')
  or public.current_user_has_module_permission('acct_billings','create')
  or public.current_user_has_module_permission('ops_bookings_billings_tab','create')
  or public.current_user_has_module_permission('ops_projects_billings_tab','create')
);

create policy "billing_line_items_update" on public.billing_line_items for update to authenticated
using (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('accounting_financials_billings_tab','edit')
  or public.current_user_has_module_permission('acct_billings','edit')
  or public.current_user_has_module_permission('ops_bookings_billings_tab','edit')
  or public.current_user_has_module_permission('ops_projects_billings_tab','edit')
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('accounting_financials_billings_tab','edit')
  or public.current_user_has_module_permission('acct_billings','edit')
  or public.current_user_has_module_permission('ops_bookings_billings_tab','edit')
  or public.current_user_has_module_permission('ops_projects_billings_tab','edit')
);

create policy "billing_line_items_delete" on public.billing_line_items for delete to authenticated
using (
  public.current_user_has_module_permission('acct_financials','delete')
  or public.current_user_has_module_permission('accounting_financials_billings_tab','delete')
  or public.current_user_has_module_permission('acct_billings','delete')
  or public.current_user_has_module_permission('ops_bookings_billings_tab','delete')
  or public.current_user_has_module_permission('ops_projects_billings_tab','delete')
);

-- ---------------------------------------------------------------------------
-- 4. invoices
-- ---------------------------------------------------------------------------

drop policy if exists "invoices_select" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;

create policy "invoices_select" on public.invoices for select to authenticated
using (
  public.current_user_has_module_permission('acct_financials','view')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','view')
);

create policy "invoices_insert" on public.invoices for insert to authenticated
with check (
  public.current_user_has_module_permission('acct_financials','create')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','create')
);

create policy "invoices_update" on public.invoices for update to authenticated
using (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','edit')
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','edit')
);

create policy "invoices_delete" on public.invoices for delete to authenticated
using (
  public.current_user_has_module_permission('acct_financials','delete')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','delete')
);

-- ---------------------------------------------------------------------------
-- 5. collections
-- ---------------------------------------------------------------------------

drop policy if exists "collections_select" on public.collections;
drop policy if exists "collections_insert" on public.collections;
drop policy if exists "collections_update" on public.collections;
drop policy if exists "collections_delete" on public.collections;

create policy "collections_select" on public.collections for select to authenticated
using (
  public.current_user_has_module_permission('acct_financials','view')
  or public.current_user_has_module_permission('accounting_financials_collections_tab','view')
  or public.current_user_has_module_permission('acct_collections','view')
);

create policy "collections_insert" on public.collections for insert to authenticated
with check (
  public.current_user_has_module_permission('acct_financials','create')
  or public.current_user_has_module_permission('acct_collections','create')
);

create policy "collections_update" on public.collections for update to authenticated
using (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_collections','edit')
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_collections','edit')
);

create policy "collections_delete" on public.collections for delete to authenticated
using (
  public.current_user_has_module_permission('acct_financials','delete')
  or public.current_user_has_module_permission('acct_collections','delete')
);

-- ---------------------------------------------------------------------------
-- 6. expenses
-- ---------------------------------------------------------------------------

drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

create policy "expenses_select" on public.expenses for select to authenticated
using (
  public.current_user_has_module_permission('acct_financials','view')
  or public.current_user_has_module_permission('accounting_financials_expenses_tab','view')
  or public.current_user_has_module_permission('acct_expenses','view')
  or public.current_user_has_module_permission('ops_bookings_expenses_tab','view')
  or public.current_user_has_module_permission('ops_projects_expenses_tab','view')
);

create policy "expenses_insert" on public.expenses for insert to authenticated
with check (
  public.current_user_has_module_permission('acct_financials','create')
  or public.current_user_has_module_permission('acct_expenses','create')
  or public.current_user_has_module_permission('ops_bookings_expenses_tab','create')
  or public.current_user_has_module_permission('ops_projects_expenses_tab','create')
);

create policy "expenses_update" on public.expenses for update to authenticated
using (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_expenses','edit')
  or public.current_user_has_module_permission('ops_bookings_expenses_tab','edit')
  or public.current_user_has_module_permission('ops_projects_expenses_tab','edit')
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_expenses','edit')
  or public.current_user_has_module_permission('ops_bookings_expenses_tab','edit')
  or public.current_user_has_module_permission('ops_projects_expenses_tab','edit')
);

create policy "expenses_delete" on public.expenses for delete to authenticated
using (
  public.current_user_has_module_permission('acct_financials','delete')
  or public.current_user_has_module_permission('acct_expenses','delete')
);
