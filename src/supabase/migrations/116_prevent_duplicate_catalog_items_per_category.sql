-- ============================================================================
-- Migration 116 — Prevent redundant catalog items per category
-- ============================================================================
-- Allows the same item name in different categories, but blocks future inserts
-- or updates that would create another normalized name in the same category.
-- Existing duplicates are left untouched so this migration can be applied safely
-- before cleanup/merge work.

CREATE OR REPLACE FUNCTION prevent_duplicate_catalog_item_per_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  duplicate_name text;
BEGIN
  SELECT name
    INTO duplicate_name
  FROM catalog_items
  WHERE id IS DISTINCT FROM NEW.id
    AND category_id IS NOT DISTINCT FROM NEW.category_id
    AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) =
        lower(regexp_replace(btrim(NEW.name), '\s+', ' ', 'g'))
  LIMIT 1;

  IF duplicate_name IS NOT NULL THEN
    RAISE EXCEPTION 'Catalog item "%" already exists in this category', duplicate_name
      USING ERRCODE = '23505';
  END IF;

  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_catalog_item_per_category ON catalog_items;

CREATE TRIGGER trg_prevent_duplicate_catalog_item_per_category
BEFORE INSERT OR UPDATE OF name, category_id ON catalog_items
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_catalog_item_per_category();
