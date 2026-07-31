-- Migration 262: booking milestones, captured by a TRIGGER rather than by the app.
--
-- WHY A TRIGGER
--
-- Earlier work assumed activity_log could supply milestone timestamps
-- retroactively. Measured on dev, it cannot:
--
--     entry_number       82 bookings have it,  27 logged  (33%)
--     selectivity_color  56 have it,           22 logged  (39%)
--     date_delivered     80 have it,            0 logged  ( 0%)
--
-- activity_log is written by one edit path. Bulk edits, imports, Edge Functions
-- and any other writer bypass it silently. A KPI sourced from it would be
-- computed from a third of the truth while looking complete — the same class of
-- failure as the RLS bug in 258, and worse because it degrades quietly as new
-- write paths are added.
--
-- A trigger on `bookings` sits below every write path. There is no way to set the
-- field without recording the milestone.
--
-- OCCURRED vs RECORDED
--
--   occurred_at  the real-world date, taken from the value the user entered.
--                Only exists for fields that ARE dates.
--   recorded_at  when it reached the system.
--
-- KPIs reckon on occurred_at and fall back to recorded_at. The gap between them
-- is itself a data-hygiene signal: a declarant who lodges Monday and types it
-- Thursday shows a three-day recording lag.
--
-- Proxy milestones (entry_number, selectivity_color) have no date to read, so
-- they carry recorded_at only and are marked is_proxy. They are honest evidence
-- that something happened, and dishonest evidence of when. The Brokerage KPIs
-- need the explicit date fields to be scored properly.

CREATE TABLE IF NOT EXISTS booking_milestones (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by   TEXT,
  is_proxy      BOOLEAN NOT NULL DEFAULT false,
  source_field  TEXT NOT NULL,
  source_value  TEXT,
  CONSTRAINT booking_milestones_once UNIQUE (booking_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS booking_milestones_booking_idx ON booking_milestones(booking_id);
CREATE INDEX IF NOT EXISTS booking_milestones_key_idx     ON booking_milestones(milestone_key, occurred_at);

ALTER TABLE booking_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking_milestones_all" ON booking_milestones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Which details keys mean which milestone. Data, not code: adding a milestone is
-- an INSERT, and the trigger picks it up on the next write.
CREATE TABLE IF NOT EXISTS booking_milestone_sources (
  source_field  TEXT PRIMARY KEY,
  milestone_key TEXT NOT NULL,
  is_date       BOOLEAN NOT NULL,
  note          TEXT
);

ALTER TABLE booking_milestone_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking_milestone_sources_read" ON booking_milestone_sources
  FOR SELECT TO authenticated USING (true);

INSERT INTO booking_milestone_sources (source_field, milestone_key, is_date, note)
SELECT * FROM (VALUES
  -- Explicit dates. These do not exist on the booking form yet; the trigger is
  -- ready for them so the day they are added, history starts accumulating.
  ('lodgment_date',            'lodgment',          true,  'Brokerage KPI 1 end / KPI 2 start'),
  ('final_docs_complete_date', 'final_docs',        true,  'Brokerage KPI 1 start (later of this and manifest)'),
  ('manifest_date',            'manifest',          true,  'Brokerage KPI 1 start (later of this and final docs)'),
  ('final_assessment_date',    'final_assessment',  true,  'Brokerage KPI 2 end'),
  ('manifest_submitted_at',    'manifest_submitted',true,  'Forwarding KPI 1'),
  ('manifest_cutoff_at',       'manifest_cutoff',   true,  'Forwarding KPI 1 deadline'),
  -- Dates that already exist and are populated.
  ('date_delivered',           'delivered',         true,  'Billing TAT start, Trucking on-time'),
  ('pull_out_date',            'pull_out',          true,  'Trucking on-time pull-out'),
  ('preferred_delivery_date',  'delivery_promised', true,  'Trucking on-time reference'),
  ('empty_return_date',        'empty_returned',    true,  'Detention reference'),
  -- Proxies: presence proves the event, the value is not a date.
  ('entry_number',             'lodgment_proxy',    false, 'Cannot lodge without an entry number'),
  ('selectivity_color',        'assessment_proxy',  false, 'Selectivity is issued at assessment')
) AS v(source_field, milestone_key, is_date, note)
WHERE NOT EXISTS (
  SELECT 1 FROM booking_milestone_sources s WHERE s.source_field = v.source_field
);

-- ─── The trigger ─────────────────────────────────────────────────────────────
--
-- Fires when a tracked key goes from absent/empty to set. First transition wins:
-- a milestone is a thing that happened, not a field that can be edited, so
-- later corrections do not silently move history. The UNIQUE constraint enforces
-- that even if the trigger logic ever regresses.

CREATE OR REPLACE FUNCTION capture_booking_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  src RECORD;
  v_new TEXT;
  v_old TEXT;
  v_occurred TIMESTAMPTZ;
BEGIN
  FOR src IN SELECT * FROM booking_milestone_sources LOOP
    v_new := NULLIF(NEW.details ->> src.source_field, '');
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(OLD.details ->> src.source_field, '') END;

    CONTINUE WHEN v_new IS NULL OR v_old IS NOT NULL;

    v_occurred := NULL;
    IF src.is_date THEN
      -- A bad date must not abort the caller's write. The milestone still lands,
      -- with occurred_at null, and reads fall back to recorded_at.
      BEGIN
        v_occurred := v_new::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_occurred := NULL;
      END;
    END IF;

    INSERT INTO booking_milestones (
      id, booking_id, milestone_key, occurred_at, recorded_at, recorded_by,
      is_proxy, source_field, source_value)
    VALUES (
      'bm-' || NEW.id || '-' || src.milestone_key,
      NEW.id, src.milestone_key, v_occurred, now(),
      COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), NULL),
      NOT src.is_date, src.source_field, left(v_new, 200))
    ON CONFLICT (booking_id, milestone_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_capture_booking_milestones ON bookings;
CREATE TRIGGER trg_capture_booking_milestones
  AFTER INSERT OR UPDATE OF details ON bookings
  FOR EACH ROW EXECUTE FUNCTION capture_booking_milestones();

-- ─── Backfill ────────────────────────────────────────────────────────────────
--
-- Existing bookings already carry these values; the trigger only sees future
-- writes. Backfill what is there, using activity_log's timestamp for recorded_at
-- where one exists and the booking's updated_at where it does not.
--
-- These rows are as good as the underlying data: a date field gives a real
-- occurred_at, a proxy gives only an approximate recorded_at. They are not
-- invented — every row corresponds to a value that is actually present.

INSERT INTO booking_milestones (
  id, booking_id, milestone_key, occurred_at, recorded_at, is_proxy, source_field, source_value)
SELECT
  'bm-' || b.id || '-' || s.milestone_key,
  b.id,
  s.milestone_key,
  CASE WHEN s.is_date THEN
    (SELECT (b.details ->> s.source_field)::timestamptz
     WHERE (b.details ->> s.source_field) ~ '^\d{4}-\d{2}-\d{2}')
  END,
  COALESCE(
    (SELECT min(a.created_at) FROM activity_log a
      WHERE a.entity_type = 'booking' AND a.entity_id = b.id
        AND a.metadata ->> 'description' = 'Updated ' || s.source_field),
    b.updated_at, b.created_at),
  NOT s.is_date,
  s.source_field,
  left(b.details ->> s.source_field, 200)
FROM bookings b
CROSS JOIN booking_milestone_sources s
WHERE NULLIF(b.details ->> s.source_field, '') IS NOT NULL
ON CONFLICT (booking_id, milestone_key) DO NOTHING;
