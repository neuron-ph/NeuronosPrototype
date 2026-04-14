// CollectionsReport — Payment receipts for reconciliation.
//
// Layout: Document Header → KPI Cards → ReportTable →
//         ReportBreakdownCards (Collections Summary + By Payment Method) → ReportSignatureBlock

import React from "react";
import { Banknote, DollarSign, Hash, TrendingUp } from "lucide-react";
import type { DateScope } from "../aggregate/types";
import { useCollectionsReport } from "../../../hooks/useCollectionsReport";
import type { CollectionRow } from "../../../hooks/useCollectionsReport";
import {
  R,
  reportPhp,
  reportPhpCompact,
  reportFormatDate,
  reportFormatScopeLabel,
  ReportKpiCard,
  ReportTable,
  ReportBreakdownCards,
  ReportSignatureBlock,
  ReportPageLayout,
} from "./ReportTemplate";
import type { ReportColumnDef, ReportSummaryCardDef } from "./ReportTemplate";

// ── Payment Method Pill ────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  "Cash":            { bg: "var(--neuron-semantic-success-bg)",  text: "var(--neuron-brand-green)" },
  "Check":           { bg: "var(--neuron-semantic-info-bg)",     text: "var(--neuron-semantic-info)" },
  "Cheque":          { bg: "var(--neuron-semantic-info-bg)",     text: "var(--neuron-semantic-info)" },
  "Bank Transfer":   { bg: "var(--neuron-status-accent-bg)",     text: "var(--neuron-status-accent-fg)" },
  "Online Transfer": { bg: "var(--neuron-status-accent-bg)",     text: "var(--neuron-status-accent-fg)" },
  "Credit Card":     { bg: "var(--neuron-semantic-warn-bg)",     text: "var(--neuron-semantic-warn)" },
};

function MethodPill({ method }: { method: string }) {
  const colors = METHOD_COLORS[method] ?? { bg: "var(--neuron-pill-inactive-bg)", text: "var(--neuron-ink-muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {method}
    </span>
  );
}

// ── Column Definitions ─────────────────────────────────────────────────────────

const columns: ReportColumnDef<CollectionRow>[] = [
  {
    header: "OR NO. / DATE",
    width: 140,
    cell: (row) => (
      <>
        <p style={{ color: R.ink, fontSize: "12px", fontWeight: 600, lineHeight: 1.3 }}>
          {row.collectionNumber}
        </p>
        <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>
          {reportFormatDate(row.receiptDate)}
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
    header: "INVOICE REF",
    width: 120,
    cell: (row) => <span style={{ color: R.muted, fontSize: "13px" }}>{row.invoiceRef}</span>,
  },
  {
    header: "PAYMENT METHOD",
    width: 140,
    cell: (row) => <MethodPill method={row.paymentMethod} />,
  },
  {
    header: "REFERENCE NO.",
    width: 130,
    cell: (row) => <span style={{ color: R.muted, fontSize: "13px" }}>{row.referenceNumber}</span>,
  },
  {
    header: "AMOUNT",
    width: 130,
    align: "right",
    cell: (row) => (
      <span style={{ color: R.teal, fontWeight: 700 }}>
        {reportPhp(row.amount)}
      </span>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface CollectionsReportProps {
  scope: DateScope;
}

export function CollectionsReport({ scope }: CollectionsReportProps) {
  const { rows, summary, isLoading } = useCollectionsReport(scope);

  const periodLabel = reportFormatScopeLabel(scope);

  const topMethod = summary.byMethod[0];

  const leftCard: ReportSummaryCardDef = {
    title: "Collections Summary",
    rows: [
      { label: "Total Receipts Processed", value: String(summary.receiptCount) },
      { label: "Unique Customers Paid",    value: String(summary.customerCount) },
      { label: "Average Payment",          value: reportPhp(summary.averagePayment) },
      { label: "Largest Single Payment",   value: reportPhp(summary.largestPayment), color: R.teal },
    ],
    footerLabel: "Total Collected",
    footerValue: reportPhp(summary.totalCollected),
    footerValueColor: R.teal,
  };

  const rightCard: ReportSummaryCardDef = {
    title: "By Payment Method",
    showProgressBars: true,
    rows: summary.byMethod.slice(0, 4).map((m) => ({
      label: `${m.method} (${m.count} ${m.count === 1 ? "receipt" : "receipts"})`,
      value: reportPhp(m.total),
      numericValue: m.total,
      color: summary.totalCollected > 0 && m.total === summary.largestPayment ? R.teal : undefined,
    })),
    footerLabel: "Top Method",
    footerValue: topMethod ? topMethod.method : "—",
    footerValueColor: R.teal,
  };

  return (
    <ReportPageLayout>

      {/* Document Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: R.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
          Collections Report
        </h1>
        <p style={{ fontSize: "14px", color: R.muted }}>
          Payment receipts for reconciliation · {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px" }}>
        <div className="grid grid-cols-4 gap-4">
          <ReportKpiCard
            icon={DollarSign}
            label="Total Collected"
            value={reportPhpCompact(summary.totalCollected)}
            sub={reportPhp(summary.totalCollected)}
            valueColor={R.teal}
          />
          <ReportKpiCard
            icon={Hash}
            label="Receipts"
            value={String(summary.receiptCount)}
            sub={`from ${summary.customerCount} ${summary.customerCount === 1 ? "customer" : "customers"}`}
          />
          <ReportKpiCard
            icon={TrendingUp}
            label="Average Payment"
            value={reportPhpCompact(summary.averagePayment)}
            sub={reportPhp(summary.averagePayment)}
          />
          <ReportKpiCard
            icon={Banknote}
            label="Largest Payment"
            value={reportPhpCompact(summary.largestPayment)}
            sub={reportPhp(summary.largestPayment)}
            valueColor={R.teal}
          />
        </div>
      </div>

      {/* Data Table */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        <ReportTable<CollectionRow>
          columns={columns}
          data={rows}
          rowKey={(row) => row.collectionId}
          isLoading={isLoading}
          footerLabelSpan={5}
          footerLabel={`TOTAL · ${rows.length} ${rows.length === 1 ? "receipt" : "receipts"}`}
          footerCells={[
            { value: reportPhp(summary.totalCollected), color: R.teal },
          ]}
          emptyMessage="No collections this period."
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
