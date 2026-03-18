// SalesReport — Per-invoice revenue breakdown grounded in the actual data model.
//
// Data sources (all from useReportsData):
//   invoices            → one row per invoice; total_amount is canonical billed total
//   billing_line_items  → charge_type='cost' items give cost-of-sales per invoice
//   collections         → matched by invoice_id; sum = cash collected
//   projects            → joined to invoices via project_id for project_number
//
// Column logic:
//   BILLED AMOUNT  = invoice.total_amount
//   COST OF SALES  = Σ billing_line_items.amount WHERE charge_type='cost' AND invoice_id=inv.id
//   GROSS PROFIT   = BILLED − COST OF SALES
//   COLLECTED      = Σ collections.amount WHERE invoice_id=inv.id
//   OUTSTANDING    = BILLED − COLLECTED

import React, { useMemo, useState } from "react";
import {
  FileText,
  DollarSign,
  TrendingUp,
  Hash,
  Clock,
  type LucideIcon,
} from "lucide-react";
import type { ReportsData } from "../../../hooks/useReportsData";
import { isInScope } from "../aggregate/types";
import type { DateScope } from "../aggregate/types";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SalesReportProps {
  data: ReportsData;
  scope: DateScope;
}

interface InvoiceReportRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  projectNumber: string;
  companyName: string;
  particulars: string;
  billedAmount: number;
  costOfSales: number;
  grossProfit: number;
  collectedAmount: number;
  outstanding: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const T = {
  ink:      "#12332B",
  teal:     "#0F766E",
  muted:    "#667085",
  border:   "#E5E9F0",
  white:    "#FFFFFF",
  subtleBg: "#F9FAFB",
  tealTint: "#E6F4F1",
  amberTint:"#FEF3E2",
  amber:    "#D97706",
  red:      "#DC2626",
} as const;

// ── Formatters ─────────────────────────────────────────────────────────────────

const php = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

const phpCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`;
  return php(n);
};

const pct = (num: number, denom: number) =>
  denom === 0 ? "—" : `${((num / denom) * 100).toFixed(1)}%`;

const summarizeRefs = (refs: unknown): string => {
  if (!Array.isArray(refs)) return "â€”";

  const normalized = refs.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (normalized.length === 0) return "â€”";
  if (normalized.length === 1) return normalized[0];
  return `${normalized[0]} +${normalized.length - 1}`;
};

function formatScopeLabel(scope: DateScope): string {
  const PRESETS: Record<string, string> = {
    "this-week": "This Week", "this-month": "This Month",
    "this-quarter": "This Quarter", "ytd": "Year to Date", "all": "All Time",
  };
  if (scope.preset !== "custom") return PRESETS[scope.preset] ?? scope.preset;
  const fmt = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(scope.from)} – ${fmt(scope.to)}`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex-1 min-w-0 rounded-lg px-5 py-4 flex flex-col justify-between"
      style={{ backgroundColor: T.white, border: `1px solid ${T.border}` }}
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="font-semibold uppercase tracking-widest"
          style={{ color: T.muted, fontSize: "10px", letterSpacing: "0.08em" }}
        >
          {label}
        </p>
        <Icon size={18} style={{ color: T.muted, flexShrink: 0 }} />
      </div>
      <p
        className="font-bold tabular-nums leading-none"
        style={{ color: valueColor ?? T.ink, fontSize: "26px" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5" style={{ color: T.muted, fontSize: "11px" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────

const COLS = [
  { key: "jobDate",      label: "JOB NO. / DATE",  width: 130, align: "left"  as const },
  { key: "company",      label: "COMPANY",          width: 160, align: "left"  as const },
  { key: "invoice",      label: "INVOICE NO.",      width: 120, align: "left"  as const },
  { key: "parts",        label: "PARTICULARS",      width: 160, align: "left"  as const },
  { key: "billed",       label: "BILLED AMOUNT",    width: 130, align: "right" as const },
  { key: "cost",         label: "COST OF SALES",    width: 130, align: "right" as const },
  { key: "gp",           label: "GROSS PROFIT",     width: 130, align: "right" as const },
  { key: "collected",    label: "COLLECTED",        width: 120, align: "right" as const },
  { key: "outstanding",  label: "OUTSTANDING",      width: 120, align: "right" as const },
];

interface TableTotals {
  billedAmount: number;
  costOfSales: number;
  grossProfit: number;
  collectedAmount: number;
  outstanding: number;
}

function DataTable({ rows, totals }: { rows: InvoiceReportRow[]; totals: TableTotals }) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 rounded-lg"
        style={{ border: `1px solid ${T.border}`, color: T.muted }}
      >
        <FileText size={32} style={{ color: T.border, marginBottom: 12 }} />
        <p style={{ fontSize: "14px", fontWeight: 600, color: T.muted }}>No invoices this period</p>
        <p style={{ fontSize: "12px", color: T.muted, marginTop: 4 }}>
          Try selecting a different month from the period selector above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 1200 }}>
          <thead>
            <tr style={{ backgroundColor: T.teal }}>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    minWidth: col.width,
                    textAlign: col.align,
                    color: "#FFFFFF",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    padding: "10px 12px",
                    whiteSpace: "nowrap",
                    borderRight: `1px solid rgba(255,255,255,0.12)`,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const isHovered = hoveredRow === row.invoiceId;
              const isEven = i % 2 === 1;
              const rowBg = isHovered ? T.tealTint : isEven ? T.subtleBg : T.white;
              const gpColor = row.grossProfit >= 0 ? T.teal : T.red;
              const outColor = row.outstanding <= 0 ? T.teal : T.amber;

              return (
                <tr
                  key={row.invoiceId}
                  onMouseEnter={() => setHoveredRow(row.invoiceId)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{ backgroundColor: rowBg, transition: "background-color 120ms ease" }}
                >
                  <td style={tdStyle}>
                    <p style={{ color: T.ink, fontSize: "12px", fontWeight: 600, lineHeight: 1.3 }}>
                      {row.projectNumber}
                    </p>
                    <p style={{ color: T.muted, fontSize: "11px", marginTop: 1 }}>
                      {formatDate(row.invoiceDate)}
                    </p>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: T.ink, fontSize: "13px" }}>{row.companyName}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: T.ink, fontSize: "13px" }}>{row.invoiceNumber}</span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 180 }} title={row.particulars}>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", color: T.ink, fontSize: "13px" }}>
                      {row.particulars}
                    </span>
                  </td>
                  {/* BILLED AMOUNT */}
                  <td style={{ ...tdNumStyle }}>
                    <span style={{ color: T.ink }}>{php(row.billedAmount)}</span>
                  </td>
                  {/* COST OF SALES */}
                  <td style={{ ...tdNumStyle }}>
                    <span style={{ color: T.amber }}>{php(row.costOfSales)}</span>
                  </td>
                  {/* GROSS PROFIT */}
                  <td style={{ ...tdNumStyle, fontWeight: 700 }}>
                    <span style={{ color: gpColor }}>{php(row.grossProfit)}</span>
                  </td>
                  {/* COLLECTED */}
                  <td style={{ ...tdNumStyle, fontWeight: 500 }}>
                    <span style={{ color: T.teal }}>{php(row.collectedAmount)}</span>
                  </td>
                  {/* OUTSTANDING */}
                  <td style={{ ...tdNumStyle, fontWeight: 600, borderRight: "none" }}>
                    <span style={{ color: outColor }}>{php(row.outstanding)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr style={{ backgroundColor: T.subtleBg, borderTop: `2px solid ${T.border}` }}>
              <td colSpan={4} style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: T.ink, letterSpacing: "0.06em", borderRight: `1px solid ${T.border}` }}>
                TOTAL · {rows.length} {rows.length === 1 ? "invoice" : "invoices"}
              </td>
              <td style={tfootCell}>{php(totals.billedAmount)}</td>
              <td style={{ ...tfootCell, color: T.amber }}>{php(totals.costOfSales)}</td>
              <td style={{ ...tfootCell, color: totals.grossProfit >= 0 ? T.teal : T.red }}>{php(totals.grossProfit)}</td>
              <td style={{ ...tfootCell, color: T.teal }}>{php(totals.collectedAmount)}</td>
              <td style={{ ...tfootCell, color: totals.outstanding <= 0 ? T.teal : T.amber, borderRight: "none" }}>{php(totals.outstanding)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: `1px solid ${T.border}`,
  borderRight: `1px solid ${T.border}`,
  verticalAlign: "top",
};

const tdNumStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: `1px solid ${T.border}`,
  borderRight: `1px solid ${T.border}`,
  textAlign: "right",
  fontSize: "13px",
  fontVariantNumeric: "tabular-nums",
};

const tfootCell: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "right",
  fontSize: "13px",
  fontWeight: 700,
  color: T.ink,
  borderRight: `1px solid ${T.border}`,
  fontVariantNumeric: "tabular-nums",
};

// ── Breakdown Cards ────────────────────────────────────────────────────────────

function BreakdownCards({
  periodLabel,
  totals,
}: {
  periodLabel: string;
  totals: TableTotals;
}) {
  const collectionRate = pct(totals.collectedAmount, totals.billedAmount);
  const grossMargin = pct(totals.grossProfit, totals.billedAmount);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Revenue Summary */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: T.tealTint }}>
          <p style={{ color: T.teal, fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>REVENUE SUMMARY</p>
          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(15,118,110,0.12)", color: T.teal, fontSize: "10px", fontWeight: 600 }}>
            {periodLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 px-4 py-2" style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.subtleBg }}>
          <span style={{ color: T.muted, fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em" }}>ITEM</span>
          <span style={{ color: T.muted, fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textAlign: "right" }}>AMOUNT</span>
        </div>
        {[
          { label: "Total Billed (Invoiced)", value: php(totals.billedAmount), color: T.ink },
          { label: "Total Collected (Cash Received)", value: php(totals.collectedAmount), color: T.teal },
          { label: "Outstanding AR (Uncollected)", value: php(totals.outstanding), color: totals.outstanding <= 0 ? T.teal : T.amber },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.white }}>
            <span style={{ color: T.ink, fontSize: "13px" }}>{row.label}</span>
            <span style={{ color: row.color, fontSize: "13px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 px-4 py-3" style={{ backgroundColor: T.tealTint }}>
          <span style={{ color: T.ink, fontSize: "13px", fontWeight: 700 }}>COLLECTION RATE</span>
          <span style={{ color: T.teal, fontSize: "15px", fontWeight: 700, textAlign: "right" }}>{collectionRate}</span>
        </div>
      </div>

      {/* Margin Summary */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: T.amberTint }}>
          <p style={{ color: T.amber, fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>MARGIN SUMMARY</p>
          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(217,119,6,0.12)", color: T.amber, fontSize: "10px", fontWeight: 600 }}>
            {periodLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 px-4 py-2" style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.subtleBg }}>
          <span style={{ color: T.muted, fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em" }}>ITEM</span>
          <span style={{ color: T.muted, fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textAlign: "right" }}>AMOUNT</span>
        </div>
        {[
          { label: "Total Billed (Revenue)", value: php(totals.billedAmount), color: T.ink },
          { label: "Cost of Sales (Direct Costs)", value: php(totals.costOfSales), color: T.amber },
          { label: "Gross Profit", value: php(totals.grossProfit), color: totals.grossProfit >= 0 ? T.teal : T.red },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: T.white }}>
            <span style={{ color: T.ink, fontSize: "13px" }}>{row.label}</span>
            <span style={{ color: row.color, fontSize: "13px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 px-4 py-3" style={{ backgroundColor: T.amberTint }}>
          <span style={{ color: T.ink, fontSize: "13px", fontWeight: 700 }}>GROSS MARGIN</span>
          <span style={{ color: totals.grossProfit >= 0 ? T.teal : T.red, fontSize: "15px", fontWeight: 700, textAlign: "right" }}>{grossMargin}</span>
        </div>
      </div>
    </div>
  );
}

function SignatureBlock() {
  return (
    <div className="mt-10 pb-2 flex justify-between gap-10">
      {(["Prepared By", "Reviewed By", "Approved By"] as const).map((label) => (
        <div key={label} className="flex-1 text-center">
          <div style={{ height: 44 }} />
          <div style={{ borderBottom: `1px solid ${T.ink}`, marginBottom: 8 }} />
          <p style={{ color: T.muted, fontSize: "12px", fontWeight: 500 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
      <div style={{ height: 40, backgroundColor: T.teal, opacity: 0.9 }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-2 px-3 py-2.5 animate-pulse"
          style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: i % 2 ? T.subtleBg : T.white }}
        >
          {COLS.map((col) => (
            <div
              key={col.key}
              className="h-3.5 rounded"
              style={{ minWidth: col.width * 0.55, backgroundColor: T.border, flexShrink: 0 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SalesReport({ data, scope }: SalesReportProps) {

  // ── Rows ──
  const rows = useMemo((): InvoiceReportRow[] => {
    const { invoices, billingItems, collections } = data;

    const periodInvoices = invoices.filter((inv) =>
      isInScope(inv.invoice_date || inv.created_at, scope)
    );

    return periodInvoices.map((inv) => {
      // BILLED AMOUNT — canonical invoice total
      const billedAmount = Number(inv.total_amount) || Number(inv.subtotal) || 0;

      // COST OF SALES — cost-type line items on this invoice
      const costOfSales = billingItems
        .filter((b: any) =>
          b.charge_type === "cost" &&
          (b.invoice_id === inv.id || b.invoice_number === inv.invoice_number)
        )
        .reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);

      const grossProfit = billedAmount - costOfSales;

      // COLLECTED — payments received against this invoice
      const { paidAmount: collectedAmount, balance: outstanding } = calculateInvoiceBalance(inv, collections);

      // PARTICULARS — service types array is most descriptive; fall back to notes
      const particulars =
        (Array.isArray(inv.service_types) && inv.service_types.length > 0
          ? inv.service_types.join(" / ")
          : null) ||
        inv.notes ||
        "—";

      const projectNumber = summarizeRefs(
        Array.isArray(inv.project_refs) && inv.project_refs.length > 0
          ? inv.project_refs
          : inv.project_number
            ? [inv.project_number]
            : []
      );

      return {
        invoiceId:       inv.id,
        invoiceNumber:   inv.invoice_number || "—",
        invoiceDate:     inv.invoice_date || inv.created_at || "",
        projectNumber,
        companyName:     inv.customer_name || "—",
        particulars,
        billedAmount,
        costOfSales,
        grossProfit,
        collectedAmount,
        outstanding,
      };
    });
  }, [data.invoices, data.billingItems, data.collections, scope]);

  // ── Aggregates ──
  const totals = useMemo((): TableTotals => ({
    billedAmount:    rows.reduce((s, r) => s + r.billedAmount, 0),
    costOfSales:     rows.reduce((s, r) => s + r.costOfSales, 0),
    grossProfit:     rows.reduce((s, r) => s + r.grossProfit, 0),
    collectedAmount: rows.reduce((s, r) => s + r.collectedAmount, 0),
    outstanding:     rows.reduce((s, r) => s + r.outstanding, 0),
  }), [rows]);

  const kpis = useMemo(() => ({
    totalBilled:    totals.billedAmount,
    totalCollected: totals.collectedAmount,
    outstanding:    totals.outstanding,
    invoiceCount:   rows.length,
  }), [totals, rows.length]);

  const periodLabel = formatScopeLabel(scope);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto" style={{ backgroundColor: T.white }}>

        {/* Document Header */}
        <div style={{ padding: "32px 48px 24px 48px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.white }}>
          <h1 style={{ fontSize: "32px", fontWeight: 600, color: T.ink, letterSpacing: "-1.2px", marginBottom: 4, lineHeight: 1.1 }}>
            Sales Report
          </h1>
          <p style={{ fontSize: "14px", color: T.muted }}>
            Per-invoice revenue breakdown · {periodLabel}
          </p>
        </div>

        {/* KPI Cards */}
        <div style={{ padding: "24px 48px" }}>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              icon={FileText}
              label="Total Billed"
              value={phpCompact(kpis.totalBilled)}
              sub={php(kpis.totalBilled)}
              valueColor={T.ink}
            />
            <KpiCard
              icon={DollarSign}
              label="Total Collected"
              value={phpCompact(kpis.totalCollected)}
              sub={php(kpis.totalCollected)}
              valueColor={T.teal}
            />
            <KpiCard
              icon={Clock}
              label="Outstanding AR"
              value={phpCompact(kpis.outstanding)}
              sub={kpis.outstanding <= 0 ? "Fully collected" : "Uncollected balance"}
              valueColor={kpis.outstanding <= 0 ? T.teal : T.amber}
            />
            <KpiCard
              icon={Hash}
              label="Invoices"
              value={String(kpis.invoiceCount)}
              sub={periodLabel}
            />
          </div>
        </div>

        {/* Data Table */}
        <div style={{ padding: "0 48px 24px 48px" }}>
          {data.isLoading ? <LedgerSkeleton /> : <DataTable rows={rows} totals={totals} />}
        </div>

        {/* Breakdown Cards */}
        <div style={{ padding: "0 48px 24px 48px" }}>
          <BreakdownCards periodLabel={periodLabel} totals={totals} />
        </div>

        {/* Signatures */}
        <div style={{ padding: "0 48px 48px 48px" }}>
          <SignatureBlock />
        </div>

      </div>
    </div>
  );
}
