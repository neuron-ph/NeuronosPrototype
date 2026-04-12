-- 029_inbox_sender_replies.sql
-- Fix: replies to tickets you sent now appear in your Inbox.
-- Previously, only to/cc/assigned/dept-addressed tickets showed in inbox.
-- Now, tickets you created also appear when someone else has replied.

-- ─── Updated get_inbox_threads ──────────────────────────────────────────────
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
    AND (
      -- Original: user is a direct to/cc participant
      EXISTS (
        SELECT 1 FROM ticket_participants tp
        WHERE tp.ticket_id = t.id
          AND tp.participant_type = 'user'
          AND tp.participant_user_id = p_user_id
          AND tp.role IN ('to', 'cc')
      )
      -- Original: user is assigned
      OR EXISTS (
        SELECT 1 FROM ticket_assignments ta
        WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
      )
      -- Original: manager/director sees dept-addressed tickets
      OR (
        p_role IN ('manager', 'director')
        AND EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id
            AND tp.participant_type = 'department'
            AND tp.participant_dept = p_dept
        )
      )
      -- NEW: sender sees their own ticket when someone else has replied
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

-- ─── Updated get_unread_count ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id text, p_dept text, p_role text)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::integer
  FROM (
    SELECT DISTINCT t.id
    FROM tickets t
    WHERE t.status NOT IN ('draft', 'archived')
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
        -- NEW: sender's own ticket with replies from others
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
