import { describe, it, expect } from "vitest";
import { resolveQuotationPrintableDocument } from "./quotationDocumentResolver";
import type { QuotationNew } from "../../types/pricing";

function baseQuote(overrides: Partial<QuotationNew> = {}): QuotationNew {
  return {
    id: "q-1",
    quote_number: "Q-2025-0001",
    created_date: "2025-03-15",
    valid_until: "",
    customer_id: "c-1",
    customer_name: "Acme Logistics",
    movement: "IMPORT",
    category: "SEA FREIGHT",
    shipment_freight: "LCL",
    services: [],
    incoterm: "",
    carrier: "",
    commodity: "",
    pol_aol: "",
    pod_aod: "",
    charge_categories: [],
    currency: "PHP",
    financial_summary: {
      subtotal_non_taxed: 0,
      subtotal_taxed: 0,
      tax_rate: 0.12,
      tax_amount: 0,
      other_charges: 0,
      grand_total: 0,
    },
    status: "Draft",
    created_by: "u-1",
    created_at: "2025-03-15T00:00:00Z",
    updated_at: "2025-03-15T00:00:00Z",
    ...overrides,
  } as QuotationNew;
}

describe("resolveQuotationPrintableDocument — minimal", () => {
  it("contains title, reference, customer; omits empty shipment fields", () => {
    const doc = resolveQuotationPrintableDocument({ quotation: baseQuote() });
    expect(doc.title).toBe("QUOTATION");
    expect(doc.headerFields.find((f) => f.id === "reference")).toBeUndefined();
    expect(doc.sections.find((s) => s.id === "quotation_details")?.fields.find((f) => f.id === "reference")?.value).toBe("Q-2025-0001");
    expect(doc.partySections[0].fields.find((f) => f.id === "customer")?.value).toBe(
      "Acme Logistics",
    );
    // Shipment section either dropped entirely or only contains movement/category
    const shipment = doc.sections.find((s) => s.id === "shipment");
    if (shipment) {
      const ids = shipment.fields.map((f) => f.id);
      expect(ids).not.toContain("collection_address");
      expect(ids).not.toContain("dimensions");
      expect(ids).not.toContain("gross_weight");
    }
  });

  it("omits the charge table entirely when no charges exist", () => {
    const doc = resolveQuotationPrintableDocument({ quotation: baseQuote() });
    expect(doc.tables.find((t) => t.id === "charges")).toBeUndefined();
  });

  it("omits the bank block when company settings have no bank info", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote(),
      companySettings: {
        id: "default",
        company_name: "Neuron",
        address_line1: null,
        address_line2: null,
        city: null,
        country: null,
        phone_numbers: [],
        email: null,
        bank_name: null,
        bank_account_name: null,
        bank_account_number: null,
        logo_url: null,
        updated_at: "",
      },
    });
    expect(doc.bank).toBeUndefined();
  });

  it("uses default contact footer when company settings contact fields are blank", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote(),
      companySettings: {
        id: "default",
        company_name: "Neuron",
        address_line1: null,
        address_line2: null,
        city: null,
        country: null,
        phone_numbers: [],
        email: null,
        bank_name: null,
        bank_account_name: null,
        bank_account_number: null,
        logo_url: null,
        updated_at: "",
      },
    });

    expect(doc.contactFooter?.callNumbers.length).toBeGreaterThan(0);
    expect(doc.contactFooter?.emails).toContain("inquiries@neuron-os.com");
    expect(doc.contactFooter?.addressLines.length).toBeGreaterThan(0);
  });

  it("still hides contact footer when the display flag is off", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote(),
      options: {
        signatories: {
          prepared_by: { name: "", title: "" },
          approved_by: { name: "", title: "" },
        },
        addressed_to: { name: "", title: "" },
        payment_terms: "",
        custom_notes: "",
        validity_override: "",
        display: {
          show_bank_details: true,
          show_notes: true,
          show_tax_summary: true,
          show_letterhead: true,
          show_signatories: true,
          show_contact_footer: false,
        },
      },
    });

    expect(doc.contactFooter).toBeUndefined();
  });
});

describe("resolveQuotationPrintableDocument — service metadata", () => {
  it("emits a Brokerage section with only fields that exist", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        services_metadata: [
          {
            service_type: "Brokerage",
            service_details: {
              subtype: "Import",
              shipment_type: "FCL",
              type_of_entry: "Consumption",
              // Empty values must NOT render
              consumption: "",
              warehousing: undefined,
              peza: null,
              commodity: "Auto parts",
            },
          },
        ],
      }),
    });
    const brok = doc.sections.find((s) => s.title === "Brokerage Details");
    expect(brok).toBeDefined();
    const ids = brok!.fields.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "svc-brokerage-0.subtype",
        "svc-brokerage-0.shipment_type",
        "svc-brokerage-0.type_of_entry",
        "svc-brokerage-0.commodity",
      ]),
    );
    expect(ids).not.toContain("svc-brokerage-0.consumption");
    expect(ids).not.toContain("svc-brokerage-0.warehousing");
  });

  it("formats container object arrays instead of printing object placeholders", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        services_metadata: [
          {
            service_type: "Brokerage",
            service_details: {
              subtype: "Import",
              containers: [
                { id: "c1", type: "20ft", qty: 2 },
                { id: "c2", type: "40ft", qty: 1 },
              ],
            },
          },
        ],
      }),
    });
    const brok = doc.sections.find((s) => s.title === "Brokerage Details");
    expect(brok?.fields.find((f) => f.id === "svc-brokerage-0.containers")?.value).toEqual([
      "2 x 20ft",
      "1 x 40ft",
    ]);
  });

  it("does not render Forwarding section when no forwarding metadata", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        services_metadata: [
          {
            service_type: "Brokerage",
            service_details: { subtype: "Import" },
          },
        ],
      }),
    });
    expect(doc.sections.find((s) => s.title === "Forwarding Details")).toBeUndefined();
  });
});

describe("resolveQuotationPrintableDocument — pricing & totals", () => {
  it("builds a charge table with dynamic columns and recomputes subtotal", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        charge_categories: [
          {
            id: "cat-1",
            category_name: "Origin Charges",
            subtotal: 0,
            line_items: [
              {
                id: "li-1",
                description: "Documentation",
                price: 1000,
                currency: "PHP",
                quantity: 1,
                forex_rate: 1,
                is_taxed: true,
                remarks: "",
                amount: 1000,
              } as any,
              {
                id: "li-2",
                description: "Handling",
                price: 500,
                currency: "PHP",
                quantity: 2,
                forex_rate: 1,
                is_taxed: false,
                remarks: "",
                amount: 1000,
              } as any,
            ],
          },
        ],
      }),
    });
    const charges = doc.tables.find((t) => t.id === "charges");
    expect(charges).toBeDefined();
    const colIds = charges!.columns.map((c) => c.id);
    // Remarks column should be hidden (all rows empty)
    expect(colIds).not.toContain("remarks");
    // Forex column should be hidden (all rates === 1)
    expect(colIds).not.toContain("forex");
    // Description and amount must remain
    expect(colIds).toContain("description");
    expect(colIds).toContain("amount");
    // Totals
    expect(doc.totals?.grandTotal?.value).toBeGreaterThan(0);
  });

  it("hides Forex column when all rates are 1", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        charge_categories: [
          {
            id: "cat-1",
            category_name: "X",
            subtotal: 100,
            line_items: [
              {
                id: "li-1",
                description: "Item",
                price: 100,
                currency: "PHP",
                quantity: 1,
                forex_rate: 1,
                is_taxed: false,
                remarks: "",
                amount: 100,
              } as any,
            ],
          },
        ],
      }),
    });
    const charges = doc.tables.find((t) => t.id === "charges")!;
    expect(charges.columns.map((c) => c.id)).not.toContain("forex");
  });

  it("keeps Forex column when any rate != 1", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        charge_categories: [
          {
            id: "cat-1",
            category_name: "X",
            subtotal: 0,
            line_items: [
              {
                id: "li-1",
                description: "Item",
                price: 100,
                currency: "USD",
                quantity: 1,
                forex_rate: 58.25,
                is_taxed: false,
                remarks: "",
                amount: 5825,
              } as any,
            ],
          },
        ],
      }),
    });
    const charges = doc.tables.find((t) => t.id === "charges")!;
    expect(charges.columns.map((c) => c.id)).toContain("forex");
  });
});

describe("resolveQuotationPrintableDocument — contract", () => {
  it("uses CONTRACT QUOTATION title and includes contract validity", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        quotation_type: "contract",
        contract_validity_start: "2025-01-01",
        contract_validity_end: "2025-12-31",
        scope_of_services: ["<p>Forwarding</p><p>Brokerage &amp; Trucking</p>"],
        terms_and_conditions: ["<p>Net 30</p>"],
        services_metadata: [
          {
            service_type: "Brokerage",
            service_details: {
              subtype: "Import",
              commodity: "Animal Feed",
            },
          },
        ],
      }),
    });
    expect(doc.title).toBe("CONTRACT QUOTATION");
    expect(doc.headerFields.find((f) => f.id === "contract_number")).toBeUndefined();
    expect(doc.headerFields.find((f) => f.id === "reference")).toBeUndefined();
    expect(doc.headerFields.find((f) => f.id === "contract_start")).toBeUndefined();
    const contractDetails = doc.sections.find((s) => s.id === "contract_details");
    expect(contractDetails).toBeDefined();
    expect(contractDetails!.fields.find((f) => f.id === "contract_start")?.value).toBe("2025-01-01");
    expect(contractDetails!.fields.find((f) => f.id === "contract.0.subtype")?.value).toBe("Import");
    expect(contractDetails!.fields.find((f) => f.id === "contract.0.commodity")?.value).toBe("Animal Feed");
    const scope = doc.sections.find((s) => s.id === "scope");
    expect(scope).toBeDefined();
    expect(scope!.fields[0].value).toEqual(["Forwarding", "Brokerage & Trucking"]);
    expect(doc.sections.find((s) => s.title === "Brokerage Details")).toBeUndefined();
    expect(doc.notes.find((s) => s.id === "contract_terms")?.fields[0].value).toEqual(["Net 30"]);
  });

  it("renders contract rate matrices instead of empty quotation charge/totals", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        quotation_type: "contract",
        services: ["Brokerage", "Trucking"],
        rate_matrices: [
          {
            id: "matrix-brokerage",
            service_type: "Brokerage",
            columns: ["FCL", "LCL / AIR"],
            currency: "PHP",
            rows: [],
            categories: [
              {
                id: "cat-brokerage",
                category_name: "Customs Clearance",
                rows: [
                  {
                    id: "row-clearance",
                    particular: "Clearance Fee",
                    rates: { FCL: 4500, "LCL / AIR": 3500 },
                    unit: "per_entry",
                    remarks: "Standard processing",
                  },
                ],
              },
            ],
          },
          {
            id: "matrix-trucking",
            service_type: "Trucking",
            columns: ["Cost"],
            currency: "PHP",
            rows: [
              {
                id: "row-trucking",
                particular: "Metro Manila Delivery",
                rates: { Cost: 6500 },
                unit: "per_shipment",
              },
            ],
          },
        ],
      }),
    });

    expect(doc.tables.map((t) => t.id)).toEqual([
      "contract-rate-matrix-brokerage",
      "contract-rate-matrix-trucking",
    ]);
    expect(doc.tables[0].title).toBe("Brokerage Charges (PHP)");
    expect(doc.tables[0].columns.map((c) => c.label)).toEqual(
      expect.arrayContaining(["Particular", "FCL", "LCL / AIR", "Unit", "Remarks"]),
    );
    expect(doc.tables[0].rows[0].cells.particular).toBe("Clearance Fee");
    expect(doc.tables[0].rows[0].cells["rate:FCL"]).toBe(4500);
    expect(doc.totals).toBeUndefined();
    expect(doc.tables.find((t) => t.id === "charges")).toBeUndefined();
  });
});

describe("resolveQuotationPrintableDocument — signatories", () => {
  it("omits empty signatory cards when neither name/title nor signature-line requested", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote(),
      // Default behavior is includeSignatureLine: true, so signatories survive.
    });
    // With default signatures-on plan they should all 3 keep the line for blank conforme
    expect(doc.signatories.length).toBe(3);
  });

  it("treats quotation print options as snake_case input, not normalized document settings", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote(),
      options: {
        signatories: {
          prepared_by: { name: "Roberto Aguilar", title: "Sales Representative" },
          approved_by: { name: "Management", title: "Authorized Signatory" },
        },
        addressed_to: { name: "", title: "" },
        validity_override: "",
        payment_terms: "",
        custom_notes: "",
        display: {
          show_bank_details: true,
          show_notes: true,
          show_tax_summary: true,
          show_letterhead: true,
          show_signatories: true,
          show_contact_footer: true,
        },
      },
    });

    expect(doc.options.showSignatories).toBe(true);
    expect(doc.options.showContactFooter).toBe(true);
    expect(doc.signatories.map((s) => s.id)).toEqual(["prepared_by", "approved_by", "conforme"]);
    expect(doc.contactFooter).toBeDefined();
  });

  it("hides bank/notes/signatories when display flags are off", () => {
    const doc = resolveQuotationPrintableDocument({
      quotation: baseQuote({
        custom_notes: "Net 30 terms apply.",
      }),
      companySettings: {
        id: "default",
        company_name: "N",
        address_line1: null,
        address_line2: null,
        city: null,
        country: null,
        phone_numbers: [],
        email: null,
        bank_name: "BDO",
        bank_account_name: "X",
        bank_account_number: "1",
        logo_url: null,
        updated_at: "",
      },
      options: {
        signatories: {
          prepared_by: { name: "", title: "" },
          approved_by: { name: "", title: "" },
        },
        addressed_to: { name: "", title: "" },
        validity_override: "",
        payment_terms: "",
        custom_notes: "",
        display: {
          show_bank_details: false,
          show_notes: false,
          show_tax_summary: false,
          show_letterhead: true,
          show_signatories: true,
          show_contact_footer: true,
        },
      },
    });
    expect(doc.bank).toBeUndefined();
    expect(doc.notes).toEqual([]);
  });
});
