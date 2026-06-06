-- NEU-020 batch 2.3 seeding (L3 day-one equivalence).
-- DD-1 split the shared ops_bookings_* booking-detail keys into per-service
-- door keys (ops_{svc}_{child}_tab). Every new key is granted wherever the key
-- (or OR-gate union) that governed that surface YESTERDAY is granted, so no
-- user loses any capability they exercised through any service door:
--   * info/expenses view <= ops_{svc}:view  (those tab buttons were unconditional)
--   * child views        <= shared ops_bookings_*_tab:view (+ the accounting
--                           OR-arms that the detail pages used to consult)
--   * money writes       <= the NEU-017 OR-gate unions (incl. legacy acct_* keys)
--   * billings delete    <= the write union (the delete UI rode the write gate)
--   * invoices delete    <= the accounting delete keys (today's void/draft-delete)
--   * invoices export    <= the view sources (PDF/Print rode view until DD-3)

do $$
declare
  svc text;
  pair record;
  cond text;
  sql text;
begin
  foreach svc in array array['forwarding','brokerage','trucking','marine_insurance','others']
  loop
    for pair in
      select * from (values
        ('info_tab:view',         array['ops_' || svc || ':view']),
        ('expenses_tab:view',     array['ops_' || svc || ':view']),
        ('billings_tab:view',     array['ops_bookings_billings_tab:view']),
        ('invoices_tab:view',     array['ops_bookings_invoices_tab:view','accounting_bookings_invoices_tab:view']),
        ('collections_tab:view',  array['ops_bookings_collections_tab:view','accounting_bookings_collections_tab:view']),
        ('comments_tab:view',     array['ops_bookings_comments_tab:view']),
        ('comments_tab:create',   array['ops_bookings_comments_tab:create']),
        ('chrono_tab:view',       array['ops_bookings_chrono_tab:view']),
        ('chrono_tab:create',     array['ops_bookings_chrono_tab:create']),
        ('chrono_tab:edit',       array['ops_bookings_chrono_tab:edit']),
        ('chrono_tab:delete',     array['ops_bookings_chrono_tab:delete']),
        ('billings_tab:create',   array['acct_financials:create','acct_financials:edit','accounting_financials_billings_tab:create','accounting_financials_billings_tab:edit','acct_billings:create','acct_billings:edit','ops_bookings_billings_tab:create','ops_bookings_billings_tab:edit','ops_projects_billings_tab:create','ops_projects_billings_tab:edit']),
        ('billings_tab:edit',     array['acct_financials:create','acct_financials:edit','accounting_financials_billings_tab:create','accounting_financials_billings_tab:edit','acct_billings:create','acct_billings:edit','ops_bookings_billings_tab:create','ops_bookings_billings_tab:edit','ops_projects_billings_tab:create','ops_projects_billings_tab:edit']),
        ('billings_tab:delete',   array['acct_financials:create','acct_financials:edit','accounting_financials_billings_tab:create','accounting_financials_billings_tab:edit','acct_billings:create','acct_billings:edit','ops_bookings_billings_tab:create','ops_bookings_billings_tab:edit','ops_bookings_billings_tab:delete','ops_projects_billings_tab:create','ops_projects_billings_tab:edit']),
        ('invoices_tab:create',   array['acct_financials:create','acct_financials:edit','accounting_financials_invoices_tab:create','accounting_financials_invoices_tab:edit','ops_bookings_invoices_tab:create','ops_bookings_invoices_tab:edit','ops_projects_invoices_tab:create','ops_projects_invoices_tab:edit']),
        ('invoices_tab:edit',     array['acct_financials:create','acct_financials:edit','accounting_financials_invoices_tab:create','accounting_financials_invoices_tab:edit','ops_bookings_invoices_tab:create','ops_bookings_invoices_tab:edit','ops_projects_invoices_tab:create','ops_projects_invoices_tab:edit']),
        ('invoices_tab:delete',   array['acct_financials:delete','accounting_financials_invoices_tab:delete']),
        ('invoices_tab:export',   array['ops_bookings_invoices_tab:view','accounting_bookings_invoices_tab:view']),
        ('collections_tab:create',array['acct_financials:create','acct_financials:edit','accounting_financials_collections_tab:create','accounting_financials_collections_tab:edit','acct_collections:create','acct_collections:edit','ops_bookings_collections_tab:create','ops_bookings_collections_tab:edit','ops_projects_collections_tab:create','ops_projects_collections_tab:edit']),
        ('collections_tab:edit',  array['acct_financials:create','acct_financials:edit','accounting_financials_collections_tab:create','accounting_financials_collections_tab:edit','acct_collections:create','acct_collections:edit','ops_bookings_collections_tab:create','ops_bookings_collections_tab:edit','ops_projects_collections_tab:create','ops_projects_collections_tab:edit']),
        ('expenses_tab:create',   array['acct_financials:create','acct_financials:edit','acct_expenses:create','acct_expenses:edit','ops_bookings_expenses_tab:create','ops_bookings_expenses_tab:edit','ops_projects_expenses_tab:create','ops_projects_expenses_tab:edit']),
        ('expenses_tab:edit',     array['acct_financials:create','acct_financials:edit','acct_expenses:create','acct_expenses:edit','ops_bookings_expenses_tab:create','ops_bookings_expenses_tab:edit','ops_projects_expenses_tab:create','ops_projects_expenses_tab:edit'])
      ) as t(target_suffix, sources)
    loop
      -- build OR-condition over the source keys
      select string_agg('(module_grants ->> ' || quote_literal(src) || ')::boolean is true', ' or ')
        into cond
        from unnest(pair.sources) as src;

      sql := format(
        'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now() where (%s) and coalesce((module_grants ->> %L)::boolean, false) is not true',
        'ops_' || svc || '_' || pair.target_suffix, cond, 'ops_' || svc || '_' || pair.target_suffix
      );
      execute sql;

      sql := format(
        'update permission_overrides po set module_grants = po.module_grants || jsonb_build_object(%L, true), updated_at = now() from users u where po.user_id = u.id::text and u.access_profile_id is null and (%s) and coalesce((po.module_grants ->> %L)::boolean, false) is not true',
        'ops_' || svc || '_' || pair.target_suffix,
        replace(cond, 'module_grants', 'po.module_grants'),
        'ops_' || svc || '_' || pair.target_suffix
      );
      execute sql;
    end loop;
  end loop;
end $$;

-- 172b follow-up (applied to dev as 172b_seed_override_carried_sources):
-- users whose OR-arm source keys live in their personal OVERRIDE while also
-- holding a profile were missed by the override-only pass above (override-first
-- per-key resolution gave them the capability). The same mapping was re-run
-- against ALL permission_overrides rows sourcing from the override keys.
-- Post-check: zero users hold any old OR-arm without the new per-service keys.
