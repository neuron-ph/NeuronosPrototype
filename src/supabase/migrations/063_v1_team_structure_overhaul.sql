-- 063_v1_team_structure_overhaul.sql
-- V1 team structure overhaul (compatibility-first).
--
-- Splits five concerns that were tangled together in 057:
--   1. operational_services       — first-class business lanes (service rows)
--   2. service_assignment_roles   — Executive-configurable per-service roles
--   3. assignment_default_profiles — replaces customer_team_profiles for v1 (additive)
--   4. assignment_default_items   — flat per-role default user items
--   5. booking_assignments        — source of truth for per-booking user-role links
--
-- Plus:
--   • adds teams.service_type so a team belongs to a service (not the other way around)
--   • updates can_access_booking to also resolve access via booking_assignments
--   • keeps all legacy columns/tables (manager_id/supervisor_id/handler_id/team_id,
--     customer_team_profiles, contact_team_overrides, client_handler_preferences)
--     as compatibility projections / fallbacks. v1 does NOT delete them.

-- ─── 0. Pre-flight ───────────────────────────────────────────────────────────
-- All new tables here use uuid PKs and reference users(id) (text) and customers(id) (text).

-- ─── 1. operational_services ─────────────────────────────────────────────────
-- One row per business lane. Service Manager belongs to the service, not to a team.
CREATE TABLE IF NOT EXISTS public.operational_services (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type          text        NOT NULL UNIQUE,
  label                 text        NOT NULL,
  department            text        NOT NULL DEFAULT 'Operations',
  default_manager_id    text        REFERENCES public.users(id) ON DELETE SET NULL,
  default_manager_name  text,
  sort_order            integer     NOT NULL DEFAULT 0,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_services_active_idx
  ON public.operational_services(is_active, sort_order);

SELECT add_updated_at_trigger('operational_services');

-- Seed the 5 v1 services. The default_manager_id is left NULL during rollout;
-- existing data does not yet have a per-service manager outside of bookings.
INSERT INTO public.operational_services (service_type, label, department, sort_order)
VALUES
  ('Forwarding',       'Forwarding',       'Operations', 10),
  ('Brokerage',        'Brokerage',        'Operations', 20),
  ('Trucking',         'Trucking',         'Operations', 30),
  ('Marine Insurance', 'Marine Insurance', 'Operations', 40),
  ('Others',           'Others',           'Operations', 50)
ON CONFLICT (service_type) DO NOTHING;


-- ─── 2. service_assignment_roles ─────────────────────────────────────────────
-- Executive-only writable. Defines the per-service role slots that bookings can
-- assign users into. `manager` is NOT seeded here because Service Manager is
-- represented separately (operational_services.default_manager_id and the
-- compatibility manager_id projection on bookings).
CREATE TABLE IF NOT EXISTS public.service_assignment_roles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type   text        NOT NULL,
  role_key       text        NOT NULL,
  role_label     text        NOT NULL,
  required       boolean     NOT NULL DEFAULT false,
  allow_multiple boolean     NOT NULL DEFAULT false,
  sort_order     integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_assignment_roles_role_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]*$')
);

-- One active role_key per service. Inactive rows can coexist with same key.
CREATE UNIQUE INDEX IF NOT EXISTS service_assignment_roles_active_uidx
  ON public.service_assignment_roles (service_type, role_key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS service_assignment_roles_service_idx
  ON public.service_assignment_roles(service_type, sort_order);

SELECT add_updated_at_trigger('service_assignment_roles');

-- v1 seed roles. Brokerage + Forwarding share the import/export staffing model;
-- Trucking, Marine Insurance, and Others share the simpler operations model.
INSERT INTO public.service_assignment_roles
  (service_type, role_key, role_label, required, allow_multiple, sort_order)
VALUES
  ('Brokerage',        'impex_supervisor',    'ImpEx Supervisor',    true,  false, 10),
  ('Brokerage',        'team_leader',         'Team Leader',         false, false, 20),
  ('Brokerage',        'customs_declarant',   'Customs Declarant',   true,  false, 30),

  ('Forwarding',       'impex_supervisor',    'ImpEx Supervisor',    true,  false, 10),
  ('Forwarding',       'team_leader',         'Team Leader',         false, false, 20),
  ('Forwarding',       'customs_declarant',   'Customs Declarant',   true,  false, 30),

  ('Trucking',         'operations_supervisor', 'Operations Supervisor', true,  false, 10),
  ('Trucking',         'handler',               'Handler',               true,  false, 20),

  ('Marine Insurance', 'operations_supervisor', 'Operations Supervisor', true,  false, 10),
  ('Marine Insurance', 'handler',               'Handler',               true,  false, 20),

  ('Others',           'operations_supervisor', 'Operations Supervisor', true,  false, 10),
  ('Others',           'handler',               'Handler',               true,  false, 20)
ON CONFLICT DO NOTHING;


-- ─── 3. teams.service_type ───────────────────────────────────────────────────
-- A team belongs to a service. Existing Operations teams whose name matches a
-- known service_type get backfilled. Team name is now a pool name.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS service_type text;

UPDATE public.teams t
   SET service_type = t.name
 WHERE t.department = 'Operations'
   AND t.service_type IS NULL
   AND t.name IN ('Forwarding', 'Brokerage', 'Trucking', 'Marine Insurance', 'Others');

CREATE INDEX IF NOT EXISTS teams_service_type_idx
  ON public.teams(service_type)
  WHERE service_type IS NOT NULL;


-- ─── 4. assignment_default_profiles ──────────────────────────────────────────
-- A profile is the "default crew" for a (subject, service_type) pair.
-- subject_type lets us point either at a customer or a trade party (consignee/
-- shipper) without polymorphic FKs. team_id is an optional eligibility pool.
CREATE TABLE IF NOT EXISTS public.assignment_default_profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type   text        NOT NULL,
  subject_id     text        NOT NULL,
  customer_id    text        REFERENCES public.customers(id) ON DELETE CASCADE,
  service_type   text        NOT NULL,
  team_id        uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  source_label   text,
  notes          text,
  is_active      boolean     NOT NULL DEFAULT true,
  created_by     text        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by     text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_default_profiles_subject_type_chk
    CHECK (subject_type IN ('customer', 'trade_party'))
);

-- One active default per (subject_type, subject_id, service_type)
CREATE UNIQUE INDEX IF NOT EXISTS assignment_default_profiles_subject_uidx
  ON public.assignment_default_profiles (subject_type, subject_id, service_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS assignment_default_profiles_customer_idx
  ON public.assignment_default_profiles(customer_id, service_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS assignment_default_profiles_subject_lookup_idx
  ON public.assignment_default_profiles(subject_type, subject_id)
  WHERE is_active = true;

SELECT add_updated_at_trigger('assignment_default_profiles');


-- ─── 5. assignment_default_items ─────────────────────────────────────────────
-- Per-role default user. v1 enforces single-user per role.
CREATE TABLE IF NOT EXISTS public.assignment_default_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES public.assignment_default_profiles(id) ON DELETE CASCADE,
  role_key    text        NOT NULL,
  role_label  text        NOT NULL,
  user_id     text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_default_items_role_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]*$')
);

-- v1: single user per role per profile.
CREATE UNIQUE INDEX IF NOT EXISTS assignment_default_items_role_uidx
  ON public.assignment_default_items (profile_id, role_key);

CREATE INDEX IF NOT EXISTS assignment_default_items_profile_idx
  ON public.assignment_default_items(profile_id, sort_order);

CREATE INDEX IF NOT EXISTS assignment_default_items_user_idx
  ON public.assignment_default_items(user_id);

SELECT add_updated_at_trigger('assignment_default_items');


-- ─── 6. booking_assignments ──────────────────────────────────────────────────
-- The source of truth for per-booking user-role links. Drives RLS visibility,
-- detail-view rendering, and inbox/workflow notifications. The legacy
-- bookings.{manager,supervisor,handler}_{id,name} columns are projections of
-- selected role rows here, kept for backward-compat with older screens.
CREATE TABLE IF NOT EXISTS public.booking_assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    text        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_type  text        NOT NULL,
  role_key      text        NOT NULL,
  role_label    text        NOT NULL,
  user_id       text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name     text        NOT NULL,
  source        text        NOT NULL DEFAULT 'manual',
  assigned_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_assignments_source_chk
    CHECK (source IN ('service_default', 'customer_default', 'trade_party_default', 'manual', 'legacy')),
  CONSTRAINT booking_assignments_role_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]*$')
);

-- v1: one user per role per booking
CREATE UNIQUE INDEX IF NOT EXISTS booking_assignments_role_uidx
  ON public.booking_assignments (booking_id, role_key);

CREATE INDEX IF NOT EXISTS booking_assignments_booking_idx
  ON public.booking_assignments(booking_id);

CREATE INDEX IF NOT EXISTS booking_assignments_user_idx
  ON public.booking_assignments(user_id);

CREATE INDEX IF NOT EXISTS booking_assignments_service_idx
  ON public.booking_assignments(service_type);

SELECT add_updated_at_trigger('booking_assignments');


-- ─── 7. RLS — operational_services / service_assignment_roles ────────────────
ALTER TABLE public.operational_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_assignment_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_default_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_default_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_assignments         ENABLE ROW LEVEL SECURITY;

-- Authenticated read on services + role catalogs (everyone needs this for UI).
DROP POLICY IF EXISTS operational_services_read ON public.operational_services;
CREATE POLICY operational_services_read
  ON public.operational_services FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS service_assignment_roles_read ON public.service_assignment_roles;
CREATE POLICY service_assignment_roles_read
  ON public.service_assignment_roles FOR SELECT TO authenticated
  USING (true);

-- Executive-only writes on the service catalog.
DROP POLICY IF EXISTS operational_services_write_exec ON public.operational_services;
CREATE POLICY operational_services_write_exec
  ON public.operational_services FOR ALL TO authenticated
  USING     (is_executive() OR get_my_department() = 'Executive' OR get_my_role() = 'executive')
  WITH CHECK(is_executive() OR get_my_department() = 'Executive' OR get_my_role() = 'executive');

DROP POLICY IF EXISTS service_assignment_roles_write_exec ON public.service_assignment_roles;
CREATE POLICY service_assignment_roles_write_exec
  ON public.service_assignment_roles FOR ALL TO authenticated
  USING     (is_executive() OR get_my_department() = 'Executive' OR get_my_role() = 'executive')
  WITH CHECK(is_executive() OR get_my_department() = 'Executive' OR get_my_role() = 'executive');


-- ─── 8. RLS — assignment_default_profiles / items ────────────────────────────
-- Same access shape as customer_team_profiles: non-HR can read, BD/Ops/Pricing/
-- Accounting/Executive can write.
DROP POLICY IF EXISTS assignment_default_profiles_select ON public.assignment_default_profiles;
CREATE POLICY assignment_default_profiles_select
  ON public.assignment_default_profiles FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

DROP POLICY IF EXISTS assignment_default_profiles_write ON public.assignment_default_profiles;
CREATE POLICY assignment_default_profiles_write
  ON public.assignment_default_profiles FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );

DROP POLICY IF EXISTS assignment_default_items_select ON public.assignment_default_items;
CREATE POLICY assignment_default_items_select
  ON public.assignment_default_items FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

DROP POLICY IF EXISTS assignment_default_items_write ON public.assignment_default_items;
CREATE POLICY assignment_default_items_write
  ON public.assignment_default_items FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );


-- ─── 9. RLS — booking_assignments ────────────────────────────────────────────
-- Visibility of a booking_assignments row inherits from the parent booking's
-- access rules. Writes are limited to Operations/Executive (the dept that owns
-- bookings). Accounting can read because it can see all bookings via the
-- existing dept guard on bookings.
DROP POLICY IF EXISTS booking_assignments_select ON public.booking_assignments;
CREATE POLICY booking_assignments_select
  ON public.booking_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_assignments.booking_id
    )
  );

DROP POLICY IF EXISTS booking_assignments_write ON public.booking_assignments;
CREATE POLICY booking_assignments_write
  ON public.booking_assignments FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Operations', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Operations', 'Executive')
    OR public.is_executive()
  );


-- ─── 10. can_access_booking — assignment-aware version ───────────────────────
-- The new signature adds p_booking_id. When provided, access is also granted if
-- the caller is referenced in booking_assignments.user_id for that booking.
-- The legacy 5-arg call is preserved (default NULL booking_id) so older RLS
-- policies and direct callers keep working until they migrate.
DROP FUNCTION IF EXISTS public.can_access_booking(text, text, text, text, text);

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
    OR get_my_override_scope() = 'full'
    -- Direct association on legacy projection columns
    OR p_created_by    = get_my_profile_id()
    OR p_assigned_to   = get_my_profile_id()
    OR p_manager_id    = get_my_profile_id()
    OR p_supervisor_id = get_my_profile_id()
    OR p_handler_id    = get_my_profile_id()
    -- Direct association via booking_assignments
    OR (
      p_booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.booking_assignments ba
        WHERE ba.booking_id = p_booking_id
          AND ba.user_id = get_my_profile_id()
      )
    )
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

-- Update the bookings_select policy to pass id so booking_assignments can
-- broaden visibility for staff who are assigned but not on the legacy columns.
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select
  ON public.bookings FOR SELECT TO authenticated
  USING (
    get_my_department() IN ('Operations', 'Accounting', 'Executive')
    AND can_access_booking(created_by, NULL, manager_id, supervisor_id, handler_id, id)
  );


-- ─── 11. Backfill assignment_default_profiles from customer_team_profiles ────
-- Carry every existing Operations customer profile across so the new resolver
-- has data to read on day one. Items are split out of the JSONB array.
-- Profiles whose service_type is NULL are skipped (the new schema requires it).
INSERT INTO public.assignment_default_profiles (
  id,
  subject_type,
  subject_id,
  customer_id,
  service_type,
  team_id,
  source_label,
  notes,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'customer',
  ctp.customer_id,
  ctp.customer_id,
  ctp.service_type,
  ctp.team_id,
  'migrated_from_customer_team_profiles',
  ctp.notes,
  true,
  ctp.created_by,
  ctp.updated_by,
  ctp.created_at,
  ctp.updated_at
FROM public.customer_team_profiles ctp
WHERE ctp.department = 'Operations'
  AND ctp.service_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.assignment_default_profiles adp
    WHERE adp.subject_type = 'customer'
      AND adp.subject_id   = ctp.customer_id
      AND adp.service_type = ctp.service_type
      AND adp.is_active    = true
  );

-- Pull each assignment item out of the JSONB array. Skip the legacy 'manager'
-- role_key — service manager is now a service-level concept, not a per-booking
-- assignment role. It still appears via the compatibility manager_id projection
-- on bookings.
INSERT INTO public.assignment_default_items (
  profile_id,
  role_key,
  role_label,
  user_id,
  user_name,
  sort_order
)
SELECT
  adp.id,
  item->>'role_key',
  COALESCE(item->>'role_label', item->>'role_key'),
  item->>'user_id',
  COALESCE(item->>'user_name', ''),
  ord
FROM public.customer_team_profiles ctp
JOIN public.assignment_default_profiles adp
  ON adp.subject_type   = 'customer'
 AND adp.subject_id     = ctp.customer_id
 AND adp.service_type   = ctp.service_type
 AND adp.is_active      = true
CROSS JOIN LATERAL jsonb_array_elements(ctp.assignments) WITH ORDINALITY AS ja(item, ord)
WHERE ctp.department = 'Operations'
  AND ctp.service_type IS NOT NULL
  AND item->>'role_key' IS NOT NULL
  AND item->>'role_key' <> 'manager'
  AND item->>'user_id'  IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = item->>'user_id')
  AND NOT EXISTS (
    SELECT 1 FROM public.assignment_default_items adi
    WHERE adi.profile_id = adp.id
      AND adi.role_key   = item->>'role_key'
  );


-- ─── 12. Backfill operational_services.default_manager_id ────────────────────
-- Most-frequent manager per service_type, derived from the canonical profiles
-- migrated above. Only sets the default when a service has none yet.
WITH manager_counts AS (
  SELECT
    ctp.service_type,
    item->>'user_id'   AS user_id,
    item->>'user_name' AS user_name,
    COUNT(*)           AS n
  FROM public.customer_team_profiles ctp
  CROSS JOIN LATERAL jsonb_array_elements(ctp.assignments) AS item
  WHERE ctp.department = 'Operations'
    AND ctp.service_type IS NOT NULL
    AND item->>'role_key' = 'manager'
    AND item->>'user_id' IS NOT NULL
  GROUP BY 1, 2, 3
), top_per_service AS (
  SELECT DISTINCT ON (service_type)
    service_type, user_id, user_name
  FROM manager_counts
  ORDER BY service_type, n DESC, user_id
)
UPDATE public.operational_services os
   SET default_manager_id   = tps.user_id,
       default_manager_name = tps.user_name
  FROM top_per_service tps
 WHERE os.service_type = tps.service_type
   AND os.default_manager_id IS NULL
   AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = tps.user_id);


-- ─── 13. Backfill booking_assignments from existing bookings ─────────────────
-- For each existing booking with manager/supervisor/handler IDs, project a
-- corresponding booking_assignments row. Uses source = 'legacy' so callers can
-- distinguish migrated rows from explicit user actions.
-- Manager is intentionally NOT projected as a booking_assignments row — it now
-- lives on the service / bookings.manager_id projection only.
INSERT INTO public.booking_assignments
  (booking_id, service_type, role_key, role_label, user_id, user_name, source)
SELECT
  b.id,
  b.service_type,
  CASE
    WHEN b.service_type IN ('Brokerage', 'Forwarding') THEN 'team_leader'
    ELSE 'operations_supervisor'
  END,
  CASE
    WHEN b.service_type IN ('Brokerage', 'Forwarding') THEN 'Team Leader'
    ELSE 'Operations Supervisor'
  END,
  b.supervisor_id,
  COALESCE(b.supervisor_name, ''),
  'legacy'
FROM public.bookings b
WHERE b.supervisor_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.supervisor_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_assignments ba
    WHERE ba.booking_id = b.id
      AND ba.role_key IN ('team_leader', 'operations_supervisor')
  );

INSERT INTO public.booking_assignments
  (booking_id, service_type, role_key, role_label, user_id, user_name, source)
SELECT
  b.id,
  b.service_type,
  CASE
    WHEN b.service_type IN ('Brokerage', 'Forwarding') THEN 'customs_declarant'
    ELSE 'handler'
  END,
  CASE
    WHEN b.service_type IN ('Brokerage', 'Forwarding') THEN 'Customs Declarant'
    ELSE 'Handler'
  END,
  b.handler_id,
  COALESCE(b.handler_name, ''),
  'legacy'
FROM public.bookings b
WHERE b.handler_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.handler_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_assignments ba
    WHERE ba.booking_id = b.id
      AND ba.role_key IN ('customs_declarant', 'handler')
  );

-- ─── 14. Helpful comments ────────────────────────────────────────────────────
COMMENT ON TABLE public.operational_services       IS 'V1 first-class business lanes; service_manager is per-service.';
COMMENT ON TABLE public.service_assignment_roles   IS 'Executive-configurable role slots per service. manager is intentionally NOT a role key here.';
COMMENT ON TABLE public.assignment_default_profiles IS 'Customer/trade-party default crew profile per service. Replaces customer_team_profiles in v1; legacy still read as fallback.';
COMMENT ON TABLE public.assignment_default_items   IS 'Per-role default user inside an assignment_default_profile.';
COMMENT ON TABLE public.booking_assignments        IS 'Source of truth for per-booking user-role links. RLS uses this; legacy bookings.{manager,supervisor,handler}_{id,name} are projections.';
