-- Record Visibility: split the Quotations/Contracts dial (Option C, ruled by Marcus).
--
-- WHY: Quotation (sales draft) and Contract (active agreement) are distinct
-- nouns sharing the `quotations` table. They had ONE visibility dial ('quotations')
-- AND the contract-sharing read branch bypassed the dial entirely, so a BD/Pricing
-- browser saw every active contract regardless of scope (the Rovilyn leak).
--
-- FIX:
--  (1) Seed a separate 'contracts' dial = the current 'quotations' value, so the
--      dial-gated path is unchanged day-one for whatever scope a profile had.
--  (2) quotations_select branch A: key the dial off quotation_type
--      (contracts → 'contracts', else → 'quotations').
--  (3) quotations_select branch B (the broad active-contract read): keep it for
--      EXECUTORS only (ops/accounting who run bookings against the contract);
--      DROP the browser keys (bd_contracts, pricing_contracts). BD/Pricing contract
--      visibility now flows through branch A and obeys the 'contracts' dial.
--  (4) quotations_update/delete: the can_view_record scope check is keyed by
--      quotation_type too, so editing a contract obeys the 'contracts' dial.
--
-- INTENDED behavior change: BD/Pricing on own/team scope now see only their
-- own/team contracts (today they saw all). Profiles that must see every contract
-- get the 'contracts' dial set to 'All'. Executors are unaffected (branch B).

-- (1) seed the contracts dial from quotations (profiles + overrides)
update access_profiles
  set visibility_scopes = visibility_scopes || jsonb_build_object('contracts', visibility_scopes->>'quotations'),
      updated_at = now()
  where visibility_scopes ? 'quotations' and not (visibility_scopes ? 'contracts');
update permission_overrides
  set visibility_scopes = visibility_scopes || jsonb_build_object('contracts', visibility_scopes->>'quotations'),
      updated_at = now()
  where visibility_scopes ? 'quotations' and not (visibility_scopes ? 'contracts');

-- (2)+(3) quotations_select: dial keyed by type; branch B = executors only
alter policy quotations_select on public.quotations
  using (
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
    (
      quotation_type = 'contract'
      and contract_status = any (array['Active','Expiring'])
      and (current_user_can_act_on_booking('view')
        or current_user_has_module_permission('ops_brokerage','view')
        or current_user_has_module_permission('ops_forwarding','view')
        or current_user_has_module_permission('ops_trucking','view')
        or current_user_has_module_permission('ops_marine_insurance','view')
        or current_user_has_module_permission('ops_others','view')
        or current_user_has_module_permission('acct_bookings','view'))
    )
  );

-- (4) write policies: scope check keyed by type
alter policy quotations_update on public.quotations
  using (current_user_can_quotation('edit')
         and current_user_can_view_record(
               case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
               coalesce(prepared_by, created_by)))
  with check (current_user_can_quotation('edit'));
alter policy quotations_delete on public.quotations
  using (current_user_can_quotation('delete')
         and current_user_can_view_record(
               case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
               coalesce(prepared_by, created_by)));
