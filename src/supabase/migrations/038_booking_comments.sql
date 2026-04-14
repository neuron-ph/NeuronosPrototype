CREATE TABLE IF NOT EXISTS booking_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  department TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_comments_booking_id_idx ON booking_comments(booking_id);
CREATE INDEX IF NOT EXISTS booking_comments_created_at_idx ON booking_comments(created_at);

ALTER TABLE booking_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read comments
CREATE POLICY "booking_comments_select" ON booking_comments
  FOR SELECT TO authenticated USING (true);

-- Users can insert their own comments
CREATE POLICY "booking_comments_insert" ON booking_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "booking_comments_delete" ON booking_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
