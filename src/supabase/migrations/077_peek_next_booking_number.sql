-- 077_peek_next_booking_number.sql
-- Non-allocating preview of the next booking number for a service type.
-- Mirrors generate_booking_number (037) but does NOT increment the counter.
-- Used by booking creation panels to display the upcoming number before save.
--
-- IMPORTANT: This is a preview only. The actual booking_number is still
-- assigned atomically by generate_booking_number on submit. Concurrent
-- creates may race so the displayed value is best-effort.

CREATE OR REPLACE FUNCTION peek_next_booking_number(p_service_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter_key TEXT;
  v_prefix      TEXT;
  v_year        TEXT;
  v_current_val INTEGER;
BEGIN
  CASE p_service_type
    WHEN 'Forwarding'       THEN v_counter_key := 'forwarding_booking_counter';       v_prefix := 'FWD';
    WHEN 'Brokerage'        THEN v_counter_key := 'brokerage_booking_counter';        v_prefix := 'BRK';
    WHEN 'Trucking'         THEN v_counter_key := 'trucking_booking_counter';         v_prefix := 'TRK';
    WHEN 'Marine Insurance' THEN v_counter_key := 'marine_insurance_booking_counter'; v_prefix := 'MIP';
    WHEN 'Others'           THEN v_counter_key := 'others_booking_counter';           v_prefix := 'OTH';
    ELSE
      RAISE EXCEPTION 'Unknown service_type: %', p_service_type;
  END CASE;

  v_year := to_char(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY');

  SELECT COALESCE((value::text::integer), 0) INTO v_current_val
  FROM counters
  WHERE key = v_counter_key;

  IF v_current_val IS NULL THEN
    v_current_val := 0;
  END IF;

  RETURN v_prefix || '-' || v_year || '-' || lpad((v_current_val + 1)::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION peek_next_booking_number(TEXT) TO authenticated;
