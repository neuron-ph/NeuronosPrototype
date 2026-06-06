-- NEU-012 Contract #6 (Record visibility / Layer 2), Slice 1 — sweep.
--
-- Same create-then-read-back bug class as bookings (migration 146): these tables
-- have a text `created_by`, their SELECT policy enforces own-scope on it
-- (current_user_can_view_record(created_by, ...)), and the app inserts with
-- read-back. A staff creator who isn't stamped can't read back their own new row.
-- Reuse the set_created_by_from_auth() trigger fn from 146. Additive (fills only
-- when blank), so no existing insert path changes.

drop trigger if exists collections_stamp_creator on public.collections;
create trigger collections_stamp_creator
  before insert on public.collections
  for each row execute function public.set_created_by_from_auth();

drop trigger if exists evouchers_stamp_creator on public.evouchers;
create trigger evouchers_stamp_creator
  before insert on public.evouchers
  for each row execute function public.set_created_by_from_auth();

drop trigger if exists expenses_stamp_creator on public.expenses;
create trigger expenses_stamp_creator
  before insert on public.expenses
  for each row execute function public.set_created_by_from_auth();

drop trigger if exists invoices_stamp_creator on public.invoices;
create trigger invoices_stamp_creator
  before insert on public.invoices
  for each row execute function public.set_created_by_from_auth();

drop trigger if exists quotations_stamp_creator on public.quotations;
create trigger quotations_stamp_creator
  before insert on public.quotations
  for each row execute function public.set_created_by_from_auth();
