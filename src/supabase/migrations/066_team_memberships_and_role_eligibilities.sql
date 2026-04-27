-- 066_team_memberships_and_role_eligibilities.sql
-- V2 team structure: replace users.team_id / users.team_role as the source of
-- truth with normalized team memberships plus per-membership role eligibility.
--
-- Compatibility-first:
--   • keeps users.team_id / users.team_role for old readers
--   • backfills new tables from legacy columns
--   • new app flows should read/write the new tables

CREATE TABLE IF NOT EXISTS public.team_memberships (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id     text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_team_user_uidx
  ON public.team_memberships(team_id, user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS team_memberships_user_idx
  ON public.team_memberships(user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS team_memberships_team_idx
  ON public.team_memberships(team_id)
  WHERE is_active = true;

SELECT add_updated_at_trigger('team_memberships');

CREATE TABLE IF NOT EXISTS public.team_role_eligibilities (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_membership_id  uuid        NOT NULL REFERENCES public.team_memberships(id) ON DELETE CASCADE,
  role_key            text        NOT NULL,
  role_label          text        NOT NULL,
  sort_order          integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_role_eligibilities_role_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS team_role_eligibilities_membership_role_uidx
  ON public.team_role_eligibilities(team_membership_id, role_key);

CREATE INDEX IF NOT EXISTS team_role_eligibilities_membership_idx
  ON public.team_role_eligibilities(team_membership_id, sort_order);

CREATE INDEX IF NOT EXISTS team_role_eligibilities_role_key_idx
  ON public.team_role_eligibilities(role_key);

SELECT add_updated_at_trigger('team_role_eligibilities');

ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_role_eligibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_memberships_read ON public.team_memberships;
CREATE POLICY team_memberships_read
  ON public.team_memberships FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS team_role_eligibilities_read ON public.team_role_eligibilities;
CREATE POLICY team_role_eligibilities_read
  ON public.team_role_eligibilities FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS team_memberships_write_admin ON public.team_memberships;
CREATE POLICY team_memberships_write_admin
  ON public.team_memberships FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Executive', 'HR')
    OR public.is_executive()
    OR public.get_my_role() = 'executive'
  )
  WITH CHECK (
    public.get_my_department() IN ('Executive', 'HR')
    OR public.is_executive()
    OR public.get_my_role() = 'executive'
  );

DROP POLICY IF EXISTS team_role_eligibilities_write_admin ON public.team_role_eligibilities;
CREATE POLICY team_role_eligibilities_write_admin
  ON public.team_role_eligibilities FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Executive', 'HR')
    OR public.is_executive()
    OR public.get_my_role() = 'executive'
  )
  WITH CHECK (
    public.get_my_department() IN ('Executive', 'HR')
    OR public.is_executive()
    OR public.get_my_role() = 'executive'
  );

WITH upserted_memberships AS (
  INSERT INTO public.team_memberships (team_id, user_id, is_active)
  SELECT DISTINCT
    u.team_id,
    u.id,
    true
  FROM public.users u
  WHERE u.team_id IS NOT NULL
  ON CONFLICT DO NOTHING
  RETURNING id, team_id, user_id
),
all_memberships AS (
  SELECT tm.id, tm.team_id, tm.user_id
  FROM public.team_memberships tm
  WHERE tm.is_active = true
)
INSERT INTO public.team_role_eligibilities (
  team_membership_id,
  role_key,
  role_label,
  sort_order
)
SELECT
  am.id,
  COALESCE(
    (
      SELECT sar.role_key
      FROM public.teams t
      JOIN public.service_assignment_roles sar
        ON sar.service_type = t.service_type
       AND sar.role_label = u.team_role
       AND sar.is_active = true
      WHERE t.id = am.team_id
      LIMIT 1
    ),
    regexp_replace(lower(trim(u.team_role)), '[^a-z0-9]+', '_', 'g')
  ) AS role_key,
  u.team_role,
  10
FROM all_memberships am
JOIN public.users u
  ON u.id = am.user_id
WHERE u.team_role IS NOT NULL
  AND trim(u.team_role) <> ''
ON CONFLICT (team_membership_id, role_key) DO UPDATE
SET role_label = EXCLUDED.role_label;

COMMENT ON TABLE public.team_memberships IS
  'Source of truth for user membership in a team pool. Replaces users.team_id as the primary relationship.';

COMMENT ON TABLE public.team_role_eligibilities IS
  'Per-membership list of roles a user is eligible to fill inside that team pool. Replaces users.team_role as the primary source of role eligibility.';
