-- 136_backfill_booking_project_id.sql
-- NEU-013: make bookings.project_id the single source of truth for the
-- project <-> booking link, replacing the legacy projects.linked_bookings JSONB
-- array (which drifted from the column the unique index guards and the UI shows).
--
-- This backfills project_id from the legacy array, but ONLY where it is
-- unambiguous and will not violate the one-booking-per-service-per-project
-- unique index (migration 110):
--   * the referenced booking exists and currently has project_id IS NULL
--   * at most one booking per (project, service_type) is linked (newest wins)
--   * the (project, service_type) slot is not already occupied
-- Ambiguous / duplicate references are left untouched (they stay unlinked and
-- remain visible in the service module's All Bookings list).
--
-- The projects.linked_bookings column is intentionally NOT dropped here; it is
-- left in place (now unread) so this change is reversible. A follow-up migration
-- can drop it once prod is verified.

do $$
declare
  v_total int := 0;
begin
  with refs as (
    select p.id as project_id,
           (elem->>'bookingId') as booking_id
    from public.projects p
    cross join lateral jsonb_array_elements(coalesce(p.linked_bookings, '[]'::jsonb)) elem
    where elem->>'bookingId' is not null
  ),
  candidates as (
    select r.project_id, r.booking_id, b.service_type, b.created_at
    from refs r
    join public.bookings b on b.id = r.booking_id
    where b.project_id is null
  ),
  ranked as (
    select c.*,
           row_number() over (
             partition by c.project_id, c.service_type
             order by c.created_at desc nulls last
           ) as rn_slot,
           row_number() over (
             partition by c.booking_id
             order by c.created_at desc nulls last
           ) as rn_booking
    from candidates c
  ),
  eligible as (
    select rk.project_id, rk.booking_id, rk.service_type
    from ranked rk
    where rk.rn_slot = 1          -- one booking per (project, service)
      and rk.rn_booking = 1       -- one project per booking
      and not exists (
        select 1 from public.bookings b2
        where b2.project_id = rk.project_id
          and b2.service_type = rk.service_type
      )
  )
  update public.bookings b
     set project_id = e.project_id, updated_at = now()
    from eligible e
   where b.id = e.booking_id;

  get diagnostics v_total = row_count;
  raise notice 'NEU-013 backfill: linked % booking(s) to their project via bookings.project_id', v_total;
end $$;
