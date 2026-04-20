-- Step 1: Unique guard — each EV can only produce one billable-expense billing item
CREATE UNIQUE INDEX IF NOT EXISTS uq_bli_billable_expense_source
  ON billing_line_items (source_type, source_id)
  WHERE source_type = 'billable_expense' AND source_id IS NOT NULL;

-- Step 2: Idempotent RPC — bypasses RLS so Operations TLs can trigger billing creation
CREATE OR REPLACE FUNCTION ensure_billable_expense_billing_item(p_evoucher_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ev          evouchers%ROWTYPE;
  v_is_billable boolean;
  v_description text;
  v_billing_id  text;
  v_exists      boolean;
BEGIN
  SELECT * INTO v_ev FROM evouchers WHERE id = p_evoucher_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('created', false, 'reason', 'evoucher_not_found');
  END IF;

  -- is_billable lives in the details JSONB (set by useEVoucherSubmit)
  v_is_billable := COALESCE(
    (v_ev.details->>'is_billable')::boolean,
    false
  );

  IF NOT v_is_billable THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_billable');
  END IF;

  IF v_ev.booking_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_booking_id');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM billing_line_items
    WHERE source_type = 'billable_expense' AND source_id = p_evoucher_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('created', false, 'reason', 'already_exists');
  END IF;

  -- Build description — strip [BILLABLE] prefix added by useEVoucherSubmit
  v_description := COALESCE(v_ev.purpose, v_ev.description, 'Billable Expense');
  v_description := REGEXP_REPLACE(v_description, '^\[BILLABLE\]\s*', '');
  IF v_ev.evoucher_number IS NOT NULL THEN
    v_description := v_ev.evoucher_number || ' — ' || v_description;
  END IF;

  v_billing_id := gen_random_uuid()::text;

  INSERT INTO billing_line_items (
    id, booking_id, project_number, evoucher_id,
    source_id, source_type, description,
    service_type, amount, currency, status, category,
    created_at, updated_at
  ) VALUES (
    v_billing_id,
    v_ev.booking_id,
    v_ev.project_number,
    v_ev.id,
    v_ev.id,
    'billable_expense',
    v_description,
    'Reimbursable Expense',
    v_ev.amount,
    COALESCE(v_ev.currency, 'PHP'),
    'unbilled',
    COALESCE(
      v_ev.details->>'expense_category',
      v_ev.gl_category,
      'Billable Expenses'
    ),
    now(),
    now()
  );

  RETURN jsonb_build_object('created', true, 'billing_item_id', v_billing_id);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_billable_expense_billing_item(text) TO authenticated;
