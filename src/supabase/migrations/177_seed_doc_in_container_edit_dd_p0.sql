-- NEU-020 batch 2.10a seeding (L3 day-one equivalence) — P0 document-in-container.
--
-- The core-sentence audit found that amending a document inside a container was
-- gated by the CONTAINER's root edit key, leaving the document tab's own Edit
-- cell dead ("the grid lies"). Fixed by re-keying each affordance to the tab's
-- own *_tab:edit cell:
--   * project Quotation amend/save  → *_projects_quotation_tab:edit
--   * contract Quotation amend/save  → *_contracts_quotation_tab:edit
--   * booking Info edit/save (×5)    → ops_<svc>_info_tab:edit (+ pricing_others)
-- So everyone who could amend/edit yesterday (via the root edit key) must hold
-- the tab edit cell today. Seed each tab:edit ⇐ its governing root:edit.
-- Overrides reseeded unconditionally (172b lesson).

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('bd_projects_quotation_tab:edit',        'bd_projects:edit'),
      ('pricing_projects_quotation_tab:edit',   'pricing_projects:edit'),
      ('ops_projects_quotation_tab:edit',       'ops_projects:edit'),
      ('acct_projects_quotation_tab:edit',      'acct_projects:edit'),
      ('bd_contracts_quotation_tab:edit',       'bd_contracts:edit'),
      ('pricing_contracts_quotation_tab:edit',  'pricing_contracts:edit'),
      ('acct_contracts_quotation_tab:edit',     'acct_contracts:edit'),
      ('ops_forwarding_info_tab:edit',          'ops_forwarding:edit'),
      ('ops_brokerage_info_tab:edit',           'ops_brokerage:edit'),
      ('ops_trucking_info_tab:edit',            'ops_trucking:edit'),
      ('ops_marine_insurance_info_tab:edit',    'ops_marine_insurance:edit'),
      ('ops_others_info_tab:edit',              'ops_others:edit'),
      ('pricing_others_info_tab:edit',          'ops_others:edit')
    ) as t(target, source)
  loop
    execute format(
      'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      pair.target, pair.source, pair.target
    );
    execute format(
      'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      pair.target, pair.source, pair.target
    );
  end loop;
end $$;
