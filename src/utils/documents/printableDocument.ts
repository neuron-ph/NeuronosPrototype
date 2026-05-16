// Normalized printable document model.
//
// Business records (quotations, invoices, future document types) are converted
// by resolvers into a PrintableDocument. Renderers (HTML preview and react-pdf
// blob) then consume the same normalized shape so the printed content is
// always identical across paths.
//
// Empty values/sections/columns are stripped by `printableDocumentNormalize.ts`
// before rendering.

export type PrintableDocumentKind =
  | "quotation"
  | "contract_quotation"
  | "sales_invoice"
  | "collection_receipt"
  | "evoucher";

export type PrintableValueObject = Record<string, unknown>;

export type PrintableValueAtom =
  | string
  | number
  | boolean
  | PrintableValueObject
  | null
  | undefined;

export type PrintableValue = PrintableValueAtom | PrintableValueAtom[];

export type PrintableFieldFormat =
  | "text"
  | "date"
  | "money"
  | "number"
  | "percent"
  | "multiline";

export interface PrintableField {
  id: string;
  label: string;
  value: PrintableValue;
  width?: "normal" | "wide" | "full";
  importance?: "primary" | "normal" | "muted";
  format?: PrintableFieldFormat;
  // Money-format hints (resolver fills these; renderer formats).
  currency?: string;
}

export interface PrintableSection {
  id: string;
  title?: string;
  fields: PrintableField[];
  layout?: "grid" | "stack" | "two-column";
  hideWhenEmpty?: boolean;
}

export interface PrintableTableColumn {
  id: string;
  label: string;
  align?: "left" | "center" | "right";
  format?: "text" | "money" | "number" | "percent";
  // Per-column hint: if set, render renders the row's currency from a cell key
  // (we keep this simple and let resolvers pre-format money cells when needed).
  hideWhenEmpty?: boolean;
  widthHint?: string; // e.g. "30%", "12%"
}

export interface PrintableTableRow {
  id: string;
  cells: Record<string, PrintableValue>;
  groupId?: string;
  emphasis?: "normal" | "subtotal" | "total";
}

export interface PrintableTableGroup {
  id: string;
  title: string;
  // Optional pre-computed subtotal row to render after the group's rows.
  subtotal?: PrintableTableRow;
}

export interface PrintableTable {
  id: string;
  title?: string;
  columns: PrintableTableColumn[];
  rows: PrintableTableRow[];
  groups?: PrintableTableGroup[];
  hideWhenEmpty?: boolean;
  // Optional empty-state message; only printed when hideWhenEmpty === false.
  emptyMessage?: string;
}

export interface PrintableTotalRow {
  id: string;
  label: string;
  value: number;
  currency?: string;
  emphasis?: "normal" | "grand";
  // For percent rows we accept a 0..1 ratio; renderer formats.
  format?: "money" | "percent" | "number";
}

export interface PrintableTotals {
  rows: PrintableTotalRow[];
  grandTotal?: PrintableTotalRow;
}

export interface PrintableSignatory {
  id: string;
  label: string; // e.g. "Prepared by"
  name?: string;
  title?: string;
  // If true the renderer should draw a signature line even when name is absent.
  includeSignatureLine?: boolean;
  hideWhenEmpty?: boolean;
}

export interface PrintableCompanyBlock {
  name?: string;
  addressLines: string[]; // already filtered/joined upstream
  phoneNumbers: string[];
  email?: string;
  logoUrl?: string;
  fallbackLogo?: string; // bundler asset import path
  tin?: string;
  website?: string;
}

export interface PrintableBankBlock {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  swift?: string;
  branch?: string;
}

export interface PrintableContactFooter {
  callNumbers: string[];
  emails: string[];
  addressLines: string[];
}

export interface PrintableDocumentOptions {
  showLetterhead: boolean;
  showBankDetails: boolean;
  showTaxSummary: boolean;
  showNotes: boolean;
  showSignatories: boolean;
  omitEmptyFields: boolean;
  omitEmptySections: boolean;
  omitEmptyTableColumns: boolean;
  // If true, customer-facing PDFs omit empty tables entirely. If false, the
  // table renders with `emptyMessage`.
  omitEmptyTables: boolean;
  showContactFooter: boolean;
}

export interface PrintableDocument {
  kind: PrintableDocumentKind;
  title: string;
  subtitle?: string;
  reference?: string;
  company?: PrintableCompanyBlock;
  headerFields: PrintableField[];
  partySections: PrintableSection[];
  sections: PrintableSection[];
  tables: PrintableTable[];
  totals?: PrintableTotals;
  notes: PrintableSection[];
  bank?: PrintableBankBlock;
  signatories: PrintableSignatory[];
  contactFooter?: PrintableContactFooter;
  footerFields: PrintableField[];
  options: PrintableDocumentOptions;
  // Free-form page-footer reference text (e.g., "Q-2025-001 · 2025-03-15").
  pageFooterText?: string;
}

export const DEFAULT_PRINTABLE_OPTIONS: PrintableDocumentOptions = {
  showLetterhead: true,
  showBankDetails: true,
  showTaxSummary: true,
  showNotes: true,
  showSignatories: true,
  omitEmptyFields: true,
  omitEmptySections: true,
  omitEmptyTableColumns: true,
  omitEmptyTables: true,
  showContactFooter: true,
};
