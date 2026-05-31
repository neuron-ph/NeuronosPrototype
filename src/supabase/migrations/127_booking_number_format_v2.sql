-- 127_booking_number_format_v2.sql
-- New booking reference number format.
-- Supersedes 037 (generate) and 077 (peek) via CREATE OR REPLACE.
--
-- Old format: {PREFIX}-{YYYY}-{NNNN}     e.g. FWD-2026-0042
-- New format: {PREFIX}{YYYYMM}-{NNN}     e.g. FWD202606-001
--
-- Changes:
--   * Date segment now includes the month (YYYY -> YYYYMM), Manila timezone.
--   * Counter shortened to 3 digits (expands past 999 naturally via lpad min-width).
--   * Prefix renames: Brokerage BRK -> BR, Trucking TRK -> TKG.
--   * Counters reset to 0 so each service type restarts at -001 under the new scheme.
--
-- The counter remains global-per-type and never resets on month rollover —
-- only the cosmetic YYYYMM segment changes ("countings are continuous").

CREATE OR REPLACE FUNCTION generate_booking_number(p_service_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter_key  TEXT;
  v_prefix       TEXT;
  v_yearmonth    TEXT;
  v_next_val     INTEGER;
  v_booking_num  TEXT;
BEGIN
  -- Resolve prefix and counter key from service_type
  CASE p_service_type
    WHEN 'Forwarding'       THEN v_counter_key := 'forwarding_booking_counter';       v_prefix := 'FWD';
    WHEN 'Brokerage'        THEN v_counter_key := 'brokerage_booking_counter';        v_prefix := 'BR';
    WHEN 'Trucking'         THEN v_counter_key := 'trucking_booking_counter';         v_prefix := 'TKG';
    WHEN 'Marine Insurance' THEN v_counter_key := 'marine_insurance_booking_counter'; v_prefix := 'MIP';
    WHEN 'Others'           THEN v_counter_key := 'others_booking_counter';           v_prefix := 'OTH';
    ELSE
      RAISE EXCEPTION 'Unknown service_type: %', p_service_type;
  END CASE;

  v_yearmonth := to_char(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMM');

  -- Atomically increment the counter row (row-level lock prevents race conditions)
  INSERT INTO counters (key, value)
    VALUES (v_counter_key, '1'::jsonb)
  ON CONFLICT (key) DO UPDATE
    SET value      = to_jsonb((counters.value::text::integer) + 1),
        updated_at = now()
  RETURNING (value::text::integer) INTO v_next_val;

  -- Format: FWD202606-001
  v_booking_num := v_prefix || v_yearmonth || '-' || lpad(v_next_val::text, 3, '0');

  RETURN v_booking_num;
END;
$$;

CREATE OR REPLACE FUNCTION peek_next_booking_number(p_service_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter_key TEXT;
  v_prefix      TEXT;
  v_yearmonth   TEXT;
  v_current_val INTEGER;
BEGIN
  CASE p_service_type
    WHEN 'Forwarding'       THEN v_counter_key := 'forwarding_booking_counter';       v_prefix := 'FWD';
    WHEN 'Brokerage'        THEN v_counter_key := 'brokerage_booking_counter';        v_prefix := 'BR';
    WHEN 'Trucking'         THEN v_counter_key := 'trucking_booking_counter';         v_prefix := 'TKG';
    WHEN 'Marine Insurance' THEN v_counter_key := 'marine_insurance_booking_counter'; v_prefix := 'MIP';
    WHEN 'Others'           THEN v_counter_key := 'others_booking_counter';           v_prefix := 'OTH';
    ELSE
      RAISE EXCEPTION 'Unknown service_type: %', p_service_type;
  END CASE;

  v_yearmonth := to_char(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMM');

  SELECT COALESCE((value::text::integer), 0) INTO v_current_val
  FROM counters
  WHERE key = v_counter_key;

  IF v_current_val IS NULL THEN
    v_current_val := 0;
  END IF;

  RETURN v_prefix || v_yearmonth || '-' || lpad((v_current_val + 1)::text, 3, '0');
END;
$$;

-- Restart each service type's counter at 001 under the new scheme.
-- Existing bookings keep their old-format numbers (no collision: format differs).
UPDATE counters
  SET value = '0'::jsonb, updated_at = now()
  WHERE key IN (
    'forwarding_booking_counter',
    'brokerage_booking_counter',
    'trucking_booking_counter',
    'marine_insurance_booking_counter',
    'others_booking_counter'
  );

GRANT EXECUTE ON FUNCTION generate_booking_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION peek_next_booking_number(TEXT) TO authenticated;
