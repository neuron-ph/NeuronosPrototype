-- 067_canonical_assignment_profiles.sql
-- Creates the unified canonical assignment profile tables.
--
-- These replace the split storage currently spread across:
--   assignment_default_profiles / assignment_default_items  (v1, Operations-only, no dept column)
--   customer_team_profiles                                  (legacy JSONB, all departments)
--   contact_team_overrides                                  (legacy JSONB, contact-level overrides)
--   client_handler_preferences                              (oldest legacy)
--
-- All old tables are left intact as read-only fallbacks. No old table is dropped here.
-- The resolver retains a legacy fallback path until Phase 6 (canonical-read cutover).

-- ─── 1. assignment_profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text        NOT NULL,
  subject_id   text        NOT NULL,
  customer_id  text        REFERENCES public.customers(id) ON DELETE CASCADE,
  department   text        NOT NULL,
  service_type text,                              -- NULL = department-level, not service-scoped
  team_id      uuid        REFERENCES public.teams(id) ON DELETE SET NULL,
  scope_kind   text        NOT NULL DEFAULT 'default',
  source_label text,                              -- migration provenance for audit
  notes        text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   text        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_profiles_subject_type_chk
    CHECK (subject_type IN ('customer', 'contact', 'trade_party')),
  CONSTRAINT assignment_profiles_scope_kind_chk
    CHECK (scope_kind IN ('default', 'override', 'ownership'))
);

-- One active profile per (subject, department, service_type, scope_kind)
CREATE UNIQUE INDEX IF NOT EXISTS assignment_profiles_scope_uidx
  ON public.assignment_profiles (
    subject_type,
    subject_id,
    department,
    COALESCE(service_type, ''),
    scope_kind
  )
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS assignment_profiles_customer_idx
  ON public.assignment_profiles(customer_id, department, service_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS assignment_profiles_subject_lookup_idx
  ON public.assignment_profiles(subject_type, subject_id, department)
  WHERE is_active = true;

SELECT add_updated_at_trigger('assignment_profiles');

COMMENT ON TABLE public.assignment_profiles IS
  'Canonical unified assignment profiles. Replaces assignment_default_profiles, customer_team_profiles, and contact_team_overrides.';


-- ─── 2. assignment_profile_items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_profile_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES public.assignment_profiles(id) ON DELETE CASCADE,
  role_key    text        NOT NULL,
  role_label  text        NOT NULL,
  user_id     text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One user per role per profile
CREATE UNIQUE INDEX IF NOT EXISTS assignment_profile_items_role_uidx
  ON public.assignment_profile_items (profile_id, role_key);

CREATE INDEX IF NOT EXISTS assignment_profile_items_profile_idx
  ON public.assignment_profile_items(profile_id, sort_order);

CREATE INDEX IF NOT EXISTS assignment_profile_items_user_idx
  ON public.assignment_profile_items(user_id);

SELECT add_updated_at_trigger('assignment_profile_items');

COMMENT ON TABLE public.assignment_profile_items IS
  'Per-role user assignment items inside an assignment_profile.';


-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.assignment_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_profile_items ENABLE ROW LEVEL SECURITY;

-- Non-HR authenticated users can read
DROP POLICY IF EXISTS assignment_profiles_select ON public.assignment_profiles;
CREATE POLICY assignment_profiles_select
  ON public.assignment_profiles FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

DROP POLICY IF EXISTS assignment_profile_items_select ON public.assignment_profile_items;
CREATE POLICY assignment_profile_items_select
  ON public.assignment_profile_items FOR SELECT TO authenticated
  USING (public.get_my_department() != 'HR');

-- BD, Ops, Pricing, Accounting, Executive can write
DROP POLICY IF EXISTS assignment_profiles_write ON public.assignment_profiles;
CREATE POLICY assignment_profiles_write
  ON public.assignment_profiles FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );

DROP POLICY IF EXISTS assignment_profile_items_write ON public.assignment_profile_items;
CREATE POLICY assignment_profile_items_write
  ON public.assignment_profile_items FOR ALL TO authenticated
  USING (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  )
  WITH CHECK (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  );


-- ─── 4. Backfill: assignment_default_profiles → canonical ────────────────────
-- These are already Operations-specific and relational (not JSONB).
INSERT INTO public.assignment_profiles (
  subject_type, subject_id, customer_id,
  department, service_type, team_id,
  scope_kind, source_label, notes,
  is_active, created_by, updated_by, created_at, updated_at
)
SELECT
  adp.subject_type,
  adp.subject_id,
  adp.customer_id,
  'Operations',
  adp.service_type,
  adp.team_id,
  'default',
  'migrated_from_assignment_default_profiles',
  adp.notes,
  adp.is_active,
  adp.created_by,
  adp.updated_by,
  adp.created_at,
  adp.updated_at
FROM public.assignment_default_profiles adp
WHERE adp.is_active = true
ON CONFLICT DO NOTHING;

-- Copy items using the newly created canonical profile rows as the join key
INSERT INTO public.assignment_profile_items (
  profile_id, role_key, role_label, user_id, user_name, sort_order, created_at, updated_at
)
SELECT
  ap.id,
  adi.role_key,
  adi.role_label,
  adi.user_id,
  adi.user_name,
  adi.sort_order,
  adi.created_at,
  adi.updated_at
FROM public.assignment_default_items adi
JOIN public.assignment_default_profiles adp ON adp.id = adi.profile_id
JOIN public.assignment_profiles ap
  ON ap.subject_type  = adp.subject_type
 AND ap.subject_id    = adp.subject_id
 AND ap.department    = 'Operations'
 AND ap.service_type  = adp.service_type
 AND ap.is_active     = true
 AND ap.source_label  = 'migrated_from_assignment_default_profiles'
WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = adi.user_id)
ON CONFLICT DO NOTHING;


-- ─── 5. Backfill: customer_team_profiles → canonical ─────────────────────────
-- Skip rows already migrated from assignment_default_profiles (same customer+dept+service)
INSERT INTO public.assignment_profiles (
  subject_type, subject_id, customer_id,
  department, service_type, team_id,
  scope_kind, source_label, notes,
  is_active, created_by, updated_by, created_at, updated_at
)
SELECT
  'customer',
  ctp.customer_id,
  ctp.customer_id,
  ctp.department,
  ctp.service_type,
  ctp.team_id,
  'default',
  'migrated_from_customer_team_profiles',
  ctp.notes,
  true,
  ctp.created_by,
  ctp.updated_by,
  ctp.created_at,
  ctp.updated_at
FROM public.customer_team_profiles ctp
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_profiles ap
  WHERE ap.subject_type                   = 'customer'
    AND ap.subject_id                     = ctp.customer_id
    AND ap.department                     = ctp.department
    AND COALESCE(ap.service_type, '')     = COALESCE(ctp.service_type, '')
    AND ap.scope_kind                     = 'default'
    AND ap.is_active                      = true
)
ON CONFLICT DO NOTHING;

-- Expand JSONB assignments array into relational items
-- manager role is intentionally skipped: it is a service-level concept, not a booking assignment
INSERT INTO public.assignment_profile_items (
  profile_id, role_key, role_label, user_id, user_name, sort_order
)
SELECT
  ap.id,
  item->>'role_key',
  COALESCE(item->>'role_label', item->>'role_key'),
  item->>'user_id',
  COALESCE(item->>'user_name', ''),
  (ord - 1)::integer
FROM public.customer_team_profiles ctp
JOIN public.assignment_profiles ap
  ON ap.subject_type                   = 'customer'
 AND ap.subject_id                     = ctp.customer_id
 AND ap.department                     = ctp.department
 AND COALESCE(ap.service_type, '')     = COALESCE(ctp.service_type, '')
 AND ap.scope_kind                     = 'default'
 AND ap.is_active                      = true
 AND ap.source_label                   = 'migrated_from_customer_team_profiles'
CROSS JOIN LATERAL jsonb_array_elements(ctp.assignments) WITH ORDINALITY AS ja(item, ord)
WHERE (item->>'role_key')  IS NOT NULL
  AND (item->>'user_id')   IS NOT NULL
  AND (item->>'role_key')  <> 'manager'
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = item->>'user_id')
ON CONFLICT DO NOTHING;


-- ─── 6. Backfill: contact_team_overrides → canonical ─────────────────────────
INSERT INTO public.assignment_profiles (
  subject_type, subject_id, customer_id,
  department, service_type, team_id,
  scope_kind, source_label, notes,
  is_active, created_by, updated_by, created_at, updated_at
)
SELECT
  'contact',
  cto.contact_id,
  cto.customer_id,
  cto.department,
  cto.service_type,
  cto.team_id,
  'override',
  'migrated_from_contact_team_overrides',
  cto.notes,
  true,
  cto.created_by,
  cto.updated_by,
  cto.created_at,
  cto.updated_at
FROM public.contact_team_overrides cto
WHERE NOT EXISTS (
  SELECT 1 FROM public.assignment_profiles ap
  WHERE ap.subject_type                   = 'contact'
    AND ap.subject_id                     = cto.contact_id
    AND ap.department                     = cto.department
    AND COALESCE(ap.service_type, '')     = COALESCE(cto.service_type, '')
    AND ap.scope_kind                     = 'override'
    AND ap.is_active                      = true
)
ON CONFLICT DO NOTHING;

INSERT INTO public.assignment_profile_items (
  profile_id, role_key, role_label, user_id, user_name, sort_order
)
SELECT
  ap.id,
  item->>'role_key',
  COALESCE(item->>'role_label', item->>'role_key'),
  item->>'user_id',
  COALESCE(item->>'user_name', ''),
  (ord - 1)::integer
FROM public.contact_team_overrides cto
JOIN public.assignment_profiles ap
  ON ap.subject_type                   = 'contact'
 AND ap.subject_id                     = cto.contact_id
 AND ap.department                     = cto.department
 AND COALESCE(ap.service_type, '')     = COALESCE(cto.service_type, '')
 AND ap.scope_kind                     = 'override'
 AND ap.is_active                      = true
 AND ap.source_label                   = 'migrated_from_contact_team_overrides'
CROSS JOIN LATERAL jsonb_array_elements(cto.assignments) WITH ORDINALITY AS ja(item, ord)
WHERE (item->>'role_key') IS NOT NULL
  AND (item->>'user_id')  IS NOT NULL
  AND (item->>'role_key') <> 'manager'
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = item->>'user_id')
ON CONFLICT DO NOTHING;


-- ─── 7. Backfill: client_handler_preferences → canonical ─────────────────────
-- Only rows not already covered by steps 4–5
INSERT INTO public.assignment_profiles (
  subject_type, subject_id, customer_id,
  department, service_type, team_id,
  scope_kind, source_label,
  is_active, created_at, updated_at
)
SELECT
  'customer',
  chp.customer_id,
  chp.customer_id,
  'Operations',
  chp.service_type,
  chp.preferred_team_id,
  'default',
  'migrated_from_client_handler_preferences',
  true,
  chp.created_at,
  chp.updated_at
FROM public.client_handler_preferences chp
WHERE chp.service_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.assignment_profiles ap
    WHERE ap.subject_type = 'customer'
      AND ap.subject_id   = chp.customer_id
      AND ap.department   = 'Operations'
      AND ap.service_type = chp.service_type
      AND ap.scope_kind   = 'default'
      AND ap.is_active    = true
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.assignment_profile_items (
  profile_id, role_key, role_label, user_id, user_name, sort_order
)
SELECT
  ap.id,
  role_data.role_key,
  role_data.role_label,
  role_data.user_id,
  role_data.user_name,
  role_data.sort_order
FROM public.client_handler_preferences chp
JOIN public.assignment_profiles ap
  ON ap.subject_type = 'customer'
 AND ap.subject_id   = chp.customer_id
 AND ap.department   = 'Operations'
 AND ap.service_type = chp.service_type
 AND ap.scope_kind   = 'default'
 AND ap.is_active    = true
 AND ap.source_label = 'migrated_from_client_handler_preferences'
CROSS JOIN LATERAL (
  VALUES
    ('supervisor', 'Supervisor', chp.preferred_supervisor_id, COALESCE(chp.preferred_supervisor_name, ''), 0),
    ('handler',    'Handler',    chp.preferred_handler_id,    COALESCE(chp.preferred_handler_name, ''),    1)
) AS role_data(role_key, role_label, user_id, user_name, sort_order)
WHERE role_data.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = role_data.user_id)
ON CONFLICT DO NOTHING;


-- ─── 8. Atomic upsert RPC ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.replace_assignment_profile_atomic(
  p_subject_type text,
  p_subject_id   text,
  p_customer_id  text,
  p_department   text,
  p_service_type text    DEFAULT NULL,
  p_scope_kind   text    DEFAULT 'default',
  p_team_id      uuid    DEFAULT NULL,
  p_assignments  jsonb   DEFAULT '[]'::jsonb,
  p_updated_by   text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_idx        integer := 0;
  v_item       jsonb;
BEGIN
  IF p_subject_type NOT IN ('customer', 'contact', 'trade_party') THEN
    RAISE EXCEPTION 'Invalid subject_type: %', p_subject_type;
  END IF;

  IF p_scope_kind NOT IN ('default', 'override', 'ownership') THEN
    RAISE EXCEPTION 'Invalid scope_kind: %', p_scope_kind;
  END IF;

  IF NOT (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  ) THEN
    RAISE EXCEPTION 'replace_assignment_profile_atomic: insufficient permissions';
  END IF;

  SELECT id INTO v_profile_id
    FROM public.assignment_profiles
   WHERE subject_type                   = p_subject_type
     AND subject_id                     = p_subject_id
     AND department                     = p_department
     AND COALESCE(service_type, '')     = COALESCE(p_service_type, '')
     AND scope_kind                     = p_scope_kind
     AND is_active                      = true
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.assignment_profiles (
      subject_type, subject_id, customer_id,
      department, service_type, team_id,
      scope_kind, is_active, created_by, updated_by
    )
    VALUES (
      p_subject_type, p_subject_id, p_customer_id,
      p_department, p_service_type, p_team_id,
      p_scope_kind, true, p_updated_by, p_updated_by
    )
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.assignment_profiles
       SET customer_id = p_customer_id,
           team_id     = p_team_id,
           updated_by  = p_updated_by,
           updated_at  = now()
     WHERE id = v_profile_id;
  END IF;

  DELETE FROM public.assignment_profile_items WHERE profile_id = v_profile_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    IF COALESCE(v_item->>'role_key', '') <> ''
       AND COALESCE(v_item->>'user_id', '') <> '' THEN
      INSERT INTO public.assignment_profile_items (
        profile_id, role_key, role_label, user_id, user_name, sort_order
      )
      VALUES (
        v_profile_id,
        v_item->>'role_key',
        COALESCE(NULLIF(v_item->>'role_label', ''), v_item->>'role_key'),
        v_item->>'user_id',
        COALESCE(v_item->>'user_name', ''),
        v_idx
      );
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_assignment_profile_atomic(
  text, text, text, text, text, text, uuid, jsonb, text
) TO authenticated;
