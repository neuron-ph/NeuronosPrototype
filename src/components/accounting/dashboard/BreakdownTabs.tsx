/**
 * BreakdownTabs — Consolidated Zone 5 of the Financial Dashboard
 *
 * Replaces separate ServiceProfitability + TopCustomers + IncomeVsCostBreakdown
 * with a single card featuring tab pills: [ By Service | By Customer | By Category ]
 *
 * Reduces vertical scroll while maintaining full data depth via progressive disclosure.
 */

import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { formatCurrencyCompact } from "../aggregate/types";

interface BreakdownTabsProps {
  billingItems: any[];
  invoices: any[];
  expenses: any[];
  /** Optional "View →" navigation callback */
  onNavigateTab?: (tab: "billings" | "invoices" | "collections" | "expenses") => void;
}

type TabKey = "service" | "customer" | "category";

const TABS: { key: TabKey; label: string }[] = [
  { key: "service", label: "By Service" },
  { key: "customer", label: "By Customer" },
  { key: "category", label: "By Category" },
];

// ── Service Type Normalization ──

const SERVICE_TYPE_MAP: Record<string, string> = {
  forwarding: "Forwarding",
  "freight forwarding": "Forwarding",
  brokerage: "Brokerage",
  "customs brokerage": "Brokerage",
  trucking: "Trucking",
  "marine insurance": "Marine Insurance",
  marine: "Marine Insurance",
  insurance: "Marine Insurance",
  others: "Others",
};

function normalizeServiceType(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  return SERVICE_TYPE_MAP[lower] || (lower ? raw.trim() : "Others");
}

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);

// ── Service Profitability Tab ──

interface ServiceRow {
  service: string;
  revenue: number;
  costs: number;
  margin: number;
  marginPct: number;
}

function ServiceTab({ billingItems, invoices, expenses }: { billingItems: any[]; invoices: any[]; expenses: any[] }) {
  const rows: ServiceRow[] = useMemo(() => {
    const revenueMap: Record<string, number> = {};
    const costMap: Record<string, number> = {};

    for (const item of [...invoices, ...billingItems]) {
      const svc = normalizeServiceType(item.service_type || "");
      const amount = Number(item.total_amount) || Number(item.amount) || 0;
      revenueMap[svc] = (revenueMap[svc] || 0) + amount;
    }

    for (const exp of expenses) {
      const svc = normalizeServiceType(exp.service_type || "");
      const amount = Number(exp.amount) || 0;
      costMap[svc] = (costMap[svc] || 0) + amount;
    }

    const allServices = new Set([...Object.keys(revenueMap), ...Object.keys(costMap)]);
    const result: ServiceRow[] = [];

    for (const svc of allServices) {
      const revenue = revenueMap[svc] || 0;
      const costs = costMap[svc] || 0;
      const margin = revenue - costs;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : costs > 0 ? -100 : 0;
      result.push({ service: svc, revenue, costs, margin, marginPct });
    }

    result.sort((a, b) => b.revenue - a.revenue);
    return result;
  }, [billingItems, invoices, expenses]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
  const totalMargin = totalRevenue - totalCosts;
  const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  if (rows.length === 0) {
    return <EmptyState text="No service data available" />;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface-subtle)" }}>
            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Service</th>
            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Revenue</th>
            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Costs</th>
            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>Margin</th>
            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider w-16" style={{ color: "var(--theme-text-muted)" }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isLowMargin = row.marginPct < 15 && row.marginPct >= 0;
            const isNegative = row.marginPct < 0;
            return (
              <tr key={row.service} style={{ borderBottom: "1px solid var(--theme-border-subtle)" }} className="hover:bg-[var(--theme-bg-surface-subtle)]/50">
                <td className="px-5 py-2.5 text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>{row.service}</td>
                <td className="px-5 py-2.5 text-[13px] text-right tabular-nums" style={{ color: "var(--theme-action-primary-bg)" }}>{formatCurrencyCompact(row.revenue)}</td>
                <td className="px-5 py-2.5 text-[13px] text-right tabular-nums" style={{ color: "var(--theme-status-warning-fg)" }}>{formatCurrencyCompact(row.costs)}</td>
                <td className="px-5 py-2.5 text-[13px] text-right font-semibold tabular-nums" style={{ color: isNegative ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
                  {formatCurrencyCompact(row.margin)}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <MarginBadge value={row.marginPct} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--theme-border-default)", background: "var(--theme-bg-surface-subtle)" }}>
            <td className="px-5 py-2.5 text-[12px] font-bold" style={{ color: "var(--theme-text-primary)" }}>Total</td>
            <td className="px-5 py-2.5 text-[12px] text-right font-bold tabular-nums" style={{ color: "var(--theme-action-primary-bg)" }}>{formatCurrencyCompact(totalRevenue)}</td>
            <td className="px-5 py-2.5 text-[12px] text-right font-bold tabular-nums" style={{ color: "var(--theme-status-warning-fg)" }}>{formatCurrencyCompact(totalCosts)}</td>
            <td className="px-5 py-2.5 text-[12px] text-right font-bold tabular-nums" style={{ color: totalMargin < 0 ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
              {formatCurrencyCompact(totalMargin)}
            </td>
            <td className="px-5 py-2.5 text-right">
              <MarginBadge value={totalMarginPct} bold />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Top Customers Tab ──

function CustomerTab({ billingItems, invoices }: { billingItems: any[]; invoices: any[] }) {
  const { rows, totalRevenue, hasConcentrationRisk } = useMemo(() => {
    const customerMap: Record<string, number> = {};

    for (const item of [...invoices, ...billingItems]) {
      const name = (item.customer_name || item.customerName || "").trim() || "Unknown Customer";
      const amount = Number(item.total_amount) || Number(item.amount) || 0;
      customerMap[name] = (customerMap[name] || 0) + amount;
    }

    const total = Object.values(customerMap).reduce((s, v) => s + v, 0);
    const sorted = Object.entries(customerMap)
      .map(([name, revenue]) => ({ name, revenue, pct: total > 0 ? (revenue / total) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7);

    return { rows: sorted, totalRevenue: total, hasConcentrationRisk: sorted.some((r) => r.pct > 40) };
  }, [billingItems, invoices]);

  const maxRevenue = rows.length > 0 ? rows[0].revenue : 1;

  if (rows.length === 0) {
    return <EmptyState text="No customer data available" />;
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {hasConcentrationRisk && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold self-start"
          style={{ backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" }}
        >
          <AlertTriangle size={12} />
          Concentration Risk — single customer &gt; 40% of revenue
        </div>
      )}

      {rows.map((row, idx) => {
        const barWidth = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0;
        const isRisky = row.pct > 40;
        return (
          <div key={row.name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-semibold w-4 text-center flex-shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                  {idx + 1}
                </span>
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
                  {row.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
                  {formatCurrencyCompact(row.revenue)}
                </span>
                <span
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums"
                  style={{
                    backgroundColor: isRisky ? "var(--theme-status-warning-bg)" : "var(--neuron-pill-inactive-bg)",
                    color: isRisky ? "var(--theme-status-warning-fg)" : "var(--neuron-pill-inactive-text)",
                  }}
                >
                  {row.pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <div className="h-2 rounded-full overflow-hidden flex-1" style={{ backgroundColor: "var(--theme-bg-surface-subtle)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: isRisky ? "var(--theme-status-warning-fg)" : "var(--theme-action-primary-bg)" }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {rows.length >= 5 && totalRevenue > 0 && (
        <div className="pt-2 mt-1 flex items-center justify-between" style={{ borderTop: "1px dashed var(--theme-border-default)" }}>
          <span className="text-[11px] pl-6" style={{ color: "var(--theme-text-muted)" }}>Others</span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
            {formatCurrencyCompact(totalRevenue - rows.reduce((s, r) => s + r.revenue, 0))}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Category Breakdown Tab (Income vs Cost) ──

function CategoryTab({ invoices, billingItems, expenses }: { invoices: any[]; billingItems: any[]; expenses: any[] }) {
  // Income categories
  const { incomeRows, totalIncome } = useMemo(() => {
    const unbilledItems = billingItems.filter((b: any) => (b.status || "").toLowerCase() === "unbilled");
    const combined = [...invoices, ...unbilledItems];
    const categoryMap: Record<string, number> = {};

    for (const item of combined) {
      const category = item.charge_code || item.quotation_category || item.description || "General Revenue";
      const amount = Number(item.amount) || Number(item.total_amount) || 0;
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    }

    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    const rows = Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    return { incomeRows: rows, totalIncome: total };
  }, [invoices, billingItems]);

  // Cost categories
  const { costRows, totalCost } = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    for (const item of expenses) {
      const category = item.expenseCategory || item.expense_category || item.expense_type || item.description || "General Expense";
      const amount = Number(item.amount) || 0;
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    }

    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    const rows = Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    return { costRows: rows, totalCost: total };
  }, [expenses]);

  const margin = totalIncome - totalCost;
  const marginPct = totalIncome > 0 ? (margin / totalIncome) * 100 : 0;
  const maxVal = Math.max(totalIncome, totalCost, 1);

  return (
    <div className="flex flex-col">
      {/* Comparison bars */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-medium" style={{ color: "var(--theme-text-muted)" }}>Income vs Cost</span>
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: margin >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)" }}
          >
            Margin: {fmt(margin)} ({marginPct.toFixed(1)}%)
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <BarRow label="Income" amount={totalIncome} maxVal={maxVal} color="var(--theme-action-primary-bg)" />
          <BarRow label="Cost" amount={totalCost} maxVal={maxVal} color="var(--theme-status-warning-fg)" />
        </div>
      </div>

      {/* Unified category table */}
      <div style={{ borderTop: "1px solid var(--theme-border-default)" }}>
        <div className="grid grid-cols-2 divide-x" style={{ borderColor: "var(--theme-border-default)" }}>
          {/* Income column */}
          <div>
            <div className="px-4 py-2" style={{ background: "var(--theme-bg-surface-tint)", borderBottom: "1px solid var(--theme-border-default)" }}>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--theme-action-primary-bg)" }}>Income</span>
            </div>
            {incomeRows.length === 0 ? (
              <div className="px-4 py-4 text-[12px]" style={{ color: "var(--theme-text-muted)" }}>No data</div>
            ) : (
              incomeRows.slice(0, 6).map((row) => (
                <div key={row.category} className="flex items-center justify-between px-4 py-2 hover:bg-[var(--theme-bg-surface-subtle)]/50" style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                  <span className="text-[12px] font-medium truncate mr-2" style={{ color: "var(--theme-text-primary)" }}>{row.category}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[12px] tabular-nums font-medium" style={{ color: "var(--theme-action-primary-bg)" }}>{fmt(row.amount)}</span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--theme-text-muted)" }}>{row.pct.toFixed(0)}%</span>
                  </div>
                </div>
              ))
            )}
            {incomeRows.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--theme-bg-surface-subtle)", borderTop: "1px solid var(--theme-border-default)" }}>
                <span className="text-[11px] font-bold" style={{ color: "var(--theme-text-primary)" }}>Total</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--theme-action-primary-bg)" }}>{fmt(totalIncome)}</span>
              </div>
            )}
          </div>

          {/* Cost column */}
          <div>
            <div className="px-4 py-2" style={{ background: "var(--theme-status-warning-bg)", borderBottom: "1px solid var(--theme-border-default)" }}>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--theme-status-warning-fg)" }}>Cost</span>
            </div>
            {costRows.length === 0 ? (
              <div className="px-4 py-4 text-[12px]" style={{ color: "var(--theme-text-muted)" }}>No data</div>
            ) : (
              costRows.slice(0, 6).map((row) => (
                <div key={row.category} className="flex items-center justify-between px-4 py-2 hover:bg-[var(--theme-bg-surface-subtle)]/50" style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                  <span className="text-[12px] font-medium truncate mr-2" style={{ color: "var(--theme-text-primary)" }}>{row.category}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[12px] tabular-nums font-medium" style={{ color: "var(--theme-status-warning-fg)" }}>{fmt(row.amount)}</span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--theme-text-muted)" }}>{row.pct.toFixed(0)}%</span>
                  </div>
                </div>
              ))
            )}
            {costRows.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--theme-bg-surface-subtle)", borderTop: "1px solid var(--theme-border-default)" }}>
                <span className="text-[11px] font-bold" style={{ color: "var(--theme-text-primary)" }}>Total</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--theme-status-warning-fg)" }}>{fmt(totalCost)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Sub-components ──

function BarRow({ label, amount, maxVal, color }: { label: string; amount: number; maxVal: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-medium w-14" style={{ color: "var(--theme-text-muted)" }}>{label}</span>
      <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ backgroundColor: "var(--theme-bg-surface-subtle)" }}>
        <div
          className="h-full rounded-md flex items-center px-2 transition-all duration-500"
          style={{
            width: `${(amount / maxVal) * 100}%`,
            backgroundColor: color,
            minWidth: amount > 0 ? "40px" : "0",
          }}
        >
          <span className="text-white text-[10px] font-semibold truncate">{fmt(amount)}</span>
        </div>
      </div>
    </div>
  );
}

function MarginBadge({ value, bold }: { value: number; bold?: boolean }) {
  const isNegative = value < 0;
  const isLow = value < 15 && value >= 0;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${bold ? "font-bold" : "font-semibold"} tabular-nums`}
      style={{
        backgroundColor: isNegative ? "var(--theme-status-danger-bg)" : isLow ? "var(--theme-status-warning-bg)" : "var(--theme-status-success-bg)",
        color: isNegative ? "var(--theme-status-danger-fg)" : isLow ? "var(--theme-status-warning-fg)" : "var(--theme-status-success-fg)",
      }}
    >
      {value.toFixed(0)}%
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
      {text}
    </div>
  );
}

// ── Main Component ──

export function BreakdownTabs({ billingItems, invoices, expenses, onNavigateTab }: BreakdownTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("service");

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      {/* Header with tab pills */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Breakdown
          </h3>

          {/* Tab pills */}
          <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--theme-border-default)" }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
                style={{
                  background: activeTab === tab.key ? "var(--theme-bg-surface)" : "transparent",
                  color: activeTab === tab.key ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                  boxShadow: activeTab === tab.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {onNavigateTab && (
          <button
            className="text-[12px] font-medium cursor-pointer hover:underline"
            style={{ color: "var(--theme-action-primary-bg)" }}
            onClick={() => onNavigateTab("billings")}
          >
            View →
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "service" && (
        <ServiceTab billingItems={billingItems} invoices={invoices} expenses={expenses} />
      )}
      {activeTab === "customer" && (
        <CustomerTab billingItems={billingItems} invoices={invoices} />
      )}
      {activeTab === "category" && (
        <CategoryTab invoices={invoices} billingItems={billingItems} expenses={expenses} />
      )}
    </div>
  );
}
