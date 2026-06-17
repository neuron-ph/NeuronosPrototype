-- 219_backfill_booking_team_name_canonical.sql
--
-- bookings.team_name is a denormalized display copy of teams.name. Over time it
-- drifted (e.g. "Team Jobert" vs the canonical "TEAM JOBERT"), leaving the same
-- team showing under multiple labels. Visibility keys on team_id (uuid), so this
-- never affected access -- it's purely cosmetic -- but the inconsistent labels are
-- confusing in lists and filters.
--
-- Re-sync every booking's team_name to the canonical teams.name. Idempotent:
-- re-running changes nothing once aligned. team_id is the source of truth; rows
-- with a null team_id are left untouched (no team to copy from).

update public.bookings b
set team_name = t.name
from public.teams t
where b.team_id = t.id
  and b.team_name is distinct from t.name;
