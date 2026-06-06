-- NEU-020 batch 2.10b seeding (L3 day-one equivalence) — P1 fixes.
--
-- (#8) Journal Edit/Reverse on a posted entry now require acct_journal:edit
--      (was the create-inclusive umbrella). Anyone who could edit/reverse
--      yesterday via a create grant must keep it → seed edit ⇐ create.
-- (#7) The quotation file's Export PDF / Quick Download now ride a real :export
--      cell on bd_inquiries / pricing_quotations (was a column that didn't
--      exist). Export was effectively open to anyone who could view the file;
--      preserve that → seed export ⇐ view.
-- (#5 ProjectBookings door, #9 OperationsTeamsSection→exec_profiling) need NO
--      seed: the project bookings door keys were already seeded (174/175), and
--      #9 only aligns the UI to existing RLS (the old key never worked at the DB).
-- Overrides reseeded unconditionally (172b lesson).

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('acct_journal:edit',         'acct_journal:create'),
      ('bd_inquiries:export',       'bd_inquiries:view'),
      ('pricing_quotations:export', 'pricing_quotations:view')
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
