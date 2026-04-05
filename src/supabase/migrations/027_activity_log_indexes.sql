-- Migration 027: Activity log performance indexes + Realtime
-- Apply in Supabase SQL Editor

-- Performance indexes for the Activity Monitor page queries
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
  ON activity_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity_type
  ON activity_log (entity_type);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_department
  ON activity_log (user_department);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity_id
  ON activity_log (entity_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_composite
  ON activity_log (created_at DESC, entity_type);

-- Enable Supabase Realtime on activity_log so the Activity Monitor
-- receives live inserts without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
