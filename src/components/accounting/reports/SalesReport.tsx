// SalesReport — Per-booking revenue breakdown (V2 booking-first architecture).
//
// Data sources (all from useReportsData):
//   bookings   → one row per booking in the period
//   invoices   → scoped per booking via filterInvoicesForScope; sum = billed amount
//   expenses   → scoped per booking via mapEvoucherExpensesForScope → cost of sales
//   collections → scoped per booking's invoice IDs via filterCollectionsForScope
//
// Column logic (V2-aligned):
//   JOB NO.        = booking.booking_number
//   INVOICE NO.    = invoice numbers derived from booking's scoped invoices
//   PARTICULARS    = booking.service_type
//   BILLED AMOUNT  = Σ active invoices scoped to this booking
//   COST OF SALES  = Σ evoucher expenses scoped to this booking
//   GROSS PROFIT   = BILLED − COST OF SALES
//   COLLECTED      = Σ applied collections scoped to this booking's invoices
//   OUTSTANDING    = max(0, BILLED − COLLECTED)

import React, { useMemo } from "react";
import { FileText, DollarSign, Hash, Clock } from "lucide-react";
import type { ReportsData } from "../../../hooks/useReportsData";
import { isInScope } from "../aggregate/types";
import type { DateScope } from "../aggregate/types";
import { isInvoiceFinanciallyActive } from "../../../utils/invoiceReversal";
import { isCollectionAppliedToInvoice } from "../../../utils/collectionResolution";
import { pickReportingAmount } from "../../../utils/accountingCurrency";
import {
  filterBillingItemsForScope,
  filterInvoicesForScope,
  filterCollectionsForScope,
  mapEvoucherExpensesForScope,
} from "../../../utils/financialSelectors";
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface SalesReportProps {
  data: ReportsData;
  scope: DateScope;
}

interface BookingReportRow {
  bookingId: string;
  bookingReference: string;
  bookingDate: string;
  invoiceNumbers: string;
  companyName: string;
  particulars: string;
  billedAmount: number;
  costOfSales: number;
  grossProfit: number;
  collectedAmount: number;
  outstanding: number;
}

interface TableTotals {
  billedAmount: number;
  costOfSales: number;
  grossProfit: number;
  collectedAmount: number;
  outstanding: number;
}

// ── Column Definitions ─────────────────────────────────────────────────────────

const columns: ReportColumnDef<BookingReportRow>[] = [
  {
    header: "JOB NO. / DATE",
    width: 130,
    cell: (row) => (
      <>
        <p style={{ color: R.ink, fontSize: "12px", fontWeight: 600, lineHeight: 1.3 }}>
          {row.bookingReference}
        </p>
        <p style={{ color: R.muted, fontSize: "11px", marginTop: 1 }}>
          {reportFormatDate(row.bookingDate)}
        </p>
      </>
    ),
  },
  {
    header: "COMPANY",
    width: 160,
    cell: (row) => <span style={{ color: R.ink, fontSize: "13px" }}>{row.companyName}</span>,
  },
  {
    header: "INVOICE NO.",
    width: 120,
    cell: (row) => <span style={{ color: R.ink, fontSize: "13px" }}>{row.invoiceNumbers || "—"}</span>,
  },
  {
    header: "PARTICULARS",
    width: 160,
    cell: (row) => (
      <span
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          color: R.ink,
          fontSize: "13px",
        }}
      >
        {row.particulars}
      </span>
    ),
  },
  {
    header: "BILLED AMOUNT",
    width: 130,
    align: "right",
    cell: (row) => <span style={{ color: R.ink }}>{reportPhp(row.billedAmount)}</span>,
  },
  {
    header: "COST OF SALES",
    width: 130,
    align: "right",
    cell: (row) => <span style={{ color: R.amber }}>{reportPhp(row.costOfSales)}</span>,
  },
  {
    header: "GROSS PROFIT",
    width: 130,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.grossProfit >= 0 ? R.teal : R.red, fontWeight: 700 }}>
        {reportPhp(row.grossProfit)}
      </span>
    ),
  },
  {
    header: "COLLECTED",
    width: 120,
    align: "right",
    cell: (row) => <span style={{ color: R.teal }}>{reportPhp(row.collectedAmount)}</span>,
  },
  {
    header: "OUTSTANDING",
    width: 120,
    align: "right",
    cell: (row) => (
      <span style={{ color: row.outstanding <= 0 ? R.teal : R.amber, fontWeight: 600 }}>
        {reportPhp(row.outstanding)}
      </span>
    ),
  },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export function SalesReport({ data, scope }: SalesReportProps) {

  // ── Rows ──
  const rows = useMemo((): BookingReportRow[] => {
    const { bookings, invoices, billingItems, expenses, collections } = data;

    // V2: loop over bookings — one row per booking in the period
    const periodBookings = bookings.filter((b) => isInScope(b.created_at, scope));

    return periodBookings
      .map((booking) => {
        const bookingId = booking.id as string;

        // Scope all financial data to this booking using V2 selectors
        const scopedBillingItems = filterBillingItemsForScope(billingItems, [bookingId], bookingId);
        const scopedInvoices = filterInvoicesForScope(invoices, [bookingId], bookingId)
          .filter(isInvoiceFinanciallyActive);
        const scopedInvoiceIds = scopedInvoices.map((inv: any) => inv.id as string).filter(Boolean);
        const scopedCollections = filterCollectionsForScope(collections, scopedInvoiceIds)
          .filter(isCollectionAppliedToInvoice);
        const scopedExpenses = mapEvoucherExpensesForScope(expenses, [bookingId], bookingId);

        // BILLED AMOUNT — sum of active invoices linked to this booking (PHP base)
        const billedAmount = scopedInvoices.reduce(
          (s: number, inv: any) => s + (pickReportingAmount(inv) || Number(inv.subtotal) || 0), 0
        );

        // COST OF SALES — evoucher expenses scoped to this booking (PHP base)
        const costOfSales = scopedExpenses.reduce((s, e) => s + pickReportingAmount(e as any), 0);

        // COLLECTED — applied collections via this booking's invoices (PHP base)
        const collectedAmount = scopedCollections.reduce(
          (s: number, c: any) => s + pickReportingAmount(c), 0
        );

        // INVOICE NOS — derived from scoped invoices
        const invoiceNumbers = scopedInvoices
          .map((inv: any) => inv.invoice_number as string)
          .filter(Boolean)
          .join(", ") || "—";

        void scopedBillingItems; // available for future use (e.g. unbilled line count)

        return {
          bookingId,
          bookingReference: booking.booking_number || bookingId,
          bookingDate: booking.created_at || "",
          invoiceNumbers,
          companyName: booking.customer_name || "—",
          particulars: booking.service_type || "—",
          billedAmount,
          costOfSales,
          grossProfit: billedAmount - costOfSales,
          collectedAmount,
          outstanding: Math.max(0, billedAmount - collectedAmount),
        };
      })
      .filter((row) => row.billedAmount > 0 || row.costOfSales > 0 || row.collectedAmount > 0);
  }, [data.bookings, data.invoices, data.billingItems, data.expenses, data.collections, scope]);

  // ── Aggregates ──
  const totals = useMemo((): TableTotals => ({
    billedAmount:    rows.reduce((s, r) => s + r.billedAmount, 0),
    costOfSales:     rows.reduce((s, r) => s + r.costOfSales, 0),
    grossProfit:     rows.reduce((s, r) => s + r.grossProfit, 0),
    collectedAmount: rows.reduce((s, r) => s + r.collectedAmount, 0),
    outstanding:     rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  const periodLabel = reportFormatScopeLabel(scope);

  // ── Breakdown card definitions ──
  const leftCard: ReportSummaryCardDef = {
    title: "Revenue Summary",
    rows: [
      { label: "Total Billed (Invoiced)", value: reportPhp(totals.billedAmount), numericValue: totals.billedAmount },
      { label: "Total Collected (Cash Received)", value: reportPhp(totals.collectedAmount), color: R.teal, numericValue: totals.collectedAmount },
      { label: "Outstanding AR (Uncollected)", value: reportPhp(totals.outstanding), color: totals.outstanding <= 0 ? R.teal : R.amber, numericValue: totals.outstanding },
    ],
    footerLabel: "Collection Rate",
    footerValue: reportPct(totals.collectedAmount, totals.billedAmount),
    footerValueColor: R.teal,
  };

  const rightCard: ReportSummaryCardDef = {
    title: "Margin Summary",
    rows: [
      { label: "Total Billed (Revenue)", value: reportPhp(totals.billedAmount), numericValue: totals.billedAmount },
      { label: "Cost of Sales (Direct Costs)", value: reportPhp(totals.costOfSales), color: R.amber, numericValue: totals.costOfSales },
      { label: "Gross Profit", value: reportPhp(totals.grossProfit), color: totals.grossProfit >= 0 ? R.teal : R.red },
    ],
    footerLabel: "Gross Margin",
    footerValue: reportPct(totals.grossProfit, totals.billedAmount),
    footerValueColor: totals.grossProfit >= 0 ? R.teal : R.red,
  };

  return (
    <ReportPageLayout>

      {/* Document Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: R.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
          Sales Report
        </h1>
        <p style={{ fontSize: "14px", color: R.muted }}>
          Per-booking revenue breakdown · {periodLabel}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px" }}>
        <div className="grid grid-cols-4 gap-4">
          <ReportKpiCard
            icon={FileText}
            label="Total Billed"
            value={reportPhpCompact(totals.billedAmount)}
            sub={reportPhp(totals.billedAmount)}
          />
          <ReportKpiCard
            icon={DollarSign}
            label="Total Collected"
            value={reportPhpCompact(totals.collectedAmount)}
            sub={reportPhp(totals.collectedAmount)}
            valueColor={R.teal}
          />
          <ReportKpiCard
            icon={Clock}
            label="Outstanding AR"
            value={reportPhpCompact(totals.outstanding)}
            sub={totals.outstanding <= 0 ? "Fully collected" : "Uncollected balance"}
            valueColor={totals.outstanding <= 0 ? R.teal : R.amber}
          />
          <ReportKpiCard
            icon={Hash}
            label="Bookings"
            value={String(rows.length)}
            sub={periodLabel}
          />
        </div>
      </div>

      {/* Data Table */}
      <div style={{ padding: "0 48px 24px 48px" }}>
        <ReportTable<BookingReportRow>
          columns={columns}
          data={rows}
          rowKey={(row) => row.bookingId}
          isLoading={data.isLoading}
          footerLabelSpan={4}
          footerLabel={`TOTAL · ${rows.length} ${rows.length === 1 ? "booking" : "bookings"}`}
          footerCells={[
            { value: reportPhp(totals.billedAmount) },
            { value: reportPhp(totals.costOfSales), color: R.amber },
            { value: reportPhp(totals.grossProfit), color: totals.grossProfit >= 0 ? R.teal : R.red },
            { value: reportPhp(totals.collectedAmount), color: R.teal },
            { value: reportPhp(totals.outstanding), color: totals.outstanding <= 0 ? R.teal : R.amber },
          ]}
          emptyMessage="No bookings this period."
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
