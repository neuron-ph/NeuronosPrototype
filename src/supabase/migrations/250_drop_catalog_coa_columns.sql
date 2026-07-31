-- Migration 250: unweld the Catalog from the Chart of Accounts (schema half).
--
-- Phase 1b of docs/ACCOUNTING_REMOVAL_PLAN.md. The UI half shipped in a06edca;
-- this drops the columns themselves.
--
-- Migration 241 (NEU-091) added the two-level link so every catalog line item
-- resolved to a real GL account, and 247 backfilled all 335 items / 31 categories
-- and made both NOT NULL so the AP two-step "had something to debit". With the
-- General Journal gone there is nothing to debit and nothing to seed.
--
-- ORDERING NOTE — this deliberately did NOT ship with the UI change. Until
-- Phase 2 landed, utils/accounting/buildLiquidationClosingEntry.ts still ran
-- `from("catalog_items").select("id, account_id")` at liquidation time, so
-- dropping the column early would have broken e-voucher liquidation at runtime
-- (Postgres permits the drop; the running app did not survive it). That reader
-- is now deleted, so the column is finally free.
--
-- Idempotent and re-runnable.

DROP INDEX IF EXISTS idx_catalog_items_account;
DROP INDEX IF EXISTS idx_catalog_categories_parent_account;

ALTER TABLE public.catalog_items      DROP COLUMN IF EXISTS account_id;
ALTER TABLE public.catalog_categories DROP COLUMN IF EXISTS parent_account_id;
