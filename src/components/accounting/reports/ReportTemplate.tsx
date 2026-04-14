// ReportTemplate — Shared design system for all financial reports.
//
// Exports:
//   R                     — color tokens (CSS vars)
//   reportPhp             — PHP currency formatter
//   reportPhpCompact      — compact PHP (₱1.2M, ₱550K)
//   reportPct             — percentage (num/denom)
//   reportFormatDate      — locale date string
//   reportFormatScopeLabel — human-readable DateScope label
//   ReportKpiCard         — KPI card with icon/label/value/sub
//   ReportTable<T>        — teal-header table with alternating rows + footer totals + skeleton
//   ReportBreakdownCards  — two-column summary card pair (e.g. Revenue + Margin)
//   ReportSignatureBlock  — Prepared By / Reviewed By / Approved By
//   ReportPageLayout      — outer wrapper (flex column, scrollable body)

import React, { useState } from "react";
import { FileText, type LucideIcon } from "lucide-react";
import type { DateScope } from "../aggregate/types";

// ── Design Tokens ──────────────────────────────────────────────────────────────

export const R = {
  ink:       "var(--neuron-ink-primary)",
  teal:      "var(--neuron-brand-green)",
  muted:     "var(--neuron-ink-muted)",
  border:    "var(--neuron-ui-border)",
  white:     "var(--neuron-bg-elevated)",
  subtleBg:  "var(--neuron-bg-page)",
  tealTint:  "var(--neuron-brand-green-100)",
  amberTint: "var(--neuron-semantic-warn-bg)",
  amber:     "var(--neuron-semantic-warn)",
  red:       "var(--neuron-semantic-danger)",
  success:   "var(--neuron-semantic-success)",
} as const;

// ── Formatters ─────────────────────────────────────────────────────────────────

export const reportPhp = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

export const reportPhpCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`;
  return reportPhp(n);
};

export const reportPct = (num: number, denom: number) =>
  denom === 0 ? "—" : `${((num / denom) * 100).toFixed(1)}%`;

export const reportFormatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

export const reportFormatScopeLabel = (scope: DateScope): string => {
  const PRESETS: Record<string, string> = {
    "this-week":    "This Week",
    "this-month":   "This Month",
    "this-quarter": "This Quarter",
    "ytd":          "Year to Date",
    "all":          "All Time",
  };
  if (scope.preset !== "custom") return PRESETS[scope.preset] ?? scope.preset;
  const fmt = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(scope.from)} – ${fmt(scope.to)}`;
};

// ── ReportKpiCard ──────────────────────────────────────────────────────────────

export interface ReportKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

export function ReportKpiCard({ icon: Icon, label, value, sub, valueColor }: ReportKpiCardProps) {
  return (
    <div
      className="flex-1 min-w-0 rounded-lg px-5 py-4 flex flex-col justify-between"
      style={{ backgroundColor: R.white, border: `1px solid ${R.border}` }}
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="font-semibold uppercase tracking-widest"
          style={{ color: R.muted, fontSize: "10px", letterSpacing: "0.08em" }}
        >
          {label}
        </p>
        <Icon size={18} style={{ color: R.muted, flexShrink: 0 }} />
      </div>
      <p
        className="font-bold tabular-nums leading-none"
        style={{ color: valueColor ?? R.ink, fontSize: "26px" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5" style={{ color: R.muted, fontSize: "11px" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── ReportTable ────────────────────────────────────────────────────────────────

export interface ReportColumnDef<T> {
  header: string;
  width?: number;
  align?: "left" | "right";
  cell: (row: T) => React.ReactNode;
}

export interface ReportFooterCell {
  value: React.ReactNode;
  color?: string;
}

interface ReportTableProps<T> {
  columns: ReportColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Number of leading columns to merge into the footer label cell */
  footerLabelSpan?: number;
  footerLabel?: string;
  /** One cell per non-label column, left-to-right */
  footerCells?: ReportFooterCell[];
  isLoading?: boolean;
  emptyMessage?: string;
}

function ReportSkeleton({ cols }: { cols: number }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${R.border}` }}>
      <div style={{ height: 40, backgroundColor: R.teal, opacity: 0.9 }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-2 px-3 py-2.5 animate-pulse"
          style={{ borderBottom: `1px solid ${R.border}`, backgroundColor: i % 2 ? R.subtleBg : R.white }}
        >
          {Array.from({ length: cols }).map((__, j) => (
            <div
              key={j}
              className="h-3.5 rounded flex-1"
              style={{ backgroundColor: R.border }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReportTable<T>({
  columns,
  data,
  rowKey,
  footerLabelSpan = 1,
  footerLabel,
  footerCells,
  isLoading,
  emptyMessage = "No data this period.",
}: ReportTableProps<T>) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (isLoading) return <ReportSkeleton cols={columns.length} />;

  if (data.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 rounded-lg"
        style={{ border: `1px solid ${R.border}`, color: R.muted }}
      >
        <FileText size={32} style={{ color: R.border, marginBottom: 12 }} />
        <p style={{ fontSize: "14px", fontWeight: 600, color: R.muted }}>{emptyMessage}</p>
      </div>
    );
  }

  const minWidth = columns.reduce((s, c) => s + (c.width ?? 120), 0);

  const tdBase: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: `1px solid ${R.border}`,
    borderRight: `1px solid ${R.border}`,
    verticalAlign: "top",
    fontSize: "13px",
  };

  const tdNum: React.CSSProperties = {
    ...tdBase,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  };

  const tfootCell: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "right",
    fontSize: "13px",
    fontWeight: 700,
    color: R.ink,
    borderRight: `1px solid ${R.border}`,
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${R.border}` }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth }}>
          <thead>
            <tr style={{ backgroundColor: R.tealTint }}>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    minWidth: col.width,
                    textAlign: col.align ?? "left",
                    color: R.ink,
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    padding: "10px 12px",
                    whiteSpace: "nowrap",
                    borderRight: `1px solid ${R.border}`,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.map((row, i) => {
              const key = rowKey(row);
              const isHovered = hoveredKey === key;
              const isEven = i % 2 === 1;
              const rowBg = isHovered ? R.tealTint : isEven ? R.subtleBg : R.white;

              return (
                <tr
                  key={key}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={{ backgroundColor: rowBg, transition: "background-color 120ms ease" }}
                >
                  {columns.map((col, j) => (
                    <td
                      key={j}
                      style={
                        j === columns.length - 1
                          ? { ...((col.align === "right" ? tdNum : tdBase)), borderRight: "none" }
                          : col.align === "right"
                            ? tdNum
                            : tdBase
                      }
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {(footerLabel !== undefined || footerCells) && (
            <tfoot>
              <tr style={{ backgroundColor: R.subtleBg, borderTop: `2px solid ${R.border}` }}>
                {footerLabelSpan > 0 && (
                  <td
                    colSpan={footerLabelSpan}
                    style={{
                      padding: "10px 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: R.ink,
                      letterSpacing: "0.06em",
                      borderRight: `1px solid ${R.border}`,
                    }}
                  >
                    {footerLabel}
                  </td>
                )}
                {footerCells?.map((cell, i) => (
                  <td
                    key={i}
                    style={{
                      ...tfootCell,
                      color: cell.color ?? R.ink,
                      borderRight: i === footerCells.length - 1 ? "none" : `1px solid ${R.border}`,
                    }}
                  >
                    {cell.value}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── ReportBreakdownCards ───────────────────────────────────────────────────────

export interface ReportSummaryCardRow {
  label: string;
  value: string;
  color?: string;
  /** Numeric magnitude used to render proportion bars when card.showProgressBars is true */
  numericValue?: number;
}

export interface ReportSummaryCardDef {
  title: string;
  /** @deprecated — kept for backward compat, no longer used for styling */
  accentBg?: string;
  /** @deprecated — kept for backward compat, no longer used for styling */
  accentText?: string;
  /** @deprecated — kept for backward compat, no longer used for styling */
  badgeBg?: string;
  rows: ReportSummaryCardRow[];
  footerLabel: string;
  footerValue: string;
  footerValueColor?: string;
  /** When true, renders a teal proportion bar below each row that has a numericValue */
  showProgressBars?: boolean;
}

interface ReportBreakdownCardsProps {
  left: ReportSummaryCardDef;
  right: ReportSummaryCardDef;
  periodLabel: string;
}

export function ReportBreakdownCards({ left, right, periodLabel }: ReportBreakdownCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[left, right].map((card) => {
        const total = card.showProgressBars
          ? card.rows.reduce((s, r) => s + (r.numericValue ?? 0), 0)
          : 0;

        return (
          <div
            key={card.title}
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${R.border}`, backgroundColor: R.white }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${R.border}` }}
            >
              <p style={{ color: R.ink, fontSize: "13px", fontWeight: 600 }}>
                {card.title}
              </p>
              <span
                style={{
                  backgroundColor: R.subtleBg,
                  color: R.muted,
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: `1px solid ${R.border}`,
                }}
              >
                {periodLabel}
              </span>
            </div>

            {/* Rows */}
            {card.rows.map((row) => {
              const pct = card.showProgressBars && total > 0 && row.numericValue !== undefined
                ? (row.numericValue / total) * 100
                : 0;

              return (
                <div
                  key={row.label}
                  className="px-4 py-2.5"
                  style={{ borderBottom: `1px solid ${R.border}`, backgroundColor: R.white }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ color: R.ink, fontSize: "13px" }}>{row.label}</span>
                    <span style={{ color: row.color ?? R.ink, fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.value}
                    </span>
                  </div>
                  {card.showProgressBars && row.numericValue !== undefined && total > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: R.border, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: R.teal, borderRadius: 4 }} />
                      </div>
                      <span style={{ color: R.muted, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap", minWidth: 28, textAlign: "right" }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Footer */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: R.subtleBg, borderTop: `1px solid ${R.border}` }}
            >
              <span style={{ color: R.muted, fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                {card.footerLabel}
              </span>
              <span style={{ color: card.footerValueColor ?? R.ink, fontSize: "15px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {card.footerValue}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ReportSignatureBlock ───────────────────────────────────────────────────────

export function ReportSignatureBlock() {
  return (
    <div className="mt-10 pb-2 flex justify-between gap-10">
      {(["Prepared By", "Reviewed By", "Approved By"] as const).map((label) => (
        <div key={label} className="flex-1 text-center">
          <div style={{ height: 44 }} />
          <div style={{ borderBottom: `1px solid ${R.ink}`, marginBottom: 8 }} />
          <p style={{ color: R.muted, fontSize: "12px", fontWeight: 500 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── ReportPageLayout ───────────────────────────────────────────────────────────

interface ReportPageLayoutProps {
  children: React.ReactNode;
}

export function ReportPageLayout({ children }: ReportPageLayoutProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto" style={{ backgroundColor: R.white }}>
        {children}
      </div>
    </div>
  );
}
