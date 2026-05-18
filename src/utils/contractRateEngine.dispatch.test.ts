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

  it("Phase 2: untagged row inside 'optional' category is skipped (separate suite covers the dispatcher in detail)", () => {
    const rows = [
      makeRow({ id: "r1", particular: "BAI Processing", unit: "per_shipment", rates: { FCL: 3500 } }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", { quantities: { shipments: 1 } });
    expect(result).toHaveLength(0);  // Phase 2: untagged in optional → skipped
  });

  it("Phase 3: kind:'delivery' without containers context emits nothing (separate suite covers the dispatcher in detail)", () => {
    const rows = [
      makeRow({ id: "r1", particular: "20ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "r2", particular: "40ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Delivery Charges", kind: "delivery", rows }],
    });
    // Phase 3: delivery dispatcher requires containers. Without it: zero rows.
    // This replaces the Phase 1 placeholder that asserted Cartesian-product fallback.
    const result = generateContractBilling(matrix, "FCL", { quantities: { containers: 3 } });
    expect(result).toHaveLength(0);
  });

  it("multiple categories: each runs its dispatcher and results concatenate in order", () => {
    const broker = [makeRow({ id: "br1", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } })];
    const other = [makeRow({
      id: "o1",
      particular: "X-Ray",
      unit: "per_container",
      rates: { FCL: 3500 },
      applies_when: { kind: "examination", value: "X-ray" },
    })];
    const matrix = makeMatrix({
      rows: [...broker, ...other],
      categories: [
        { id: "c1", category_name: "Brokerage Charges", kind: "standard", rows: broker },
        { id: "c2", category_name: "Other Charges", kind: "optional", rows: other },
      ],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 3, bls: 1 },
      facts: { examinations: ["X-ray"] },
    });
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

// ============================================
// Phase 2 — 'optional' category dispatcher
// ============================================

describe("generateContractBilling — Phase 2 optional dispatcher", () => {
  it("includes a tagged row when booking fact matches", () => {
    const rows = [
      makeRow({
        id: "r1",
        particular: "BAI Processing",
        unit: "per_shipment",
        rates: { FCL: 3500 },
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { shipments: 1 },
      facts: { permits: ["BAI"] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].particular).toBe("BAI Processing");
  });

  it("excludes a tagged row when no facts are provided", () => {
    const rows = [
      makeRow({
        id: "r1",
        particular: "BAI Processing",
        unit: "per_shipment",
        rates: { FCL: 3500 },
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", { quantities: { shipments: 1 } });
    expect(result).toHaveLength(0);
  });

  it("skips untagged rows inside an optional category (misconfig → conservative under-bill)", () => {
    const rows = [
      makeRow({
        id: "r1",
        particular: "Random Optional Row",
        unit: "per_shipment",
        rates: { FCL: 3500 },
        // no applies_when — misconfigured
      }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { shipments: 1 },
      facts: { permits: ["BAI"], examinations: ["X-ray"] },
    });
    expect(result).toHaveLength(0);
  });

  it("optional category with a mix: only tagged-and-matching rows survive", () => {
    const r1 = makeRow({ id: "r1", particular: "BAI", unit: "per_shipment", rates: { FCL: 3500 }, applies_when: { kind: "permit", value: "BAI" } });
    const r2 = makeRow({ id: "r2", particular: "SRA", unit: "per_shipment", rates: { FCL: 3500 }, applies_when: { kind: "permit", value: "SRA" } });
    const r3 = makeRow({ id: "r3", particular: "X-Ray", unit: "per_container", rates: { FCL: 3500 }, applies_when: { kind: "examination", value: "X-ray" } });
    const r4 = makeRow({ id: "r4", particular: "Untagged", unit: "per_shipment", rates: { FCL: 9999 } }); // skipped
    const rows = [r1, r2, r3, r4];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    // Booking has X-ray but no permits — only X-Ray row survives.
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 3, shipments: 1 },
      facts: { examinations: ["X-ray"] },
    });
    expect(result).toHaveLength(1);
    expect(result[0].particular).toBe("X-Ray");
    expect(result[0].quantity).toBe(3);  // per_container
    expect(result[0].subtotal).toBe(10500);
  });

  it("regression: standard category alongside optional still emits every row", () => {
    const standardRows = [
      makeRow({ id: "s1", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } }),
      makeRow({ id: "s2", particular: "Stamps", unit: "per_bl", rates: { FCL: 1000 } }),
    ];
    const optionalRows = [
      makeRow({ id: "o1", particular: "BAI", unit: "per_shipment", rates: { FCL: 3500 }, applies_when: { kind: "permit", value: "BAI" } }),
    ];
    const matrix = makeMatrix({
      rows: [...standardRows, ...optionalRows],
      categories: [
        { id: "c1", category_name: "Brokerage", kind: "standard", rows: standardRows },
        { id: "c2", category_name: "Other Charges", kind: "optional", rows: optionalRows },
      ],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { bls: 1, shipments: 1 },
      facts: { permits: ["BAI"] },
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.particular).sort()).toEqual(["BAI", "Brokerage Fee", "Stamps"]);
  });

  it("optional dispatcher honours case-insensitive fact matching", () => {
    const rows = [
      makeRow({
        id: "r1",
        unit: "per_shipment",
        rates: { FCL: 3500 },
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "c1", category_name: "Other Charges", kind: "optional", rows }],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { shipments: 1 },
      facts: { permits: ["bai"] },  // lowercase
    });
    expect(result).toHaveLength(1);
  });
});

// ============================================
// Phase 3 — 'delivery' category dispatcher
// ============================================

describe("generateContractBilling — Phase 3 delivery dispatcher", () => {
  // Reusable delivery-category matrix mirroring the DAFFID shape:
  // two locations (Valenzuela / Carmona) × five vehicle types each.
  function makeDeliveryMatrix() {
    const rows = [
      makeRow({ id: "vz20", particular: "20ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "vz40", particular: "40ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "vzbb", particular: "BACK TO BACK", unit: "per_container", rates: { FCL: 31500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "ca20", particular: "20ft", unit: "per_container", rates: { FCL: 20000 }, remarks: "within Carmona Cavite" }),
      makeRow({ id: "ca40", particular: "40ft", unit: "per_container", rates: { FCL: 20000 }, remarks: "within Carmona Cavite" }),
    ];
    return makeMatrix({
      rows,
      categories: [{ id: "del", category_name: "Delivery Charges", kind: "delivery", rows }],
    });
  }

  it("3 containers, same type, same address → emits 3 rows (one per container, qty 1 each)", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 3 },
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A2", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A3", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.particular === "20ft")).toBe(true);
    expect(result.every((r) => r.quantity === 1)).toBe(true);
    expect(result.reduce((sum, r) => sum + r.subtotal, 0)).toBe(55500);  // 3 × 18,500 Valenzuela
  });

  it("mixed types: emits one row per container with that container's matched type", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 2 },
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A2", container_type: "40ft", delivery_address: "VALENZUELA CITY" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.particular).sort()).toEqual(["20ft", "40ft"]);
  });

  it("mixed addresses: each container picks the row for its own location", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 2 },
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A2", container_type: "20ft", delivery_address: "Carmona, Cavite" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.subtotal).sort()).toEqual([18500, 20000]); // VZ + Carmona rates
  });

  it("container with no container_type is skipped (no bill emitted)", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      containers: [
        { container_number: "LEGACY", delivery_address: "VALENZUELA CITY" }, // no type
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("container with type but unmatched address is skipped (not silently mis-billed)", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "Davao" },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("falls back to booking-level deliveryAddress when per-container address is empty", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      deliveryAddress: "VALENZUELA CITY",
      containers: [
        { container_number: "A1", container_type: "20ft" }, // no per-container address
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].subtotal).toBe(18500);
  });

  it("single candidate (only one row of that type, no other locations): address constraint relaxed", () => {
    const rows = [
      makeRow({ id: "wheel4", particular: "4 WHEELER", unit: "per_container", rates: { FCL: 7500 }, remarks: "within Valenzuela City" }),
      // Note: no other "4 WHEELER" rows in the matrix
    ];
    const matrix = makeMatrix({
      rows,
      categories: [{ id: "del", category_name: "Delivery", kind: "delivery", rows }],
    });
    // Booking address doesn't match the row's remarks fuzzy-wise, but since
    // it's the only candidate of that type, the dispatcher accepts it.
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      containers: [
        { container_number: "A1", container_type: "4 WHEELER", delivery_address: "somewhere else entirely" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].subtotal).toBe(7500);
  });

  it("type match is case-insensitive ('20FT' booking matches '20ft' row)", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      containers: [
        { container_number: "A1", container_type: "20FT", delivery_address: "VALENZUELA CITY" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].subtotal).toBe(18500);
  });

  it("fuzzy address: 'VALENZUELA CITY' matches 'within Valenzuela City'", () => {
    // This is the DAFFID prod data shape.
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 1 },
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
      ],
    });
    expect(result).toHaveLength(1);
  });

  it("empty containers array → no rows emitted (delivery dispatcher needs containers)", () => {
    const matrix = makeDeliveryMatrix();
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 3 },
      // containers: not provided
    });
    expect(result).toHaveLength(0);
  });

  it("DAFFID scenario end-to-end: 3 × 20ft Valenzuela, mixed-category matrix", () => {
    // Full scenario reproducing the bug fix: brokerage + optional + delivery
    // categories together. Booking has 3 20ft containers to Valenzuela, X-ray
    // exam performed, no permits. Expected: brokerage charges all fire, only
    // X-ray fires from optional, only 1 delivery row × 3 from delivery.
    const brokerRows = [
      makeRow({ id: "bf", particular: "Brokerage Fee", unit: "per_bl", rates: { FCL: 5300 } }),
      makeRow({ id: "st", particular: "Stamps and Notary", unit: "per_bl", rates: { FCL: 1000 } }),
    ];
    const optionalRows = [
      makeRow({ id: "xr", particular: "X-Ray", unit: "per_container", rates: { FCL: 3500 }, applies_when: { kind: "examination", value: "X-ray" } }),
      makeRow({ id: "bai", particular: "BAI", unit: "per_shipment", rates: { FCL: 3500 }, applies_when: { kind: "permit", value: "BAI" } }),
      makeRow({ id: "sra", particular: "SRA", unit: "per_shipment", rates: { FCL: 3500 }, applies_when: { kind: "permit", value: "SRA" } }),
    ];
    const deliveryRows = [
      makeRow({ id: "vz20", particular: "20ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "vz40", particular: "40ft", unit: "per_container", rates: { FCL: 18500 }, remarks: "within Valenzuela City" }),
      makeRow({ id: "ca20", particular: "20ft", unit: "per_container", rates: { FCL: 20000 }, remarks: "within Carmona" }),
    ];
    const matrix = makeMatrix({
      rows: [...brokerRows, ...optionalRows, ...deliveryRows],
      categories: [
        { id: "broker", category_name: "Brokerage Charges", kind: "standard", rows: brokerRows },
        { id: "opt", category_name: "Other Charges", kind: "optional", rows: optionalRows },
        { id: "del", category_name: "Delivery Charges", kind: "delivery", rows: deliveryRows },
      ],
    });
    const result = generateContractBilling(matrix, "FCL", {
      quantities: { containers: 3, bls: 1, shipments: 1 },
      facts: { examinations: ["X-ray"] },  // no permits
      containers: [
        { container_number: "A1", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A2", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
        { container_number: "A3", container_type: "20ft", delivery_address: "VALENZUELA CITY" },
      ],
    });
    // Brokerage Fee + Stamps (2) + X-Ray (1 row × 3 qty) + 3 delivery rows × 1 qty each
    expect(result).toHaveLength(2 + 1 + 3);
    const total = result.reduce((sum, r) => sum + r.subtotal, 0);
    // 5300 + 1000 + 3*3500 + 3*18500 = 5300 + 1000 + 10500 + 55500 = 72300
    expect(total).toBe(72300);
  });
});
