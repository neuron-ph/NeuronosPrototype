-- 112_merge_shipping_lines_into_carriers.sql
-- Per client clarification, "Shipping Line" and "Carrier" refer to the same
-- vendor. The Trucking FCL Shipping Line dropdown now reads from carriers,
-- so the standalone profile_shipping_lines table is dropped after backfilling
-- carriers and repointing any historical booking JSON.

begin;

-- 1. Backfill carriers with every active shipping line name we don't already have.
insert into public.profile_carriers (name, sort_order, is_active)
select sl.name, coalesce(sl.sort_order, 999), coalesce(sl.is_active, true)
from public.profile_shipping_lines sl
where sl.name is not null
  and trim(sl.name) <> ''
on conflict (name) do nothing;

-- 2. Repoint historical bookings.details->'shipping_line' references from the
--    old shipping-line id to the matching carrier id (matched by exact name)
--    and rewrite profileType to 'carrier'. Rows without a resolvable carrier
--    are left untouched — the field will still render the cached label, just
--    without a linked id.
with mapping as (
  select sl.id::text as old_id, c.id::text as new_id
  from public.profile_shipping_lines sl
  join public.profile_carriers c on c.name = sl.name
)
update public.bookings b
set details = jsonb_set(
  b.details,
  '{shipping_line}',
  jsonb_build_object(
    'id', m.new_id,
    'label', b.details->'shipping_line'->>'label',
    'profileType', 'carrier',
    'source', coalesce(b.details->'shipping_line'->>'source', 'linked')
  ),
  true
)
from mapping m
where b.details ? 'shipping_line'
  and b.details->'shipping_line'->>'id' = m.old_id;

-- 3. Drop the now-redundant table. CASCADE handles any leftover policies/grants.
drop table if exists public.profile_shipping_lines cascade;

commit;
