-- 232_evoucher_disburse_permission_split.sql
-- NEU-042: split disbursement from voucher approval.
--
-- Before: acct_evouchers:approve gated FOUR things at once — voucher approval
-- (the CEO step), disbursement (Treasury releasing the cash), verify-and-post,
-- and unlock. So anyone who could disburse could also approve, which is the
-- exact leak the accounting team reported (an Accounts Payable staffer able to
-- approve voucher requests).
--
-- After: a dedicated acct_evouchers:disburse capability gates ONLY the
-- "release the cash" transition (pending_accounting -> disbursed|posted).
-- acct_evouchers:approve keeps CEO approval / verify-and-post / unlock.
-- The UI gates were repointed in EVoucherWorkflowPanel + DisburseEVoucherPage;
-- this migration enforces the same split at the database so it holds even
-- outside the UI.

-- 1) Allow disburse-capability holders to write the evoucher row. Every clause
--    is preserved verbatim from migration 208; this only adds the disburse
--    OR-term to the accounting write branch (USING + WITH CHECK).
alter policy "evouchers_update" on public.evouchers
using (
  (
    (
      public.current_user_has_module_permission('acct_evouchers', 'edit')
      OR public.current_user_has_module_permission('acct_evouchers', 'approve')
      OR public.current_user_has_module_permission('acct_evouchers', 'disburse')
      OR ((created_by = public.get_my_profile_id()) AND public.current_user_has_module_permission('my_evouchers', 'edit'))
      OR ((transaction_type = 'budget_request') AND (public.current_user_has_module_permission('bd_budget_requests', 'edit') OR public.current_user_has_module_permission('bd_budget_requests', 'approve')))
    )
    AND public.current_user_can_view_record('evouchers', created_by)
  )
  OR (
    public.current_user_has_module_permission('my_evouchers', 'approve')
    AND (coalesce(pending_approver_department, details ->> 'requestor_department') = public.get_my_department())
    AND (status = 'pending_manager')
  )
)
with check (
  public.current_user_has_module_permission('acct_evouchers', 'edit')
  OR public.current_user_has_module_permission('acct_evouchers', 'approve')
  OR public.current_user_has_module_permission('acct_evouchers', 'disburse')
  OR ((created_by = public.get_my_profile_id()) AND public.current_user_has_module_permission('my_evouchers', 'edit'))
  OR ((transaction_type = 'budget_request') AND (public.current_user_has_module_permission('bd_budget_requests', 'edit') OR public.current_user_has_module_permission('bd_budget_requests', 'approve')))
  OR (
    public.current_user_has_module_permission('my_evouchers', 'approve')
    AND (coalesce(pending_approver_department, details ->> 'requestor_department') = public.get_my_department())
  )
);

-- 2) Enforce the disbursement transition itself. Only a disburse-capability
--    holder may move a voucher OUT of pending_accounting and INTO disbursed
--    (cash advance / direct expense) or posted (reimbursement). Approval,
--    verify-and-post, and unlock are different transitions and are untouched.
--
--    auth.uid() IS NOT NULL guard: exempt trusted service-role / SQL-console
--    writes (migrations, backfills) which run without an end-user JWT and would
--    otherwise resolve the permission check to false.
create or replace function public.enforce_evoucher_disburse_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and old.status = 'pending_accounting'
     and new.status in ('disbursed', 'posted')
     and not public.current_user_has_module_permission('acct_evouchers', 'disburse')
  then
    raise exception 'Only Treasury (acct_evouchers:disburse) may disburse an E-Voucher'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists evoucher_enforce_disburse on public.evouchers;
create trigger evoucher_enforce_disburse
  before update on public.evouchers
  for each row
  execute function public.enforce_evoucher_disburse_permission();
