-- Migration 078: Add catalog_snapshot to evoucher_line_items
-- The app writes a point-in-time snapshot for catalog-linked expense items.
-- Older schemas created evoucher_line_items without this column, which causes
-- inserts to fail once the submit path includes catalog_snapshot.

ALTER TABLE evoucher_line_items
  ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB DEFAULT NULL;

-- NOTE (2026-05-04): the original UPDATE clause referenced ci.unit_type,
-- ci.tax_code, ci.default_price, ci.currency on `catalog_items`. Those
-- columns were never added to the schema (neither dev nor prod), so the
-- backfill was dead code that crashed at parse time on prod. New rows write
-- catalog_snapshot via app code; legacy rows without a snapshot stay NULL,
-- which the UI already handles. Removing the UPDATE makes the migration
-- idempotent and prod-safe.
