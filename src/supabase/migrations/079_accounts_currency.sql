-- Migration 079: Add real currency persistence to the chart of accounts.
--
-- Phase 2 of the USD multi-currency accounting plan. Phase 1 (PHP-functional
-- accounting) already assumed every account was implicitly PHP. The UI exposed
-- a currency selector but it never round-tripped to the DB. This migration
-- introduces an authoritative `currency` column and locks it to PHP/USD.
--
-- Rule of thumb after this runs:
--   - leaf cash/bank accounts may be PHP or USD
--   - revenue/expense/equity accounts stay PHP (the GL functional currency)
--   - reporting and GL balancing remain PHP-based regardless of leaf currency

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PHP';

-- Backfill any pre-existing rows that may have NULLs from older snapshots.
UPDATE accounts SET currency = 'PHP' WHERE currency IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_currency_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_currency_check
      CHECK (currency IN ('PHP', 'USD'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);
