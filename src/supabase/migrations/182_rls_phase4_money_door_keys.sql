-- NEU-020 Phase 4 (part 1) — RLS reconciliation for the money tables.
--
-- The UI now gates money writes on per-DOOR keys (ops_<svc>_billings_tab,
-- bd/pricing/acct_projects_*, *_contracts_*, etc.). RLS still only ORs the
-- legacy/umbrella keys, so a future grant of a door key ALONE shows in the UI
-- but is denied at the DB. This teaches RLS the full door-key set per money
-- family, via helper functions (set defined in one place).
--
-- ADDITIVE / SUPERSET: each function includes every key the original policy
-- checked PLUS the door keys — so this can only broaden access, never deny.
-- Zero day-one regression (door-holders were already seeded from the legacy
-- keys). Legacy-key RETIREMENT (removing acct_financials et al. from RLS) is a
-- later step, after a soak confirms nobody relies on legacy-only grants.

-- ── Family helper functions ────────────────────────────────────────────────
create or replace function public.current_user_can_billings(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('acct_financials', p_action)
      or current_user_has_module_permission('acct_billings', p_action)
      or current_user_has_module_permission('acct_bookings', p_action)
      or current_user_has_module_permission('accounting_financials_billings_tab', p_action)
      or current_user_has_module_permission('accounting_customer_ledger_billings_tab', p_action)
      or current_user_has_module_permission('ops_bookings_billings_tab', p_action)
      or current_user_has_module_permission('ops_projects_billings_tab', p_action)
      or current_user_has_module_permission('ops_forwarding_billings_tab', p_action)
      or current_user_has_module_permission('ops_brokerage_billings_tab', p_action)
      or current_user_has_module_permission('ops_trucking_billings_tab', p_action)
      or current_user_has_module_permission('ops_marine_insurance_billings_tab', p_action)
      or current_user_has_module_permission('ops_others_billings_tab', p_action)
      or current_user_has_module_permission('pricing_others_billings_tab', p_action)
      or current_user_has_module_permission('bd_projects_billings_tab', p_action)
      or current_user_has_module_permission('pricing_projects_billings_tab', p_action)
      or current_user_has_module_permission('acct_projects_billings_tab', p_action)
      or current_user_has_module_permission('bd_contracts_billings_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_billings_tab', p_action)
      or current_user_has_module_permission('acct_contracts_billings_tab', p_action);
$$;

create or replace function public.current_user_can_collections(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('acct_financials', p_action)
      or current_user_has_module_permission('acct_collections', p_action)
      or current_user_has_module_permission('accounting_financials_collections_tab', p_action)
      or current_user_has_module_permission('accounting_bookings_collections_tab', p_action)
      or current_user_has_module_permission('accounting_customer_ledger_collections_tab', p_action)
      or current_user_has_module_permission('ops_bookings_collections_tab', p_action)
      or current_user_has_module_permission('ops_projects_collections_tab', p_action)
      or current_user_has_module_permission('ops_forwarding_collections_tab', p_action)
      or current_user_has_module_permission('ops_brokerage_collections_tab', p_action)
      or current_user_has_module_permission('ops_trucking_collections_tab', p_action)
      or current_user_has_module_permission('ops_marine_insurance_collections_tab', p_action)
      or current_user_has_module_permission('ops_others_collections_tab', p_action)
      or current_user_has_module_permission('pricing_others_collections_tab', p_action)
      or current_user_has_module_permission('bd_projects_collections_tab', p_action)
      or current_user_has_module_permission('pricing_projects_collections_tab', p_action)
      or current_user_has_module_permission('acct_projects_collections_tab', p_action)
      or current_user_has_module_permission('bd_contracts_collections_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_collections_tab', p_action)
      or current_user_has_module_permission('acct_contracts_collections_tab', p_action);
$$;

create or replace function public.current_user_can_invoices(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('acct_financials', p_action)
      or current_user_has_module_permission('accounting_financials_invoices_tab', p_action)
      or current_user_has_module_permission('accounting_bookings_invoices_tab', p_action)
      or current_user_has_module_permission('ops_bookings_invoices_tab', p_action)
      or current_user_has_module_permission('ops_projects_invoices_tab', p_action)
      or current_user_has_module_permission('ops_forwarding_invoices_tab', p_action)
      or current_user_has_module_permission('ops_brokerage_invoices_tab', p_action)
      or current_user_has_module_permission('ops_trucking_invoices_tab', p_action)
      or current_user_has_module_permission('ops_marine_insurance_invoices_tab', p_action)
      or current_user_has_module_permission('ops_others_invoices_tab', p_action)
      or current_user_has_module_permission('pricing_others_invoices_tab', p_action)
      or current_user_has_module_permission('bd_projects_invoices_tab', p_action)
      or current_user_has_module_permission('pricing_projects_invoices_tab', p_action)
      or current_user_has_module_permission('acct_projects_invoices_tab', p_action)
      or current_user_has_module_permission('bd_contracts_invoices_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_invoices_tab', p_action)
      or current_user_has_module_permission('acct_contracts_invoices_tab', p_action);
$$;

create or replace function public.current_user_can_expenses(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('acct_financials', p_action)
      or current_user_has_module_permission('acct_expenses', p_action)
      or current_user_has_module_permission('accounting_financials_expenses_tab', p_action)
      or current_user_has_module_permission('accounting_customer_ledger_expenses_tab', p_action)
      or current_user_has_module_permission('ops_bookings_expenses_tab', p_action)
      or current_user_has_module_permission('ops_projects_expenses_tab', p_action)
      or current_user_has_module_permission('ops_forwarding_expenses_tab', p_action)
      or current_user_has_module_permission('ops_brokerage_expenses_tab', p_action)
      or current_user_has_module_permission('ops_trucking_expenses_tab', p_action)
      or current_user_has_module_permission('ops_marine_insurance_expenses_tab', p_action)
      or current_user_has_module_permission('ops_others_expenses_tab', p_action)
      or current_user_has_module_permission('pricing_others_expenses_tab', p_action)
      or current_user_has_module_permission('bd_projects_expenses_tab', p_action)
      or current_user_has_module_permission('pricing_projects_expenses_tab', p_action)
      or current_user_has_module_permission('acct_projects_expenses_tab', p_action)
      or current_user_has_module_permission('bd_contracts_expenses_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_expenses_tab', p_action)
      or current_user_has_module_permission('acct_contracts_expenses_tab', p_action);
$$;

-- ── Repoint policies (ALTER preserves roles/permissive; only the expr changes) ──
-- billing_line_items (view-record owner is NULL by design)
alter policy billing_line_items_select on public.billing_line_items
  using (current_user_can_billings('view') and current_user_can_view_record('billings', null::text));
alter policy billing_line_items_insert on public.billing_line_items
  with check (current_user_can_billings('create'));
alter policy billing_line_items_update on public.billing_line_items
  using (current_user_can_billings('edit') and current_user_can_view_record('billings', null::text))
  with check (current_user_can_billings('edit'));
alter policy billing_line_items_delete on public.billing_line_items
  using (current_user_can_billings('delete') and current_user_can_view_record('billings', null::text));

-- collections
alter policy collections_select on public.collections
  using (current_user_can_collections('view') and current_user_can_view_record('collections', created_by));
alter policy collections_insert on public.collections
  with check (current_user_can_collections('create'));
alter policy collections_update on public.collections
  using (current_user_can_collections('edit') and current_user_can_view_record('collections', created_by))
  with check (current_user_can_collections('edit'));
alter policy collections_delete on public.collections
  using (current_user_can_collections('delete') and current_user_can_view_record('collections', created_by));

-- invoices
alter policy invoices_select on public.invoices
  using (current_user_can_invoices('view') and current_user_can_view_record('invoices', created_by));
alter policy invoices_insert on public.invoices
  with check (current_user_can_invoices('create'));
alter policy invoices_update on public.invoices
  using (current_user_can_invoices('edit') and current_user_can_view_record('invoices', created_by))
  with check (current_user_can_invoices('edit'));
alter policy invoices_delete on public.invoices
  using (current_user_can_invoices('delete') and current_user_can_view_record('invoices', created_by));

-- expenses
alter policy expenses_select on public.expenses
  using (current_user_can_expenses('view') and current_user_can_view_record('expenses', created_by));
alter policy expenses_insert on public.expenses
  with check (current_user_can_expenses('create'));
alter policy expenses_update on public.expenses
  using (current_user_can_expenses('edit') and current_user_can_view_record('expenses', created_by))
  with check (current_user_can_expenses('edit'));
alter policy expenses_delete on public.expenses
  using (current_user_can_expenses('delete') and current_user_can_view_record('expenses', created_by));
