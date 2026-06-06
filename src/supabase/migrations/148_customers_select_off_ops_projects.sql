-- NEU-012 Contract #2 (eliminate ops_projects umbrella), Slice A — STRICT.
--
-- customers_select: replace the `ops_projects:view` disjunct with the real grants
-- it derives from (bd_projects:view OR pricing_projects:view). Everything else —
-- record-scope, the service disjuncts, the Contract #1 booking helper — verbatim.
-- The ops_projects derivation branch in the resolver stays alive until Slice B.

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  as permissive for select to authenticated
  using (
    (
      ( current_user_has_module_permission('bd_customers', 'view')
        or current_user_has_module_permission('pricing_customers', 'view')
        or current_user_has_module_permission('acct_customers', 'view') )
      and current_user_can_view_record(owner_id, ARRAY['Business Development','Pricing','Accounting'])
    )
    or (
      current_user_has_module_permission('ops_forwarding', 'view')
      or current_user_has_module_permission('ops_brokerage', 'view')
      or current_user_has_module_permission('ops_trucking', 'view')
      or current_user_has_module_permission('ops_marine_insurance', 'view')
      or current_user_has_module_permission('ops_others', 'view')
      or current_user_can_act_on_booking('view')
      or current_user_has_module_permission('bd_projects', 'view')      -- was ops_projects:view
      or current_user_has_module_permission('pricing_projects', 'view') -- (ops_projects = bd OR pricing)
    )
  );