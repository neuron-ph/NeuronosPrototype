-- ============================================================================
-- 128: Access Profiles — add target_service tag
-- ============================================================================
-- Adds a nullable `target_service` column to access_profiles. When a profile's
-- target_department is "Operations", this records which operations service the
-- profile targets (Brokerage, Forwarding, Trucking, Marine Insurance, Others).
--
-- It is a descriptive label only — same as target_department / target_role.
-- Null = "Any service". No enum constraint, consistent with the sibling text
-- columns (department/role are free text).
--
-- Groundwork for the auto-prefill feature that keys baseline grants on the
-- (department, role, service) combination.
--
-- Prerequisites:
--   048_access_profiles.sql — creates public.access_profiles
-- ============================================================================

ALTER TABLE public.access_profiles
  ADD COLUMN IF NOT EXISTS target_service text;
