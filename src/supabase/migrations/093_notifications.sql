-- 093_notifications.sql
-- Cross-module red-dot notification system.
--
-- Three tables:
--   notification_events      — append-only fact log (one row per thing that happened)
--   notification_recipients  — fan-out delivery rows (one per user × event)
--   notification_counters    — denormalized per-(user, module, sub_section) unread counts
--
-- Read path: sidebar reads notification_counters only (one indexed lookup).
-- Write path: app calls record_notification_event(...), which inserts the event
-- and fans out recipients. Triggers maintain counters.
--
-- Realtime: clients subscribe to notification_counters and notification_recipients
-- filtered by user_id = me.

-- ─── 1. events ──────────────────────────────────────────────────────────────
CREATE TABLE notification_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_user_id   text REFERENCES users(id),  -- nullable: system events (overdue, etc.)
  module          text NOT NULL CHECK (module IN (
                    'bd', 'pricing', 'operations', 'accounting', 'hr', 'executive'
                  )),
  sub_section     text,            -- optional, e.g. 'billings', 'evouchers' under accounting
  entity_type     text NOT NULL,   -- 'booking' | 'billing' | 'evoucher' | 'project' | 'inquiry' | 'task' | 'mention' | …
  entity_id       text NOT NULL,
  event_kind      text NOT NULL,   -- 'assigned' | 'handoff' | 'status_changed' | 'mention' | 'commented' | 'overdue' | 'submitted' | 'approved' | 'rejected' | 'posted' | …
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb  -- denormalized snippet for the UI
);

CREATE INDEX idx_notif_events_entity   ON notification_events (entity_type, entity_id);
CREATE INDEX idx_notif_events_created  ON notification_events (created_at DESC);
CREATE INDEX idx_notif_events_module   ON notification_events (module, created_at DESC);

-- ─── 2. recipients (fan-out) ────────────────────────────────────────────────
CREATE TABLE notification_recipients (
  event_id        uuid NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at    timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz,
  PRIMARY KEY (event_id, user_id)
);

-- The hot index: "give me my unread, newest first"
CREATE INDEX idx_notif_recipients_unread
  ON notification_recipients (user_id, delivered_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notif_recipients_user_all
  ON notification_recipients (user_id, delivered_at DESC);

-- ─── 3. counters ────────────────────────────────────────────────────────────
CREATE TABLE notification_counters (
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module          text NOT NULL,
  sub_section     text NOT NULL DEFAULT '',  -- '' = module-level rollup
  unread_count    integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module, sub_section)
);

CREATE INDEX idx_notif_counters_user ON notification_counters (user_id);

-- ─── 4. counter triggers ────────────────────────────────────────────────────
-- On recipient insert: increment counter for (module, '') and (module, sub_section)
-- On recipient read:   decrement both
-- On recipient delete: decrement both if it was unread

CREATE OR REPLACE FUNCTION _bump_notif_counter(
  p_user_id text, p_module text, p_sub_section text, p_delta int
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_counters (user_id, module, sub_section, unread_count, updated_at)
  VALUES (p_user_id, p_module, COALESCE(p_sub_section, ''), GREATEST(p_delta, 0), now())
  ON CONFLICT (user_id, module, sub_section) DO UPDATE
    SET unread_count = GREATEST(notification_counters.unread_count + p_delta, 0),
        updated_at   = now();
END;
$$;

CREATE OR REPLACE FUNCTION _on_recipient_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_module      text;
  v_sub_section text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT module, sub_section INTO v_module, v_sub_section
      FROM notification_events WHERE id = NEW.event_id;
    IF NEW.read_at IS NULL THEN
      PERFORM _bump_notif_counter(NEW.user_id, v_module, '', 1);
      IF v_sub_section IS NOT NULL THEN
        PERFORM _bump_notif_counter(NEW.user_id, v_module, v_sub_section, 1);
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- transition unread -> read = decrement; read -> unread = increment
    IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
      SELECT module, sub_section INTO v_module, v_sub_section
        FROM notification_events WHERE id = NEW.event_id;
      PERFORM _bump_notif_counter(NEW.user_id, v_module, '', -1);
      IF v_sub_section IS NOT NULL THEN
        PERFORM _bump_notif_counter(NEW.user_id, v_module, v_sub_section, -1);
      END IF;
    ELSIF OLD.read_at IS NOT NULL AND NEW.read_at IS NULL THEN
      SELECT module, sub_section INTO v_module, v_sub_section
        FROM notification_events WHERE id = NEW.event_id;
      PERFORM _bump_notif_counter(NEW.user_id, v_module, '', 1);
      IF v_sub_section IS NOT NULL THEN
        PERFORM _bump_notif_counter(NEW.user_id, v_module, v_sub_section, 1);
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.read_at IS NULL THEN
      SELECT module, sub_section INTO v_module, v_sub_section
        FROM notification_events WHERE id = OLD.event_id;
      PERFORM _bump_notif_counter(OLD.user_id, v_module, '', -1);
      IF v_sub_section IS NOT NULL THEN
        PERFORM _bump_notif_counter(OLD.user_id, v_module, v_sub_section, -1);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notif_recipients_change
AFTER INSERT OR UPDATE OF read_at OR DELETE ON notification_recipients
FOR EACH ROW EXECUTE FUNCTION _on_recipient_change();

-- ─── 5. record + fan-out ────────────────────────────────────────────────────
-- App calls this. Audience is the union of explicit recipient_ids passed in
-- by the caller (resolved at the write site, where assignee/team/watchers are
-- already known). Skips actor_user_id automatically.

CREATE OR REPLACE FUNCTION record_notification_event(
  p_actor_user_id  text,
  p_module         text,
  p_sub_section    text,
  p_entity_type    text,
  p_entity_id      text,
  p_event_kind     text,
  p_summary        jsonb,
  p_recipient_ids  text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_recipient text;
BEGIN
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN
    RETURN NULL;  -- no audience, skip
  END IF;

  INSERT INTO notification_events (
    actor_user_id, module, sub_section, entity_type, entity_id, event_kind, summary
  ) VALUES (
    p_actor_user_id, p_module, p_sub_section, p_entity_type, p_entity_id, p_event_kind, COALESCE(p_summary, '{}'::jsonb)
  ) RETURNING id INTO v_event_id;

  -- fan out, deduped, excluding actor
  INSERT INTO notification_recipients (event_id, user_id)
  SELECT v_event_id, uid
    FROM unnest(p_recipient_ids) AS uid
   WHERE uid IS NOT NULL
     AND uid <> COALESCE(p_actor_user_id, '')
   GROUP BY uid;

  RETURN v_event_id;
END;
$$;

-- ─── 6. mark-as-read helpers ────────────────────────────────────────────────
-- Mark all events for a single entity as read for a user (called when they open it)
CREATE OR REPLACE FUNCTION mark_entity_read(
  p_user_id text, p_entity_type text, p_entity_id text
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  UPDATE notification_recipients r
     SET read_at = now()
    FROM notification_events e
   WHERE r.event_id = e.id
     AND r.user_id  = p_user_id
     AND r.read_at  IS NULL
     AND e.entity_type = p_entity_type
     AND e.entity_id   = p_entity_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Mark all unread for a user × module (or module+sub_section) as read
CREATE OR REPLACE FUNCTION mark_module_read(
  p_user_id text, p_module text, p_sub_section text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  UPDATE notification_recipients r
     SET read_at = now()
    FROM notification_events e
   WHERE r.event_id = e.id
     AND r.user_id  = p_user_id
     AND r.read_at  IS NULL
     AND e.module   = p_module
     AND (p_sub_section IS NULL OR e.sub_section = p_sub_section);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─── 7. UI query helpers ────────────────────────────────────────────────────
-- One-call sidebar feed: all counters for a user
CREATE OR REPLACE FUNCTION get_my_notification_counters(p_user_id text)
RETURNS TABLE (module text, sub_section text, unread_count integer)
LANGUAGE sql STABLE AS $$
  SELECT module, sub_section, unread_count
    FROM notification_counters
   WHERE user_id = p_user_id
     AND unread_count > 0;
$$;

-- "What's new" feed
CREATE OR REPLACE FUNCTION get_my_notifications(
  p_user_id text, p_limit int DEFAULT 50, p_unread_only bool DEFAULT false
) RETURNS TABLE (
  event_id     uuid,
  delivered_at timestamptz,
  read_at      timestamptz,
  actor_user_id text,
  module        text,
  sub_section   text,
  entity_type   text,
  entity_id     text,
  event_kind    text,
  summary       jsonb
) LANGUAGE sql STABLE AS $$
  SELECT e.id, r.delivered_at, r.read_at,
         e.actor_user_id, e.module, e.sub_section,
         e.entity_type, e.entity_id, e.event_kind, e.summary
    FROM notification_recipients r
    JOIN notification_events e ON e.id = r.event_id
   WHERE r.user_id = p_user_id
     AND (NOT p_unread_only OR r.read_at IS NULL)
   ORDER BY r.delivered_at DESC
   LIMIT p_limit;
$$;

-- Per-entity unread flag for list-row dots (returns set of entity_ids that are unread for the user)
CREATE OR REPLACE FUNCTION get_my_unread_entity_ids(
  p_user_id text, p_entity_type text, p_entity_ids text[]
) RETURNS TABLE (entity_id text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT e.entity_id
    FROM notification_recipients r
    JOIN notification_events e ON e.id = r.event_id
   WHERE r.user_id = p_user_id
     AND r.read_at IS NULL
     AND e.entity_type = p_entity_type
     AND e.entity_id   = ANY(p_entity_ids);
$$;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE notification_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_counters   ENABLE ROW LEVEL SECURITY;

-- Recipients: a user sees only their own rows
CREATE POLICY notif_recipients_self_select ON notification_recipients
  FOR SELECT USING (user_id = public.get_my_profile_id());

CREATE POLICY notif_recipients_self_update ON notification_recipients
  FOR UPDATE USING (user_id = public.get_my_profile_id());

-- Events: visible if the user has a recipient row for it
CREATE POLICY notif_events_via_recipient ON notification_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notification_recipients r
       WHERE r.event_id = notification_events.id
         AND r.user_id  = public.get_my_profile_id()
    )
  );

-- Counters: a user sees only their own
CREATE POLICY notif_counters_self ON notification_counters
  FOR SELECT USING (user_id = public.get_my_profile_id());

-- record_notification_event runs SECURITY DEFINER, so app code calls it via RPC
-- without needing INSERT policies on the underlying tables.

-- ─── 9. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION record_notification_event(text, text, text, text, text, text, jsonb, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_entity_read(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_module_read(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_notification_counters(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_notifications(text, int, bool) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_unread_entity_ids(text, text, text[]) TO authenticated;

-- ─── 10. Realtime publication ───────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_recipients;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_counters;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
