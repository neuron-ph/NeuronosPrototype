/**
 * CashFlowSummary — Zone 2L of the Financial Dashboard
 *
 * Clean, easy-to-read cash flow summary replacing the confusing waterfall.
 * Shows: Revenue → Expenses → Net Profit (accrual) and
 *        Collections → Paid Out → Net Cash (cash basis)
 */

import { useMemo } from "react";
import { formatCurrencyCompact } from "../aggregate/types";
import { formatMoney } from "../../../utils/accountingCurrency";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface CashFlowWaterfallProps {
  invoicedRevenue: number;
  totalExpenses: number;
  totalCollected: number;
  paidExpenses: number;
  /** Optional "View →" navigation */
  onNavigate?: () => void;
}

const fmt = (amount: number) => formatMoney(amount, "PHP");

interface FlowRow {
  label: string;
  amount: number;
  type: "inflow" | "outflow" | "net";
}

export function CashFlowWaterfall({
  invoicedRevenue,
  totalExpenses,
  totalCollected,
  paidExpenses,
  onNavigate,
}: CashFlowWaterfallProps) {
  const grossProfit = invoicedRevenue - totalExpenses;
  const netCash = totalCollected - paidExpenses;

  const accrualRows: FlowRow[] = useMemo(
    () => [
      { label: "Revenue", amount: invoicedRevenue, type: "inflow" },
      { label: "Expenses", amount: totalExpenses, type: "outflow" },
      { label: "Net Profit", amount: grossProfit, type: "net" },
    ],
    [invoicedRevenue, totalExpenses, grossProfit]
  );

  const cashRows: FlowRow[] = useMemo(
    () => [
      { label: "Collected", amount: totalCollected, type: "inflow" },
      { label: "Paid Out", amount: paidExpenses, type: "outflow" },
      { label: "Net Cash", amount: netCash, type: "net" },
    ],
    [totalCollected, paidExpenses, netCash]
  );

  // Max for horizontal bar scaling
  const maxAmt = Math.max(invoicedRevenue, totalExpenses, totalCollected, paidExpenses, 1);

  const colorMap = {
    inflow: "var(--theme-action-primary-bg)",
    outflow: "var(--theme-status-danger-fg)",
    net: "var(--theme-text-primary)",
  };

  const iconMap = {
    inflow: ArrowDown,
    outflow: ArrowUp,
    net: Minus,
  };

  const bgMap = {
    inflow: "var(--theme-status-success-bg)",
    outflow: "var(--theme-status-danger-bg)",
    net: "var(--theme-status-success-bg)",
  };

  function renderSection(title: string, rows: FlowRow[]) {
    return (
      <div className="flex flex-col gap-2.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {title}
        </span>
        {rows.map((row) => {
          const Icon = iconMap[row.type];
          const barPct =
            row.type === "net"
              ? (Math.abs(row.amount) / maxAmt) * 100
              : (row.amount / maxAmt) * 100;
          const isNegativeNet = row.type === "net" && row.amount < 0;
          const displayColor = isNegativeNet ? "#DC2626" : colorMap[row.type];
          const displayBg = isNegativeNet ? "#FEF2F2" : bgMap[row.type];

          return (
            <div key={row.label} className="flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: displayBg }}
              >
                <Icon size={14} color={displayColor} strokeWidth={2.5} />
              </div>

              {/* Label + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[12px] font-medium"
                    style={{ color: row.type === "net" ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: displayColor }}
                  >
                    {row.type === "outflow" ? "−" : ""}
                    {fmt(Math.abs(row.amount))}
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  className="w-full rounded-full overflow-hidden"
                  style={{ height: "4px", backgroundColor: "var(--theme-bg-surface-subtle)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(barPct, 1)}%`,
                      backgroundColor: displayColor,
                      opacity: row.type === "net" ? 1 : 0.7,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 flex flex-col"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <h3
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--theme-text-muted)" }}
        >
          Cash Flow Summary
        </h3>
        {onNavigate && (
          <button
            className="text-[12px] font-medium cursor-pointer hover:underline"
            style={{ color: "var(--theme-action-primary-bg)" }}
            onClick={onNavigate}
          >
            View →
          </button>
        )}
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {renderSection("Accrual Basis", accrualRows)}

        {/* Divider */}
        <div style={{ borderTop: "1px dashed var(--theme-border-default)" }} />

        {renderSection("Cash Basis", cashRows)}
      </div>
    </div>
  );
}
