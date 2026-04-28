-- 069_retire_legacy_team_tables.sql
--
-- Drops legacy team profile tables that were superseded by the canonical
-- assignment_profiles / assignment_profile_items tables in migration 067.
--
-- Safe to run after 067 because:
--   • 067 backfills all legacy data into the canonical tables before this runs
--   • The app resolver no longer reads these tables (legacy fallback removed)
--   • booking_assignments is the runtime source of truth (not affected here)
--
-- Applied to dev Supabase on 2026-04-28 via MCP.

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
