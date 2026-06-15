-- 208_evoucher_rls_key_on_materialized_approver.sql
-- Aligns the evoucher approver RLS ("Key D") with the routing engine.
--
-- Background:
--   Migration 133 added "Key D" so a department manager can see/act on a
--   voucher awaiting their approval. It keyed that door on the voucher's
--   *requestor* department:  details->>'requestor_department' = get_my_department().
--   (Migration 158 later rewrote the rest of these policies to use
--    current_user_can_view_record('evouchers', created_by), but left Key D's
--    requestor_department test untouched.)
--
--   Migration 205 then introduced the configurable routing engine, which
--   MATERIALIZES the chosen approver onto evouchers.pending_approver_department
--   (defaulting, via the set_evoucher_pending_approver trigger, to the
--   requestor's own department when no rule matches). The approval-queue query
--   in useEVouchers was switched to filter on pending_approver_department — but
--   the RLS policies were never updated to match.
--
--   Result: a routed voucher (e.g. a Forwarding-job expense requested by an
--   Operations user but routed to the Pricing Manager) is stamped
--   pending_approver_department = 'Pricing', yet RLS still only opened the door
--   when requestor_department ('Operations') = the viewer's department. The
--   Pricing Manager's approval queue query returned the row, but RLS silently
--   filtered it out, so the queue rendered empty. This is why routed e-vouchers
--   were never reaching their approver.
--
-- Fix:
--   ALTER the two policies' Key D clause to key on the materialized approver:
--   coalesce(pending_approver_department, details->>'requestor_department').
--   - Routed vouchers surface to the routed approver's department only.
--   - Non-routed vouchers are unchanged: pending_approver_department defaults to
--     the requestor's department, so the same managers keep their visibility.
--   The COALESCE fallback protects any row whose approver column is ever null.
--   Every other clause is preserved verbatim from the live policy.

alter policy "evouchers_select" on public.evouchers
using (
  (
    (
      public.current_user_has_module_permission('acct_evouchers', 'view')
      OR ((created_by = public.get_my_profile_id()) AND public.current_user_has_module_permission('my_evouchers', 'view'))
      OR ((transaction_type = 'budget_request') AND public.current_user_has_module_permission('bd_budget_requests', 'view'))
    )
    AND public.current_user_can_view_record('evouchers', created_by)
  )
  OR (
    public.current_user_has_module_permission('my_evouchers', 'approve')
    AND (coalesce(pending_approver_department, details ->> 'requestor_department') = public.get_my_department())
  )
);

alter policy "evouchers_update" on public.evouchers
using (
  (
    (
      public.current_user_has_module_permission('acct_evouchers', 'edit')
      OR public.current_user_has_module_permission('acct_evouchers', 'approve')
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
  OR ((created_by = public.get_my_profile_id()) AND public.current_user_has_module_permission('my_evouchers', 'edit'))
  OR ((transaction_type = 'budget_request') AND (public.current_user_has_module_permission('bd_budget_requests', 'edit') OR public.current_user_has_module_permission('bd_budget_requests', 'approve')))
  OR (
    public.current_user_has_module_permission('my_evouchers', 'approve')
    AND (coalesce(pending_approver_department, details ->> 'requestor_department') = public.get_my_department())
  )
);
