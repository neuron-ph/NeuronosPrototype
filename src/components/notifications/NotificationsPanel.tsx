import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { SidePanel } from "../common/SidePanel";
import { useNotifications, type NotifFeedItem } from "../../hooks/useNotifications";
import { useUser } from "../../hooks/useUser";
import { markEntityRead } from "../../utils/notifications";

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Resolves a clickable route for a feed item. Returns null if there's no
 * suitable destination — the item still renders, just non-navigable.
 */
function routeFor(item: NotifFeedItem): string | null {
  switch (item.entity_type) {
    case "booking":     return `/operations/${item.entity_id}`;
    case "evoucher":    return `/accounting/evouchers`;
    case "billing":     return `/accounting/billings`;
    case "invoice":     return `/accounting/invoices`;
    case "collection":  return `/accounting/collections`;
    case "project":     return `/projects/${item.entity_id}`;
    case "contract":    return `/contracts/${item.entity_id}`;
    case "quotation":   return `/pricing/quotations/${item.entity_id}`;
    case "inquiry":     return `/bd/inquiries/${item.entity_id}`;
    case "customer":    return `/bd/customers`;
    case "task":        return `/bd/tasks`;
    case "leave_request":   return `/hr`;
    case "budget_request":  return `/bd/budget-requests`;
    default:                return null;
  }
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const { user } = useUser();
  const navigate = useNavigate();
  const { feed, refetchFeed, feedLoading, total, markModuleAsRead } = useNotifications();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Refetch feed when panel opens
  useEffect(() => {
    if (isOpen) void refetchFeed();
  }, [isOpen, refetchFeed]);

  const visibleItems = useMemo(() => {
    return showUnreadOnly ? feed.filter((i) => !i.read_at) : feed;
  }, [feed, showUnreadOnly]);

  const handleClick = async (item: NotifFeedItem) => {
    if (user?.id) {
      await markEntityRead(user.id, item.entity_type, item.entity_id);
      void refetchFeed();
    }
    const dest = routeFor(item);
    if (dest) {
      navigate(dest);
      onClose();
    }
  };

  const handleMarkAll = async () => {
    if (!user?.id) return;
    // Mark all visible items' modules as read. For full coverage, hit each module the feed touches.
    const modules = Array.from(new Set(visibleItems.map((i) => i.module)));
    for (const m of modules) {
      await markModuleAsRead(m);
    }
    void refetchFeed();
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={
        <div className="flex items-center gap-2">
          <Bell size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <span>Notifications</span>
          {total > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 8,
                backgroundColor: "var(--theme-status-danger-bg)",
                color: "var(--theme-status-danger-fg)",
              }}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--neuron-ui-border)" }}>
          <div className="flex gap-1">
            <button
              onClick={() => setShowUnreadOnly(false)}
              className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
              style={{
                backgroundColor: !showUnreadOnly ? "var(--neuron-state-selected)" : "transparent",
                color: !showUnreadOnly ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: !showUnreadOnly ? 500 : 400,
              }}
            >
              All
            </button>
            <button
              onClick={() => setShowUnreadOnly(true)}
              className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
              style={{
                backgroundColor: showUnreadOnly ? "var(--neuron-state-selected)" : "transparent",
                color: showUnreadOnly ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)",
                fontWeight: showUnreadOnly ? 500 : 400,
              }}
            >
              Unread
            </button>
          </div>
          <button
            onClick={handleMarkAll}
            disabled={total === 0}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] transition-colors disabled:opacity-40"
            style={{ color: "var(--neuron-ink-secondary)" }}
            title="Mark all as read"
          >
            <CheckCheck size={14} />
            <span>Mark all read</span>
          </button>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto">
          {feedLoading && visibleItems.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              Loading…
            </div>
          )}
          {!feedLoading && visibleItems.length === 0 && (
            <div className="px-4 py-12 text-center text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              {showUnreadOnly ? "No unread notifications." : "Nothing here yet."}
            </div>
          )}
          {visibleItems.map((item) => {
            const isUnread = !item.read_at;
            const label = item.summary?.label || `${item.entity_type} ${item.event_kind}`;
            return (
              <button
                key={item.event_id}
                onClick={() => handleClick(item)}
                className="w-full flex items-start gap-3 px-4 py-3 border-b text-left transition-colors"
                style={{
                  borderColor: "var(--neuron-ui-border)",
                  backgroundColor: isUnread ? "var(--neuron-state-selected)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isUnread
                    ? "var(--neuron-state-selected)"
                    : "transparent";
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    minWidth: 8,
                    marginTop: 6,
                    borderRadius: 4,
                    backgroundColor: isUnread ? "var(--theme-status-danger-fg)" : "transparent",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px]"
                    style={{
                      color: "var(--neuron-ink-primary)",
                      fontWeight: isUnread ? 500 : 400,
                    }}
                  >
                    {String(label)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                    <span style={{ textTransform: "capitalize" }}>{item.module}</span>
                    {item.sub_section && (
                      <>
                        <span>·</span>
                        <span>{item.sub_section.replace(/-/g, " ")}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{relativeTime(item.delivered_at)}</span>
                  </div>
                </div>
                {!isUnread && <Check size={14} style={{ color: "var(--neuron-ink-muted)", marginTop: 4 }} />}
              </button>
            );
          })}
        </div>
      </div>
    </SidePanel>
  );
}
