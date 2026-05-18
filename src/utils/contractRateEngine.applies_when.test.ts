import { describe, expect, it } from "vitest";
import { instantiateRates } from "./contractRateEngine";
import type { ContractRateMatrix, ContractRateRow } from "../types/pricing";

function makeMatrix(rows: ContractRateRow[]): ContractRateMatrix {
  return {
    id: "m1",
    service_type: "Brokerage",
    columns: ["FCL"],
    rows,
  };
}

function makeRow(overrides: Partial<ContractRateRow>): ContractRateRow {
  return {
    id: overrides.id ?? "r1",
    particular: overrides.particular ?? "Test Charge",
    rates: overrides.rates ?? { FCL: 1000 },
    unit: overrides.unit ?? "per_shipment",
    ...overrides,
  };
}

describe("instantiateRates — applies_when filter", () => {
  it("includes the row when the booking declares a matching permit fact", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "BAI Processing",
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      permits: ["BAI"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].particular).toBe("BAI Processing");
  });

  it("excludes the row when the booking declares a different permit", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "BAI Processing",
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      permits: ["SRA"],
    });
    expect(result).toHaveLength(0);
  });

  it("excludes the row when no facts are provided", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "BAI Processing",
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 });
    expect(result).toHaveLength(0);
  });

  it("includes a row that has no applies_when regardless of facts (backwards compat)", () => {
    const matrix = makeMatrix([
      makeRow({ particular: "Brokerage Fee" }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      permits: [], examinations: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].particular).toBe("Brokerage Fee");
  });

  it("includes a row with applies_when.kind 'always'", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "Brokerage Fee",
        applies_when: { kind: "always" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 });
    expect(result).toHaveLength(1);
  });

  it("matches case-insensitively (booking 'bai' matches trigger 'BAI')", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "BAI Processing",
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      permits: ["bai"],
    });
    expect(result).toHaveLength(1);
  });

  it("matches examination triggers against examinations[]", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "X-Ray Examination Fee",
        applies_when: { kind: "examination", value: "X-ray" },
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      examinations: ["X-ray"],
    });
    expect(result).toHaveLength(1);
  });

  it("skips misconfigured rows where applies_when has no value", () => {
    const matrix = makeMatrix([
      makeRow({
        particular: "Mystery Fee",
        applies_when: { kind: "permit" }, // missing value
      }),
    ]);
    const result = instantiateRates(matrix, "FCL", { shipments: 1 }, undefined, {
      permits: ["BAI", "SRA"],
    });
    expect(result).toHaveLength(0);
  });

  it("filters independently from selection_group (both must pass)", () => {
    const matrix = makeMatrix([
      makeRow({
        id: "r1",
        particular: "Wing Van to Cebu",
        selection_group: "Cebu",
        applies_when: { kind: "permit", value: "BAI" },
      }),
    ]);
    // selection matches, fact doesn't → excluded
    expect(
      instantiateRates(matrix, "FCL", { shipments: 1 }, { Cebu: "Wing Van to Cebu" }, { permits: ["SRA"] }),
    ).toHaveLength(0);
    // selection doesn't match, fact does → excluded
    expect(
      instantiateRates(matrix, "FCL", { shipments: 1 }, { Cebu: "Other Truck" }, { permits: ["BAI"] }),
    ).toHaveLength(0);
    // both match → included
    expect(
      instantiateRates(matrix, "FCL", { shipments: 1 }, { Cebu: "Wing Van to Cebu" }, { permits: ["BAI"] }),
    ).toHaveLength(1);
  });
});
