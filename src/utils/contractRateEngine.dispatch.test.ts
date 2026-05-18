import { describe, expect, it } from "vitest";
import { instantiateRates, generateContractBilling } from "./contractRateEngine";
import type { ContractRateMatrix, ContractRateRow, ContractRateCategory } from "../types/pricing";

// ============================================
// Helpers
// ============================================

function makeRow(overrides: Partial<ContractRateRow> & { id: string }): ContractRateRow {
  return {
    particular: overrides.particular ?? "Test Charge",
    rates: overrides.rates ?? { FCL: 1000 },
    unit: overrides.unit ?? "per_shipment",
    ...overrides,
  };
}

function makeMatrix(opts: {
  rows: ContractRateRow[];
  categories?: ContractRateCategory[];
  columns?: string[];
}): ContractRateMatrix {
  return {
    id: "m1",
    service_type: "Brokerage",
    columns: opts.columns ?? ["FCL"],
    rows: opts.rows,
    categories: opts.categories,
  };
}

// ============================================
// Unit fix: per_entry + flat
// ============================================

describe("getQuantityForUnit — Phase 1 unit fix", () => {
  it("per_entry uses shipments, not containers (fixes Documentation Fee × containers bug)", () => {
    const row = makeRow({ id: "r1", particular: "Documentation Fee", unit: "per_entry", rates: { FCL: 3500 } });
    const matrix = makeMatrix({ rows: [row] });
    // Booking: 3 containers, 1 shipment (the DAFFID booking shape)
    const result = instantiateRates(matrix, "FCL", { containers: 3, shipments: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1);   // would have been 3 before the fix
    expect(result[0].subtotal).toBe(3500); // would have been 10500 before
  });

  it("per_entry defaults to 1 when shipments unset", () => {
    const row = makeRow({ id: "r1", unit: "per_entry", rates: { FCL: 500 } });
    const matrix = makeMatrix({ rows: [row] });
    const result = instantiateRates(matrix, "FCL", { containers: 5 });
    expect(result[0].quantity).toBe(1);
    expect(result[0].subtotal).toBe(500);
  });

  it("flat always returns quantity 1 regardless of booking shape", () => {
    const row = makeRow({ id: "r1", unit: "flat", rates: { FCL: 7500 } });
    const matrix = makeMatrix({ rows: [row] });
    const result = instantiateRates(matrix, "FCL", { containers: 10, shipments: 5, bls: 2 });
    expect(result[0].quantity).toBe(1);
    expect(result[0].subtotal).toBe(7500);
  });

  it("unrecognised unit still falls through to containers (legacy behaviour preserved)", () => {
    const row = makeRow({ id: "r1", unit: "per_kg", rates: { FCL: 100 } });
    const matrix = makeMatrix({ rows: [row] });
    // per_kg isn't handled — falls through to containers
    const result = instantiateRates(matrix, "FCL", { containers: 4 });
    expect(result[0].quantity).toBe(4);
  });
});

// ============================================
// generateContractBilling dispatch entry point
// ============================================

describe("generateContractBilling — Phase 1 dispatch", () => {
  it("matrix without categories: implicit standard category, identical to instantiateRates", () => {
    const matrix = makeMatrix({
      rows: [
        makeRow({ id: "r1", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } }),
        makeRow({ id: "r2", particular: "Stamps", unit: "per_bl", rates: { FCL: 1000 } }),
      ],
    });
    const ctx = { containers: 3, bls: 1, shipments: 1 };
    const viaDispatch = generateContractBilling(matrix, "FCL", { quantities: ctx });
    const viaLegacy = instantiateRates(matrix, "FCL", ctx);
    expect(viaDispatch).toEqual(viaLegacy);
  });

  it("matrix with one standard category produces same output as instantiateRates on flat rows", () => {
    const rows = [
      makeRow({ id: "r1", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } }),
      makeRow({ id: "r2", particular: "Stamps", unit: "per_bl", rates: { FCL: 1000 } }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Brokerage Charges", kind: "standard", rows }],
    });
    const ctx = { containers: 3, bls: 1, shipments: 1 };
    const viaDispatch = generateContractBilling(matrix, "FCL", { quantities: ctx });
    expect(viaDispatch).toHaveLength(2);
    expect(viaDispatch.map((r) => r.particular).sort()).toEqual(["Brokerage Fee", "Stamps"]);
    expect(viaDispatch.every((r) => r.category === "Brokerage Charges")).toBe(true);
  });

  it("explicit kind:'standard' behaves identically to omitted kind", () => {
    const rows = [makeRow({ id: "r1", unit: "per_bl", rates: { FCL: 5300 } })];
    const matrixA = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Charges", rows }], // kind absent
    });
    const matrixB = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Charges", kind: "standard", rows }],
    });
    const ctx = { bls: 1 };
    expect(generateContractBilling(matrixA, "FCL", { quantities: ctx })).toEqual(
      generateContractBilling(matrixB, "FCL", { quantities: ctx }),
    );
  });

  it("Phase 1: kind:'optional' falls back to standard (no Phase 2 logic yet)", () => {
    const rows = [
      // Row would be excluded by Phase 2's optional dispatcher (no applies_when, optional category)
      // but in Phase 1 it must still appear so contracts tagged ahead of time don't lose revenue.
      makeRow({ id: "r1", particular: "BAI Processing", unit: "per_shipment", rates: { FCL: 3500 } }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", { quantities: { shipments: 1 } });
    expect(result).toHaveLength(1);
    expect(result[0].subtotal).toBe(3500);
  });

  it("Phase 1: kind:'delivery' falls back to standard (no Phase 3 logic yet)", () => {
    const rows = [
      makeRow({ id: "r1", particular: "20ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "r2", particular: "40ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Delivery Charges", kind: "delivery", rows }],
    });
    // Phase 1: both rows still fire × 3 containers (the prod bug behaviour, preserved
    // intentionally until Phase 3 ships the real delivery dispatcher).
    const result = generateContractBilling(matrix, "FCL", { quantities: { containers: 3 } });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.quantity === 3)).toBe(true);
  });

  it("multiple categories: each runs its dispatcher and results concatenate in order", () => {
    const broker = [makeRow({ id: "br1", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } })];
    const other = [makeRow({ id: "o1", particular: "X-Ray", unit: "per_container", rates: { FCL: 3500 } })];
    const matrix = makeMatrix({
      rows: [...broker, ...other],
      categories: [
        { id: "c1", category_name: "Brokerage Charges", kind: "standard", rows: broker },
        { id: "c2", category_name: "Other Charges", kind: "optional", rows: other }, // falls back to standard in Phase 1
      ],
    });
    const result = generateContractBilling(matrix, "FCL", { quantities: { containers: 3, bls: 1 } });
    expect(result).toHaveLength(2);
    expect(result[0].particular).toBe("Brokerage Fee");
    expect(result[0].category).toBe("Brokerage Charges");
    expect(result[1].particular).toBe("X-Ray");
    expect(result[1].category).toBe("Other Charges");
  });

  it("unknown kind value falls back to standard (defensive — JSONB could contain anything)", () => {
    const rows = [makeRow({ id: "r1", unit: "per_bl", rates: { FCL: 1000 } })];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "X", kind: "bogus" as any, rows }],
    });
    const result = generateContractBilling(matrix, "FCL", { quantities: { bls: 1 } });
    expect(result).toHaveLength(1);
  });
});
