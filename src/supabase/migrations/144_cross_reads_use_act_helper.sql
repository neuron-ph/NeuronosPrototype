-- NEU-012 Contract #1 (eliminate ops_bookings umbrella), Step 2 — STRICT.
--
-- The two cross-read policies that let booking-touching users see the related
-- customer/quotation rows. Surgical: replace ONLY the `ops_bookings:view`
-- disjunct with the real-grant helper current_user_can_act_on_booking('view').
-- Everything else (record-scope, the explicit service disjuncts, acct_bookings,
-- contract/BD/pricing disjuncts) is preserved verbatim.
--
-- IMPORTANT: customers_select keeps its `ops_projects:view` disjunct untouched —
-- that umbrella is Contract #2, not this one.
--
-- Net delta (same as Step 1, documented): ops_projects_bookings_tab:view holders
-- gain the cross-read they already implicitly needed; no one loses access.

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
      or current_user_can_act_on_booking('view')                       -- was ops_bookings:view
      or current_user_has_module_permission('ops_projects', 'view')    -- LEFT for Contract #2
    )
  );

drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations
  as permissive for select to authenticated
  using (
    (
      ( current_user_has_module_permission('pricing_quotations', 'view')
        or current_user_has_module_permission('pricing_contracts', 'view')
        or current_user_has_module_permission('bd_contracts', 'view')
        or current_user_has_module_permission('bd_inquiries', 'view')
        or current_user_can_act_on_booking('view')                     -- was ops_bookings:view
        or current_user_has_module_permission('acct_bookings', 'view') )
      and current_user_can_view_record(COALESCE(prepared_by, created_by), ARRAY['Business Development','Pricing','Operations','Accounting'])
    )
    or (
      quotation_type = 'contract'
      and contract_status = ANY (ARRAY['Active','Expiring'])
      and (
        current_user_can_act_on_booking('view')                        -- was ops_bookings:view
        or current_user_has_module_permission('ops_brokerage', 'view')
        or current_user_has_module_permission('ops_forwarding', 'view')
        or current_user_has_module_permission('ops_trucking', 'view')
        or current_user_has_module_permission('ops_marine_insurance', 'view')
        or current_user_has_module_permission('ops_others', 'view')
        or current_user_has_module_permission('acct_bookings', 'view')
        or current_user_has_module_permission('pricing_contracts', 'view')
        or current_user_has_module_permission('bd_contracts', 'view')
      )
    )
  );
