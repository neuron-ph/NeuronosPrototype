-- 233_evoucher_receiver_liquidation_routing.sql
-- NEU-045 — Liquidation routes to the CASH RECEIVER (decided at disbursement),
-- not the requestor. Per Carol Infante: "iba yung requestor and receiver ng
-- fund, si receiver ng fund ang dapat mag-liquidate."
--
-- The cash receiver rides in evouchers.details->>'cash_receiver_id' (a
-- public.users.id, same shape as requestor_id / created_by). No new column.
--
-- Two things happen here:
--
--  (A) RECEIVER ACCESS — let the named receiver READ the voucher and UPDATE its
--      status while liquidating (they didn't create it, so today RLS hides it
--      from them entirely), and READ the liquidation submissions on it.
--
--  (B) IDENTITY FIX — the liquidation write path was keyed on auth.uid() (a raw
--      auth uuid) while the app writes public.users.id ('user-xxxx'). They never
--      match, so liquidation_submissions inserts were silently rejected by RLS —
--      the table is empty in BOTH dev and prod (no liquidation ever succeeded).
--      Repoint these policies to get_my_profile_id() (returns the users.id for
--      the current auth user), the same helper the rest of the schema uses.

-- ── evouchers: SELECT — receiver can see their voucher ──────────────────────
ALTER POLICY evouchers_select ON public.evouchers
USING (
  current_user_can_view_record('evouchers'::text, created_by)
  OR (
    current_user_has_module_permission('my_evouchers'::text, 'approve'::text)
    AND COALESCE(pending_approver_department, (details ->> 'requestor_department'::text)) = get_my_department()
  )
  OR (details ->> 'cash_receiver_id'::text) = get_my_profile_id()
);

-- ── evouchers: UPDATE — receiver can transition status while liquidating ─────
ALTER POLICY evouchers_update ON public.evouchers
USING (
  (
    (
      current_user_has_module_permission('acct_evouchers'::text, 'edit'::text)
      OR current_user_has_module_permission('acct_evouchers'::text, 'approve'::text)
      OR current_user_has_module_permission('acct_evouchers'::text, 'disburse'::text)
      OR (created_by = get_my_profile_id() AND current_user_has_module_permission('my_evouchers'::text, 'edit'::text))
      OR (
        transaction_type = 'budget_request'::text
        AND (
          current_user_has_module_permission('bd_budget_requests'::text, 'edit'::text)
          OR current_user_has_module_permission('bd_budget_requests'::text, 'approve'::text)
        )
      )
    )
    AND current_user_can_view_record('evouchers'::text, created_by)
  )
  OR (
    current_user_has_module_permission('my_evouchers'::text, 'approve'::text)
    AND COALESCE(pending_approver_department, (details ->> 'requestor_department'::text)) = get_my_department()
    AND status = 'pending_manager'::text
  )
  OR (details ->> 'cash_receiver_id'::text) = get_my_profile_id()
)
WITH CHECK (
  current_user_has_module_permission('acct_evouchers'::text, 'edit'::text)
  OR current_user_has_module_permission('acct_evouchers'::text, 'approve'::text)
  OR current_user_has_module_permission('acct_evouchers'::text, 'disburse'::text)
  OR (created_by = get_my_profile_id() AND current_user_has_module_permission('my_evouchers'::text, 'edit'::text))
  OR (
    transaction_type = 'budget_request'::text
    AND (
      current_user_has_module_permission('bd_budget_requests'::text, 'edit'::text)
      OR current_user_has_module_permission('bd_budget_requests'::text, 'approve'::text)
    )
  )
  OR (
    current_user_has_module_permission('my_evouchers'::text, 'approve'::text)
    AND COALESCE(pending_approver_department, (details ->> 'requestor_department'::text)) = get_my_department()
  )
  OR (details ->> 'cash_receiver_id'::text) = get_my_profile_id()
);

-- ── liquidation_submissions: INSERT — identity fix (auth.uid → profile id) ───
-- The liquidator (requestor OR receiver) inserts their own submission.
ALTER POLICY liquidation_submissions_insert ON public.liquidation_submissions
WITH CHECK (submitted_by = get_my_profile_id());

-- ── liquidation_submissions: SELECT — receiver/requestor/accounting can read ─
ALTER POLICY liquidation_submissions_select ON public.liquidation_submissions
USING (
  current_user_can_view_record('liquidations'::text, submitted_by)
  OR get_my_profile_id() IN (
    SELECT e.created_by FROM public.evouchers e WHERE e.id = liquidation_submissions.evoucher_id
  )
  OR get_my_profile_id() IN (
    SELECT (e.details ->> 'cash_receiver_id'::text) FROM public.evouchers e WHERE e.id = liquidation_submissions.evoucher_id
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = get_my_profile_id() AND u.department = ANY (ARRAY['Accounting'::text, 'Executive'::text])
  )
);

-- ── liquidation_submissions: UPDATE — identity fix for Accounting verify ─────
ALTER POLICY liquidation_submissions_update ON public.liquidation_submissions
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = get_my_profile_id() AND u.department = 'Accounting'::text
  )
);
