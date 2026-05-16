import { describe, it, expect } from "vitest";
import { resolveInvoicePrintableDocument } from "./invoiceDocumentResolver";
import type { Invoice } from "../../types/accounting";

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoice_number: "INV-2025-0001",
    invoice_date: "2025-03-15",
    customer_name: "Acme Logistics",
    currency: "PHP",
    status: "posted",
    amount: 0,
    total_amount: 0,
    ...overrides,
  } as Invoice;
}

describe("resolveInvoicePrintableDocument — minimal", () => {
  it("renders title and reference; omits empty TIN/BL/consignee fields", () => {
    const doc = resolveInvoicePrintableDocument({ invoice: baseInvoice() });
    expect(doc.title).toBe("SALES INVOICE");
    expect(doc.headerFields.find((f) => f.id === "invoice_no")?.value).toBe("INV-2025-0001");
    const shipment = doc.sections.find((s) => s.id === "shipment");
    expect(shipment).toBeUndefined();
  });

  it("omits the invoice line table when no items exist", () => {
    const doc = resolveInvoicePrintableDocument({ invoice: baseInvoice() });
    expect(doc.tables.find((t) => t.id === "invoice-lines")).toBeUndefined();
  });
});

describe("resolveInvoicePrintableDocument — metadata fallback", () => {
  it("reads zone_a fields for B/L, consignee, commodity, terms", () => {
    const doc = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        metadata: {
          zone_a: {
            bl_number: "BL-001",
            consignee: "Consignee Co.",
            commodity_description: "Auto parts",
            credit_terms: "Net 30",
            customer_tin: "111-222-333",
          },
        },
      } as any),
    });
    const shipment = doc.sections.find((s) => s.id === "shipment");
    expect(shipment).toBeDefined();
    const ids = shipment!.fields.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["bl_number", "consignee", "commodity"]));

    expect(doc.headerFields.find((f) => f.id === "terms")?.value).toBe("Net 30");
    const billTo = doc.partySections.find((s) => s.id === "bill_to")!;
    expect(billTo.fields.find((f) => f.id === "tin")?.value).toBe("111-222-333");
  });

  it("falls back to metadata.line_items when top-level missing", () => {
    const doc = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        metadata: {
          line_items: [
            { description: "Service A", quantity: 1, unit_price: 1000, amount: 1000, tax_type: "NON-VAT" },
          ],
        },
      } as any),
    });
    const table = doc.tables.find((t) => t.id === "invoice-lines");
    expect(table).toBeDefined();
    expect(table!.rows.length).toBe(1);
  });
});

describe("resolveInvoicePrintableDocument — taxes & columns", () => {
  it("hides Tax Type column when tax summary off", () => {
    const doc = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        line_items: [
          { description: "X", quantity: 1, unit_price: 100, amount: 100, tax_type: "VAT" },
        ],
      } as any),
      options: {
        signatories: {
          prepared_by: { name: "", title: "" },
          approved_by: { name: "", title: "" },
        },
        display: {
          show_bank_details: true,
          show_notes: true,
          show_tax_summary: false,
          show_letterhead: true,
        },
      },
    });
    const table = doc.tables.find((t) => t.id === "invoice-lines")!;
    expect(table.columns.map((c) => c.id)).not.toContain("tax_type");
  });

  it("hides Remarks/Unit/Qty columns when all rows empty", () => {
    const doc = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        line_items: [
          { description: "X", unit_price: 100, amount: 100 },
          { description: "Y", unit_price: 200, amount: 200 },
        ],
      } as any),
    });
    const table = doc.tables.find((t) => t.id === "invoice-lines")!;
    const ids = table.columns.map((c) => c.id);
    expect(ids).not.toContain("remarks");
    expect(ids).not.toContain("unit");
    expect(ids).not.toContain("quantity");
    expect(ids).toContain("description");
    expect(ids).toContain("amount");
  });
});

describe("resolveInvoicePrintableDocument — totals", () => {
  it("includes PHP equivalent row only when invoice has FX rate", () => {
    const docFx = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        currency: "USD",
        exchange_rate: 58.25,
        base_amount: 58250,
        subtotal: 1000,
        total_amount: 1000,
        line_items: [{ description: "X", unit_price: 1000, amount: 1000 }],
      } as any),
    });
    expect(docFx.totals?.rows.find((r) => r.id === "php_equivalent")).toBeDefined();

    const docNoFx = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        currency: "PHP",
        line_items: [{ description: "X", unit_price: 1000, amount: 1000 }],
        subtotal: 1000,
        total_amount: 1000,
      } as any),
    });
    expect(docNoFx.totals?.rows.find((r) => r.id === "php_equivalent")).toBeUndefined();
  });

  it("omits VAT total row when tax_amount is 0", () => {
    const doc = resolveInvoicePrintableDocument({
      invoice: baseInvoice({
        line_items: [{ description: "X", unit_price: 1000, amount: 1000 }],
        subtotal: 1000,
        total_amount: 1000,
        tax_amount: 0,
      } as any),
    });
    expect(doc.totals?.rows.find((r) => r.id === "vat")).toBeUndefined();
  });
});
