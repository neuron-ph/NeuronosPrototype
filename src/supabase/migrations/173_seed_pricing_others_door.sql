-- NEU-020 batch 2.4 seeding (L3 day-one equivalence).
-- DD-2 split the Others module's Pricing appearance into its own key family
-- (pricing_others*). Every key mirrors its ops_others* twin, so everyone who
-- could use Others through the Pricing sidebar yesterday can today.

do $$
declare
  suffix text;
begin
  foreach suffix in array array[
    ':view', ':create', ':edit', ':delete',
    '_all_tab:view', '_my_tab:view', '_draft_tab:view',
    '_in_progress_tab:view', '_completed_tab:view', '_cancelled_tab:view',
    '_info_tab:view',
    '_billings_tab:view', '_billings_tab:create', '_billings_tab:edit', '_billings_tab:delete',
    '_invoices_tab:view', '_invoices_tab:create', '_invoices_tab:edit', '_invoices_tab:delete', '_invoices_tab:export',
    '_collections_tab:view', '_collections_tab:create', '_collections_tab:edit',
    '_expenses_tab:view', '_expenses_tab:create', '_expenses_tab:edit',
    '_comments_tab:view', '_comments_tab:create',
    '_chrono_tab:view', '_chrono_tab:create', '_chrono_tab:edit', '_chrono_tab:delete'
  ]
  loop
    execute format(
      'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      'pricing_others' || suffix, 'ops_others' || suffix, 'pricing_others' || suffix
    );
    execute format(
      'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      'pricing_others' || suffix, 'ops_others' || suffix, 'pricing_others' || suffix
    );
  end loop;
end $$;
