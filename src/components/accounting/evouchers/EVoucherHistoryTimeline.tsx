import { useState, useEffect } from "react";
import { apiFetch } from "../../../utils/api";
import { Clock, User, CheckCircle, XCircle, FileText, Send, Ban } from "lucide-react";

interface HistoryEntry {
  id: string;
  evoucher_id: string;
  action: string;
  previous_status?: string;
  new_status?: string;
  performed_by: string;
  performed_by_name: string;
  performed_by_role: string;
  notes?: string;
  created_at: string;
}

interface EVoucherHistoryTimelineProps {
  evoucherId: string;
}

export function EVoucherHistoryTimeline({ evoucherId }: EVoucherHistoryTimelineProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [evoucherId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/evouchers/${evoucherId}/history`);
      const result = await response.json();

      if (result.success) {
        setHistory(result.data);
      } else {
        console.error("Error fetching history:", result.error);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes("created")) return FileText;
    if (actionLower.includes("submitted")) return Send;
    if (actionLower.includes("approved")) return CheckCircle;
    if (actionLower.includes("rejected")) return XCircle;
    if (actionLower.includes("cancelled")) return Ban;
    
    return Clock;
  };

  const getActionColor = (action: string) => {
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes("created")) return "#6B7280";
    if (actionLower.includes("submitted")) return "#F59E0B";
    if (actionLower.includes("approved") || actionLower.includes("posted")) return "#059669";
    if (actionLower.includes("rejected")) return "#EF4444";
    if (actionLower.includes("cancelled")) return "#9CA3AF";
    
    return "#6B7280";
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          color: "#6B7280"
        }}
      >
        <Clock size={20} className="animate-spin" style={{ marginRight: "8px" }} />
        Loading history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#6B7280",
          fontSize: "14px"
        }}
      >
        No history available
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "#12332B",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <Clock size={18} />
        Workflow History
      </h3>

      <div style={{ position: "relative" }}>
        {/* Vertical Line */}
        <div
          style={{
            position: "absolute",
            left: "19px",
            top: "12px",
            bottom: "12px",
            width: "2px",
            backgroundColor: "#E5E7EB"
          }}
        />

        {/* Timeline Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {history.map((entry, index) => {
            const ActionIcon = getActionIcon(entry.action);
            const actionColor = getActionColor(entry.action);
            const isLast = index === history.length - 1;

            return (
              <div
                key={entry.id}
                style={{
                  position: "relative",
                  paddingLeft: "48px",
                  paddingBottom: isLast ? "0" : "8px"
                }}
              >
                {/* Icon Circle */}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    top: "0",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "#FFFFFF",
                    border: `2px solid ${actionColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1
                  }}
                >
                  <ActionIcon size={18} style={{ color: actionColor }} />
                </div>

                {/* Content */}
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: isLast ? "#F9FAFB" : "#FFFFFF",
                    border: `1px solid ${isLast ? actionColor + "40" : "var(--neuron-ui-border)"}`,
                    borderRadius: "12px"
                  }}
                >
                  {/* Action Title */}
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "4px"
                    }}
                  >
                    {entry.action}
                  </div>

                  {/* Status Change */}
                  {entry.previous_status && entry.new_status && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#6B7280",
                        marginBottom: "8px"
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: "#F3F4F6",
                          fontSize: "12px",
                          textTransform: "capitalize"
                        }}
                      >
                        {entry.previous_status}
                      </span>
                      <span style={{ margin: "0 8px" }}>→</span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: actionColor + "20",
                          color: actionColor,
                          fontSize: "12px",
                          fontWeight: 500,
                          textTransform: "capitalize"
                        }}
                      >
                        {entry.new_status}
                      </span>
                    </div>
                  )}

                  {/* User Info */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      color: "#6B7280",
                      marginBottom: entry.notes ? "8px" : "0"
                    }}
                  >
                    <User size={14} />
                    <span>
                      <strong style={{ color: "#374151" }}>{entry.performed_by_name}</strong>
                      {entry.performed_by_role && (
                        <span style={{ color: "#9CA3AF" }}> • {entry.performed_by_role}</span>
                      )}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#9CA3AF",
                      marginBottom: entry.notes ? "8px" : "0"
                    }}
                  >
                    {new Date(entry.created_at).toLocaleString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>

                  {/* Notes */}
                  {entry.notes && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "12px",
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E5E7EB",
                        borderRadius: "8px",
                        fontSize: "13px",
                        color: "#374151",
                        fontStyle: "italic"
                      }}
                    >
                      "{entry.notes}"
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