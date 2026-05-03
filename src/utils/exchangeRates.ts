/**
 * Exchange rate lookup utilities backed by the `exchange_rates` table.
 *
 * Posting flows must use `resolveExchangeRate()` to fetch a default rate for a
 * given transaction date. PHP-only postings short-circuit to rate 1; non-PHP
 * postings throw if no rate is on file. Never silently default a USD posting
 * to rate 1.
 */

import { supabase } from "./supabase/client";
import {
  FUNCTIONAL_CURRENCY,
  isFunctionalCurrency,
  normalizeCurrency,
  type AccountingCurrency,
} from "./accountingCurrency";

export interface ExchangeRateRow {
  id: string;
  rate_date: string;
  from_currency: AccountingCurrency;
  to_currency: AccountingCurrency;
  rate: number;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResolvedRate {
  rate: number;
  rate_date: string;
  source: string | null;
  /** True when the lookup hit the table; false when synthesized from PHP=1. */
  fromTable: boolean;
}

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Fetch the most recent rate at or before `rateDate` for the given pair.
 * Returns null if no row matches.
 */
export async function fetchExchangeRate(params: {
  fromCurrency: AccountingCurrency | string;
  toCurrency: AccountingCurrency | string;
  rateDate: string | Date;
}): Promise<ExchangeRateRow | null> {
  const from = normalizeCurrency(params.fromCurrency);
  const to = normalizeCurrency(params.toCurrency);
  if (from === to) return null;

  const dateIso = toIsoDate(params.rateDate);
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("*")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .lte("rate_date", dateIso)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchExchangeRate failed:", error);
    return null;
  }
  return (data as ExchangeRateRow) ?? null;
}

/**
 * Resolve the rate to use when posting a document. PHP-only flows return 1
 * without a DB hit. Non-PHP flows must find a rate on file or this throws.
 */
export async function resolveExchangeRate(params: {
  fromCurrency: AccountingCurrency | string;
  toCurrency?: AccountingCurrency;
  rateDate: string | Date;
}): Promise<ResolvedRate> {
  const toCurrency = params.toCurrency ?? FUNCTIONAL_CURRENCY;
  if (isFunctionalCurrency(params.fromCurrency)) {
    return {
      rate: 1,
      rate_date: toIsoDate(params.rateDate),
      source: null,
      fromTable: false,
    };
  }

  const row = await fetchExchangeRate({
    fromCurrency: params.fromCurrency,
    toCurrency,
    rateDate: params.rateDate,
  });

  if (!row) {
    throw new Error(
      `No exchange rate on file for ${params.fromCurrency} -> ${toCurrency} on or before ${toIsoDate(params.rateDate)}. Add one in the exchange rates table before posting.`,
    );
  }

  return {
    rate: Number(row.rate),
    rate_date: row.rate_date,
    source: row.source ?? null,
    fromTable: true,
  };
}

/**
 * Insert a new exchange rate row. Used by the (admin) maintenance surface.
 */
export async function upsertExchangeRate(params: {
  fromCurrency: AccountingCurrency;
  toCurrency: AccountingCurrency;
  rateDate: string | Date;
  rate: number;
  source?: string;
  notes?: string;
  createdBy?: string;
}): Promise<ExchangeRateRow> {
  if (!(params.rate > 0)) {
    throw new Error("upsertExchangeRate: rate must be > 0");
  }
  if (params.fromCurrency === params.toCurrency) {
    throw new Error("upsertExchangeRate: from/to currencies must differ");
  }
  const payload = {
    rate_date: toIsoDate(params.rateDate),
    from_currency: params.fromCurrency,
    to_currency: params.toCurrency,
    rate: params.rate,
    source: params.source ?? "manual",
    notes: params.notes ?? null,
    created_by: params.createdBy ?? null,
  };
  const { data, error } = await supabase
    .from("exchange_rates")
    .upsert(payload, { onConflict: "rate_date,from_currency,to_currency" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertExchangeRate failed: ${error.message}`);
  return data as ExchangeRateRow;
}
