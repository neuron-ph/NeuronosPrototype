-- 057_saved_team_profiles.sql
-- Canonical saved team profiles for customers and contacts.
-- Each customer can have one profile per (department, service_type, team_id) scope.
-- Contacts can override per the same scope.

-- ─── 1. customer_team_profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_team_profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  text        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  department   text        NOT NULL,
  service_type text,
  team_id      uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name    text,
  assignments  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- assignments shape:
  -- [{ "role_key": "manager", "role_label": "Manager", "user_id": "...", "user_name": "..." }]
  -- Operations role_keys: "manager" | "supervisor" | "handler"
  -- Other departments: free-form, e.g. "pricing_analyst", "account_rep"
  notes        text,
  created_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_team_profiles_assignments_array
    CHECK (jsonb_typeof(assignments) = 'array')
);

-- Unique per scope: one profile per (customer, dept, service_type, team)
CREATE UNIQUE INDEX IF NOT EXISTS customer_team_profiles_scope_uidx
  ON public.customer_team_profiles (
    customer_id,
    department,
    COALESCE(service_type, ''),
    COALESCE(team_id::text, '')
  );

CREATE INDEX IF NOT EXISTS customer_team_profiles_customer_idx
  ON public.customer_team_profiles(customer_id);

CREATE INDEX IF NOT EXISTS customer_team_profiles_department_idx
  ON public.customer_team_profiles(department);

CREATE INDEX IF NOT EXISTS customer_team_profiles_service_idx
  ON public.customer_team_profiles(service_type)
  WHERE service_type IS NOT NULL;

-- GIN index enables: WHERE assignments @> '[{"user_id":"usr-001"}]'
CREATE INDEX IF NOT EXISTS customer_team_profiles_assignments_gin_idx
  ON public.customer_team_profiles USING gin (assignments jsonb_path_ops);

SELECT add_updated_at_trigger('customer_team_profiles');

-- ─── 2. contact_team_overrides ────────────────────────────────────────────────
-- Per-contact overrides. Resolution: override wins over customer profile.
CREATE TABLE IF NOT EXISTS public.contact_team_overrides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   text        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  customer_id  text        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  department   text        NOT NULL,
  service_type text,
  team_id      uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name    text,
  assignments  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  notes        text,
  created_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_team_overrides_assignments_array
    CHECK (jsonb_typeof(assignments) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_team_overrides_scope_uidx
  ON public.contact_team_overrides (
    contact_id,
    department,
    COALESCE(service_type, ''),
    COALESCE(team_id::text, '')
  );

CREATE INDEX IF NOT EXISTS contact_team_overrides_contact_idx
  ON public.contact_team_overrides(contact_id);

CREATE INDEX IF NOT EXISTS contact_team_overrides_customer_idx
  ON public.contact_team_overrides(customer_id);

CREATE INDEX IF NOT EXISTS contact_team_overrides_assignments_gin_idx
  ON public.contact_team_overrides USING gin (assignments jsonb_path_ops);

SELECT add_updated_at_trigger('contact_team_overrides');

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.customer_team_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_team_overrides  ENABLE ROW LEVEL SECURITY;

-- All non-HR authenticated users can read profiles (needed for auto-fill in every dept)
CREATE POLICY customer_team_profiles_select
  ON public.customer_team_profiles FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

CREATE POLICY contact_team_overrides_select
  ON public.contact_team_overrides FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

-- BD, Ops, Pricing, Accounting, and Executive can write
CREATE POLICY customer_team_profiles_write
  ON public.customer_team_profiles FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );

CREATE POLICY contact_team_overrides_write
  ON public.contact_team_overrides FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );

-- ─── 4. Fix client_handler_preferences ───────────────────────────────────────
-- Add team columns (referenced in code but never migrated) and a unique index
-- so upserts by (customer_id, service_type) are safe.
ALTER TABLE public.client_handler_preferences
  ADD COLUMN IF NOT EXISTS preferred_team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_team_name text;

CREATE UNIQUE INDEX IF NOT EXISTS client_handler_preferences_customer_service_uidx
  ON public.client_handler_preferences(customer_id, service_type);

-- ─── 5. Add team_id / team_name to bookings ───────────────────────────────────
-- BookingTeamSection already writes these; confirm they exist.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS team_id   uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_name text;

-- ─── 6. Migrate existing client_handler_preferences → customer_team_profiles ──
-- Preserve service_type. Do not group across service types.
INSERT INTO public.customer_team_profiles (
  customer_id,
  department,
  service_type,
  team_id,
  team_name,
  assignments,
  created_at,
  updated_at
)
SELECT
  chp.customer_id,
  'Operations',
  chp.service_type,
  chp.preferred_team_id,
  COALESCE(chp.preferred_team_name, t.name, chp.service_type),
  jsonb_agg(
    item.assignment ORDER BY item.ord
  ) FILTER (WHERE item.assignment IS NOT NULL),
  MIN(chp.created_at),
  MAX(chp.updated_at)
FROM public.client_handler_preferences chp
LEFT JOIN public.teams t ON t.id = chp.preferred_team_id
CROSS JOIN LATERAL (
  VALUES
    (1, CASE WHEN chp.preferred_manager_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'role_key', 'manager',
        'role_label', 'Manager',
        'user_id', chp.preferred_manager_id,
        'user_name', COALESCE(chp.preferred_manager_name, '')
      )
    END),
    (2, CASE WHEN chp.preferred_supervisor_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'role_key', 'supervisor',
        'role_label', 'Supervisor',
        'user_id', chp.preferred_supervisor_id,
        'user_name', COALESCE(chp.preferred_supervisor_name, '')
      )
    END),
    (3, CASE WHEN chp.preferred_handler_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'role_key', 'handler',
        'role_label', 'Handler',
        'user_id', chp.preferred_handler_id,
        'user_name', COALESCE(chp.preferred_handler_name, '')
      )
    END)
) AS item(ord, assignment)
WHERE chp.service_type IS NOT NULL
GROUP BY
  chp.customer_id,
  chp.service_type,
  chp.preferred_team_id,
  COALESCE(chp.preferred_team_name, t.name, chp.service_type)
ON CONFLICT DO NOTHING;
