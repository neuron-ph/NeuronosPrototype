-- 094_access_profiles_select_rbac.sql
-- Broaden access_profiles SELECT policy so non-Executive admins with the
-- Users-module grant can populate the Access Profile dropdown when creating
-- or editing users. Mirrors the create-user edge function's RBAC rule.

DROP POLICY IF EXISTS "access_profiles_select" ON public.access_profiles;

CREATE POLICY "access_profiles_select"
  ON public.access_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.is_executive()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      LEFT JOIN public.permission_overrides po ON po.user_id = u.id
      WHERE u.auth_id = auth.uid()
        AND (
          (po.module_grants ->> 'exec_users:view')         = 'true'
          OR (po.module_grants ->> 'exec_users:create')    = 'true'
          OR (po.module_grants ->> 'exec_users:edit')      = 'true'
          OR (po.module_grants ->> 'admin_users_tab:view') = 'true'
          OR (po.module_grants ->> 'admin_users_tab:create') = 'true'
          OR (po.module_grants ->> 'admin_users_tab:edit')   = 'true'
          OR (po.module_grants ->> 'admin_access_profiles_tab:view') = 'true'
        )
    )
  );
