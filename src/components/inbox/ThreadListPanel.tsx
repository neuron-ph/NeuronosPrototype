import { useState, useEffect } from "react";
import { Edit, Inbox, Send, FileText, Layers, Search, X, CheckSquare, List } from "lucide-react";
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
  closedView: boolean;
  onToggleClosedView: (v: boolean) => void;
  onCloseTicket: (thread: ThreadSummary) => void;
  onReopenTicket: (thread: ThreadSummary) => void;
  onBulkClose: (threads: ThreadSummary[]) => Promise<void> | void;
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

function EmptyState({ tab, onCompose }: { tab: InboxTab; onCompose?: () => void }) {
  const messages: Record<InboxTab, string> = {
    all: "No tickets yet",
    inbox: "Your inbox is empty",
    queue: "No pending requests in the queue",
    sent: "No sent tickets yet",
    drafts: "No drafts saved",
  };
  return (
    <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: 32, minHeight: 240 }}>
      <Inbox size={32} style={{ color: "var(--theme-border-default)", marginBottom: 12 }} />
      <p style={{ fontSize: 13, color: "var(--theme-text-muted)", marginBottom: 8 }}>{messages[tab]}</p>
      {(tab === "all" || tab === "inbox") && onCompose && (
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
  isManager: _isManager,
  selectedId,
  onTabChange,
  onSelectThread,
  onCompose,
  closedView,
  onToggleClosedView,
  onCloseTicket,
  onReopenTicket,
  onBulkClose,
}: ThreadListPanelProps) {
  const { can } = usePermission();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // The Open/Closed filter and bulk-select only apply to inbox & queue.
  // NEU-020 2.7 (DD-5): closing/archiving a ticket is a delete-class power
  // (take it down) — inbox:delete; composing writes tickets — inbox:create.
  const supportsClose = (activeTab === "all" || activeTab === "inbox" || activeTab === "queue") && can("inbox", "delete");
  const canCompose = can("inbox", "create");

  // Reset selection when the view changes underneath it
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [activeTab, closedView]);

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

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedThreads = filteredThreads.filter((t) => selectedIds.has(t.id));
  const readThreads = filteredThreads.filter((t) => !t.is_unread);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkClose = async (list: ThreadSummary[]) => {
    if (list.length === 0) return;
    await onBulkClose(list);
    exitSelectMode();
  };

  const tabs: { key: InboxTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "all" as InboxTab, label: "All", icon: <List size={13} />, count: unreadCount || undefined },
    ...(can("inbox_inbox_tab", "view") ? [{ key: "inbox" as InboxTab, label: "Inbox", icon: <Inbox size={13} />, count: unreadCount || undefined }] : []),
    ...(can("inbox_queue_tab", "view") ? [{ key: "queue" as InboxTab, label: "Queue", icon: <Layers size={13} />, count: queueCount || undefined }] : []),
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
          <div className="flex items-center gap-1.5">
          {supportsClose && !closedView && filteredThreads.length > 0 && (
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className="flex items-center gap-1.5"
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${selectMode ? "var(--neuron-ui-active-border)" : "var(--theme-border-default)"}`,
                backgroundColor: selectMode ? "var(--neuron-state-hover)" : "var(--theme-bg-surface)",
                fontSize: 12,
                fontWeight: 500,
                color: selectMode ? "var(--neuron-brand-green)" : "var(--theme-text-secondary)",
                cursor: "pointer",
              }}
              title="Select multiple to close"
            >
              <CheckSquare size={12} />
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          {canCompose && (
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
          )}
          </div>
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

      {/* Open / Closed filter + bulk actions */}
      {supportsClose && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--theme-border-default)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ display: "inline-flex", border: "1px solid var(--theme-border-default)", borderRadius: 6, overflow: "hidden" }}>
            {([["open", "Open"], ["closed", "Closed"]] as const).map(([seg, label]) => {
              const active = (seg === "closed") === closedView;
              return (
                <button
                  key={seg}
                  onClick={() => onToggleClosedView(seg === "closed")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: active ? "var(--neuron-state-selected)" : "transparent",
                    color: active ? "var(--neuron-brand-green)" : "var(--theme-text-muted)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span style={{ flex: 1 }} />

          {selectMode && (
            <>
              <button
                onClick={() => handleBulkClose(selectedThreads)}
                disabled={selectedThreads.length === 0}
                style={{
                  padding: "4px 11px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: "1px solid var(--neuron-ui-active-border)",
                  backgroundColor: selectedThreads.length ? "var(--neuron-state-selected)" : "transparent",
                  color: selectedThreads.length ? "var(--neuron-brand-green)" : "var(--theme-text-muted)",
                  cursor: selectedThreads.length ? "pointer" : "default",
                  opacity: selectedThreads.length ? 1 : 0.6,
                }}
              >
                Close ({selectedThreads.length})
              </button>
              <button
                onClick={() => handleBulkClose(readThreads)}
                disabled={readThreads.length === 0}
                style={{
                  padding: "4px 11px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid var(--theme-border-default)",
                  backgroundColor: "transparent",
                  color: "var(--theme-text-secondary)",
                  cursor: readThreads.length ? "pointer" : "default",
                  opacity: readThreads.length ? 1 : 0.6,
                }}
                title="Close every already-read ticket in this list"
              >
                Close all read
              </button>
            </>
          )}
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        {isLoading ? (
          <ThreadListSkeleton />
        ) : filteredThreads.length === 0 ? (
          <EmptyState tab={activeTab} onCompose={canCompose ? onCompose : undefined} />
        ) : (
          filteredThreads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isSelected={selectedId === thread.id}
              onClick={() => onSelectThread(thread.id)}
              isClosedView={closedView}
              onClose={supportsClose ? onCloseTicket : undefined}
              onReopen={supportsClose ? onReopenTicket : undefined}
              selectMode={selectMode}
              isChecked={selectedIds.has(thread.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
