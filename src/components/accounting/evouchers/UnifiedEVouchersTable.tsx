import { useState, useMemo } from "react";
import { Search, FileText } from "lucide-react";
import { DataTable, ColumnDef } from "../../common/DataTable";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { EVoucherStatusBadge } from "./EVoucherStatusBadge";
import { LiquidationPanel } from "./LiquidationPanel";
import type { EVoucher, EVoucherTransactionType } from "../../../types/evoucher";

interface UnifiedEVouchersTableProps {
  evouchers: EVoucher[];
  view: "pending" | "my-evouchers" | "all";
  onViewDetail: (evoucher: EVoucher) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  showDaysOutstanding?: boolean;
}

export function UnifiedEVouchersTable({
  evouchers,
  view,
  onViewDetail,
  onRefresh,
  isLoading,
  showDaysOutstanding = false,
}: UnifiedEVouchersTableProps) {
  // -- State --
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [liquidationVoucher, setLiquidationVoucher] = useState<EVoucher | null>(null);

  // -- Helpers --
  const formatCurrency = (amount: number, currency: string = "PHP") => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const getTypeConfig = (type: EVoucherTransactionType | undefined): { label: string; style: React.CSSProperties } => {
    switch (type) {
      case "expense":
        return { label: "Expense", style: { background: "var(--neuron-semantic-info-bg)", color: "var(--neuron-semantic-info)" } };
      case "budget_request":
        return { label: "Budget Request", style: { background: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" } };
      case "cash_advance":
        return { label: "Cash Advance", style: { background: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" } };
      case "reimbursement":
        return { label: "Reimbursement", style: { background: "var(--neuron-status-accent-bg)", color: "var(--neuron-status-accent-fg)" } };
      default:
        return { label: "Expense", style: { background: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-secondary)" } };
    }
  };

  // -- Filtering Logic --
  const filteredEvouchers = useMemo(() => {
    return evouchers.filter(item => {
      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchVoucher = item.voucher_number?.toLowerCase().includes(query);
        const matchRequestor = item.requestor_name?.toLowerCase().includes(query);
        const matchVendor = item.vendor_name?.toLowerCase().includes(query);
        const matchPurpose = item.purpose?.toLowerCase().includes(query);
        if (!matchVoucher && !matchRequestor && !matchVendor && !matchPurpose) return false;
      }

      // 2. Status Filter (Only for My/All views, Pending is already filtered by API)
      if (view !== "pending" && statusFilter && statusFilter !== "all") {
        if (item.status !== statusFilter) return false;
      }

      // 3. Department Filter (Only for Pending/All views)
      if (view !== "my-evouchers" && departmentFilter && departmentFilter !== "all") {
        if (item.requestor_department !== departmentFilter) return false;
      }

      // 4. Date Range (Request Date)
      if (dateFrom) {
        const itemDate = new Date(item.request_date);
        const fromDate = new Date(dateFrom);
        if (itemDate < fromDate) return false;
      }
      if (dateTo) {
        const itemDate = new Date(item.request_date);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }

      return true;
    });
  }, [evouchers, searchQuery, statusFilter, departmentFilter, dateFrom, dateTo, view]);

  // -- Totals --
  const totalAmount = useMemo(() => {
    return filteredEvouchers.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [filteredEvouchers]);

  const getUrgencyColor = (dateString: string) => {
    const submitted = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - submitted.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 3) return "text-[var(--theme-status-danger-fg)]";
    if (diffDays >= 2) return "text-[var(--theme-status-warning-fg)]";
    return "text-[var(--theme-text-primary)]";
  };

  // -- Columns --
  const columns: ColumnDef<EVoucher>[] = [
    {
      header: "Date",
      width: "120px",
      cell: (item) => {
        const isPending = item.status === 'pending';
        const colorClass = isPending ? getUrgencyColor(item.request_date) : "text-[var(--theme-text-primary)]";
        
        return (
            <span className={`text-[12px] font-medium ${colorClass}`}>
            {formatDate(item.request_date)}
            </span>
        )
      }
    },
    {
      header: "Voucher #",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] font-mono text-[var(--theme-action-primary-bg)] font-medium group-hover:underline decoration-[var(--theme-action-primary-bg)] underline-offset-2">
          {item.voucher_number || "—"}
        </span>
      )
    },
    {
      header: "Type",
      width: "130px",
      cell: (item) => {
        const { label, style } = getTypeConfig(item.transaction_type);
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium" style={style}>
            {label}
          </span>
        );
      }
    },
    {
      header: "Requestor",
      cell: (item) => (
        <div>
            <div className="text-[12px] font-medium text-[var(--theme-text-primary)]">{item.requestor_name}</div>
            {item.requestor_department && (
                <div className="text-[10px] text-[var(--theme-text-muted)]">{item.requestor_department}</div>
            )}
        </div>
      )
    },
    {
      header: "Vendor / Payee",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-secondary)] font-medium truncate block max-w-[180px]">
          {item.vendor_name || "—"}
        </span>
      )
    },
    {
      header: "Linked To",
      cell: (item) => (
        <span className={`text-[12px] font-medium truncate block max-w-[150px] ${(item.project_number || item.customer_name) ? "text-[var(--theme-action-primary-bg)]" : "text-[var(--theme-text-muted)]"}`}>
          {item.project_number || item.customer_name || "—"}
        </span>
      )
    },
    ...(showDaysOutstanding ? [{
      header: "Days Outstanding",
      width: "120px",
      align: "right" as const,
      cell: (item: EVoucher) => {
        const disbDate = item.disbursement_date;
        if (!disbDate) return <span className="text-[12px] text-[var(--theme-text-muted)]">—</span>;
        const days = Math.floor((Date.now() - new Date(disbDate).getTime()) / 86_400_000);
        const color = days >= 14
          ? "var(--theme-status-danger-fg)"
          : days >= 7
          ? "var(--theme-status-warning-fg)"
          : "var(--theme-text-secondary)";
        return (
          <span style={{ fontSize: "12px", fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>
            {days}d
          </span>
        );
      }
    }] : []),
    {
      header: "Amount",
      width: "120px",
      align: "right",
      cell: (item) => (
        <span className="text-[12px] font-bold text-[var(--theme-text-primary)]">
          {formatCurrency(item.amount, item.currency)}
        </span>
      )
    },
    {
      header: "Status",
      width: "120px",
      align: "right",
      cell: (item) => (
        <div className="flex flex-col items-end gap-2">
            <EVoucherStatusBadge status={item.status} size="sm" />
            
            {/* Liquidation Action for Posted Budget Requests & Cash Advances */}
            {view === "my-evouchers" && item.status === "posted" && (item.transaction_type === "budget_request" || item.transaction_type === "cash_advance") && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setLiquidationVoucher(item);
                    }}
                    className="text-[10px] font-semibold text-[var(--theme-action-primary-bg)] hover:text-[var(--theme-action-primary-border)] bg-[var(--theme-bg-surface-tint)] hover:bg-[var(--theme-status-success-bg)] px-2 py-1 rounded transition-colors flex items-center gap-1"
                >
                    <FileText size={10} />
                    Liquidate
                </button>
            )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)]">
      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder="Search voucher #, requestor, vendor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] text-[13px] border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
          />
        </div>

        {/* Date Range */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        <span className="text-[13px] text-[var(--theme-text-muted)] font-medium">to</span>
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        
        {/* Status Filter (Hide on Pending view) */}
        {view !== "pending" && (
            <div style={{ minWidth: "140px" }}>
            <CustomDropdown
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                { value: "all", label: "All Status" },
                { value: "draft", label: "Draft" },
                { value: "pending", label: "Pending" },
                { value: "posted", label: "Posted" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" }
                ]}
                placeholder="Status"
            />
            </div>
        )}

        {/* Department Filter (Hide on My view) */}
        {view !== "my-evouchers" && (
            <div style={{ minWidth: "160px" }}>
            <CustomDropdown
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={[
                { value: "all", label: "All Departments" },
                { value: "BD", label: "Business Development" },
                { value: "Operations", label: "Operations" },
                { value: "Accounting", label: "Accounting" },
                { value: "HR", label: "HR" },
                { value: "IT", label: "IT" },
                { value: "Admin", label: "Admin" },
                { value: "Executive", label: "Executive" }
                ]}
                placeholder="Department"
            />
            </div>
        )}
      </div>

      {/* Table */}
      <DataTable
        data={filteredEvouchers}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No E-Vouchers found matching your filters."
        onRowClick={onViewDetail}
        rowClassName={() => "group cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)] align-top"}
        footerSummary={[
          { 
             label: "Total Count", 
             value: <span className="text-[var(--theme-text-secondary)]">{filteredEvouchers.length}</span> 
          },
          { 
             label: "Total Amount", 
             value: <span className="text-[var(--theme-text-primary)] font-bold">{formatCurrency(totalAmount)}</span>
          }
        ]}
      />

      {/* Liquidation Panel */}
      {liquidationVoucher && (
        <LiquidationPanel
          isOpen={!!liquidationVoucher}
          onClose={() => setLiquidationVoucher(null)}
          originalVoucher={liquidationVoucher}
          onSuccess={() => {
            if (onRefresh) onRefresh();
            setLiquidationVoucher(null);
          }}
        />
      )}
    </div>
  );
}
