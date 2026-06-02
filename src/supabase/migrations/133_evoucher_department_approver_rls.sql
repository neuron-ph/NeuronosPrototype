-- 133_evoucher_department_approver_rls.sql
-- Wires the "Approve" permission (my_evouchers:approve) into the evouchers RLS.
--
-- Background:
--   Migrations 098/101 rewrote the evouchers policies from simple role checks
--   to module-permission checks, but only ever built two doors for SEEING a
--   voucher: `acct_evouchers:view` (Accounting workspace) and
--   `my_evouchers:view` (fenced to created_by = me, i.e. own rows only).
--   There was NO door for a department manager to see/act on a subordinate's
--   voucher awaiting their approval. The `my_evouchers:approve` toggle existed
--   in the UI and access profiles but was a dead key — it appeared nowhere in
--   the policies. Result: a manager's Personal -> E-Vouchers approval queue
--   rendered but came back empty, because RLS refused the rows.
--
-- Fix ("Key D"): add a standalone branch that says
--   "you may see/act on a voucher if you hold my_evouchers:approve AND the
--    voucher's requestor_department equals your own department."
--
-- Why standalone (not folded into the existing branch):
--   The existing branch is ANDed with current_user_can_view_record(), whose
--   `department` scope keys off a static per-transaction_type department array.
--   For reimbursement / direct_expense that array resolves to {Accounting}
--   only, which would silently block non-Accounting managers no matter what.
--   Keeping the approver branch independent makes it work for EVERY voucher
--   type and scopes it tightly to the manager's own department (no peeking at
--   sibling departments) via a direct details->>'requestor_department' match.
--
-- UPDATE is additionally pinned to status = 'pending_manager' in USING so a
-- manager can only act on a voucher actually waiting for their approval (not
-- edit already-disbursed/posted ones). WITH CHECK is left unpinned so the
-- approve/reject transition to the next status is allowed.

drop policy if exists "evouchers_select" on public.evouchers;
drop policy if exists "evouchers_update" on public.evouchers;

create policy "evouchers_select" on public.evouchers for select to authenticated
using (
  (
    (
      public.current_user_has_module_permission('acct_evouchers','view')
      or (created_by = public.get_my_profile_id()
          and public.current_user_has_module_permission('my_evouchers','view'))
      or (transaction_type = 'budget_request'
          and public.current_user_has_module_permission('bd_budget_requests','view'))
    )
    and public.current_user_can_view_record(
      created_by,
      case transaction_type
        when 'budget_request' then array['Business Development','Accounting']::text[]
        when 'ap_voucher'     then array['Accounting']::text[]
        when 'expense'        then array['Business Development','Pricing','Operations','Accounting']::text[]
        when 'cash_advance'   then array['Business Development','Pricing','Operations','Accounting','HR']::text[]
        else array['Accounting']::text[]
      end
    )
  )
  -- Key D: department manager / approver
  or (
    public.current_user_has_module_permission('my_evouchers','approve')
    and details->>'requestor_department' = public.get_my_department()
  )
);

create policy "evouchers_update" on public.evouchers for update to authenticated
using (
  (
    (
      public.current_user_has_module_permission('acct_evouchers','edit')
      or public.current_user_has_module_permission('acct_evouchers','approve')
      or (created_by = public.get_my_profile_id()
          and public.current_user_has_module_permission('my_evouchers','edit'))
      or (transaction_type = 'budget_request'
          and (public.current_user_has_module_permission('bd_budget_requests','edit')
               or public.current_user_has_module_permission('bd_budget_requests','approve')))
    )
    and public.current_user_can_view_record(
      created_by,
      case transaction_type
        when 'budget_request' then array['Business Development','Accounting']::text[]
        when 'ap_voucher'     then array['Accounting']::text[]
        when 'expense'        then array['Business Development','Pricing','Operations','Accounting']::text[]
        when 'cash_advance'   then array['Business Development','Pricing','Operations','Accounting','HR']::text[]
        else array['Accounting']::text[]
      end
    )
  )
  -- Key D: department manager may act on a voucher awaiting their approval
  or (
    public.current_user_has_module_permission('my_evouchers','approve')
    and details->>'requestor_department' = public.get_my_department()
    and status = 'pending_manager'
  )
)
with check (
  public.current_user_has_module_permission('acct_evouchers','edit')
  or public.current_user_has_module_permission('acct_evouchers','approve')
  or (created_by = public.get_my_profile_id()
      and public.current_user_has_module_permission('my_evouchers','edit'))
  or (transaction_type = 'budget_request'
      and (public.current_user_has_module_permission('bd_budget_requests','edit')
           or public.current_user_has_module_permission('bd_budget_requests','approve')))
  -- Key D: allow the approve/reject transition to the next status
  or (
    public.current_user_has_module_permission('my_evouchers','approve')
    and details->>'requestor_department' = public.get_my_department()
  )
);
