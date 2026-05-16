// Convert an Invoice into a normalized PrintableDocument.

import type { Invoice } from "../../types/accounting";
import type { Project } from "../../types/pricing";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "../../hooks/useCompanySettings";
import type { InvoicePrintOptions } from "../../components/projects/invoices/InvoiceDocument";
import {
  DEFAULT_PRINTABLE_OPTIONS,
  type PrintableCompanyBlock,
  type PrintableContactFooter,
  type PrintableDocument,
  type PrintableField,
  type PrintableSection,
  type PrintableSignatory,
  type PrintableTable,
  type PrintableTableColumn,
  type PrintableTableRow,
  type PrintableTotalRow,
  type PrintableTotals,
} from "./printableDocument";
import { isPrintableValue, normalizePrintableDocument } from "./printableDocumentNormalize";
import {
  resolveInvoiceDocumentSettings,
  type DocumentSettings,
} from "./documentSettings";
import { joinNonEmpty } from "./printableDocumentFormat";
import { normalizeCurrency, FUNCTIONAL_CURRENCY } from "../accountingCurrency";

const DEFAULT_CONTACT_FOOTER: PrintableContactFooter = {
  callNumbers: DEFAULT_COMPANY_SETTINGS.phone_numbers,
  emails: DEFAULT_COMPANY_SETTINGS.email ? [DEFAULT_COMPANY_SETTINGS.email] : [],
  addressLines: [
    DEFAULT_COMPANY_SETTINGS.address_line1,
    DEFAULT_COMPANY_SETTINGS.address_line2,
    joinNonEmpty([DEFAULT_COMPANY_SETTINGS.city, DEFAULT_COMPANY_SETTINGS.country], ", "),
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0),
};

// ─── Metadata extraction helpers ────────────────────────────────────────────

export function getInvoiceMetadata(invoice: Invoice): Record<string, any> {
  const m = (invoice as any).metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) return m as Record<string, any>;
  return {};
}

export function getInvoiceZoneA(invoice: Invoice): Record<string, any> {
  const metadata = getInvoiceMetadata(invoice);
  const zone = metadata.zone_a;
  return zone && typeof zone === "object" ? (zone as Record<string, any>) : {};
}

export function getInvoiceLineItems(invoice: Invoice): any[] {
  if (Array.isArray(invoice.line_items) && invoice.line_items.length > 0) {
    return invoice.line_items;
  }
  const metadata = getInvoiceMetadata(invoice);
  if (Array.isArray(metadata.line_items) && metadata.line_items.length > 0) {
    return metadata.line_items;
  }
  return [];
}

// ─── Company / contact ──────────────────────────────────────────────────────

function resolveCompanyBlock(cs?: CompanySettings, fallbackLogo?: string): PrintableCompanyBlock | undefined {
  if (!cs) return undefined;
  const addressLines = [cs.address_line1, cs.address_line2, joinNonEmpty([cs.city, cs.country], ", ")]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return {
    name: cs.company_name || undefined,
    addressLines,
    phoneNumbers: Array.isArray(cs.phone_numbers) ? cs.phone_numbers.filter((p) => p && p.trim()) : [],
    email: cs.email || undefined,
    logoUrl: cs.logo_url || undefined,
    fallbackLogo,
  };
}

function resolveContactFooter(
  cs?: CompanySettings,
  override?: { callNumbers?: string[]; email?: string; officeAddress?: string },
): PrintableContactFooter | undefined {
  if (override) {
    const callNumbers = Array.isArray(override.callNumbers)
      ? override.callNumbers.map((p) => p?.trim()).filter((p): p is string => Boolean(p && p.length > 0))
      : [];
    const emails = override.email && override.email.trim().length > 0 ? [override.email.trim()] : [];
    const addressLines = typeof override.officeAddress === "string"
      ? override.officeAddress.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];
    if (callNumbers.length > 0 || emails.length > 0 || addressLines.length > 0) {
      return { callNumbers, emails, addressLines };
    }
  }
  if (!cs) return DEFAULT_CONTACT_FOOTER;
  const callNumbers = Array.isArray(cs.phone_numbers) ? cs.phone_numbers.filter((p) => p && p.trim()) : [];
  const emails = cs.email ? [cs.email] : [];
  const addressLines = [cs.address_line1, cs.address_line2, joinNonEmpty([cs.city, cs.country], ", ")]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (callNumbers.length === 0 && emails.length === 0 && addressLines.length === 0) return DEFAULT_CONTACT_FOOTER;
  return { callNumbers, emails, addressLines };
}

// ─── Line item table ────────────────────────────────────────────────────────

function buildInvoiceTable(
  lineItems: any[],
  currency: string,
  options: { showTax: boolean; omitEmpty: boolean },
): PrintableTable {
  const columns: PrintableTableColumn[] = [
    { id: "description", label: "Description", widthHint: "40%" },
    { id: "remarks", label: "Remarks", widthHint: "14%", hideWhenEmpty: true },
    { id: "quantity", label: "Qty", align: "center", widthHint: "6%", hideWhenEmpty: true },
    { id: "unit", label: "Unit", align: "center", widthHint: "8%", hideWhenEmpty: true },
    { id: "rate", label: "Rate", align: "right", format: "money", widthHint: "12%" },
    { id: "tax_type", label: "Tax", align: "center", widthHint: "8%", hideWhenEmpty: true },
    { id: "amount", label: "Amount", align: "right", format: "money", widthHint: "12%" },
  ];

  // Single-currency check: if ALL line items use the invoice currency, hide
  // original-currency annotation entirely.
  const allSameCurrency = lineItems.every((i) => {
    const oc = i.original_currency;
    return !oc || oc === currency;
  });

  const rows: PrintableTableRow[] = lineItems.map((item, idx) => {
    const description = String(item.description ?? "");
    let descCell = description;
    if (!allSameCurrency && item.original_currency && item.original_currency !== currency) {
      const rate = item.exchange_rate ?? 1;
      const origAmt = Number(item.original_amount ?? 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
      });
      descCell = `${description} (Converted from ${item.original_currency} ${origAmt} @ ${rate})`;
    }
    return {
      id: item.id || `inv-line-${idx}`,
      cells: {
        description: descCell,
        remarks: item.remarks ?? "",
        quantity: item.quantity ?? "",
        unit: item.unit ?? "",
        rate: Number(item.unit_price ?? item.rate ?? 0),
        tax_type: options.showTax && item.tax_type ? String(item.tax_type) : "",
        amount: Number(item.amount ?? 0),
      },
    };
  });

  return {
    id: "invoice-lines",
    columns,
    rows,
    hideWhenEmpty: options.omitEmpty,
    emptyMessage: "No items on this invoice.",
  };
}

function buildTotals(invoice: Invoice, lineItems: any[], showTax: boolean): PrintableTotals {
  const currency = invoice.currency || "PHP";
  const subtotal = Number((invoice as any).subtotal ?? lineItems.reduce((s, i) => s + Number(i.amount ?? 0), 0));
  const taxAmount = Number((invoice as any).tax_amount ?? 0);
  const totalDue = Number(invoice.total_amount ?? invoice.amount ?? subtotal + taxAmount);

  const rows: PrintableTotalRow[] = [];
  rows.push({
    id: "subtotal",
    label: "Subtotal",
    value: subtotal,
    currency,
    format: "money",
  });
  if (showTax && taxAmount > 0) {
    rows.push({
      id: "vat",
      label: "VAT (12%)",
      value: taxAmount,
      currency,
      format: "money",
    });
  }

  // PHP-base equivalent for foreign-currency invoices
  const exchangeRate = Number((invoice as any).exchange_rate ?? 0);
  if (currency !== "PHP" && exchangeRate > 0) {
    rows.push({
      id: "fx_rate",
      label: `FX Rate (${currency} → PHP)`,
      value: exchangeRate,
      format: "number",
    });
    const baseAmount = Number((invoice as any).base_amount ?? totalDue * exchangeRate);
    rows.push({
      id: "php_equivalent",
      label: "PHP Equivalent",
      value: baseAmount,
      currency: "PHP",
      format: "money",
    });
  }

  return {
    rows,
    grandTotal: {
      id: "total_due",
      label: "TOTAL DUE",
      value: totalDue,
      currency,
      format: "money",
      emphasis: "grand",
    },
  };
}

// ─── Public resolver ────────────────────────────────────────────────────────

export interface ResolveInvoiceArgs {
  invoice: Invoice;
  project?: Project;
  options?: InvoicePrintOptions | DocumentSettings;
  companySettings?: CompanySettings;
  fallbackLogo?: string;
}

export function resolveInvoicePrintableDocument(args: ResolveInvoiceArgs): PrintableDocument {
  const { invoice, project, companySettings, fallbackLogo } = args;
  const settings = resolveInvoiceDocumentSettings(args.options);
  const zoneA = getInvoiceZoneA(invoice);
  const lineItems = getInvoiceLineItems(invoice);
  const currency = normalizeCurrency(invoice.currency, FUNCTIONAL_CURRENCY);
  const metadata = getInvoiceMetadata(invoice);

  const title = "SALES INVOICE";

  // Header
  const headerFields: PrintableField[] = [
    {
      id: "invoice_no",
      label: "Invoice No.",
      value: invoice.invoice_number,
      importance: "primary",
    },
    { id: "invoice_date", label: "Invoice Date", value: invoice.invoice_date, format: "date" },
    { id: "due_date", label: "Due Date", value: invoice.due_date, format: "date" },
    {
      id: "terms",
      label: "Terms",
      value: invoice.credit_terms || zoneA.credit_terms || (metadata as any).payment_terms,
    },
    {
      id: "project_no",
      label: "Project No.",
      value: project?.project_number || (invoice as any).project_number,
    },
  ];

  // Bill To
  const customerAddress =
    invoice.customer_address ||
    metadata.customer_address ||
    undefined;
  const partySections: PrintableSection[] = [
    {
      id: "bill_to",
      title: "Bill To",
      layout: "two-column",
      fields: [
        {
          id: "customer_name",
          label: "Customer",
          value: invoice.customer_name,
          width: "wide",
        },
        {
          id: "address",
          label: "Address",
          value: customerAddress,
          width: "wide",
          format: "multiline",
        },
        { id: "tin", label: "TIN", value: invoice.customer_tin || zoneA.customer_tin },
      ],
    },
  ];

  // Commercial / shipment details
  const sections: PrintableSection[] = [];
  const shipmentSection: PrintableSection = {
    id: "shipment",
    title: "Shipment Details",
    layout: "grid",
    fields: [
      { id: "bl_number", label: "B/L No.", value: invoice.bl_number || zoneA.bl_number },
      { id: "consignee", label: "Consignee", value: invoice.consignee || zoneA.consignee, width: "wide" },
      {
        id: "commodity",
        label: "Commodity",
        value: invoice.commodity_description || zoneA.commodity_description,
        width: "wide",
      },
    ],
  };
  sections.push(shipmentSection);

  // Line items table
  const table = buildInvoiceTable(lineItems, currency, {
    showTax: settings.display.showTaxSummary,
    omitEmpty: DEFAULT_PRINTABLE_OPTIONS.omitEmptyTables,
  });

  // Totals
  const totals = buildTotals(invoice, lineItems, settings.display.showTaxSummary);

  // Notes
  const notesText = settings.customNotes || invoice.notes || "";
  const notes: PrintableSection[] = [];
  if (isPrintableValue(notesText)) {
    notes.push({
      id: "notes",
      title: "Notes",
      layout: "stack",
      fields: [{ id: "notes_text", label: "", value: notesText, format: "multiline" }],
    });
  }

  // Bank — sidebar override wins over company defaults
  const bankOverride = settings.bankOverride;
  const hasBankOverride = bankOverride && (bankOverride.bankName || bankOverride.accountName || bankOverride.accountNumber);
  const bank = hasBankOverride
    ? {
        bankName: bankOverride!.bankName?.trim() || undefined,
        accountName: bankOverride!.accountName?.trim() || undefined,
        accountNumber: bankOverride!.accountNumber?.trim() || undefined,
      }
    : companySettings && (companySettings.bank_name || companySettings.bank_account_number)
    ? {
        bankName: companySettings.bank_name || undefined,
        accountName: companySettings.bank_account_name || undefined,
        accountNumber: companySettings.bank_account_number || undefined,
      }
    : undefined;

  // Signatories
  const preparedByName = settings.signatories?.preparedBy?.name || (invoice as any).created_by_name;
  const preparedByTitle = settings.signatories?.preparedBy?.title;
  const approvedByName = settings.signatories?.approvedBy?.name;
  const approvedByTitle = settings.signatories?.approvedBy?.title;

  const signatories: PrintableSignatory[] = [
    {
      id: "prepared_by",
      label: "Prepared by",
      name: preparedByName,
      title: preparedByTitle,
      includeSignatureLine: true,
    },
    {
      id: "approved_by",
      label: "Approved by",
      name: approvedByName,
      title: approvedByTitle,
      includeSignatureLine: true,
    },
  ];

  const options = {
    ...DEFAULT_PRINTABLE_OPTIONS,
    showBankDetails: settings.display.showBankDetails,
    showTaxSummary: settings.display.showTaxSummary,
    showNotes: settings.display.showNotes,
    showLetterhead: settings.display.showLetterhead,
    showSignatories: settings.display.showSignatories,
    showContactFooter: settings.display.showContactFooter,
  };

  const pageFooterText =
    joinNonEmpty([invoice.invoice_number, invoice.invoice_date], " · ") || undefined;

  const doc: PrintableDocument = {
    kind: "sales_invoice",
    title,
    headerFields,
    company: resolveCompanyBlock(companySettings, fallbackLogo),
    partySections,
    sections,
    tables: [table],
    totals,
    notes,
    bank,
    signatories,
    contactFooter: resolveContactFooter(companySettings, settings.contactFooterOverride),
    footerFields: [],
    options,
    pageFooterText,
  };

  return normalizePrintableDocument(doc);
}
