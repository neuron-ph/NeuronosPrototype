-- NEU-012 Phase 2 correction, Slice 2 — re-point clean users onto SHARED profiles.
--
-- Slice 2 (snapshot) had collapsed every user onto their own per-user "snapshot"
-- profile (= their full effective set). The corrected model puts users back on a
-- shared base + a visible per-user delta. The 31 "clean" users (those whose
-- permission_overrides.applied_profile_id records an original shared profile) are
-- re-pointed here. The 29 "shadow" users (no applied_profile_id) keep their
-- snapshot profile as an interim personal base (Marcus, 2026-06-05) — untouched.
--
-- We do NOT keep the original override verbatim: 989 grants across 23 of the 31
-- clean users came from the old role-fallback layer, which the snapshot baked into
-- effective access. Keeping the raw override would silently drop those. Instead we
-- recompute each clean user's override as the MINIMAL delta needed to reproduce
-- their snapshot effective set (S) over their shared base (A):
--
--   newOverride = { k : S[k]  for every key in S where A[k] != S[k] }
--
-- so overlay(newOverride, A) == S exactly, and the override now visibly shows
-- everything this person has beyond the shared profile (strict: explicit & visible).
--
-- Order matters (runs in one transaction): compute the delta from the CURRENT
-- assignment (snapshot) FIRST, then re-point users.access_profile_id to the shared
-- profile, then drop the now-orphaned snapshot profiles.

-- 1. Recompute each clean user's override as the S - A delta.
with clean as (
  select po.id as po_id,
         coalesce(sp.module_grants,'{}'::jsonb) as s,   -- snapshot = current assigned profile
         coalesce(ap.module_grants,'{}'::jsonb) as a    -- original shared base
  from public.permission_overrides po
  join public.users us on us.id = po.user_id
  join public.access_profiles sp on sp.id = us.access_profile_id
  join public.access_profiles ap on ap.id = po.applied_profile_id
  where po.applied_profile_id is not null
),
delta as (
  select po_id,
         coalesce(
           jsonb_object_agg(key, sval_j)
             filter (where coalesce(aval_t, 'false') is distinct from sval_t),
           '{}'::jsonb
         ) as new_override
  from (
    select c.po_id, k.key,
           (c.s -> k.key)  as sval_j,   -- jsonb boolean value (preserves type)
           (c.s ->> k.key) as sval_t,   -- text, for comparison
           (c.a ->> k.key) as aval_t
    from clean c, lateral jsonb_object_keys(c.s) k(key)
  ) x
  group by po_id
)
update public.permission_overrides po
set module_grants = d.new_override,
    updated_at = now()
from delta d
where po.id = d.po_id;

-- 2. Re-point clean users to their shared profile (the base).
update public.users u
set access_profile_id = po.applied_profile_id
from public.permission_overrides po
where po.user_id = u.id
  and po.applied_profile_id is not null;

-- 3. Drop snapshot profiles no longer referenced by anyone (clean users now point
--    at shared profiles; shadow users still hold theirs, so those survive).
delete from public.access_profiles ap
where ap.description = 'NEU-012 verbatim snapshot (Phase 2)'
  and not exists (select 1 from public.users u where u.access_profile_id = ap.id);
