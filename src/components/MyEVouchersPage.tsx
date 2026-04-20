import { useState, useCallback, useMemo } from "react";
import { usePermission } from "../context/PermissionProvider";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, CheckCircle, ClipboardList,
  ChevronRight, Loader2, Search,
  FileText, CircleDot, User,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../hooks/useUser";
import { useEVouchers } from "../hooks/useEVouchers";
import { canPerformEVAction } from "../utils/permissions";
import { queryKeys } from "../lib/queryKeys";
import { approveEVInline } from "../utils/evoucherApproval";
import { toast } from "sonner@2.0.3";
import { DataTable, type ColumnDef } from "./common/DataTable";
import { EVoucherStatusBadge } from "./accounting/evouchers/EVoucherStatusBadge";
import { EVoucherDetailView } from "./accounting/EVoucherDetailView";
import { AddRequestForPaymentPanel } from "./accounting/AddRequestForPaymentPanel";
import { CustomDropdown } from "./bd/CustomDropdown";
import { CustomDatePicker } from "./common/CustomDatePicker";
import type { EVoucher } from "../types/evoucher";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  cash_advance: "Cash Advance",
  reimbursement: "Reimbursement",
  budget_request: "Budget Request",
  direct_expense: "Direct Expense",
};

const STATUS_GROUPS = {
  draft: ["draft"],
  pending: ["pending_manager", "pending_ceo", "pending_accounting"],
  active: ["disbursed", "pending_liquidation", "pending_verification"],
  done: ["posted", "cancelled", "rejected"],
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

type ActiveTab = "all" | "draft" | "pending" | "active" | "done";

const EASE_OUT_QUART = [0.16, 1, 0.3, 1] as const;

// ─── Inline approval handler ──────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

export function MyEVouchersPage() {
  const { can } = usePermission();

  const canAllTab     = can("my_evouchers_all_tab", "view");
  const canDraftTab   = can("my_evouchers_draft_tab", "view");
  const canPendingTab = can("my_evouchers_pending_tab", "view");
  const canActiveTab  = can("my_evouchers_active_tab", "view");
  const canDoneTab    = can("my_evouchers_done_tab", "view");

  const defaultEVTab: ActiveTab =
    canAllTab     ? "all" :
    canDraftTab   ? "draft" :
    canPendingTab ? "pending" :
    canActiveTab  ? "active" :
    canDoneTab    ? "done" :
    "all";

  const { user, effectiveDepartment, effectiveRole } = useUser();
  const queryClient = useQueryClient();

  // ── Role capabilities ───────────────────────────────────────────────────
  const isExecutive = effectiveDepartment === "Executive";
  const canApproveMgrGate = canPerformEVAction("approve_tl", effectiveRole, effectiveDepartment);
  const showApprovalQueue = canApproveMgrGate || isExecutive;
  const showScopeFilter = canApproveMgrGate || isExecutive;

  // ── UI state ────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<"mine" | "dept">("mine");
  const [activeTab, setActiveTab] = useState<ActiveTab>(defaultEVTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEV, setSelectedEV] = useState<EVoucher | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────
  const { evouchers: myEVs, isLoading: myLoading } = useEVouchers(
    "my-evouchers",
    user?.id,
  );

  const approvalView = isExecutive ? "pending-ceo" : "dept-pending-manager";
  const { evouchers: pendingApprovals, isLoading: approvalLoading } = useEVouchers(
    approvalView,
    user?.id,
    isExecutive ? undefined : effectiveDepartment,
  );

  const deptView = isExecutive ? "all" : "dept-all";
  const { evouchers: deptEVs, isLoading: deptLoading } = useEVouchers(
    deptView,
    user?.id,
    isExecutive ? undefined : effectiveDepartment,
  );

  // ── Derived data ────────────────────────────────────────────────────────
  const tableSource = scope === "mine" ? myEVs : deptEVs;
  const tableLoading = scope === "mine" ? myLoading : deptLoading;

  // Pre-tab filtered data (search + date + type)
  const preTabFiltered = useMemo(() => {
    return tableSource.filter((ev) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          (ev.voucher_number ?? "").toLowerCase().includes(q) ||
          (ev.purpose ?? "").toLowerCase().includes(q) ||
          (ev.description ?? "").toLowerCase().includes(q) ||
          (ev.requestor_name ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (dateFrom) {
        if (new Date(ev.created_at) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(ev.created_at) > end) return false;
      }
      if (typeFilter !== "all" && ev.transaction_type !== typeFilter) return false;
      return true;
    });
  }, [tableSource, searchQuery, dateFrom, dateTo, typeFilter]);

  // Tab counts (from pre-tab filtered)
  const tabCounts = useMemo(() => ({
    all: preTabFiltered.length,
    draft: preTabFiltered.filter((ev) => ev.status === "draft").length,
    pending: preTabFiltered.filter((ev) => STATUS_GROUPS.pending.includes(ev.status)).length,
    active: preTabFiltered.filter((ev) => STATUS_GROUPS.active.includes(ev.status)).length,
    done: preTabFiltered.filter((ev) => STATUS_GROUPS.done.includes(ev.status)).length,
  }), [preTabFiltered]);

  // Final filtered EVs
  const filteredEVs = useMemo(() => {
    if (activeTab === "all") return preTabFiltered;
    const allowed = STATUS_GROUPS[activeTab] ?? [];
    return preTabFiltered.filter((ev) =>
      allowed.includes((ev.status ?? "").toLowerCase()),
    );
  }, [preTabFiltered, activeTab]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.evouchers.all() });
  }, [queryClient]);

  const handleInlineApprove = useCallback(async (ev: EVoucher) => {
    setApprovingId(ev.id);
    try {
      const result = await approveEVInline(ev, isExecutive, user?.id, user?.name, effectiveDepartment);
      const dest = isExecutive ? "Accounting" : "CEO";
      toast.success(`${ev.voucher_number} approved — forwarded to ${dest}`);
      if (result.billingError) {
        toast.warning(`Approved, but automatic booking billing could not be created. ${result.billingError}`);
      }
      refreshAll();
    } catch {
      toast.error("Approval failed — use the detail panel to retry");
    } finally {
      setApprovingId(null);
    }
  }, [isExecutive, user, effectiveDepartment, refreshAll]);

  // ── Table columns ───────────────────────────────────────────────────────
  const columns = useMemo((): ColumnDef<EVoucher>[] => {
    const showRequestor = scope === "dept";
    return [
      {
        header: "Ref No.",
        accessorKey: "voucher_number",
        cell: (ev) => (
          <span style={{
            fontSize: "13px", fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {ev.voucher_number}
          </span>
        ),
      },
      {
        header: "Type",
        accessorKey: "transaction_type",
        cell: (ev) => (
          <span style={{
            fontSize: "11px", fontWeight: 500,
            color: "var(--theme-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {TYPE_LABELS[ev.transaction_type ?? ""] ?? ev.transaction_type ?? "—"}
          </span>
        ),
      },
      {
        header: "Purpose",
        accessorKey: "purpose",
        cell: (ev) => (
          <span style={{
            fontSize: "13px", color: "var(--theme-text-secondary)",
            maxWidth: "220px", display: "block",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {ev.purpose || ev.description || "—"}
          </span>
        ),
      },
      ...(showRequestor ? [{
        header: "Requestor",
        accessorKey: "requestor_name" as keyof EVoucher,
        cell: (ev: EVoucher) => (
          <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
            {ev.requestor_name || "—"}
          </span>
        ),
      }] : []),
      {
        header: "Amount",
        accessorKey: "amount",
        align: "right" as const,
        cell: (ev) => (
          <span style={{
            fontSize: "13px", fontWeight: 700,
            color: "var(--theme-text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}>
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
        header: "Date",
        accessorKey: "created_at",
        cell: (ev) => (
          <span style={{
            fontSize: "12px", color: "var(--theme-text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {new Date(ev.created_at).toLocaleDateString("en-PH", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        ),
      },
      {
        header: "",
        cell: (ev) => {
          const status = (ev.status ?? "").toLowerCase();
          const needsLiquidation =
            (status === "disbursed" || status === "pending_liquidation") &&
            ev.transaction_type !== "reimbursement";
          if (!needsLiquidation) return null;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedEV(ev); }}
              style={{
                display: "flex", alignItems: "center", gap: "4px",
                fontSize: "12px", fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                background: "none", border: "none", cursor: "pointer",
                padding: "4px 8px", borderRadius: "4px",
              }}
            >
              <ClipboardList size={13} />
              Liquidate
            </button>
          );
        },
      },
    ];
  }, [scope]);

  // ── Copy ────────────────────────────────────────────────────────────────
  const subtitle = isExecutive
    ? "Company-wide approvals and your requests"
    : canApproveMgrGate
    ? "Your requests and department approvals"
    : "Track your expense requests, reimbursements, and cash advances";

  const deptScopeLabel = isExecutive
    ? "All EVs"
    : effectiveDepartment.split(" ")[0] + " Dept";

  const approvalHeading = isExecutive ? "Awaiting Your Approval" : "Needs Your Approval";

  // ── Tabs config ─────────────────────────────────────────────────────────
  const TABS: { key: ActiveTab; label: string; color: string; bgActive: string; bgInactive: string }[] = [
    {
      key: "all",
      label: "All EVs",
      color: "var(--theme-action-primary-bg)",
      bgActive: "var(--theme-action-primary-bg)",
      bgInactive: "rgba(15,118,110,0.08)",
    },
    {
      key: "draft",
      label: "Draft",
      color: "var(--theme-text-muted)",
      bgActive: "var(--theme-text-muted)",
      bgInactive: "var(--theme-bg-page)",
    },
    {
      key: "pending",
      label: "Pending",
      color: "var(--theme-status-warning-fg)",
      bgActive: "var(--theme-status-warning-fg)",
      bgInactive: "var(--theme-status-warning-bg)",
    },
    {
      key: "active",
      label: "Active",
      color: "var(--theme-action-primary-bg)",
      bgActive: "var(--theme-action-primary-bg)",
      bgInactive: "rgba(15,118,110,0.08)",
    },
    {
      key: "done",
      label: "Done",
      color: "var(--theme-status-success-fg)",
      bgActive: "var(--theme-status-success-fg)",
      bgInactive: "var(--theme-status-success-bg)",
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--theme-bg-surface)" }}>
      <div style={{ padding: "32px 48px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: EASE_OUT_QUART }}
          style={{
            display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", marginBottom: "32px",
          }}
        >
          <div>
            <h1 style={{
              fontSize: "32px", fontWeight: 600, letterSpacing: "-1.2px",
              color: "var(--theme-text-primary)", marginBottom: "4px",
            }}>
              E-Vouchers
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              {subtitle}
            </p>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 20px", borderRadius: "8px", border: "none",
              backgroundColor: "var(--theme-action-primary-bg)",
              color: "var(--theme-action-primary-text)", fontSize: "14px", fontWeight: 500,
              cursor: "pointer", letterSpacing: "0.01em",
              transition: "background-color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--theme-action-primary-border)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--theme-action-primary-bg)"; }}
          >
            <Plus size={16} />
            New Request
          </button>
        </motion.div>

        {/* ── Search Bar ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05, ease: EASE_OUT_QUART }}
          style={{ position: "relative", marginBottom: "12px" }}
        >
          <Search
            size={18}
            style={{
              position: "absolute", left: "12px", top: "50%",
              transform: "translateY(-50%)", color: "var(--theme-text-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Search by voucher number, purpose, or requestor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px 10px 40px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px", fontSize: "14px", outline: "none",
              color: "var(--theme-text-primary)",
              backgroundColor: "var(--theme-bg-surface)",
              boxSizing: "border-box",
            }}
          />
        </motion.div>

        {/* ── Filters Row ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.07, ease: EASE_OUT_QUART }}
          style={{
            display: "flex", gap: "4px",
            marginBottom: "16px", alignItems: "center", flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" />
          </div>
          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", fontWeight: 500, padding: "0 8px" }}>to</span>
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" />
          </div>

          <div style={{ minWidth: "160px" }}>
            <CustomDropdown
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "All Types", icon: <FileText size={16} /> },
                { value: "expense", label: "Expense", icon: <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> },
                { value: "cash_advance", label: "Cash Advance", icon: <FileText size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                { value: "reimbursement", label: "Reimbursement", icon: <FileText size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                { value: "budget_request", label: "Budget Request", icon: <FileText size={16} style={{ color: "var(--theme-text-muted)" }} /> },
                { value: "direct_expense", label: "Direct Expense", icon: <FileText size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> },
              ]}
              placeholder="All Types"
            />
          </div>

          {showScopeFilter && (
            <div style={{ minWidth: "140px" }}>
              <CustomDropdown
                value={scope}
                onChange={(v) => setScope(v as "mine" | "dept")}
                options={[
                  { value: "mine", label: "My EVs", icon: <User size={16} /> },
                  { value: "dept", label: deptScopeLabel, icon: <CircleDot size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> },
                ]}
                placeholder="My EVs"
              />
            </div>
          )}
        </motion.div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.09, ease: EASE_OUT_QUART }}
          style={{
            display: "flex", gap: "8px",
            borderBottom: "1px solid var(--theme-border-default)",
            marginBottom: "24px",
          }}
        >
          {TABS.filter(({ key }) => {
            if (key === "all")     return canAllTab;
            if (key === "draft")   return canDraftTab;
            if (key === "pending") return canPendingTab;
            if (key === "active")  return canActiveTab;
            if (key === "done")    return canDoneTab;
            return true;
          }).map(({ key, label, color, bgActive, bgInactive }) => {
            const isActive = activeTab === key;
            const count = tabCounts[key];
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "12px 20px", background: "transparent", border: "none",
                  borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                  color: isActive ? color : "var(--theme-text-muted)",
                  fontSize: "14px", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s ease", marginBottom: "-1px",
                }}
              >
                {label}
                <span style={{
                  padding: "2px 8px", borderRadius: "12px",
                  fontSize: "11px", fontWeight: 700,
                  background: isActive ? bgActive : bgInactive,
                  color: isActive ? "#FFFFFF" : color,
                  minWidth: "20px", textAlign: "center",
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* ── Approval Zone (TL / Manager / Executive only) ────────────────── */}
        <AnimatePresence>
        {showApprovalQueue && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE_OUT_QUART }}
            style={{
              backgroundColor: "var(--theme-status-success-bg)",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              marginBottom: "24px",
              overflow: "hidden",
            }}
          >
            <div style={{
              padding: "13px 20px",
              display: "flex", alignItems: "center", gap: "10px",
              borderBottom: pendingApprovals.length > 0 || approvalLoading
                ? "1px solid var(--theme-border-default)" : "none",
            }}>
              <span style={{
                fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--theme-text-primary)",
              }}>
                {approvalHeading}
              </span>
              {pendingApprovals.length > 0 && (
                <span style={{
                  fontSize: "11px", fontWeight: 700,
                  padding: "2px 8px", borderRadius: "10px",
                  backgroundColor: "var(--theme-action-primary-bg)",
                  color: "var(--theme-action-primary-text)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {pendingApprovals.length}
                </span>
              )}
            </div>

            {approvalLoading && (
              <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {[1, 2].map((i) => (
                  <div key={i} style={{
                    height: "44px", borderRadius: "8px",
                    backgroundColor: "var(--theme-border-default)", opacity: 0.35,
                  }} className="animate-pulse" />
                ))}
              </div>
            )}

            {!approvalLoading && pendingApprovals.length === 0 && (
              <div style={{
                padding: "13px 20px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <CheckCircle size={14} style={{ color: "var(--theme-status-success-fg)", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                  All clear — nothing pending your sign-off
                </span>
              </div>
            )}

            {!approvalLoading && pendingApprovals.length > 0 && pendingApprovals.map((ev, i) => (
              <div
                key={ev.id}
                style={{
                  display: "flex", alignItems: "center", gap: "16px",
                  padding: "12px 20px",
                  borderTop: i > 0 ? "1px solid var(--theme-border-default)" : "none",
                  cursor: "pointer", transition: "background-color 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                onClick={() => setSelectedEV(ev)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                    <span style={{
                      fontSize: "13px", fontWeight: 600,
                      color: "var(--theme-action-primary-bg)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {ev.voucher_number}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      {TYPE_LABELS[ev.transaction_type ?? ""] ?? ev.transaction_type}
                    </span>
                  </div>
                  <p style={{
                    fontSize: "12px", color: "var(--theme-text-muted)", margin: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {ev.requestor_name}
                    {ev.purpose || ev.description ? ` · ${ev.purpose || ev.description}` : ""}
                  </p>
                </div>

                <span style={{
                  fontSize: "14px", fontWeight: 700,
                  color: "var(--theme-text-primary)",
                  fontVariantNumeric: "tabular-nums", flexShrink: 0,
                }}>
                  {fmt(ev.amount)}
                </span>

                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleInlineApprove(ev)}
                    disabled={!!approvingId}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "6px 13px", borderRadius: "6px", border: "none",
                      backgroundColor: "var(--theme-status-success-fg)",
                      color: "var(--theme-action-primary-text)", fontSize: "12px", fontWeight: 500,
                      cursor: approvingId ? "not-allowed" : "pointer",
                      opacity: approvingId === ev.id ? 0.65 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {approvingId === ev.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <CheckCircle size={12} />}
                    Approve
                  </button>

                  <button
                    onClick={() => setSelectedEV(ev)}
                    style={{
                      display: "flex", alignItems: "center", gap: "3px",
                      padding: "6px 10px", borderRadius: "6px",
                      border: "1px solid var(--theme-border-default)",
                      backgroundColor: "transparent",
                      color: "var(--theme-text-muted)",
                      fontSize: "12px", fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Details
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
        </AnimatePresence>

        {/* ── Main Table ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.12, ease: EASE_OUT_QUART }}
        >
        <DataTable
          data={filteredEVs}
          columns={columns}
          isLoading={tableLoading}
          onRowClick={setSelectedEV}
          emptyMessage={
            searchQuery || typeFilter !== "all" || dateFrom || dateTo
              ? "No E-Vouchers match your filters."
              : activeTab !== "all"
              ? `No ${activeTab} E-Vouchers in this view.`
              : scope === "mine"
              ? "No expense requests yet. Click 'New Request' to create one."
              : "No E-Vouchers in this view."
          }
        />
        </motion.div>
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}

      {showCreate && (
        <AddRequestForPaymentPanel
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          context="personal"
          onSuccess={() => {
            setShowCreate(false);
            refreshAll();
          }}
        />
      )}

      {selectedEV && (
        <EVoucherDetailView
          evoucher={selectedEV}
          onClose={() => setSelectedEV(null)}
          currentUser={
            user
              ? {
                  id: user.id,
                  name: user.name,
                  email: user.email || "",
                  role: effectiveRole,
                  department: effectiveDepartment,
                }
              : undefined
          }
          onStatusChange={() => {
            setSelectedEV(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}
