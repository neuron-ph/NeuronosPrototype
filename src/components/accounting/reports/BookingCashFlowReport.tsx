// BookingCashFlowReport — Per-booking P&L report.
// Shows revenue, cost, profit, and collection rate for every booking in the period.
// Uses V2 booking-first architecture: each row is scoped by booking ID via
// filterBillingItemsForScope / calculateFinancialTotals.
//
// Layout follows ReportTemplate: document header → KPI cards → toolbar → table → breakdown → signatures.

import { useMemo, useState } from "react";
import { Search, Download, FileText, DollarSign, TrendingUp, TrendingDown, Minus, Clock, ArrowUpDown } from "lucide-react";
import type { DateScope } from "../aggregate/types";
import { useBookingCashFlowReport } from "../../../hooks/useBookingCashFlowReport";
import type { BookingCashFlowRow } from "../../../hooks/useBookingCashFlowReport";
import {
  R,
  reportPhp,
  reportPhpCompact,
  reportPct,
  reportFormatDate,
  reportFormatScopeLabel,
  ReportKpiCard,
  ReportTable,
  ReportBreakdownCards,
  ReportSignatureBlock,
  ReportPageLayout,
} from "./ReportTemplate";
import type { ReportColumnDef, ReportSummaryCardDef, ReportFooterCell } from "./ReportTemplate";

// ── Sub-components ─────────────────────────────────────────────────────────────

const SERVICE_TYPE_COLORS: Record<string, string> = {
  Forwarding:        R.teal,
  Brokerage:         "var(--neuron-status-accent-fg)",
  Trucking:          R.amber,
  "Marine Insurance": "var(--neuron-semantic-info)",
  Others:            R.muted,
};

function MarginBadge({ margin }: { margin: number }) {
  const color =
    margin >= 20
      ? R.success
      : margin >= 0
        ? R.amber
        : R.red;
  const Icon = margin >= 1 ? TrendingUp : margin <= -1 ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color }}>
      <Icon size={12} />
      {margin.toFixed(1)}%
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const color =
    s === "completed"
      ? R.success
      : s === "cancelled"
        ? R.red
        : s === "in progress" || s === "in-progress"
          ? R.teal
          : R.muted;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
      style={{
        color,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}30`,
      }}
    >
      {status}
    </span>
  );
}

// ── Column Definitions ─────────────────────────────────────────────────────────

const columns: ReportColumnDef<BookingCashFlowRow>[] = [
  {
    header: "BOOKING",
    width: 140,
    cell: (row) => (
      <div>
        <p style={{ color: R.ink, fontSize: "13px", fontWeight: 600, lineHeight: 1.3 }}>
          {row.bookingReference}
        </p>
        <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>
          {reportFormatDate(row.bookingDate)}
        </p>
      </div>
    ),
  },
  {
    header: "SERVICE",
    width: 130,
    cell: (row) => (
      <span
        className="text-[12px] font-medium"
        style={{ color: SERVICE_TYPE_COLORS[row.serviceType] || R.muted }}
      >
        {row.serviceType}
      </span>
    ),
  },
  {
    header: "CUSTOMER",
    cell: (row) => (
      <div>
        <p style={{ color: R.ink, fontSize: "13px" }}>{row.customerName}</p>
        {row.projectNumber && (
          <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>{row.projectNumber}</p>
        )}
      </div>
    ),
  },
  {
    header: "STATUS",
    width: 110,
    cell: (row) => <StatusPill status={row.status} />,
  },
  {
    header: "BOOKED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.ink, fontSize: "13px", fontWeight: 500 }}>{reportPhp(row.bookedCharges)}</span>,
  },
  {
    header: "INVOICED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.ink, fontSize: "13px" }}>{reportPhp(row.invoicedAmount)}</span>,
  },
  {
    header: "COLLECTED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.success, fontSize: "13px" }}>{reportPhp(row.collectedAmount)}</span>,
  },
  {
    header: "OUTSTANDING",
    width: 120,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.outstandingAmount > 0 ? R.amber : R.muted, fontSize: "13px" }}>
        {reportPhp(row.outstandingAmount)}
      </span>
    ),
  },
  {
    header: "DIRECT COST",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.muted, fontSize: "13px" }}>{reportPhp(row.directCost)}</span>,
  },
  {
    header: "GROSS PROFIT",
    width: 120,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.grossProfit >= 0 ? R.success : R.red, fontSize: "13px", fontWeight: 500 }}>
        {reportPhp(row.grossProfit)}
      </span>
    ),
  },
  {
    header: "MARGIN",
    width: 90,
    align: "right",
    cell: (row) => <MarginBadge margin={row.grossMargin} />,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildFooterCells(groupRows: BookingCashFlowRow[]): ReportFooterCell[] {
  const booked      = groupRows.reduce((s, r) => s + r.bookedCharges, 0);
  const invoiced    = groupRows.reduce((s, r) => s + r.invoicedAmount, 0);
  const collected   = groupRows.reduce((s, r) => s + r.collectedAmount, 0);
  const outstanding = groupRows.reduce((s, r) => s + r.outstandingAmount, 0);
  const directCost  = groupRows.reduce((s, r) => s + r.directCost, 0);
  const profit      = groupRows.reduce((s, r) => s + r.grossProfit, 0);
  const margin      = booked > 0 ? (profit / booked) * 100 : 0;

  return [
    { value: reportPhp(booked) },
    { value: reportPhp(invoiced) },
    { value: reportPhp(collected), color: R.success },
    { value: reportPhp(outstanding), color: outstanding > 0 ? R.amber : R.muted },
    { value: reportPhp(directCost), color: R.muted },
    { value: reportPhp(profit), color: profit >= 0 ? R.success : R.red },
    { value: `${margin.toFixed(1)}%` },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────

type GroupBy = "none" | "service" | "customer";

interface Props {
  scope: DateScope;
}

export function BookingCashFlowReport({ scope }: Props) {
  const { rows, summary, isLoading } = useBookingCashFlowReport(scope);
  const [search, setSearch]           = useState("");
  const [groupBy, setGroupBy]         = useState<GroupBy>("none");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const serviceTypes = useMemo(
    () => [...new Set(rows.map((r) => r.serviceType).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (serviceFilter !== "all" && row.serviceType !== serviceFilter) return false;
      if (!q) return true;
      return (
        row.bookingReference.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        (row.projectNumber || "").toLowerCase().includes(q) ||
        row.serviceType.toLowerCase().includes(q)
      );
    });
  }, [rows, search, serviceFilter]);

  const groupedRows = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", rows: filtered }];
    const buckets = new Map<string, BookingCashFlowRow[]>();
    filtered.forEach((row) => {
      const key = groupBy === "service" ? row.serviceType : row.customerName;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(row);
    });
    return Array.from(buckets.entries())
      .map(([key, rows]) => ({ key, label: key, rows }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered, groupBy]);

  const exportCSV = () => {
    const header = [
      "Booking Ref", "Service Type", "Customer", "Project", "Status", "Date",
      "Booked Charges", "Invoiced", "Collected", "Outstanding", "Direct Cost",
      "Gross Profit", "Gross Margin %", "Collection Rate %",
    ].join(",");

    const csvRows = filtered.map((r) =>
      [
        r.bookingReference, r.serviceType, r.customerName, r.projectNumber || "",
        r.status, r.bookingDate?.slice(0, 10) || "",
        r.bookedCharges.toFixed(2), r.invoicedAmount.toFixed(2),
        r.collectedAmount.toFixed(2), r.outstandingAmount.toFixed(2),
        r.directCost.toFixed(2), r.grossProfit.toFixed(2),
        r.grossMargin.toFixed(2), r.collectionRate.toFixed(2),
      ].map((v) => `"${v}"`).join(",")
    );

    const footerRow = [
      "TOTAL", "", "", "", "", "",
      summary.totalBookedCharges.toFixed(2), summary.totalInvoiced.toFixed(2),
      summary.totalCollected.toFixed(2), summary.totalOutstanding.toFixed(2),
      summary.totalDirectCost.toFixed(2), summary.totalGrossProfit.toFixed(2),
      summary.avgGrossMargin.toFixed(2), "",
    ].map((v) => `"${v}"`).join(",");

    const blob = new Blob([[header, ...csvRows, footerRow].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-cashflow-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const periodLabel = reportFormatScopeLabel(scope);

  // ── Breakdown card definitions ──
  const leftCard: ReportSummaryCardDef = {
    title: "REVENUE SUMMARY",
    accentBg: R.tealTint,
    accentText: R.teal,
    badgeBg: "rgba(15,118,110,0.12)",
    rows: [
      { label: "Total Booked Charges",  value: reportPhp(summary.totalBookedCharges) },
      { label: "Total Invoiced",        value: reportPhp(summary.totalInvoiced),   color: R.teal },
      { label: "Total Collected",       value: reportPhp(summary.totalCollected),  color: R.success },
      { label: "Outstanding AR",        value: reportPhp(summary.totalOutstanding), color: summary.totalOutstanding > 0 ? R.amber : R.teal },
    ],
    footerLabel: "COLLECTION RATE",
    footerValue: reportPct(summary.totalCollected, summary.totalInvoiced),
  };

  const rightCard: ReportSummaryCardDef = {
    title: "MARGIN SUMMARY",
    accentBg: R.amberTint,
    accentText: R.amber,
    badgeBg: "rgba(217,119,6,0.12)",
    rows: [
      { label: "Total Booked Charges", value: reportPhp(summary.totalBookedCharges) },
      { label: "Total Direct Cost",    value: reportPhp(summary.totalDirectCost),   color: R.amber },
      { label: "Total Gross Profit",   value: reportPhp(summary.totalGrossProfit),  color: summary.totalGrossProfit >= 0 ? R.teal : R.red },
    ],
    footerLabel: "AVG GROSS MARGIN",
    footerValue: `${summary.avgGrossMargin.toFixed(1)}%`,
    footerValueColor: summary.avgGrossMargin >= 0 ? R.teal : R.red,
  };

  return (
    <ReportPageLayout>

      {/* Document Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: R.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
          Booking Cash Flow
        </h1>
        <p style={{ fontSize: "14px", color: R.muted }}>
          Revenue, cost, and collection performance per booking · {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px" }}>
        <div className="grid grid-cols-4 gap-4">
          <ReportKpiCard
            icon={FileText}
            label="Total Booked"
            value={reportPhpCompact(summary.totalBookedCharges)}
            sub={`${summary.bookingCount} bookings`}
          />
          <ReportKpiCard
            icon={ArrowUpDown}
            label="Total Invoiced"
            value={reportPhpCompact(summary.totalInvoiced)}
            sub={reportPhp(summary.totalInvoiced)}
            valueColor={R.teal}
          />
          <ReportKpiCard
            icon={DollarSign}
            label="Total Collected"
            value={reportPhpCompact(summary.totalCollected)}
            sub={
              summary.totalInvoiced > 0
                ? `${reportPct(summary.totalCollected, summary.totalInvoiced)} collection rate`
                : "no invoices yet"
            }
            valueColor={R.success}
          />
          <ReportKpiCard
            icon={Clock}
            label="Outstanding AR"
            value={reportPhpCompact(summary.totalOutstanding)}
            sub={`Avg margin ${summary.avgGrossMargin.toFixed(1)}%`}
            valueColor={summary.totalOutstanding > 0 ? R.amber : R.muted}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-12 py-3 mb-6"
        style={{ backgroundColor: R.subtleBg, borderTop: `1px solid ${R.border}`, borderBottom: `1px solid ${R.border}` }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3 py-1.5 rounded-lg"
          style={{ border: `1px solid ${R.border}`, backgroundColor: R.white }}
        >
          <Search size={14} style={{ color: R.muted }} />
          <input
            type="text"
            placeholder="Search bookings, customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[13px] bg-transparent outline-none"
            style={{ color: R.ink }}
          />
        </div>

        {/* Service Type Filter */}
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="text-[13px] px-3 py-1.5 rounded-lg outline-none"
          style={{ border: `1px solid ${R.border}`, backgroundColor: R.white, color: R.ink }}
        >
          <option value="all">All Services</option>
          {serviceTypes.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        {/* Group By */}
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: `1px solid ${R.border}` }}
        >
          {(
            [
              { id: "none",     label: "All" },
              { id: "service",  label: "By Service" },
              { id: "customer", label: "By Customer" },
            ] as { id: GroupBy; label: string }[]
          ).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setGroupBy(id)}
              className="px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: groupBy === id ? R.teal : R.white,
                color: groupBy === id ? "var(--theme-action-primary-text)" : R.muted,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Export */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: R.muted, border: `1px solid ${R.border}`, backgroundColor: R.white }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Data Table(s) */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        {groupBy === "none" ? (
          <ReportTable<BookingCashFlowRow>
            columns={columns}
            data={filtered}
            rowKey={(r) => r.bookingId}
            isLoading={isLoading}
            footerLabelSpan={4}
            footerLabel={`TOTAL · ${filtered.length} ${filtered.length === 1 ? "booking" : "bookings"}`}
            footerCells={buildFooterCells(filtered)}
            emptyMessage="No bookings found for this period."
          />
        ) : (
          <div className="space-y-6">
            {groupedRows.map((group) => (
              <div key={group.key}>
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-4 py-2 rounded-lg mb-2"
                  style={{ backgroundColor: R.tealTint }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold" style={{ color: R.ink }}>
                      {group.label || "—"}
                    </span>
                    <span className="text-[12px]" style={{ color: R.muted }}>
                      {group.rows.length} {group.rows.length === 1 ? "booking" : "bookings"}
                    </span>
                  </div>
                </div>
                <ReportTable<BookingCashFlowRow>
                  columns={columns}
                  data={group.rows}
                  rowKey={(r) => r.bookingId}
                  isLoading={isLoading}
                  footerLabelSpan={4}
                  footerLabel={`${group.label} · ${group.rows.length} ${group.rows.length === 1 ? "booking" : "bookings"}`}
                  footerCells={buildFooterCells(group.rows)}
                  emptyMessage="No bookings in this group."
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Breakdown Cards */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        <ReportBreakdownCards left={leftCard} right={rightCard} periodLabel={periodLabel} />
      </div>

      {/* Signatures */}
      <div style={{ padding: "0 48px 48px 48px" }}>
        <ReportSignatureBlock />
      </div>

    </ReportPageLayout>
  );
}
