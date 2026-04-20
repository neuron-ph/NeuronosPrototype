-- Migration 053 - enforce billable expense auto-billing at the database boundary.
--
-- Frontend approval handlers call ensure_billable_expense_billing_item(), but the
-- invariant belongs in the database too: once a billable, booking-linked EV reaches
-- Accounting approval, a billing_line_items row should exist.

CREATE OR REPLACE FUNCTION ensure_billable_expense_billing_item_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN (
    'pending_accounting',
    'disbursed',
    'pending_liquidation',
    'pending_verification',
    'posted'
  )
  AND COALESCE((NEW.details->>'is_billable')::boolean, false)
  AND NEW.booking_id IS NOT NULL
  AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.details IS DISTINCT FROM NEW.details
    OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
  ) THEN
    PERFORM ensure_billable_expense_billing_item(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_billable_expense_billing_on_approval ON evouchers;

CREATE TRIGGER trg_ensure_billable_expense_billing_on_approval
AFTER INSERT OR UPDATE OF status, details, booking_id ON evouchers
FOR EACH ROW
EXECUTE FUNCTION ensure_billable_expense_billing_item_on_approval();

-- Repair EVs that already passed CEO/accounting approval before this trigger existed.
SELECT ensure_billable_expense_billing_item(id)
FROM evouchers
WHERE status IN (
  'pending_accounting',
  'disbursed',
  'pending_liquidation',
  'pending_verification',
  'posted'
)
AND COALESCE((details->>'is_billable')::boolean, false)
AND booking_id IS NOT NULL;
