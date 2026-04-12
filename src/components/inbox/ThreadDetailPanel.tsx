import { useRef, useEffect, useState } from "react";
import { UserPlus, MessageSquare, Check, CheckCircle, X, ChevronLeft, ChevronRight, ChevronDown, CornerUpLeft } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logStatusChange } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { useThread } from "../../hooks/useThread";
import type { ThreadMessage } from "../../hooks/useThread";
import { MessageBubble } from "./MessageBubble";
import { SystemEventRow } from "./SystemEventRow";
import { ComposeBox } from "./ComposeBox";
import type { RecipientChip } from "./RecipientField";
import { AssignModal } from "./AssignModal";
import { TICKET_PRIORITY_TONES, TICKET_STATUS_TONES, TICKET_TYPE_TONES, ticketBadgeStyle } from "./ticketingTheme";
import { executeResolutionAction } from "../../utils/workflowTickets";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_STEPS = ["open", "acknowledged", "in_progress", "done"] as const;

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  done: "Done",
  returned: "Returned",
  draft: "Draft",
  archived: "Archived",
};

const RECORD_TYPE_LABEL: Record<string, string> = {
  quotation: "Quotation",
  booking: "Booking",
  project: "Project",
  invoice: "Invoice",
  collection: "Collection",
  expense: "Expense",
  budget_request: "Budget Request",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface ThreadDetailPanelProps {
  ticketId: string | null;
  onThreadUpdated: () => void;
  threadIds?: string[];
  onNavigate?: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ThreadDetailPanel({ ticketId, onThreadUpdated, threadIds, onNavigate }: ThreadDetailPanelProps) {
  const { user, effectiveRole } = useUser();
  const { thread, isLoading, refresh } = useThread(ticketId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showReturnPanel, setShowReturnPanel] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    if (!isLoading && thread) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread?.messages.length, isLoading]);

  useEffect(() => { setLocalStatus(null); }, [thread?.status]);
  useEffect(() => { setShowCompose(false); }, [ticketId]);

  useEffect(() => {
    if (!statusOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatusOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [statusOpen]);

  if (!ticketId) return <EmptyState />;
  if (isLoading) return <ThreadDetailSkeleton />;
  if (!thread) return <EmptyState message="Thread not found" />;

  const isSender = thread.created_by === user?.id;
  const isRecipient = !isSender && thread.participants.some(
    (p) => p.participant_type === "user" && p.participant_user_id === user?.id
  );
  const isManagerOrDirector = effectiveRole === "manager" || effectiveRole === "team_leader";
  const deptParticipants = thread.participants.filter(
    (p) => p.participant_type === "department" && p.role === "to"
  );
  const canAssign = isManagerOrDirector && deptParticipants.length > 0;
  const canAdvanceStatus = isRecipient && !["done", "returned", "archived", "draft"].includes(thread.status);
  const isApprovalPending = thread.type === "approval" && thread.approval_result === null && isRecipient;
  const isDone = thread.status === "done";
  const isReturned = thread.status === "returned";

  const toParticipants = thread.participants.filter((p) => p.role === "to");
  const ccParticipants = thread.participants.filter((p) => p.role === "cc");

  // First message — embedded in the sender block
  const rawFirstMessage = thread.messages.find((m) => !m.is_system) ?? null;

  // For old tickets that were created before entity attachments were auto-generated,
  // synthesize one from the ticket's own linked_record fields so the chip appears
  // at the bottom of the first message body (matching the reference UX).
  const firstMessage = (() => {
    if (!rawFirstMessage) return null;
    if (!thread.linked_record_type || !thread.linked_record_id) return rawFirstMessage;
    const alreadyLinked = rawFirstMessage.attachments?.some(
      (a) => a.attachment_type === "entity" && a.entity_id === thread.linked_record_id
    );
    if (alreadyLinked) return rawFirstMessage;
    const derivedLabel =
      thread.subject?.includes(": ")
        ? thread.subject.split(": ").slice(1).join(": ")
        : thread.linked_record_id;
    return {
      ...rawFirstMessage,
      attachments: [
        ...(rawFirstMessage.attachments ?? []),
        {
          id: `synthetic-${thread.linked_record_id}`,
          message_id: rawFirstMessage.id,
          attachment_type: "entity" as const,
          file_path: null,
          file_name: null,
          file_size: null,
          file_mime_type: null,
          entity_type: thread.linked_record_type,
          entity_id: thread.linked_record_id,
          entity_label: derivedLabel,
          uploaded_by: thread.created_by,
        },
      ],
    };
  })();

  // Prev / next navigation
  const navIdx = threadIds ? threadIds.indexOf(thread.id) : -1;
  const hasPrev = navIdx > 0;
  const hasNext = threadIds ? navIdx < threadIds.length - 1 : false;
  const navTotal = threadIds?.length ?? 0;

  const renderParticipant = (p: typeof toParticipants[0]) =>
    p.participant_type === "department" ? `${p.participant_dept} dept` : p.user_name || "Unknown";

  // Build recipient chips for ComposeBox — everyone in the thread except self
  // Includes senders, to, and cc so "Reply" naturally addresses the right people
  const toChips: RecipientChip[] = thread.participants
    .filter((p) => p.participant_user_id !== user?.id)
    .map((p) =>
      p.participant_type === "user"
        ? { id: p.participant_user_id!, label: p.user_name || "Unknown", type: "user" as const, userId: p.participant_user_id! }
        : { id: `dept-${p.participant_dept}`, label: p.participant_dept!, type: "department" as const, department: p.participant_dept! }
    );

  const typeTone = TICKET_TYPE_TONES[thread.type] ?? TICKET_TYPE_TONES.fyi;


  // ── Status / workflow helpers ────────────────────────────────────────────

  const logSystemEvent = async (event: string, metadata: Record<string, any>) => {
    await supabase.from("ticket_messages").insert({
      ticket_id: thread.id,
      sender_id: user!.id,
      sender_name: user!.name,
      is_system: true,
      message_type: "system",
      system_event: event,
      system_metadata: metadata,
      is_retracted: false,
    });
    await supabase
      .from("tickets")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread.id);
  };

  const advanceStatus = async () => {
    if (!canAdvanceStatus) return;
    const currentIdx = STATUS_STEPS.indexOf(thread.status as any);
    if (currentIdx < 0 || currentIdx >= STATUS_STEPS.length - 1) return;
    const nextStatus = STATUS_STEPS[currentIdx + 1];
    setIsUpdatingStatus(true);

    const { error } = await supabase
      .from("tickets")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", thread.id);

    if (!error) {
      await logSystemEvent("status_changed", {
        from: thread.status,
        to: nextStatus,
        changed_by_name: user!.name,
      });
      const actor = { id: user!.id, name: user!.name, department: user!.department };
      logStatusChange("ticket", thread.id, thread.subject ?? thread.id, thread.status, nextStatus, actor);

      if (nextStatus === "done" && thread.resolution_action && thread.linked_record_type && thread.linked_record_id) {
        await executeResolutionAction(thread.resolution_action, thread.linked_record_type, thread.linked_record_id);
        toast.success("Done — linked record updated");
      } else {
        toast.success(`Marked as ${STATUS_LABELS[nextStatus]}`);
      }
      refresh();
      onThreadUpdated();
    } else {
      toast.error("Failed to update status");
    }
    setIsUpdatingStatus(false);
  };

  const setStatus = async (targetStatus: typeof STATUS_STEPS[number]) => {
    if (!canAdvanceStatus || targetStatus === thread.status) return;
    setIsUpdatingStatus(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq("id", thread.id);
    if (!error) {
      await logSystemEvent("status_changed", {
        from: thread.status,
        to: targetStatus,
        changed_by_name: user!.name,
      });
      const actor = { id: user!.id, name: user!.name, department: user!.department };
      logStatusChange("ticket", thread.id, thread.subject ?? thread.id, thread.status, targetStatus, actor);
      if (targetStatus === "done" && thread.resolution_action && thread.linked_record_type && thread.linked_record_id) {
        await executeResolutionAction(thread.resolution_action, thread.linked_record_type, thread.linked_record_id);
        toast.success("Done — linked record updated");
      } else {
        toast.success(`Marked as ${STATUS_LABELS[targetStatus]}`);
      }
      refresh();
      onThreadUpdated();
    } else {
      toast.error("Failed to update status");
    }
    setIsUpdatingStatus(false);
  };

  const handleReturn = async () => {
    if (!returnReason.trim()) {
      toast.error("A reason is required to return this ticket");
      return;
    }
    setIsUpdatingStatus(true);
    const { error } = await supabase
      .from("tickets")
      .update({
        status: "returned",
        return_reason: returnReason.trim(),
        returned_by: user!.id,
        returned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    if (!error) {
      await logSystemEvent("status_changed", {
        from: thread.status,
        to: "returned",
        changed_by_name: user!.name,
        reason: returnReason.trim(),
      });
      const actor = { id: user!.id, name: user!.name, department: user!.department };
      logStatusChange("ticket", thread.id, thread.subject ?? thread.id, thread.status, "returned", actor);
      toast.success("Ticket returned");
      setShowReturnPanel(false);
      setReturnReason("");
      refresh();
      onThreadUpdated();
    } else {
      toast.error("Failed to return ticket");
    }
    setIsUpdatingStatus(false);
  };

  const handleApproval = async (result: "accepted" | "declined", reason?: string) => {
    setIsUpdatingStatus(true);
    const newStatus = result === "accepted" ? "done" : "returned";
    const updates: Record<string, any> = {
      approval_result: result,
      approval_decided_by: user!.id,
      approval_decided_at: new Date().toISOString(),
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (result === "declined" && reason) {
      updates.return_reason = reason;
      updates.returned_by = user!.id;
      updates.returned_at = new Date().toISOString();
    }

    const { error } = await supabase.from("tickets").update(updates).eq("id", thread.id);

    if (!error) {
      await logSystemEvent(
        result === "accepted" ? "approval_accepted" : "approval_declined",
        { decided_by_name: user!.name, reason: reason ?? null }
      );
      if (
        result === "accepted" &&
        thread.resolution_action &&
        thread.linked_record_type &&
        thread.linked_record_id
      ) {
        await executeResolutionAction(
          thread.resolution_action,
          thread.linked_record_type,
          thread.linked_record_id
        );
      }
      toast.success(result === "accepted" ? "Request approved" : "Request declined");
      setShowReturnPanel(false);
      setReturnReason("");
      refresh();
      onThreadUpdated();
    } else {
      toast.error("Failed to record decision");
    }
    setIsUpdatingStatus(false);
  };

  const handleReopen = async () => {
    if (!isSender) return;
    setIsUpdatingStatus(true);
    const oldStatus = thread.status;
    await supabase
      .from("tickets")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", thread.id);
    await logSystemEvent("status_changed", { from: oldStatus, to: "open", changed_by_name: user!.name });
    const actor = { id: user!.id, name: user!.name, department: user!.department };
    logStatusChange("ticket", thread.id, thread.subject ?? thread.id, oldStatus, "open", actor);
    toast.success("Ticket reopened");
    refresh();
    onThreadUpdated();
    setIsUpdatingStatus(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  // Index of the last non-system message (starts expanded)
  const lastNonSystemIdx = thread.messages.reduce<number>(
    (acc, m, i) => (!m.is_system ? i : acc), -1
  );

  return (
    <div
      className="ticketing-ui flex flex-col h-full"
      style={{ backgroundColor: "var(--theme-bg-surface)" }}
    >
      {/* ══ TOOLBAR ═══════════════════════════════════════════════════════ */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--theme-border-subtle)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "var(--theme-bg-surface)",
        }}
      >
        <span style={{ ...ticketBadgeStyle(typeTone, 700), fontSize: 11, padding: "3px 8px", letterSpacing: "0.4px" }}>
          {thread.type === "fyi" ? "FYI" : thread.type === "request" ? "Request" : "Approval"}
        </span>
        {thread.priority === "urgent" && (
          <span style={ticketBadgeStyle(TICKET_PRIORITY_TONES.urgent)}>Urgent</span>
        )}

        <div style={{ flex: 1 }} />

        {isApprovalPending && (
          <>
            <ActionButton onClick={() => handleApproval("accepted")} disabled={isUpdatingStatus} variant="success" icon={<Check size={12} />} label="Accept" />
            <ActionButton onClick={() => setShowReturnPanel(true)} disabled={isUpdatingStatus} variant="danger" icon={<X size={12} />} label="Decline" />
          </>
        )}

        {(() => {
          const displayStatus = localStatus ?? thread.status;
          const displayStepIdx = STATUS_STEPS.indexOf(displayStatus as any);
          const statusTone = TICKET_STATUS_TONES[displayStatus] ?? TICKET_STATUS_TONES.open;
          const canChangeStatus = canAdvanceStatus && thread.type !== "approval" && !isUpdatingStatus;
          return (
            <div ref={statusDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => canChangeStatus && setStatusOpen((o) => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                  borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${statusTone.border}`,
                  backgroundColor: statusTone.bg, color: statusTone.text,
                  cursor: canChangeStatus ? "pointer" : "default",
                  letterSpacing: "0.2px", opacity: isUpdatingStatus ? 0.6 : 1,
                  transition: "opacity 150ms ease",
                }}
              >
                {STATUS_LABELS[displayStatus] ?? displayStatus}
                {canChangeStatus && <ChevronDown size={11} style={{ opacity: 0.7 }} />}
              </button>
              {statusOpen && (
                <div role="menu" style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                  zIndex: 200, minWidth: 160, padding: "4px 0", overflow: "hidden",
                }}>
                  {STATUS_STEPS.map((step, idx) => {
                    const isCurrent = displayStatus === step;
                    const isCompleted = displayStepIdx > idx;
                    return (
                      <div
                        key={step}
                        role="menuitem"
                        onClick={() => { if (isCurrent || isUpdatingStatus) return; setLocalStatus(step); setStatusOpen(false); setStatus(step); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
                          fontSize: 12, fontWeight: isCurrent ? 600 : 400,
                          color: isCurrent ? "var(--neuron-brand-green)" : "var(--theme-text-primary)",
                          backgroundColor: isCurrent ? "var(--neuron-state-selected)" : "transparent",
                          cursor: isCurrent || isUpdatingStatus ? "default" : "pointer",
                          transition: "background 120ms ease",
                        }}
                        onMouseEnter={(e) => { if (!isCurrent && !isUpdatingStatus) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                        onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <span style={{ width: 12, display: "flex", alignItems: "center" }}>
                          {(isCurrent || isCompleted) && <Check size={10} style={{ color: "var(--neuron-brand-green)" }} />}
                        </span>
                        {STATUS_LABELS[step]}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {isSender && thread.status === "in_progress" && (
          <ActionButton onClick={advanceStatus} disabled={isUpdatingStatus} variant="success" icon={<CheckCircle size={12} />} label="Mark Done" />
        )}

        {isSender && (isDone || isReturned) && (
          <ActionButton onClick={handleReopen} disabled={isUpdatingStatus} variant="ghost" label="Reopen" />
        )}

        {canAssign && (
          <IconToolbarButton onClick={() => setShowAssignModal(true)} title={thread.assignment ? "Reassign" : "Assign"}>
            <UserPlus size={14} />
          </IconToolbarButton>
        )}

        {threadIds && navTotal > 1 && onNavigate && (
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderLeft: "1px solid var(--theme-border-default)", paddingLeft: 8, marginLeft: 2 }}>
            <button
              onClick={() => hasPrev && onNavigate(threadIds[navIdx - 1])}
              disabled={!hasPrev}
              title="Previous thread (↑)"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: 5, border: "1px solid var(--theme-border-default)",
                backgroundColor: "transparent", color: hasPrev ? "var(--theme-text-secondary)" : "var(--theme-text-muted)",
                cursor: hasPrev ? "pointer" : "not-allowed", opacity: hasPrev ? 1 : 0.4,
              }}
              onMouseEnter={(e) => { if (hasPrev) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", padding: "0 6px", whiteSpace: "nowrap" }}>
              {navIdx + 1} / {navTotal}
            </span>
            <button
              onClick={() => hasNext && onNavigate(threadIds[navIdx + 1])}
              disabled={!hasNext}
              title="Next thread (↓)"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: 5, border: "1px solid var(--theme-border-default)",
                backgroundColor: "transparent", color: hasNext ? "var(--theme-text-secondary)" : "var(--theme-text-muted)",
                cursor: hasNext ? "pointer" : "not-allowed", opacity: hasNext ? 1 : 0.4,
              }}
              onMouseEnter={(e) => { if (hasNext) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ══ SUBJECT HEADER ════════════════════════════════════════════════ */}
      <div
        style={{
          padding: "16px 24px 14px",
          borderBottom: "1px solid var(--theme-border-default)",
          flexShrink: 0,
          backgroundColor: "var(--theme-bg-surface)",
        }}
      >
        <h1 style={{
          fontSize: 20, fontWeight: 700, color: "var(--theme-text-primary)",
          lineHeight: 1.3, letterSpacing: "-0.3px", margin: 0,
          marginBottom: (toParticipants.length > 0 || !!thread.assignment || isReturned || !!thread.approval_result) ? 6 : 0,
        }}>
          {thread.subject}
        </h1>

        {(toParticipants.length > 0 || !!thread.assignment) && (
          <p style={{ fontSize: 12, color: "var(--theme-text-muted)", margin: 0, marginBottom: (isReturned || !!thread.approval_result) ? 10 : 0 }}>
            {toParticipants.length > 0 && (
              <>To: <span style={{ color: "var(--theme-text-secondary)" }}>{toParticipants.map(renderParticipant).join(", ")}</span></>
            )}
            {ccParticipants.length > 0 && (
              <> · CC: <span style={{ color: "var(--theme-text-secondary)" }}>{ccParticipants.map(renderParticipant).join(", ")}</span></>
            )}
            {thread.assignment && (
              <> · <span style={{ color: "var(--theme-action-primary-bg)" }}>Assigned to {thread.assignment.assigned_to_name}</span></>
            )}
          </p>
        )}

        {isReturned && thread.return_reason && (
          <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, backgroundColor: "var(--theme-status-danger-bg)", border: "1px solid var(--theme-status-danger-border)" }}>
            <p style={{ fontSize: 12, color: "var(--theme-status-danger-fg)", margin: 0 }}>
              <span style={{ fontWeight: 600 }}>↩ Returned</span>
              {thread.returned_by_name && ` by ${thread.returned_by_name}`}
              {" — "}{thread.return_reason}
            </p>
          </div>
        )}

        {thread.approval_result && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 6,
            backgroundColor: thread.approval_result === "accepted" ? "var(--theme-status-success-bg)" : "var(--theme-status-danger-bg)",
            border: `1px solid ${thread.approval_result === "accepted" ? "var(--theme-status-success-border)" : "var(--theme-status-danger-border)"}`,
          }}>
            <p style={{
              fontSize: 12, fontWeight: 500, margin: 0,
              color: thread.approval_result === "accepted" ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)",
            }}>
              {thread.approval_result === "accepted" ? "✓ Request accepted" : "✕ Request declined"}
              {thread.return_reason && ` — ${thread.return_reason}`}
            </p>
          </div>
        )}
      </div>

      {/* ══ SCROLLABLE BODY ═══════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>

        {/* Return reason panel */}
        {showReturnPanel && (
          <div style={{
            margin: "16px 20px 0", padding: "12px 16px", borderRadius: 8,
            backgroundColor: "var(--theme-status-warning-bg)",
            border: "1px solid var(--theme-status-warning-border)",
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-status-warning-fg)", marginBottom: 8 }}>
              {thread.type === "approval" ? "Reason for declining" : "Reason for returning"} (required)
            </p>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Explain why you're returning this ticket…"
              rows={2}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: "1px solid var(--theme-status-warning-border)",
                fontSize: 12, color: "var(--theme-text-primary)",
                resize: "none", outline: "none", backgroundColor: "var(--theme-bg-surface)",
              }}
              autoFocus
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => thread.type === "approval" ? handleApproval("declined", returnReason) : handleReturn()}
                disabled={!returnReason.trim() || isUpdatingStatus}
                style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none",
                  backgroundColor: returnReason.trim() ? "var(--theme-status-danger-fg)" : "var(--theme-border-default)",
                  color: returnReason.trim() ? "#FFFFFF" : "var(--theme-text-muted)",
                  cursor: returnReason.trim() ? "pointer" : "default",
                }}
              >
                {thread.type === "approval" ? "Confirm Decline" : "Confirm Return"}
              </button>
              <button
                onClick={() => { setShowReturnPanel(false); setReturnReason(""); }}
                style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                  backgroundColor: "transparent", border: "1px solid var(--theme-border-default)",
                  color: "var(--theme-text-muted)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Message cards ── */}
        {thread.messages.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--theme-text-muted)", fontSize: 13 }}>
            No messages yet
          </div>
        )}
        {thread.messages.map((msg, idx) =>
          msg.is_system ? (
            <SystemEventRow key={msg.id} message={msg} />
          ) : (
            <CollapsibleMessageCard
              key={msg.id}
              message={msg.id === rawFirstMessage?.id ? firstMessage! : msg}
              defaultExpanded={idx === 0 || idx === lastNonSystemIdx}
              onRetract={refresh}
            />
          )
        )}

        {/* ── Reply pill ── */}
        {!showCompose && !["done", "returned", "archived", "draft"].includes(thread.status) && (
          <div style={{ padding: "16px 24px 20px" }}>
            <button
              onClick={() => setShowCompose(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 20px", borderRadius: 20,
                border: "1px solid var(--theme-border-default)",
                backgroundColor: "transparent", color: "var(--theme-text-secondary)",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                transition: "border-color 140ms ease, background-color 140ms ease, color 140ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)";
                e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                e.currentTarget.style.color = "var(--neuron-brand-green)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--theme-text-secondary)";
              }}
            >
              <CornerUpLeft size={14} />
              Reply
            </button>
          </div>
        )}

        {/* ── Inline compose ── */}
        {showCompose && (
          <div style={{
            margin: "8px 20px 20px",
            border: "1px solid var(--theme-border-default)",
            borderRadius: 8, overflow: "hidden",
            backgroundColor: "var(--theme-bg-surface)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}>
            <ComposeBox
              ticketId={thread.id}
              toChips={toChips}
              onSent={() => { setShowCompose(false); refresh(); onThreadUpdated(); }}
              onClose={() => setShowCompose(false)}
            />
          </div>
        )}

        {/* ── Closed / reopen footer ── */}
        {(isDone || isReturned) && isSender && (
          <div style={{ textAlign: "center", padding: "12px 24px 20px" }}>
            <button
              onClick={handleReopen}
              style={{ fontSize: 12, color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
            >
              Reopen this ticket
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ══ ASSIGN MODAL ══════════════════════════════════════════════════ */}
      {showAssignModal && deptParticipants[0] && (
        <AssignModal
          ticketId={thread.id}
          ticketSubject={thread.subject}
          department={deptParticipants[0].participant_dept!}
          onAssigned={() => { setShowAssignModal(false); refresh(); onThreadUpdated(); }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}

// ── IconToolbarButton ────────────────────────────────────────────────────────

function IconToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 6,
        border: "1px solid var(--neuron-ui-border)",
        backgroundColor: "transparent", color: "var(--neuron-ink-secondary)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
        e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)";
        e.currentTarget.style.color = "var(--neuron-brand-green)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
        e.currentTarget.style.color = "var(--neuron-ink-secondary)";
      }}
    >
      {children}
    </button>
  );
}

// ── CollapsibleMessageCard (Gmail-style) ──────────────────────────────────────

interface CollapsibleMessageCardProps {
  message: ThreadMessage;
  defaultExpanded?: boolean;
  onRetract: () => void;
}

function CollapsibleMessageCard({ message, defaultExpanded = false, onRetract }: CollapsibleMessageCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyRef = useRef<HTMLDivElement>(null);

  function cardInitials(name?: string) {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  }

  const snippet = message.is_retracted
    ? "Message retracted"
    : message.body
    ? message.body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";

  const timestamp = new Date(message.created_at).toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
      {/* ── Card header — always visible, click to toggle ── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 24px", cursor: "pointer", userSelect: "none",
          transition: "background-color 120ms ease",
          outline: "none",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--theme-bg-page)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent"; }}
      >
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          backgroundColor: message.sender_avatar_url ? "transparent" : "var(--neuron-brand-green)",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, overflow: "hidden",
          border: "1.5px solid var(--theme-border-default)",
        }}>
          {message.sender_avatar_url
            ? <img src={message.sender_avatar_url} alt={message.sender_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : cardInitials(message.sender_name)
          }
        </div>

        {/* Sender + snippet or dept */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-text-primary)" }}>
              {message.sender_name || "Unknown"}
            </span>
            {message.sender_department && (
              <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                {message.sender_department}
              </span>
            )}
          </div>
          {!expanded && snippet && (
            <p style={{
              fontSize: 12, color: "var(--theme-text-muted)", margin: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {snippet}
            </p>
          )}
        </div>

        {/* Timestamp + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{timestamp}</span>
          <span style={{
            color: "var(--theme-text-muted)", display: "flex",
            transition: "transform 150ms ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}>
            <ChevronDown size={14} />
          </span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      <div
        ref={bodyRef}
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ paddingLeft: 72, paddingRight: 24, paddingBottom: 20 }}>
            <MessageBubble message={message} onRetract={onRetract} variant="first" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Action button helper ─────────────────────────────────────────────────────

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant: "success" | "danger" | "ghost";
  icon?: React.ReactNode;
  label: string;
  dangerOnHover?: boolean;
}

function ActionButton({ onClick, disabled, variant, icon, label, dangerOnHover }: ActionButtonProps) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 11px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "color 150ms ease, border-color 150ms ease, background-color 150ms ease, opacity 150ms ease",
    opacity: disabled ? 0.5 : 1,
    border: "1px solid transparent",
  };

  const styles: Record<string, React.CSSProperties> = {
    success: {
      ...base,
      border: "1px solid var(--neuron-ui-active-border)",
      backgroundColor: "var(--neuron-state-selected)",
      color: "var(--neuron-brand-green)",
    },
    danger: {
      ...base,
      border: "1px solid var(--theme-status-danger-border)",
      backgroundColor: "var(--theme-status-danger-bg)",
      color: "var(--theme-status-danger-fg)",
    },
    ghost: {
      ...base,
      border: "1px solid var(--neuron-ui-border)",
      backgroundColor: "transparent",
      color: "var(--neuron-ink-secondary)",
    },
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={styles[variant]}
      onMouseEnter={
        !disabled && dangerOnHover
          ? (e) => {
              e.currentTarget.style.borderColor = "var(--theme-status-danger-border)";
              e.currentTarget.style.color = "var(--theme-status-danger-fg)";
              e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
            }
          : !disabled && variant === "ghost"
          ? (e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
              e.currentTarget.style.borderColor = "var(--neuron-ui-active-border)";
              e.currentTarget.style.color = "var(--neuron-brand-green)";
            }
          : undefined
      }
      onMouseLeave={
        !disabled && (dangerOnHover || variant === "ghost")
          ? (e) => {
              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--neuron-ink-secondary)";
            }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  );
}

// ── Empty / skeleton states ──────────────────────────────────────────────────

function EmptyState({ message }: { message?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ color: "var(--theme-text-muted)" }}
    >
      <MessageSquare
        size={40}
        style={{ marginBottom: 12, color: "var(--theme-border-default)" }}
      />
      <p style={{ fontSize: 14, color: "var(--theme-text-muted)" }}>
        {message || "Select a ticket to read it"}
      </p>
    </div>
  );
}

function ThreadDetailSkeleton() {
  return (
    <div style={{ padding: "20px 28px" }}>
      <div className="animate-pulse" style={{ height: 16, width: 120, borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", marginBottom: 12 }} />
      <div className="animate-pulse" style={{ height: 24, width: "60%", borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", marginBottom: 12 }} />
      <div className="animate-pulse" style={{ height: 12, width: "40%", borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)" }} />
    </div>
  );
}
