-- NEU-020 batch 2.7 seeding (L3 day-one equivalence) — DD-5 inbox five-way split.
--
-- Until today a single inbox:edit switch carried five distinct powers: editing
-- your own message, closing/archiving tickets, assigning/reassigning queue
-- tickets, advancing status / marking done / reopening, and accepting/declining
-- approvals. NEU-020 2.7 gives each its own switch:
--   retract own message      → inbox:edit            (unchanged — the source)
--   close / archive ticket   → inbox:delete
--   approval accept/decline  → inbox:approve
--   assign / reassign        → inbox_queue_tab:edit
--   status / mark done / reopen → inbox_inbox_tab:edit
-- So everyone who held inbox:edit yesterday must hold all five today, or they
-- silently lose powers they had. Seed the four new homes ⇐ inbox:edit.
--
-- RLS (tickets UPDATE policy) still checks inbox:edit until the Phase-4 DB pass;
-- because every new-key holder here also holds inbox:edit, RLS still passes.
-- Overrides reseeded unconditionally (172b lesson).

do $$
declare
  target text;
begin
  foreach target in array array[
    'inbox:delete', 'inbox:approve', 'inbox_inbox_tab:edit', 'inbox_queue_tab:edit'
  ]
  loop
    execute format(
      'update access_profiles set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      target, 'inbox:edit', target
    );
    execute format(
      'update permission_overrides set module_grants = module_grants || jsonb_build_object(%L, true), updated_at = now()
       where (module_grants ->> %L)::boolean is true
         and coalesce((module_grants ->> %L)::boolean, false) is not true',
      target, 'inbox:edit', target
    );
  end loop;
end $$;
