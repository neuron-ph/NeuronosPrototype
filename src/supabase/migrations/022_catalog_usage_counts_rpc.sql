-- 022_catalog_usage_counts_rpc.sql
-- Aggregate usage counts for catalog items across billing_line_items.
-- Replaces full-table fetch + JS count in CatalogManagementPage.

create or replace function get_catalog_usage_counts()
returns table(catalog_item_id uuid, usage_count bigint)
language sql
stable
security definer
as $$
  select catalog_item_id, count(*) as usage_count
  from billing_line_items
  where catalog_item_id is not null
  group by catalog_item_id;
$$;
