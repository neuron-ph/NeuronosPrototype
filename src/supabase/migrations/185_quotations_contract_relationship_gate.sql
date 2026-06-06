-- Record Visibility: relationship-gate the contract read branch (Option B, ruled).
--
-- 184 split the dial and removed the BD/Pricing BROWSER keys from the broad
-- contract-read branch, but it kept the booking-actor read ("any active contract
-- if you can act on bookings") — which still leaked every active contract to a BD
-- rep who merely holds ops_projects_bookings_tab (the Rovilyn case), because RLS
-- can't tell a targeted read from a list-scan.
--
-- This replaces that branch with a RELATIONSHIP gate: a contract is visible iff
-- the user can already see a BOOKING or PROJECT that links to it (bookings.contract_id
-- / projects.quotation_id), using the exact visibility predicate those tables use.
-- So a targeted read (the contract my booking runs on) passes — rate cards still
-- load — but a list-scan of unrelated contracts does not. Direct browsing of
-- contracts remains dial-gated in branch A. quotations_update/delete unchanged
-- (184 already keyed their scope check by quotation_type).

alter policy quotations_select on public.quotations
  using (
    -- Branch A: direct access, dial-gated by record type (quotations vs contracts)
    (
      (current_user_has_module_permission('pricing_quotations','view')
        or current_user_has_module_permission('pricing_contracts','view')
        or current_user_has_module_permission('bd_contracts','view')
        or current_user_has_module_permission('bd_inquiries','view')
        or current_user_can_act_on_booking('view')
        or current_user_has_module_permission('acct_bookings','view'))
      and current_user_can_view_record(
            case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
            coalesce(prepared_by, created_by))
    )
    or
    -- Branch B: a contract linked to a booking/project the user can already see
    (
      quotation_type = 'contract'
      and (
        exists (
          select 1 from public.bookings b
          where b.contract_id = quotations.id
            and (current_user_can_act_on_booking('view')
                 or current_user_has_module_permission('acct_bookings','view'))
            and current_user_can_view_booking(
                  'bookings_' || replace(lower(coalesce(b.service_type, 'others')), ' ', '_'),
                  b.created_by, b.manager_id, b.supervisor_id, b.handler_id)
        )
        or exists (
          select 1 from public.projects pr
          where pr.quotation_id = quotations.id
            and (current_user_has_module_permission('bd_projects','view')
                 or current_user_has_module_permission('pricing_projects','view')
                 or current_user_has_module_permission('ops_projects','view')
                 or current_user_has_module_permission('acct_projects','view'))
            and current_user_can_view_booking(
                  'projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)
        )
      )
    )
  );
