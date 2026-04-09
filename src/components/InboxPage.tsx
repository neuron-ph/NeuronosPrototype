import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router";
import { useInbox } from "../hooks/useInbox";
import { ThreadListPanel } from "./inbox/ThreadListPanel";
import { ThreadDetailPanel } from "./inbox/ThreadDetailPanel";
import { ComposePanel } from "./inbox/ComposePanel";

export function InboxPage() {
  const location = useLocation();
  const composeState = (location.state as { compose?: { entity_type?: string; entity_id?: string; entity_label?: string; subject?: string; toDept?: string } } | null)?.compose;

  const {
    threads,
    isLoading,
    activeTab,
    setActiveTab,
    draftCount,
    unreadCount,
    queueCount,
    isManager,
    refresh,
  } = useInbox();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(() => !!composeState);
  const listRef = useRef<string[]>([]);

  // Keep a stable ordered list of thread IDs for keyboard navigation
  listRef.current = threads.map((t) => t.id);

  const handleSelectThread = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleCompose = useCallback(() => {
    setShowCompose(true);
  }, []);

  const handleComposeClose = useCallback(() => {
    setShowCompose(false);
  }, []);

  const handleComposeSent = useCallback(() => {
    setShowCompose(false);
    refresh();
  }, [refresh]);

  const handleThreadUpdated = useCallback(() => {
    refresh();
  }, [refresh]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      // Esc — close compose modal
      if (e.key === "Escape") {
        if (showCompose) {
          setShowCompose(false);
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
      }

      // Don't fire shortcuts while typing in an input
      if (isTyping) return;

      // C — compose
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setShowCompose(true);
        return;
      }

      // Arrow navigation through thread list
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const ids = listRef.current;
        if (ids.length === 0) return;
        const currentIdx = selectedId ? ids.indexOf(selectedId) : -1;
        if (e.key === "ArrowDown") {
          const nextIdx = currentIdx < ids.length - 1 ? currentIdx + 1 : 0;
          setSelectedId(ids[nextIdx]);
        } else {
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : ids.length - 1;
          setSelectedId(ids[prevIdx]);
        }
        return;
      }

      // Enter — open selected thread (no-op if already open; thread detail is rendered when selectedId is set)
      if (e.key === "Enter") {
        if (!selectedId && listRef.current.length > 0) {
          setSelectedId(listRef.current[0]);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCompose, selectedId]);

  // When tab changes, clear selection
  useEffect(() => {
    setSelectedId(null);
  }, [activeTab]);

  return (
    <div
      className="flex h-full"
      style={{ backgroundColor: "var(--theme-bg-page)", overflow: "hidden" }}
    >
      {/* Left panel — thread list */}
      <ThreadListPanel
        threads={threads}
        isLoading={isLoading}
        activeTab={activeTab}
        draftCount={draftCount}
        unreadCount={unreadCount}
        queueCount={queueCount}
        isManager={isManager}
        selectedId={selectedId}
        onTabChange={setActiveTab}
        onSelectThread={handleSelectThread}
        onCompose={handleCompose}
      />

      {/* Right panel — compose or thread detail */}
      <div className="flex-1 overflow-hidden">
        {showCompose ? (
          <ComposePanel
            onClose={handleComposeClose}
            onSent={handleComposeSent}
            initialSubject={composeState?.subject}
            initialRecipientDept={composeState?.toDept}
            initialEntity={
              composeState?.entity_type && composeState?.entity_id
                ? { entity_type: composeState.entity_type, entity_id: composeState.entity_id, entity_label: composeState.entity_label ?? composeState.entity_id }
                : undefined
            }
          />
        ) : (
          <ThreadDetailPanel
            ticketId={selectedId}
            onThreadUpdated={handleThreadUpdated}
            threadIds={listRef.current}
            onNavigate={setSelectedId}
          />
        )}
      </div>
    </div>
  );
}
