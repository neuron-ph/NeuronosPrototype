-- NEU-012 Contract #6 Slice 1 — Part A (ADDITIVE, no enforcement change).
-- Adds per-record-type visibility dials (Own/Team/Everything) + new resolver
-- functions ALONGSIDE the legacy ones. Policies are untouched here, so live
-- behavior is unchanged until Part B (158) flips them.

-- 1) Storage: a per-record-type dial map on profiles and per-user overrides.
alter table public.access_profiles
  add column if not exists visibility_scopes jsonb not null default '{}'::jsonb;
alter table public.permission_overrides
  add column if not exists visibility_scopes jsonb not null default '{}'::jsonb;

-- 2) Legacy single scope -> new 3-dial vocabulary.
create or replace function public._map_legacy_scope(p text) returns text
language sql immutable as $$
  select case lower(coalesce(p,'own'))
    when 'own' then 'own'
    when 'team' then 'team'
    when 'department' then 'everything'
    when 'department_wide' then 'everything'
    when 'selected_departments' then 'everything'
    when 'cross_department' then 'everything'
    when 'all' then 'everything'
    when 'full' then 'everything'
    else 'own' end;
$$;

-- 3) Seed every canonical record type uniformly from the legacy global scope
--    (behavior-preserving starting point; tuned per-type later in Slice 4).
update public.access_profiles ap
set visibility_scopes = (
  select jsonb_object_agg(k, public._map_legacy_scope(ap.visibility_scope))
  from unnest(array[
    'contacts','customers','quotations','tasks','expenses','invoices',
    'collections','billings','evouchers',
    'bookings_forwarding','bookings_brokerage','bookings_trucking',
    'bookings_marine_insurance','bookings_others'
  ]) k
)
where ap.visibility_scopes = '{}'::jsonb;

update public.permission_overrides po
set visibility_scopes = (
  select jsonb_object_agg(k, public._map_legacy_scope(po.scope))
  from unnest(array[
    'contacts','customers','quotations','tasks','expenses','invoices',
    'collections','billings','evouchers',
    'bookings_forwarding','bookings_brokerage','bookings_trucking',
    'bookings_marine_insurance','bookings_others'
  ]) k
)
where po.scope is not null and po.visibility_scopes = '{}'::jsonb;

-- 4) Teammate set (live): me + everyone sharing my team_id. team_id null => just me.
create or replace function public.current_user_team_ids() returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_team uuid; v_ids text[];
begin
  select u.id, u.team_id into v_user_id, v_team
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return array[]::text[]; end if;
  if v_team is null then return array[v_user_id]; end if;
  select array_agg(u.id) into v_ids from public.users u where u.team_id = v_team;
  return coalesce(v_ids, array[v_user_id]);
end; $$;

-- 5) Effective dial for a record type: per-user override map wins per-key,
--    else assigned profile map, else 'own' (strict fail-closed default).
create or replace function public.current_user_visibility_dial(p_record_type text) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_profile_id uuid; v_o jsonb; v_p jsonb;
begin
  select u.id, u.access_profile_id into v_user_id, v_profile_id
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return 'own'; end if;

  select coalesce(po.visibility_scopes,'{}'::jsonb) into v_o
  from public.permission_overrides po where po.user_id = v_user_id limit 1;
  if v_o ? p_record_type then return v_o ->> p_record_type; end if;

  select coalesce(ap.visibility_scopes,'{}'::jsonb) into v_p
  from public.access_profiles ap where ap.id = v_profile_id and ap.is_active = true limit 1;
  if v_p ? p_record_type then return v_p ->> p_record_type; end if;

  return 'own';
end; $$;

-- 6) New record-visibility check (record_type, owner). NO department arrays.
--    Own = owner is me; Team = owner is a teammate; Everything = all rows.
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
  return false;
end; $$;

-- 7) New booking check: Own = I created OR I'm assigned (manager/supervisor/
--    handler); Team = any of those is a teammate; Everything = all. Per service.
create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text, p_supervisor_id text, p_handler_id text
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_team text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial = 'everything' then return true; end if;
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if v_dial = 'own' then return false; end if;
  if v_dial = 'team' then
    v_team := public.current_user_team_ids();
    return p_created_by = any(v_team) or p_manager_id = any(v_team)
        or p_supervisor_id = any(v_team) or p_handler_id = any(v_team);
  end if;
  return false;
end; $$;
