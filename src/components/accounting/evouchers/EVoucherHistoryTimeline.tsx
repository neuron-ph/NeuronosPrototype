import { useState, useEffect } from "react";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  Send,
  Ban,
  MessageSquare,
} from "lucide-react";

interface HistoryEntry {
  id: string;
  evoucher_id: string;
  action: string;
  status?: string;
  previous_status?: string;
  new_status?: string;
  performed_by?: string;
  performed_by_name?: string;
  performed_by_role?: string;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  notes?: string;
  remarks?: string;
  metadata?: {
    previous_status?: string;
    new_status?: string;
    notes?: string;
    disbursement_method?: string;
    disbursement_reference?: string;
    disbursement_source?: string;
    disbursement_date?: string;
  };
  created_at: string;
}

interface EVoucherHistoryTimelineProps {
  evoucherId: string;
  /** NEU-097: when a user is provided, a comment box is shown. Comments can be
   *  posted at ANY stage (including after closure) and never change status. */
  currentUser?: { id: string; name?: string | null; department?: string | null; role?: string | null } | null;
  currentStatus?: string;
}

export function EVoucherHistoryTimeline({
  evoucherId,
  currentUser,
  currentStatus,
}: EVoucherHistoryTimelineProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [evoucherId]);

  // NEU-097: post a standalone comment — a history row with no status change.
  const handleAddComment = async () => {
    if (!comment.trim() || !currentUser) return;
    setPosting(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from("evoucher_history").insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucherId,
        action: "Comment",
        status: currentStatus ?? null,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.department,
        remarks: comment.trim(),
        metadata: { note: comment.trim() },
        created_at: now,
      });
      if (error) throw error;
      setComment("");
      await fetchHistory();
    } catch (err) {
      console.error("[comment] failed:", err);
      toast.error("Couldn't post the comment");
    } finally {
      setPosting(false);
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("evoucher_history")
        .select("*")
        .eq("evoucher_id", evoucherId)
        .order("created_at", { ascending: false });

      if (!error) {
        setHistory((data || []) as HistoryEntry[]);
      }
    } catch {
      // silently fail — history is non-critical
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    const actionLower = action.toLowerCase();

    if (actionLower === "comment") return MessageSquare;
    if (actionLower.includes("created")) return FileText;
    if (actionLower.includes("submitted")) return Send;
    if (actionLower.includes("approved")) return CheckCircle;
    if (actionLower.includes("rejected") || actionLower.includes("sent back")) return XCircle;
    if (actionLower.includes("cancelled")) return Ban;

    return Clock;
  };

  const getActionColor = (action: string) => {
    const actionLower = action.toLowerCase();

    if (actionLower.includes("created")) return "var(--theme-text-muted)";
    if (actionLower.includes("submitted")) {
      return "var(--theme-status-warning-fg)";
    }
    if (actionLower === "comment") return "var(--theme-action-primary-bg)";
    if (actionLower.includes("approved") || actionLower.includes("posted")) {
      return "var(--theme-status-success-fg)";
    }
    if (actionLower.includes("rejected") || actionLower.includes("sent back")) return "var(--theme-status-danger-fg)";
    if (actionLower.includes("cancelled")) return "var(--theme-text-muted)";

    return "var(--theme-text-muted)";
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          color: "var(--theme-text-muted)",
        }}
      >
        <Loader2 size={16} className="animate-spin" style={{ marginRight: "8px" }} />
        Loading history...
      </div>
    );
  }

  // NEU-097: comment composer — always available when a user is provided, at any
  // stage (including post-closure).
  const commentBox = currentUser ? (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment… (visible to everyone on this voucher)"
        rows={2}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: "8px",
          border: "1px solid var(--theme-border-default)", fontSize: "13px",
          fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box",
          backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleAddComment}
          disabled={posting || !comment.trim()}
          style={{
            height: "32px", padding: "0 14px", borderRadius: "6px", border: "none",
            backgroundColor: "var(--theme-action-primary-bg)", color: "#fff",
            fontSize: "12px", fontWeight: 600,
            cursor: posting || !comment.trim() ? "not-allowed" : "pointer",
            opacity: !comment.trim() ? 0.5 : 1,
            display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          {posting ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
          Comment
        </button>
      </div>
    </div>
  ) : null;

  const sectionHeader = (
    <div
      style={{
        fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--theme-text-muted)", marginBottom: "16px",
      }}
    >
      Comments &amp; History
    </div>
  );

  if (history.length === 0) {
    return (
      <div style={{ padding: "20px" }}>
        {sectionHeader}
        {commentBox}
        <div style={{ textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px", padding: "8px" }}>
          No activity yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      {sectionHeader}
      {commentBox}

      <div style={{ position: "relative" }}>
        {/* Subtle vertical line */}
        <div
          style={{
            position: "absolute",
            left: "6px",
            top: "10px",
            bottom: "10px",
            width: "1px",
            backgroundColor: "var(--theme-border-default)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {history.map((entry) => {
            const ActionIcon = getActionIcon(entry.action);
            const actionColor = getActionColor(entry.action);
            const previousStatus =
              entry.previous_status ?? entry.metadata?.previous_status;
            const nextStatus =
              entry.new_status ?? entry.metadata?.new_status ?? entry.status;
            const performedByName =
              entry.performed_by_name ??
              entry.user_name ??
              entry.performed_by ??
              entry.user_id ??
              "Unknown User";
            const performedByRole =
              entry.performed_by_role ?? entry.user_role ?? "";
            const entryNotes =
              entry.notes ?? entry.remarks ?? entry.metadata?.notes;

            return (
              <div
                key={entry.id}
                style={{ position: "relative", paddingLeft: "24px" }}
              >
                {/* Small dot node */}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    top: "4px",
                    width: "13px",
                    height: "13px",
                    borderRadius: "50%",
                    backgroundColor: "var(--theme-bg-page, var(--theme-bg-surface))",
                    border: `1px solid ${actionColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1,
                  }}
                >
                  <ActionIcon size={8} style={{ color: actionColor }} />
                </div>

                {/* Content — no card, just structured text */}
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--theme-text-secondary)",
                      marginBottom: "3px",
                      lineHeight: 1.4,
                    }}
                  >
                    {entry.action}
                  </div>

                  {previousStatus && nextStatus && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--theme-text-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ textTransform: "capitalize" }}>
                        {previousStatus.replace(/_/g, " ")}
                      </span>
                      <span style={{ margin: "0 5px", opacity: 0.4 }}>→</span>
                      <span
                        style={{
                          color: actionColor,
                          textTransform: "capitalize",
                          fontWeight: 500,
                        }}
                      >
                        {nextStatus.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--theme-text-muted)",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                      {performedByName}
                    </span>
                    {performedByRole && (
                      <span> · {performedByRole}</span>
                    )}
                    <span>
                      {" "}· {new Date(entry.created_at).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {entryNotes && (
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "12px",
                        color: "var(--theme-text-muted)",
                        fontStyle: "italic",
                        lineHeight: 1.5,
                      }}
                    >
                      "{entryNotes}"
                    </div>
                  )}

                  {/* Disbursement metadata — shown when action contains "Disbursed" */}
                  {entry.action.toLowerCase().includes("disbursed") && entry.metadata?.disbursement_source && (
                    <div style={{
                      marginTop: "6px",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      backgroundColor: "var(--theme-bg-surface-subtle)",
                      border: "1px solid var(--theme-border-default)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                    }}>
                      {entry.metadata.disbursement_method && (
                        <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>
                          <strong style={{ color: "var(--theme-text-secondary)" }}>{entry.metadata.disbursement_method}</strong>
                          {entry.metadata.disbursement_reference && ` · ${entry.metadata.disbursement_reference}`}
                        </span>
                      )}
                      <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>
                        From: <strong style={{ color: "var(--theme-text-secondary)" }}>{entry.metadata.disbursement_source}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
