-- NEU-012 Contract #6 cleanup. The block-higher-rank visibility mechanism is
-- dead end-to-end: the new dial resolver (current_user_can_view_record/_booking,
-- migrations 157-159) never consults it, no RLS policy references the legacy
-- can_access_* family, and the app toggle is removed. Drop the closed orphaned
-- function cluster (verified: nothing outside it references these). The generic
-- org_settings table is left intact.

drop function if exists public.can_access_record(text);
drop function if exists public.can_access_booking(text, text, text, text, text, text);
drop function if exists public.can_access_task(text, text);
drop function if exists public.get_org_block_higher_rank();
