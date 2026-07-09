-- 235_invoice_builder_tab_grants.sql
--
-- Bug: non-Executive users see an EMPTY invoice builder — no selectable billing
-- lines, ₱0.00 invoice — even on bookings that have saved billings.
--
-- Cause: the invoice Builder sub-tabs (Items / Details / Legal / Settings) are
-- gated in InvoiceBuilder.tsx on the module keys ops_invoices_items_tab /
-- ops_invoices_details_tab / ops_invoices_legal_tab / ops_invoices_settings_tab.
-- Those four tab grants only cascade from `ops_projects:view` (see migration
-- 198). But the invoice builder is opened from ~16 different Invoices tabs
-- (per-service Ops, Accounting, Pricing, BD, Projects, Contracts). Anyone whose
-- Invoices access did NOT flow through ops_projects:view — Accounting Staff,
-- Pricing, per-service Ops — got the outer Invoices tab but an empty builder.
-- Only the "Baseline — Executive" profile carried the four grants, so only
-- Executives (4 of 60 users) could build invoices.
--
-- Fix: complete the cascade. The builder follows EVERY invoices-tab-view door,
-- materialized at write time (consistent with how every other tab grant works),
-- then re-materialize existing profiles + user overrides so the grants become
-- explicit and visible-checked in the Access Configuration matrix.
--
-- View-only invoice users gain only VIEW of the builder sub-tabs; the write gate
-- stays the outer invoices door's create/edit, unchanged.

begin;

-- 1. Complete the cascade map: each invoices-tab-view door → the 4 builder tabs.
insert into public.access_cascade_edges (parent_key, child_key)
select p.parent_key, c.child_key
from (values
  ('accounting_bookings_invoices_tab:view'),
  ('accounting_financials_invoices_tab:view'),
  ('acct_contracts_invoices_tab:view'),
  ('acct_projects_invoices_tab:view'),
  ('bd_contracts_invoices_tab:view'),
  ('bd_projects_invoices_tab:view'),
  ('ops_bookings_invoices_tab:view'),
  ('ops_brokerage_invoices_tab:view'),
  ('ops_forwarding_invoices_tab:view'),
  ('ops_marine_insurance_invoices_tab:view'),
  ('ops_others_invoices_tab:view'),
  ('ops_projects_invoices_tab:view'),
  ('ops_trucking_invoices_tab:view'),
  ('pricing_contracts_invoices_tab:view'),
  ('pricing_others_invoices_tab:view'),
  ('pricing_projects_invoices_tab:view')
) as p(parent_key)
cross join (values
  ('ops_invoices_items_tab:view'),
  ('ops_invoices_details_tab:view'),
  ('ops_invoices_legal_tab:view'),
  ('ops_invoices_settings_tab:view')
) as c(child_key)
on conflict (parent_key, child_key) do nothing;

-- 2. Re-materialize existing profile templates so re-applying a profile keeps
--    the builder grants (and so they show checked in the matrix UI).
update public.access_profiles
   set module_grants = public.materialize_grant_cascade(module_grants)
 where module_grants is not null;

-- 3. Re-materialize live per-user grants so already-provisioned users (MC et al.)
--    immediately gain the builder without needing a profile re-apply.
update public.permission_overrides
   set module_grants = public.materialize_grant_cascade(module_grants)
 where module_grants is not null;

commit;
