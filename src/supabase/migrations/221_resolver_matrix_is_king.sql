-- 221_resolver_matrix_is_king.sql
--
-- RBAC "the matrix is king" — Phase 2 (enforcement reads the flat matrix only).
--
-- After migration 220, every user's permission_overrides.module_grants is a
-- complete, self-contained, explicit matrix equal to their prior effective set.
-- So the assigned access profile no longer needs to be consulted at read time.
-- Drop the profile fallback: enforcement is now a single verbatim lookup against
-- the user's matrix. Absent key => denied. No profile, no cascade, no role.
--
-- This is the DB half of the invariant: display(key) == stored(key) == enforced(key).
-- Access-neutral by construction (220 proved override-only == profile⊕override).
--
-- access_profiles remains as a pure UI TEMPLATE (used to seed/fill a user's matrix
-- on "apply"), carrying zero read-weight.

create or replace function public.current_user_effective_module_grant(p_key text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_grants jsonb := '{}'::jsonb;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  -- The user's flat matrix is the sole source of truth.
  select coalesce(po.module_grants, '{}'::jsonb)
    into v_grants
  from public.permission_overrides po
  where po.user_id = v_user_id
  limit 1;

  if v_grants ? p_key then
    return coalesce((v_grants ->> p_key)::boolean, false);
  end if;

  -- Absent => denied. No profile fallback, no cascade, no role default.
  return false;
end;
$function$;
