// NEU-027 multi-currency — end-to-end LOGIC test.
//
// Exercises the real money + revaluation functions with exact EUR/USD/CNY
// numbers, covering: P1 base conversion, P2 currency glyphs, P4 period-end
// revaluation (single + mixed currency, balanced journal entry). The DB schema
// (currency master + FK gate) and the posting UI are verified separately; this
// pins the arithmetic that everything else relies on.

import { describe, it, expect } from "vitest";
import {
  toBaseAmount,
  buildFxMetadata,
  formatMoney,
  roundMoney,
} from "./accountingCurrency";
import {
  computeRevaluation,
  buildRevaluationJournalEntry,
  type OpenForeignPosition,
} from "./fxRevaluation";

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

  describe("P4 — period-end revaluation", () => {
    const eurReceivable: OpenForeignPosition = {
      recordId: "INV-EUR-1", recordType: "invoice", revaluationClass: "receivable",
      accountId: "acct-ar", accountCode: "1200", accountName: "Accounts Receivable",
      currency: "EUR", originalAmount: 1000, carryingRate: 60, carryingBase: 60000,
    };
    const usdReceivable: OpenForeignPosition = {
      recordId: "INV-USD-1", recordType: "invoice", revaluationClass: "receivable",
      accountId: "acct-ar", accountCode: "1200", accountName: "Accounts Receivable",
      currency: "USD", originalAmount: 2000, carryingRate: 58, carryingBase: 116000,
    };

    it("recognises an unrealized gain when the EUR rate rises 60 → 62.50", () => {
      const summary = computeRevaluation({
        asOfDate: "2026-06-30",
        positions: [eurReceivable],
        spotRate: () => 62.5,
      });
      expect(summary.lines[0].newBase).toBe(62500); // 1000 × 62.50
      expect(summary.lines[0].delta).toBe(2500);     // vs carrying 60,000
      expect(summary.totalDelta).toBe(2500);
      expect(summary.reversalDate).toBe("2026-07-01"); // auto-reverse day 1 next period
    });

    it("revalues mixed currencies (EUR up, USD down) in ONE balanced entry", () => {
      const rates: Record<string, number> = { EUR: 62.5, USD: 57 };
      const summary = computeRevaluation({
        asOfDate: "2026-06-30",
        positions: [eurReceivable, usdReceivable],
        spotRate: (c) => rates[c],
      });

      const deltaById = Object.fromEntries(summary.lines.map((l) => [l.position.recordId, l.delta]));
      expect(deltaById["INV-EUR-1"]).toBe(2500);   // +2,500 gain
      expect(deltaById["INV-USD-1"]).toBe(-2000);  // 2000×57=114,000 vs 116,000 → −2,000 loss
      expect(summary.totalDelta).toBe(500);

      const { main, reverse } = buildRevaluationJournalEntry({
        summary,
        fxGainAccountId: "acct-gain",
        fxLossAccountId: "acct-loss",
        createdBy: "tester",
      });

      // Double-entry must balance, and the reversal mirrors it.
      expect(roundMoney(main.total_debit)).toBe(roundMoney(main.total_credit));
      expect(roundMoney(reverse.total_debit)).toBe(roundMoney(reverse.total_credit));
      expect(reverse.total_debit).toBe(main.total_credit);
      expect(reverse.total_credit).toBe(main.total_debit);
      // Gain books to 4530, loss to 7030.
      expect(main.lines.some((l) => l.account_code === "4530" && l.credit === 2500)).toBe(true);
      expect(main.lines.some((l) => l.account_code === "7030" && l.debit === 2000)).toBe(true);
    });

    it("no-op when the rate is unchanged (zero delta)", () => {
      const summary = computeRevaluation({
        asOfDate: "2026-06-30",
        positions: [eurReceivable],
        spotRate: () => 60,
      });
      expect(summary.totalDelta).toBe(0);
      const { main } = buildRevaluationJournalEntry({
        summary, fxGainAccountId: "g", fxLossAccountId: "l", createdBy: "t",
      });
      expect(main.lines.length).toBe(0); // sub-0.005 deltas are skipped
    });
  });
});
