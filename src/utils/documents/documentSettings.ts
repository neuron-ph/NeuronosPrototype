// Normalized document settings shape consumed by resolvers.
//
// Resolvers can accept either a document-type-specific options object
// (e.g. QuotationPrintOptions, InvoicePrintOptions) or this normalized shape.
// Mappers below convert from the legacy shapes.

import type { QuotationPrintOptions } from "../../components/projects/quotation/screen/useQuotationDocumentState";
import type { InvoicePrintOptions } from "../../components/projects/invoices/InvoiceDocument";

export interface DocumentSignatoryInput {
  name?: string;
  title?: string;
}

export interface DocumentDisplayFlags {
  showBankDetails: boolean;
  showNotes: boolean;
  showTaxSummary: boolean;
  showLetterhead: boolean;
  showSignatories: boolean;
  showContactFooter: boolean;
}

export interface DocumentBankOverride {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface DocumentContactFooterOverride {
  callNumbers?: string[];
  email?: string;
  officeAddress?: string;
}

export interface DocumentSettings {
  signatories: {
    preparedBy?: DocumentSignatoryInput;
    approvedBy?: DocumentSignatoryInput;
    conforme?: DocumentSignatoryInput;
  };
  addressedTo?: DocumentSignatoryInput;
  validityOverride?: string;
  paymentTerms?: string;
  customNotes?: string;
  display: DocumentDisplayFlags;
  bankOverride?: DocumentBankOverride;
  contactFooterOverride?: DocumentContactFooterOverride;
}

export function defaultDocumentDisplay(): DocumentDisplayFlags {
  return {
    showBankDetails: true,
    showNotes: true,
    showTaxSummary: true,
    showLetterhead: true,
    showSignatories: true,
    showContactFooter: true,
  };
}

export function emptyDocumentSettings(): DocumentSettings {
  return {
    signatories: {},
    display: defaultDocumentDisplay(),
  };
}

// Type guard for the normalized shape so resolvers can accept either form.
export function isDocumentSettings(
  value: unknown,
): value is DocumentSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const display = v.display as Record<string, unknown> | undefined;
  return (
    "display" in v &&
    typeof display === "object" &&
    display !== null &&
    "signatories" in v &&
    (
      "showBankDetails" in display ||
      "showNotes" in display ||
      "showTaxSummary" in display ||
      "showLetterhead" in display ||
      "showSignatories" in display ||
      "showContactFooter" in display
    )
  );
}

export function fromQuotationPrintOptions(
  options: QuotationPrintOptions,
): DocumentSettings {
  return {
    signatories: {
      preparedBy: {
        name: options.signatories?.prepared_by?.name,
        title: options.signatories?.prepared_by?.title,
      },
      approvedBy: {
        name: options.signatories?.approved_by?.name,
        title: options.signatories?.approved_by?.title,
      },
      conforme: {
        name: options.addressed_to?.name,
        title: options.addressed_to?.title,
      },
    },
    addressedTo: {
      name: options.addressed_to?.name,
      title: options.addressed_to?.title,
    },
    validityOverride: options.validity_override || undefined,
    paymentTerms: options.payment_terms || undefined,
    customNotes: options.custom_notes || undefined,
    display: {
      showBankDetails: options.display?.show_bank_details ?? true,
      showNotes: options.display?.show_notes ?? true,
      showTaxSummary: options.display?.show_tax_summary ?? true,
      showLetterhead: options.display?.show_letterhead ?? true,
      showSignatories: options.display?.show_signatories ?? true,
      showContactFooter: options.display?.show_contact_footer ?? true,
    },
    bankOverride: options.bank_details
      ? {
          bankName: options.bank_details.bank_name,
          accountName: options.bank_details.account_name,
          accountNumber: options.bank_details.account_number,
        }
      : undefined,
    contactFooterOverride: options.contact_footer
      ? {
          callNumbers: options.contact_footer.call_numbers,
          email: options.contact_footer.email,
          officeAddress: options.contact_footer.office_address,
        }
      : undefined,
  };
}

export function fromInvoicePrintOptions(
  options: InvoicePrintOptions,
): DocumentSettings {
  return {
    signatories: {
      preparedBy: {
        name: options.signatories?.prepared_by?.name,
        title: options.signatories?.prepared_by?.title,
      },
      approvedBy: {
        name: options.signatories?.approved_by?.name,
        title: options.signatories?.approved_by?.title,
      },
    },
    customNotes: options.custom_notes,
    display: {
      showBankDetails: options.display?.show_bank_details ?? true,
      showNotes: options.display?.show_notes ?? true,
      showTaxSummary: options.display?.show_tax_summary ?? true,
      showLetterhead: options.display?.show_letterhead ?? true,
      showSignatories: true,
      showContactFooter: true,
    },
    bankOverride: options.bank_details
      ? {
          bankName: options.bank_details.bank_name,
          accountName: options.bank_details.account_name,
          accountNumber: options.bank_details.account_number,
        }
      : undefined,
    contactFooterOverride: options.contact_footer
      ? {
          callNumbers: options.contact_footer.call_numbers,
          email: options.contact_footer.email,
          officeAddress: options.contact_footer.office_address,
        }
      : undefined,
  };
}

export function resolveDocumentSettings(
  input: QuotationPrintOptions | DocumentSettings | undefined,
): DocumentSettings {
  if (!input) return emptyDocumentSettings();
  if (isDocumentSettings(input)) return input;
  return fromQuotationPrintOptions(input);
}

export function resolveInvoiceDocumentSettings(
  input: InvoicePrintOptions | DocumentSettings | undefined,
): DocumentSettings {
  if (!input) return emptyDocumentSettings();
  if (isDocumentSettings(input)) return input;
  return fromInvoicePrintOptions(input);
}
