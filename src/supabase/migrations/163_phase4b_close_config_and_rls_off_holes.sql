-- NEU-012 Phase 4b — close the non-record holes: RLS-off tables + ungoverned
-- writes on config/sensitive tables. Reference reads stay open; writes gate on
-- the relevant module. Sub-records (attachments, ticket_*) inherit their parent.
-- Deliberately left: counters (infra/number generation) and settings (app-write
-- dependency); owned-record open INSERTs are create-gating (Phase 5).

-- ── Ticket cluster: one SECURITY DEFINER helper avoids policy recursion ──────
create or replace function public.current_user_can_view_ticket(p_ticket_id uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_created_by text;
begin
  select created_by into v_created_by from public.tickets where id = p_ticket_id;
  if v_created_by is null then return false; end if;
  if public.current_user_can_view_record('tickets', v_created_by) then return true; end if;
  return exists (select 1 from public.ticket_participants tp
    where tp.ticket_id = p_ticket_id and tp.participant_user_id = get_my_profile_id());
end; $$;

alter policy tickets_select on public.tickets using (public.current_user_can_view_ticket(id));

alter table public.ticket_assignments  enable row level security;
alter table public.ticket_attachments  enable row level security;
alter table public.ticket_messages     enable row level security;
alter table public.ticket_participants enable row level security;
alter table public.ticket_read_receipts enable row level security;

create policy ticket_assignments_access on public.ticket_assignments for all to authenticated
  using (public.current_user_can_view_ticket(ticket_id)) with check (public.current_user_can_view_ticket(ticket_id));
create policy ticket_attachments_access on public.ticket_attachments for all to authenticated
  using (public.current_user_can_view_ticket(ticket_id)) with check (public.current_user_can_view_ticket(ticket_id));
create policy ticket_messages_access on public.ticket_messages for all to authenticated
  using (public.current_user_can_view_ticket(ticket_id)) with check (public.current_user_can_view_ticket(ticket_id));
create policy ticket_participants_access on public.ticket_participants for all to authenticated
  using (public.current_user_can_view_ticket(ticket_id)) with check (public.current_user_can_view_ticket(ticket_id));
create policy ticket_read_receipts_own on public.ticket_read_receipts for all to authenticated
  using (user_id = get_my_profile_id()) with check (user_id = get_my_profile_id());

-- ── exchange_rates (RLS OFF → on; read open, write Accounting) ───────────────
alter table public.exchange_rates enable row level security;
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (true);
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated
  with check (current_user_has_module_permission('acct_financials','create') or current_user_has_module_permission('acct_financials','edit'));
create policy exchange_rates_update on public.exchange_rates for update to authenticated
  using (current_user_has_module_permission('acct_financials','edit')) with check (true);
create policy exchange_rates_delete on public.exchange_rates for delete to authenticated
  using (current_user_has_module_permission('acct_financials','delete'));

-- ── feedback (RLS OFF → on; own) ────────────────────────────────────────────
alter table public.feedback enable row level security;
create policy feedback_own on public.feedback for all to authenticated
  using (user_id = get_my_profile_id()) with check (user_id = get_my_profile_id());

-- ── saved_reports (personal; own) ───────────────────────────────────────────
drop policy if exists "Authenticated full access" on public.saved_reports;
create policy saved_reports_own on public.saved_reports for all to authenticated
  using (user_id = get_my_profile_id()) with check (user_id = get_my_profile_id());

-- ── accounts / chart of accounts (read open, write acct_coa) ────────────────
drop policy if exists "Authenticated full access" on public.accounts;
create policy accounts_select on public.accounts for select to authenticated using (true);
create policy accounts_insert on public.accounts for insert to authenticated
  with check (current_user_has_module_permission('acct_coa','create'));
create policy accounts_update on public.accounts for update to authenticated
  using (current_user_has_module_permission('acct_coa','edit')) with check (true);
create policy accounts_delete on public.accounts for delete to authenticated
  using (current_user_has_module_permission('acct_coa','delete'));

-- ── catalog_categories / catalog_items (read open, write acct_catalog) ──────
drop policy if exists "Authenticated full access" on public.catalog_categories;
create policy catalog_categories_select on public.catalog_categories for select to authenticated using (true);
create policy catalog_categories_insert on public.catalog_categories for insert to authenticated
  with check (current_user_has_module_permission('acct_catalog','create'));
create policy catalog_categories_update on public.catalog_categories for update to authenticated
  using (current_user_has_module_permission('acct_catalog','edit')) with check (true);
create policy catalog_categories_delete on public.catalog_categories for delete to authenticated
  using (current_user_has_module_permission('acct_catalog','delete'));

drop policy if exists "Authenticated full access" on public.catalog_items;
create policy catalog_items_select on public.catalog_items for select to authenticated using (true);
create policy catalog_items_insert on public.catalog_items for insert to authenticated
  with check (current_user_has_module_permission('acct_catalog','create'));
create policy catalog_items_update on public.catalog_items for update to authenticated
  using (current_user_has_module_permission('acct_catalog','edit')) with check (true);
create policy catalog_items_delete on public.catalog_items for delete to authenticated
  using (current_user_has_module_permission('acct_catalog','delete'));

-- ── category_templates (keep open read; gate the 3 write policies) ──────────
alter policy category_templates_insert on public.category_templates
  with check (current_user_has_module_permission('acct_catalog','create'));
alter policy category_templates_update on public.category_templates
  using (current_user_has_module_permission('acct_catalog','edit'));
alter policy category_templates_delete on public.category_templates
  using (current_user_has_module_permission('acct_catalog','delete'));

-- ── contract_rate_versions (read = contract modules; write pricing_contracts) ─
drop policy if exists "Allow all for authenticated" on public.contract_rate_versions;
create policy contract_rate_versions_select on public.contract_rate_versions for select to authenticated
  using (current_user_has_module_permission('pricing_contracts','view') or current_user_has_module_permission('bd_contracts','view') or current_user_has_module_permission('acct_contracts','view'));
create policy contract_rate_versions_insert on public.contract_rate_versions for insert to authenticated
  with check (current_user_has_module_permission('pricing_contracts','create') or current_user_has_module_permission('pricing_contracts','edit'));
create policy contract_rate_versions_update on public.contract_rate_versions for update to authenticated
  using (current_user_has_module_permission('pricing_contracts','edit')) with check (true);
create policy contract_rate_versions_delete on public.contract_rate_versions for delete to authenticated
  using (current_user_has_module_permission('pricing_contracts','delete'));

-- ── Attachments: inherit the parent record's visibility (parent RLS does work) ─
drop policy if exists contact_attachments_all on public.contact_attachments;
create policy contact_attachments_access on public.contact_attachments for all to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_attachments.contact_id))
  with check (exists (select 1 from public.contacts c where c.id = contact_attachments.contact_id));

drop policy if exists customer_attachments_all on public.customer_attachments;
create policy customer_attachments_access on public.customer_attachments for all to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_attachments.customer_id))
  with check (exists (select 1 from public.customers c where c.id = customer_attachments.customer_id));

drop policy if exists "Authenticated full access" on public.project_attachments;
create policy project_attachments_access on public.project_attachments for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_attachments.project_id))
  with check (exists (select 1 from public.projects p where p.id = project_attachments.project_id));

drop policy if exists quotation_attachments_select on public.quotation_attachments;
drop policy if exists quotation_attachments_insert on public.quotation_attachments;
drop policy if exists quotation_attachments_delete on public.quotation_attachments;
create policy quotation_attachments_access on public.quotation_attachments for all to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_attachments.quotation_id))
  with check (exists (select 1 from public.quotations q where q.id = quotation_attachments.quotation_id));
