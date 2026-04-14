-- Migration 032: allow all authenticated voucher flows to write history
-- The application records history for creation, submission, approval,
-- posting, and liquidation across multiple departments. Restricting inserts
-- to Accounting/Executive causes partial writes where the voucher is saved
-- but the audit trail fails.

DROP POLICY IF EXISTS "evoucher_history_insert" ON evoucher_history;

CREATE POLICY "evoucher_history_insert"
  ON evoucher_history FOR INSERT TO authenticated
  WITH CHECK (true);
