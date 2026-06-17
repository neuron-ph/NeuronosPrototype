-- 220_flatten_permission_matrix_per_user.sql
--
-- RBAC "the matrix is king" — Phase 1 (access-neutral data reconcile).
--
-- Today enforcement is two-layer: effective(key) = override[key] ?? profile[key]
-- ?? false (current_user_effective_module_grant, no cascade). That means the
-- assigned profile still carries read-weight, and editing a profile vs a user's
-- override can diverge ("re-apply" confusion). The target: ONE flat, explicit,
-- self-contained matrix per user (permission_overrides.module_grants) that is the
-- sole source of truth, displayed verbatim and enforced verbatim.
--
-- This migration makes each user's override self-contained by materializing the
-- CURRENT effective set into it: for every key present in (profile ∪ override),
-- store override[key] if present, else profile[key]. Because the resolver has no
-- cascade, this preserves every user's effective access EXACTLY — it only removes
-- the profile's read-weight. Phase 2 then drops the profile fallback safely.
--
-- Idempotent: re-running recomputes the same set (override already complete).
-- A pre-reconcile snapshot is kept in _perm_backup_220 for verification/rollback.

create table if not exists public._perm_backup_220 as
  select user_id, module_grants from public.permission_overrides;

update public.permission_overrides po
set module_grants = (
  select coalesce(
           jsonb_object_agg(
             k,
             case when po.module_grants ? k then po.module_grants -> k
                  else ap.module_grants -> k end
           ),
           '{}'::jsonb
         )
  from jsonb_object_keys(
         coalesce(po.module_grants, '{}'::jsonb) || coalesce(ap.module_grants, '{}'::jsonb)
       ) as k
)
from public.users u
left join public.access_profiles ap on ap.id = u.access_profile_id and ap.is_active
where po.user_id = u.id;
