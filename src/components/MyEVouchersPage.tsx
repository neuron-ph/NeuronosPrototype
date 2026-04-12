import { useState } from "react";
import { Plus, FileText, Clock, CheckCircle, ClipboardList } from "lucide-react";
import { useUser } from "../hooks/useUser";
import { useEVouchers } from "../hooks/useEVouchers";
import { DataTable, type ColumnDef } from "./common/DataTable";
import { EVoucherStatusBadge } from "./accounting/evouchers/EVoucherStatusBadge";
import { AddRequestForPaymentPanel } from "./accounting/AddRequestForPaymentPanel";
import { EVoucherDetailView } from "./accounting/EVoucherDetailView";
import type { EVoucher } from "../types/evoucher";

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  cash_advance: "Cash Advance",
  reimbursement: "Reimbursement",
  budget_request: "Budget Request",
  direct_expense: "Direct Expense",
};

export function MyEVouchersPage() {
  const { user } = useUser();
  const { evouchers, isLoading, refresh } = useEVouchers("my-evouchers", user?.id);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [selectedEV, setSelectedEV] = useState<EVoucher | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "completed">("all");

  const filteredEVouchers = evouchers.filter((ev) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "active") {
      return !["posted", "cancelled", "rejected"].includes(ev.status?.toLowerCase?.() ?? ev.status);
    }
    if (filterStatus === "completed") {
      return ["posted"].includes(ev.status?.toLowerCase?.() ?? ev.status);
    }
    return true;
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  const columns: ColumnDef<EVoucher>[] = [
    {
      header: "Ref No.",
      accessorKey: "voucher_number",
      cell: (ev) => (
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-action-primary-bg)", cursor: "pointer" }}>
          {ev.voucher_number}
        </span>
      ),
    },
    {
      header: "Type",
      accessorKey: "transaction_type",
      cell: (ev) => (
        <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
          {TRANSACTION_TYPE_LABELS[ev.transaction_type ?? ""] ?? ev.transaction_type}
        </span>
      ),
    },
    {
      header: "Purpose",
      accessorKey: "purpose",
      cell: (ev) => (
        <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)", maxWidth: "240px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ev.purpose || ev.description || "—"}
        </span>
      ),
    },
    {
      header: "Amount",
      accessorKey: "amount",
      align: "right",
      cell: (ev) => (
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
          {fmt(ev.amount)}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (ev) => <EVoucherStatusBadge status={ev.status} size="sm" />,
    },
    {
      header: "Created",
      accessorKey: "created_at",
      cell: (ev) => (
        <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
          {new Date(ev.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    },
    {
      header: "",
      cell: (ev) => {
        const status = ev.status?.toLowerCase?.() ?? ev.status;
        const needsLiquidation = (status === "disbursed" || status === "pending_liquidation") &&
          ev.transaction_type !== "reimbursement";
        if (!needsLiquidation) return null;
        return (
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--theme-action-primary-bg)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Submit liquidation receipts"
          >
            <ClipboardList size={14} />
            Liquidate
          </span>
        );
      },
    },
  ];

  // Summary counts
  const draftCount = evouchers.filter((ev) => ev.status === "draft").length;
  const pendingCount = evouchers.filter((ev) =>
    ["pending_manager", "pending_ceo", "pending_accounting"].includes(ev.status)
  ).length;
  const activeCount = evouchers.filter((ev) =>
    ["disbursed", "pending_liquidation", "pending_verification"].includes(ev.status)
  ).length;
  const completedCount = evouchers.filter((ev) => ev.status === "posted").length;

  return (
    <div style={{ padding: "32px 48px", maxWidth: "1280px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px" }}>
            My E-Vouchers
          </h1>
          <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
            Track all your expense requests, reimbursements, and direct expenses
          </p>
        </div>
        <button
          onClick={() => setShowCreatePanel(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "var(--theme-action-primary-bg)",
            color: "#FFFFFF",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
          New Request
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Drafts", count: draftCount, icon: FileText, color: "var(--theme-text-muted)" },
          { label: "Pending Approval", count: pendingCount, icon: Clock, color: "var(--theme-status-warning-fg)" },
          { label: "In Progress", count: activeCount, icon: ClipboardList, color: "var(--theme-action-primary-bg)" },
          { label: "Completed", count: completedCount, icon: CheckCircle, color: "var(--theme-status-success-fg)" },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <card.icon size={16} style={{ color: card.color }} />
              <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>{card.label}</span>
            </div>
            <span style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)" }}>{card.count}</span>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {(["all", "active", "completed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterStatus(tab)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              fontSize: "13px",
              fontWeight: filterStatus === tab ? 500 : 400,
              backgroundColor: filterStatus === tab ? "var(--theme-bg-surface-tint)" : "transparent",
              color: filterStatus === tab ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
              cursor: "pointer",
            }}
          >
            {tab === "all" ? "All" : tab === "active" ? "Active" : "Completed"}
          </button>
        ))}
      </div>

      {/* Table */}
      <DataTable
        data={filteredEVouchers}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(ev) => setSelectedEV(ev)}
        emptyMessage="No E-Vouchers yet. Click 'New Request' to create one."
      />

      {/* Create Panel */}
      {showCreatePanel && (
        <AddRequestForPaymentPanel
          isOpen={showCreatePanel}
          onClose={() => setShowCreatePanel(false)}
          context="personal"
          onSuccess={() => {
            setShowCreatePanel(false);
            refresh();
          }}
        />
      )}

      {/* Detail View (Side Panel quick view) */}
      {selectedEV && (
        <EVoucherDetailView
          evoucher={selectedEV}
          onClose={() => setSelectedEV(null)}
          currentUser={user ? { id: user.id, name: user.name, email: user.email || "", role: user.role, department: user.department } : undefined}
          onStatusChange={() => {
            setSelectedEV(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
