-- NEU-020 batch 2.11 seeding (L3 day-one equivalence) — Phase 5 acceptance fixes.
--
-- WT4: the project/contract Quotation tab's "Print PDF" is now export-class,
--      gated on the Quotation tab's :export cell (was ungated). Printing was
--      open to anyone who could view the tab → seed export ⇐ view.
-- WT2: delete-class billing actions (void item, delete category, delete line)
--      now obey the Billings :delete cell (were on the create/edit write gate).
--      Anyone who could do them via edit yesterday must keep them → seed
--      each billings door's :delete ⇐ its :edit.
-- Overrides reseeded unconditionally (172b lesson).

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      -- WT4: quotation Print PDF export ⇐ view
      ('bd_projects_quotation_tab:export',       'bd_projects_quotation_tab:view'),
      ('pricing_projects_quotation_tab:export',  'pricing_projects_quotation_tab:view'),
      ('ops_projects_quotation_tab:export',      'ops_projects_quotation_tab:view'),
      ('acct_projects_quotation_tab:export',     'acct_projects_quotation_tab:view'),
      ('bd_contracts_quotation_tab:export',      'bd_contracts_quotation_tab:view'),
      ('pricing_contracts_quotation_tab:export', 'pricing_contracts_quotation_tab:view'),
      ('acct_contracts_quotation_tab:export',    'acct_contracts_quotation_tab:view'),
      -- WT2: billings delete-class ⇐ edit (same door)
      ('pricing_others_billings_tab:delete',        'pricing_others_billings_tab:edit'),
      ('bd_projects_billings_tab:delete',           'bd_projects_billings_tab:edit'),
      ('pricing_projects_billings_tab:delete',      'pricing_projects_billings_tab:edit'),
      ('ops_forwarding_billings_tab:delete',        'ops_forwarding_billings_tab:edit'),
      ('ops_brokerage_billings_tab:delete',         'ops_brokerage_billings_tab:edit'),
      ('ops_trucking_billings_tab:delete',          'ops_trucking_billings_tab:edit'),
      ('ops_marine_insurance_billings_tab:delete',  'ops_marine_insurance_billings_tab:edit'),
      ('ops_others_billings_tab:delete',            'ops_others_billings_tab:edit'),
      ('ops_projects_billings_tab:delete',          'ops_projects_billings_tab:edit'),
      ('accounting_financials_billings_tab:delete', 'accounting_financials_billings_tab:edit'),
      ('acct_projects_billings_tab:delete',         'acct_projects_billings_tab:edit')
    ) as t(target, source)
  loop
    execute format(
      'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      pair.target, pair.source, pair.target);
    execute format(
      'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      pair.target, pair.source, pair.target);
  end loop;
end $$;
