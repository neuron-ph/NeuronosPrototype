-- Migration 245: invoice approval step (NEU-103).
--
-- Invoices had no approval workflow (draft -> posted). NEU-103 adds an approval
-- gate between draft and finalize: on submit an invoice routes (routing_rules
-- domain='invoice') to an approver (Ma'am Ella — Operations manager), and it
-- cannot be finalized/posted until approved.
--
-- Backward-compatible: existing invoices default to 'approved' so nothing already
-- in flight is blocked; only invoices created after this migration go through
-- 'pending_approval'. approval_status is free-text (no CHECK) to match the app's
-- other status columns.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approval_status              TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS pending_approver_department  TEXT,
  ADD COLUMN IF NOT EXISTS pending_approver_role        TEXT,
  ADD COLUMN IF NOT EXISTS approved_by                  TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at                  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_approval_status ON public.invoices(approval_status);
