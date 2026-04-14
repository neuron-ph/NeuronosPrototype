// UnbilledRevenueReport — Work completed but not yet invoiced.
//
// Layout: Document Header → KPI Cards → ReportTable →
//         ReportBreakdownCards (Unbilled Summary + By Service Type) → ReportSignatureBlock

import React from "react";
import { AlertTriangle, FileText, Clock, Layers } from "lucide-react";
import type { DateScope } from "../aggregate/types";
import { useUnbilledRevenueReport } from "../../../hooks/useUnbilledRevenueReport";
import type { UnbilledRow } from "../../../hooks/useUnbilledRevenueReport";
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
import type { ReportColumnDef, ReportSummaryCardDef } from "./ReportTemplate";

// ── At-Risk Badge ──────────────────────────────────────────────────────────────

function AtRiskBadge({ isAtRisk }: { isAtRisk: boolean }) {
  if (!isAtRisk) return null;
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: "var(--neuron-semantic-danger-bg)",
        color: "var(--neuron-semantic-danger)",
        fontSize: "10px",
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: "999px",
        letterSpacing: "0.04em",
        marginLeft: 6,
      }}
    >
      AT RISK
    </span>
  );
}

// ── Column Definitions ─────────────────────────────────────────────────────────

const columns: ReportColumnDef<UnbilledRow>[] = [
  {
    header: "BOOKING / DATE",
    width: 140,
    cell: (row) => (
      <>
        <p style={{ color: R.ink, fontSize: "12px", fontWeight: 600, lineHeight: 1.3 }}>
          {row.bookingNumber}
          <AtRiskBadge isAtRisk={row.isAtRisk} />
        </p>
        <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>
          {reportFormatDate(row.bookingDate)}
        </p>
      </>
    ),
  },
  {
    header: "CUSTOMER",
    width: 160,
    cell: (row) => <span style={{ color: R.ink, fontSize: "13px" }}>{row.customerName}</span>,
  },
  {
    header: "SERVICE TYPE",
    width: 130,
    cell: (row) => <span style={{ color: R.muted, fontSize: "13px" }}>{row.serviceType}</span>,
  },
  {
    header: "DAYS OPEN",
    width: 90,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.isAtRisk ? R.red : row.daysOpen >= 30 ? R.amber : R.ink, fontWeight: 600 }}>
        {row.daysOpen}d
      </span>
    ),
  },
  {
    header: "BOOKED CHARGES",
    width: 130,
    align: "right",
    cell: (row) => <span style={{ color: R.ink }}>{reportPhp(row.bookedCharges)}</span>,
  },
  {
    header: "INVOICED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.teal }}>{reportPhp(row.invoicedAmount)}</span>,
  },
  {
    header: "UNBILLED",
    width: 120,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.isAtRisk ? R.red : R.amber, fontWeight: 700 }}>
        {reportPhp(row.unbilledAmount)}
      </span>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface UnbilledRevenueReportProps {
  scope: DateScope;
}

export function UnbilledRevenueReport({ scope }: UnbilledRevenueReportProps) {
  const { rows, summary, isLoading } = useUnbilledRevenueReport(scope);

  const periodLabel = reportFormatScopeLabel(scope);

  const leftCard: ReportSummaryCardDef = {
    title: "Unbilled Summary",
    rows: [
      { label: "Bookings with Unbilled Work", value: String(summary.bookingCount) },
      { label: "Total Booked Charges",        value: reportPhp(summary.totalBookedCharges) },
      { label: "Total Invoiced So Far",       value: reportPhp(summary.totalBookedCharges - summary.totalUnbilled), color: R.teal },
      { label: "Unbilled % of Booked",        value: reportPct(summary.totalUnbilled, summary.totalBookedCharges), color: R.amber },
    ],
    footerLabel: "Total Unbilled",
    footerValue: reportPhp(summary.totalUnbilled),
    footerValueColor: summary.totalUnbilled > 0 ? R.amber : R.teal,
  };

  const rightCard: ReportSummaryCardDef = {
    title: "By Service Type",
    showProgressBars: true,
    rows: summary.byServiceType.slice(0, 4).map((st) => ({
      label: `${st.serviceType} (${st.count} ${st.count === 1 ? "booking" : "bookings"})`,
      value: reportPhp(st.unbilled),
      numericValue: st.unbilled,
    })),
    footerLabel: "At Risk (60+ days)",
    footerValue: `${summary.atRiskCount} ${summary.atRiskCount === 1 ? "booking" : "bookings"}`,
    footerValueColor: summary.atRiskCount > 0 ? R.red : R.teal,
  };

  return (
    <ReportPageLayout>

      {/* Document Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: R.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
          Unbilled Revenue Report
        </h1>
        <p style={{ fontSize: "14px", color: R.muted }}>
          Bookings with uninvoiced charges · {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px" }}>
        <div className="grid grid-cols-4 gap-4">
          <ReportKpiCard
            icon={AlertTriangle}
            label="Total Unbilled"
            value={reportPhpCompact(summary.totalUnbilled)}
            sub={reportPhp(summary.totalUnbilled)}
            valueColor={summary.totalUnbilled > 0 ? R.amber : R.teal}
          />
          <ReportKpiCard
            icon={FileText}
            label="Bookings Affected"
            value={String(summary.bookingCount)}
            sub={`${summary.bookingCount === 1 ? "booking" : "bookings"} with unbilled work`}
          />
          <ReportKpiCard
            icon={Clock}
            label="At Risk (60+ days)"
            value={String(summary.atRiskCount)}
            sub={reportPhp(summary.atRiskAmount)}
            valueColor={summary.atRiskCount > 0 ? R.red : R.teal}
          />
          <ReportKpiCard
            icon={Layers}
            label="Total Booked"
            value={reportPhpCompact(summary.totalBookedCharges)}
            sub={reportPhp(summary.totalBookedCharges)}
          />
        </div>
      </div>

      {/* Data Table */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        <ReportTable<UnbilledRow>
          columns={columns}
          data={rows}
          rowKey={(row) => row.bookingId}
          isLoading={isLoading}
          footerLabelSpan={4}
          footerLabel={`TOTAL · ${rows.length} ${rows.length === 1 ? "booking" : "bookings"}`}
          footerCells={[
            { value: reportPhp(summary.totalBookedCharges) },
            { value: reportPhp(summary.totalBookedCharges - summary.totalUnbilled), color: R.teal },
            { value: reportPhp(summary.totalUnbilled), color: R.amber },
          ]}
          emptyMessage="No unbilled bookings this period."
        />
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
