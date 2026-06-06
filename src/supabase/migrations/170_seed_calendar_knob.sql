-- NEU-019 WG-07 (D2 + D5): seed the new calendar knob.
-- Calendar had no permission knob at all — every user could view, create, and
-- (the bug) edit/delete ANYONE's events. Mirror current reality: every profile
-- gets view/create/edit/delete. The behavior change ships in code, not grants:
-- edit/delete are now ownership-scoped (own events only) in useCalendarEvents.

update access_profiles
set module_grants = module_grants || '{
      "calendar:view": true,
      "calendar:create": true,
      "calendar:edit": true,
      "calendar:delete": true
    }'::jsonb,
    updated_at = now()
where coalesce((module_grants ->> 'calendar:view')::boolean, false) is not true;

-- Overrides resolve before profiles per-key, so profile seeding suffices for
-- everyone with a profile; also seed override-only users (no profile assigned).
update permission_overrides po
set module_grants = po.module_grants || '{
      "calendar:view": true,
      "calendar:create": true,
      "calendar:edit": true,
      "calendar:delete": true
    }'::jsonb,
    updated_at = now()
from users u
where po.user_id = u.id::text
  and u.access_profile_id is null
  and coalesce((po.module_grants ->> 'calendar:view')::boolean, false) is not true;
