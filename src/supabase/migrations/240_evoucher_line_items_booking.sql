-- Migration 240: E-Voucher line items — per-line booking linkage (NEU-089)
--
-- Booking attribution moves from one-per-voucher (evouchers.booking_id) to
-- per-line-item, so a single voucher can spread its particulars across bookings.
-- Upholds D1 (booking/project linkage) at line granularity and is the foundation
-- for the cash-advance "Project Expense Budget" allocation (NEU-104), where each
-- line = a booking + an amount. Nullable — direct/office-expense lines carry none.

ALTER TABLE evoucher_line_items
  ADD COLUMN IF NOT EXISTS booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eli_booking ON evoucher_line_items(booking_id);
