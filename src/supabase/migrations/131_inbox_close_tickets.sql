-- 131_inbox_close_tickets.sql
-- Close / dismiss tickets so the Inbox doesn't get dumped.
--
-- Two close behaviours, by ticket type:
--   • FYI (broadcasts)         → per-person DISMISS: clears only the dismisser's
--                                inbox. Tracked via ticket_read_receipts.dismissed_at.
--                                Resurfaces if a newer message arrives.
--   • request / approval       → shared CLOSE: status = 'archived' (already excluded
--                                by the inbox RPCs), affects all participants.
--
-- This migration adds the dismissed_at column, teaches get_inbox_threads /
-- get_unread_count to hide dismissed FYIs, and adds get_closed_threads for the
-- "Closed" view.

-- ─── 1. Per-user dismissal column ───────────────────────────────────────────
ALTER TABLE ticket_read_receipts ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- ─── 2. get_inbox_threads — hide dismissed FYIs (resurface on new reply) ─────
CREATE OR REPLACE FUNCTION get_inbox_threads(
  p_user_id text,
  p_dept    text,
  p_role    text
)
RETURNS TABLE (
  id              uuid,
  subject         text,
  type            text,
  status          text,
  priority        text,
  created_by      text,
  created_at      timestamptz,
  updated_at      timestamptz,
  last_message_at timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  linked_record_type text,
  linked_record_id   text,
  auto_created    boolean
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    t.id, t.subject, t.type, t.status, t.priority, t.created_by,
    t.created_at, t.updated_at, t.last_message_at,
    t.resolved_at, t.resolved_by,
    t.linked_record_type, t.linked_record_id, t.auto_created
  FROM tickets t
  WHERE t.status NOT IN ('draft', 'archived')
    -- per-person dismiss: hide FYIs this user dismissed, unless a newer message arrived
    AND NOT (
      t.type = 'fyi'
      AND EXISTS (
        SELECT 1 FROM ticket_read_receipts rr
        WHERE rr.ticket_id = t.id
          AND rr.user_id = p_user_id
          AND rr.dismissed_at IS NOT NULL
          AND rr.dismissed_at >= t.last_message_at
      )
    )
    AND (
      -- user is a direct to/cc participant
      EXISTS (
        SELECT 1 FROM ticket_participants tp
        WHERE tp.ticket_id = t.id
          AND tp.participant_type = 'user'
          AND tp.participant_user_id = p_user_id
          AND tp.role IN ('to', 'cc')
      )
      -- user is assigned
      OR EXISTS (
        SELECT 1 FROM ticket_assignments ta
        WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
      )
      -- manager/director sees dept-addressed tickets
      OR (
        p_role IN ('manager', 'director')
        AND EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id
            AND tp.participant_type = 'department'
            AND tp.participant_dept = p_dept
        )
      )
      -- sender sees their own ticket when someone else has replied
      OR (
        t.created_by = p_user_id
        AND EXISTS (
          SELECT 1 FROM ticket_messages tm
          WHERE tm.ticket_id = t.id
            AND tm.sender_id != p_user_id
            AND tm.is_system = false
        )
      )
    )
  ORDER BY t.last_message_at DESC;
$$;

-- ─── 3. get_unread_count — same dismissal exclusion ─────────────────────────
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id text, p_dept text, p_role text)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::integer
  FROM (
    SELECT DISTINCT t.id
    FROM tickets t
    WHERE t.status NOT IN ('draft', 'archived')
      AND NOT (
        t.type = 'fyi'
        AND EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id
            AND rr.user_id = p_user_id
            AND rr.dismissed_at IS NOT NULL
            AND rr.dismissed_at >= t.last_message_at
        )
      )
      AND (
        EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id AND tp.participant_type = 'user'
            AND tp.participant_user_id = p_user_id AND tp.role IN ('to', 'cc')
        )
        OR EXISTS (
          SELECT 1 FROM ticket_assignments ta
          WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
        )
        OR (
          p_role IN ('manager', 'director')
          AND EXISTS (
            SELECT 1 FROM ticket_participants tp
            WHERE tp.ticket_id = t.id AND tp.participant_type = 'department'
              AND tp.participant_dept = p_dept
          )
        )
        OR (
          t.created_by = p_user_id
          AND EXISTS (
            SELECT 1 FROM ticket_messages tm
            WHERE tm.ticket_id = t.id
              AND tm.sender_id != p_user_id
              AND tm.is_system = false
          )
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
            AND t.last_message_at > rr.last_read_at
        )
      )
  ) unread;
$$;

-- ─── 4. get_closed_threads — the "Closed" view ──────────────────────────────
-- Same visibility rules as the inbox, but returns what was closed:
--   • request/approval tickets the user can see that are status = 'archived'
--   • FYIs the user dismissed (dismissed_at >= last_message_at)
CREATE OR REPLACE FUNCTION get_closed_threads(
  p_user_id text,
  p_dept    text,
  p_role    text
)
RETURNS TABLE (
  id              uuid,
  subject         text,
  type            text,
  status          text,
  priority        text,
  created_by      text,
  created_at      timestamptz,
  updated_at      timestamptz,
  last_message_at timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  linked_record_type text,
  linked_record_id   text,
  auto_created    boolean
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    t.id, t.subject, t.type, t.status, t.priority, t.created_by,
    t.created_at, t.updated_at, t.last_message_at,
    t.resolved_at, t.resolved_by,
    t.linked_record_type, t.linked_record_id, t.auto_created
  FROM tickets t
  WHERE t.status != 'draft'
    -- closed by either mechanism
    AND (
      t.status = 'archived'
      OR (
        t.type = 'fyi'
        AND EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id
            AND rr.user_id = p_user_id
            AND rr.dismissed_at IS NOT NULL
            AND rr.dismissed_at >= t.last_message_at
        )
      )
    )
    -- same visibility rules as the inbox
    AND (
      EXISTS (
        SELECT 1 FROM ticket_participants tp
        WHERE tp.ticket_id = t.id
          AND tp.participant_type = 'user'
          AND tp.participant_user_id = p_user_id
          AND tp.role IN ('to', 'cc')
      )
      OR EXISTS (
        SELECT 1 FROM ticket_assignments ta
        WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
      )
      OR (
        p_role IN ('manager', 'director')
        AND EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id
            AND tp.participant_type = 'department'
            AND tp.participant_dept = p_dept
        )
      )
      OR (
        t.created_by = p_user_id
        AND EXISTS (
          SELECT 1 FROM ticket_messages tm
          WHERE tm.ticket_id = t.id
            AND tm.sender_id != p_user_id
            AND tm.is_system = false
        )
      )
    )
  ORDER BY t.last_message_at DESC;
$$;
