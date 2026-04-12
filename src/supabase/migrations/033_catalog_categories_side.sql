-- Migration 033: Add side column to catalog_categories
-- Enables filtering catalog items by revenue vs expense context

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS side TEXT DEFAULT 'both'
  CONSTRAINT catalog_categories_side_check CHECK (side IN ('revenue', 'expense', 'both'));

-- Existing categories were all revenue-side (quotation charges)
UPDATE catalog_categories SET side = 'revenue' WHERE side = 'both';
