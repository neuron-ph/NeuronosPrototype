-- NEU-020 Phase 4 (part 2) — RLS reconciliation for quotations, tickets, contracts.
--
-- The UI now gates these writes on door keys RLS didn't know about:
--   * amending a quotation from a project/contract → *_projects_quotation_tab:edit
--     / *_contracts_quotation_tab:edit (and bd_inquiries:edit on the BD route)
--   * inbox status/assign/approve → inbox_inbox_tab:edit / inbox_queue_tab:edit /
--     inbox:approve (DD-5 five-way split)
--   * contract rate-card amend → *_contracts_quotation_tab:edit
-- ADDITIVE / SUPERSET — each new policy includes every key it checked before,
-- plus the door keys; broadens only, never denies. (quotations_select is left
-- untouched; it is already broad and read-side reconciliation is separate.)

-- ── Quotation write helper (all quotation doors) ───────────────────────────
create or replace function public.current_user_can_quotation(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('pricing_quotations', p_action)
      or current_user_has_module_permission('pricing_contracts', p_action)
      or current_user_has_module_permission('bd_inquiries', p_action)
      or current_user_has_module_permission('bd_contracts', p_action)
      or current_user_has_module_permission('bd_projects_quotation_tab', p_action)
      or current_user_has_module_permission('pricing_projects_quotation_tab', p_action)
      or current_user_has_module_permission('ops_projects_quotation_tab', p_action)
      or current_user_has_module_permission('acct_projects_quotation_tab', p_action)
      or current_user_has_module_permission('bd_contracts_quotation_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_quotation_tab', p_action)
      or current_user_has_module_permission('acct_contracts_quotation_tab', p_action);
$$;

-- ── Contract-amend helper (rate versions + activity) ───────────────────────
create or replace function public.current_user_can_contract_amend(p_action text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select current_user_has_module_permission('pricing_contracts', p_action)
      or current_user_has_module_permission('bd_contracts', p_action)
      or current_user_has_module_permission('acct_contracts', p_action)
      or current_user_has_module_permission('bd_contracts_quotation_tab', p_action)
      or current_user_has_module_permission('pricing_contracts_quotation_tab', p_action)
      or current_user_has_module_permission('acct_contracts_quotation_tab', p_action);
$$;

-- ── quotations (write only; select untouched) ──────────────────────────────
alter policy quotations_insert on public.quotations
  with check (current_user_can_quotation('create'));
alter policy quotations_update on public.quotations
  using (current_user_can_quotation('edit') and current_user_can_view_record('quotations', coalesce(prepared_by, created_by)))
  with check (current_user_can_quotation('edit'));
alter policy quotations_delete on public.quotations
  using (current_user_can_quotation('delete') and current_user_can_view_record('quotations', coalesce(prepared_by, created_by)));

-- ── tickets_update (DD-5 inbox five-way) ───────────────────────────────────
alter policy tickets_update on public.tickets
  using (
    (created_by = get_my_profile_id())
    or (exists (select 1 from ticket_participants tp where tp.ticket_id = tickets.id and tp.participant_user_id = get_my_profile_id() and tp.role = 'to'))
    or ((current_user_has_module_permission('inbox','edit')
         or current_user_has_module_permission('inbox_inbox_tab','edit')
         or current_user_has_module_permission('inbox_queue_tab','edit')
         or current_user_has_module_permission('inbox','approve'))
        and current_user_can_view_ticket(id))
  )
  with check (
    (created_by = get_my_profile_id())
    or (exists (select 1 from ticket_participants tp where tp.ticket_id = tickets.id and tp.participant_user_id = get_my_profile_id() and tp.role = 'to'))
    or ((current_user_has_module_permission('inbox','edit')
         or current_user_has_module_permission('inbox_inbox_tab','edit')
         or current_user_has_module_permission('inbox_queue_tab','edit')
         or current_user_has_module_permission('inbox','approve'))
        and current_user_can_view_ticket(id))
  );

-- ── contract rate versions + activity (rate-card amend door) ───────────────
alter policy contract_rate_versions_insert on public.contract_rate_versions
  with check (current_user_can_contract_amend('create') or current_user_can_contract_amend('edit'));
alter policy contract_rate_versions_update on public.contract_rate_versions
  using (current_user_can_contract_amend('edit')) with check (true);
alter policy contract_activity_update on public.contract_activity
  using (current_user_can_contract_amend('edit')) with check (current_user_can_contract_amend('edit'));
