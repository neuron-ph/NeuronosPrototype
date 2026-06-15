-- Record Visibility V2 — Phase 3b: flip policies to the v2 ladder.
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (§2, §6, §8 Phase 3, Inv.2/5/6).
-- Run AFTER 211 (dial remap). Only USING clauses change; module-grant halves and
-- WITH CHECK (the action gate, Inv. 2) are preserved exactly. Behavior-neutral today
-- (0 confidential rows); the toggle bites the moment a record is flagged.

-- ── Bookings: 7-arg overload of the view function adding a confidential gate. ──
-- Participation + executive are checked BEFORE breadth, so a confidential booking
-- is visible only to its participants + execs regardless of dial. Non-confidential
-- bookings keep the exact 188 semantics. The 6-arg version is left intact for other callers.
create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text,
  p_supervisor_id text, p_handler_id text, p_booking_id text, p_confidential boolean
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_ids text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  -- direct participation / assignment (works even if confidential)
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba where ba.booking_id = p_booking_id and ba.user_id = v_user_id
  ) then return true; end if;
  -- executives are the all-records tier (see restricted)
  if public.is_executive() then return true; end if;
  -- confidential & not participant/exec → hidden, regardless of breadth (Inv. 1)
  if p_confidential is true then return false; end if;
  -- non-confidential breadth (existing 188 semantics)
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial = 'everything' then return true; end if;
  if v_dial = 'own' then return false; end if;
  if v_dial = 'team' then v_ids := public.current_user_team_ids();
  elsif v_dial = 'department' then v_ids := public.current_user_department_user_ids();
  else return false;
  end if;
  if p_created_by = any(v_ids) or p_manager_id = any(v_ids)
     or p_supervisor_id = any(v_ids) or p_handler_id = any(v_ids) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba where ba.booking_id = p_booking_id and ba.user_id = any(v_ids)
  ) then return true; end if;
  return false;
end; $$;

-- ── contacts ──
alter policy contacts_select on public.contacts using (
  (current_user_has_module_permission('bd_contacts','view') or current_user_has_module_permission('pricing_contacts','view'))
  and current_user_can_view_record_v2('contacts', id, created_by, confidential));
alter policy contacts_update on public.contacts using (
  (current_user_has_module_permission('bd_contacts','edit') or current_user_has_module_permission('pricing_contacts','edit'))
  and current_user_can_view_record_v2('contacts', id, created_by, confidential));
alter policy contacts_delete on public.contacts using (
  (current_user_has_module_permission('bd_contacts','delete') or current_user_has_module_permission('pricing_contacts','delete'))
  and current_user_can_view_record_v2('contacts', id, created_by, confidential));

-- ── customers ──
alter policy customers_select on public.customers using (
  (current_user_has_module_permission('bd_customers','view') or current_user_has_module_permission('pricing_customers','view')
   or current_user_has_module_permission('acct_customers','view') or current_user_can_act_on_booking('view')
   or current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view'))
  and current_user_can_view_record_v2('customers', id, created_by, confidential));
alter policy customers_update on public.customers using (
  (current_user_has_module_permission('bd_customers','edit') or current_user_has_module_permission('pricing_customers','edit'))
  and current_user_can_view_record_v2('customers', id, created_by, confidential));
alter policy customers_delete on public.customers using (
  (current_user_has_module_permission('bd_customers','delete') or current_user_has_module_permission('pricing_customers','delete'))
  and current_user_can_view_record_v2('customers', id, created_by, confidential));

-- ── projects ──
alter policy projects_select on public.projects using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view')
   or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_record_v2('projects', id, created_by, confidential));
alter policy projects_update on public.projects using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view')
   or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_record_v2('projects', id, created_by, confidential));
alter policy projects_delete on public.projects using (
  (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view')
   or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
  and current_user_can_view_record_v2('projects', id, created_by, confidential));

-- ── quotations / contracts ──
-- Branch A: the type's own grants + v2 ladder. Branch B: contract cross-reads via
-- linked bookings/projects, now guarded by confidential=false so a restricted
-- contract can't leak through a link (Inv. 5); linked booking uses the 7-arg fn.
alter policy quotations_select on public.quotations using (
  (
    (current_user_has_module_permission('pricing_quotations','view') or current_user_has_module_permission('pricing_contracts','view')
     or current_user_has_module_permission('bd_contracts','view') or current_user_has_module_permission('bd_inquiries','view')
     or current_user_can_act_on_booking('view') or current_user_has_module_permission('acct_bookings','view'))
    and current_user_can_view_record_v2(
      case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
      id, coalesce(prepared_by, created_by), confidential)
  )
  or (
    quotation_type = 'contract' and quotations.confidential = false and (
      exists (select 1 from public.bookings b
        where b.contract_id = quotations.id
          and (current_user_can_act_on_booking('view') or current_user_has_module_permission('acct_bookings','view'))
          and current_user_can_view_booking(
                'bookings_' || replace(lower(coalesce(b.service_type,'others')),' ','_'),
                b.created_by, b.manager_id, b.supervisor_id, b.handler_id, b.id, b.confidential))
      or exists (select 1 from public.projects pr
        where pr.quotation_id = quotations.id
          and (current_user_has_module_permission('bd_projects','view') or current_user_has_module_permission('pricing_projects','view')
               or current_user_has_module_permission('ops_projects','view') or current_user_has_module_permission('acct_projects','view'))
          and current_user_can_view_booking('projects', pr.created_by, pr.manager_id, pr.supervisor_id, pr.handler_id))
    )
  )
);
alter policy quotations_update on public.quotations using (
  current_user_can_quotation('edit') and current_user_can_view_record_v2(
    case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
    id, coalesce(prepared_by, created_by), confidential));
alter policy quotations_delete on public.quotations using (
  current_user_can_quotation('delete') and current_user_can_view_record_v2(
    case when quotation_type = 'contract' then 'contracts' else 'quotations' end,
    id, coalesce(prepared_by, created_by), confidential));

-- ── bookings: pass confidential into the 7-arg function ──
alter policy bookings_select on public.bookings using (
  (current_user_can_act_on_booking('view') or current_user_has_module_permission('acct_bookings','view'))
  and current_user_can_view_booking(
        'bookings_' || replace(lower(coalesce(service_type,'others')),' ','_'),
        created_by, manager_id, supervisor_id, handler_id, id, confidential));
alter policy bookings_update on public.bookings using (
  current_user_can_act_on_booking('edit')
  and current_user_can_view_booking(
        'bookings_' || replace(lower(coalesce(service_type,'others')),' ','_'),
        created_by, manager_id, supervisor_id, handler_id, id, confidential));
alter policy bookings_delete on public.bookings using (
  current_user_can_act_on_booking('delete')
  and current_user_can_view_booking(
        'bookings_' || replace(lower(coalesce(service_type,'others')),' ','_'),
        created_by, manager_id, supervisor_id, handler_id, id, confidential));
