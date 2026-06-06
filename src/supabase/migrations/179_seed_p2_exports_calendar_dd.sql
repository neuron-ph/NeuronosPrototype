-- NEU-020 batch 2.10c seeding (L3 day-one equivalence) — P2 fixes.
--
-- (#10) CSV/report exports were ungated download buttons; they now ride a real
--       :export cell on acct_statements / acct_journal / acct_reports. Export
--       was open to anyone who could view the page → seed export ⇐ view.
-- (#11) Editing/rescheduling a calendar event was gated by ownership ALONE; it
--       now also requires calendar:edit (matches the DD-5 own-message doctrine).
--       Anyone who could edit their own event yesterday could see the calendar,
--       so seed calendar:edit ⇐ calendar:view to preserve it.
-- Overrides reseeded unconditionally (172b lesson).

do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('acct_statements:export', 'acct_statements:view'),
      ('acct_journal:export',    'acct_journal:view'),
      ('acct_reports:export',    'acct_reports:view'),
      ('calendar:edit',          'calendar:view')
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
