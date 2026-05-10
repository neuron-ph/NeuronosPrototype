-- 101_record_context_visibility_scoping.sql
-- Switches `department` and `selected_departments` visibility scopes from
-- owner-context (owner.department == my.department) to record-context
-- (my.department ∈ record's department set).
--
-- Why: a Pricing user creating a BD contact left BD managers on department
-- scope blind to their own team's record because the owner's home department
-- was Pricing. Under record-context scoping, contacts belong to {BD, Pricing}
-- regardless of who typed them in, so the BD manager sees them.
--
-- `own` and `team` scopes remain owner-based (they describe who, not what).

-- ---------------------------------------------------------------------------
-- 1. New canonical helper: record-context visibility check
--    p_owner_id          : creator/owner of the row (nullable for finance docs
--                           that have no owner concept)
--    p_record_departments: the static set of departments that interact with
--                           this record type, declared per-policy
-- ---------------------------------------------------------------------------

create or replace function public.current_user_can_view_record(
  p_owner_id text,
  p_record_departments text[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_user_dept text;
  v_user_team uuid;
  v_owner_team uuid;
  v_scope text;
  v_scope_depts text[];
begin
  select u.id, u.department, u.team_id into v_user_id, v_user_dept, v_user_team
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;

  v_scope := public.current_user_visibility_scope();

  if v_scope = 'all' then return true; end if;

  if v_scope = 'own' then
    return p_owner_id is not null and p_owner_id = v_user_id;
  end if;

  if v_scope = 'team' then
    if p_owner_id is null or v_user_team is null then return false; end if;
    select u.team_id into v_owner_team
    from public.users u where u.id = p_owner_id limit 1;
    return v_owner_team = v_user_team;
  end if;

  if v_scope = 'department' then
    return v_user_dept = any(coalesce(p_record_departments, array[]::text[]));
  end if;

  if v_scope = 'selected_departments' then
    v_scope_depts := public.current_user_visibility_departments();
    return coalesce(p_record_departments, array[]::text[]) && coalesce(v_scope_depts, array[]::text[]);
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Update booking visibility helper to use record-context for bookings.
--    Bookings belong to {Pricing, Operations, Accounting} — Pricing reads via
--    pricing_contracts_bookings_tab, Accounting via acct_bookings, Ops owns.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_can_view_booking(
  p_created_by text,
  p_manager_id text,
  p_supervisor_id text,
  p_handler_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;

  -- Direct assignment always wins (assigned roles see their own work)
  if p_manager_id = v_user_id
     or p_supervisor_id = v_user_id
     or p_handler_id = v_user_id
     or p_created_by = v_user_id then
    return true;
  end if;

  return public.current_user_can_view_record(
    p_created_by,
    array['Pricing','Operations','Accounting']::text[]
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Slice 1 policies — contacts, customers, tasks
-- ---------------------------------------------------------------------------

drop policy if exists "contacts_select" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;
drop policy if exists "contacts_delete" on public.contacts;

create policy "contacts_select" on public.contacts for select to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','view')
    or public.current_user_has_module_permission('pricing_contacts','view'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing']::text[]
  )
);

create policy "contacts_update" on public.contacts for update to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','edit')
    or public.current_user_has_module_permission('pricing_contacts','edit'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing']::text[]
  )
)
with check (
  public.current_user_has_module_permission('bd_contacts','edit')
  or public.current_user_has_module_permission('pricing_contacts','edit')
);

create policy "contacts_delete" on public.contacts for delete to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','delete')
    or public.current_user_has_module_permission('pricing_contacts','delete'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing']::text[]
  )
);

drop policy if exists "customers_select" on public.customers;
drop policy if exists "customers_update" on public.customers;
drop policy if exists "customers_delete" on public.customers;

create policy "customers_select" on public.customers for select to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','view')
    or public.current_user_has_module_permission('pricing_customers','view')
    or public.current_user_has_module_permission('acct_customers','view'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing','Accounting']::text[]
  )
);

create policy "customers_update" on public.customers for update to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','edit')
    or public.current_user_has_module_permission('pricing_customers','edit'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('bd_customers','edit')
  or public.current_user_has_module_permission('pricing_customers','edit')
);

create policy "customers_delete" on public.customers for delete to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','delete')
    or public.current_user_has_module_permission('pricing_customers','delete'))
  and public.current_user_can_view_record(
    owner_id,
    array['Business Development','Pricing','Accounting']::text[]
  )
);

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks for select to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','view')
  and (
    public.current_user_can_view_record(owner_id, array['Business Development']::text[])
    or public.current_user_can_view_record(assigned_to, array['Business Development']::text[])
  )
);

create policy "tasks_update" on public.tasks for update to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','edit')
  and (
    public.current_user_can_view_record(owner_id, array['Business Development']::text[])
    or public.current_user_can_view_record(assigned_to, array['Business Development']::text[])
  )
)
with check (
  public.current_user_has_module_permission('bd_tasks','edit')
);

create policy "tasks_delete" on public.tasks for delete to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','delete')
  and (
    public.current_user_can_view_record(owner_id, array['Business Development']::text[])
    or public.current_user_can_view_record(assigned_to, array['Business Development']::text[])
  )
);

-- ---------------------------------------------------------------------------
-- 4. Slice 2 policies — quotations
--    Quotations belong to {BD, Pricing, Operations, Accounting}.
--    (Bookings policies don't change — they go through current_user_can_view_booking
--     which was updated in §2.)
-- ---------------------------------------------------------------------------

drop policy if exists "quotations_select" on public.quotations;
drop policy if exists "quotations_update" on public.quotations;
drop policy if exists "quotations_delete" on public.quotations;

create policy "quotations_select" on public.quotations for select to authenticated
using (
  (
    public.current_user_has_module_permission('pricing_quotations','view')
    or public.current_user_has_module_permission('pricing_contracts','view')
    or public.current_user_has_module_permission('bd_contracts','view')
    or public.current_user_has_module_permission('bd_inquiries','view')
    or public.current_user_has_module_permission('ops_bookings','view')
    or public.current_user_has_module_permission('acct_bookings','view')
  )
  and public.current_user_can_view_record(
    coalesce(prepared_by, created_by),
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
);

create policy "quotations_update" on public.quotations for update to authenticated
using (
  (
    public.current_user_has_module_permission('pricing_quotations','edit')
    or public.current_user_has_module_permission('pricing_contracts','edit')
  )
  and public.current_user_can_view_record(
    coalesce(prepared_by, created_by),
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('pricing_quotations','edit')
  or public.current_user_has_module_permission('pricing_contracts','edit')
);

create policy "quotations_delete" on public.quotations for delete to authenticated
using (
  (
    public.current_user_has_module_permission('pricing_quotations','delete')
    or public.current_user_has_module_permission('pricing_contracts','delete')
  )
  and public.current_user_can_view_record(
    coalesce(prepared_by, created_by),
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
);

-- ---------------------------------------------------------------------------
-- 5. Slice 3 policies — finance.
--    Previously these had no scope filter (grant-only). We now layer
--    record-context scope on top so dept-scoped users only see records that
--    belong to their department's interaction set.
-- ---------------------------------------------------------------------------

-- evouchers: dept-set varies by transaction_type
drop policy if exists "evouchers_select" on public.evouchers;
drop policy if exists "evouchers_update" on public.evouchers;
drop policy if exists "evouchers_delete" on public.evouchers;

create policy "evouchers_select" on public.evouchers for select to authenticated
using (
  (
    public.current_user_has_module_permission('acct_evouchers','view')
    or (created_by = public.get_my_profile_id()
        and public.current_user_has_module_permission('my_evouchers','view'))
    or (transaction_type = 'budget_request'
        and public.current_user_has_module_permission('bd_budget_requests','view'))
  )
  and public.current_user_can_view_record(
    created_by,
    case transaction_type
      when 'budget_request' then array['Business Development','Accounting']::text[]
      when 'ap_voucher'     then array['Accounting']::text[]
      when 'expense'        then array['Business Development','Pricing','Operations','Accounting']::text[]
      when 'cash_advance'   then array['Business Development','Pricing','Operations','Accounting','HR']::text[]
      else array['Accounting']::text[]
    end
  )
);

create policy "evouchers_update" on public.evouchers for update to authenticated
using (
  (
    public.current_user_has_module_permission('acct_evouchers','edit')
    or public.current_user_has_module_permission('acct_evouchers','approve')
    or (created_by = public.get_my_profile_id()
        and public.current_user_has_module_permission('my_evouchers','edit'))
    or (transaction_type = 'budget_request'
        and (public.current_user_has_module_permission('bd_budget_requests','edit')
             or public.current_user_has_module_permission('bd_budget_requests','approve')))
  )
  and public.current_user_can_view_record(
    created_by,
    case transaction_type
      when 'budget_request' then array['Business Development','Accounting']::text[]
      when 'ap_voucher'     then array['Accounting']::text[]
      when 'expense'        then array['Business Development','Pricing','Operations','Accounting']::text[]
      when 'cash_advance'   then array['Business Development','Pricing','Operations','Accounting','HR']::text[]
      else array['Accounting']::text[]
    end
  )
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
  (
    public.current_user_has_module_permission('acct_evouchers','delete')
    or (created_by = public.get_my_profile_id()
        and public.current_user_has_module_permission('my_evouchers','delete'))
  )
  and public.current_user_can_view_record(
    created_by,
    case transaction_type
      when 'budget_request' then array['Business Development','Accounting']::text[]
      when 'ap_voucher'     then array['Accounting']::text[]
      when 'expense'        then array['Business Development','Pricing','Operations','Accounting']::text[]
      when 'cash_advance'   then array['Business Development','Pricing','Operations','Accounting','HR']::text[]
      else array['Accounting']::text[]
    end
  )
);

-- evoucher_line_items: cascading SELECT/INSERT/UPDATE/DELETE already inherits
-- the scope check from the parent evoucher policy via the EXISTS clause, so
-- no change needed here.

-- billing_line_items: {Pricing, Operations, Accounting}; no owner column
drop policy if exists "billing_line_items_select" on public.billing_line_items;
drop policy if exists "billing_line_items_update" on public.billing_line_items;
drop policy if exists "billing_line_items_delete" on public.billing_line_items;

create policy "billing_line_items_select" on public.billing_line_items for select to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','view')
    or public.current_user_has_module_permission('accounting_financials_billings_tab','view')
    or public.current_user_has_module_permission('acct_billings','view')
    or public.current_user_has_module_permission('acct_bookings','view')
    or public.current_user_has_module_permission('ops_bookings_billings_tab','view')
    or public.current_user_has_module_permission('ops_projects_billings_tab','view')
    or public.current_user_has_module_permission('pricing_contracts_billings_tab','view')
  )
  and public.current_user_can_view_record(
    null,
    array['Pricing','Operations','Accounting']::text[]
  )
);

create policy "billing_line_items_update" on public.billing_line_items for update to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','edit')
    or public.current_user_has_module_permission('accounting_financials_billings_tab','edit')
    or public.current_user_has_module_permission('acct_billings','edit')
    or public.current_user_has_module_permission('ops_bookings_billings_tab','edit')
    or public.current_user_has_module_permission('ops_projects_billings_tab','edit')
  )
  and public.current_user_can_view_record(
    null,
    array['Pricing','Operations','Accounting']::text[]
  )
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
  (
    public.current_user_has_module_permission('acct_financials','delete')
    or public.current_user_has_module_permission('accounting_financials_billings_tab','delete')
    or public.current_user_has_module_permission('acct_billings','delete')
    or public.current_user_has_module_permission('ops_bookings_billings_tab','delete')
    or public.current_user_has_module_permission('ops_projects_billings_tab','delete')
  )
  and public.current_user_can_view_record(
    null,
    array['Pricing','Operations','Accounting']::text[]
  )
);

-- invoices: {Pricing, Operations, Accounting}
drop policy if exists "invoices_select" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;

create policy "invoices_select" on public.invoices for select to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','view')
    or public.current_user_has_module_permission('accounting_financials_invoices_tab','view')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Pricing','Operations','Accounting']::text[]
  )
);

create policy "invoices_update" on public.invoices for update to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','edit')
    or public.current_user_has_module_permission('accounting_financials_invoices_tab','edit')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Pricing','Operations','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('accounting_financials_invoices_tab','edit')
);

create policy "invoices_delete" on public.invoices for delete to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','delete')
    or public.current_user_has_module_permission('accounting_financials_invoices_tab','delete')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Pricing','Operations','Accounting']::text[]
  )
);

-- collections: {BD, Pricing, Operations, Accounting}
drop policy if exists "collections_select" on public.collections;
drop policy if exists "collections_update" on public.collections;
drop policy if exists "collections_delete" on public.collections;

create policy "collections_select" on public.collections for select to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','view')
    or public.current_user_has_module_permission('accounting_financials_collections_tab','view')
    or public.current_user_has_module_permission('acct_collections','view')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
);

create policy "collections_update" on public.collections for update to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','edit')
    or public.current_user_has_module_permission('acct_collections','edit')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_collections','edit')
);

create policy "collections_delete" on public.collections for delete to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','delete')
    or public.current_user_has_module_permission('acct_collections','delete')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Pricing','Operations','Accounting']::text[]
  )
);

-- expenses: {BD, Operations, Accounting}
drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

create policy "expenses_select" on public.expenses for select to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','view')
    or public.current_user_has_module_permission('accounting_financials_expenses_tab','view')
    or public.current_user_has_module_permission('acct_expenses','view')
    or public.current_user_has_module_permission('ops_bookings_expenses_tab','view')
    or public.current_user_has_module_permission('ops_projects_expenses_tab','view')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Operations','Accounting']::text[]
  )
);

create policy "expenses_update" on public.expenses for update to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','edit')
    or public.current_user_has_module_permission('acct_expenses','edit')
    or public.current_user_has_module_permission('ops_bookings_expenses_tab','edit')
    or public.current_user_has_module_permission('ops_projects_expenses_tab','edit')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Operations','Accounting']::text[]
  )
)
with check (
  public.current_user_has_module_permission('acct_financials','edit')
  or public.current_user_has_module_permission('acct_expenses','edit')
  or public.current_user_has_module_permission('ops_bookings_expenses_tab','edit')
  or public.current_user_has_module_permission('ops_projects_expenses_tab','edit')
);

create policy "expenses_delete" on public.expenses for delete to authenticated
using (
  (
    public.current_user_has_module_permission('acct_financials','delete')
    or public.current_user_has_module_permission('acct_expenses','delete')
  )
  and public.current_user_can_view_record(
    created_by,
    array['Business Development','Operations','Accounting']::text[]
  )
);

-- ---------------------------------------------------------------------------
-- 6. Drop the old owner-context helper.
--    No remaining policies should reference current_user_can_view_owner after
--    this migration. current_user_can_view_booking was updated in §2 to call
--    the new helper instead.
-- ---------------------------------------------------------------------------

drop function if exists public.current_user_can_view_owner(text);
