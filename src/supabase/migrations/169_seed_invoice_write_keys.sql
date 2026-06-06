-- NEU-019 WG-06 seeding (D5: mirror current reality).
-- The invoice lifecycle (create draft / finalize / void) was ungated, so the
-- accounting_financials_invoices_tab create/edit keys were decorative and
-- never curated — gating without seeding would lock out 8 of 10 Accounting
-- users who do this work today. Seed create+edit to every profile/override
-- that already grants the tab's view. Delete is NOT seeded (stays with the
-- 2 acct_financials:delete holders — tighter, intentional).

update access_profiles
set module_grants = module_grants
      || '{"accounting_financials_invoices_tab:create": true, "accounting_financials_invoices_tab:edit": true}'::jsonb,
    updated_at = now()
where (module_grants ->> 'accounting_financials_invoices_tab:view')::boolean is true
  and (coalesce((module_grants ->> 'accounting_financials_invoices_tab:create')::boolean, false) is not true
    or coalesce((module_grants ->> 'accounting_financials_invoices_tab:edit')::boolean, false) is not true);

update permission_overrides
set module_grants = module_grants
      || '{"accounting_financials_invoices_tab:create": true, "accounting_financials_invoices_tab:edit": true}'::jsonb,
    updated_at = now()
where (module_grants ->> 'accounting_financials_invoices_tab:view')::boolean is true
  and (coalesce((module_grants ->> 'accounting_financials_invoices_tab:create')::boolean, false) is not true
    or coalesce((module_grants ->> 'accounting_financials_invoices_tab:edit')::boolean, false) is not true);
