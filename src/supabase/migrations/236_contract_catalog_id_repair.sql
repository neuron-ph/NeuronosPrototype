-- 236_contract_catalog_id_repair.sql
--
-- Companion data-repair for the Apply-to-Billings FK failure. The durable fix is
-- code (resolveContractCatalogIds re-points stale contract catalog ids to the
-- live catalog by name at Apply time). This migration handles the residual names
-- that name-resolution alone can't reach on today's 8 orphaned contracts:
--
--   Bucket A — contract text that is a spelling/wording variant of an EXISTING
--              catalog item. Canonicalize the contract text so name-resolution
--              binds it to the existing item (no near-duplicate catalog rows).
--   Bucket B — charges genuinely missing from the catalog. Add them under
--              (INC) OTHER CHARGES (cat-004) so name-resolution can bind them.
--
-- Both steps are idempotent and safe to run on any environment (no-ops where the
-- data isn't present).

begin;

-- ── Bucket B: add the genuinely-missing brokerage charges to the catalog ──
-- Names match the contract particulars exactly; resolution is case/space-insensitive.
insert into public.catalog_items (id, name, category_id)
select v.id, v.name, 'cat-004'
from (values
  ('ci-bai-clearance',        'BAI CLEARANCE'),
  ('ci-dti-bps-processing',   'DTI/BPS PROCESSING'),
  ('ci-omb-processing',       'OMB PROCESSING'),
  ('ci-pcci-clearance',       'PCCI CLEARANCE'),
  ('ci-xray-examination-fee', 'X-RAY EXAMINATION FEE'),
  ('ci-processing-fee',       'Processing Fee')
) as v(id, name)
where not exists (
  select 1 from public.catalog_items ci
  where lower(trim(ci.name)) = lower(trim(v.name))
);

-- ── Bucket A: canonicalize contract particulars to their existing catalog names ──
-- Exact JSON-token replace (quotes included) — matches only full particular values,
-- never substrings. Re-running is a no-op once the variants are gone.
update public.quotations
   set details = replace(details::text, '"BPI PROCESING"',   '"BPI PROCESSING FEE"')::jsonb
 where quotation_type = 'contract' and details::text like '%"BPI PROCESING"%';

update public.quotations
   set details = replace(details::text, '"SRA PROCESSING"',  '"SRA PROCESSING FEE"')::jsonb
 where quotation_type = 'contract' and details::text like '%"SRA PROCESSING"%';

update public.quotations
   set details = replace(details::text, '"STAMPS & NOTARY"', '"STAMP AND NOTARY"')::jsonb
 where quotation_type = 'contract' and details::text like '%"STAMPS & NOTARY"%';

update public.quotations
   set details = replace(details::text, '"Stamps and Notary"', '"STAMP AND NOTARY"')::jsonb
 where quotation_type = 'contract' and details::text like '%"Stamps and Notary"%';

-- "Handling" (all occurrences are under the Brokerage category) → the brokerage
-- catalog item is named "HANDLING FEE". Canonicalize so name-resolution finds it;
-- the resolver then disambiguates the several "HANDLING FEE" items by the line's
-- catalog_category_id (cat-brokerage → the unique brokerage HANDLING FEE).
update public.quotations
   set details = replace(details::text, '"Handling"', '"HANDLING FEE"')::jsonb
 where quotation_type = 'contract' and details::text like '%"Handling"%';

commit;
