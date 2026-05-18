-- ---------------------------------------------------------------------------
-- 107_backfill_contract_rate_catalog_binding.sql
--
-- Catalog-first contract billing refactor — Phase C backfill.
--
-- For every contract rate matrix row in quotations.details.rate_matrices[*],
-- if the row has no catalog_item_id but its `particular` text exactly matches
-- (after normalization) a catalog item's name, bind the row to that catalog
-- item. Phase B's engine then reads dispatch metadata from the bound catalog
-- item instead of relying on legacy row.applies_when / category.kind.
--
-- Match policy: EXACT match only after normalization (uppercase, strip
-- non-alphanumeric, collapse whitespace). Fuzzy matching is intentionally
-- omitted — silent wrong binding of legacy rows to the wrong catalog item
-- would be worse than leaving them unbound. Unbound rows surface in the
-- editor with an UNBOUND badge so Pricing can resolve them manually.
--
-- Idempotent: rows that already have catalog_item_id are skipped.
-- Both matrix.rows[] and matrix.categories[*].rows[] are updated in lockstep
-- so the editor (which reads from categories on render and writes back to
-- matrix.rows on save) sees a consistent view.
--
-- After running this migration, query the unbound-rows view at the end of
-- this file to see what's left for Pricing to bind manually.
--
-- @see /docs/blueprints/CATALOG_FIRST_BILLING_BLUEPRINT.md
-- ---------------------------------------------------------------------------

-- Helper: normalize a name for exact-match comparison.
-- Steps (in order):
--   1. Insert a space between digit-letter / letter-digit boundaries so that
--      "4Wheeler" and "4-Wheeler" both normalize to "4 WHEELER". Without this
--      step the two would be unequal and the backfill would miss the match.
--   2. Uppercase.
--   3. Replace any non-alphanumeric run with a single space.
--   4. Collapse multiple spaces and trim.
create or replace function public.__catalog_backfill_normalize(name text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      upper(regexp_replace(
        regexp_replace(coalesce(name, ''), '(\d)([A-Za-z])', '\1 \2', 'g'),
        '([A-Za-z])(\d)', '\1 \2', 'g'
      )),
      '[^A-Z0-9]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- Helper: given a row JSONB, return the same row with catalog_item_id set
-- if (a) it's currently null AND (b) a catalog item exists whose normalized
-- name matches the row's normalized particular.
create or replace function public.__catalog_backfill_bind_row(row_in jsonb)
returns jsonb language plpgsql stable as $$
declare
  current_id text;
  particular_norm text;
  match_id text;
begin
  current_id := row_in->>'catalog_item_id';
  if current_id is not null and current_id <> '' then
    return row_in;  -- already bound
  end if;

  particular_norm := trim(public.__catalog_backfill_normalize(row_in->>'particular'));
  if particular_norm = '' then
    return row_in;  -- nothing to match against
  end if;

  -- Exact normalized match against catalog_items.name.
  -- If multiple catalog items normalize to the same name (shouldn't happen but
  -- guard anyway), pick the most recently created — assumes latest is canonical.
  select id into match_id
  from public.catalog_items
  where trim(public.__catalog_backfill_normalize(name)) = particular_norm
  order by created_at desc nulls last
  limit 1;

  if match_id is null then
    return row_in;  -- no match → leave unbound
  end if;

  return jsonb_set(row_in, '{catalog_item_id}', to_jsonb(match_id));
end
$$;

-- Main backfill: walk every quotation that has rate matrices, rebuild the
-- details JSONB with backfilled rows in both flat and nested arrays.
do $migrate$
declare
  q record;
  new_rate_matrices jsonb;
  matrix jsonb;
  new_matrix jsonb;
  new_rows jsonb;
  new_categories jsonb;
  category jsonb;
  new_category jsonb;
  new_category_rows jsonb;
begin
  for q in
    select id, details
    from public.quotations
    where jsonb_typeof(details->'rate_matrices') = 'array'
      and jsonb_array_length(details->'rate_matrices') > 0
  loop
    new_rate_matrices := '[]'::jsonb;

    for matrix in select * from jsonb_array_elements(q.details->'rate_matrices')
    loop
      -- Backfill the flat rows array
      if jsonb_typeof(matrix->'rows') = 'array' then
        select coalesce(jsonb_agg(public.__catalog_backfill_bind_row(r)), '[]'::jsonb)
          into new_rows
          from jsonb_array_elements(matrix->'rows') r;
      else
        new_rows := matrix->'rows';
      end if;

      -- Backfill each category's nested rows array
      if jsonb_typeof(matrix->'categories') = 'array' then
        new_categories := '[]'::jsonb;
        for category in select * from jsonb_array_elements(matrix->'categories')
        loop
          if jsonb_typeof(category->'rows') = 'array' then
            select coalesce(jsonb_agg(public.__catalog_backfill_bind_row(r)), '[]'::jsonb)
              into new_category_rows
              from jsonb_array_elements(category->'rows') r;
          else
            new_category_rows := category->'rows';
          end if;
          new_category := jsonb_set(category, '{rows}', new_category_rows);
          new_categories := new_categories || jsonb_build_array(new_category);
        end loop;
      else
        new_categories := matrix->'categories';
      end if;

      new_matrix := matrix;
      new_matrix := jsonb_set(new_matrix, '{rows}', new_rows);
      if new_categories is not null then
        new_matrix := jsonb_set(new_matrix, '{categories}', new_categories);
      end if;

      new_rate_matrices := new_rate_matrices || jsonb_build_array(new_matrix);
    end loop;

    update public.quotations
      set details = jsonb_set(q.details, '{rate_matrices}', new_rate_matrices)
      where id = q.id;
  end loop;
end
$migrate$;

-- Cleanup helper functions — leave normalize() in place as it's useful for
-- the unbound-rows report below; drop the bind_row helper since it's not
-- needed at runtime.
drop function if exists public.__catalog_backfill_bind_row(jsonb);

-- ---------------------------------------------------------------------------
-- Report view: rows still unbound after backfill.
-- Run `select * from public.__catalog_backfill_unbound_rows;` to see what's
-- left for Pricing to resolve manually via the UNBOUND badge in the editor.
-- This is a transient diagnostic view — drop it after Pricing finishes.
-- ---------------------------------------------------------------------------
create or replace view public.__catalog_backfill_unbound_rows as
select
  q.id            as quotation_id,
  q.quote_number  as quote_number,
  q.customer_name as customer_name,
  matrix->>'service_type' as service_type,
  row_data->>'id'         as row_id,
  row_data->>'particular' as particular,
  trim(public.__catalog_backfill_normalize(row_data->>'particular')) as particular_normalized
from public.quotations q
cross join lateral jsonb_array_elements(q.details->'rate_matrices') matrix
cross join lateral jsonb_array_elements(matrix->'rows') row_data
where (row_data->>'catalog_item_id' is null or row_data->>'catalog_item_id' = '')
  and trim(public.__catalog_backfill_normalize(row_data->>'particular')) <> ''
order by q.quote_number, matrix->>'service_type', row_data->>'particular';
