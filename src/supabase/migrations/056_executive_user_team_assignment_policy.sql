-- 056_executive_user_team_assignment_policy.sql
-- Allow Executive admins to update user team assignments.
--
-- Team management writes to two tables:
--   1. teams: already managed by Executive users via teams_manage.
--   2. users: team_id/team_role live here, but the legacy users UPDATE policy
--      still only recognized manager/director roles after executives became
--      role = 'executive'.

DROP POLICY IF EXISTS "teams_manage" ON public.teams;
CREATE POLICY "teams_manage" ON public.teams FOR ALL TO authenticated
  USING (
    public.is_executive()
    OR public.get_my_role() = 'executive'
    OR public.get_my_department() = 'Executive'
  )
  WITH CHECK (
    public.is_executive()
    OR public.get_my_role() = 'executive'
    OR public.get_my_department() = 'Executive'
  );

DROP POLICY IF EXISTS "Managers and directors can update any user" ON public.users;
DROP POLICY IF EXISTS "Managers and executives can update any user" ON public.users;

CREATE POLICY "Managers and executives can update any user"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() IN ('manager', 'director', 'executive')
    OR public.get_my_department() = 'Executive'
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_role() IN ('manager', 'director', 'executive')
    OR public.get_my_department() = 'Executive'
    OR public.is_executive()
  );
