-- 103_operations_customer_reference_read.sql
-- Restore Operations read access to customer reference records.
--
-- Booking creation uses the shared customer profile lookup, which queries
-- public.customers directly. Migration 101 moved customer reads behind
-- customer-module grants only, leaving Operations users with ops_* booking
-- grants unable to select customers while creating operational bookings.

drop policy if exists "customers_select" on public.customers;

create policy "customers_select" on public.customers for select to authenticated
using (
  (
    (
      public.current_user_has_module_permission('bd_customers','view')
      or public.current_user_has_module_permission('pricing_customers','view')
      or public.current_user_has_module_permission('acct_customers','view')
    )
    and public.current_user_can_view_record(
      owner_id,
      array['Business Development','Pricing','Accounting']::text[]
    )
  )
  or (
    -- Customers are operational reference data during booking creation.
    -- Staff users usually have `own` visibility, so owner-scoping here would
    -- hide BD-owned customers from the booking customer picker.
    public.current_user_has_module_permission('ops_forwarding','view')
    or public.current_user_has_module_permission('ops_brokerage','view')
    or public.current_user_has_module_permission('ops_trucking','view')
    or public.current_user_has_module_permission('ops_marine_insurance','view')
    or public.current_user_has_module_permission('ops_others','view')
    or public.current_user_has_module_permission('ops_bookings','view')
    or public.current_user_has_module_permission('ops_projects','view')
  )
);
