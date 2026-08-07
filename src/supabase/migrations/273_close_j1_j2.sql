-- 273 — close J1 and J2, both of which are holes left by this same day's fixes
--
-- J1. Migration 271 fixed the authorization guard at the TOP of
-- send_billing_items_to_booking. Six lines below it sat the cross-customer
-- guard, carrying the identical shape:
--
--     IF v_booking_project_id IS NOT NULL AND v_booking_project_id <> v_project_id
--
-- 230 of 239 dev bookings have project_id NULL, so the AND short-circuits and
-- the tenancy check never fires. A properly-granted Accounting/Pricing/BD user
-- could post revenue onto customer A's booking while naming customer B's
-- project — through a SECURITY DEFINER function, with RLS off.
--
-- H2 was `NULL NOT IN (...)`. This is `NULL IS NOT NULL AND ...`. Same family.
-- The rule this migration adopts, rather than patching the instance:
-- A GUARD MUST FAIL CLOSED. If the relationship cannot be established, refuse.
-- Booking.project_id is mostly NULL, so the guard falls back to customer_id and
-- then to a normalised customer_name, and REFUSES when it can establish nothing.
-- (Verified: 0 of the 9 bookings that do carry project_id disagree with their
-- project on customer_name, so no existing data trips the new fallback.)
--
-- J2. Migration 270 froze `status` behind evoucher_transition() and left the
-- fields that decide status's ROUTE wide open. evoucher_transition compares
-- COALESCE(pending_approver_department, details->>'requestor_department') to the
-- caller's department — and the evouchers_update owner branch places no column
-- restriction, so the requestor could null the first, set the second to her own
-- department, and have her own manager approve the spend that the routing rule
-- (Forwarding expenses -> Pricing Manager) exists to keep at arm's length.
--
-- Two neighbours on the same row were equally free:
--   details.cash_receiver_id — a self-perpetuating skeleton key. Whoever is
--     named gets read visibility, UPDATE on every column but status, and the
--     liquidation edge. It appears in both USING and WITH CHECK.
--   details.is_billable — flipping it fires ensure_billable_expense_billing_item,
--     a SECURITY DEFINER writer that mints a customer-facing revenue line with no
--     billings grant and no catalog item.
--
-- Locking `status` while leaving these is a lock on the door beside an open
-- window. The guard is therefore widened from one column to the set that decides
-- routing and authority — with the legitimate writers named explicitly:
--   * Treasury (acct_evouchers:disburse) names the cash receiver at payout.
--   * Accounting (approve/disburse) may re-route an approval.
--   * requestor_department and is_billable are creation-time facts: nobody
--     rewrites them on an existing voucher.
--
-- Service-role writes (auth.uid() IS NULL) pass untouched, the same convention
-- 270 and the pre-existing enforce_evoucher_* triggers already use.

-- ─────────────────────────────────────────────────────────────────────────────
-- J1 — the tenancy guard fails closed
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.send_billing_items_to_booking(
  p_booking_id text,
  p_project_number text,
  p_items jsonb
)
returns table(inserted_count integer, updated_count integer)
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  v_department TEXT;
  v_project_id TEXT;
  v_project_customer_id TEXT;
  v_project_customer_name TEXT;
  v_booking_project_id TEXT;
  v_booking_customer_id TEXT;
  v_booking_customer_name TEXT;
  v_booking_number TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_is_virtual BOOLEAN;
  v_currency TEXT;
  v_amount NUMERIC;
  v_rate NUMERIC;
  v_rate_date DATE;
  v_base_amount NUMERIC;
  v_inserted_count INTEGER := 0;
  v_updated_count INTEGER := 0;
BEGIN
  -- H2: refuse the anonymous caller outright rather than relying on a
  -- comparison that silently evaluates to NULL for them.
  IF auth.uid() IS NULL OR public.get_my_profile_id() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- H4: a grant, not a department string. This function writes billing lines
  -- with RLS switched off, so it must ask the same question the billings
  -- policies ask.
  v_department := public.get_my_department();
  IF NOT public.current_user_can_billings('create')
     OR v_department IS NULL
     OR v_department NOT IN ('Business Development', 'Pricing', 'Accounting', 'Executive')
  THEN
    RAISE EXCEPTION 'Not authorized to send billing items to booking'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(BTRIM(p_booking_id), '') = '' THEN
    RAISE EXCEPTION 'Booking id is required';
  END IF;
  IF COALESCE(BTRIM(p_project_number), '') = '' THEN
    RAISE EXCEPTION 'Project number is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be a JSON array';
  END IF;

  SELECT id, customer_id, customer_name
    INTO v_project_id, v_project_customer_id, v_project_customer_name
  FROM projects WHERE project_number = p_project_number;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found', p_project_number;
  END IF;

  SELECT project_id, booking_number, customer_id, customer_name
    INTO v_booking_project_id, v_booking_number, v_booking_customer_id, v_booking_customer_name
  FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  -- J1: establish that the booking and the project belong together, by whatever
  -- link is actually populated — and REFUSE when none of them is. The old form
  -- of this check passed silently whenever booking.project_id was NULL, which is
  -- 96% of dev bookings.
  IF v_booking_project_id IS NOT NULL THEN
    IF v_booking_project_id <> v_project_id THEN
      RAISE EXCEPTION 'Booking % belongs to a different project than %',
        p_booking_id, p_project_number USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_booking_customer_id IS NOT NULL AND v_project_customer_id IS NOT NULL THEN
    IF v_booking_customer_id <> v_project_customer_id THEN
      RAISE EXCEPTION 'Booking % and project % belong to different customers',
        p_booking_id, p_project_number USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_booking_customer_name IS NOT NULL AND v_project_customer_name IS NOT NULL THEN
    IF UPPER(BTRIM(v_booking_customer_name)) <> UPPER(BTRIM(v_project_customer_name)) THEN
      RAISE EXCEPTION 'Booking % and project % belong to different customers',
        p_booking_id, p_project_number USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION
      'Cannot establish that booking % belongs to project % — refusing to move money between them',
      p_booking_id, p_project_number USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := NULLIF(v_item->>'id', '');
    v_is_virtual := COALESCE(NULLIF(v_item->>'is_virtual', '')::BOOLEAN, FALSE)
      OR COALESCE(v_item_id LIKE 'virtual-%', FALSE)
      OR COALESCE(v_item_id LIKE 'temp-%', FALSE);

    IF v_is_virtual THEN
      v_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'PHP');
      v_amount := COALESCE(NULLIF(v_item->>'amount', '')::NUMERIC, 0);
      v_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::NUMERIC, 1);
      v_rate_date := COALESCE(NULLIF(v_item->>'exchange_rate_date', '')::DATE, CURRENT_DATE);

      IF v_currency = 'PHP' THEN
        v_base_amount := v_amount;
      ELSIF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_base_amount := ROUND(v_amount * v_rate, 2);
      ELSE
        v_base_amount := v_amount;
      END IF;

      INSERT INTO billing_line_items (
        id, booking_id, booking_number, project_number, description, service_type,
        category, quotation_category, amount, quantity, currency, original_currency,
        exchange_rate, exchange_rate_date, base_currency, base_amount, status, is_taxed,
        source_quotation_item_id, source_type, catalog_item_id, catalog_snapshot, created_at
      )
      VALUES (
        gen_random_uuid()::TEXT, p_booking_id, v_booking_number, p_project_number,
        COALESCE(v_item->>'description', ''),
        NULLIF(v_item->>'service_type', ''),
        COALESCE(NULLIF(v_item->>'category', ''), NULLIF(v_item->>'quotation_category', ''), 'Uncategorized'),
        NULLIF(v_item->>'quotation_category', ''),
        v_amount,
        COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 1),
        v_currency, v_currency,
        CASE WHEN v_currency = 'PHP' THEN 1 ELSE NULLIF(v_rate, 0) END,
        v_rate_date, 'PHP', v_base_amount,
        COALESCE(NULLIF(v_item->>'status', ''), 'unbilled'),
        COALESCE(NULLIF(v_item->>'is_taxed', '')::BOOLEAN, FALSE),
        NULLIF(v_item->>'source_quotation_item_id', ''),
        COALESCE(NULLIF(v_item->>'source_type', ''),
          CASE WHEN NULLIF(v_item->>'source_quotation_item_id', '') IS NOT NULL THEN 'quotation_item' ELSE 'manual' END),
        NULLIF(v_item->>'catalog_item_id', ''),
        COALESCE(v_item->'catalog_snapshot', '{}'::JSONB),
        COALESCE(NULLIF(v_item->>'created_at', '')::TIMESTAMPTZ, NOW())
      );

      v_inserted_count := v_inserted_count + 1;
    ELSE
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Persisted billing items must include an id';
      END IF;
      UPDATE billing_line_items
      SET booking_id = p_booking_id,
          booking_number = COALESCE(v_booking_number, booking_number),
          updated_at = NOW()
      WHERE id = v_item_id AND project_number = p_project_number;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing item % not found for project %', v_item_id, p_project_number;
      END IF;
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted_count, v_updated_count;
END;
$$;

-- CREATE OR REPLACE resets the ACL to PUBLIC EXECUTE (finding H2's second
-- lesson), so the revoke has to be repeated after every replace.
revoke execute on function public.send_billing_items_to_booking(text, text, jsonb) from public, anon;
grant execute on function public.send_billing_items_to_booking(text, text, jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- J2 — freeze the fields that decide the route, not just the status
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_evoucher_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Service-role / migration writes pass, same convention as 270.
  if auth.uid() is null then
    return new;
  end if;

  -- (a) status — only through evoucher_transition (finding G1/G2, migration 270)
  if new.status is distinct from old.status
     and coalesce(current_setting('neuron.evoucher_transition', true), '')
         <> old.id || '->' || new.status
  then
    raise exception
      'E-Voucher status may only be changed through evoucher_transition() (attempted % -> %)',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- (b) the routing target. Changing it changes WHO may approve, so it belongs
  -- to Accounting, never to the requestor.
  if (new.pending_approver_department is distinct from old.pending_approver_department
      or new.pending_approver_role is distinct from old.pending_approver_role)
     and not (current_user_has_module_permission('acct_evouchers', 'approve')
           or current_user_has_module_permission('acct_evouchers', 'disburse'))
  then
    raise exception
      'The approver routing on an E-Voucher may not be changed (attempted % -> %)',
      coalesce(old.pending_approver_department, '(none)'),
      coalesce(new.pending_approver_department, '(none)')
      using errcode = 'check_violation';
  end if;

  -- (c) requestor_department is the COALESCE fallback the routing trusts when no
  -- rule matched. It is a fact about who raised the voucher, not an editable
  -- field — and rewriting it re-points the approval.
  if (new.details ->> 'requestor_department') is distinct from (old.details ->> 'requestor_department')
  then
    raise exception 'The requestor department on an E-Voucher may not be changed'
      using errcode = 'check_violation';
  end if;

  -- (d) is_billable decides whether an AFTER trigger mints a customer-facing
  -- revenue line with RLS switched off. Set it at creation or not at all.
  if (new.details ->> 'is_billable') is distinct from (old.details ->> 'is_billable')
  then
    raise exception 'The billable flag on an E-Voucher may not be changed after creation'
      using errcode = 'check_violation';
  end if;

  -- (e) cash_receiver_id is a skeleton key: it grants read, near-full update and
  -- the liquidation edge, and it sits in both USING and WITH CHECK so its holder
  -- can keep it. Treasury names the receiver at payout; nobody else names one.
  if (new.details ->> 'cash_receiver_id') is distinct from (old.details ->> 'cash_receiver_id')
     and not current_user_has_module_permission('acct_evouchers', 'disburse')
  then
    raise exception 'Only Treasury may name the cash receiver on an E-Voucher'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists evoucher_guard_status on public.evouchers;
drop trigger if exists evoucher_guard_privileged on public.evouchers;
create trigger evoucher_guard_privileged
  before update on public.evouchers
  for each row execute function public.guard_evoucher_privileged_fields();

-- The narrower predecessor is now covered by (a) above.
drop function if exists public.guard_evoucher_status_change();

comment on function public.guard_evoucher_privileged_fields() is
  'Freezes the fields that decide an E-Voucher''s route and authority: status '
  '(via evoucher_transition), the approver routing, requestor_department, '
  'is_billable and cash_receiver_id. See migration 273 and findings G1/G2/J2.';
