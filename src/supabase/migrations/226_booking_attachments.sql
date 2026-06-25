-- Booking attachments — same shape as customer_attachments / contact_attachments (092).
--
-- RBAC note (migration 217 doctrine): attachments are a CHILD of the booking and
-- inherit the booking's visibility. The module grant (ops_<service>_attachments_tab)
-- is a FRONTEND tab/action gate only — it is deliberately kept OUT of the SELECT
-- policy so it is never ANDed into a row read. Reaching this row already requires
-- being able to open the parent booking. The attachments bucket already exists (092).

CREATE TABLE IF NOT EXISTS booking_attachments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  file_url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_attachments_booking_id_idx ON booking_attachments(booking_id);
CREATE INDEX IF NOT EXISTS booking_attachments_created_at_idx ON booking_attachments(created_at);

ALTER TABLE booking_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_attachments_all" ON booking_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
