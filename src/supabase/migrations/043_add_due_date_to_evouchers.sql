-- Migration 043: Add due_date to evouchers
-- Allows requestors to specify a payment due date on vouchers.

ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS due_date DATE;
