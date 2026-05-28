-- 119_multi_team_membership_scope.sql
-- Move team-scoped visibility fully onto team_memberships. users.team_id and
-- users.team_role are legacy columns and must not decide active membership.

UPDATE public.users
SET team_id = NULL,
    team_role = NULL
WHERE team_id IS NOT NULL
   OR team_role IS NOT NULL;

COMMENT ON COLUMN public.users.team_id IS
  'Legacy nullable projection. Active team membership is stored in public.team_memberships.';

COMMENT ON COLUMN public.users.team_role IS
  'Legacy nullable projection. Per-team role eligibility is stored in public.team_role_eligibilities.';

CREATE OR REPLACE FUNCTION public.get_my_team_member_ids()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT teammate.user_id), ARRAY[]::text[])
  FROM public.team_memberships mine
  JOIN public.users me
    ON me.id = mine.user_id
   AND me.auth_id = auth.uid()
  JOIN public.team_memberships teammate
    ON teammate.team_id = mine.team_id
   AND teammate.is_active = true
  WHERE mine.is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.users_share_active_team(
  p_user_id text,
  p_other_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships mine
    JOIN public.team_memberships theirs
      ON theirs.team_id = mine.team_id
     AND theirs.is_active = true
    WHERE mine.user_id = p_user_id
      AND theirs.user_id = p_other_user_id
      AND mine.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_view_record(
  p_owner_id text,
  p_record_departments text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_user_dept text;
  v_scope text;
  v_scope_depts text[];
BEGIN
  SELECT u.id, u.department
    INTO v_user_id, v_user_dept
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL THEN RETURN false; END IF;

  v_scope := public.current_user_visibility_scope();

  IF v_scope = 'all' THEN RETURN true; END IF;

  IF v_scope = 'own' THEN
    RETURN p_owner_id IS NOT NULL AND p_owner_id = v_user_id;
  END IF;

  IF v_scope = 'team' THEN
    RETURN p_owner_id IS NOT NULL
       AND public.users_share_active_team(v_user_id, p_owner_id);
  END IF;

  IF v_scope = 'department' THEN
    RETURN v_user_dept = ANY(COALESCE(p_record_departments, ARRAY[]::text[]));
  END IF;

  IF v_scope = 'selected_departments' THEN
    v_scope_depts := public.current_user_visibility_departments();
    RETURN COALESCE(p_record_departments, ARRAY[]::text[])
        && COALESCE(v_scope_depts, ARRAY[]::text[]);
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_view_booking(
  p_created_by text,
  p_manager_id text,
  p_supervisor_id text,
  p_handler_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  SELECT u.id
    INTO v_user_id
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL THEN RETURN false; END IF;

  IF p_manager_id = v_user_id
     OR p_supervisor_id = v_user_id
     OR p_handler_id = v_user_id
     OR p_created_by = v_user_id THEN
    RETURN true;
  END IF;

  RETURN public.current_user_can_view_record(
    p_created_by,
    ARRAY['Pricing','Operations','Accounting']::text[]
  );
END;
$$;
