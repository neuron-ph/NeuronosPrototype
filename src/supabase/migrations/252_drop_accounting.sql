-- Migration 252: drop the double-entry accounting schema.
--
-- Phase 6 (final) of docs/ACCOUNTING_REMOVAL_PLAN.md. The end of the ledger.
--
-- INVERSE PROVEN BEFORE RUNNING. docs/archive/accounting-v1-restore.sql was
-- generated from this exact live schema and verified on dev by a full
-- drop -> restore -> fingerprint-compare -> drop cycle. The fingerprint matched
-- identically either side of the restore:
--
--     59 columns · 16 constraints · 18 indexes · 12 policies · 4 triggers · 3 functions
--
-- An untested inverse is not an inverse; this one was executed, not asserted.
--
-- NOT TOUCHED — deliberately:
--   bank_accounts  the remittance block printed on invoices (bank name / account
--                  name / account number the customer pays into). Shares the word
--                  "account" with the chart of accounts and nothing else.
--
-- DEFENSIVE DROPS: journal_lines and transaction_journal_entries never existed on
-- dev. journal_entries carried its lines in a JSONB `lines` column, and migration
-- 243's Transaction Journal table was never applied here. Included so the
-- migration is correct against any environment that does have them.
--
-- DEV ONLY at time of writing. Prod is Release B and needs Marcus's explicit
-- word — code rollback restores code, not schema, so the prod code removal must
-- soak first with these tables orphaned-but-intact.

DROP TRIGGER IF EXISTS trg_update_account_balances_on_je_insert ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_set_journal_entry_number ON public.journal_entries;

DROP TABLE IF EXISTS public.transaction_journal_entries CASCADE;
DROP TABLE IF EXISTS public.journal_lines  CASCADE;
DROP TABLE IF EXISTS public.journal_entries CASCADE;
DROP TABLE IF EXISTS public.account_detail_types CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;

DROP FUNCTION IF EXISTS public.get_account_balances(timestamp with time zone, timestamp with time zone, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.set_journal_entry_number() CASCADE;
DROP FUNCTION IF EXISTS public.update_account_balances_on_je_insert() CASCADE;

-- Stale record-visibility dials for record types that no longer exist. The
-- editor rows went in Phase 4 (recordVisibilityConfig); these are the stored
-- values that sat behind them — 46 profiles on dev.
UPDATE public.permission_overrides
SET visibility_scopes = visibility_scopes - 'transactions' - 'journal_entries' - 'financial_filings',
    updated_at = now()
WHERE visibility_scopes ?| array['transactions','journal_entries','financial_filings'];
