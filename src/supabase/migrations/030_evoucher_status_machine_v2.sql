-- Migration 030: E-Voucher Status Machine v2
-- Finalized architecture 2026-04-11
--
-- Changes:
-- 1. Rename pending_tl → pending_manager (all existing records)
-- 2. Rename liquidation_open → pending_liquidation
-- 3. Rename liquidation_pending → pending_verification
-- 4. Rename liquidation_closed → posted (already closed = posted)
-- 5. Add direct_expense as valid transaction type (no CHECK constraint to alter, just data)

-- ============================================================
-- 1. Rename statuses in evouchers table
-- ============================================================

UPDATE evouchers SET status = 'pending_manager' WHERE status = 'pending_tl';
UPDATE evouchers SET status = 'pending_liquidation' WHERE status = 'liquidation_open';
UPDATE evouchers SET status = 'pending_verification' WHERE status = 'liquidation_pending';
UPDATE evouchers SET status = 'posted' WHERE status = 'liquidation_closed';

-- ============================================================
-- 2. Rename statuses in evoucher_history table (audit trail)
-- ============================================================

UPDATE evoucher_history SET status = 'pending_manager' WHERE status = 'pending_tl';
UPDATE evoucher_history SET status = 'pending_liquidation' WHERE status = 'liquidation_open';
UPDATE evoucher_history SET status = 'pending_verification' WHERE status = 'liquidation_pending';
UPDATE evoucher_history SET status = 'posted' WHERE status = 'liquidation_closed';

-- ============================================================
-- 3. Add liquidated_at timestamp for tracking when rep submits
-- ============================================================

ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS liquidated_at TIMESTAMPTZ;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
