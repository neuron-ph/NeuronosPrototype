-- Crew Visibility Phase 1.5 (PLAN_CREW_VISIBILITY_2026-06.md, D8) — repoint
-- team resolution at team_memberships.
--
-- current_user_team_ids() (157) read legacy users.team_id, which the V1 Teams
-- UI (063+) never writes — NULL for all active users in prod, so the 'team'
-- dial silently meant 'own' for everyone. Real membership lives in
-- team_memberships (is_active rows). 157's comment "no team_memberships table"
-- was false when written.
--
-- Same name + signature, so every caller (current_user_can_view_record,
-- current_user_can_view_booking, policies) inherits the fix untouched.
-- Semantics: me + every active member of every team I'm an active member of
-- (union across memberships — multi-team users supported). No memberships =>
-- just me, exactly like the old team_id-null branch.

create or replace function public.current_user_team_ids() returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_ids text[];
begin
  select u.id into v_user_id
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return array[]::text[]; end if;

  select array_agg(distinct tm2.user_id) into v_ids
  from public.team_memberships tm
  join public.team_memberships tm2
    on tm2.team_id = tm.team_id and tm2.is_active = true
  where tm.user_id = v_user_id and tm.is_active = true;

  if v_ids is null then return array[v_user_id]; end if;
  if not (v_user_id = any(v_ids)) then v_ids := v_ids || v_user_id; end if;
  return v_ids;
end; $$;
