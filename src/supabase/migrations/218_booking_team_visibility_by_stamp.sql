-- 218_booking_team_visibility_by_stamp.sql
--
-- Fix: "Team" visibility on bookings leaked across teams.
--
-- Root cause: the team branch of current_user_can_view_booking computed
-- current_user_team_ids() (every person who shares a team with the viewer) and
-- then granted any booking those people owned or were ASSIGNED to. Because senior
-- staff sit in multiple teams and are auto-assigned to most bookings, one
-- multi-team person bridged every booking they touched into all of their teams —
-- so "team" silently ballooned toward org-wide.
--
-- Model (see docs/ACCESS_AND_VISIBILITY_EXPLAINER.md): a booking is the only record
-- that BELONGS to a single team — it carries its own stamp, bookings.team_id. So a
-- booking is visible at team breadth only when its stamped team is one the viewer
-- actively belongs to. People are not consulted at this step; a multi-team member
-- can no longer act as a door.
--
-- Scope: ONLY the team branch of the 7-arg overload changes. Personal access
-- (creator / manager / supervisor / handler / direct assignment) is untouched and
-- still wins. Executive, confidential, org_wide/everything/own all unchanged. The
-- department branch keeps its existing people-based behaviour. The 5-arg overload
-- (used to judge 'projects', a shared record) is intentionally left alone — the
-- people-path is correct for shared records.
--
-- Safe to look up bookings.team_id inside this function: it is SECURITY DEFINER
-- owned by 'postgres', and public.bookings is owned by 'postgres' with FORCE ROW
-- LEVEL SECURITY off, so the owner is RLS-exempt — the internal read does not
-- re-enter the bookings_select policy (no recursion).

create or replace function public.current_user_can_view_booking(
  p_record_type text,
  p_created_by text,
  p_manager_id text,
  p_supervisor_id text,
  p_handler_id text,
  p_booking_id text,
  p_confidential boolean
) returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_user_id text; v_dial text; v_ids text[]; v_team_id uuid;
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;

  -- Personal access (the "own" anchor) — always wins, regardless of team.
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba
    where ba.booking_id = p_booking_id and ba.user_id = v_user_id
  ) then return true; end if;

  if public.is_executive() then return true; end if;
  if p_confidential is true then return false; end if;

  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial in ('everything', 'org_wide') then return true; end if;
  if v_dial = 'own' then return false; end if;

  -- TEAM: read the booking's own team stamp; visible only if it is a team the
  -- viewer actively belongs to. No person is consulted — no multi-team bridge.
  if v_dial = 'team' then
    if p_booking_id is null then return false; end if;
    select b.team_id into v_team_id from public.bookings b where b.id = p_booking_id;
    return v_team_id is not null and exists (
      select 1 from public.team_memberships tm
      where tm.team_id = v_team_id and tm.user_id = v_user_id and tm.is_active = true
    );
  end if;

  -- DEPARTMENT: unchanged — people-based breadth across the viewer's department.
  if v_dial = 'department' then
    v_ids := public.current_user_department_user_ids();
    if p_created_by = any(v_ids) or p_manager_id = any(v_ids)
       or p_supervisor_id = any(v_ids) or p_handler_id = any(v_ids) then return true; end if;
    if p_booking_id is not null and exists (
      select 1 from public.booking_assignments ba
      where ba.booking_id = p_booking_id and ba.user_id = any(v_ids)
    ) then return true; end if;
    return false;
  end if;

  return false;
end;
$function$;
