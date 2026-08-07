-- ─────────────────────────────────────────────────────────────────────────────
-- 268 — Drop ev_approval_authority
--
-- Added in migration 025 for an e-voucher delegation model: a team leader
-- holding the flag would have their team's vouchers skip the CEO gate and go
-- straight to pending_accounting.
--
-- It was never used. 0 of 60 users held it in dev and 0 of 60 in prod (with 13
-- team leaders) at the time of removal. More importantly it was never enforced:
-- the only consumer was one client-side branch in EVoucherWorkflowPanel, and no
-- RLS policy or database function ever read the column. The browser decided the
-- next status and the database accepted it — an authority flag in name only.
--
-- Removed rather than left dormant, because an unenforced flag invites being
-- switched on later by someone who assumes the server checks it.
--
-- The manager step now always routes to pending_ceo.
--
-- ORDER OF OPERATIONS: deploy the application code BEFORE applying this
-- migration. UserDetailPage previously named the column in an explicit select,
-- so dropping it against the old bundle would break that page. The new code
-- never references it, so code-then-migration is safe in either environment.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Rebuild the privileged-column guard without the ev_approval_authority
--    clause. Dropping the column while the trigger still references it would
--    make every authenticated UPDATE on users fail.
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
      or new.is_active is distinct from old.is_active)
     and not current_user_has_module_permission('exec_users','edit') then
    raise exception 'changing privileged user columns requires exec_users:edit';
  end if;
  return new;
end; $$;

-- 2. Drop the column. No data is lost — every row is false.
alter table public.users drop column if exists ev_approval_authority;
