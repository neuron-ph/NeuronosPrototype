-- Crew Visibility Phase 1.2 (PLAN_CREW_VISIBILITY_2026-06.md) — purge
-- machine-seeded visibility_scopes residue from permission_overrides.
--
-- Migrations 157/161/184 stamped full uniform dial maps into every override row
-- (behavior-preserving bridge). Override-beats-profile per key, so the stamps
-- permanently shadow profile edits (Tickets T1/T2, 2026-06-07).
--
-- Scope (Marcus ruling 2026-06-08): **Bucket A ONLY** — user HAS an active
-- profile AND the map is uniform AND the uniform value equals the legacy-scope
-- mapping (provable machine seed). Bucket C (6 uniform-but-mismatched rows,
-- incl. 4 jr-pricing 'everything' stamps) is NOT purged — surfaced to Mark
-- separately. Bucket B (24 no-profile users) excluded until Phase 1.5.4.
-- Only visibility_scopes is cleared; module_grants untouched.
--
-- Audit: cleared maps snapshotted first — reversible.

create table if not exists public._purged_visibility_overrides_187 (
  user_id text primary key,
  legacy_scope text,
  visibility_scopes jsonb not null,
  purged_at timestamptz not null default now()
);

with residue as (
  select po.user_id, po.scope, po.visibility_scopes
  from public.permission_overrides po
  join public.users u on u.id = po.user_id
  join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active = true
  where po.visibility_scopes <> '{}'::jsonb
    and not exists (
      select 1 from jsonb_each_text(po.visibility_scopes) kv
      where kv.value <> case lower(coalesce(po.scope,'own'))
        when 'own' then 'own' when 'team' then 'team'
        when 'department' then 'everything' when 'department_wide' then 'everything'
        when 'selected_departments' then 'everything' when 'cross_department' then 'everything'
        when 'all' then 'everything' when 'full' then 'everything'
        else 'own' end
    )
)
insert into public._purged_visibility_overrides_187 (user_id, legacy_scope, visibility_scopes)
select user_id, scope, visibility_scopes from residue
on conflict (user_id) do nothing;

update public.permission_overrides po
set visibility_scopes = '{}'::jsonb, updated_at = now()
where po.user_id in (select user_id from public._purged_visibility_overrides_187);
