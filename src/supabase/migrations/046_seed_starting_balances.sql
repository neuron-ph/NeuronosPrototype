-- Migration 046: Backfill starting_amount for any accounts where it is still NULL or 0
-- and balance > 0. Ensures starting_amount reflects the known opening balance
-- for accounts that had a balance before this column was introduced.

UPDATE accounts
SET starting_amount = COALESCE(balance, 0)
WHERE (starting_amount IS NULL OR starting_amount = 0)
  AND COALESCE(balance, 0) > 0;
