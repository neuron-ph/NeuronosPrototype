-- ============================================================================
-- 129: Access Profiles — is_baseline flag (seed templates)
-- ============================================================================
-- Baseline "seed" profiles drive the auto-prefill in the Access Profile creator
-- (keyed by department + role + service). They must NOT appear in the normal
-- profiles list — they're templates, not user-managed profiles.
--
-- A baseline is uniquely identified by (target_department, target_role,
-- target_service). target_service is only meaningful for Operations; null
-- elsewhere. The partial unique index enforces one baseline per combination.
--
-- Prerequisites:
--   048_access_profiles.sql — access_profiles
--   128_access_profiles_target_service.sql — target_service column
-- ============================================================================

ALTER TABLE public.access_profiles
  ADD COLUMN IF NOT EXISTS is_baseline boolean NOT NULL DEFAULT false;

-- One baseline per (department, role, service). COALESCE so NULLs compare equal
-- (Postgres treats NULLs as distinct in unique indexes by default).
CREATE UNIQUE INDEX IF NOT EXISTS access_profiles_baseline_combo_unique_idx
  ON public.access_profiles (
    COALESCE(target_department, ''),
    COALESCE(target_role, ''),
    COALESCE(target_service, '')
  )
  WHERE is_baseline;

CREATE INDEX IF NOT EXISTS access_profiles_is_baseline_idx
  ON public.access_profiles (is_baseline);
