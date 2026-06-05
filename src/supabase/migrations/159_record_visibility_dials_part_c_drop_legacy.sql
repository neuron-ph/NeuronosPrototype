-- NEU-012 Contract #6 Slice 1 — Part C. Drop the legacy department-array
-- visibility functions (now unreferenced — all 30 policies flipped in 158) and
-- the temporary migration helper.

drop function if exists public.current_user_can_view_record(text, text[]);
drop function if exists public.current_user_can_view_booking(text, text, text, text);
drop function if exists public._map_legacy_scope(text);
