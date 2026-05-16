// Normalization helpers for the printable document model.
//
// Rule of thumb (from the dynamic PDF engine plan):
//  - 0 and false ARE printable
//  - null/undefined/""/"   "/empty arrays are NOT printable
//  - placeholder dashes (-, em dash) and "N/A"/"NA"/"None" are NOT printable
//  - "TBA" is NOT printable (carrier/etc default)
//  - empty fields are removed
//  - empty sections are removed
//  - empty table columns (hideWhenEmpty) are removed if no row has data
//  - empty tables are removed when hideWhenEmpty !== false

import type {
  PrintableDocument,
  PrintableField,
  PrintableSection,
  PrintableSignatory,
  PrintableTable,
  PrintableTableRow,
  PrintableValue,
} from "./printableDocument";

const PLACEHOLDER_VALUES = new Set([
  "-",
  "\u2014",
  "\u00e2\u20ac\u201d",
  "n/a",
  "na",
  "none",
  "tba",
]);

function hasPrintableObjectValue(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([key, entry]) => {
    if (key === "id") return false;
    return isPrintableValue(entry);
  });
}

export function isPrintableValue(value: unknown): boolean {
  if (value === 0) return true;
  if (value === false) return true;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(isPrintableValue);
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) return false;
    if (PLACEHOLDER_VALUES.has(normalized)) return false;
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "object") {
    return hasPrintableObjectValue(value as Record<string, unknown>);
  }
  return true;
}

export function field(
  id: string,
  label: string,
  value: PrintableValue,
  options?: Partial<PrintableField>,
): PrintableField {
  return { id, label, value, ...(options || {}) };
}

export function normalizeField(f: PrintableField): PrintableField | null {
  if (!isPrintableValue(f.value)) return null;
  if (typeof f.value === "string") {
    return { ...f, value: f.value.trim() };
  }
  if (Array.isArray(f.value)) {
    const cleaned = f.value
      .filter((v) => isPrintableValue(v))
      .map((v) => (typeof v === "string" ? v.trim() : v));
    if (cleaned.length === 0) return null;
    return { ...f, value: cleaned };
  }
  return f;
}

export function normalizeSection(
  section: PrintableSection,
): PrintableSection | null {
  const fields = section.fields
    .map(normalizeField)
    .filter((f): f is PrintableField => f !== null);
  if (fields.length === 0) {
    if (section.hideWhenEmpty === false) {
      return { ...section, fields: [] };
    }
    return null;
  }
  return { ...section, fields };
}

function rowHasAnyPrintable(row: PrintableTableRow): boolean {
  return Object.values(row.cells).some((v) => isPrintableValue(v));
}

export function normalizeTable(table: PrintableTable): PrintableTable | null {
  const rows = table.rows.filter(rowHasAnyPrintable);

  if (rows.length === 0) {
    if (table.hideWhenEmpty === false) {
      return { ...table, rows: [] };
    }
    return null;
  }

  const columns = table.columns.filter((column) => {
    if (!column.hideWhenEmpty) return true;
    return rows.some((row) => isPrintableValue(row.cells[column.id]));
  });

  if (columns.length === 0) return null;

  const groups = table.groups
    ? table.groups.filter((group) => rows.some((row) => row.groupId === group.id))
    : undefined;

  return { ...table, columns, rows, groups };
}

export function normalizeSignatory(
  sig: PrintableSignatory,
): PrintableSignatory | null {
  const hasName = isPrintableValue(sig.name);
  const hasTitle = isPrintableValue(sig.title);
  if (!hasName && !hasTitle) {
    if (sig.hideWhenEmpty === false) return sig;
    if (sig.includeSignatureLine) return sig;
    return null;
  }
  return {
    ...sig,
    name: hasName ? String(sig.name).trim() : undefined,
    title: hasTitle ? String(sig.title).trim() : undefined,
  };
}

export function normalizePrintableDocument(
  doc: PrintableDocument,
): PrintableDocument {
  const opts = doc.options;

  const headerFields = opts.omitEmptyFields
    ? doc.headerFields
        .map(normalizeField)
        .filter((f): f is PrintableField => f !== null)
    : doc.headerFields;

  const partySections = opts.omitEmptySections
    ? doc.partySections
        .map(normalizeSection)
        .filter((s): s is PrintableSection => s !== null)
    : doc.partySections;

  const sections = opts.omitEmptySections
    ? doc.sections
        .map(normalizeSection)
        .filter((s): s is PrintableSection => s !== null)
    : doc.sections;

  const tables = doc.tables
    .map((t) => {
      const copy: PrintableTable = {
        ...t,
        hideWhenEmpty:
          t.hideWhenEmpty ?? (opts.omitEmptyTables ? true : false),
      };
      if (!opts.omitEmptyTableColumns) {
        return copy;
      }
      return normalizeTable(copy);
    })
    .filter((t): t is PrintableTable => t !== null);

  const notes = opts.showNotes
    ? doc.notes
        .map(normalizeSection)
        .filter((s): s is PrintableSection => s !== null)
    : [];

  const signatories = opts.showSignatories
    ? doc.signatories
        .map(normalizeSignatory)
        .filter((s): s is PrintableSignatory => s !== null)
    : [];

  const footerFields = opts.omitEmptyFields
    ? doc.footerFields
        .map(normalizeField)
        .filter((f): f is PrintableField => f !== null)
    : doc.footerFields;

  const bank =
    opts.showBankDetails && doc.bank && (doc.bank.bankName ||
      doc.bank.accountName ||
      doc.bank.accountNumber ||
      doc.bank.swift)
      ? doc.bank
      : undefined;

  const contactFooter = opts.showContactFooter ? doc.contactFooter : undefined;

  return {
    ...doc,
    headerFields,
    partySections,
    sections,
    tables,
    notes,
    signatories,
    footerFields,
    bank,
    contactFooter,
  };
}
