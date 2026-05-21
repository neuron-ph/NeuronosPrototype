-- 109_service_providers_pricing_owned_rls.sql
-- Re-anchor service_providers write RLS from the Profiling module key back to
-- the Pricing → Network Partners (Vendor) module key it should have been on.
--
-- Background:
--   - service_providers has been the vendor master table since migration 001
--     (predating Profiling by ~57 migrations).
--   - Migration 058 introduced Profiling as a text-registry module and added
--     a booking_profile_tags column to service_providers so Profiling quick-
--     creates could reuse the table for carrier/forwarder/etc. tag values.
--   - Migration 062 tightened service_providers writes to manager-only "to
--     enforce the Executive/manager-only write rule that governs the profiling
--     quick-create path" — pulling vendors under Profiling's permission umbrella
--     as a side effect.
--   - Migration 095 rekeyed those writes to current_user_has_module_permission
--     ('exec_profiling', ...).
--   - Migrations 090 and 102 then decoupled the actual Profiling content
--     (carriers, forwarders, shipping lines, trucking, consolidators, insurers)
--     out of service_providers into dedicated profile_* tables, with the
--     header note: "Profiling is a separate concept from Vendors."
--   - But the RLS on service_providers was never moved back. Today the vendor
--     table is gated by a permission key whose data no longer lives here.
--
-- This migration restores ownership to the Pricing → Network Partners module
-- (module key `pricing_network_partners`), which is where the Vendor UI lives
-- in the frontend (src/config/access/accessSchema.ts:203, App.tsx:1121).
--
-- Read policy is unchanged: all non-HR authenticated users keep read access.

drop policy if exists "service_providers_create_granted" on public.service_providers;
drop policy if exists "service_providers_update_granted" on public.service_providers;
drop policy if exists "service_providers_delete_granted" on public.service_providers;

create policy "service_providers_create_granted"
  on public.service_providers
  for insert
  to authenticated
  with check (public.current_user_has_module_permission('pricing_network_partners', 'create'));

create policy "service_providers_update_granted"
  on public.service_providers
  for update
  to authenticated
  using      (public.current_user_has_module_permission('pricing_network_partners', 'edit')
              or public.current_user_has_module_permission('pricing_network_partners', 'delete'))
  with check (public.current_user_has_module_permission('pricing_network_partners', 'edit')
              or public.current_user_has_module_permission('pricing_network_partners', 'delete'));

create policy "service_providers_delete_granted"
  on public.service_providers
  for delete
  to authenticated
  using (public.current_user_has_module_permission('pricing_network_partners', 'delete'));
