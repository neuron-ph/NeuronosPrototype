import { describe, it, expect } from "vitest";
import {
  FUNCTIONAL_CURRENCY,
  buildFxMetadata,
  formatDualCurrency,
  formatMoney,
  isFunctionalCurrency,
  isSupportedCurrency,
  normalizeCurrency,
  pickReportingAmount,
  resolvePostingRate,
  roundMoney,
  toBaseAmount,
} from "./accountingCurrency";

describe("accountingCurrency constants", () => {
  it("treats PHP as the functional currency", () => {
    expect(FUNCTIONAL_CURRENCY).toBe("PHP");
    expect(isFunctionalCurrency("PHP")).toBe(true);
    expect(isFunctionalCurrency("USD")).toBe(false);
  });

  it("only accepts PHP and USD as supported currencies", () => {
    expect(isSupportedCurrency("PHP")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });
});

describe("normalizeCurrency", () => {
  it("returns the input when already supported", () => {
    expect(normalizeCurrency("USD")).toBe("USD");
    expect(normalizeCurrency("PHP")).toBe("PHP");
  });
  it("uppercases and trims when possible", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
  });
  it("falls back to functional currency for invalid input", () => {
    expect(normalizeCurrency(null)).toBe("PHP");
    expect(normalizeCurrency("EUR")).toBe("PHP");
    expect(normalizeCurrency(123 as any)).toBe("PHP");
  });
});

describe("roundMoney", () => {
  it("rounds to 2 decimals", () => {
    expect(roundMoney(1.236)).toBe(1.24);
    expect(roundMoney(-1.236)).toBe(-1.24);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it("returns 0 for non-finite inputs", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });
});

describe("toBaseAmount", () => {
  it("returns the rounded amount when already in base currency", () => {
    expect(toBaseAmount({ amount: 100.123, currency: "PHP" })).toBe(100.12);
  });
  it("multiplies by rate for non-base currency", () => {
    expect(toBaseAmount({ amount: 1000, currency: "USD", exchangeRate: 58.25 })).toBe(58250);
  });
  it("throws when a non-PHP amount has no positive rate", () => {
    expect(() => toBaseAmount({ amount: 100, currency: "USD" })).toThrow();
    expect(() => toBaseAmount({ amount: 100, currency: "USD", exchangeRate: 0 })).toThrow();
  });
});

describe("resolvePostingRate", () => {
  it("locks PHP to rate 1 regardless of input", () => {
    expect(resolvePostingRate("PHP", 99)).toBe(1);
    expect(resolvePostingRate("PHP", null)).toBe(1);
  });
  it("requires a positive rate for non-PHP", () => {
    expect(resolvePostingRate("USD", 58.25)).toBe(58.25);
    expect(() => resolvePostingRate("USD", null)).toThrow();
    expect(() => resolvePostingRate("USD", -1)).toThrow();
  });
});

describe("buildFxMetadata", () => {
  it("creates a PHP=1 metadata block for PHP postings", () => {
    const meta = buildFxMetadata({ amount: 1234.567, currency: "PHP", rateDate: "2026-05-03" });
    expect(meta).toEqual({
      original_currency: "PHP",
      original_amount: 1234.57,
      exchange_rate: 1,
      base_currency: "PHP",
      base_amount: 1234.57,
      exchange_rate_date: "2026-05-03",
    });
  });
  it("computes a PHP base for USD postings", () => {
    const meta = buildFxMetadata({
      amount: 1000,
      currency: "USD",
      exchangeRate: 58.25,
      rateDate: new Date("2026-04-15T00:00:00Z"),
    });
    expect(meta.base_amount).toBe(58250);
    expect(meta.original_currency).toBe("USD");
    expect(meta.exchange_rate_date).toBe("2026-04-15");
  });
});

describe("formatMoney / formatDualCurrency", () => {
  it("formats PHP-only postings as a single PHP value", () => {
    const out = formatDualCurrency({
      originalAmount: 1000,
      originalCurrency: "PHP",
      exchangeRate: 1,
      baseAmount: 1000,
    });
    expect(out).toContain("1,000.00");
  });
  it("includes both amounts and the rate for USD postings", () => {
    const out = formatDualCurrency({
      originalAmount: 1000,
      originalCurrency: "USD",
      exchangeRate: 58.25,
      baseAmount: 58250,
    });
    // Intl renders $ for USD and ₱ for PHP rather than the ISO code, so we
    // assert on the amounts and the rate marker we control.
    expect(out).toContain("1,000.00");
    expect(out).toContain("58.25");
    expect(out).toContain("58,250.00");
    expect(out).toContain("@");
    expect(out).toContain("=");
  });
  it("formats values via Intl with correct currency code", () => {
    expect(formatMoney(100, "USD")).toContain("100.00");
  });
});

describe("pickReportingAmount", () => {
  it("prefers base_amount when present", () => {
    expect(pickReportingAmount({ base_amount: 58250, amount: 1000 })).toBe(58250);
  });
  it("falls back to total_amount then amount for legacy rows", () => {
    expect(pickReportingAmount({ total_amount: 1000 })).toBe(1000);
    expect(pickReportingAmount({ amount: 500 })).toBe(500);
    expect(pickReportingAmount({})).toBe(0);
  });
});

describe("realized FX scenarios", () => {
  // USD invoice booked at 58.00, collected at 58.50 → gain of 0.50/USD.
  const invoiceAmountUsd = 1000;
  const arRate = 58;
  const cashRate = 58.5;

  it("recognises a gain when collection rate exceeds invoice rate", () => {
    const arBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: arRate });
    const cashBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: cashRate });
    expect(roundMoney(cashBase - arBase)).toBe(500);
  });

  it("recognises a loss when collection rate is below invoice rate", () => {
    const arBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: 58.5 });
    const cashBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: 58 });
    expect(roundMoney(cashBase - arBase)).toBe(-500);
  });

  it("recognises zero FX when rates match", () => {
    const arBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: arRate });
    const cashBase = toBaseAmount({ amount: invoiceAmountUsd, currency: "USD", exchangeRate: arRate });
    expect(roundMoney(cashBase - arBase)).toBe(0);
  });
});
