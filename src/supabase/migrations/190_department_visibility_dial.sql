-- Crew Visibility Phase 3 (PLAN_CREW_VISIBILITY_2026-06.md, D5) — the
-- 'department' dial: a third radius between team and everything.
--   own        = crew includes me
--   team       = crew intersects my team set (team_memberships, 186)
--   department = crew intersects my department (users.department, live)
--   everything = all rows
-- Seeds NOTHING (D5): no profile/override gets 'department' automatically;
-- admins dial profiles up deliberately. Unknown dial values fail closed.

-- 1) Department member set: me + everyone sharing my users.department.
--    No is_active filter — records owned by deactivated users must remain
--    visible to their department.
create or replace function public.current_user_department_user_ids() returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dept text; v_ids text[];
begin
  select u.id, u.department into v_user_id, v_dept
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return array[]::text[]; end if;
  if v_dept is null or v_dept = '' then return array[v_user_id]; end if;
  select array_agg(u.id) into v_ids from public.users u where u.department = v_dept;
  return coalesce(v_ids, array[v_user_id]);
end; $$;

-- 2) Generic record check (owner-based types) gains the department arm.
create or replace function public.current_user_can_view_record(p_record_type text, p_owner_id text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text;
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial = 'everything' then return true; end if;
  if p_owner_id is null then return false; end if;
  if v_dial = 'own'  then return p_owner_id = v_user_id; end if;
  if v_dial = 'team' then return p_owner_id = any(public.current_user_team_ids()); end if;
  if v_dial = 'department' then return p_owner_id = any(public.current_user_department_user_ids()); end if;
  return false;
end; $$;

-- 3) Booking check (5-arg legacy shape, kept for projects/project_bookings callers).
create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text, p_supervisor_id text, p_handler_id text
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_ids text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial = 'everything' then return true; end if;
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if v_dial = 'own' then return false; end if;
  if v_dial = 'team' then v_ids := public.current_user_team_ids();
  elsif v_dial = 'department' then v_ids := public.current_user_department_user_ids();
  else return false;
  end if;
  return p_created_by = any(v_ids) or p_manager_id = any(v_ids)
      or p_supervisor_id = any(v_ids) or p_handler_id = any(v_ids);
end; $$;

-- 4) Booking check (6-arg, with booking_assignments — 188) gains department.
create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text,
  p_supervisor_id text, p_handler_id text, p_booking_id text
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_ids text[];
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
  if v_dial = 'team' then v_ids := public.current_user_team_ids();
  elsif v_dial = 'department' then v_ids := public.current_user_department_user_ids();
  else return false;
  end if;
  if p_created_by = any(v_ids) or p_manager_id = any(v_ids)
     or p_supervisor_id = any(v_ids) or p_handler_id = any(v_ids) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba
    where ba.booking_id = p_booking_id and ba.user_id = any(v_ids)
  ) then return true; end if;
  return false;
end; $$;

-- 5) Customer crew check (189) gains department.
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
  elsif v_dial = 'department' then v_ids := public.current_user_department_user_ids();
  else return false;
  end if;

  if p_owner_id = any(v_ids) then return true; end if;

  if exists (
    select 1 from public.bookings b
    where b.customer_id = p_customer_id
      and (b.created_by = any(v_ids) or b.manager_id = any(v_ids)
        or b.supervisor_id = any(v_ids) or b.handler_id = any(v_ids)
        or exists (select 1 from public.booking_assignments ba
                   where ba.booking_id = b.id and ba.user_id = any(v_ids)))
  ) then return true; end if;

  if exists (
    select 1 from public.projects pr
    where pr.customer_id = p_customer_id
      and (pr.created_by = any(v_ids) or pr.manager_id = any(v_ids)
        or pr.supervisor_id = any(v_ids) or pr.handler_id = any(v_ids))
  ) then return true; end if;

  return false;
end; $$;
