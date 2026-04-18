import { useState } from "react";
import { Edit, Inbox, Send, FileText, Layers, Search, X } from "lucide-react";
import type { InboxTab, ThreadSummary } from "../../hooks/useInbox";
import { ThreadListItem } from "./ThreadListItem";
import { usePermission } from "../../context/PermissionProvider";

interface ThreadListPanelProps {
  threads: ThreadSummary[];
  isLoading: boolean;
  activeTab: InboxTab;
  draftCount: number;
  unreadCount: number;
  queueCount: number;
  isManager: boolean;
  selectedId: string | null;
  onTabChange: (tab: InboxTab) => void;
  onSelectThread: (id: string) => void;
  onCompose: () => void;
}

function ThreadListSkeleton() {
  return (
    <div className="flex flex-col">
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid var(--theme-border-default)" }}>
          <div className="flex items-start gap-2.5">
            <div style={{ width: 8, flexShrink: 0 }} />
            <div className="flex-1 space-y-2">
              <div className="animate-pulse" style={{ height: 13, borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", width: `${70 + (i % 3) * 10}%` }} />
              <div className="animate-pulse" style={{ height: 11, borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", width: "50%" }} />
              <div className="animate-pulse" style={{ height: 11, borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", width: "80%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab, onCompose }: { tab: InboxTab; onCompose: () => void }) {
  const messages: Record<InboxTab, string> = {
    inbox: "Your inbox is empty",
    queue: "No pending requests in the queue",
    sent: "No sent tickets yet",
    drafts: "No drafts saved",
  };
  return (
    <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 32, minHeight: 240 }}>
      <Inbox size={32} style={{ color: "var(--theme-border-default)", marginBottom: 12 }} />
      <p style={{ fontSize: 13, color: "var(--theme-text-muted)", marginBottom: 8 }}>{messages[tab]}</p>
      {tab === "inbox" && (
        <button
          onClick={onCompose}
          style={{ fontSize: 12, color: "var(--theme-action-primary-bg)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Send your first ticket
        </button>
      )}
    </div>
  );
}

export function ThreadListPanel({
  threads,
  isLoading,
  activeTab,
  draftCount,
  unreadCount,
  queueCount,
  isManager,
  selectedId,
  onTabChange,
  onSelectThread,
  onCompose,
}: ThreadListPanelProps) {
  const { can } = usePermission();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = searchQuery.trim()
    ? threads.filter((t) => {
        const q = searchQuery.toLowerCase();
        const senderName =
          t.participants?.find((p) => p.role === "sender")?.user_name ?? "";
        return (
          t.subject.toLowerCase().includes(q) ||
          senderName.toLowerCase().includes(q)
        );
      })
    : threads;

  const tabs: { key: InboxTab; label: string; icon: React.ReactNode; count?: number }[] = [
    ...(can("inbox_inbox_tab", "view") ? [{ key: "inbox" as InboxTab, label: "Inbox", icon: <Inbox size={13} />, count: unreadCount || undefined }] : []),
    ...(isManager && can("inbox_queue_tab", "view") ? [{ key: "queue" as InboxTab, label: "Queue", icon: <Layers size={13} />, count: queueCount || undefined }] : []),
    ...(can("inbox_sent_tab", "view") ? [{ key: "sent" as InboxTab, label: "Sent", icon: <Send size={13} /> }] : []),
    ...(can("inbox_drafts_tab", "view") ? [{ key: "drafts" as InboxTab, label: "Drafts", icon: <FileText size={13} />, count: draftCount || undefined }] : []),
  ];

  return (
    <div
      className="ticketing-ui flex flex-col h-full"
      style={{ width: 320, flexShrink: 0, borderRight: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      {/* Header */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid var(--theme-border-default)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--theme-text-primary)" }}>Tickets</h2>
          <button
            onClick={onCompose}
            className="flex items-center gap-1.5"
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-surface)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--neuron-brand-green)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
            title="Compose new ticket (C)"
          >
            <Edit size={12} />
            Compose
          </button>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search
            size={12}
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--theme-text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets…"
            style={{
              width: "100%",
              padding: "6px 28px 6px 28px",
              borderRadius: 6,
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-page)",
              fontSize: 12,
              color: "var(--theme-text-primary)",
              outline: "none",
              fontFamily: "inherit",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: 7,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--theme-text-muted)",
                display: "flex",
                padding: 0,
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-end gap-0" role="tablist">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tab.key)}
                className="flex items-center gap-1"
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  borderBottom: isActive ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  marginBottom: -1,
                  whiteSpace: "nowrap",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: 10,
                    backgroundColor: isActive ? "var(--neuron-state-selected)" : "var(--theme-bg-page)",
                    color: isActive ? "var(--neuron-brand-green)" : "var(--theme-text-muted)",
                    marginLeft: 2,
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        {isLoading ? (
          <ThreadListSkeleton />
        ) : filteredThreads.length === 0 ? (
          <EmptyState tab={activeTab} onCompose={onCompose} />
        ) : (
          filteredThreads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isSelected={selectedId === thread.id}
              onClick={() => onSelectThread(thread.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
