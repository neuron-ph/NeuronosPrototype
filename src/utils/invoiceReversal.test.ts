import { describe, it, expect } from "vitest";
import {
  isInvoiceFinanciallyActive,
  REVERSAL_DRAFT_STATUS,
  REVERSAL_POSTED_STATUS,
  REVERSED_INVOICE_STATUS,
} from "./invoiceReversal";

// Finding P2. `isInvoiceFinanciallyActive` decides whether an invoice counts as
// a receivable, and it used to answer from an ALLOW-list of seven statuses.
// Anything else — `Issued`, in the case that surfaced it — silently stopped
// being money. It did not error; it just left the reports, taking a collection
// rate of 94.68% that was really 21.34%.
//
// These tests pin the inverted shape: unrecognised means ACTIVE.

const inv = (status: string, extra: Record<string, unknown> = {}) => ({ status, ...extra });

describe("isInvoiceFinanciallyActive", () => {
  it("counts the statuses the old allow-list already knew about", () => {
    for (const s of ["posted", "approved", "paid", "open", "partial", "sent"]) {
      expect(isInvoiceFinanciallyActive(inv(s)), s).toBe(true);
    }
  });

  it("counts `Issued` — the status that exposed the bug — regardless of case", () => {
    expect(isInvoiceFinanciallyActive(inv("Issued"))).toBe(true);
    expect(isInvoiceFinanciallyActive(inv("issued"))).toBe(true);
    expect(isInvoiceFinanciallyActive(inv("ISSUED"))).toBe(true);
  });

  it("counts a status nobody has invented yet, rather than hiding it", () => {
    // There is no CHECK constraint on invoices.status. A value this code has
    // never heard of must surface in AR, where someone will question it — not
    // vanish, where nobody can.
    expect(isInvoiceFinanciallyActive(inv("awaiting_countersign"))).toBe(true);
  });

  it("still excludes the documents that genuinely are not receivables", () => {
    for (const s of [
      "draft",
      "void",
      "voided",
      "cancelled",
      "canceled",
      REVERSED_INVOICE_STATUS,
      REVERSAL_DRAFT_STATUS,
      REVERSAL_POSTED_STATUS,
    ]) {
      expect(isInvoiceFinanciallyActive(inv(s)), s).toBe(false);
    }
  });

  it("excludes a reversal document whatever status it carries", () => {
    const reversal = inv("posted", { metadata: { reversal_of_invoice_id: "inv-1" } });
    expect(isInvoiceFinanciallyActive(reversal)).toBe(false);
  });

  it("excludes nothing at all", () => {
    expect(isInvoiceFinanciallyActive(null)).toBe(false);
    expect(isInvoiceFinanciallyActive(undefined)).toBe(false);
  });
});
