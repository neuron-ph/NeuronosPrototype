-- 065_team_role_configurable_labels.sql
-- Remove the legacy 3-value check so Operations team pools can store
-- service-specific role labels such as "Customs Declarant" or
-- "ImpEx Supervisor" in users.team_role.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_team_role_check;

COMMENT ON COLUMN public.users.team_role IS
  'Display label / team slot. Configurable per Operations service and separate from RBAC role.';
