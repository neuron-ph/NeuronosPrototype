/**
 * RevenueTrendChart — Zone 3R of the Financial Dashboard
 *
 * Stacked Revenue (teal) + Expenses (orange) bars with margin % labels.
 * Period toggle: 6M | 12M | YTD
 * Rich hover tooltip: mini P&L per month.
 * Pure CSS/HTML — no recharts dependency.
 */

import { useMemo, useState } from "react";
import { formatCurrencyCompact } from "../aggregate/types";
import { formatMoney } from "../../../utils/accountingCurrency";

interface RevenueTrendChartProps {
  invoices: any[];
  expenses: any[];
  /** Optional "View →" navigation */
  onNavigate?: () => void;
}

type Period = "6M" | "12M" | "YTD";

interface MonthData {
  month: string;
  monthKey: string;
  revenue: number;
  expenses: number;
  margin: number;
  marginAmt: number;
}

function getMonthKey(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function generateTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0];
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

function getMonthsForPeriod(period: Period): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];

  if (period === "YTD") {
    const currentMonth = now.getMonth();
    for (let m = 0; m <= currentMonth; m++) {
      const d = new Date(now.getFullYear(), m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: MONTH_NAMES[d.getMonth()] });
    }
  } else {
    const count = period === "12M" ? 12 : 6;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: MONTH_NAMES[d.getMonth()] });
    }
  }

  return months;
}

const fmt = (amount: number) => formatMoney(amount, "PHP");

export function RevenueTrendChart({ invoices, expenses, onNavigate }: RevenueTrendChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("6M");

  const data: MonthData[] = useMemo(() => {
    const months = getMonthsForPeriod(period);

    const revenueByMonth: Record<string, number> = {};
    for (const inv of invoices) {
      const mk = getMonthKey(inv.invoice_date || inv.created_at);
      if (mk) revenueByMonth[mk] = (revenueByMonth[mk] || 0) + (Number(inv.total_amount) || Number(inv.amount) || 0);
    }

    const expenseByMonth: Record<string, number> = {};
    for (const exp of expenses) {
      const mk = getMonthKey(exp.expenseDate || exp.expense_date || exp.createdAt || exp.created_at);
      if (mk) expenseByMonth[mk] = (expenseByMonth[mk] || 0) + (Number(exp.amount) || 0);
    }

    return months.map(({ key, label }) => {
      const rev = revenueByMonth[key] || 0;
      const exp = expenseByMonth[key] || 0;
      const marginAmt = rev - exp;
      const margin = rev > 0 ? Math.round((marginAmt / rev) * 100) : 0;
      return { month: label, monthKey: key, revenue: rev, expenses: exp, margin, marginAmt };
    });
  }, [invoices, expenses, period]);

  // Max is based on the larger of revenue or expenses for each month
  const maxVal = useMemo(() => Math.max(...data.map((d) => Math.max(d.revenue, d.expenses)), 1), [data]);
  const ticks = useMemo(() => generateTicks(maxVal), [maxVal]);
  const yMax = ticks[ticks.length - 1] || 1;

  const PERIODS: Period[] = ["6M", "12M", "YTD"];

  return (
    <div
      className="rounded-xl p-5 flex flex-col"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Revenue & Expenses
          </h3>

          {/* Period toggle */}
          <div className="flex items-center rounded-md p-0.5" style={{ background: "var(--theme-bg-surface-subtle)" }}>
            {PERIODS.map((p) => (
              <button
                key={p}
                className="px-2 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer"
                style={{
                  background: period === p ? "white" : "transparent",
                  color: period === p ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                  boxShadow: period === p ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {[
            { label: "Revenue", color: "var(--theme-action-primary-bg)", shape: "rounded-sm" },
            { label: "Expenses", color: "var(--theme-status-danger-fg)", shape: "rounded-sm" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 ${l.shape}`} style={{ backgroundColor: l.color }} />
              <span className="text-[10px]" style={{ color: "var(--theme-text-muted)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex" style={{ minHeight: "220px", height: "220px" }}>
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between pr-2" style={{ width: "60px" }}>
          {[...ticks].reverse().map((tick, i) => (
            <span key={`tick-${i}`} className="text-[10px] text-right tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
              {formatCurrencyCompact(tick)}
            </span>
          ))}
        </div>

        {/* Bars area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 relative">
            {/* Grid lines */}
            {ticks.map((tick, i) => (
              <div
                key={`grid-${i}`}
                className="absolute left-0 right-0"
                style={{ bottom: `${(tick / yMax) * 100}%`, borderTop: "1px dashed var(--neuron-pill-inactive-bg)" }}
              />
            ))}

            {/* Bar columns */}
            <div className="absolute inset-0 flex items-end gap-1 px-1">
              {data.map((item, idx) => {
                const revHeightPct = (item.revenue / yMax) * 100;
                const expHeightPct = (item.expenses / yMax) * 100;
                const isHovered = hoveredIdx === idx;

                return (
                  <div
                    key={item.monthKey}
                    className="flex-1 flex flex-col items-center relative"
                    style={{ height: "100%" }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    {/* Margin label above bar */}
                    {item.margin !== 0 && (
                      <div
                        className="absolute text-[9px] font-bold tabular-nums"
                        style={{
                          color: item.margin > 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)",
                          bottom: `${Math.min(Math.max(revHeightPct, expHeightPct) + 2, 95)}%`,
                          left: "50%",
                          transform: "translateX(-50%)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.margin}%
                      </div>
                    )}

                    {/* Side-by-side grouped bars */}
                    <div className="w-full flex-1 relative flex items-end gap-px px-px">
                      {/* Revenue bar */}
                      <div
                        className="flex-1 rounded-t-sm transition-all duration-500"
                        style={{
                          height: `${Math.max(revHeightPct, item.revenue > 0 ? 2 : 0)}%`,
                          backgroundColor: "var(--theme-action-primary-bg)",
                          opacity: isHovered ? 1 : 0.8,
                        }}
                      />
                      {/* Expenses bar */}
                      <div
                        className="flex-1 rounded-t-sm transition-all duration-500"
                        style={{
                          height: `${Math.max(expHeightPct, item.expenses > 0 ? 2 : 0)}%`,
                          backgroundColor: "#DC2626",
                          opacity: isHovered ? 1 : 0.8,
                        }}
                      />
                    </div>

                    {/* Rich hover tooltip */}
                    {isHovered && (
                      <div
                        className="absolute z-10 rounded-lg px-3 py-2.5 shadow-lg text-[11px] pointer-events-none"
                        style={{
                          background: "var(--theme-bg-surface)",
                          border: "1px solid var(--theme-border-default)",
                          bottom: `${Math.min(revHeightPct + 8, 88)}%`,
                          left: "50%",
                          transform: "translateX(-50%)",
                          whiteSpace: "nowrap",
                          minWidth: "140px",
                        }}
                      >
                        <div className="font-semibold mb-1.5" style={{ color: "var(--theme-text-primary)" }}>
                          {item.month}
                        </div>
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "#0F766E" }} />
                            <span style={{ color: "var(--theme-text-muted)" }}>Revenue</span>
                          </div>
                          <span className="font-bold tabular-nums" style={{ color: "var(--theme-action-primary-bg)" }}>
                            {fmt(item.revenue)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "#DC2626" }} />
                            <span style={{ color: "var(--theme-text-muted)" }}>Expenses</span>
                          </div>
                          <span className="font-bold tabular-nums" style={{ color: "var(--theme-status-danger-fg)" }}>
                            {fmt(item.expenses)}
                          </span>
                        </div>
                        <div
                          className="flex items-center justify-between gap-3 pt-1 mt-1"
                          style={{ borderTop: "1px solid var(--theme-border-subtle)" }}
                        >
                          <span style={{ color: "var(--theme-text-muted)" }}>Margin</span>
                          <span
                            className="font-bold tabular-nums"
                            style={{ color: item.marginAmt >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)" }}
                          >
                            {fmt(item.marginAmt)} ({item.margin}%)
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
          <div className="flex items-center gap-1 px-1 pt-2">
            {data.map((item) => (
              <div key={item.monthKey} className="flex-1 text-center text-[10px]" style={{ color: "var(--theme-text-muted)" }}>
                {item.month}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}