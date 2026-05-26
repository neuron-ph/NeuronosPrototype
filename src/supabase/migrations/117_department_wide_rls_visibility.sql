-- 117_department_wide_rls_visibility.sql
-- Two fixes:
--
-- 1. department/department_wide override scope was ignored by the legacy
--    can_access_record / can_access_booking / can_access_task functions.
--    They only checked for 'full'. Now they accept both old and new vocabulary.
--
-- 2. bookings_select/update/delete RLS policies only checked ops_bookings
--    (a hidden pseudo-module not visible in the Access Configuration matrix).
--    Users granted service-level modules (ops_brokerage, ops_forwarding, etc.)
--    were blocked because ops_bookings:view was never set. Now the policies
--    also accept service-level module permissions.

-- ─── 1. can_access_record ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_record(owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_executive()
    OR get_my_role() = 'executive'
    OR get_my_override_scope() IN ('full', 'department_wide', 'all', 'department')
    OR owner_id IS NULL
    OR owner_id = get_my_profile_id()
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND owner_id = ANY(get_my_team_member_ids())
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    );
$$;

-- ─── 2. can_access_booking ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_booking(
  p_created_by    text,
  p_assigned_to   text DEFAULT NULL,
  p_manager_id    text DEFAULT NULL,
  p_supervisor_id text DEFAULT NULL,
  p_handler_id    text DEFAULT NULL,
  p_booking_id    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_executive()
    OR get_my_role() = 'executive'
    OR get_my_override_scope() IN ('full', 'department_wide', 'all', 'department')
    OR p_created_by    = get_my_profile_id()
    OR p_assigned_to   = get_my_profile_id()
    OR p_manager_id    = get_my_profile_id()
    OR p_supervisor_id = get_my_profile_id()
    OR p_handler_id    = get_my_profile_id()
    OR (
      p_booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.booking_assignments ba
        WHERE ba.booking_id = p_booking_id
          AND ba.user_id = get_my_profile_id()
      )
    )
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND p_created_by = ANY(get_my_team_member_ids())
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_org_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    );
$$;

-- ─── 3. can_access_task ──────────────────────────────────────────────────────
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
    OR get_my_override_scope() IN ('full', 'department_wide', 'all', 'department')
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

-- ─── 4. Widen bookings RLS policies to accept service-level modules ──────────
-- ops_bookings is a hidden pseudo-module for booking detail tabs. Users are
-- granted service-level modules (ops_brokerage, ops_forwarding, etc.) which
-- must also grant access to the underlying bookings table.

DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select
  ON public.bookings FOR SELECT TO authenticated
  USING (
    (
      current_user_has_module_permission('ops_bookings', 'view')
      OR current_user_has_module_permission('acct_bookings', 'view')
      OR current_user_has_module_permission('ops_forwarding', 'view')
      OR current_user_has_module_permission('ops_brokerage', 'view')
      OR current_user_has_module_permission('ops_trucking', 'view')
      OR current_user_has_module_permission('ops_marine_insurance', 'view')
      OR current_user_has_module_permission('ops_others', 'view')
    )
    AND current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  );

DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    (
      current_user_has_module_permission('ops_bookings', 'edit')
      OR current_user_has_module_permission('ops_forwarding', 'edit')
      OR current_user_has_module_permission('ops_brokerage', 'edit')
      OR current_user_has_module_permission('ops_trucking', 'edit')
      OR current_user_has_module_permission('ops_marine_insurance', 'edit')
      OR current_user_has_module_permission('ops_others', 'edit')
    )
    AND current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  )
  WITH CHECK (
    current_user_has_module_permission('ops_bookings', 'edit')
    OR current_user_has_module_permission('ops_forwarding', 'edit')
    OR current_user_has_module_permission('ops_brokerage', 'edit')
    OR current_user_has_module_permission('ops_trucking', 'edit')
    OR current_user_has_module_permission('ops_marine_insurance', 'edit')
    OR current_user_has_module_permission('ops_others', 'edit')
  );

DROP POLICY IF EXISTS bookings_delete ON public.bookings;
CREATE POLICY bookings_delete
  ON public.bookings FOR DELETE TO authenticated
  USING (
    (
      current_user_has_module_permission('ops_bookings', 'delete')
      OR current_user_has_module_permission('ops_forwarding', 'delete')
      OR current_user_has_module_permission('ops_brokerage', 'delete')
      OR current_user_has_module_permission('ops_trucking', 'delete')
      OR current_user_has_module_permission('ops_marine_insurance', 'delete')
      OR current_user_has_module_permission('ops_others', 'delete')
    )
    AND current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  );
