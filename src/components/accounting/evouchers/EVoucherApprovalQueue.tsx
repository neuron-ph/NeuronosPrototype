import { useState } from "react";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import { useEVouchers } from "../../../hooks/useEVouchers";
import { EVoucherStatusBadge } from "./EVoucherStatusBadge";
import { EVoucherDetailView } from "../EVoucherDetailView";
import type { EVoucher } from "../../../types/evoucher";

interface EVoucherApprovalQueueProps {
  /** "pending-manager" for dept managers, "pending-ceo" for CEO */
  view: "pending-manager" | "pending-ceo";
  /** Current user for action permissions */
  currentUser?: { id: string; name: string; email?: string; role?: string; department?: string };
  /** Optional title override */
  title?: string;
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  cash_advance: "Cash Advance",
  reimbursement: "Reimbursement",
  budget_request: "Budget Request",
  direct_expense: "Direct Expense",
};

export function EVoucherApprovalQueue({ view, currentUser, title }: EVoucherApprovalQueueProps) {
  const { evouchers, isLoading, refresh } = useEVouchers(view);
  const [selectedEV, setSelectedEV] = useState<EVoucher | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  const defaultTitle = view === "pending-ceo" ? "E-Vouchers Pending Your Approval" : "E-Vouchers Pending Approval";
  const displayTitle = title ?? defaultTitle;

  if (isLoading) {
    return (
      <div style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
          {displayTitle}
        </h3>
        <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", textAlign: "center", padding: "32px" }}>
          Loading...
        </div>
      </div>
    );
  }

  if (evouchers.length === 0) {
    return (
      <div style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
          {displayTitle}
        </h3>
        <div style={{
          textAlign: "center",
          padding: "32px",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "12px",
          backgroundColor: "var(--theme-bg-surface)",
        }}>
          <CheckCircle size={32} style={{ color: "var(--theme-status-success-fg)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
            No E-Vouchers pending your approval
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
          {displayTitle}
          <span style={{
            marginLeft: "8px",
            fontSize: "12px",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "10px",
            backgroundColor: "var(--theme-status-warning-bg)",
            color: "var(--theme-status-warning-fg)",
          }}>
            {evouchers.length}
          </span>
        </h3>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {evouchers.map((ev) => (
          <button
            key={ev.id}
            onClick={() => setSelectedEV(ev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "14px 16px",
              borderRadius: "10px",
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-surface)",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-action-primary-bg)" }}>
                  {ev.voucher_number}
                </span>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                  {TRANSACTION_TYPE_LABELS[ev.transaction_type ?? ""] ?? ev.transaction_type}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--theme-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.purpose || ev.description || "—"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
                by {ev.requestor_name} · {new Date(ev.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px" }}>
                {fmt(ev.amount)}
              </div>
              <EVoucherStatusBadge status={ev.status} size="sm" />
            </div>
          </button>
        ))}
      </div>

      {selectedEV && (
        <EVoucherDetailView
          evoucher={selectedEV}
          onClose={() => setSelectedEV(null)}
          currentUser={currentUser ? { ...currentUser, email: currentUser.email ?? "" } : undefined}
          onStatusChange={() => {
            setSelectedEV(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
