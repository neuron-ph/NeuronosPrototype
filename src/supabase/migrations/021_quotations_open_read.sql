-- ============================================================================
-- 021: Fix quotations SELECT policy
-- ============================================================================
-- A Pricing staff member can only see quotations they personally created
-- under the 019 policy (can_access_record(created_by)). This breaks the
-- workflow where a manager creates or assigns a quotation to a staff member,
-- and cross-team visibility within Pricing and BD.
-- Quotations are workflow documents — all permitted departments should see
-- all quotations, with write access still controlled by separate policies.
-- ============================================================================

DROP POLICY IF EXISTS "quotations_select" ON quotations;

CREATE POLICY "quotations_select" ON quotations FOR SELECT TO authenticated
  USING (
    get_my_department() IN ('Pricing', 'Business Development', 'Executive', 'Operations', 'Accounting')
  );
