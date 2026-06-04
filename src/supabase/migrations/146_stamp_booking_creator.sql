-- NEU-012 Contract #6 (Record visibility / Layer 2), Slice 1 — STRICT.
--
-- Root bug: the app creates a booking with `insert().select()` (write + read-back
-- as one atomic move). The panels never set `created_by`, so the new row is
-- "owned by no one". A staff user's "own"-scope record visibility then forbids
-- reading back the row they just created -> the whole insert rolls back (42501
-- "new row violates row-level security policy"). Nothing is saved. Managers were
-- unaffected (department/all scope), so it only bit staff.
--
-- Fix: stamp the creator. A BEFORE INSERT trigger fills `created_by` from the
-- logged-in user when it's blank — covering every create path (5 booking panels +
-- project flow + future) in one place. It only fills when blank, so it never
-- overrides an explicit value, and service-role inserts (no auth.uid()) stay null.

create or replace function public.set_created_by_from_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.created_by is null or new.created_by = '' then
    new.created_by := (select u.id from public.users u where u.auth_id = auth.uid() limit 1);
  end if;
  return new;
end;
$function$;

drop trigger if exists bookings_stamp_creator on public.bookings;
create trigger bookings_stamp_creator
  before insert on public.bookings
  for each row execute function public.set_created_by_from_auth();
