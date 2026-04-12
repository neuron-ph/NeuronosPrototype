/**
 * AttentionPanel — Zone 2 of the Financial Dashboard
 *
 * Action Items queue — each row is a clickable surface that navigates
 * to the relevant tab. No explicit buttons; hover reveals a subtle
 * navigation hint + chevron. Dismiss is a hover-only × icon.
 *
 * Collapsible: auto-expands if danger/warning items exist,
 * collapsed by default if all items are success/info.
 *
 * Also renders a self-contained "Pending Requests" section that surfaces
 * open workflow tickets targeting the Accounting department.
 */

import { useState, useMemo } from "react";
import { AlertTriangle, ChevronRight, ChevronDown, ChevronUp, X, Inbox, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { supabase } from "../../../utils/supabase/client";
import { queryKeys } from "../../../lib/queryKeys";

export interface AttentionItem {
  severity: "danger" | "warning" | "success" | "info";
  icon: LucideIcon;
  label: string;
  detail: string;
  /** Second line — the single most actionable data point */
  detailLine?: string;
  /** Primary action CTA label (verb-based: "Follow Up", "Create Invoice") — shown as hover hint */
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary action label (unused in new design, kept for API compat) */
  actionLabel2?: string;
  onAction2?: () => void;
  /** Unique key for dismiss tracking */
  dismissKey?: string;
}

interface AttentionPanelProps {
  items: AttentionItem[];
}

const SEVERITY_COLORS: Record<string, { dot: string; bg: string; border: string }> = {
  danger:  { dot: "var(--theme-status-danger-fg)", bg: "var(--theme-status-danger-bg)", border: "var(--theme-status-danger-border)" },
  warning: { dot: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)", border: "var(--theme-status-warning-border)" },
  success: { dot: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)", border: "var(--theme-status-success-border)" },
  info:    { dot: "var(--theme-text-muted)", bg: "var(--neuron-pill-inactive-bg)", border: "var(--theme-border-default)" },
};

const SEVERITY_PRIORITY: Record<string, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface PendingTicket {
  id: string;
  subject: string;
  type: string;
  priority: string;
  created_at: string;
  linked_record_id: string | null;
  linked_record_type: string | null;
  // joined from bookings
  booking_number?: string | null;
  service_type?: string | null;
  // creator name resolved from ticket_messages opening message
  created_by_name?: string | null;
}

// ---------------------------------------------------------------------------
// PendingRequestsSection — self-contained, fetches its own data
// ---------------------------------------------------------------------------

function PendingRequestsSection() {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: queryKeys.workflowTickets.pendingForDept("Accounting"),
    queryFn: async (): Promise<PendingTicket[]> => {
      // Step 1: find ticket IDs routed to the Accounting department
      const { data: participants, error: pErr } = await supabase
        .from("ticket_participants")
        .select("ticket_id")
        .eq("participant_dept", "Accounting")
        .eq("role", "to");

      if (pErr || !participants?.length) return [];

      const ticketIds = participants.map((p) => p.ticket_id as string);

      // Step 2: fetch those tickets that are still open/pending
      const { data: rawTickets, error: tErr } = await supabase
        .from("tickets")
        .select("id, subject, type, priority, created_at, linked_record_id, linked_record_type, status")
        .in("id", ticketIds)
        .in("status", ["open", "pending"])
        .order("created_at", { ascending: true });

      if (tErr || !rawTickets?.length) return [];

      // Step 3: fetch booking references for ticket rows linked to bookings
      const bookingIds = rawTickets
        .filter((t) => t.linked_record_type === "booking" && t.linked_record_id)
        .map((t) => t.linked_record_id as string);

      let bookingMap: Record<string, { booking_number: string; service_type: string }> = {};

      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("id, booking_number, service_type")
          .in("id", bookingIds);

        if (bookings) {
          bookingMap = Object.fromEntries(
            bookings.map((b) => [b.id, { booking_number: b.booking_number, service_type: b.service_type }])
          );
        }
      }

      // Step 4: fetch the opening message sender name for each ticket
      const { data: messages } = await supabase
        .from("ticket_messages")
        .select("ticket_id, sender_name")
        .in("ticket_id", rawTickets.map((t) => t.id))
        .eq("is_system", false)
        .order("created_at", { ascending: true });

      // Keep only the first (opening) message per ticket
      const senderMap: Record<string, string> = {};
      if (messages) {
        for (const msg of messages) {
          if (!senderMap[msg.ticket_id]) {
            senderMap[msg.ticket_id] = msg.sender_name;
          }
        }
      }

      return rawTickets.map((t) => {
        const bk = t.linked_record_id ? bookingMap[t.linked_record_id] : undefined;
        return {
          id: t.id,
          subject: t.subject,
          type: t.type,
          priority: t.priority,
          created_at: t.created_at,
          linked_record_id: t.linked_record_id,
          linked_record_type: t.linked_record_type,
          booking_number: bk?.booking_number ?? null,
          service_type: bk?.service_type ?? null,
          created_by_name: senderMap[t.id] ?? null,
        };
      });
    },
    staleTime: 60_000,
  });

  const handleRowClick = (ticket: PendingTicket) => {
    if (ticket.linked_record_type === "booking" && ticket.linked_record_id) {
      navigate(`/operations/${ticket.linked_record_id}`);
    }
  };

  // Don't render the section at all while loading with no data yet
  if (isLoading && tickets.length === 0) return null;
  if (!isLoading && tickets.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      {/* Section header */}
      <button
        className="w-full px-5 py-3 flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface-subtle)]/50"
        style={{
          borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none",
          background: isExpanded ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: "var(--theme-status-warning-fg)" }}
        />

        <Inbox size={14} style={{ color: "var(--theme-text-muted)" }} />
        <span
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--theme-text-muted)" }}
        >
          Pending Requests
        </span>

        {/* Count badge */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
          style={{
            backgroundColor: "var(--theme-status-warning-bg)",
            color: "var(--theme-status-warning-fg)",
          }}
        >
          {tickets.length}
        </span>

        <div className="flex-1" />

        {isExpanded ? (
          <ChevronUp size={14} style={{ color: "var(--theme-text-muted)" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "var(--theme-text-muted)" }} />
        )}
      </button>

      {/* Ticket rows */}
      {isExpanded && (
        <div>
          {tickets.map((ticket, idx) => {
            const isClickable = ticket.linked_record_type === "booking" && !!ticket.linked_record_id;
            const label = ticket.booking_number ?? ticket.subject;
            const subLabel = [
              ticket.service_type,
              ticket.created_by_name ? `by ${ticket.created_by_name}` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={ticket.id}
                className={`group relative px-5 py-3 transition-all duration-150 ${isClickable ? "cursor-pointer" : ""}`}
                style={{
                  borderBottom: idx < tickets.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                }}
                onClick={isClickable ? () => handleRowClick(ticket) : undefined}
                onMouseEnter={(e) => {
                  if (isClickable) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Severity dot — warning for all pending billing requests */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "var(--theme-status-warning-fg)" }}
                  />

                  {/* Icon */}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: "var(--theme-status-warning-bg)",
                    }}
                  >
                    <Inbox
                      size={14}
                      style={{ color: "var(--theme-status-warning-fg)" }}
                    />
                  </div>

                  {/* Label */}
                  <span
                    className="text-[13px] font-medium flex-1 truncate"
                    style={{ color: "var(--theme-text-primary)" }}
                  >
                    {label}
                  </span>

                  {/* Age */}
                  <span
                    className="text-[11px] tabular-nums flex-shrink-0 flex items-center gap-1"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    <Clock size={11} />
                    {relativeTime(ticket.created_at)}
                  </span>

                  {/* Chevron on hover */}
                  {isClickable && (
                    <ChevronRight
                      size={14}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ color: "var(--theme-text-muted)" }}
                    />
                  )}
                </div>

                {/* Second line: service type + requester */}
                {subLabel && (
                  <div className="mt-1 ml-[46px]">
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {subLabel}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttentionPanel
// ---------------------------------------------------------------------------

export function AttentionPanel({ items }: AttentionPanelProps) {
  // Dismiss state (per session)
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  // Determine if there are actionable (danger/warning) items
  const hasActionable = useMemo(
    () => items.some((i) => i.severity === "danger" || i.severity === "warning"),
    [items]
  );

  const [isExpanded, setIsExpanded] = useState(hasActionable);

  // Sort items: danger first, then warning, info, success
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (SEVERITY_PRIORITY[a.severity] ?? 9) - (SEVERITY_PRIORITY[b.severity] ?? 9)),
    [items]
  );

  // Split into active and dismissed
  const activeItems = useMemo(
    () => sortedItems.filter((item) => !item.dismissKey || !dismissedKeys.has(item.dismissKey)),
    [sortedItems, dismissedKeys]
  );
  const dismissedItems = useMemo(
    () => sortedItems.filter((item) => item.dismissKey && dismissedKeys.has(item.dismissKey)),
    [sortedItems, dismissedKeys]
  );

  // Count by severity for collapsed summary
  const dangerCount = activeItems.filter((i) => i.severity === "danger").length;
  const warningCount = activeItems.filter((i) => i.severity === "warning").length;
  const successCount = activeItems.filter((i) => i.severity === "success").length;

  // Header accent color based on worst active severity
  const worstSeverity = activeItems[0]?.severity || "info";
  const accentColor = SEVERITY_COLORS[worstSeverity]?.dot || "#6B7A76";

  const handleDismiss = (key: string) => {
    setDismissedKeys((prev) => new Set([...prev, key]));
  };

  return (
    <>
    <PendingRequestsSection />
    {items.length > 0 && (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      {/* Header — always visible, clickable to toggle */}
      <button
        className="w-full px-5 py-3 flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface-subtle)]/50"
        style={{
          borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none",
          background: isExpanded ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Severity accent dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        />

        <AlertTriangle size={14} style={{ color: "var(--theme-text-muted)" }} />
        <span
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--theme-text-muted)" }}
        >
          Action Items
        </span>

        {/* Active count badge */}
        {activeItems.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ backgroundColor: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" }}
          >
            {activeItems.filter((i) => i.severity !== "success").length} pending
          </span>
        )}

        {/* Collapsed summary badges */}
        {!isExpanded && (
          <div className="flex items-center gap-1.5 ml-2">
            {dangerCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ backgroundColor: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" }}
              >
                {dangerCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" }}
              >
                {warningCount} warning{warningCount > 1 ? "s" : ""}
              </span>
            )}
            {dangerCount === 0 && warningCount === 0 && successCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ backgroundColor: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" }}
              >
                All clear
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Expand/collapse icon */}
        {isExpanded ? (
          <ChevronUp size={14} style={{ color: "var(--theme-text-muted)" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "var(--theme-text-muted)" }} />
        )}
      </button>

      {/* Alert rows — visible when expanded */}
      {isExpanded && (
        <div>
          {activeItems.map((item, idx) => {
            const Icon = item.icon;
            const colors = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.info;
            const isSuccess = item.severity === "success";
            const isClickable = !!item.onAction;

            return (
              <div
                key={item.dismissKey || idx}
                className={`group relative px-5 py-3 transition-all duration-150 ${
                  isClickable ? "cursor-pointer" : ""
                }`}
                style={{
                  borderBottom: idx < activeItems.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                }}
                onClick={isClickable ? item.onAction : undefined}
                onMouseEnter={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {/* Line 1: Icon + Label + Amount badge + Chevron */}
                <div className="flex items-center gap-3">
                  {/* Severity dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colors.dot }}
                  />

                  {/* Icon */}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <Icon size={14} style={{ color: colors.dot }} />
                  </div>

                  {/* Label */}
                  <span
                    className="text-[13px] font-medium flex-1"
                    style={{ color: "var(--theme-text-primary)" }}
                  >
                    {item.label}
                  </span>

                  {/* Detail (amount/count) */}
                  <span
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: colors.dot }}
                  >
                    {item.detail}
                  </span>

                  {/* Chevron — visible on hover for clickable rows */}
                  {isClickable && (
                    <ChevronRight
                      size={14}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ color: "var(--theme-text-muted)" }}
                    />
                  )}
                </div>

                {/* Line 2: Detail line + hover navigation hint */}
                {(item.detailLine || item.actionLabel) && !isSuccess && (
                  <div className="flex items-center gap-3 mt-1.5 ml-[46px]">
                    {/* Detail line */}
                    {item.detailLine && (
                      <span
                        className="text-[11px] flex-1"
                        style={{ color: "var(--theme-text-muted)" }}
                      >
                        {item.detailLine}
                      </span>
                    )}

                    {/* Hover navigation hint — replaces the old button */}
                    {/* Removed: the row click is the action, no text hint needed */}
                  </div>
                )}

                {/* Dismiss × — hover-only, top-right corner */}
                {item.dismissKey && !isSuccess && (
                  <button
                    className="absolute top-2.5 right-2 w-5 h-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:bg-[var(--theme-state-hover)]"
                    style={{ color: "var(--theme-text-muted)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismiss(item.dismissKey!);
                    }}
                    title="Dismiss for this session"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Dismissed section */}
          {dismissedItems.length > 0 && (
            <div style={{ borderTop: "1px solid var(--theme-border-subtle)" }}>
              <button
                className="w-full px-5 py-2 flex items-center gap-2 cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)]/30 transition-colors"
                onClick={() => setShowDismissed(!showDismissed)}
              >
                <span className="text-[10px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
                  Dismissed ({dismissedItems.length})
                </span>
                <ChevronRight
                  size={10}
                  className="transition-transform duration-200"
                  style={{
                    color: "var(--theme-border-default)",
                    transform: showDismissed ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                />
              </button>

              {showDismissed && (
                <div>
                  {dismissedItems.map((item, idx) => {
                    const Icon = item.icon;
                    const colors = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.info;

                    return (
                      <div
                        key={item.dismissKey || idx}
                        className="px-5 py-2 flex items-center gap-3 opacity-50"
                        style={{
                          borderBottom: idx < dismissedItems.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colors.dot }}
                        />
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: colors.bg }}
                        >
                          <Icon size={12} style={{ color: colors.dot }} />
                        </div>
                        <span
                          className="text-[12px] font-medium flex-1 line-through"
                          style={{ color: "var(--theme-text-muted)" }}
                        >
                          {item.label}
                        </span>
                        <button
                          className="text-[10px] font-medium cursor-pointer hover:underline"
                          style={{ color: "var(--theme-text-muted)" }}
                          onClick={() => {
                            setDismissedKeys((prev) => {
                              const next = new Set(prev);
                              next.delete(item.dismissKey!);
                              return next;
                            });
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    )}
    </>
  );
}