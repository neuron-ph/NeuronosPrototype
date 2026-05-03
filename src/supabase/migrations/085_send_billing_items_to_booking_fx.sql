-- Migration 085: extend send_billing_items_to_booking() to persist FX columns.
--
-- Phase D of the multi-currency rollout. Migration 081 added exchange_rate /
-- base_currency / base_amount to billing_line_items, but the RPC that backs
-- the "Send to Booking" flow in `UnifiedBillingsTab` still only inserted the
-- legacy column set, leaving USD line items without a PHP base for reports
-- to aggregate on. This redefinition mirrors migration 039 with the FX
-- columns appended; everything else is unchanged.

CREATE OR REPLACE FUNCTION send_billing_items_to_booking(
  p_booking_id TEXT,
  p_project_number TEXT,
  p_items JSONB
)
RETURNS TABLE (
  inserted_count INTEGER,
  updated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_department TEXT;
  v_project_id TEXT;
  v_booking_project_id TEXT;
  v_booking_number TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_is_virtual BOOLEAN;
  v_currency TEXT;
  v_amount NUMERIC;
  v_rate NUMERIC;
  v_base_amount NUMERIC;
  v_inserted_count INTEGER := 0;
  v_updated_count INTEGER := 0;
BEGIN
  v_department := public.get_my_department();

  IF v_department NOT IN ('Business Development', 'Pricing', 'Accounting', 'Executive') THEN
    RAISE EXCEPTION 'Not authorized to send billing items to booking';
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

  SELECT id
  INTO v_project_id
  FROM projects
  WHERE project_number = p_project_number;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found', p_project_number;
  END IF;

  SELECT project_id, booking_number
  INTO v_booking_project_id, v_booking_number
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF v_booking_project_id IS NOT NULL AND v_booking_project_id <> v_project_id THEN
    RAISE EXCEPTION 'Booking % is not linked to project %', p_booking_id, p_project_number;
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := NULLIF(v_item->>'id', '');
    v_is_virtual := COALESCE(NULLIF(v_item->>'is_virtual', '')::BOOLEAN, FALSE)
      OR COALESCE(v_item_id LIKE 'virtual-%', FALSE)
      OR COALESCE(v_item_id LIKE 'temp-%', FALSE);

    IF v_is_virtual THEN
      v_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'PHP');
      v_amount := COALESCE(NULLIF(v_item->>'amount', '')::NUMERIC, 0);
      v_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::NUMERIC, 1);
      -- PHP locks at rate 1; non-PHP requires a positive rate or we fall
      -- back to amount as the base (legacy-safe).
      IF v_currency = 'PHP' THEN
        v_base_amount := v_amount;
      ELSIF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_base_amount := ROUND(v_amount * v_rate, 2);
      ELSE
        v_base_amount := v_amount;
      END IF;

      INSERT INTO billing_line_items (
        id,
        booking_id,
        booking_number,
        project_number,
        description,
        service_type,
        category,
        quotation_category,
        amount,
        quantity,
        currency,
        exchange_rate,
        base_currency,
        base_amount,
        status,
        is_taxed,
        source_quotation_item_id,
        source_type,
        catalog_item_id,
        catalog_snapshot,
        created_at
      )
      VALUES (
        gen_random_uuid()::TEXT,
        p_booking_id,
        v_booking_number,
        p_project_number,
        COALESCE(v_item->>'description', ''),
        NULLIF(v_item->>'service_type', ''),
        COALESCE(NULLIF(v_item->>'category', ''), NULLIF(v_item->>'quotation_category', ''), 'Uncategorized'),
        NULLIF(v_item->>'quotation_category', ''),
        v_amount,
        COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 1),
        v_currency,
        CASE WHEN v_currency = 'PHP' THEN 1 ELSE NULLIF(v_rate, 0) END,
        'PHP',
        v_base_amount,
        COALESCE(NULLIF(v_item->>'status', ''), 'unbilled'),
        COALESCE(NULLIF(v_item->>'is_taxed', '')::BOOLEAN, FALSE),
        NULLIF(v_item->>'source_quotation_item_id', ''),
        COALESCE(
          NULLIF(v_item->>'source_type', ''),
          CASE
            WHEN NULLIF(v_item->>'source_quotation_item_id', '') IS NOT NULL THEN 'quotation_item'
            ELSE 'manual'
          END
        ),
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
      SET
        booking_id = p_booking_id,
        booking_number = COALESCE(v_booking_number, booking_number),
        updated_at = NOW()
      WHERE id = v_item_id
        AND project_number = p_project_number;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing item % not found for project %', v_item_id, p_project_number;
      END IF;

      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT v_inserted_count, v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION send_billing_items_to_booking(TEXT, TEXT, JSONB) TO authenticated;
