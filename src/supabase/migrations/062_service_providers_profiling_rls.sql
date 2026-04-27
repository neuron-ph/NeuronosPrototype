-- 062_service_providers_profiling_rls.sql
-- Tighten service_providers RLS to enforce the Executive/manager-only write rule
-- that governs the profiling quick-create path.
--
-- Read stays open to all non-HR authenticated users (unchanged from permissive baseline).
-- Writes restricted to manager_or_above — covers both Pricing vendor managers and
-- the profiling inline quick-create path. The permissive "Authenticated full access"
-- policy from the bootstrap era is dropped.
--
-- Requires: is_executive() and is_manager_or_above() functions (from 061_profiling_governance.sql)

ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_providers_read"       ON service_providers;
DROP POLICY IF EXISTS "service_providers_write_exec" ON service_providers;
DROP POLICY IF EXISTS "service_providers_write_mgr"  ON service_providers;
DROP POLICY IF EXISTS "service_providers_update_mgr" ON service_providers;
DROP POLICY IF EXISTS "Authenticated full access"    ON service_providers;

CREATE POLICY "service_providers_read"
  ON service_providers FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department != 'HR')
  );

CREATE POLICY "service_providers_write_exec"
  ON service_providers FOR ALL TO authenticated
  USING (is_executive()) WITH CHECK (is_executive());

CREATE POLICY "service_providers_write_mgr"
  ON service_providers FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());

CREATE POLICY "service_providers_update_mgr"
  ON service_providers FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
