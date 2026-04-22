-- Billing line items are customer-billable charges. Quotation pricing may use
-- signed costs, but persisted billing amounts must stay non-negative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_line_items_amount_nonnegative'
  ) THEN
    ALTER TABLE billing_line_items
      ADD CONSTRAINT billing_line_items_amount_nonnegative
      CHECK (amount >= 0) NOT VALID;
  END IF;
END $$;
