-- Migration 084: Seed an explicit USD bank account for dev/testing.
--
-- Phase 12 of the multi-currency rollout. The base COA (migration 045) is
-- entirely PHP. Once the new currency-aware posting flows ship, dev/staging
-- needs at least one USD-denominated cash account so QA can post USD
-- documents end-to-end without doing manual setup hacks.
--
-- Production teams who want to mirror this should insert their own USD
-- account with a code that matches their banking conventions.

INSERT INTO accounts (
  id, code, name, type, sub_type, category, normal_balance,
  is_active, is_system, sort_order, balance, starting_amount, currency
)
VALUES (
  'coa-1090', '1090', 'Cash in Bank - USD',
  'asset', 'Current Assets', 'Assets', 'debit',
  true, false, 190, 0, 0, 'USD'
)
ON CONFLICT (id) DO NOTHING;
