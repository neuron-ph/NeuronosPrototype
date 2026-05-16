import React from "react";
import type { Project } from "../../../types/pricing";
import type { Invoice } from "../../../types/accounting";
import { resolveInvoicePrintableDocument } from "../../../utils/documents/invoiceDocumentResolver";
import { PrintableDocumentHtml } from "../../documents/PrintableDocumentHtml";
import { useCompanySettings } from "../../../hooks/useCompanySettings";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

export interface InvoiceBankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
}

export interface InvoiceContactFooter {
  call_numbers: string[];
  email: string;
  office_address: string;
}

export interface InvoicePrintOptions {
  signatories: {
    prepared_by: { name: string; title: string };
    approved_by: { name: string; title: string };
  };
  display: {
    show_bank_details: boolean;
    show_notes: boolean;
    show_tax_summary: boolean;
    show_letterhead?: boolean;
  };
  custom_notes?: string;
  bank_details?: InvoiceBankDetails;
  contact_footer?: InvoiceContactFooter;
}

interface InvoiceDocumentProps {
  project: Project;
  invoice: Invoice;
  mode?: "print" | "preview";
  options?: InvoicePrintOptions;
}

// Compatibility wrapper around the normalized document engine. Both the
// browser preview and the @react-pdf-generated blob now consume the same
// PrintableDocument produced by `resolveInvoicePrintableDocument`.
export const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(
  ({ project, invoice, mode = "print", options }, ref) => {
    const { settings: companySettings } = useCompanySettings();
    const doc = resolveInvoicePrintableDocument({
      invoice,
      project,
      options,
      companySettings,
      fallbackLogo: logoImage as unknown as string,
    });
    return <PrintableDocumentHtml ref={ref} document={doc} mode={mode} />;
  },
);

InvoiceDocument.displayName = "InvoiceDocument";
