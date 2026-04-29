-- 068_department_assignment_roles.sql
-- Canonical role catalog for non-Operations departments.
-- Replaces the hardcoded ROLE_SUGGESTIONS arrays in the UI.
-- Operations roles come from service_assignment_roles (already canonical).

CREATE TABLE IF NOT EXISTS public.department_assignment_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department  text        NOT NULL,
  role_key    text        NOT NULL,
  role_label  text        NOT NULL,
  description text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_assignment_roles_dept_key_uidx UNIQUE (department, role_key)
);

CREATE INDEX IF NOT EXISTS department_assignment_roles_dept_idx
  ON public.department_assignment_roles(department, sort_order)
  WHERE is_active = true;

SELECT add_updated_at_trigger('department_assignment_roles');

ALTER TABLE public.department_assignment_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_assignment_roles_select ON public.department_assignment_roles;
CREATE POLICY department_assignment_roles_select
  ON public.department_assignment_roles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS department_assignment_roles_write ON public.department_assignment_roles;
CREATE POLICY department_assignment_roles_write
  ON public.department_assignment_roles FOR ALL TO authenticated
  USING (public.is_executive())
  WITH CHECK (public.is_executive());

COMMENT ON TABLE public.department_assignment_roles IS
  'Canonical role catalog for non-Operations departments. Operations roles come from service_assignment_roles.';

-- ─── Seed canonical roles ─────────────────────────────────────────────────────
INSERT INTO public.department_assignment_roles (department, role_key, role_label, sort_order) VALUES
  ('Business Development', 'account_rep',    'Account Rep',      0),
  ('Business Development', 'bd_manager',     'BD Manager',       1),
  ('Pricing',              'pricing_analyst', 'Pricing Analyst',  0),
  ('Pricing',              'pricing_owner',   'Pricing Owner',    1),
  ('Accounting',           'ar_handler',      'AR Handler',       0),
  ('Accounting',           'billing_owner',   'Billing Owner',    1),
  ('HR',                   'hr_contact',      'HR Contact',       0),
  ('Executive',            'exec_sponsor',    'Exec Sponsor',     0)
ON CONFLICT (department, role_key) DO NOTHING;
