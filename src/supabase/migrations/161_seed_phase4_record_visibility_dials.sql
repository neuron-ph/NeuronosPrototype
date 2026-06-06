-- NEU-012 Phase 4 — seed dials for the newly-covered record types (additive).
-- Adds the new record-type keys to every profile + override's visibility_scopes,
-- defaulting from the same legacy scope mapping used in migration 157. Nothing
-- reads these until the RLS flip (162), so this is non-breaking.

create or replace function public._map_legacy_scope(p text) returns text
language sql immutable as $$
  select case lower(coalesce(p,'own'))
    when 'own' then 'own' when 'team' then 'team'
    when 'department' then 'everything' when 'department_wide' then 'everything'
    when 'selected_departments' then 'everything' when 'cross_department' then 'everything'
    when 'all' then 'everything' when 'full' then 'everything'
    else 'own' end;
$$;

update public.access_profiles ap
set visibility_scopes = ap.visibility_scopes || (
  select jsonb_object_agg(k, public._map_legacy_scope(ap.visibility_scope))
  from unnest(array['projects','transactions','journal_entries','budget_requests',
    'activities','financial_filings','memos','tickets','liquidations']) k
  where not (ap.visibility_scopes ? k)
)
where exists (
  select 1 from unnest(array['projects','transactions','journal_entries','budget_requests',
    'activities','financial_filings','memos','tickets','liquidations']) k
  where not (ap.visibility_scopes ? k)
);

update public.permission_overrides po
set visibility_scopes = po.visibility_scopes || (
  select jsonb_object_agg(k, public._map_legacy_scope(po.scope))
  from unnest(array['projects','transactions','journal_entries','budget_requests',
    'activities','financial_filings','memos','tickets','liquidations']) k
  where not (po.visibility_scopes ? k)
)
where po.scope is not null and exists (
  select 1 from unnest(array['projects','transactions','journal_entries','budget_requests',
    'activities','financial_filings','memos','tickets','liquidations']) k
  where not (po.visibility_scopes ? k)
);

drop function if exists public._map_legacy_scope(text);
