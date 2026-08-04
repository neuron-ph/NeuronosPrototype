-- 274 — Wave 0, part 1: shut the storage tree, and stop a billable expense
-- falling through the crack between header and line.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- M1 — the attachments bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Two policies guarded 424 real client documents (air waybills, BIR 2303 tax
-- certificates, official receipts) and both checked only the bucket's name:
--
--   attachments_public_read       SELECT to anon           USING bucket_id = 'attachments'
--   attachments_authenticated_all ALL    to authenticated  USING bucket_id = 'attachments'
--
-- THIS IS A MITIGATION, NOT THE FIX. The bucket is `public = true`, and a public
-- bucket serves /storage/v1/object/public/... WITHOUT consulting RLS at all. So
-- no policy change can stop someone who already holds a URL. Only
-- `public = false` does that, and the app calls getPublicUrl in six places and
-- stores the resulting permanent URL on the row — flipping the flag breaks every
-- attachment link in the product until those move to signed URLs. That refactor
-- is scoped separately and needs Marcus's call.
--
-- What this migration DOES buy, and it is the difference between a leak and a
-- catastrophe:
--
--   1. Anonymous callers can no longer LIST. Today an anon client walks the root
--      (bookings/, customers/, evouchers/, liquidations/, quotations/, …) and
--      then walks into each entity folder, which makes the UUID in every
--      filename worthless — you do not have to guess a path you can enumerate.
--      Dropping anon SELECT closes the tree. Reads via a public URL still work,
--      so the app is untouched; an attacker now has to GUESS a UUID rather than
--      read the index.
--
--   2. Employees can no longer overwrite or delete each other's documents.
--      `ALL` bucket-wide meant any logged-in user could replace a client's bill
--      of lading or delete an e-voucher receipt. Writes are now scoped to the
--      uploader, reads stay open to authenticated users (the app legitimately
--      shows attachments across departments).
--
-- Note the shape being corrected: `ticket-files` is private and gated on
-- current_user_can_view_ticket(); `avatars` scopes writes to the owner's folder.
-- The pattern existed in this schema. `attachments` never got it.

-- APPLIED SEPARATELY. storage.objects is owned by supabase_storage_admin, so the
-- clone_exec_sql helper this repo uses cannot alter its policies ("must be owner
-- of relation objects"). The four policies below were applied through the
-- Supabase migration runner as `wave0_attachments_storage_policies`; they are
-- kept here so the file remains the record of what was done.
--
--   drop policy attachments_public_read        -- anon SELECT, whole bucket
--   drop policy attachments_authenticated_all  -- ALL to authenticated, whole bucket
--   create policy attachments_authenticated_read    SELECT to authenticated
--   create policy attachments_authenticated_insert  INSERT to authenticated
--   create policy attachments_owner_update          UPDATE where owner = auth.uid()
--   create policy attachments_owner_delete          DELETE where owner = auth.uid()

-- ─────────────────────────────────────────────────────────────────────────────
-- L1 — a billable expense whose booking is on the line, not the header
-- ─────────────────────────────────────────────────────────────────────────────
-- ensure_billable_expense_billing_item() returns early on `no_booking_id`, and
-- since NEU-088/D2 moved the booking link from the voucher header to its line
-- items, a voucher raised from /my-evouchers carries a NULL header booking. Such
-- a voucher can be approved, disbursed and posted while quietly minting no
-- receivable at all.
--
-- MEASURED BEFORE FIXING, because the mechanism overstates the damage: of 166
-- billable vouchers on dev, 87 at pending_accounting all minted correctly, the
-- 65 with no receivable are still at pending_ceo (the trigger fires later, which
-- is correct), and exactly ONE has a NULL header — EV-2026-0001, the oldest row
-- in the system. The path people actually use (a booking's Expenses tab) sets
-- the header correctly. This is a latent gap in one code path, not a live bleed.
--
-- Fixed in both layers on purpose: the client now derives the header booking
-- from the lines (see useEVoucherSubmit), and this function falls back to the
-- lines when the header is NULL — so a voucher written by any other caller,
-- today or in future, still bills.

create or replace function public.ensure_billable_expense_billing_item(p_evoucher_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  v_ev          evouchers%ROWTYPE;
  v_is_billable boolean;
  v_booking_id  text;
  v_description text;
  v_category    text;
  v_billing_id  text;
  v_exists      boolean;
  v_booking_no  text;
BEGIN
  SELECT * INTO v_ev FROM evouchers WHERE id = p_evoucher_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'evoucher_not_found');
  END IF;

  v_is_billable := COALESCE((v_ev.details->>'is_billable')::boolean, false);
  IF NOT v_is_billable THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_billable');
  END IF;

  -- L1: the header is the preferred source, but D2 puts the booking on the LINE.
  -- Fall back to the lines rather than silently declining to bill. A voucher
  -- whose lines span several bookings is ambiguous, so it is reported as such
  -- instead of guessing which client to charge.
  v_booking_id := v_ev.booking_id;
  IF v_booking_id IS NULL THEN
    SELECT DISTINCT li.booking_id INTO v_booking_id
    FROM evoucher_line_items li
    WHERE li.evoucher_id = p_evoucher_id AND li.booking_id IS NOT NULL;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('created', false, 'reason', 'no_booking_id');
    END IF;

    IF (SELECT count(DISTINCT li.booking_id) FROM evoucher_line_items li
        WHERE li.evoucher_id = p_evoucher_id AND li.booking_id IS NOT NULL) > 1 THEN
      RETURN jsonb_build_object('created', false, 'reason', 'ambiguous_booking');
    END IF;

    -- Heal the header so every downstream reader (and the tenancy rules coming
    -- in J3) sees a booking-linked voucher.
    UPDATE evouchers SET booking_id = v_booking_id WHERE id = p_evoucher_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM billing_line_items
    WHERE source_type = 'billable_expense' AND source_id = p_evoucher_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('created', false, 'reason', 'already_exists');
  END IF;

  SELECT booking_number INTO v_booking_no FROM bookings WHERE id = v_booking_id;

  v_description := COALESCE(NULLIF(v_ev.description, ''), NULLIF(v_ev.purpose, ''),
                            'Billable expense ' || COALESCE(v_ev.evoucher_number, p_evoucher_id));
  v_category    := COALESCE(NULLIF(v_ev.gl_category, ''), 'Reimbursable Expense');
  v_billing_id  := gen_random_uuid()::text;

  INSERT INTO billing_line_items (
    id, booking_id, booking_number, project_number, description, service_type,
    category, quotation_category, amount, quantity, currency, original_currency,
    exchange_rate, base_currency, base_amount, status, is_taxed,
    source_type, source_id, evoucher_id, created_at
  ) VALUES (
    v_billing_id, v_booking_id, v_booking_no, v_ev.project_number,
    v_description, 'Reimbursable Expense', v_category, v_category,
    COALESCE(v_ev.amount, 0), 1,
    COALESCE(v_ev.currency, 'PHP'), COALESCE(v_ev.currency, 'PHP'),
    COALESCE(v_ev.exchange_rate, 1), 'PHP',
    COALESCE(v_ev.base_amount, v_ev.amount, 0),
    'unbilled', false,
    'billable_expense', p_evoucher_id, p_evoucher_id, now()
  );

  RETURN jsonb_build_object('created', true, 'billing_line_item_id', v_billing_id,
                            'booking_id', v_booking_id);
END;
$$;

comment on function public.ensure_billable_expense_billing_item(text) is
  'Mints the receivable for a billable expense. Falls back to the line items when '
  'the header booking is NULL (D2 moved the link to the line) and heals the '
  'header. Refuses rather than guesses when the lines span several bookings. '
  'See migration 274 and finding L1.';
