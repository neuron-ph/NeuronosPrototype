-- Migration 082: Add FX header fields to journal_entries.
--
-- After this runs, `total_debit` / `total_credit` continue to be PHP base
-- amounts used for GL balancing, but every entry also carries the original
-- transaction currency, locked rate, and rate date. Per-line FX metadata is
-- stored inside the existing `lines` JSONB by write paths (see Phase 6+).

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS transaction_currency  TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate         NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS base_currency         TEXT NOT NULL DEFAULT 'PHP',
  ADD COLUMN IF NOT EXISTS source_amount         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS base_amount           NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_date    DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_base_currency_check'
  ) THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_base_currency_check
      CHECK (base_currency IN ('PHP', 'USD'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_currency
  ON journal_entries(transaction_currency);
