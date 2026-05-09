-- 096_business_record_rls_slice_1.sql
-- Source-of-truth RLS for first business-record slice: contacts, customers, tasks.
-- Replaces legacy department/role gates with explicit grant checks
-- (current_user_has_module_permission) and scope-driven visibility.

-- ---------------------------------------------------------------------------
-- 1. Visibility scope resolution helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_user_visibility_scope()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_role text;
  v_override_scope text;
  v_applied_profile_id uuid;
  v_profile_scope text;
begin
  select u.id, u.role into v_user_id, v_role
  from public.users u where u.auth_id = auth.uid() limit 1;

  if v_user_id is null then return 'own'; end if;

  select po.scope, po.applied_profile_id
    into v_override_scope, v_applied_profile_id
  from public.permission_overrides po where po.user_id = v_user_id limit 1;

  if v_override_scope is not null then return v_override_scope; end if;

  if v_applied_profile_id is not null then
    select ap.visibility_scope into v_profile_scope
    from public.access_profiles ap where ap.id = v_applied_profile_id limit 1;
    if v_profile_scope is not null then return v_profile_scope; end if;
  end if;

  -- Role-default fallback
  if v_role = 'executive' then return 'all'; end if;
  if v_role = 'manager' then return 'department'; end if;
  if v_role in ('team_leader', 'supervisor') then return 'team'; end if;
  return 'own';
end;
$$;

create or replace function public.current_user_visibility_departments()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_override_depts text[];
  v_applied_profile_id uuid;
  v_profile_depts text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return array[]::text[]; end if;

  select po.departments, po.applied_profile_id
    into v_override_depts, v_applied_profile_id
  from public.permission_overrides po where po.user_id = v_user_id limit 1;

  if v_override_depts is not null and array_length(v_override_depts,1) > 0 then
    return v_override_depts;
  end if;

  if v_applied_profile_id is not null then
    select ap.visibility_departments into v_profile_depts
    from public.access_profiles ap where ap.id = v_applied_profile_id limit 1;
    if v_profile_depts is not null then return v_profile_depts; end if;
  end if;

  return array[]::text[];
end;
$$;

-- True iff the current user can view a record owned by `p_owner_id` given their scope.
create or replace function public.current_user_can_view_owner(p_owner_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_user_dept text;
  v_user_team uuid;
  v_owner_dept text;
  v_owner_team uuid;
  v_scope text;
  v_scope_depts text[];
begin
  select u.id, u.department, u.team_id into v_user_id, v_user_dept, v_user_team
  from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;

  v_scope := public.current_user_visibility_scope();

  -- Owner-less rows: only `all` scope can see them
  if p_owner_id is null then
    return v_scope = 'all';
  end if;

  if v_scope = 'all' then return true; end if;
  if v_scope = 'own' then return p_owner_id = v_user_id; end if;

  select u.department, u.team_id into v_owner_dept, v_owner_team
  from public.users u where u.id = p_owner_id limit 1;
  if v_owner_dept is null then return false; end if;

  if v_scope = 'team' then
    return v_user_team is not null and v_owner_team = v_user_team;
  end if;
  if v_scope = 'department' then
    return v_owner_dept = v_user_dept;
  end if;
  if v_scope = 'selected_departments' then
    v_scope_depts := public.current_user_visibility_departments();
    return v_owner_dept = any(v_scope_depts);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Grant-aware policies for contacts
--    contacts is read/written by both BD and Pricing modules; either grant counts.
-- ---------------------------------------------------------------------------

drop policy if exists "contacts_select" on public.contacts;
drop policy if exists "contacts_insert" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;
drop policy if exists "contacts_delete" on public.contacts;

create policy "contacts_select" on public.contacts for select to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','view')
    or public.current_user_has_module_permission('pricing_contacts','view'))
  and public.current_user_can_view_owner(owner_id)
);

create policy "contacts_insert" on public.contacts for insert to authenticated
with check (
  public.current_user_has_module_permission('bd_contacts','create')
  or public.current_user_has_module_permission('pricing_contacts','create')
);

create policy "contacts_update" on public.contacts for update to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','edit')
    or public.current_user_has_module_permission('pricing_contacts','edit'))
  and public.current_user_can_view_owner(owner_id)
)
with check (
  public.current_user_has_module_permission('bd_contacts','edit')
  or public.current_user_has_module_permission('pricing_contacts','edit')
);

create policy "contacts_delete" on public.contacts for delete to authenticated
using (
  (public.current_user_has_module_permission('bd_contacts','delete')
    or public.current_user_has_module_permission('pricing_contacts','delete'))
  and public.current_user_can_view_owner(owner_id)
);

-- ---------------------------------------------------------------------------
-- 3. Grant-aware policies for customers
-- ---------------------------------------------------------------------------

drop policy if exists "customers_select" on public.customers;
drop policy if exists "customers_insert" on public.customers;
drop policy if exists "customers_update" on public.customers;
drop policy if exists "customers_delete" on public.customers;

create policy "customers_select" on public.customers for select to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','view')
    or public.current_user_has_module_permission('pricing_customers','view')
    or public.current_user_has_module_permission('acct_customers','view'))
  and public.current_user_can_view_owner(owner_id)
);

create policy "customers_insert" on public.customers for insert to authenticated
with check (
  public.current_user_has_module_permission('bd_customers','create')
  or public.current_user_has_module_permission('pricing_customers','create')
);

create policy "customers_update" on public.customers for update to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','edit')
    or public.current_user_has_module_permission('pricing_customers','edit'))
  and public.current_user_can_view_owner(owner_id)
)
with check (
  public.current_user_has_module_permission('bd_customers','edit')
  or public.current_user_has_module_permission('pricing_customers','edit')
);

create policy "customers_delete" on public.customers for delete to authenticated
using (
  (public.current_user_has_module_permission('bd_customers','delete')
    or public.current_user_has_module_permission('pricing_customers','delete'))
  and public.current_user_can_view_owner(owner_id)
);

-- ---------------------------------------------------------------------------
-- 4. Grant-aware policies for tasks
--    Tasks have both owner_id and assigned_to — view if either matches scope.
-- ---------------------------------------------------------------------------

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks for select to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','view')
  and (
    public.current_user_can_view_owner(owner_id)
    or public.current_user_can_view_owner(assigned_to)
  )
);

create policy "tasks_insert" on public.tasks for insert to authenticated
with check (
  public.current_user_has_module_permission('bd_tasks','create')
);

create policy "tasks_update" on public.tasks for update to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','edit')
  and (
    public.current_user_can_view_owner(owner_id)
    or public.current_user_can_view_owner(assigned_to)
  )
)
with check (
  public.current_user_has_module_permission('bd_tasks','edit')
);

create policy "tasks_delete" on public.tasks for delete to authenticated
using (
  public.current_user_has_module_permission('bd_tasks','delete')
  and (
    public.current_user_can_view_owner(owner_id)
    or public.current_user_can_view_owner(assigned_to)
  )
);
