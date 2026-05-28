-- Add columns to persist rate calculation breakdown on billing line items
ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS rule_applied text,
  ADD COLUMN IF NOT EXISTS condition_label text;

COMMENT ON COLUMN billing_line_items.rule_applied IS 'Human-readable calculation breakdown, e.g. "7 containers × ₱3,500/container"';
COMMENT ON COLUMN billing_line_items.condition_label IS 'Why this charge was included, e.g. "Booking has X-ray examination"';
