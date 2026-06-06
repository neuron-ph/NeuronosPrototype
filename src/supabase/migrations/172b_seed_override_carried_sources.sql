-- 172 follow-up: users whose OR-arm source keys live in their personal OVERRIDE
-- (while also having a profile) were missed — the per-key resolution is
-- override-first, so their capability came from the override row. Re-run the
-- same mapping sourcing from permission_overrides' own keys, for ALL override rows.
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
      select string_agg('(po.module_grants ->> ' || quote_literal(src) || ')::boolean is true', ' or ')
        into cond
        from unnest(pair.sources) as src;

      sql := format(
        'update permission_overrides po set module_grants = po.module_grants || jsonb_build_object(%L, true), updated_at = now() where (%s) and coalesce((po.module_grants ->> %L)::boolean, false) is not true',
        'ops_' || svc || '_' || pair.target_suffix, cond, 'ops_' || svc || '_' || pair.target_suffix
      );
      execute sql;
    end loop;
  end loop;
end $$;
