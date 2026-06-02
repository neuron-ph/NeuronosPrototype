-- ============================================================================
-- 135: Allow the Pricing department to manage consignees
-- ----------------------------------------------------------------------------
-- The Customers screen (and its inline "Add consignee" control) is shared with
-- the Pricing department, but the consignees RLS policies from migration 005
-- only permitted Business Development / Operations / Executive. Pricing users
-- could read consignees but every INSERT/UPDATE/DELETE was silently rejected by
-- RLS, so added consignees never persisted. Add 'Pricing' to those policies.
-- ============================================================================

DROP POLICY IF EXISTS "consignees_insert" ON consignees;
CREATE POLICY "consignees_insert"
  ON consignees FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Executive'));

DROP POLICY IF EXISTS "consignees_update" ON consignees;
CREATE POLICY "consignees_update"
  ON consignees FOR UPDATE
  TO authenticated
  USING (get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Executive'));

DROP POLICY IF EXISTS "consignees_delete" ON consignees;
CREATE POLICY "consignees_delete"
  ON consignees FOR DELETE
  TO authenticated
  USING (
    get_my_department() IN ('Business Development', 'Pricing', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );
