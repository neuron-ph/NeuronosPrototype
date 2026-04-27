-- 061_profiling_governance.sql
-- Profiling module Phase 6: RLS policies, governance RPCs

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE trade_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_subservice_catalog ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_executive()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid() AND department = 'Executive'
  );
$$;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
      AND (department = 'Executive' OR role IN ('manager', 'director', 'tl'))
  );
$$;

-- trade_parties
DROP POLICY IF EXISTS "trade_parties_read"            ON trade_parties;
DROP POLICY IF EXISTS "trade_parties_write_exec"      ON trade_parties;
DROP POLICY IF EXISTS "trade_parties_write_manager"   ON trade_parties;
DROP POLICY IF EXISTS "trade_parties_update_manager"  ON trade_parties;

CREATE POLICY "trade_parties_read"           ON trade_parties FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR'));
CREATE POLICY "trade_parties_write_exec"     ON trade_parties FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());
CREATE POLICY "trade_parties_write_manager"  ON trade_parties FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());
CREATE POLICY "trade_parties_update_manager" ON trade_parties FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- profile_locations
DROP POLICY IF EXISTS "profile_locations_read"           ON profile_locations;
DROP POLICY IF EXISTS "profile_locations_write_exec"     ON profile_locations;
DROP POLICY IF EXISTS "profile_locations_write_manager"  ON profile_locations;
DROP POLICY IF EXISTS "profile_locations_update_manager" ON profile_locations;

CREATE POLICY "profile_locations_read"           ON profile_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR'));
CREATE POLICY "profile_locations_write_exec"     ON profile_locations FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());
CREATE POLICY "profile_locations_write_manager"  ON profile_locations FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());
CREATE POLICY "profile_locations_update_manager" ON profile_locations FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- profile_countries (Executive-only write)
DROP POLICY IF EXISTS "profile_countries_read"       ON profile_countries;
DROP POLICY IF EXISTS "profile_countries_write_exec" ON profile_countries;

CREATE POLICY "profile_countries_read"       ON profile_countries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR'));
CREATE POLICY "profile_countries_write_exec" ON profile_countries FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());

-- dispatch_people
DROP POLICY IF EXISTS "dispatch_people_read"           ON dispatch_people;
DROP POLICY IF EXISTS "dispatch_people_write_exec"     ON dispatch_people;
DROP POLICY IF EXISTS "dispatch_people_write_manager"  ON dispatch_people;
DROP POLICY IF EXISTS "dispatch_people_update_manager" ON dispatch_people;

CREATE POLICY "dispatch_people_read"           ON dispatch_people FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR'));
CREATE POLICY "dispatch_people_write_exec"     ON dispatch_people FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());
CREATE POLICY "dispatch_people_write_manager"  ON dispatch_people FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());
CREATE POLICY "dispatch_people_update_manager" ON dispatch_people FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- vehicles
DROP POLICY IF EXISTS "vehicles_read"           ON vehicles;
DROP POLICY IF EXISTS "vehicles_write_exec"     ON vehicles;
DROP POLICY IF EXISTS "vehicles_write_manager"  ON vehicles;
DROP POLICY IF EXISTS "vehicles_update_manager" ON vehicles;

CREATE POLICY "vehicles_read"           ON vehicles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR'));
CREATE POLICY "vehicles_write_exec"     ON vehicles FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());
CREATE POLICY "vehicles_write_manager"  ON vehicles FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());
CREATE POLICY "vehicles_update_manager" ON vehicles FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- booking_service_catalog / booking_subservice_catalog (Executive-only write)
DROP POLICY IF EXISTS "bsc_read"        ON booking_service_catalog;
DROP POLICY IF EXISTS "bsc_write_exec"  ON booking_service_catalog;
DROP POLICY IF EXISTS "bssc_read"       ON booking_subservice_catalog;
DROP POLICY IF EXISTS "bssc_write_exec" ON booking_subservice_catalog;

CREATE POLICY "bsc_read"        ON booking_service_catalog    FOR SELECT TO authenticated USING (true);
CREATE POLICY "bsc_write_exec"  ON booking_service_catalog    FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());
CREATE POLICY "bssc_read"       ON booking_subservice_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "bssc_write_exec" ON booking_subservice_catalog FOR ALL    TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());

-- ── Governance RPCs ────────────────────────────────────────────────────────

-- Count active bookings that link to a given profile_id via profile_refs
CREATE OR REPLACE FUNCTION get_profile_booking_usage(p_profile_id text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)
  FROM bookings
  WHERE status NOT IN ('Cancelled', 'Closed')
    AND details IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(details->'profile_refs') AS refs(key, val)
      WHERE val->>'profile_id' = p_profile_id
    );
$$;

-- Manual-entry usage report across non-closed bookings
CREATE OR REPLACE FUNCTION get_manual_profile_usage()
RETURNS TABLE(profile_type text, manual_value text, booking_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    val->>'profile_type'    AS profile_type,
    val->>'label_snapshot'  AS manual_value,
    COUNT(*)                AS booking_count
  FROM bookings, jsonb_each(details->'profile_refs') AS refs(key, val)
  WHERE status NOT IN ('Cancelled', 'Closed')
    AND val->>'source' = 'manual'
    AND val->>'label_snapshot' IS NOT NULL
    AND val->>'label_snapshot' != ''
  GROUP BY 1, 2
  ORDER BY 3 DESC;
$$;
