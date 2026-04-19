-- ============================================================================
-- 048: Access Profiles — saved permission templates for RBAC
-- ============================================================================
-- Adds a new `access_profiles` table for storing named permission presets.
-- Admins can apply a profile to a user as a one-time snapshot copy of its
-- module_grants. The `applied_profile_id` column on `permission_overrides`
-- is display/audit metadata only — not a live link.
--
-- Prerequisites:
--   018_rbac_teams_and_roles.sql — permission_overrides, set_updated_at()
--   019_rbac_rls_v2.sql          — is_executive()
-- ============================================================================

-- ============================================================================
-- STEP 1: Create access_profiles table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_profiles (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  description        text,
  target_department  text,
  target_role        text,
  module_grants      jsonb       NOT NULL DEFAULT '{}',
  is_active          boolean     NOT NULL DEFAULT true,
  created_by         text        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by         text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_profiles_name_not_blank
    CHECK (length(trim(name)) > 0),
  CONSTRAINT access_profiles_module_grants_object
    CHECK (jsonb_typeof(module_grants) = 'object')
);

-- Case-insensitive unique index on name
CREATE UNIQUE INDEX IF NOT EXISTS access_profiles_name_unique_idx
  ON public.access_profiles (lower(name));

-- Auto-update updated_at on every row update
DROP TRIGGER IF EXISTS access_profiles_updated_at ON public.access_profiles;
CREATE TRIGGER access_profiles_updated_at
  BEFORE UPDATE ON public.access_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- STEP 2: Add applied_profile_id to permission_overrides
-- ============================================================================

ALTER TABLE public.permission_overrides
  ADD COLUMN IF NOT EXISTS applied_profile_id uuid
    REFERENCES public.access_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS permission_overrides_applied_profile_id_idx
  ON public.permission_overrides(applied_profile_id);

-- ============================================================================
-- STEP 3: RLS for access_profiles
-- ============================================================================

ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

-- Only Executive users can read profiles
DROP POLICY IF EXISTS "access_profiles_select" ON public.access_profiles;
CREATE POLICY "access_profiles_select"
  ON public.access_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_executive());

-- Only Executive users can create/update/delete profiles
DROP POLICY IF EXISTS "access_profiles_manage" ON public.access_profiles;
CREATE POLICY "access_profiles_manage"
  ON public.access_profiles
  FOR ALL
  TO authenticated
  USING (public.is_executive())
  WITH CHECK (public.is_executive());
