-- 069_retire_legacy_team_tables.sql
--
-- APPLY MANUALLY after QA confirms all reads/writes have moved to canonical tables.
-- Preconditions before applying:
--   1. assignment_profiles + assignment_profile_items have been verified to contain all needed data
--   2. No app code reads from customer_team_profiles, contact_team_overrides, or client_handler_preferences
--   3. The resolver no longer has legacy fallback (done in resolveAssignmentProfile.ts)
--   4. QA signoff complete
--
-- This migration is intentionally NOT applied automatically.

-- ─── Drop legacy team profile tables ─────────────────────────────────────────

DROP TABLE IF EXISTS public.contact_team_overrides CASCADE;
DROP TABLE IF EXISTS public.customer_team_profiles CASCADE;
DROP TABLE IF EXISTS public.client_handler_preferences CASCADE;

-- ─── Drop legacy assignment_default_* tables (superseded by assignment_profiles) ─

DROP TABLE IF EXISTS public.assignment_default_items CASCADE;
DROP TABLE IF EXISTS public.assignment_default_profiles CASCADE;

-- ─── Note on users.team_id / users.team_role ─────────────────────────────────
-- These legacy projection columns are kept for now because:
--   1. They are still synced by syncLegacyUserTeamProjection in teamMemberships.ts
--   2. The Users list still displays them in the Team / Team Role columns
--   3. Some external queries may depend on them
--
-- To drop them later, after verifying no code reads them:
--   ALTER TABLE public.users DROP COLUMN IF EXISTS team_id;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS team_role;
