CREATE TABLE IF NOT EXISTS booking_chronological_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name   TEXT NOT NULL,
  department  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  event_at    TIMESTAMPTZ NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_chrono_logs_booking_id_idx ON booking_chronological_logs(booking_id);
CREATE INDEX IF NOT EXISTS booking_chrono_logs_event_at_idx   ON booking_chronological_logs(event_at);

ALTER TABLE booking_chronological_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read chronological log entries
CREATE POLICY "booking_chrono_logs_select" ON booking_chronological_logs
  FOR SELECT TO authenticated USING (true);

-- Users can insert their own entries
CREATE POLICY "booking_chrono_logs_insert" ON booking_chronological_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can delete their own entries (delete-button visibility is RBAC-gated client-side)
CREATE POLICY "booking_chrono_logs_delete" ON booking_chronological_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
