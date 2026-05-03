-- Migration 081: Add FX metadata to source documents.
--
-- Every posted document needs to carry both its original-currency amount and
-- the locked PHP equivalent that was used at posting time. Reports aggregate
-- on the base columns; the original columns stay around for drill-down/audit.
--
-- Tables touched:
--   - invoices
--   - collections
--   - evouchers
--   - expenses
--   - billing_line_items (line-level base amount only, for reporting)
--
-- The companion backfill (083) populates these columns for existing rows so
-- new read paths can rely on them.

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS original_currency   TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency       TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_amount         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_date  DATE;

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS original_currency   TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency       TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_amount         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_date  DATE;

-- ---------------------------------------------------------------------------
-- evouchers
-- ---------------------------------------------------------------------------
ALTER TABLE evouchers
  ADD COLUMN IF NOT EXISTS original_currency   TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency       TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_amount         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_date  DATE;

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS original_currency   TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency       TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_amount         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_date  DATE;

-- ---------------------------------------------------------------------------
-- billing_line_items
-- Only the minimum needed for reporting normalization. Original currency and
-- amount are already present on the row via the existing `currency`/`amount`
-- columns; we add a base equivalent so reports can sum without per-row math.
-- ---------------------------------------------------------------------------
ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS exchange_rate   NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency   TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS base_amount     NUMERIC(15, 2);

-- ---------------------------------------------------------------------------
-- Constraints (apply once data is backfilled — see migration 083)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_base_currency_check'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collections_base_currency_check'
  ) THEN
    ALTER TABLE collections ADD CONSTRAINT collections_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evouchers_base_currency_check'
  ) THEN
    ALTER TABLE evouchers ADD CONSTRAINT evouchers_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_base_currency_check'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_line_items_base_currency_check'
  ) THEN
    ALTER TABLE billing_line_items ADD CONSTRAINT billing_line_items_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_invoices_original_currency ON invoices(original_currency);
CREATE INDEX IF NOT EXISTS idx_collections_original_currency ON collections(original_currency);
CREATE INDEX IF NOT EXISTS idx_evouchers_original_currency ON evouchers(original_currency);
CREATE INDEX IF NOT EXISTS idx_expenses_original_currency ON expenses(original_currency);
