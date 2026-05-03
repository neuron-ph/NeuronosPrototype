/**
 * PLTrendCard — Unified P&L Trend visualization
 *
 * Pixel-matched to Figma reference, light mode with Neuron colors.
 * 70/30 horizontal split:
 *   Left  — Side-by-side grouped bar chart (Revenue + Expenses)
 *   Right — Cash Flow Summary (Revenue, Expenses, Net Profit, Collected, Net Cash)
 */

import { useMemo, useState } from "react";
import { formatCurrencyCompact, createDateScope, isInScope } from "../aggregate/types";
import { formatMoney } from "../../../utils/accountingCurrency";
import type { DateScope } from "../aggregate/types";
import { ScopeBar } from "../aggregate/ScopeBar";

interface PLTrendCardProps {
  invoices: any[];
  expenses: any[];
  collections: any[];
  invoicedRevenue: number;
  totalCollected: number;
  outstandingAR: number;
  totalExpenses?: number;
}

interface MonthData {
  month: string;
  monthKey: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getMonthKey(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateTicks(maxVal: number): number[] {
  if (maxVal <= 0) {
    // When all data is zero, show a sensible default scale
    return [0, 50000, 100000, 150000, 200000, 250000];
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  let step = magnitude;
  if (maxVal / step < 3) step = magnitude / 2;
  if (maxVal / step > 6) step = magnitude * 2;
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal * 1.1; v += step) {
    ticks.push(v);
  }
  return ticks.length > 1 ? ticks : [0, maxVal];
}

const fmtFull = (amount: number) => formatMoney(amount, "PHP");

// ── Chart constants (from Figma) ──
const CHART_AREA_HEIGHT = 220; // bar area height in px
const BAR_RADIUS = 4;
const Y_AXIS_WIDTH = 55; // px

export function PLTrendCard({
  invoices,
  expenses,
  collections,
  invoicedRevenue,
  totalCollected,
  outstandingAR,
  totalExpenses: totalExpensesProp,
}: PLTrendCardProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [chartScope, setChartScope] = useState<DateScope>(() => createDateScope("this-month"));

  // ── Compute monthly data ──
  const data: MonthData[] = useMemo(() => {
    // Derive months from chartScope
    const fromDate = chartScope.from;
    const toDate = chartScope.to;
    const months: { key: string; label: string }[] = [];
    const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    while (cursor <= endMonth) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: MONTH_NAMES[cursor.getMonth()] });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const revenueByMonth: Record<string, number> = {};
    for (const inv of invoices) {
      const mk = getMonthKey(inv.invoice_date || inv.created_at);
      if (mk && isInScope(mk, chartScope)) revenueByMonth[mk] = (revenueByMonth[mk] || 0) + (Number(inv.total_amount) || Number(inv.amount) || 0);
    }
    const expenseByMonth: Record<string, number> = {};
    for (const exp of expenses) {
      const mk = getMonthKey(exp.expenseDate || exp.expense_date || exp.createdAt || exp.created_at);
      if (mk && isInScope(mk, chartScope)) expenseByMonth[mk] = (expenseByMonth[mk] || 0) + (Number(exp.amount) || 0);
    }
    return months.map(({ key, label }) => {
      const rev = revenueByMonth[key] || 0;
      const exp = expenseByMonth[key] || 0;
      const profit = rev - exp;
      const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
      return { month: label, monthKey: key, revenue: rev, expenses: exp, profit, margin };
    });
  }, [invoices, expenses, chartScope]);

  // ── Period totals ──
  const periodTotals = useMemo(() => {
    const totalRev = data.reduce((s, d) => s + d.revenue, 0);
    const totalExp = data.reduce((s, d) => s + d.expenses, 0);
    return { totalRev, totalExp, totalProfit: totalRev - totalExp };
  }, [data]);

  // ── Chart scales ──
  const maxVal = useMemo(
    () => Math.max(...data.map((d) => Math.max(d.revenue, d.expenses)), 0),
    [data]
  );
  const ticks = useMemo(() => generateTicks(maxVal), [maxVal]);
  const yMax = ticks[ticks.length - 1] || 1;

  // ── Summary numbers (computed from chartScope-filtered data) ──
  const scopedRevenue = useMemo(() => {
    return invoices
      .filter((inv: any) => isInScope(inv.invoice_date || inv.created_at, chartScope))
      .reduce((s: number, inv: any) => s + (Number(inv.total_amount) || Number(inv.amount) || 0), 0);
  }, [invoices, chartScope]);

  const scopedExpenses = useMemo(() => {
    return expenses
      .filter((exp: any) => isInScope(exp.expenseDate || exp.expense_date || exp.createdAt || exp.created_at, chartScope))
      .reduce((s: number, exp: any) => s + (Number(exp.amount) || 0), 0);
  }, [expenses, chartScope]);

  const scopedCollected = useMemo(() => {
    const filtered = collections
      .filter((c: any) => {
        const dateField = c.collection_date || c.created_at;
        return isInScope(dateField, chartScope);
      });
    if (filtered.length > 0) {
      console.log(`[PLTrendCard] ${filtered.length} collections matched scope ${chartScope.preset} (${chartScope.from.toISOString()} – ${chartScope.to.toISOString()}):`,
        filtered.map((c: any) => ({ id: c.id, date: c.collection_date, created: c.created_at, amount: c.amount }))
      );
    }
    return filtered.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0);
  }, [collections, chartScope]);

  const netProfit = scopedRevenue - scopedExpenses;
  const netCash = scopedCollected - scopedExpenses;
  const profitMargin = scopedRevenue > 0 ? (netProfit / scopedRevenue) * 100 : 0;
  const collectionRate = scopedRevenue > 0 ? (scopedCollected / scopedRevenue) * 100 : 0;

  const summaryItems = [
    { label: "Revenue", value: scopedRevenue, color: "var(--theme-action-primary-bg)", sub: null as string | null },
    { label: "Expenses", value: scopedExpenses, color: "var(--theme-status-danger-fg)", sub: null },
    { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)", sub: `${profitMargin.toFixed(1)}% margin` },
    { label: "Collected", value: scopedCollected, color: "var(--theme-action-primary-bg)", sub: `${collectionRate.toFixed(0)}% of invoiced` },
    { label: "Net Cash", value: netCash, color: netCash >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)", sub: "Collected – Expenses" },
  ];

  // ── Anomaly insight line ──
  const insightLine = useMemo(() => {
    if (data.length < 4) return null; // Need at least 4 months for a meaningful 3-month moving average

    let worstAnomaly: { month: string; pctAbove: number; topCategory: string; topAmount: number } | null = null;

    for (let i = 3; i < data.length; i++) {
      const avg3 = (data[i - 1].expenses + data[i - 2].expenses + data[i - 3].expenses) / 3;
      if (avg3 <= 0) continue;
      const pctAbove = ((data[i].expenses - avg3) / avg3) * 100;
      if (pctAbove >= 30 && (!worstAnomaly || pctAbove > worstAnomaly.pctAbove)) {
        // Find top expense category for this month
        const monthKey = data[i].monthKey;
        const categoryTotals: Record<string, number> = {};
        for (const exp of expenses) {
          const mk = getMonthKey(exp.expenseDate || exp.expense_date || exp.createdAt || exp.created_at);
          if (mk === monthKey) {
            const cat = exp.expenseCategory || exp.expense_category || "Other";
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(exp.amount) || 0);
          }
        }
        const topEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
        worstAnomaly = {
          month: data[i].month,
          pctAbove: Math.round(pctAbove),
          topCategory: topEntry?.[0] || "Unknown",
          topAmount: topEntry?.[1] || 0,
        };
      }
    }

    if (worstAnomaly) {
      return `Expenses in ${worstAnomaly.month} were ${worstAnomaly.pctAbove}% above your 3-month average — primarily from ${worstAnomaly.topCategory} (${formatCurrencyCompact(worstAnomaly.topAmount)}).`;
    }
    return data.some((d) => d.expenses > 0) ? "Expenses are tracking within normal range." : null;
  }, [data, expenses]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1px solid var(--theme-border-default)",
        background: "var(--theme-bg-surface)",
        boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Two-column layout with full-height divider ── */}
      <div className="flex" style={{ padding: "12px 16px 12px" }}>
        {/* ── LEFT COLUMN: Header + Chart (~62%) ── */}
        <div className="flex-[62] flex flex-col">
          {/* Header row */}
          <div className="flex items-center" style={{ marginBottom: "10px" }}>
            {/* P&L Trend title */}
            <span
              className="font-semibold uppercase whitespace-nowrap"
              style={{
                fontSize: "12px",
                letterSpacing: "0.6px",
                color: "var(--theme-text-muted)",
              }}
            >
              P&L Trend
            </span>

            {/* Scope date picker */}
            <div className="ml-3">
              <ScopeBar scope={chartScope} onScopeChange={setChartScope} standalone />
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 ml-5">
              <div className="flex items-center gap-1.5">
                <div
                  className="rounded-full"
                  style={{ width: "8px", height: "8px", background: "var(--theme-action-primary-bg)" }}
                />
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Revenue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="rounded-full"
                  style={{ width: "8px", height: "8px", background: "var(--theme-status-danger-fg)" }}
                />
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Expenses</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="flex" style={{ height: `${CHART_AREA_HEIGHT + 24}px` }}>
            {/* Y-axis */}
            <div
              className="flex flex-col justify-between flex-shrink-0"
              style={{ width: `${Y_AXIS_WIDTH}px`, height: `${CHART_AREA_HEIGHT}px`, paddingRight: "8px" }}
            >
              {[...ticks].reverse().map((tick, i) => (
                <span
                  key={`tick-${i}`}
                  className="text-right tabular-nums leading-none"
                  style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}
                >
                  {formatCurrencyCompact(tick)}
                </span>
              ))}
            </div>

            {/* Chart body */}
            <div className="flex-1 flex flex-col">
              {/* Bar area */}
              <div className="relative" style={{ height: `${CHART_AREA_HEIGHT}px` }}>
                {/* Grid lines */}
                {ticks.map((tick, i) => (
                  <div
                    key={`grid-${i}`}
                    className="absolute"
                    style={{
                      bottom: `${(tick / yMax) * 100}%`,
                      left: 0,
                      right: 0,
                      height: "1px",
                      background: "var(--neuron-pill-inactive-bg)",
                    }}
                  />
                ))}

                {/* Bar columns */}
                <div className="absolute inset-0 flex">
                  {data.map((item, idx) => {
                    const revPct = (item.revenue / yMax) * 100;
                    const expPct = (item.expenses / yMax) * 100;
                    const isHovered = hoveredIdx === idx;

                    return (
                      <div
                        key={item.monthKey}
                        className="flex-1 relative cursor-pointer"
                        style={{ height: "100%" }}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        {/* Side-by-side bar pair */}
                        <div
                          className="absolute bottom-0 flex items-end"
                          style={{
                            left: "16%",
                            right: "16%",
                            height: "100%",
                            gap: "4px",
                          }}
                        >
                          {/* Revenue bar */}
                          <div
                            className="flex-1 transition-opacity duration-200"
                            style={{
                              height: `${Math.max(revPct, item.revenue > 0 ? 1.5 : 0)}%`,
                              backgroundColor: "var(--theme-action-primary-bg)",
                              borderRadius: `${BAR_RADIUS}px ${BAR_RADIUS}px 0 0`,
                              opacity: isHovered ? 1 : 0.88,
                            }}
                          />
                          {/* Expense bar */}
                          <div
                            className="flex-1 transition-opacity duration-200"
                            style={{
                              height: `${Math.max(expPct, item.expenses > 0 ? 1.5 : 0)}%`,
                              backgroundColor: "var(--theme-status-danger-fg)",
                              borderRadius: `${BAR_RADIUS}px ${BAR_RADIUS}px 0 0`,
                              opacity: isHovered ? 1 : 0.88,
                            }}
                          />
                        </div>

                        {/* Tooltip */}
                        {isHovered && (
                          <div
                            className="absolute z-20 rounded-lg shadow-lg pointer-events-none"
                            style={{
                              background: "var(--theme-bg-surface)",
                              border: "1px solid var(--theme-border-default)",
                              bottom: `${Math.min(Math.max(revPct, expPct) + 6, 88)}%`,
                              left: "50%",
                              transform: "translateX(-50%)",
                              whiteSpace: "nowrap",
                              padding: "10px 14px",
                              minWidth: "160px",
                            }}
                          >
                            <div
                              className="font-semibold"
                              style={{ fontSize: "13px", color: "var(--theme-text-primary)", marginBottom: "8px" }}
                            >
                              {item.month}
                            </div>
                            <div className="flex items-center justify-between" style={{ gap: "16px", marginBottom: "4px" }}>
                              <div className="flex items-center gap-1.5">
                                <div className="rounded-full" style={{ width: "8px", height: "8px", background: "var(--theme-action-primary-bg)" }} />
                                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Revenue</span>
                              </div>
                              <span className="font-bold tabular-nums" style={{ fontSize: "12px", color: "var(--theme-action-primary-bg)" }}>
                                {fmtFull(item.revenue)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between" style={{ gap: "16px", marginBottom: "4px" }}>
                              <div className="flex items-center gap-1.5">
                                <div className="rounded-full" style={{ width: "8px", height: "8px", background: "var(--theme-status-danger-fg)" }} />
                                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Expenses</span>
                              </div>
                              <span className="font-bold tabular-nums" style={{ fontSize: "12px", color: "var(--theme-status-danger-fg)" }}>
                                {fmtFull(item.expenses)}
                              </span>
                            </div>
                            <div
                              className="flex items-center justify-between"
                              style={{ gap: "16px", paddingTop: "6px", marginTop: "6px", borderTop: "1px solid var(--theme-border-subtle)" }}
                            >
                              <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Net Profit</span>
                              <span
                                className="font-bold tabular-nums"
                                style={{ fontSize: "12px", color: item.profit >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)" }}
                              >
                                {fmtFull(item.profit)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* X-axis labels */}
              <div className="flex" style={{ paddingTop: "4px" }}>
                {data.map((item) => (
                  <div
                    key={item.monthKey}
                    className="flex-1 text-center"
                    style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}
                  >
                    {item.month}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Full-height vertical divider ── */}
        <div className="flex-shrink-0 flex justify-center" style={{ width: "32px" }}>
          <div style={{ width: "1px", background: "var(--theme-border-default)", alignSelf: "stretch" }} />
        </div>

        {/* ── RIGHT COLUMN: Header + Summary (~30%) ── */}
        <div className="flex-[30] flex flex-col" style={{ minWidth: 0 }}>
          {/* Cash Flow Summary heading */}
          <div className="flex items-center justify-end" style={{ marginBottom: "10px", minHeight: "36px" }}>
            <span
              className="font-semibold uppercase whitespace-nowrap"
              style={{
                fontSize: "12px",
                letterSpacing: "0.6px",
                color: "var(--theme-text-muted)",
              }}
            >
              Cash Flow Summary
            </span>
          </div>

          {/* Summary items */}
          <div className="flex flex-col justify-between" style={{ height: `${CHART_AREA_HEIGHT}px` }}>
            {summaryItems.map((item) => {
              return (
                <div
                  key={item.label}
                >
                  <div className="flex items-baseline justify-between">
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                      {item.label}
                    </span>
                    <div className="text-right">
                      <span
                        className="tabular-nums block"
                        style={{
                          fontSize: "14px",
                          color: item.color,
                          letterSpacing: "-0.3px",
                          lineHeight: "20px",
                        }}
                      >
                        {fmtFull(item.value)}
                      </span>
                      {item.sub && (
                        <span
                          className="block"
                          style={{
                            fontSize: "10px",
                            color: "var(--theme-text-muted)",
                            lineHeight: "13px",
                          }}
                        >
                          {item.sub}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Anomaly insight line */}
      {insightLine && (
        <div
          className="px-4 py-2"
          style={{ borderTop: "1px solid var(--theme-border-subtle)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
            {insightLine}
          </p>
        </div>
      )}
    </div>
  );
}