import { formatMoney, normalizeCurrency, FUNCTIONAL_CURRENCY } from "../../../utils/accountingCurrency";

export interface DualCurrencyAmountProps {
  /** Original-currency unit price × quantity (e.g. 1200 USD). */
  originalAmount: number;
  /** Original currency code, e.g. "USD" or "PHP". */
  currency: string;
  /** Locked exchange rate to PHP. 1 for PHP-origin items. */
  forexRate: number;
  /** Pre-computed PHP base amount. If omitted, derived from originalAmount × forexRate. */
  baseAmount?: number;
  /** Optional rate snapshot date, displayed as a small annotation. */
  rateDate?: string | null;
  /** Layout: stacked (default) renders two lines; inline renders "USD X · ₱ Y @ rate". */
  layout?: "stacked" | "inline";
  /** Right-align text inside the wrapper. Defaults to true. */
  align?: "left" | "right";
  /** Override font size for the primary value. */
  primarySize?: number;
}

/**
 * Pattern A: inline dual currency display for line item amount cells.
 *
 *   USD-origin → primary USD amount, secondary PHP equivalent + rate
 *   PHP-origin → single PHP amount
 */
export function DualCurrencyAmount({
  originalAmount,
  currency,
  forexRate,
  baseAmount,
  rateDate,
  layout = "stacked",
  align = "right",
  primarySize,
}: DualCurrencyAmountProps) {
  const normalized = normalizeCurrency(currency, FUNCTIONAL_CURRENCY);
  const isForeign = normalized !== FUNCTIONAL_CURRENCY;
  const phpAmount = baseAmount ?? originalAmount * (forexRate || 1);

  if (!isForeign) {
    return (
      <span style={{ fontSize: primarySize ? `${primarySize}px` : undefined }}>
        {formatMoney(phpAmount, FUNCTIONAL_CURRENCY)}
      </span>
    );
  }

  const primary = formatMoney(originalAmount, normalized);
  const secondary = formatMoney(phpAmount, FUNCTIONAL_CURRENCY);
  const tooltip = `Locked at ${forexRate} ${normalized}/${FUNCTIONAL_CURRENCY}${rateDate ? ` on ${rateDate}` : ""}`;

  if (layout === "inline") {
    return (
      <span title={tooltip}>
        {primary}
        <span style={{ color: "var(--theme-text-muted)", fontWeight: 500, marginLeft: 6 }}>
          ≈ {secondary}
        </span>
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
      title={tooltip}
    >
      <span style={{ fontSize: primarySize ? `${primarySize}px` : undefined }}>
        {primary}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: "var(--theme-text-muted)",
          fontWeight: 500,
          marginTop: "2px",
          letterSpacing: "0.01em",
        }}
      >
        ≈ {secondary}
      </span>
    </span>
  );
}
