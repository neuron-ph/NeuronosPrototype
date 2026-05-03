import { describe, it, expect } from "vitest";
import { calculateInvoiceBalance } from "./accounting-math";
import type { Invoice, Collection } from "../types/accounting";

const baseInvoice = {
  id: "INV-1",
  invoice_number: "INV-1",
  customer_id: "cust",
  customer_name: "Acme",
  invoice_date: "2026-01-01",
  due_date: "2026-01-31",
  status: "open",
  payment_status: "unpaid",
  created_at: "2026-01-01T00:00:00Z",
} as unknown as Invoice;

function php(amt: number, paid: { id?: string; amount: number }[] = []): { invoice: Invoice; collections: Collection[] } {
  const invoice = {
    ...baseInvoice,
    total_amount: amt,
    amount: amt,
    currency: "PHP",
    original_currency: "PHP",
    exchange_rate: 1,
    base_currency: "PHP",
    base_amount: amt,
  } as unknown as Invoice;
  const collections = paid.map((p, i) => ({
    id: p.id ?? `COL-${i}`,
    amount: p.amount,
    currency: "PHP",
    original_currency: "PHP",
    exchange_rate: 1,
    base_amount: p.amount,
    status: "posted",
    invoice_id: invoice.id,
    linked_billings: [{ id: invoice.id, amount: p.amount }],
  }) as unknown as Collection);
  return { invoice, collections };
}

function usd(amt: number, rate: number, paid: any[] = []): { invoice: Invoice; collections: Collection[] } {
  const invoice = {
    ...baseInvoice,
    total_amount: amt,
    amount: amt,
    currency: "USD",
    original_currency: "USD",
    exchange_rate: rate,
    base_currency: "PHP",
    base_amount: Math.round(amt * rate * 100) / 100,
  } as unknown as Invoice;
  const collections = paid.map((p, i) => ({
    id: `COL-${i}`,
    amount: p.amount,
    currency: p.currency ?? "USD",
    original_currency: p.currency ?? "USD",
    exchange_rate: p.rate ?? rate,
    base_amount: Math.round(p.amount * (p.rate ?? rate) * 100) / 100,
    status: "posted",
    invoice_id: p.invoice_id ?? invoice.id,
    linked_billings: p.linked
      ? [{ id: invoice.id, amount: p.linked }]
      : [{ id: invoice.id, amount: p.amount }],
  }) as unknown as Collection);
  return { invoice, collections };
}

describe("calculateInvoiceBalance", () => {
  it("pure PHP — fully paid", () => {
    const { invoice, collections } = php(10000, [{ amount: 10000 }]);
    const r = calculateInvoiceBalance(invoice, collections);
    expect(r.balance).toBe(0);
    expect(r.balanceBase).toBe(0);
    expect(r.status).toBe("paid");
  });

  it("pure PHP — partial", () => {
    const { invoice, collections } = php(10000, [{ amount: 4000 }]);
    const r = calculateInvoiceBalance(invoice, collections);
    expect(r.balance).toBe(6000);
    expect(r.balanceBase).toBe(6000);
    expect(r.status).toBe("partial");
  });

  it("pure USD @ 58 — fully paid in USD", () => {
    const { invoice, collections } = usd(1000, 58, [{ amount: 1000, currency: "USD", rate: 58, linked: 1000 }]);
    const r = calculateInvoiceBalance(invoice, collections);
    expect(r.balanceBase).toBe(0);
    expect(r.status).toBe("paid");
    expect(r.invoiceCurrency).toBe("USD");
    expect(r.totalAmountBase).toBe(58000);
  });

  it("USD invoice settled by PHP collection (mixed)", () => {
    // USD $1000 @ 58 invoice = ₱58,000 base. Pay it with a direct PHP collection of ₱58,000.
    const { invoice } = usd(1000, 58);
    const collections = [{
      id: "COL-PHP",
      amount: 58000,
      currency: "PHP",
      original_currency: "PHP",
      exchange_rate: 1,
      base_amount: 58000,
      status: "posted",
      invoice_id: invoice.id,
      linked_billings: [],
    }] as unknown as Collection[];
    const r = calculateInvoiceBalance(invoice, collections);
    expect(r.balanceBase).toBe(0);
    expect(r.status).toBe("paid");
  });

  it("USD invoice partially paid in USD then PHP", () => {
    // USD $1000 @ 58. Pay USD $400 (linked) + PHP ₱34,800 (≈ $600 @ 58, direct).
    const { invoice } = usd(1000, 58);
    const collections = [
      {
        id: "COL-USD",
        amount: 400, currency: "USD", original_currency: "USD",
        exchange_rate: 58, base_amount: 23200, status: "posted",
        invoice_id: invoice.id,
        linked_billings: [{ id: invoice.id, amount: 400 }],
      },
      {
        id: "COL-PHP",
        amount: 34800, currency: "PHP", original_currency: "PHP",
        exchange_rate: 1, base_amount: 34800, status: "posted",
        invoice_id: invoice.id,
        linked_billings: [],
      },
    ] as unknown as Collection[];
    const r = calculateInvoiceBalance(invoice, collections);
    expect(r.balanceBase).toBeLessThan(0.05);
    expect(r.status).toBe("paid");
  });

  it("overpaid PHP invoice", () => {
    const { invoice, collections } = php(1000, [{ amount: 1500 }]);
    const r = calculateInvoiceBalance(invoice, collections);
    // balance is clamped to >= 0
    expect(r.balance).toBe(0);
    expect(r.balanceBase).toBe(0);
    expect(r.status).toBe("paid");
  });

  it("legacy invoice with no FX columns defaults to PHP rate=1", () => {
    const invoice = { ...baseInvoice, total_amount: 5000 } as unknown as Invoice;
    const r = calculateInvoiceBalance(invoice, []);
    expect(r.totalAmountBase).toBe(5000);
    expect(r.invoiceCurrency).toBe("PHP");
  });
});
