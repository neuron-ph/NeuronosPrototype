-- NEU-069: EWT (Expanded Withholding Tax) — per-billing-item capture, internal only.
--
-- A billing charge (service income only — brokerage/forwarding) can be withheld
-- upon by the customer. We capture the rate PER line item and snapshot the peso
-- amount at gross (amount * rate/100, per Marcus). EWT NEVER appears on the printed
-- invoice — it is purely internal. It reduces the invoice's collectible balance so
-- the invoice closes cleanly when the net (total - ewt_total) is remitted.

ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS ewt_rate numeric,     -- percent: 2 / 10 / 15; null or 0 = not subject
  ADD COLUMN IF NOT EXISTS ewt_amount numeric;   -- snapshot = amount * ewt_rate/100 (gross base)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ewt_total numeric;     -- Σ ewt_amount of the invoiced lines

COMMENT ON COLUMN billing_line_items.ewt_rate IS 'EWT rate in percent (2/10/15); null or 0 = not subject. NEU-069.';
COMMENT ON COLUMN billing_line_items.ewt_amount IS 'Withheld amount snapshot = amount * ewt_rate/100 (gross base). NEU-069.';
COMMENT ON COLUMN invoices.ewt_total IS 'Sum of invoiced line ewt_amount. Internal only — never printed. Reduces the collectible balance so the invoice closes when the net (total - ewt_total) is paid. NEU-069.';
