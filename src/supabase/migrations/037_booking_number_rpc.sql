-- 037_booking_number_rpc.sql
-- Atomic, concurrency-safe RPC for generating per-type booking numbers.
-- Leverages the existing `counters` table (already seeded).
-- Format: {PREFIX}-{YYYY}-{NNNN}  e.g. FWD-2026-0004
-- Called from the React frontend via supabase.rpc('generate_booking_number', { p_service_type: '...' })

CREATE OR REPLACE FUNCTION generate_booking_number(p_service_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter_key  TEXT;
  v_prefix       TEXT;
  v_year         TEXT;
  v_next_val     INTEGER;
  v_booking_num  TEXT;
BEGIN
  -- Resolve prefix and counter key from service_type
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

  -- Atomically increment the counter row (row-level lock prevents race conditions)
  INSERT INTO counters (key, value)
    VALUES (v_counter_key, '1'::jsonb)
  ON CONFLICT (key) DO UPDATE
    SET value      = to_jsonb((counters.value::text::integer) + 1),
        updated_at = now()
  RETURNING (value::text::integer) INTO v_next_val;

  -- Format: FWD-2026-0001
  v_booking_num := v_prefix || '-' || v_year || '-' || lpad(v_next_val::text, 4, '0');

  RETURN v_booking_num;
END;
$$;

-- Grant execution to authenticated users only
GRANT EXECUTE ON FUNCTION generate_booking_number(TEXT) TO authenticated;

-- Ensure counter rows exist for all five service types
-- (seed.sql initialises these, but this is defensive for fresh installs)
INSERT INTO counters (key, value) VALUES
  ('forwarding_booking_counter',       '0'::jsonb),
  ('brokerage_booking_counter',        '0'::jsonb),
  ('trucking_booking_counter',         '0'::jsonb),
  ('marine_insurance_booking_counter', '0'::jsonb),
  ('others_booking_counter',           '0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Unique index on booking_number (NULLs excluded — existing NULL rows are safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_booking_number_unique
  ON bookings (booking_number)
  WHERE booking_number IS NOT NULL;

-- Index for fast lookup by booking_number
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number
  ON bookings (booking_number);
