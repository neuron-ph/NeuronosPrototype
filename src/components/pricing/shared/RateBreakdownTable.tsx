/**
 * RateBreakdownTable
 *
 * Shared HTML <table> component used by both RateCalculationSheet (booking-level)
 * and QuotationRateBreakdownSheet (quotation-level) to render the rate engine output.
 *
 * Standardized column widths prevent currency clipping:
 *   Particular (auto) | Unit Rate (110px) | Qty (56px) | Subtotal (120px)
 *
 * @see /docs/blueprints/RATE_TABLE_DRY_BLUEPRINT.md
 */

import type { AppliedRate } from "../../../types/pricing";

// ============================================
// FORMAT HELPER (en-PH locale, peso-aware)
// ============================================

export const formatCurrency = (amount: number, currency: string = "PHP") =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);

// ============================================
// TYPES
// ============================================

interface RateBreakdownTableProps {
  appliedRates: AppliedRate[];
  total: number;
  currency: string;
  /** Optional heading override — defaults to "Rate Breakdown" */
  heading?: string;
  /** When true, suppress the heading and total footer row (used inside grouped multi-line display) */
  hideTotal?: boolean;
  /** Optional per-rate status — when provided, decorates rows with an "Applied" or "X of Y applied" badge. */
  rateStatus?: (rate: AppliedRate) => {
    state: "none" | "applied" | "partial";
    appliedQty: number;
    deltaQty: number;
    deltaAmount: number;
  };
}

// ============================================
// COMPONENT
// ============================================

export function RateBreakdownTable({
  appliedRates,
  total,
  currency,
  heading = "Rate Breakdown",
  hideTotal = false,
  rateStatus,
}: RateBreakdownTableProps) {
  return (
    <div>
      {!hideTotal && (
        <h3 className="text-[13px] font-semibold text-[var(--theme-text-primary)] uppercase tracking-wide mb-4">
          {heading}
        </h3>
      )}

      {appliedRates.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[var(--theme-text-muted)]">
          No applicable rates found for this mode and quantities.
        </div>
      ) : (
        <div className="border border-[var(--theme-border-default)] rounded-lg overflow-hidden">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "auto" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "56px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>

            {/* Header */}
            <thead>
              <tr className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide border-b border-[var(--theme-border-default)]">
                <th className="text-left px-4 py-2.5 font-semibold">Particular</th>
                <th className="text-right px-4 py-2.5 font-semibold">Unit Rate</th>
                <th className="text-center px-2 py-2.5 font-semibold">Qty</th>
                <th className="text-right px-4 py-2.5 font-semibold">Subtotal</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {appliedRates.flatMap((rate: AppliedRate, idx: number) => {
                const rows = [
                  <tr
                    key={`rate-${rate.particular}-${idx}`}
                    className="border-b border-[var(--theme-border-default)] hover:bg-[var(--theme-bg-surface-tint)] transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--theme-text-primary)] truncate">
                      <span className="inline-flex items-center gap-2">
                        {rate.particular}
                        {(() => {
                          const s = rateStatus?.(rate);
                          if (!s || s.state === "none") return null;
                          if (s.state === "applied") {
                            return (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--theme-bg-surface-tint)] border border-[var(--theme-status-success-border)] text-[var(--theme-status-success-fg)] font-medium uppercase tracking-wide">
                                Applied
                              </span>
                            );
                          }
                          // Partial: existing X of new Y
                          return (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--theme-status-warning-bg)] border border-[var(--theme-status-warning-border)] text-[var(--theme-status-warning-fg)] font-medium uppercase tracking-wide"
                              title={`Already applied for ${s.appliedQty} unit${s.appliedQty !== 1 ? "s" : ""}. ${s.deltaQty} new unit${s.deltaQty !== 1 ? "s" : ""} (${formatCurrency(s.deltaAmount, currency)}) pending.`}
                            >
                              {s.appliedQty} of {rate.quantity} applied
                            </span>
                          );
                        })()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--theme-text-muted)] whitespace-nowrap">
                      {formatCurrency(rate.rate, currency)}
                    </td>
                    <td className="px-2 py-3 text-center text-[var(--theme-text-primary)] font-medium">
                      {rate.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--theme-text-primary)] whitespace-nowrap">
                      {formatCurrency(rate.subtotal, currency)}
                    </td>
                  </tr>,
                ];

                if (rate.rule_applied && rate.quantity > 1) {
                  rows.push(
                    <tr
                      key={`rule-${rate.particular}-${idx}`}
                      className="border-b border-[var(--theme-border-default)]"
                    >
                      <td colSpan={4} className="px-4 pt-1 pb-1">
                        <div className="text-[11px] text-[var(--theme-action-primary-bg)] bg-[var(--theme-bg-surface-tint)] inline-block px-2 py-0.5 rounded">
                          {rate.rule_applied}
                        </div>
                      </td>
                    </tr>
                  );
                }

                return rows;
              })}
            </tbody>

            {/* Footer — total */}
            {!hideTotal && (
            <tfoot>
              <tr className="border-t border-[var(--theme-border-default)]">
                <td className="px-4 py-3 font-semibold text-[var(--theme-text-primary)]">Total</td>
                <td />
                <td />
                <td className="px-4 py-3 text-right text-[15px] font-bold text-[var(--theme-action-primary-bg)] whitespace-nowrap">
                  {formatCurrency(total, currency)}
                </td>
              </tr>
            </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}