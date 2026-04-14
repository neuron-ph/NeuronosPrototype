// ReceivablesAgingReport — Outstanding AR by aging bucket.
//
// Layout: Document Header → KPI Cards → ReportTable (with bucket pill) →
//         ReportBreakdownCards (AR Aging + AR Health) → ReportSignatureBlock

import React from "react";
import { Clock, DollarSign, AlertTriangle, Users } from "lucide-react";
import type { DateScope } from "../aggregate/types";
import {
  useReceivablesAgingReport,
  BUCKET_LABELS,
} from "../../../hooks/useReceivablesAgingReport";
import type { AgingRow, AgingBucket } from "../../../hooks/useReceivablesAgingReport";
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

// ── Bucket Pill ────────────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<AgingBucket, { bg: string; text: string }> = {
  "current": { bg: "var(--neuron-semantic-success-bg)",  text: "var(--neuron-brand-green)" },
  "31-60":   { bg: "var(--neuron-semantic-warn-bg)",     text: "var(--neuron-semantic-warn)" },
  "61-90":   { bg: "var(--neuron-semantic-danger-bg)",   text: "var(--neuron-semantic-danger)" },
  "91+":     { bg: "var(--neuron-semantic-danger-bg)",   text: "var(--neuron-semantic-danger)" },
};

function BucketPill({ bucket }: { bucket: AgingBucket }) {
  const { bg, text } = BUCKET_COLORS[bucket];
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: bg,
        color: text,
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {BUCKET_LABELS[bucket]}
    </span>
  );
}

// ── Column Definitions ─────────────────────────────────────────────────────────

const columns: ReportColumnDef<AgingRow>[] = [
  {
    header: "INVOICE / DATE",
    width: 140,
    cell: (row) => (
      <>
        <p style={{ color: R.ink, fontSize: "12px", fontWeight: 600, lineHeight: 1.3 }}>
          {row.invoiceNumber}
        </p>
        <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>
          {reportFormatDate(row.issueDate)}
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
    header: "BOOKING REF",
    width: 120,
    cell: (row) => <span style={{ color: R.muted, fontSize: "13px" }}>{row.bookingRef}</span>,
  },
  {
    header: "AGING",
    width: 110,
    cell: (row) => <BucketPill bucket={row.bucket} />,
  },
  {
    header: "DAYS OVERDUE",
    width: 110,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.daysOld > 60 ? R.red : row.daysOld > 30 ? R.amber : R.ink, fontWeight: 600 }}>
        {row.daysOld}d
      </span>
    ),
  },
  {
    header: "INVOICE TOTAL",
    width: 130,
    align: "right",
    cell: (row) => <span style={{ color: R.ink }}>{reportPhp(row.totalAmount)}</span>,
  },
  {
    header: "COLLECTED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.teal }}>{reportPhp(row.collected)}</span>,
  },
  {
    header: "OUTSTANDING",
    width: 120,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.bucket === "current" ? R.amber : R.red, fontWeight: 700 }}>
        {reportPhp(row.outstanding)}
      </span>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface ReceivablesAgingReportProps {
  scope: DateScope;
}

export function ReceivablesAgingReport({ scope }: ReceivablesAgingReportProps) {
  const { rows, summary, isLoading } = useReceivablesAgingReport(scope);

  const periodLabel = reportFormatScopeLabel(scope);

  const pastDue = summary.days31_60 + summary.days61_90 + summary.days91plus;
  const collectionRate = summary.totalOutstanding > 0
    ? reportPct(summary.current, summary.current + pastDue)
    : "—";

  const leftCard: ReportSummaryCardDef = {
    title: "AR Aging Breakdown",
    showProgressBars: true,
    rows: [
      { label: "Current (0 – 30 days)", value: reportPhp(summary.current),    color: R.teal,    numericValue: summary.current },
      { label: "Past Due 31 – 60 days", value: reportPhp(summary.days31_60),  color: R.amber,   numericValue: summary.days31_60 },
      { label: "Past Due 61 – 90 days", value: reportPhp(summary.days61_90),  color: "var(--neuron-semantic-danger)", numericValue: summary.days61_90 },
      { label: "Critical 91+ days",     value: reportPhp(summary.days91plus), color: R.red,     numericValue: summary.days91plus },
    ],
    footerLabel: "Total Outstanding",
    footerValue: reportPhp(summary.totalOutstanding),
    footerValueColor: summary.totalOutstanding > 0 ? R.red : R.teal,
  };

  const rightCard: ReportSummaryCardDef = {
    title: "AR Health",
    rows: [
      { label: "Total Invoices Tracked",   value: String(summary.invoiceCount) },
      { label: "Unique Customers with AR", value: String(summary.customerCount) },
      { label: "Current vs Past Due",      value: reportPct(summary.current, summary.totalOutstanding), color: R.teal },
      { label: "Critical (91+ days)",      value: reportPct(summary.days91plus, summary.totalOutstanding), color: summary.days91plus > 0 ? R.red : R.teal },
    ],
    footerLabel: "Current Ratio",
    footerValue: collectionRate,
    footerValueColor: R.teal,
  };

  return (
    <ReportPageLayout>

      {/* Document Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: R.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
          Receivables Aging Report
        </h1>
        <p style={{ fontSize: "14px", color: R.muted }}>
          Outstanding accounts receivable by age · {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px" }}>
        <div className="grid grid-cols-4 gap-4">
          <ReportKpiCard
            icon={DollarSign}
            label="Total Outstanding"
            value={reportPhpCompact(summary.totalOutstanding)}
            sub={reportPhp(summary.totalOutstanding)}
            valueColor={summary.totalOutstanding > 0 ? R.red : R.teal}
          />
          <ReportKpiCard
            icon={Clock}
            label="Current (0 – 30 days)"
            value={reportPhpCompact(summary.current)}
            sub={summary.invoiceCount > 0 ? reportPct(summary.current, summary.totalOutstanding) + " of total" : "No AR"}
            valueColor={R.teal}
          />
          <ReportKpiCard
            icon={AlertTriangle}
            label="Past Due (31 – 90 days)"
            value={reportPhpCompact(summary.days31_60 + summary.days61_90)}
            sub={summary.totalOutstanding > 0 ? reportPct(summary.days31_60 + summary.days61_90, summary.totalOutstanding) + " of total" : "—"}
            valueColor={R.amber}
          />
          <ReportKpiCard
            icon={Users}
            label="Critical 91+ days"
            value={reportPhpCompact(summary.days91plus)}
            sub={summary.totalOutstanding > 0 ? reportPct(summary.days91plus, summary.totalOutstanding) + " of total" : "—"}
            valueColor={summary.days91plus > 0 ? R.red : R.teal}
          />
        </div>
      </div>

      {/* Data Table */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        <ReportTable<AgingRow>
          columns={columns}
          data={rows}
          rowKey={(row) => row.invoiceId}
          isLoading={isLoading}
          footerLabelSpan={5}
          footerLabel={`TOTAL · ${rows.length} ${rows.length === 1 ? "invoice" : "invoices"}`}
          footerCells={[
            { value: reportPhp(rows.reduce((s, r) => s + r.totalAmount, 0)) },
            { value: reportPhp(rows.reduce((s, r) => s + r.collected, 0)), color: R.teal },
            { value: reportPhp(summary.totalOutstanding), color: R.red },
          ]}
          emptyMessage="No outstanding receivables this period."
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
