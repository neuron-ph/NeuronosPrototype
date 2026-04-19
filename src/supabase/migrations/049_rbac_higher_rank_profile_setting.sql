-- ============================================================================
-- 049: Move higher-rank visibility into per-user RBAC grants
-- ============================================================================
-- The previous org-wide toggle remains in older databases for compatibility,
-- but access decisions now read the user's permission_overrides.module_grants.
-- The UI writes this key through Access Configuration and Access Profiles:
--   __rbac:block_higher_rank_visibility
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_block_higher_rank()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN po.module_grants ? '__rbac:block_higher_rank_visibility'
          THEN COALESCE((po.module_grants ->> '__rbac:block_higher_rank_visibility')::boolean, false)
        ELSE false
      END
      FROM public.permission_overrides po
      WHERE po.user_id = get_my_profile_id()
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_record(owner_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_executive()
    OR get_my_role() = 'executive'
    OR get_my_override_scope() = 'full'
    OR owner_id IS NULL
    OR owner_id = get_my_profile_id()
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND owner_id = ANY(get_my_team_member_ids())
      AND NOT (
        get_user_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_user_block_higher_rank()
        AND get_owner_role_level(owner_id) > get_my_role_level()
      )
    );
$$;

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
        get_user_block_higher_rank()
        AND get_owner_role_level(p_owner_id) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_user_block_higher_rank()
        AND get_owner_role_level(p_owner_id) > get_my_role_level()
      )
    );
$$;

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
    OR p_created_by    = get_my_profile_id()
    OR p_assigned_to   = get_my_profile_id()
    OR p_manager_id    = get_my_profile_id()
    OR p_supervisor_id = get_my_profile_id()
    OR p_handler_id    = get_my_profile_id()
    OR (
      get_my_role() IN ('team_leader', 'supervisor')
      AND p_created_by = ANY(get_my_team_member_ids())
      AND NOT (
        get_user_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    )
    OR (
      get_my_role() = 'manager'
      AND NOT (
        get_user_block_higher_rank()
        AND get_owner_role_level(p_created_by) > get_my_role_level()
      )
    );
$$;
