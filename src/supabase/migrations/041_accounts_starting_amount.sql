-- Migration 041: Add starting_amount to accounts table
-- starting_amount stores the opening balance set by the user at account creation.
-- balance = starting_amount + net transaction activity.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS starting_amount NUMERIC(15,2) DEFAULT 0;

-- Backfill: treat existing balances as their own starting amount
-- (since we have no transaction history to separate out)
UPDATE accounts
SET starting_amount = COALESCE(balance, 0)
WHERE starting_amount = 0;
