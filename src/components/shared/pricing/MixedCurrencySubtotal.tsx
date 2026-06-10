import {
  formatMoney,
  normalizeCurrency,
  FUNCTIONAL_CURRENCY,
} from "../../../utils/accountingCurrency";

export interface SubtotalLineItem {
  currency?: string | null;
  forex_rate?: number | null;
  amount?: number | null;
  price?: number | null;
  final_price?: number | null;
  quantity?: number | null;
}

export interface MixedCurrencySubtotalProps {
  /** Line items in this group. Used to compute per-currency original totals. */
  items: SubtotalLineItem[];
  /** Pre-computed PHP-base subtotal. If omitted, summed from items[].amount. */
  phpTotal?: number;
  /** Override the primary value font size (default inherits). */
  primarySize?: number;
  /** Right-align the numbers (default true). */
  align?: "left" | "right";
  /**
   * The document currency. When it's a foreign currency (e.g. a USD quotation),
   * the subtotal shows that currency as PRIMARY with the PHP base as the
   * secondary "≈ ₱" conversion — matching the per-line rows. When omitted or PHP,
   * the original PHP-primary behaviour is kept.
   */
  documentCurrency?: string;
}

interface Breakdown {
  phpTotal: number;
  byCurrency: Record<string, number>;
}

function summarize(items: SubtotalLineItem[], phpOverride?: number): Breakdown {
  const byCurrency: Record<string, number> = {};
  let phpTotal = 0;

  for (const item of items) {
    const curr = normalizeCurrency(item.currency, FUNCTIONAL_CURRENCY);
    const unit = Number(item.final_price ?? item.price ?? 0);
    const qty = Number(item.quantity ?? 1);
    const original = unit * qty;
    const rate = Number(item.forex_rate) || 1;
    const phpForRow =
      item.amount != null && Number.isFinite(Number(item.amount))
        ? Number(item.amount)
        : original * rate;

    phpTotal += phpForRow;
    byCurrency[curr] = (byCurrency[curr] || 0) + original;
  }

  return {
    phpTotal: phpOverride ?? phpTotal,
    byCurrency,
  };
}

/**
 * Aggregate-amount renderer for category / vendor subtotals.
 *
 * Single-currency (PHP only): renders `₱ X.XX`.
 * Mixed: renders PHP primary with a muted "incl. USD Y.YY" caption that lists
 * each non-PHP original total. Full breakdown is also in the tooltip.
 */
export function MixedCurrencySubtotal({
  items,
  phpTotal,
  primarySize,
  align = "right",
  documentCurrency,
}: MixedCurrencySubtotalProps) {
  const { phpTotal: total, byCurrency } = summarize(items, phpTotal);

  // Document-currency-primary mode: a foreign-currency quotation (e.g. USD) shows
  // its own currency first, with the PHP base as the "≈ ₱" conversion underneath.
  const docCur = normalizeCurrency(documentCurrency, FUNCTIONAL_CURRENCY);
  if (documentCurrency && docCur !== FUNCTIONAL_CURRENCY) {
    const docOriginal = byCurrency[docCur] || 0;
    const otherForeign = Object.entries(byCurrency).filter(
      ([code, amt]) => code !== docCur && code !== FUNCTIONAL_CURRENCY && amt > 0,
    );
    const incl =
      otherForeign.length > 0
        ? " · incl. " + otherForeign.map(([code, amt]) => formatMoney(amt, code)).join(" · ")
        : "";
    return (
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: align === "right" ? "flex-end" : "flex-start",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
        }}
        title={`${formatMoney(docOriginal, docCur)} · PHP base ${formatMoney(total, FUNCTIONAL_CURRENCY)}`}
      >
        <span style={{ fontSize: primarySize ? `${primarySize}px` : undefined }}>
          {formatMoney(docOriginal, docCur)}
        </span>
        <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", fontWeight: 500, marginTop: "2px" }}>
          ≈ {formatMoney(total, FUNCTIONAL_CURRENCY)}{incl}
        </span>
      </span>
    );
  }

  const foreignEntries = Object.entries(byCurrency).filter(
    ([code, amt]) => code !== FUNCTIONAL_CURRENCY && amt > 0,
  );
  const isMixed = foreignEntries.length > 0;

  const primary = formatMoney(total, FUNCTIONAL_CURRENCY);

  if (!isMixed) {
    return (
      <span style={{ fontSize: primarySize ? `${primarySize}px` : undefined }}>
        {primary}
      </span>
    );
  }

  const caption = foreignEntries
    .map(([code, amt]) => `incl. ${formatMoney(amt, code)}`)
    .join(" · ");

  const tooltipLines = [
    `Total (PHP base): ${primary}`,
    ...Object.entries(byCurrency).map(
      ([code, amt]) => `  ${code} originals: ${formatMoney(amt, code)}`,
    ),
  ].join("\n");

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
      title={tooltipLines}
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
        }}
      >
        {caption}
      </span>
    </span>
  );
}
