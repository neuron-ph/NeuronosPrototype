/**
 * Shared accounting currency module.
 *
 * Phase 1 of the USD multi-currency accounting plan.
 *
 * Functional currency for the company is PHP. Source documents and accounts
 * may be denominated in USD, but every posting persists both the original
 * amount and a locked PHP equivalent. GL balancing is always evaluated in PHP.
 *
 * All ad hoc `amount * rate` arithmetic in posting flows must go through the
 * helpers exposed here so that rounding stays consistent.
 */

export const FUNCTIONAL_CURRENCY = "PHP" as const;

export const SUPPORTED_ACCOUNTING_CURRENCIES = ["PHP", "USD"] as const;

export type AccountingCurrency =
  (typeof SUPPORTED_ACCOUNTING_CURRENCIES)[number];

export const DEFAULT_BASE_CURRENCY: AccountingCurrency = FUNCTIONAL_CURRENCY;

// FX gain/loss account codes. Realized accounts post when a transaction settles
// at a rate different from its locked carrying rate. Unrealized accounts post
// at period-end revaluation and reverse on day 1 of the next period.
export const FX_REALIZED_GAIN_CODE = "4510";
export const FX_REALIZED_LOSS_CODE = "7010";
// 4520/7020 are taken (Miscellaneous Income / Loss on Disposal). Use 4530/7030.
export const FX_UNREALIZED_GAIN_CODE = "4530";
export const FX_UNREALIZED_LOSS_CODE = "7030";

export function isSupportedCurrency(
  value: unknown,
): value is AccountingCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_ACCOUNTING_CURRENCIES as readonly string[]).includes(value)
  );
}

export function normalizeCurrency(
  value: unknown,
  fallback: AccountingCurrency = FUNCTIONAL_CURRENCY,
): AccountingCurrency {
  if (isSupportedCurrency(value)) return value;
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (isSupportedCurrency(upper)) return upper;
  }
  return fallback;
}

export function isFunctionalCurrency(value: unknown): boolean {
  return normalizeCurrency(value) === FUNCTIONAL_CURRENCY;
}

/**
 * Round a money amount to 2 decimals using half-away-from-zero. This is the
 * single rounding rule for posting and reporting; do not introduce another.
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const sign = amount < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(amount) * 100)) / 100;
}

export interface ToBaseAmountInput {
  amount: number;
  currency: AccountingCurrency | string | null | undefined;
  exchangeRate?: number | null;
  baseCurrency?: AccountingCurrency;
}

/**
 * Convert an original-currency amount to the functional/base currency using
 * the supplied locked rate. If currency already equals base, the rate is
 * forced to 1 and the amount is returned rounded.
 *
 * Throws if a non-PHP amount is passed without a positive rate. Callers must
 * never silently default a USD posting to rate 1.
 */
export function toBaseAmount(input: ToBaseAmountInput): number {
  const baseCurrency = input.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const currency = normalizeCurrency(input.currency, baseCurrency);
  const amount = Number(input.amount) || 0;

  if (currency === baseCurrency) {
    return roundMoney(amount);
  }

  const rate = Number(input.exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      `toBaseAmount: a positive exchange rate is required for ${currency} -> ${baseCurrency}`,
    );
  }

  return roundMoney(amount * rate);
}

/**
 * Resolve the rate to persist for a posted document. PHP-only postings always
 * lock at 1; non-PHP postings require a positive rate.
 */
export function resolvePostingRate(
  currency: AccountingCurrency | string | null | undefined,
  rate: number | null | undefined,
  baseCurrency: AccountingCurrency = DEFAULT_BASE_CURRENCY,
): number {
  const normalized = normalizeCurrency(currency, baseCurrency);
  if (normalized === baseCurrency) return 1;
  const numeric = Number(rate);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(
      `resolvePostingRate: missing exchange rate for ${normalized} -> ${baseCurrency}`,
    );
  }
  return numeric;
}

const CURRENCY_LOCALES: Record<AccountingCurrency, string> = {
  PHP: "en-PH",
  USD: "en-US",
};

export function formatMoney(
  amount: number,
  currency: AccountingCurrency | string = FUNCTIONAL_CURRENCY,
): string {
  const normalized = normalizeCurrency(currency, FUNCTIONAL_CURRENCY);
  return new Intl.NumberFormat(CURRENCY_LOCALES[normalized], {
    style: "currency",
    currency: normalized,
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

/**
 * Format a USD-origin posting using the conventional dual-currency display:
 *   "USD 1,000.00 @ 58.25 = PHP 58,250.00"
 *
 * For PHP-origin postings, returns just the PHP amount.
 */
export function formatDualCurrency(params: {
  originalAmount: number;
  originalCurrency: AccountingCurrency | string;
  exchangeRate: number;
  baseAmount: number;
  baseCurrency?: AccountingCurrency;
}): string {
  const baseCurrency = params.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const original = normalizeCurrency(params.originalCurrency, baseCurrency);
  if (original === baseCurrency) {
    return formatMoney(params.baseAmount, baseCurrency);
  }
  return `${formatMoney(params.originalAmount, original)} @ ${params.exchangeRate} = ${formatMoney(params.baseAmount, baseCurrency)}`;
}

/**
 * Build an FX metadata block to embed into a posted document or journal entry
 * header. Centralizes the shape so write paths stay consistent.
 */
export interface FxMetadata {
  original_currency: AccountingCurrency;
  original_amount: number;
  exchange_rate: number;
  base_currency: AccountingCurrency;
  base_amount: number;
  exchange_rate_date: string | null;
}

export function buildFxMetadata(params: {
  amount: number;
  currency: AccountingCurrency | string | null | undefined;
  exchangeRate?: number | null;
  rateDate?: string | Date | null;
  baseCurrency?: AccountingCurrency;
}): FxMetadata {
  const baseCurrency = params.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const currency = normalizeCurrency(params.currency, baseCurrency);
  const rate = resolvePostingRate(currency, params.exchangeRate, baseCurrency);
  const original = roundMoney(Number(params.amount) || 0);
  const base = toBaseAmount({
    amount: original,
    currency,
    exchangeRate: rate,
    baseCurrency,
  });

  let rateDate: string | null = null;
  if (params.rateDate instanceof Date) {
    rateDate = params.rateDate.toISOString().slice(0, 10);
  } else if (typeof params.rateDate === "string" && params.rateDate.length > 0) {
    rateDate = params.rateDate.slice(0, 10);
  }

  return {
    original_currency: currency,
    original_amount: original,
    exchange_rate: rate,
    base_currency: baseCurrency,
    base_amount: base,
    exchange_rate_date: rateDate,
  };
}

/**
 * Pick the best amount to aggregate for reports: prefer base_amount when the
 * record carries FX metadata, fall back to the raw amount for legacy rows.
 */
export function pickReportingAmount(record: {
  base_amount?: number | null;
  base_currency?: string | null;
  amount?: number | null;
  total_amount?: number | null;
}): number {
  if (
    record.base_amount != null &&
    Number.isFinite(Number(record.base_amount))
  ) {
    return Number(record.base_amount);
  }
  if (
    record.total_amount != null &&
    Number.isFinite(Number(record.total_amount))
  ) {
    return Number(record.total_amount);
  }
  return Number(record.amount ?? 0) || 0;
}
