-- 225_inbox_ping_audience_predicate.sql
--
-- Bug: the sidebar inbox-ping TOAST fires for tickets that never land in the
-- user's inbox. Broad-visibility roles (visibility dial 'everything'/'org_wide'
-- — Executives, most of Accounting, several managers) get a toast for EVERY
-- human ticket message company-wide, while their inbox stays empty.
--
-- Why: the toast handler (NeuronSidebar.tsx) gated on whether it could SELECT
-- the ticket row. SELECT is intentionally broad — migration 223 widened reads
-- (and realtime delivery) to `current_user_can_receive_ticket()`, which grants
-- visibility via the creator-visibility dial so an Executive can READ any
-- ticket. That readability is correct for RLS/realtime, but it is NOT the same
-- question as "is this ticket addressed to me" (the inbox list, get_inbox_threads).
--
-- This migration adds a NARROW, read-only predicate that answers the inbox-
-- audience question WITHOUT the visibility dial. It mirrors the four membership
-- paths of get_inbox_threads (to/cc participant, assignee, manager/director of a
-- dept-addressed ticket, creator). The toast handler calls this instead of
-- relying on plain readability. No policies and no existing functions change —
-- this is purely additive.

create or replace function public.current_user_is_ticket_audience(p_ticket_id uuid)
  returns boolean
  language plpgsql
  stable security definer
  set search_path to 'public'
as $function$
declare
  v_me   text;
  v_dept text;
  v_role text;
begin
  v_me := get_my_profile_id();
  if v_me is null then return false; end if;

  -- direct to/cc participant
  if exists (
    select 1 from public.ticket_participants tp
    where tp.ticket_id = p_ticket_id
      and tp.participant_type = 'user'
      and tp.participant_user_id = v_me
      and tp.role in ('to', 'cc')
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

  -- department routing — only managers/directors of the addressed dept
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

  -- creator — a reply from someone else on a ticket I opened (my own messages
  -- are filtered out client-side, so this only fires for genuine inbound replies)
  if exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id
      and t.created_by = v_me
  ) then
    return true;
  end if;

  return false;
end;
$function$;

grant execute on function public.current_user_is_ticket_audience(uuid) to authenticated;
