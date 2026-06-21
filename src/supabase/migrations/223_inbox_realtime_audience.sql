-- 223_inbox_realtime_audience.sql
--
-- P2 fix: routed/assigned inquiries reflect LATE in the inbox.
--
-- The inbox already subscribes to realtime on the ticket tables (migration 195),
-- but Supabase realtime only delivers a row change to a client that can SELECT
-- that row. Realtime visibility was gated by `current_user_can_view_ticket()`,
-- which grants only (a) the creator-visibility dial and (b) a direct user
-- participant (participant_user_id = me). That is NARROWER than the inbox list
-- RPC `get_inbox_threads`, which also grants visibility via:
--   - ticket_assignments.assigned_to = me            (individual assignment)
--   - manager/director + a department participant     (dept routing)
-- so dept-routed and assignment-based tickets produced NO realtime event for the
-- recipient and only appeared on the next refetch (window-focus / remount) →
-- perceived as "late".
--
-- This migration aligns REALTIME/READ visibility with the list RPC, WITHOUT
-- touching write access. We leave the existing functions and ALL policies
-- untouched and add an additive, read-only predicate plus SELECT-only policies.
-- Permissive policies OR together for SELECT, so reads (and therefore realtime
-- delivery) broaden to match the inbox; INSERT/UPDATE/DELETE stay governed by
-- the existing ALL policies (no change to who can write).

-- Broad read predicate: true when the current user is in a ticket's audience by
-- any of the four paths the inbox list grants. Mirrors get_inbox_threads.
create or replace function public.current_user_can_receive_ticket(p_ticket_id uuid)
  returns boolean
  language plpgsql
  stable security definer
  set search_path to 'public'
as $function$
declare
  v_me    text;
  v_dept  text;
  v_role  text;
  v_created_by text;
begin
  v_me := get_my_profile_id();
  if v_me is null then return false; end if;

  -- creator-visibility dial (same branch the existing view-gate uses)
  select created_by into v_created_by from public.tickets where id = p_ticket_id;
  if v_created_by is null then return false; end if;
  if public.current_user_can_view_record('tickets', v_created_by) then
    return true;
  end if;

  -- direct user participant (to / cc / sender)
  if exists (
    select 1 from public.ticket_participants tp
    where tp.ticket_id = p_ticket_id
      and tp.participant_user_id = v_me
  ) then
    return true;
  end if;

  -- individual assignment
  if exists (
    select 1 from public.ticket_assignments ta
    where ta.ticket_id = p_ticket_id
      and ta.assigned_to = v_me
  ) then
    return true;
  end if;

  -- department routing — only managers/directors of that dept (mirror the RPC)
  select department, role into v_dept, v_role
  from public.users where id = v_me;
  if v_role in ('manager', 'director') and v_dept is not null and exists (
    select 1 from public.ticket_participants tp
    where tp.ticket_id = p_ticket_id
      and tp.participant_type = 'department'
      and tp.participant_dept = v_dept
  ) then
    return true;
  end if;

  return false;
end;
$function$;

grant execute on function public.current_user_can_receive_ticket(uuid) to authenticated;

-- Additive SELECT-only policies on the realtime-watched tables. These widen
-- reads (and thus realtime delivery) to the inbox audience; writes are unchanged.
drop policy if exists tickets_select_audience on public.tickets;
create policy tickets_select_audience on public.tickets
  for select using (public.current_user_can_receive_ticket(id));

drop policy if exists ticket_participants_select_audience on public.ticket_participants;
create policy ticket_participants_select_audience on public.ticket_participants
  for select using (public.current_user_can_receive_ticket(ticket_id));

drop policy if exists ticket_messages_select_audience on public.ticket_messages;
create policy ticket_messages_select_audience on public.ticket_messages
  for select using (public.current_user_can_receive_ticket(ticket_id));
