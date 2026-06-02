-- 134_active_contracts_readable_for_booking.sql
--
-- Problem: Operations (Brokerage/Forwarding/etc.) staff creating a booking saw
-- "No active contract found for <customer>" even when an Active contract exists.
-- Root cause is TWO gaps in quotations_select, both downstream of the same idea:
-- a contract is treated as private Pricing-authored work, but once ACTIVATED it
-- is a shared cross-department reference (Ops books against it, Accounting bills
-- it). Two barriers blocked the ops reader:
--
--   1. Module gate: the policy only accepts ops_bookings/acct_bookings/pricing/bd
--      modules. But ops staff hold SERVICE-LEVEL modules (ops_brokerage,
--      ops_forwarding, ...) — ops_bookings is a hidden pseudo-module. This is the
--      same gap migration 117 fixed for the bookings table but never applied here.
--   2. Owner-scope gate: current_user_can_view_record() is owner-context for
--      'own'/'team' scopes. The contract is owned by a Pricing manager, so an ops
--      staff (scope 'own') or team_leader (scope 'team', no shared team) fails it.
--
-- Fix: add a second, state-gated branch to quotations_select. An Active/Expiring
-- *contract* is readable by anyone holding an operational or contract module,
-- independent of who authored it. Drafts, spot quotations, and not-yet-active
-- contracts are unaffected — they stay on the original author/scope gate.
--
-- SELECT only. update/delete remain Pricing-only (unchanged) — this opens read,
-- not write. Marcus signed off on exposing full active-contract rows (incl. rates)
-- to operational/accounting view-holders, since they legitimately consume those
-- rates when booking and billing.

drop policy if exists "quotations_select" on public.quotations;

create policy "quotations_select" on public.quotations for select to authenticated
using (
  -- Original gate: full quotation visibility for Pricing/BD authors and the
  -- departments/teams scoped to view their work. Unchanged.
  (
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
  )
  -- New: an activated contract is a shared operational reference. Any user who can
  -- work bookings (service-level ops modules, accounting) or view contracts may read
  -- it regardless of author, so booking creation can detect & link the customer's
  -- active contract. State-gated to Active/Expiring contracts only.
  or (
    quotation_type = 'contract'
    and contract_status in ('Active','Expiring')
    and (
      public.current_user_has_module_permission('ops_bookings','view')
      or public.current_user_has_module_permission('ops_brokerage','view')
      or public.current_user_has_module_permission('ops_forwarding','view')
      or public.current_user_has_module_permission('ops_trucking','view')
      or public.current_user_has_module_permission('ops_marine_insurance','view')
      or public.current_user_has_module_permission('ops_others','view')
      or public.current_user_has_module_permission('acct_bookings','view')
      or public.current_user_has_module_permission('pricing_contracts','view')
      or public.current_user_has_module_permission('bd_contracts','view')
    )
  )
);
