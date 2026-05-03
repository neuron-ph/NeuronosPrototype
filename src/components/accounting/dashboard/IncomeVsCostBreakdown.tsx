/**
 * IncomeVsCostBreakdown — Zone 5 of the Financial Dashboard
 *
 * Two side-by-side cards: Income Breakdown + Cost Breakdown with category
 * tables showing amount and % of total. A visual margin comparison bar
 * sits between them.
 */

import { useMemo } from "react";
import { formatMoney } from "../../../utils/accountingCurrency";

interface IncomeVsCostBreakdownProps {
  invoices: any[];
  billingItems: any[];
  expenses: any[];
}

interface CategoryRow {
  category: string;
  amount: number;
  pct: number;
}

const fmt = (amount: number) => formatMoney(amount, "PHP");

export function IncomeVsCostBreakdown({
  invoices,
  billingItems,
  expenses,
}: IncomeVsCostBreakdownProps) {
  // Income by category
  const { incomeRows, totalIncome } = useMemo(() => {
    const unbilledItems = billingItems.filter(
      (b: any) => (b.status || "").toLowerCase() === "unbilled"
    );
    const combined = [...invoices, ...unbilledItems];

    const categoryMap: Record<string, number> = {};
    for (const item of combined) {
      const category =
        item.charge_code ||
        item.quotation_category ||
        item.description ||
        "General Revenue";
      const amount =
        Number(item.amount) || Number(item.total_amount) || 0;
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    }

    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    const rows: CategoryRow[] = Object.entries(categoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { incomeRows: rows, totalIncome: total };
  }, [invoices, billingItems]);

  // Cost by category
  const { costRows, totalCost } = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    for (const item of expenses) {
      const category =
        item.expenseCategory ||
        item.expense_category ||
        item.expense_type ||
        item.description ||
        "General Expense";
      const amount = Number(item.amount) || 0;
      categoryMap[category] = (categoryMap[category] || 0) + amount;
    }

    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    const rows: CategoryRow[] = Object.entries(categoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { costRows: rows, totalCost: total };
  }, [expenses]);

  const margin = totalIncome - totalCost;
  const marginPct = totalIncome > 0 ? (margin / totalIncome) * 100 : 0;
  const maxVal = Math.max(totalIncome, totalCost, 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Margin comparison bar */}
      <div
        className="rounded-xl p-4"
        style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[12px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Income vs Cost
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
              Margin:
            </span>
            <span
              className="text-[14px] font-bold tabular-nums"
              style={{ color: margin >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)" }}
            >
              {fmt(margin)} ({marginPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Income bar */}
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-medium w-14"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Income
            </span>
            <div
              className="flex-1 h-5 rounded-md overflow-hidden"
              style={{ backgroundColor: "var(--theme-bg-surface-subtle)" }}
            >
              <div
                className="h-full rounded-md flex items-center px-2 transition-all duration-500"
                style={{
                  width: `${(totalIncome / maxVal) * 100}%`,
                  backgroundColor: "var(--theme-action-primary-bg)",
                  minWidth: totalIncome > 0 ? "40px" : "0",
                }}
              >
                <span className="text-white text-[10px] font-semibold truncate">
                  {fmt(totalIncome)}
                </span>
              </div>
            </div>
          </div>

          {/* Cost bar */}
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-medium w-14"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Cost
            </span>
            <div
              className="flex-1 h-5 rounded-md overflow-hidden"
              style={{ backgroundColor: "var(--theme-bg-surface-subtle)" }}
            >
              <div
                className="h-full rounded-md flex items-center px-2 transition-all duration-500"
                style={{
                  width: `${(totalCost / maxVal) * 100}%`,
                  backgroundColor: "#C05621",
                  minWidth: totalCost > 0 ? "40px" : "0",
                }}
              >
                <span className="text-white text-[10px] font-semibold truncate">
                  {fmt(totalCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column breakdown tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Income Breakdown */}
        <BreakdownTable
          title="Income Breakdown"
          rows={incomeRows}
          total={totalIncome}
          accentColor="#0F766E"
          bgHeader="#F0FDF9"
        />

        {/* Cost Breakdown */}
        <BreakdownTable
          title="Cost Breakdown"
          rows={costRows}
          total={totalCost}
          accentColor="#C05621"
          bgHeader="#FFF7ED"
        />
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
  accentColor,
  bgHeader,
}: {
  title: string;
  rows: CategoryRow[];
  total: number;
  accentColor: string;
  bgHeader: string;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      <div
        className="px-5 py-3"
        style={{ borderBottom: "1px solid var(--theme-border-default)", background: bgHeader }}
      >
        <h3
          className="text-[12px] font-bold uppercase tracking-wide"
          style={{ color: accentColor }}
        >
          {title}
        </h3>
      </div>
      <table className="w-full">
        <thead style={{ background: "var(--theme-bg-surface)", borderBottom: "1px solid var(--theme-border-default)" }}>
          <tr>
            <th
              className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Category
            </th>
            <th
              className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Amount
            </th>
            <th
              className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider w-16"
              style={{ color: "var(--theme-text-muted)" }}
            >
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-5 py-6 text-center text-[13px]"
                style={{ color: "var(--theme-text-muted)" }}
              >
                No data
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.category}
                className="hover:bg-[var(--theme-bg-surface-subtle)]/50"
                style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}
              >
                <td
                  className="px-5 py-2.5 text-[13px] font-medium"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  {row.category}
                </td>
                <td
                  className="px-5 py-2.5 text-[13px] text-right tabular-nums font-medium"
                  style={{ color: accentColor }}
                >
                  {fmt(row.amount)}
                </td>
                <td
                  className="px-5 py-2.5 text-[11px] text-right tabular-nums"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {row.pct.toFixed(0)}%
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot style={{ borderTop: "2px solid var(--theme-border-default)", background: "var(--neuron-pill-inactive-bg)" }}>
            <tr>
              <td
                className="px-5 py-2.5 text-[12px] font-bold"
                style={{ color: "var(--theme-text-primary)" }}
              >
                Total
              </td>
              <td
                className="px-5 py-2.5 text-[12px] text-right font-bold tabular-nums"
                style={{ color: accentColor }}
              >
                {fmt(total)}
              </td>
              <td
                className="px-5 py-2.5 text-[11px] text-right tabular-nums"
                style={{ color: "var(--theme-text-muted)" }}
              >
                100%
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
