// NEU-027 multi-currency — end-to-end LOGIC test.
//
// Exercises the real money functions with exact EUR/USD/CNY numbers, covering
// P1 base conversion and P2 currency glyphs. The P4 period-end revaluation
// cases were removed with the General Journal (see
// docs/ACCOUNTING_REMOVAL_PLAN.md) — they exercised computeRevaluation /
// buildRevaluationJournalEntry, which posted to the ledger. This still pins the
// currency arithmetic everything else relies on.

import { describe, it, expect } from "vitest";
import {
  toBaseAmount,
  buildFxMetadata,
  formatMoney,
  roundMoney,
} from "./accountingCurrency";

describe("NEU-027 multi-currency end-to-end (logic)", () => {
  describe("P1 — base conversion", () => {
    it("converts EUR and CNY to the PHP base at their rate", () => {
      expect(toBaseAmount({ amount: 1000, currency: "EUR", exchangeRate: 60 })).toBe(60000);
      expect(toBaseAmount({ amount: 500, currency: "CNY", exchangeRate: 8 })).toBe(4000);
    });

    it("refuses a foreign amount with no positive rate (never silent rate-1)", () => {
      expect(() => toBaseAmount({ amount: 1000, currency: "EUR" })).toThrow();
      expect(() => toBaseAmount({ amount: 1000, currency: "CNY", exchangeRate: 0 })).toThrow();
    });

    it("stamps dual-currency FX metadata for a EUR posting", () => {
      const meta = buildFxMetadata({ amount: 1000, currency: "EUR", exchangeRate: 60, rateDate: "2026-06-11" });
      expect(meta.original_currency).toBe("EUR");
      expect(meta.original_amount).toBe(1000);
      expect(meta.base_currency).toBe("PHP");
      expect(meta.base_amount).toBe(60000);
      expect(meta.exchange_rate).toBe(60);
      expect(meta.exchange_rate_date).toBe("2026-06-11");
    });
  });

  describe("P2 — currency signs", () => {
    it("formats each currency with its own glyph", () => {
      expect(formatMoney(1000, "PHP")).toContain("₱");
      expect(formatMoney(1000, "USD")).toContain("$");
      expect(formatMoney(1000, "EUR")).toContain("€");
      expect(formatMoney(1000, "CNY")).toContain("¥");
    });
  });
});
