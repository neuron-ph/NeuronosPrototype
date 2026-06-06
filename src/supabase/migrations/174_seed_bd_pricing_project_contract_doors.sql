-- NEU-020 batch 2.5 seeding (L3 day-one equivalence).
--
-- The dept-derived lens is dead: the project/contract permission door is now the
-- ROUTE the user entered through, not the user's own department. Before today:
--   * /bd/projects AND /pricing/projects both resolved to ops_projects_* at runtime
--     (ProjectsModule collapsed every non-Accounting user to department "BD" → "ops").
--   * /bd/contracts AND /pricing/contracts both resolved to pricing_contracts_*.
-- After today each door reads its own family. So everyone who could do X through
-- the BD or Pricing door yesterday must still be able to do X today:
--   * bd_projects_*    ⇐ ops_projects_*       (BD project door)
--   * pricing_projects_* ⇐ ops_projects_*     (Pricing project door)
--   * bd_contracts_*   ⇐ pricing_contracts_*  (BD contract door)
-- Accounting already read acct_* yesterday — unchanged, not reseeded. Each new key
-- is an exact mirror of its twin (no new capabilities), so seeding is a 1:1 copy.
--
-- Root keys (bd_projects:view, pricing_projects:view, …) are NOT seeded here: they
-- already gate the routes/sidebar and were configured before this initiative.
-- Copying the tab grants to users who lack the root key is therefore harmless —
-- they cannot open the door — while exactly preserving day-one behaviour for those
-- who can. Overrides are reseeded unconditionally (172b lesson: override-first
-- per-key resolution means override-carried source keys must seed override targets).

do $$
declare
  pair record;
  suffix text;
  proj_suffixes text[] := array[
    '_all_tab:view', '_active_tab:view', '_completed_tab:view', '_info_tab:view',
    '_quotation_tab:view',
    '_bookings_tab:view', '_bookings_tab:create', '_bookings_tab:edit',
    '_expenses_tab:view', '_expenses_tab:create', '_expenses_tab:edit',
    '_billings_tab:view', '_billings_tab:create', '_billings_tab:edit', '_billings_tab:delete',
    '_invoices_tab:view', '_invoices_tab:create', '_invoices_tab:edit',
    '_collections_tab:view', '_collections_tab:create', '_collections_tab:edit',
    '_attachments_tab:view', '_attachments_tab:create', '_attachments_tab:delete',
    '_comments_tab:view', '_comments_tab:create'
  ];
  con_suffixes text[] := array[
    '_all_tab:view', '_active_tab:view', '_expiring_tab:view',
    '_financial_overview_tab:view', '_quotation_tab:view', '_rate_card_tab:view',
    '_bookings_tab:view', '_billings_tab:view', '_invoices_tab:view',
    '_collections_tab:view', '_expenses_tab:view',
    '_attachments_tab:view', '_attachments_tab:create', '_attachments_tab:delete',
    '_comments_tab:view', '_comments_tab:create',
    '_activity_tab:view'
  ];
begin
  for pair in
    select 'bd_projects'      as target, 'ops_projects'       as source, proj_suffixes as sfx
    union all
    select 'pricing_projects' as target, 'ops_projects'       as source, proj_suffixes
    union all
    select 'bd_contracts'     as target, 'pricing_contracts'  as source, con_suffixes
  loop
    foreach suffix in array pair.sfx
    loop
      execute format(
        'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
         where (module_grants ->> %L)::boolean is true
           and coalesce((module_grants ->> %L)::boolean, false) is not true',
        pair.target || suffix, pair.source || suffix, pair.target || suffix
      );
      execute format(
        'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
         where (module_grants ->> %L)::boolean is true
           and coalesce((module_grants ->> %L)::boolean, false) is not true',
        pair.target || suffix, pair.source || suffix, pair.target || suffix
      );
    end loop;
  end loop;
end $$;
