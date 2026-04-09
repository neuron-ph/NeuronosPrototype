import { Paperclip } from "lucide-react";
import type { ThreadSummary } from "../../hooks/useInbox";
import { TICKET_ENTITY_TONES, TICKET_TYPE_TONES, ticketBadgeStyle } from "./ticketingTheme";

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: "var(--neuron-dept-bd-bg)",       text: "var(--neuron-dept-bd-text)" },
  { bg: "var(--neuron-dept-ops-bg)",      text: "var(--neuron-dept-ops-text)" },
  { bg: "var(--neuron-semantic-info-bg)", text: "var(--neuron-semantic-info)" },
  { bg: "var(--theme-status-success-bg)", text: "var(--theme-status-success-fg)" },
  { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" },
];

function avatarTone(name: string) {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function getSender(thread: ThreadSummary): { name: string; avatar_url?: string | null } {
  const sender = (thread.participants || []).find((p) => p.role === "sender");
  return { name: sender?.user_name || "Unknown", avatar_url: sender?.user_avatar_url };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-PH", { weekday: "short" });
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

const TYPE_LABEL: Record<string, string> = {
  fyi: "FYI",
  request: "Request",
  approval: "Approval",
};

const STATUS_LABEL: Record<string, string> = {
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  done: "Done",
  returned: "Returned",
  draft: "Draft",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ThreadListItemProps {
  thread: ThreadSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function ThreadListItem({ thread, isSelected, onClick }: ThreadListItemProps) {
  const sender = getSender(thread);
  const senderName = sender.name;
  const tone = avatarTone(senderName);
  const typeTone = TICKET_TYPE_TONES[thread.type] ?? TICKET_TYPE_TONES.fyi;
  const isUrgent = thread.priority === "urgent";
  const nonDefaultStatus = STATUS_LABEL[thread.status];

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
      style={{
        borderLeft: isSelected
          ? "2px solid var(--theme-action-primary-bg)"
          : "2px solid transparent",
        backgroundColor: isSelected ? "var(--theme-bg-surface-tint)" : "transparent",
        padding: "12px 16px 12px 14px",
        borderBottom: "1px solid var(--theme-border-default)",
        display: "block",
        transition: "background-color 100ms ease",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
      }}
      aria-label={`Ticket: ${thread.subject}`}
      aria-selected={isSelected}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>

        {/* ── Avatar with unread badge ─────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0, marginTop: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: sender.avatar_url ? "transparent" : tone.bg,
              color: tone.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.3px",
              border: "1.5px solid var(--theme-border-default)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {sender.avatar_url ? (
              <img
                src={sender.avatar_url}
                alt={senderName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              getInitials(senderName)
            )}
          </div>
          {thread.is_unread && (
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 9,
                height: 9,
                borderRadius: "50%",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "1.5px solid var(--theme-bg-surface)",
              }}
            />
          )}
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Row 1: Sender + type tag + timestamp */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: "var(--theme-text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                flex: "0 1 auto",
              }}
            >
              {senderName}
            </span>

            {/* Type tag */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: typeTone.text,
                whiteSpace: "nowrap",
                flexShrink: 0,
                opacity: 0.75,
              }}
            >
              · {TYPE_LABEL[thread.type] ?? thread.type}
            </span>

            {/* Urgent marker */}
            {isUrgent && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--theme-status-danger-fg)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                · Urgent
              </span>
            )}

            {/* Spacer */}
            <span style={{ flex: 1 }} />

            {/* Attachment count */}
            {(thread.attachment_count || 0) > 0 && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: 10,
                  color: "var(--theme-text-muted)",
                  flexShrink: 0,
                }}
              >
                <Paperclip size={10} />
                {thread.attachment_count}
              </span>
            )}

            {/* Timestamp */}
            <span
              style={{
                fontSize: 11,
                color: thread.is_unread ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                fontWeight: thread.is_unread ? 600 : 400,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {formatRelativeTime(thread.last_message_at)}
            </span>
          </div>

          {/* Row 2: Subject — dominant visual anchor */}
          <p
            style={{
              fontSize: 14,
              fontWeight: thread.is_unread ? 700 : 600,
              color: "var(--theme-text-primary)",
              margin: 0,
              marginBottom: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {thread.subject}
          </p>

          {/* Row 3: Preview (with optional linked-record prefix) */}
          <p
            style={{
              fontSize: 11,
              color: "var(--theme-text-muted)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.4,
            }}
          >
            {thread.linked_record_type && (
              <span
                style={{
                  ...ticketBadgeStyle(
                    TICKET_ENTITY_TONES[thread.linked_record_type] ?? TICKET_ENTITY_TONES.quotation
                  ),
                  display: "inline-flex",
                  alignItems: "center",
                  marginRight: 4,
                  verticalAlign: "middle",
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                {thread.linked_record_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            )}
            {thread.last_message_preview || (nonDefaultStatus ?? "")}
          </p>

          {/* Non-default status chip — only when there's no preview to show it */}
          {nonDefaultStatus && !thread.last_message_preview && (
            <p style={{ margin: 0, marginTop: 2, fontSize: 10, color: "var(--theme-text-muted)", fontStyle: "italic" }}>
              {nonDefaultStatus}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
