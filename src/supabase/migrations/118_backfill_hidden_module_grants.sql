-- Backfill hidden-module grants (ops_bookings, ops_projects) for all
-- permission_overrides and access_profiles.
--
-- Hidden modules are never shown in the permission editor, so their grants
-- were never set for users/profiles created after they were hidden.  The
-- frontend now auto-derives them on save, but existing records need a
-- one-time backfill.
--
-- Rule: hidden_module:action = OR(source_modules:action)
--   ops_bookings  ← ops_forwarding | ops_brokerage | ops_trucking | ops_marine_insurance | ops_others
--   ops_projects  ← bd_projects | pricing_projects

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: derive hidden-module grants for a given module_grants JSONB value
-- ────────────────────────────────────────────────────────────────────────────

create or replace function pg_temp.derive_hidden_grants(g jsonb)
returns jsonb language plpgsql as $$
declare
  actions text[] := array['view','create','edit','approve','delete','export'];
  act text;
  result jsonb := g;
begin
  foreach act in array actions loop
    -- ops_bookings:action = OR of the 5 service modules
    result := jsonb_set(
      result,
      array['ops_bookings:' || act],
      to_jsonb(
        coalesce((g->>('ops_forwarding:' || act))::boolean, false)
        or coalesce((g->>('ops_brokerage:' || act))::boolean, false)
        or coalesce((g->>('ops_trucking:' || act))::boolean, false)
        or coalesce((g->>('ops_marine_insurance:' || act))::boolean, false)
        or coalesce((g->>('ops_others:' || act))::boolean, false)
      )
    );

    -- ops_projects:action = OR of bd_projects, pricing_projects
    result := jsonb_set(
      result,
      array['ops_projects:' || act],
      to_jsonb(
        coalesce((g->>('bd_projects:' || act))::boolean, false)
        or coalesce((g->>('pricing_projects:' || act))::boolean, false)
      )
    );
  end loop;
  return result;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill permission_overrides
-- ────────────────────────────────────────────────────────────────────────────

update public.permission_overrides
set module_grants = pg_temp.derive_hidden_grants(module_grants)
where module_grants is not null
  and module_grants != '{}'::jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill access_profiles
-- ────────────────────────────────────────────────────────────────────────────

update public.access_profiles
set module_grants = pg_temp.derive_hidden_grants(module_grants)
where module_grants is not null
  and module_grants != '{}'::jsonb;
