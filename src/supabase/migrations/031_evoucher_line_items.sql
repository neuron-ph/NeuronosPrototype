-- Migration 031: E-Voucher Line Items — JSONB to Relational
-- Phase 0 of catalog overhaul plan
-- Prerequisite for catalog_item_id linkage on expense line items

-- ============================================================
-- 1. Create evoucher_line_items table
-- ============================================================

CREATE TABLE evoucher_line_items (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  evoucher_id     TEXT NOT NULL REFERENCES evouchers(id) ON DELETE CASCADE,
  particular      TEXT,
  description     TEXT,
  amount          NUMERIC(15,2) DEFAULT 0,
  catalog_item_id TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,
  catalog_snapshot JSONB DEFAULT NULL,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_eli_evoucher ON evoucher_line_items(evoucher_id);
CREATE INDEX idx_eli_catalog  ON evoucher_line_items(catalog_item_id);

-- ============================================================
-- 2. RLS policies (open to authenticated, matches evouchers table)
-- ============================================================

ALTER TABLE evoucher_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evoucher_line_items_select"
  ON evoucher_line_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "evoucher_line_items_insert"
  ON evoucher_line_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "evoucher_line_items_update"
  ON evoucher_line_items FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "evoucher_line_items_delete"
  ON evoucher_line_items FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. Data migration (JSONB → relational)
-- ============================================================
-- NOTE: Dev DB had 0 evoucher rows at migration time.
-- If applying to a DB with existing JSONB line_items, run:
--
-- INSERT INTO evoucher_line_items (id, evoucher_id, particular, description, amount, sort_order)
-- SELECT
--   COALESCE(item->>'id', gen_random_uuid()::TEXT),
--   e.id,
--   item->>'particular',
--   item->>'description',
--   COALESCE((item->>'amount')::NUMERIC(15,2), 0),
--   idx.ordinality::INTEGER - 1
-- FROM evouchers e,
--      jsonb_array_elements(e.line_items) WITH ORDINALITY AS idx(item, ordinality)
-- WHERE e.line_items IS NOT NULL
--   AND e.line_items != '[]'::jsonb
--   AND jsonb_array_length(e.line_items) > 0;
