-- Migration 248: let the cash receiver release their own advance disbursement
-- entry for posting.
--
-- BUG (found in UX E2E): NEU-100's "Confirm Receipt" flips the advance
-- disbursement JE awaiting_ack -> ready_to_post, but the journal_entries UPDATE
-- policy requires acct_journal/acct_financials view — which the fund receiver (an
-- Operations staffer) does not hold. The update hit 0 rows and silently no-oped,
-- stranding the Dr 1150 / Cr Cash entry at awaiting_ack forever.
--
-- Fix: a narrow, self-authorizing carve-out — the disburse recipient may flip
-- ONLY their own advance entry, ONLY from awaiting_ack -> ready_to_post. Mirrors
-- the evouchers "cash_receiver_id = get_my_profile_id()" read carve-out.
-- (The client also now guards the write so a 0-row result surfaces as an error.)

DROP POLICY IF EXISTS journal_entries_update_ack ON public.journal_entries;

CREATE POLICY journal_entries_update_ack ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (
    kind = 'advance'
    AND status = 'awaiting_ack'
    AND disburse_to_user_id = public.get_my_profile_id()
  )
  WITH CHECK (
    kind = 'advance'
    AND status = 'ready_to_post'
    AND disburse_to_user_id = public.get_my_profile_id()
  );

-- The UPDATE carve-out alone isn't enough: the client's
-- .update().eq('status','awaiting_ack') has a WHERE that reads columns, so
-- PostgreSQL requires SELECT visibility to find the row. journal_entries SELECT is
-- creator-only, so the receiver couldn't see (hence couldn't update) their own
-- advance entry. Add a self-authorizing SELECT carve-out mirroring the evouchers
-- cash-receiver read rule.
DROP POLICY IF EXISTS journal_entries_select_ack ON public.journal_entries;

CREATE POLICY journal_entries_select_ack ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (disburse_to_user_id = public.get_my_profile_id());
