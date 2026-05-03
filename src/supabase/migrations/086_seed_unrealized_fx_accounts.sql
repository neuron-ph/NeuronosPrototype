-- Migration 086: seed Unrealized FX gain/loss accounts.
--
-- Period-end FX revaluation marks open USD AR/AP balances to the period-end
-- spot rate, posting the delta to one of these two accounts. The reversing
-- entry on day 1 of the next period reverses against the same accounts so
-- that net P&L impact is recognized only when the position settles
-- (becoming realized FX in 4510/7010).
--
-- Codes 4520 and 7020 are already used by Miscellaneous Income and Loss on
-- Disposal of Assets respectively (see migration 045), so unrealized FX uses
-- 4530 / 7030.

INSERT INTO accounts (
  id, code, name, type, sub_type, category, normal_balance,
  is_active, is_system, sort_order, starting_amount, balance, currency
)
VALUES
  ('coa-4530','4530','Unrealized Foreign Exchange Gain','revenue','Other Income','Income Statement','credit', true, true, 3530, 0, 0, 'PHP'),
  ('coa-7030','7030','Unrealized Foreign Exchange Loss','expense','Other Expenses','Income Statement','debit',  true, true, 6030, 0, 0, 'PHP')
ON CONFLICT (code) DO NOTHING;
