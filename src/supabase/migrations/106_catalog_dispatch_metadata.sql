-- ---------------------------------------------------------------------------
-- 106_catalog_dispatch_metadata.sql
--
-- Catalog-first contract billing refactor — Phase A.
--
-- Today the contract rate engine reads dispatch metadata from three scattered
-- places: category.kind, row.applies_when, and (for delivery) the row's
-- particular/remarks free text. Pricing has to redo the same dispatch decisions
-- on every contract.
--
-- This migration moves dispatch metadata onto the catalog item itself, where
-- it belongs: an item like "BAI Processing" carries its dispatch behaviour
-- (optional, permit-triggered, value "BAI") once for the whole system. Every
-- contract that picks BAI Processing inherits the behaviour automatically.
--
-- Schema: three new nullable columns + a CHECK constraint that enforces
-- trigger_field/trigger_value are present iff dispatch_kind = 'optional'.
--
-- Backwards compatibility: null dispatch_kind means "standard" (always-bill,
-- current behaviour). Existing catalog items continue to work unchanged.
--
-- Seed: pattern-allowlist UPDATE for known item families. Items not matching
-- any pattern stay null = standard. Marcus reviews the seed effect on dev
-- (which catalog items got tagged) before this migration is applied to prod.
--
-- @see /docs/blueprints/CATALOG_FIRST_BILLING_BLUEPRINT.md
-- ---------------------------------------------------------------------------

alter table public.catalog_items
  add column dispatch_kind  text check (dispatch_kind in ('standard', 'optional', 'delivery')),
  add column trigger_field  text check (trigger_field  in ('permits', 'examinations')),
  add column trigger_value  text;

-- Sanity: trigger_field + trigger_value are only meaningful when
-- dispatch_kind = 'optional'. The constraint also allows the all-null state
-- (catalog item with no dispatch hint = legacy/standard default).
alter table public.catalog_items
  add constraint catalog_items_trigger_consistency check (
    (dispatch_kind = 'optional' and trigger_field is not null and trigger_value is not null)
    or (dispatch_kind in ('standard', 'delivery') and trigger_field is null and trigger_value is null)
    or (dispatch_kind is null and trigger_field is null and trigger_value is null)
  );

-- ---------------------------------------------------------------------------
-- Seed allowlist
-- Pattern-match by name (case-insensitive). Items not matching any pattern
-- stay null = standard. Re-runnable: each UPDATE only touches still-null rows.
-- ---------------------------------------------------------------------------

-- Permits: BAI / SRA / BPI / FDA / BPS / LTO / PNP / NTC processing
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'BAI'
  where name ilike '%BAI%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'SRA'
  where name ilike '%SRA%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'BPI'
  where name ilike '%BPI%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'FDA'
  where name ilike '%FDA%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'BPS'
  where name ilike '%BPS%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'LTO'
  where name ilike '%LTO%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'PNP-FEO'
  where name ilike '%PNP%' and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'permits', trigger_value = 'NTC'
  where name ilike '%NTC%' and dispatch_kind is null;

-- Examinations: X-Ray / Spotcheck / DEA
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'examinations', trigger_value = 'X-ray'
  where (name ilike '%X-Ray%' or name ilike '%X Ray%' or name ilike '%XRay%')
    and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'examinations', trigger_value = 'Spotcheck'
  where (name ilike '%Spotcheck%' or name ilike '%Spot Check%') and dispatch_kind is null;
update public.catalog_items set dispatch_kind = 'optional', trigger_field = 'examinations', trigger_value = 'DEA'
  where name ilike '%DEA%' and dispatch_kind is null;

-- Delivery: container/vehicle type items. These get dispatch_kind='delivery'
-- (no trigger fields — the delivery dispatcher matches catalog item name
-- against booking container_type, then narrows by row remarks → address).
update public.catalog_items set dispatch_kind = 'delivery'
  where (name ilike '%20ft%' or name ilike '%40ft%' or name ilike '%45ft%'
      or name ilike '%Back to Back%' or name ilike '%Back-to-Back%' or name ilike '%BackToBack%'
      or name ilike '%Wheeler%')
    and dispatch_kind is null;
