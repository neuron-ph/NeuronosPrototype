-- 047_rbac_supervisor_role.sql
-- Adds supervisor and executive as first-class RBAC roles.
-- Adds org_settings table with block_higher_rank_visibility toggle.
-- Adds role-level helper functions.
-- Updates can_access_record (backward-compat), adds can_access_task and can_access_booking.
-- Updates RLS policies for tasks and bookings.
-- Does NOT touch quotation read policy (migration 021 behavior is intentional).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Role constraint — must include executive (already in DB from migration 025)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('staff', 'team_leader', 'supervisor', 'manager', 'executive'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Migrate display-role Supervisors to real supervisor role
--    Only promotes team_leader users whose display team_role = 'Supervisor'.
--    Review before running against prod if org structure is non-standard.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.users
SET role = 'supervisor'
WHERE team_role = 'Supervisor'
  AND role = 'team_leader';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Org settings — block_higher_rank_visibility toggle (default OFF)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_settings (
  id                          text        PRIMARY KEY DEFAULT 'default',
  block_higher_rank_visibility boolean     NOT NULL DEFAULT false,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.org_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_settings_read  ON public.org_settings;
CREATE POLICY org_settings_read
  ON public.org_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS org_settings_write ON public.org_settings;
CREATE POLICY org_settings_write
  ON public.org_settings FOR ALL TO authenticated
  USING     (get_my_role() = 'executive' OR get_my_department() = 'Executive')
  WITH CHECK(get_my_role() = 'executive' OR get_my_department() = 'Executive');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Role-level helper functions
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role_level()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE get_my_role()
    WHEN 'staff'       THEN 0
    WHEN 'team_leader' THEN 1
    WHEN 'supervisor'  THEN 2
    WHEN 'manager'     THEN 3
    WHEN 'executive'   THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_role_level(owner_id text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE role
       WHEN 'staff'       THEN 0
       WHEN 'team_leader' THEN 1
       WHEN 'supervisor'  THEN 2
       WHEN 'manager'     THEN 3
       WHEN 'executive'   THEN 4
       ELSE 0
     END
     FROM public.users
     WHERE id = owner_id),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.get_org_block_higher_rank()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT block_higher_rank_visibility FROM public.org_settings WHERE id = 'default'),
    false
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Updated can_access_record — single-arg, backward-compatible.
--    Used by customers, contacts, evouchers, and any single-owner table.
--    IMPORTANT: block_higher_rank check is INSIDE each visibility branch,
--    not a standalone OR (a standalone OR would become OR true when block=false).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_record(owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Executive department or executive role
    is_executive()
    OR get_my_role() = 'executive'
    -- Full override scope
    OR get_my_override_scope() = 'full'
    -- Own record (or ownerless)
    OR owner_id IS NULL
    OR owner_id = get_my_profile_id()
    -- Team leader / supervisor: subordinate records
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND owner_id = ANY(get_my_team_member_ids())
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    )
    -- Manager: department-wide
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. can_access_task — tasks has owner_id AND assigned_to
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_task(
  p_owner_id    text,
  p_assigned_to text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_executive()
    OR get_my_role() = 'executive'
    OR get_my_override_scope() = 'full'
    OR p_owner_id IS NULL
    OR p_owner_id    = get_my_profile_id()
    OR p_assigned_to = get_my_profile_id()
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND p_owner_id = ANY(get_my_team_member_ids())
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_owner_id) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_owner_id) > get_my_role_level()
      )
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. can_access_booking — bookings has created_by, manager_id, supervisor_id,
--    handler_id but NO assigned_to column. Callers pass NULL for p_assigned_to.
--    The parameter is kept for API symmetry with can_access_task.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_booking(
  p_created_by    text,
  p_assigned_to   text DEFAULT NULL,
  p_manager_id    text DEFAULT NULL,
  p_supervisor_id text DEFAULT NULL,
  p_handler_id    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_executive()
    OR get_my_role() = 'executive'
    OR get_my_override_scope() = 'full'
    -- Direct association on any relevant field
    OR p_created_by    = get_my_profile_id()
    OR p_assigned_to   = get_my_profile_id()
    OR p_manager_id    = get_my_profile_id()
    OR p_supervisor_id = get_my_profile_id()
    OR p_handler_id    = get_my_profile_id()
    -- Team leader / supervisor: creator is a subordinate
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND p_created_by = ANY(get_my_team_member_ids())
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    )
    -- Manager: department-wide (dept guard enforced in the policy itself)
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Update RLS policies
-- ────────────────────────────────────────────────────────────────────────────

-- Tasks: now uses can_access_task(owner_id, assigned_to) for direct-association coverage
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select
  ON public.tasks FOR SELECT TO authenticated
  USING (can_access_task(owner_id, assigned_to));

-- Bookings: preserve department guard + use can_access_booking.
-- Bookings table has created_by, manager_id, supervisor_id, handler_id — no assigned_to.
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select
  ON public.bookings FOR SELECT TO authenticated
  USING (
    get_my_department() IN ('Operations', 'Accounting', 'Executive')
    AND can_access_booking(created_by, NULL, manager_id, supervisor_id, handler_id)
  );
