-- 207_backfill_forwarding_evouchers_to_pricing.sql
-- Retroactively apply the forwarding-job routing rule (migration 205) to
-- E-Vouchers that are STILL awaiting manager approval, so they move from the
-- requestor's own manager queue to the Pricing Manager (Jayson Nabos) queue.
--
-- Only status='pending_manager' rows are touched — that's the only status the
-- approval queue filters on. Approved / disbursed / posted vouchers are left
-- alone so their historical approver record stays accurate. Idempotent (the
-- IS DISTINCT FROM guard makes re-runs no-ops).

UPDATE public.evouchers e
SET pending_approver_department = 'Pricing',
    pending_approver_role       = 'manager',
    updated_at                  = now()
FROM public.bookings b
WHERE e.booking_id = b.id
  AND b.service_type = 'Forwarding'
  AND e.status = 'pending_manager'
  AND e.pending_approver_department IS DISTINCT FROM 'Pricing';
