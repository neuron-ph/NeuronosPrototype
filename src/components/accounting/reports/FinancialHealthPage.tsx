// FinancialHealthPage — Sales Report / Financial Health view for Essentials mode
// Shows per-project financial summary with billing, expenses, collections, and profit

import { useState, useMemo } from "react";
import { Search, TrendingUp, TrendingDown, DollarSign, Receipt, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useFinancialHealthReport, type ProjectFinancialRow } from "../../../hooks/useFinancialHealthReport";
import { DataTable, type ColumnDef } from "../../common/DataTable";

const formatCurrency = (amount: number, currency: string = "PHP") => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

function getMonthLabel(ym: string) {
  if (!ym) return "All Time";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FinancialHealthPage() {
  const [monthFilter, setMonthFilter] = useState(getCurrentMonth());
  const [searchQuery, setSearchQuery] = useState("");

  const { rows, summary, isLoading } = useFinancialHealthReport(monthFilter || undefined);

  // Apply search filter client-side
  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.projectNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.invoiceNumbers.some((n) => n.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  // Totals row for filtered data
  const filteredTotals = useMemo(() => {
    return {
      billingTotal: filteredRows.reduce((s, r) => s + r.billingTotal, 0),
      expensesTotal: filteredRows.reduce((s, r) => s + r.expensesTotal, 0),
      adminCost: filteredRows.reduce((s, r) => s + r.adminCost, 0),
      totalExpenses: filteredRows.reduce((s, r) => s + r.totalExpenses, 0),
      collectedAmount: filteredRows.reduce((s, r) => s + r.collectedAmount, 0),
      grossProfit: filteredRows.reduce((s, r) => s + r.grossProfit, 0),
    };
  }, [filteredRows]);

  // -- Table Columns --
  const columns: ColumnDef<ProjectFinancialRow>[] = [
    {
      header: "File Ref.",
      accessorKey: "projectNumber",
      width: "130px",
      cell: (row) => (
        <div>
          <div className="text-[13px] font-medium text-[var(--theme-text-primary)]">
            {row.projectNumber || "—"}
          </div>
          <div className="text-[11px] text-[var(--theme-text-muted)]">
            {formatDate(row.projectDate)}
          </div>
        </div>
      ),
    },
    {
      header: "Company",
      accessorKey: "customerName",
      width: "180px",
      cell: (row) => (
        <span className="text-[13px] text-[var(--theme-text-primary)] font-medium">
          {row.customerName}
        </span>
      ),
    },
    {
      header: "Invoice(s)",
      accessorKey: "invoiceNumbers" as any,
      width: "130px",
      cell: (row) => (
        <div className="text-[12px] text-[var(--theme-text-muted)]">
          {row.invoiceNumbers.length > 0
            ? row.invoiceNumbers.join(", ")
            : "—"}
        </div>
      ),
    },
    {
      header: "Billing Total",
      accessorKey: "billingTotal",
      width: "130px",
      cell: (row) => (
        <span className="text-[13px] font-medium text-[var(--theme-text-primary)] tabular-nums">
          {formatCurrency(row.billingTotal)}
        </span>
      ),
    },
    {
      header: "Expenses",
      accessorKey: "expensesTotal",
      width: "120px",
      cell: (row) => (
        <span className="text-[13px] text-[var(--theme-text-muted)] tabular-nums">
          {formatCurrency(row.expensesTotal)}
        </span>
      ),
    },
    {
      header: "Admin 3%",
      accessorKey: "adminCost",
      width: "100px",
      cell: (row) => (
        <span className="text-[13px] text-[var(--theme-text-muted)] tabular-nums">
          {formatCurrency(row.adminCost)}
        </span>
      ),
    },
    {
      header: "Total Expenses",
      accessorKey: "totalExpenses",
      width: "130px",
      cell: (row) => (
        <span className="text-[13px] font-medium text-[var(--theme-text-primary)] tabular-nums">
          {formatCurrency(row.totalExpenses)}
        </span>
      ),
    },
    {
      header: "Collected",
      accessorKey: "collectedAmount",
      width: "130px",
      cell: (row) => (
        <span className="text-[13px] font-medium text-[var(--theme-action-primary-bg)] tabular-nums">
          {formatCurrency(row.collectedAmount)}
        </span>
      ),
    },
    {
      header: "Gross Profit",
      accessorKey: "grossProfit",
      width: "130px",
      cell: (row) => (
        <span
          className="text-[13px] font-semibold tabular-nums"
          style={{ color: row.grossProfit >= 0 ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)" }}
        >
          {formatCurrency(row.grossProfit)}
        </span>
      ),
    },
  ];

  // Summary cards
  const summaryCards = [
    {
      label: "Total Billings",
      value: formatCurrency(summary.totalBillings),
      icon: DollarSign,
      color: "var(--theme-action-primary-bg)",
      bgColor: "var(--neuron-semantic-success-bg)",
    },
    {
      label: "Total Expenses",
      value: formatCurrency(summary.totalExpenses),
      icon: Receipt,
      color: "var(--theme-status-danger-fg)",
      bgColor: "var(--neuron-semantic-danger-bg)",
    },
    {
      label: "Collected",
      value: formatCurrency(summary.totalCollected),
      icon: TrendingUp,
      color: "var(--neuron-semantic-info)",
      bgColor: "var(--neuron-semantic-info-bg)",
    },
    {
      label: "Gross Profit",
      value: formatCurrency(summary.totalGrossProfit),
      icon: summary.totalGrossProfit >= 0 ? TrendingUp : TrendingDown,
      color: summary.totalGrossProfit >= 0 ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)",
      bgColor: summary.totalGrossProfit >= 0 ? "var(--neuron-semantic-success-bg)" : "var(--neuron-semantic-danger-bg)",
    },
  ];

  // Export to CSV
  const handleExport = () => {
    const headers = [
      "File Ref.", "Date", "Company", "Invoice(s)", "Billing Total",
      "Expenses", "Admin 3%", "Total Expenses", "Collected", "Gross Profit",
    ];
    const csvRows = filteredRows.map((r) => [
      r.projectNumber,
      formatDate(r.projectDate),
      r.customerName,
      r.invoiceNumbers.join("; "),
      r.billingTotal.toFixed(2),
      r.expensesTotal.toFixed(2),
      r.adminCost.toFixed(2),
      r.totalExpenses.toFixed(2),
      r.collectedAmount.toFixed(2),
      r.grossProfit.toFixed(2),
    ]);
    // Add totals row
    csvRows.push([
      "TOTALS", "", "", "",
      filteredTotals.billingTotal.toFixed(2),
      filteredTotals.expensesTotal.toFixed(2),
      filteredTotals.adminCost.toFixed(2),
      filteredTotals.totalExpenses.toFixed(2),
      filteredTotals.collectedAmount.toFixed(2),
      filteredTotals.grossProfit.toFixed(2),
    ]);

    const csv = [headers.join(","), ...csvRows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-health-${monthFilter || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Totals footer using DataTable's footerSummary format
  const footerSummary = filteredRows.length > 0
    ? [
        { label: `${filteredRows.length} Containers`, value: "" as React.ReactNode },
        { label: "Billings", value: formatCurrency(filteredTotals.billingTotal) as React.ReactNode },
        { label: "Expenses", value: formatCurrency(filteredTotals.totalExpenses) as React.ReactNode },
        { label: "Collected", value: formatCurrency(filteredTotals.collectedAmount) as React.ReactNode },
        {
          label: "Gross Profit",
          value: (
            <span style={{ color: filteredTotals.grossProfit >= 0 ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)", fontWeight: 700 }}>
              {formatCurrency(filteredTotals.grossProfit)}
            </span>
          ) as React.ReactNode,
        },
      ]
    : undefined;

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)] p-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
            Financial Health
          </h1>
          <p className="text-[14px] text-[var(--theme-text-muted)]">
            Sales report — per-project billing, expenses, collections, and profitability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month Picker */}
          <div className="flex items-center gap-1 border border-[var(--theme-border-default)] rounded-lg overflow-hidden">
            <button
              onClick={() => setMonthFilter(shiftMonth(monthFilter || getCurrentMonth(), -1))}
              className="p-2 hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
            >
              <ChevronLeft size={16} className="text-[var(--theme-text-muted)]" />
            </button>
            <span className="px-3 py-2 text-[13px] font-medium text-[var(--theme-text-primary)] min-w-[140px] text-center">
              {monthFilter ? getMonthLabel(monthFilter) : "All Time"}
            </span>
            <button
              onClick={() => setMonthFilter(shiftMonth(monthFilter || getCurrentMonth(), 1))}
              className="p-2 hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
            >
              <ChevronRight size={16} className="text-[var(--theme-text-muted)]" />
            </button>
          </div>

          {/* Clear month filter */}
          {monthFilter && (
            <button
              onClick={() => setMonthFilter("")}
              className="px-3 py-2 text-[12px] font-medium text-[var(--theme-text-muted)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
            >
              All Time
            </button>
          )}

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[var(--neuron-action-primary-hover)] transition-colors font-medium text-[14px]"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--theme-border-default)] p-5"
            style={{ backgroundColor: card.bgColor }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-medium text-[var(--theme-text-muted)] uppercase tracking-wider">
                {card.label}
              </span>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${card.color}15` }}
              >
                <card.icon size={16} style={{ color: card.color }} />
              </div>
            </div>
            <div className="text-[22px] font-bold tabular-nums" style={{ color: card.color }}>
              {card.value}
            </div>
            <div className="text-[11px] text-[var(--theme-text-muted)] mt-1">
              {monthFilter ? getMonthLabel(monthFilter) : "All Time"} &middot; {summary.projectCount} containers
            </div>
          </div>
        ))}
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder="Search by file ref, company, or invoice #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)] text-[13px] border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <DataTable
          data={filteredRows as any}
          columns={columns as any}
          isLoading={isLoading}
          footerSummary={footerSummary}
          emptyMessage={
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 bg-[var(--theme-bg-surface-subtle)] rounded-full flex items-center justify-center mb-3">
                <DollarSign className="text-[var(--theme-text-muted)]" size={20} />
              </div>
              <p className="text-[14px] font-medium text-[var(--theme-text-primary)]">No financial containers found</p>
              <p className="text-[13px] text-[var(--theme-text-muted)] mt-1">
                {monthFilter
                  ? `No containers for ${getMonthLabel(monthFilter)}. Try another month or view All Time.`
                  : "Create project or contract work with billings to see financial data here."}
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
