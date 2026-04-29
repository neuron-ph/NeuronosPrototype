-- 070_department_assignment_roles_required.sql
-- Bring non-Operations department role catalogs to parity with Operations by
-- letting admins mark roles as required in the canonical role definition.

ALTER TABLE public.department_assignment_roles
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.department_assignment_roles.required IS
  'Whether this department assignment role must be filled when building canonical assignment defaults.';
