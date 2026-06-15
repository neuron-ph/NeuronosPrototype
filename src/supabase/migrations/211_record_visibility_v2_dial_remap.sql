-- Record Visibility V2 — Phase 3a: dial remap + contained exec-role normalization.
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (§2, §8 Phase 3, §9, §10.2).
--
-- MUST run before the Phase 3b policy flip (212). In V2 'everything' = all-records
-- (sees restricted); the 5 in-scope types are currently 'everything' for EVERYONE
-- (from the 2026-06-15 blunt fix). This remaps non-execs down to 'org_wide'
-- (all non-restricted + closure) and keeps execs at 'everything'. Idempotent.
--
-- Exec identity = department = 'Executive' (= is_executive()). Execs have no
-- access_profile (null) and are governed by their permission_overrides; all 6 have one.

-- 0. Contained exec-role normalization (V2 never reads role). Dev already 0 rows;
--    this line is what carries it to prod at release. Marcus -> 'manager'.
update public.users set role = 'manager' where role = 'executive';

-- 1. Profiles (used only by non-execs) -> org_wide for the 5 in-scope keys.
update public.access_profiles ap
set visibility_scopes = ap.visibility_scopes || jsonb_build_object(
  'contacts','org_wide','customers','org_wide','quotations','org_wide',
  'contracts','org_wide','projects','org_wide')
where ap.visibility_scopes ?| array['contacts','customers','quotations','contracts','projects'];

-- 2. Non-exec overrides -> org_wide.
update public.permission_overrides po
set visibility_scopes = po.visibility_scopes || jsonb_build_object(
  'contacts','org_wide','customers','org_wide','quotations','org_wide',
  'contracts','org_wide','projects','org_wide')
from public.users u
where u.id = po.user_id
  and u.department is distinct from 'Executive'
  and po.visibility_scopes ?| array['contacts','customers','quotations','contracts','projects'];

-- 3. Exec overrides -> everything (all-records tier), ensured present.
update public.permission_overrides po
set visibility_scopes = po.visibility_scopes || jsonb_build_object(
  'contacts','everything','customers','everything','quotations','everything',
  'contracts','everything','projects','everything')
from public.users u
where u.id = po.user_id and u.department = 'Executive';
