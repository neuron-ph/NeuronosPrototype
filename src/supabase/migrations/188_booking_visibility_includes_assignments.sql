-- Crew Visibility Phase 2 step 1 (PLAN_CREW_VISIBILITY_2026-06.md, D7) —
-- booking visibility consults booking_assignments, closing the DB/client gap
-- (filterBookingsByScope already counts assignment rows; RLS didn't).
--
-- New 6-arg overload of current_user_can_view_booking adds p_booking_id:
--   Own  = creator/manager/supervisor/handler me, OR assigned via booking_assignments
--   Team = any of those is a teammate (team_memberships, per 186)
-- The 5-arg version stays for callers without a booking row (projects via 185's
-- 'projects' record-type call; project_bookings) — same behavior as before.

create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text,
  p_supervisor_id text, p_handler_id text, p_booking_id text
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_team text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial = 'everything' then return true; end if;
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba
    where ba.booking_id = p_booking_id and ba.user_id = v_user_id
  ) then return true; end if;
  if v_dial = 'own' then return false; end if;
  if v_dial = 'team' then
    v_team := public.current_user_team_ids();
    if p_created_by = any(v_team) or p_manager_id = any(v_team)
       or p_supervisor_id = any(v_team) or p_handler_id = any(v_team) then return true; end if;
    if p_booking_id is not null and exists (
      select 1 from public.booking_assignments ba
      where ba.booking_id = p_booking_id and ba.user_id = any(v_team)
    ) then return true; end if;
    return false;
  end if;
  return false;
end; $$;

-- bookings policies: pass the row id so assignments count.
alter policy bookings_select on public.bookings using (
  (current_user_can_act_on_booking('view') OR current_user_has_module_permission('acct_bookings','view'))
  AND current_user_can_view_booking(
        'bookings_' || replace(lower(COALESCE(service_type,'others')), ' ', '_'),
        created_by, manager_id, supervisor_id, handler_id, id));
alter policy bookings_update on public.bookings using (
  current_user_can_act_on_booking('edit')
  AND current_user_can_view_booking(
        'bookings_' || replace(lower(COALESCE(service_type,'others')), ' ', '_'),
        created_by, manager_id, supervisor_id, handler_id, id));
alter policy bookings_delete on public.bookings using (
  current_user_can_act_on_booking('delete')
  AND current_user_can_view_booking(
        'bookings_' || replace(lower(COALESCE(service_type,'others')), ' ', '_'),
        created_by, manager_id, supervisor_id, handler_id, id));

-- quotations_select branch B (185): the booking-linked contract read also
-- honors assignments now (pass b.id). Branch A and the projects arm unchanged.
alter policy quotations_select on public.quotations
  using (
    (
      (current_user_has_module_permission('pricing_quotations','view')
        or current_user_has_module_permission('pricing_contracts','view')
        or current_user_has_module_permission('bd_contracts','view')
        or current_user_has_module_permission('bd_inquiries','view')
        or current_user_can_act_on_booking('view')
        or current_user_has_module_permission('acct_bookings','view'))
      and current_user_can_view_record(
            case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
            coalesce(prepared_by, created_by))
    )
    or
    (
      quotation_type = 'contract'
      and (
        exists (
          select 1 from public.bookings b
          where b.contract_id = quotations.id
            and (current_user_can_act_on_booking('view')
                 or current_user_has_module_permission('acct_bookings','view'))
            and current_user_can_view_booking(
                  'bookings_' || replace(lower(coalesce(b.service_type, 'others')), ' ', '_'),
                  b.created_by, b.manager_id, b.supervisor_id, b.handler_id, b.id)
        )
        or exists (
          select 1 from public.projects pr
          where pr.quotation_id = quotations.id
            and (current_user_has_module_permission('bd_projects','view')
                 or current_user_has_module_permission('pricing_projects','view')
                 or current_user_has_module_permission('ops_projects','view')
                 or current_user_has_module_permission('acct_projects','view'))
            and current_user_can_view_booking(
                  'projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id)
        )
      )
    )
  );
