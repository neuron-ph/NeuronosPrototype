-- NEU-020 batch 2.8 seeding (L3 day-one equivalence).
--
-- PART A — quotation-file lens death. The quotation file is reached from two
-- routes (/bd/inquiries → bd_inquiries, /pricing/quotations → pricing_quotations)
-- and used to pick its key from the USER's department instead of the route. Now
-- it's route-derived. Reaching a route already requires that door's :view (route
-- guard), so only create/edit/delete need preserving: a user who edited the file
-- on a route via their dept-key keeps that ability under the route-key. Seed
-- symmetrically (view rides the route guard; export already seeded in 178).
--
-- PART B — contract money doors. ContractDetailView's Invoices/Collections tabs
-- now thread their contract door key (writable, per ruling); they used the global
-- OR-fallback before. Seed the contract invoices/collections write cells from the
-- same OR-union the fallback consulted, so current writers keep writing.
-- Overrides reseeded unconditionally (172b lesson).

-- PART A: lens symmetric pairs
do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('bd_inquiries:create',       'pricing_quotations:create'),
      ('bd_inquiries:edit',         'pricing_quotations:edit'),
      ('bd_inquiries:delete',       'pricing_quotations:delete'),
      ('pricing_quotations:create', 'bd_inquiries:create'),
      ('pricing_quotations:edit',   'bd_inquiries:edit'),
      ('pricing_quotations:delete', 'bd_inquiries:delete')
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

-- PART B: contract Invoices/Collections write cells ⇐ OR-union
do $$
declare
  rule record;
  target text;
  act text;
  or_expr text;
begin
  for rule in
    select
      array['bd_contracts_invoices_tab','pricing_contracts_invoices_tab','acct_contracts_invoices_tab'] as targets,
      array['create','edit'] as actions,
      array['accounting_financials_invoices_tab','ops_bookings_invoices_tab','ops_projects_invoices_tab'] as sources
    union all select
      array['bd_contracts_collections_tab','pricing_contracts_collections_tab','acct_contracts_collections_tab'],
      array['create','edit'],
      array['accounting_financials_collections_tab','acct_collections','ops_bookings_collections_tab','ops_projects_collections_tab']
  loop
    foreach target in array rule.targets loop
      foreach act in array rule.actions loop
        select string_agg(format('(module_grants ->> %L)::boolean is true', s || ':' || act), ' or ')
          into or_expr from unnest(rule.sources) as s;
        execute format(
          'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
           where (%s) and coalesce((module_grants ->> %L)::boolean, false) is not true',
          target || ':' || act, or_expr, target || ':' || act);
        execute format(
          'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
           where (%s) and coalesce((module_grants ->> %L)::boolean, false) is not true',
          target || ':' || act, or_expr, target || ':' || act);
      end loop;
    end loop;
  end loop;
end $$;
