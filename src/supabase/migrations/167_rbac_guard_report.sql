-- NEU-012 step 10 — DB-side RBAC regression guard.
-- rbac_guard_report() returns a jsonb report of violations; every section must
-- be empty ([]/true) on a healthy database. Run via scripts/rbac-guard.mjs
-- (supabase.rpc) or directly: select public.rbac_guard_report();
--
-- Allowlists (kept-by-design exceptions, see migrations 163-166):
--   identity policies : calendar_events (visibility is dept/team by design),
--                       evouchers (requestor-department routing clause)
--   open inserts      : tickets (anyone may raise), journal_entries (Phase 5b
--                       side-effect writers), activity_log / comments /
--                       evoucher_history (audit + collaboration trails)

create or replace function public.rbac_guard_report() returns jsonb
language sql stable security definer set search_path to 'public' as $$
select jsonb_build_object(
  -- 1. No RLS policy may gate on identity (role/department) outside the allowlist.
  'identity_policies', coalesce((
    select jsonb_agg(tablename || '.' || policyname order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('calendar_events', 'evouchers')
      and (coalesce(qual,'') ~* 'get_my_role|get_my_department|is_executive'
        or coalesce(with_check,'') ~* 'get_my_role|get_my_department|is_executive')
  ), '[]'::jsonb),

  -- 2. Every public table must have RLS enabled.
  'rls_disabled_tables', coalesce((
    select jsonb_agg(t.tablename order by t.tablename)
    from pg_tables t
    where t.schemaname = 'public'
      and not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)
  ), '[]'::jsonb),

  -- 3. No INSERT policy may be wide open (with_check = true) outside the allowlist.
  'open_insert_policies', coalesce((
    select jsonb_agg(tablename || '.' || policyname order by tablename, policyname)
    from pg_policies
    where schemaname = 'public' and cmd = 'INSERT' and with_check = 'true'
      and policyname not ilike '%service%'
      and tablename not in ('tickets', 'journal_entries', 'activity_log', 'comments', 'evoucher_history')
  ), '[]'::jsonb),

  -- 4. The privileged-columns escalation guard must exist on users.
  'users_escalation_guard_present', exists (
    select 1 from pg_trigger
    where tgname = 'trg_guard_user_privileged_columns'
      and tgrelid = 'public.users'::regclass and not tgisinternal),

  -- 5. The grant + dial resolver chain must exist.
  'missing_core_functions', coalesce((
    select jsonb_agg(fn) from unnest(array[
      'current_user_has_module_permission',
      'current_user_effective_module_grant',
      'current_user_visibility_dial',
      'current_user_can_view_record',
      'current_user_can_view_booking',
      'current_user_can_view_ticket',
      'current_user_team_ids',
      'guard_user_privileged_columns'
    ]) as fn
    where not exists (select 1 from pg_proc p
      where p.proname = fn and p.pronamespace = 'public'::regnamespace)
  ), '[]'::jsonb),

  -- 6. The retired legacy mechanism must stay dead.
  'legacy_functions_present', coalesce((
    select jsonb_agg(p.proname order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('can_access_record', 'can_access_booking', 'can_access_task',
                        'get_org_block_higher_rank', '_map_legacy_scope')
  ), '[]'::jsonb)
);
$$;

revoke all on function public.rbac_guard_report() from public;
grant execute on function public.rbac_guard_report() to service_role;
