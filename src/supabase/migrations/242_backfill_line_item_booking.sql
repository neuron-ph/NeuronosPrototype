-- Migration 242: backfill evoucher_line_items.booking_id from the voucher's
-- booking (NEU-108 / Doctrine D2).
--
-- Per-line booking (NEU-089) is new; every line created before it has a null
-- booking, while its parent voucher may carry the booking at voucher level.
-- Now that per-booking expense rollups read the LINE table (not evouchers.booking_id),
-- those legacy lines must inherit their voucher's booking or they'd vanish from
-- the booking/project Expenses views. Idempotent — only fills null line bookings
-- where the voucher has one.

UPDATE evoucher_line_items li
SET booking_id = e.booking_id
FROM evouchers e
WHERE li.evoucher_id = e.id
  AND li.booking_id IS NULL
  AND e.booking_id IS NOT NULL;
