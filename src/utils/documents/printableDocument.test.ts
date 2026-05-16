import { describe, it, expect } from "vitest";
import {
  isPrintableValue,
  normalizeField,
  normalizeSection,
  normalizeTable,
  normalizePrintableDocument,
} from "./printableDocumentNormalize";
import {
  DEFAULT_PRINTABLE_OPTIONS,
  type PrintableDocument,
} from "./printableDocument";

describe("isPrintableValue", () => {
  it("treats 0 and false as printable", () => {
    expect(isPrintableValue(0)).toBe(true);
    expect(isPrintableValue(false)).toBe(true);
  });

  it("rejects null, undefined, empty string, whitespace", () => {
    expect(isPrintableValue(null)).toBe(false);
    expect(isPrintableValue(undefined)).toBe(false);
    expect(isPrintableValue("")).toBe(false);
    expect(isPrintableValue("   ")).toBe(false);
  });

  it("rejects placeholder dashes and TBA/N/A defaults", () => {
    expect(isPrintableValue("-")).toBe(false);
    expect(isPrintableValue("—")).toBe(false);
    expect(isPrintableValue("N/A")).toBe(false);
    expect(isPrintableValue("n/a")).toBe(false);
    expect(isPrintableValue("None")).toBe(false);
    expect(isPrintableValue("TBA")).toBe(false);
  });

  it("treats non-empty arrays as printable, empty arrays as not", () => {
    expect(isPrintableValue([])).toBe(false);
    expect(isPrintableValue(["a"])).toBe(true);
    expect(isPrintableValue(["", null])).toBe(false);
  });

  it("treats object values as printable only when they contain printable data", () => {
    expect(isPrintableValue({ id: "internal-only" })).toBe(false);
    expect(isPrintableValue({ id: "x", type: "20ft", qty: 2 })).toBe(true);
    expect(isPrintableValue([{ id: "empty" }, { size: "40ft" }])).toBe(true);
  });

  it("rejects NaN/Infinity numbers", () => {
    expect(isPrintableValue(NaN)).toBe(false);
    expect(isPrintableValue(Infinity)).toBe(false);
  });
});

describe("normalizeField", () => {
  it("removes a field with empty value", () => {
    expect(
      normalizeField({ id: "x", label: "X", value: "" }),
    ).toBeNull();
  });
  it("trims string values", () => {
    expect(
      normalizeField({ id: "x", label: "X", value: "  hi  " }),
    ).toEqual({ id: "x", label: "X", value: "hi" });
  });
  it("keeps 0", () => {
    expect(
      normalizeField({ id: "x", label: "X", value: 0 }),
    ).toEqual({ id: "x", label: "X", value: 0 });
  });
  it("filters arrays and removes if all empty", () => {
    expect(
      normalizeField({ id: "x", label: "X", value: ["", null as any] }),
    ).toBeNull();
    expect(
      normalizeField({ id: "x", label: "X", value: ["a", "", "b"] }),
    ).toEqual({ id: "x", label: "X", value: ["a", "b"] });
  });
  it("filters empty object entries from arrays", () => {
    expect(
      normalizeField({ id: "x", label: "X", value: [{ id: "empty" }, { type: "20ft", qty: 2 }] }),
    ).toEqual({ id: "x", label: "X", value: [{ type: "20ft", qty: 2 }] });
  });
});

describe("normalizeSection", () => {
  it("returns null when no field is printable", () => {
    expect(
      normalizeSection({
        id: "s",
        fields: [
          { id: "a", label: "A", value: "" },
          { id: "b", label: "B", value: null },
        ],
      }),
    ).toBeNull();
  });
  it("keeps section when at least one field is printable", () => {
    const out = normalizeSection({
      id: "s",
      fields: [
        { id: "a", label: "A", value: "" },
        { id: "b", label: "B", value: "Y" },
      ],
    });
    expect(out?.fields).toEqual([{ id: "b", label: "B", value: "Y" }]);
  });
});

describe("normalizeTable", () => {
  it("returns null when no rows have data", () => {
    expect(
      normalizeTable({
        id: "t",
        columns: [{ id: "a", label: "A" }],
        rows: [{ id: "r1", cells: { a: "" } }],
      }),
    ).toBeNull();
  });
  it("drops columns marked hideWhenEmpty when no row has values", () => {
    const t = normalizeTable({
      id: "t",
      columns: [
        { id: "desc", label: "Desc" },
        { id: "remarks", label: "Remarks", hideWhenEmpty: true },
        { id: "forex", label: "Forex", hideWhenEmpty: true },
      ],
      rows: [
        { id: "r1", cells: { desc: "Item 1", remarks: "", forex: null } },
        { id: "r2", cells: { desc: "Item 2", remarks: "  ", forex: "" } },
      ],
    });
    expect(t?.columns.map((c) => c.id)).toEqual(["desc"]);
  });
  it("keeps a column when at least one row has data", () => {
    const t = normalizeTable({
      id: "t",
      columns: [
        { id: "desc", label: "Desc" },
        { id: "remarks", label: "Remarks", hideWhenEmpty: true },
      ],
      rows: [
        { id: "r1", cells: { desc: "Item 1", remarks: "note" } },
        { id: "r2", cells: { desc: "Item 2", remarks: "" } },
      ],
    });
    expect(t?.columns.map((c) => c.id)).toEqual(["desc", "remarks"]);
  });
});

describe("normalizePrintableDocument", () => {
  const base: PrintableDocument = {
    kind: "quotation",
    title: "QUOTATION",
    headerFields: [
      { id: "ref", label: "Ref", value: "Q-1" },
      { id: "valid", label: "Valid Until", value: "" },
    ],
    partySections: [
      {
        id: "p",
        title: "Prepared For",
        fields: [
          { id: "cust", label: "Customer", value: "Acme" },
          { id: "att", label: "Attention", value: "" },
        ],
      },
      {
        id: "empty",
        title: "Empty",
        fields: [{ id: "x", label: "X", value: "" }],
      },
    ],
    sections: [],
    tables: [
      {
        id: "rates",
        columns: [
          { id: "desc", label: "Desc" },
          { id: "remarks", label: "Remarks", hideWhenEmpty: true },
        ],
        rows: [{ id: "r1", cells: { desc: "Freight" } }],
      },
    ],
    notes: [
      {
        id: "n",
        fields: [{ id: "text", label: "", value: "Net 30" }],
      },
    ],
    signatories: [
      { id: "prep", label: "Prepared by", name: "Marcus" },
      { id: "appr", label: "Approved by" },
      {
        id: "conf",
        label: "Conforme",
        includeSignatureLine: true,
      },
    ],
    footerFields: [],
    options: DEFAULT_PRINTABLE_OPTIONS,
  };

  it("strips empty header fields, empty sections, empty columns", () => {
    const out = normalizePrintableDocument(base);
    expect(out.headerFields.map((f) => f.id)).toEqual(["ref"]);
    expect(out.partySections.map((s) => s.id)).toEqual(["p"]);
    expect(out.tables[0].columns.map((c) => c.id)).toEqual(["desc"]);
  });

  it("keeps signatory with includeSignatureLine, drops fully empty", () => {
    const out = normalizePrintableDocument(base);
    expect(out.signatories.map((s) => s.id)).toEqual(["prep", "conf"]);
  });

  it("hides notes/signatories when display options say so", () => {
    const out = normalizePrintableDocument({
      ...base,
      options: {
        ...DEFAULT_PRINTABLE_OPTIONS,
        showNotes: false,
        showSignatories: false,
      },
    });
    expect(out.notes).toEqual([]);
    expect(out.signatories).toEqual([]);
  });

  it("hides bank block when showBankDetails is false", () => {
    const out = normalizePrintableDocument({
      ...base,
      bank: { bankName: "BDO", accountName: "Neuron", accountNumber: "1" },
      options: { ...DEFAULT_PRINTABLE_OPTIONS, showBankDetails: false },
    });
    expect(out.bank).toBeUndefined();
  });

  it("hides empty bank block even when showBankDetails is true", () => {
    const out = normalizePrintableDocument({
      ...base,
      bank: { bankName: undefined, accountName: undefined, accountNumber: undefined },
    });
    expect(out.bank).toBeUndefined();
  });
});
