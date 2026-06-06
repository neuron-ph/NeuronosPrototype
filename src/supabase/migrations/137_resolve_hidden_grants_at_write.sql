-- 137_resolve_hidden_grants_at_write.sql
-- NEU-012 Phase 1 (foundation): make the app and the DB resolve permissions the
-- SAME way, by resolving hidden/umbrella module grants AT WRITE TIME.
--
-- Background: hidden pseudo-modules (ops_bookings, ops_projects) are never shown
-- in the Access Configuration matrix; their grants are DERIVED as the OR of the
-- visible service/source modules. The browser derives them at read time
-- (deriveHiddenModuleGrants), but the DB resolver
-- (current_user_effective_module_grant) does a pure literal key lookup and never
-- derives. Migration 118 backfilled them ONCE via a pg_temp function, but new
-- saves (the seed builder, MCP writes, any path that doesn't run the frontend
-- derivation) drift back to missing — which is exactly NEU-006: Pricing baselines
-- grant ops_marine_insurance:create / ops_others:create but lack the umbrella
-- ops_bookings:create, so the browser shows the Create button while the DB INSERT
-- policy (which checks ops_bookings:create) denies the row.
--
-- Fix: a PERMANENT function + BEFORE INSERT/UPDATE triggers on access_profiles
-- and permission_overrides, so the umbrella keys are always present in stored
-- module_grants. Reads on both sides then agree by construction.
--
-- Mapping (identical to migration 118 and to deriveHiddenModuleGrants):
--   ops_bookings:action = OR(ops_forwarding, ops_brokerage, ops_trucking,
--                            ops_marine_insurance, ops_others):action
--   ops_projects:action = OR(bd_projects, pricing_projects):action
-- across all 6 actions (view, create, edit, approve, delete, export).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Permanent derivation function
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.derive_hidden_module_grants(g jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  actions text[] := array['view','create','edit','approve','delete','export'];
  act text;
  result jsonb;
begin
  if g is null then
    return g;
  end if;
  result := g;

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
-- 2. Trigger function: resolve module_grants on every write
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.apply_hidden_module_grants()
returns trigger
language plpgsql
as $$
begin
  if new.module_grants is not null and new.module_grants <> '{}'::jsonb then
    new.module_grants := public.derive_hidden_module_grants(new.module_grants);
  end if;
  return new;
end;
$$;

drop trigger if exists access_profiles_resolve_hidden_grants on public.access_profiles;
create trigger access_profiles_resolve_hidden_grants
  before insert or update of module_grants on public.access_profiles
  for each row execute function public.apply_hidden_module_grants();

drop trigger if exists permission_overrides_resolve_hidden_grants on public.permission_overrides;
create trigger permission_overrides_resolve_hidden_grants
  before insert or update of module_grants on public.permission_overrides
  for each row execute function public.apply_hidden_module_grants();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. One-time backfill of existing rows (fixes current drift, e.g. Pricing)
-- ────────────────────────────────────────────────────────────────────────────

update public.access_profiles
set module_grants = public.derive_hidden_module_grants(module_grants)
where module_grants is not null and module_grants <> '{}'::jsonb;

update public.permission_overrides
set module_grants = public.derive_hidden_module_grants(module_grants)
where module_grants is not null and module_grants <> '{}'::jsonb;
