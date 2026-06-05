-- NEU-012 Contract #6 Slice 1 — Part B. Flip all record-table RLS policies onto
-- the new per-record-type dial functions. Only the USING (visibility) half changes;
-- the feature-access (Layer 1) predicates and WITH CHECK clauses are preserved
-- verbatim. Hardcoded department arrays are gone.

-- contacts (owner_id)
alter policy contacts_select on public.contacts using (
  (current_user_has_module_permission('bd_contacts','view') OR current_user_has_module_permission('pricing_contacts','view'))
  AND current_user_can_view_record('contacts', owner_id));
alter policy contacts_update on public.contacts using (
  (current_user_has_module_permission('bd_contacts','edit') OR current_user_has_module_permission('pricing_contacts','edit'))
  AND current_user_can_view_record('contacts', owner_id));
alter policy contacts_delete on public.contacts using (
  (current_user_has_module_permission('bd_contacts','delete') OR current_user_has_module_permission('pricing_contacts','delete'))
  AND current_user_can_view_record('contacts', owner_id));

-- customers (owner_id) — ops/projects branch unchanged
alter policy customers_select on public.customers using (
  ((current_user_has_module_permission('bd_customers','view') OR current_user_has_module_permission('pricing_customers','view') OR current_user_has_module_permission('acct_customers','view'))
    AND current_user_can_view_record('customers', owner_id))
  OR (current_user_has_module_permission('ops_forwarding','view') OR current_user_has_module_permission('ops_brokerage','view') OR current_user_has_module_permission('ops_trucking','view') OR current_user_has_module_permission('ops_marine_insurance','view') OR current_user_has_module_permission('ops_others','view') OR current_user_can_act_on_booking('view') OR current_user_has_module_permission('bd_projects','view') OR current_user_has_module_permission('pricing_projects','view')));
alter policy customers_update on public.customers using (
  (current_user_has_module_permission('bd_customers','edit') OR current_user_has_module_permission('pricing_customers','edit'))
  AND current_user_can_view_record('customers', owner_id));
alter policy customers_delete on public.customers using (
  (current_user_has_module_permission('bd_customers','delete') OR current_user_has_module_permission('pricing_customers','delete'))
  AND current_user_can_view_record('customers', owner_id));

-- quotations (coalesce(prepared_by, created_by)) — published-contract branch unchanged
alter policy quotations_select on public.quotations using (
  ((current_user_has_module_permission('pricing_quotations','view') OR current_user_has_module_permission('pricing_contracts','view') OR current_user_has_module_permission('bd_contracts','view') OR current_user_has_module_permission('bd_inquiries','view') OR current_user_can_act_on_booking('view') OR current_user_has_module_permission('acct_bookings','view'))
    AND current_user_can_view_record('quotations', COALESCE(prepared_by, created_by)))
  OR ((quotation_type='contract') AND (contract_status = ANY(ARRAY['Active','Expiring'])) AND (current_user_can_act_on_booking('view') OR current_user_has_module_permission('ops_brokerage','view') OR current_user_has_module_permission('ops_forwarding','view') OR current_user_has_module_permission('ops_trucking','view') OR current_user_has_module_permission('ops_marine_insurance','view') OR current_user_has_module_permission('ops_others','view') OR current_user_has_module_permission('acct_bookings','view') OR current_user_has_module_permission('pricing_contracts','view') OR current_user_has_module_permission('bd_contracts','view'))));
alter policy quotations_update on public.quotations using (
  (current_user_has_module_permission('pricing_quotations','edit') OR current_user_has_module_permission('pricing_contracts','edit'))
  AND current_user_can_view_record('quotations', COALESCE(prepared_by, created_by)));
alter policy quotations_delete on public.quotations using (
  (current_user_has_module_permission('pricing_quotations','delete') OR current_user_has_module_permission('pricing_contracts','delete'))
  AND current_user_can_view_record('quotations', COALESCE(prepared_by, created_by)));

-- tasks (owner_id OR assigned_to)
alter policy tasks_select on public.tasks using (
  current_user_has_module_permission('bd_tasks','view')
  AND (current_user_can_view_record('tasks', owner_id) OR current_user_can_view_record('tasks', assigned_to)));
alter policy tasks_update on public.tasks using (
  current_user_has_module_permission('bd_tasks','edit')
  AND (current_user_can_view_record('tasks', owner_id) OR current_user_can_view_record('tasks', assigned_to)));
alter policy tasks_delete on public.tasks using (
  current_user_has_module_permission('bd_tasks','delete')
  AND (current_user_can_view_record('tasks', owner_id) OR current_user_can_view_record('tasks', assigned_to)));

-- expenses (created_by)
alter policy expenses_select on public.expenses using (
  (current_user_has_module_permission('acct_financials','view') OR current_user_has_module_permission('accounting_financials_expenses_tab','view') OR current_user_has_module_permission('acct_expenses','view') OR current_user_has_module_permission('ops_bookings_expenses_tab','view') OR current_user_has_module_permission('ops_projects_expenses_tab','view'))
  AND current_user_can_view_record('expenses', created_by));
alter policy expenses_update on public.expenses using (
  (current_user_has_module_permission('acct_financials','edit') OR current_user_has_module_permission('acct_expenses','edit') OR current_user_has_module_permission('ops_bookings_expenses_tab','edit') OR current_user_has_module_permission('ops_projects_expenses_tab','edit'))
  AND current_user_can_view_record('expenses', created_by));
alter policy expenses_delete on public.expenses using (
  (current_user_has_module_permission('acct_financials','delete') OR current_user_has_module_permission('acct_expenses','delete'))
  AND current_user_can_view_record('expenses', created_by));

-- invoices (created_by)
alter policy invoices_select on public.invoices using (
  (current_user_has_module_permission('acct_financials','view') OR current_user_has_module_permission('accounting_financials_invoices_tab','view'))
  AND current_user_can_view_record('invoices', created_by));
alter policy invoices_update on public.invoices using (
  (current_user_has_module_permission('acct_financials','edit') OR current_user_has_module_permission('accounting_financials_invoices_tab','edit'))
  AND current_user_can_view_record('invoices', created_by));
alter policy invoices_delete on public.invoices using (
  (current_user_has_module_permission('acct_financials','delete') OR current_user_has_module_permission('accounting_financials_invoices_tab','delete'))
  AND current_user_can_view_record('invoices', created_by));

-- collections (created_by)
alter policy collections_select on public.collections using (
  (current_user_has_module_permission('acct_financials','view') OR current_user_has_module_permission('accounting_financials_collections_tab','view') OR current_user_has_module_permission('acct_collections','view'))
  AND current_user_can_view_record('collections', created_by));
alter policy collections_update on public.collections using (
  (current_user_has_module_permission('acct_financials','edit') OR current_user_has_module_permission('acct_collections','edit'))
  AND current_user_can_view_record('collections', created_by));
alter policy collections_delete on public.collections using (
  (current_user_has_module_permission('acct_financials','delete') OR current_user_has_module_permission('acct_collections','delete'))
  AND current_user_can_view_record('collections', created_by));

-- billing_line_items (no owner column — key 'billings', null owner => Everything-only)
alter policy billing_line_items_select on public.billing_line_items using (
  (current_user_has_module_permission('acct_financials','view') OR current_user_has_module_permission('accounting_financials_billings_tab','view') OR current_user_has_module_permission('acct_billings','view') OR current_user_has_module_permission('acct_bookings','view') OR current_user_has_module_permission('ops_bookings_billings_tab','view') OR current_user_has_module_permission('ops_projects_billings_tab','view') OR current_user_has_module_permission('pricing_contracts_billings_tab','view'))
  AND current_user_can_view_record('billings', NULL::text));
alter policy billing_line_items_update on public.billing_line_items using (
  (current_user_has_module_permission('acct_financials','edit') OR current_user_has_module_permission('accounting_financials_billings_tab','edit') OR current_user_has_module_permission('acct_billings','edit') OR current_user_has_module_permission('ops_bookings_billings_tab','edit') OR current_user_has_module_permission('ops_projects_billings_tab','edit'))
  AND current_user_can_view_record('billings', NULL::text));
alter policy billing_line_items_delete on public.billing_line_items using (
  (current_user_has_module_permission('acct_financials','delete') OR current_user_has_module_permission('accounting_financials_billings_tab','delete') OR current_user_has_module_permission('acct_billings','delete') OR current_user_has_module_permission('ops_bookings_billings_tab','delete') OR current_user_has_module_permission('ops_projects_billings_tab','delete'))
  AND current_user_can_view_record('billings', NULL::text));

-- evouchers (created_by) — approve branch unchanged
alter policy evouchers_select on public.evouchers using (
  ((current_user_has_module_permission('acct_evouchers','view') OR ((created_by = get_my_profile_id()) AND current_user_has_module_permission('my_evouchers','view')) OR ((transaction_type='budget_request') AND current_user_has_module_permission('bd_budget_requests','view')))
    AND current_user_can_view_record('evouchers', created_by))
  OR (current_user_has_module_permission('my_evouchers','approve') AND ((details ->> 'requestor_department') = get_my_department())));
alter policy evouchers_update on public.evouchers using (
  ((current_user_has_module_permission('acct_evouchers','edit') OR current_user_has_module_permission('acct_evouchers','approve') OR ((created_by = get_my_profile_id()) AND current_user_has_module_permission('my_evouchers','edit')) OR ((transaction_type='budget_request') AND (current_user_has_module_permission('bd_budget_requests','edit') OR current_user_has_module_permission('bd_budget_requests','approve'))))
    AND current_user_can_view_record('evouchers', created_by))
  OR (current_user_has_module_permission('my_evouchers','approve') AND ((details ->> 'requestor_department') = get_my_department()) AND (status='pending_manager')));
alter policy evouchers_delete on public.evouchers using (
  (current_user_has_module_permission('acct_evouchers','delete') OR ((created_by = get_my_profile_id()) AND current_user_has_module_permission('my_evouchers','delete')))
  AND current_user_can_view_record('evouchers', created_by));

-- bookings (per service_type key; assignment-aware booking fn)
alter policy bookings_select on public.bookings using (
  (current_user_can_act_on_booking('view') OR current_user_has_module_permission('acct_bookings','view'))
  AND current_user_can_view_booking('bookings_'||replace(lower(coalesce(service_type,'others')),' ','_'), created_by, manager_id, supervisor_id, handler_id));
alter policy bookings_update on public.bookings using (
  current_user_can_act_on_booking('edit')
  AND current_user_can_view_booking('bookings_'||replace(lower(coalesce(service_type,'others')),' ','_'), created_by, manager_id, supervisor_id, handler_id));
alter policy bookings_delete on public.bookings using (
  current_user_can_act_on_booking('delete')
  AND current_user_can_view_booking('bookings_'||replace(lower(coalesce(service_type,'others')),' ','_'), created_by, manager_id, supervisor_id, handler_id));
