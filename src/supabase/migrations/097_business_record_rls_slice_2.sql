-- 097_business_record_rls_slice_2.sql
-- Source-of-truth RLS for slice 2: quotations + bookings.
-- Replaces legacy department/role gates with grant + scope checks.

-- ---------------------------------------------------------------------------
-- 1. Booking visibility helper
--    A user can view a booking if any of:
--      - they are assigned (manager_id / supervisor_id / handler_id matches),
--      - their scope grants visibility on the booking creator.
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

  if p_manager_id = v_user_id
     or p_supervisor_id = v_user_id
     or p_handler_id = v_user_id
     or p_created_by = v_user_id then
    return true;
  end if;

  return public.current_user_can_view_owner(p_created_by);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Quotations
--    SELECT visible to any module that reads quotations (BD / Pricing / Ops / Accounting),
--    scoped by `prepared_by` (the rep who owns the quotation).
--    INSERT/UPDATE/DELETE require explicit pricing/contract grants.
-- ---------------------------------------------------------------------------

drop policy if exists "quotations_select" on public.quotations;
drop policy if exists "quotations_insert" on public.quotations;
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
  and public.current_user_can_view_owner(coalesce(prepared_by, created_by))
);

create policy "quotations_insert" on public.quotations for insert to authenticated
with check (
  public.current_user_has_module_permission('pricing_quotations','create')
  or public.current_user_has_module_permission('pricing_contracts','create')
  or public.current_user_has_module_permission('bd_inquiries','create')
);

create policy "quotations_update" on public.quotations for update to authenticated
using (
  (
    public.current_user_has_module_permission('pricing_quotations','edit')
    or public.current_user_has_module_permission('pricing_contracts','edit')
  )
  and public.current_user_can_view_owner(coalesce(prepared_by, created_by))
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
  and public.current_user_can_view_owner(coalesce(prepared_by, created_by))
);

-- ---------------------------------------------------------------------------
-- 3. Bookings
--    The legacy "Authenticated full access" policy is replaced. Visibility is
--    granted by ops_bookings:view OR acct_bookings:view, scoped via
--    current_user_can_view_booking which honors team-role assignments.
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated full access" on public.bookings;
drop policy if exists "bookings_select" on public.bookings;
drop policy if exists "bookings_insert" on public.bookings;
drop policy if exists "bookings_update" on public.bookings;
drop policy if exists "bookings_delete" on public.bookings;

create policy "bookings_select" on public.bookings for select to authenticated
using (
  (
    public.current_user_has_module_permission('ops_bookings','view')
    or public.current_user_has_module_permission('acct_bookings','view')
  )
  and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
);

create policy "bookings_insert" on public.bookings for insert to authenticated
with check (
  public.current_user_has_module_permission('ops_bookings','create')
);

create policy "bookings_update" on public.bookings for update to authenticated
using (
  public.current_user_has_module_permission('ops_bookings','edit')
  and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
)
with check (
  public.current_user_has_module_permission('ops_bookings','edit')
);

create policy "bookings_delete" on public.bookings for delete to authenticated
using (
  public.current_user_has_module_permission('ops_bookings','delete')
  and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
);
