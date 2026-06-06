-- NEU-020 batch 2.6 seeding (L3 day-one equivalence) — DD-11/DD-12, additive.
--
-- Batch 2.6 threads the project money tabs (Billings/Invoices/Collections/
-- Expenses) to their per-DOOR keys (PROJECT_MODULE_IDS[door].*) and gives the
-- Accounting project window its own write cells (DD-12). It also gates the
-- Financials room's Create Invoice / Add Collection buttons on the room's own
-- create cells. Until today every one of those write surfaces was governed by a
-- GLOBAL OR-gate — holding ANY one of a handful of keys granted the write
-- EVERYWHERE. So preserving day-one means: each per-door write key must be true
-- for anyone for whom the matching OR-gate was true. This is not an escalation
-- (the master key already made it global); it just makes each door carry the
-- grant the OR carried implicitly. Admins can tighten per-door afterwards.
--
-- The OR-unions below are copied verbatim from the four Unified*Tab gates.
-- The master key acct_financials is NOT retired here (the OR-gate fallback
-- stays); that final cross-cutting step waits on the contract money-write
-- ruling. Overrides are reseeded unconditionally (172b lesson).

do $$
declare
  rule record;
  target text;
  act text;
  or_expr text;
begin
  for rule in
    -- (targets, action-set, OR-union sources) — one row per tab-type
    select
      array[
        'bd_projects_billings_tab','pricing_projects_billings_tab',
        'ops_projects_billings_tab','acct_projects_billings_tab',
        'accounting_financials_billings_tab'
      ] as targets,
      array['create','edit','delete'] as actions,
      array[
        'acct_financials','accounting_financials_billings_tab','acct_billings',
        'ops_bookings_billings_tab','ops_projects_billings_tab'
      ] as sources
    union all select
      array[
        'bd_projects_invoices_tab','pricing_projects_invoices_tab',
        'ops_projects_invoices_tab','acct_projects_invoices_tab',
        'accounting_financials_invoices_tab'
      ],
      array['create','edit'],
      array[
        'acct_financials','accounting_financials_invoices_tab',
        'ops_bookings_invoices_tab','ops_projects_invoices_tab'
      ]
    union all select
      array[
        'bd_projects_collections_tab','pricing_projects_collections_tab',
        'ops_projects_collections_tab','acct_projects_collections_tab',
        'accounting_financials_collections_tab'
      ],
      array['create','edit'],
      array[
        'acct_financials','accounting_financials_collections_tab','acct_collections',
        'ops_bookings_collections_tab','ops_projects_collections_tab'
      ]
    union all select
      array[
        'bd_projects_expenses_tab','pricing_projects_expenses_tab',
        'ops_projects_expenses_tab','acct_projects_expenses_tab'
      ],
      array['create','edit'],
      array[
        'acct_financials','acct_expenses',
        'ops_bookings_expenses_tab','ops_projects_expenses_tab'
      ]
  loop
    foreach target in array rule.targets
    loop
      foreach act in array rule.actions
      loop
        -- "(module_grants->>'src1:act')::boolean is true or (… 'src2:act' …) or …"
        -- module_grants is the unqualified column on whichever table we update.
        select string_agg(
                 format('(module_grants ->> %L)::boolean is true', s || ':' || act),
                 ' or ')
          into or_expr
          from unnest(rule.sources) as s;

        execute format(
          'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
           where (%s) and coalesce((module_grants ->> %L)::boolean, false) is not true',
          target || ':' || act, or_expr, target || ':' || act
        );
        execute format(
          'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
           where (%s) and coalesce((module_grants ->> %L)::boolean, false) is not true',
          target || ':' || act, or_expr, target || ':' || act
        );
      end loop;
    end loop;
  end loop;
end $$;
