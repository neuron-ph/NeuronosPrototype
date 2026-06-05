-- NEU-012 Phase 5b slice 1 — replace legacy identity gates (get_my_role /
-- get_my_department / is_executive) with Access Profile grants on the
-- record-table cluster. The 'director' role no longer exists on any user, so
-- every role='director' clause was already dead. Holder counts verified on dev
-- before each mapping (no flow goes dark).
--
-- Mapping summary (old identity -> grant):
--   crm_activities writes      BD|Exec dept            -> bd_activities create/edit/delete
--   budget_requests update     manager|director|Exec   -> bd_budget_requests edit|approve
--   budget_requests delete     director|Exec (dead+5)  -> bd_budget_requests delete
--   tickets update             mgr/TL/director|Exec    -> creator | 'to'-participant | (inbox:edit AND ticket visible)
--   tickets delete             director|Exec           -> inbox:delete
--   comments update/delete     own | mgr/director      -> own only (moderation moves to inbox:delete holders via tickets)
--   users insert               manager|director        -> exec_users:create
--   users update-any           manager|exec*           -> exec_users:edit  (closes: 18 managers could edit ANY user)
--   users delete               director (dead)         -> exec_users:delete
--   activity_log select        director|exec|mgr-dept  -> exec_activity_log:view | own rows
--   activity_log update/delete director|Exec           -> exec_activity_log edit/delete
--   evoucher_history update    Accounting|Exec dept    -> acct_evouchers edit|approve
--   evoucher_history delete    director (dead)         -> acct_evouchers delete
--
-- Plus: self-update escalation guard — "Users can update own profile" allowed a
-- user to rewrite their own access_profile_id/role/department. A trigger now
-- blocks changes to privileged columns unless the actor holds exec_users:edit.

-- ── crm_activities ───────────────────────────────────────────────────────────
alter policy crm_activities_insert on public.crm_activities
  with check (current_user_has_module_permission('bd_activities','create'));
alter policy crm_activities_update on public.crm_activities
  using (current_user_has_module_permission('bd_activities','edit'))
  with check (current_user_has_module_permission('bd_activities','edit'));
alter policy crm_activities_delete on public.crm_activities
  using (current_user_has_module_permission('bd_activities','delete'));

-- ── budget_requests ──────────────────────────────────────────────────────────
alter policy budget_requests_update on public.budget_requests
  using (current_user_has_module_permission('bd_budget_requests','edit')
      or current_user_has_module_permission('bd_budget_requests','approve'))
  with check (current_user_has_module_permission('bd_budget_requests','edit')
      or current_user_has_module_permission('bd_budget_requests','approve'));
alter policy budget_requests_delete on public.budget_requests
  using (current_user_has_module_permission('bd_budget_requests','delete'));

-- ── tickets ──────────────────────────────────────────────────────────────────
alter policy tickets_update on public.tickets
  using (created_by = get_my_profile_id()
      or exists (select 1 from public.ticket_participants tp
           where tp.ticket_id = tickets.id and tp.participant_user_id = get_my_profile_id() and tp.role = 'to')
      or (current_user_has_module_permission('inbox','edit') and public.current_user_can_view_ticket(id)))
  with check (created_by = get_my_profile_id()
      or exists (select 1 from public.ticket_participants tp
           where tp.ticket_id = tickets.id and tp.participant_user_id = get_my_profile_id() and tp.role = 'to')
      or (current_user_has_module_permission('inbox','edit') and public.current_user_can_view_ticket(id)));
alter policy tickets_delete on public.tickets
  using (current_user_has_module_permission('inbox','delete'));

-- ── comments (own only — record-scoped collaboration) ───────────────────────
alter policy comments_update on public.comments
  using (user_id = get_my_profile_id())
  with check (user_id = get_my_profile_id());
alter policy comments_delete on public.comments
  using (user_id = get_my_profile_id());

-- ── users ────────────────────────────────────────────────────────────────────
drop policy "Managers and directors can insert users" on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (current_user_has_module_permission('exec_users','create'));

drop policy "Managers and executives can update any user" on public.users;
create policy users_update_admin on public.users for update to authenticated
  using (current_user_has_module_permission('exec_users','edit'))
  with check (current_user_has_module_permission('exec_users','edit'));

drop policy "Directors can delete users" on public.users;
create policy users_delete on public.users for delete to authenticated
  using (current_user_has_module_permission('exec_users','delete'));

-- Self-update escalation guard: the own-profile policy stays, but privileged
-- columns may only change when the ACTOR holds exec_users:edit.
create or replace function public.guard_user_privileged_columns() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Only guard end-user (authenticated) requests; service role, edge
  -- functions, and direct admin connections pass through untouched.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'authenticated' then
    return new;
  end if;
  if (new.access_profile_id is distinct from old.access_profile_id
      or new.role is distinct from old.role
      or new.department is distinct from old.department
      or new.team_id is distinct from old.team_id
      or new.is_active is distinct from old.is_active
      or new.ev_approval_authority is distinct from old.ev_approval_authority)
     and not current_user_has_module_permission('exec_users','edit') then
    raise exception 'changing privileged user columns requires exec_users:edit';
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_user_privileged_columns on public.users;
create trigger trg_guard_user_privileged_columns
  before update on public.users
  for each row execute function public.guard_user_privileged_columns();

-- ── activity_log ─────────────────────────────────────────────────────────────
alter policy activity_log_select on public.activity_log
  using (current_user_has_module_permission('exec_activity_log','view')
      or user_id = get_my_profile_id());
alter policy activity_log_update on public.activity_log
  using (current_user_has_module_permission('exec_activity_log','edit'))
  with check (current_user_has_module_permission('exec_activity_log','edit'));
alter policy activity_log_delete on public.activity_log
  using (current_user_has_module_permission('exec_activity_log','delete'));

-- ── evoucher_history ─────────────────────────────────────────────────────────
alter policy evoucher_history_update on public.evoucher_history
  using (current_user_has_module_permission('acct_evouchers','edit')
      or current_user_has_module_permission('acct_evouchers','approve'))
  with check (current_user_has_module_permission('acct_evouchers','edit')
      or current_user_has_module_permission('acct_evouchers','approve'));
alter policy evoucher_history_delete on public.evoucher_history
  using (current_user_has_module_permission('acct_evouchers','delete'));
