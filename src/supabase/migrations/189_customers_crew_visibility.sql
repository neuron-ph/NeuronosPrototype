-- Crew Visibility Phase 2 core (PLAN_CREW_VISIBILITY_2026-06.md, D1-D3, Q4) —
-- customers visibility becomes CREW-based and the possession-only back door dies.
--
-- A customer's CREW = its owner + everyone assigned to work attached to it:
-- linked bookings (created_by/manager/supervisor/handler + booking_assignments)
-- and linked projects (created_by/manager/supervisor/handler).
-- Q4 ruling (provisional, Marcus's documented leaning): bookings + projects
-- only — quotations do NOT form crew.
--
-- Dial semantics (D2, uniform):
--   own        -> crew includes me
--   team       -> crew intersects my team set (team_memberships, per 186)
--   everything -> all rows
-- Linking is by PARTICIPATION, not visibility (D1) — this predicate never
-- consults another record type's dial, so each dial stays independently
-- readable on the admin screen.
--
-- The old customers_select OR-branch ("holds any ops/projects view key => ALL
-- customers", migration 158) is DELETED (D3) — that was Ticket 1's back door.
-- Ops screens keep rendering names via denormalized customer_name (F5), and
-- ops users see the full record of customers on work they're part of via crew.

create or replace function public.current_user_can_view_customer(
  p_customer_id text, p_owner_id text
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_ids text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;

  v_dial := public.current_user_visibility_dial('customers');
  if v_dial = 'everything' then return true; end if;

  if v_dial = 'own' then v_ids := array[v_user_id];
  elsif v_dial = 'team' then v_ids := public.current_user_team_ids();
  else return false;
  end if;

  -- crew: owner
  if p_owner_id = any(v_ids) then return true; end if;

  -- crew: participants of linked bookings (incl. booking_assignments)
  if exists (
    select 1 from public.bookings b
    where b.customer_id = p_customer_id
      and (b.created_by = any(v_ids) or b.manager_id = any(v_ids)
        or b.supervisor_id = any(v_ids) or b.handler_id = any(v_ids)
        or exists (select 1 from public.booking_assignments ba
                   where ba.booking_id = b.id and ba.user_id = any(v_ids)))
  ) then return true; end if;

  -- crew: participants of linked projects
  if exists (
    select 1 from public.projects pr
    where pr.customer_id = p_customer_id
      and (pr.created_by = any(v_ids) or pr.manager_id = any(v_ids)
        or pr.supervisor_id = any(v_ids) or pr.handler_id = any(v_ids))
  ) then return true; end if;

  return false;
end; $$;

-- Flip the customers policies: one gate, no possession-only branch.
alter policy customers_select on public.customers using (
  (current_user_has_module_permission('bd_customers','view')
    OR current_user_has_module_permission('pricing_customers','view')
    OR current_user_has_module_permission('acct_customers','view')
    OR current_user_can_act_on_booking('view')
    OR current_user_has_module_permission('bd_projects','view')
    OR current_user_has_module_permission('pricing_projects','view'))
  AND current_user_can_view_customer(id, owner_id));
alter policy customers_update on public.customers using (
  (current_user_has_module_permission('bd_customers','edit')
    OR current_user_has_module_permission('pricing_customers','edit'))
  AND current_user_can_view_customer(id, owner_id));
alter policy customers_delete on public.customers using (
  (current_user_has_module_permission('bd_customers','delete')
    OR current_user_has_module_permission('pricing_customers','delete'))
  AND current_user_can_view_customer(id, owner_id));
