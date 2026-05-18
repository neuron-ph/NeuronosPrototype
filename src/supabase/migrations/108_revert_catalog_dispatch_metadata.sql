-- ---------------------------------------------------------------------------
-- 108_revert_catalog_dispatch_metadata.sql
--
-- Reverts migration 106 (catalog_items dispatch metadata).
--
-- Why: the catalog-first dispatch model was the wrong call. Dispatch behaviour
-- belongs on the contract editor — Pricing declares "this category bills as
-- standard / optional / delivery" via the Kind chip selector at contract time.
-- The catalog stays a pure-identity surface (name + category + side).
--
-- Reasoning per the original mental model:
--   "catalogs as it is already works fine, they only take weight when
--    actually turned to billings"
--
-- Engine reads dispatch from row.applies_when → category.kind → 'standard'
-- (no catalog lookup) after this revert. The walk-back keeps the per-row
-- engine routing from Phase B and the row→catalog_item_id binding from
-- Phase C, but drops the catalog metadata layer entirely.
-- ---------------------------------------------------------------------------

alter table public.catalog_items
  drop constraint if exists catalog_items_trigger_consistency;

alter table public.catalog_items
  drop column if exists dispatch_kind,
  drop column if exists trigger_field,
  drop column if exists trigger_value;
