// Thin compatibility wrapper around the shared document engine.

import { pdf } from "@react-pdf/renderer";
import type { Invoice } from "../../../types/accounting";
import type { InvoicePrintOptions } from "./InvoiceDocument";
import type { CompanySettings } from "../../../hooks/useCompanySettings";
import { resolveInvoicePrintableDocument } from "../../../utils/documents/invoiceDocumentResolver";
import { PrintableDocumentPdf } from "../../documents/PrintableDocumentPdf";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

interface InvoicePDFDocumentProps {
  invoice: Invoice;
  options?: InvoicePrintOptions;
  companySettings?: CompanySettings;
}

export function InvoicePDFDocument({ invoice, options, companySettings }: InvoicePDFDocumentProps) {
  const doc = resolveInvoicePrintableDocument({
    invoice,
    options,
    companySettings,
    fallbackLogo: logoImage as unknown as string,
  });
  return <PrintableDocumentPdf document={doc} />;
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  options?: InvoicePrintOptions,
  companySettings?: CompanySettings,
): Promise<void> {
  const doc = (
    <InvoicePDFDocument
      invoice={invoice}
      options={options}
      companySettings={companySettings}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Invoice-${invoice.invoice_number || "draft"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
