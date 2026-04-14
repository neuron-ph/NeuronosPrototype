-- Allow requestors to remove their own stale EVouchers while preserving
-- broader delete access for Accounting managers and executives.

DROP POLICY IF EXISTS "evouchers_delete" ON evouchers;

CREATE POLICY "evouchers_delete" ON evouchers FOR DELETE TO authenticated
  USING (
    (
      created_by = get_my_profile_id()
      AND (
        status IN ('draft', 'rejected', 'cancelled')
        OR get_my_role() IN ('manager', 'team_leader')
      )
    )
    OR (get_my_role() = 'manager' AND get_my_department() = 'Accounting')
    OR is_executive()
  );
