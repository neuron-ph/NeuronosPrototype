// Thin compatibility wrapper around the shared document engine.

import { pdf } from "@react-pdf/renderer";
import type { Invoice } from "../../../types/accounting";
import type { InvoicePrintOptions } from "./InvoiceDocument";
import type { CompanySettings } from "../../../hooks/useCompanySettings";
import { resolveInvoicePrintableDocument } from "../../../utils/documents/invoiceDocumentResolver";
import { PrintableDocumentPdf } from "../../documents/PrintableDocumentPdf";
import { applyBrandedDesign } from "../../../utils/documentDesign";
import logoImage from "../../../assets/white.svg";

interface InvoicePDFDocumentProps {
  invoice: Invoice;
  options?: InvoicePrintOptions;
  companySettings?: CompanySettings;
}

export function InvoicePDFDocument({ invoice, options, companySettings }: InvoicePDFDocumentProps) {
  const doc = applyBrandedDesign(resolveInvoicePrintableDocument({
    invoice,
    options,
    companySettings,
    fallbackLogo: logoImage as unknown as string,
  }), "invoice");
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

// Print the invoice using the same PDF the download produces, via a hidden
// iframe. This is far more reliable than printing cloned HTML in a popup: it is
// never popup-blocked, the letterhead image is already embedded in the PDF, and
// the output is byte-identical to the downloaded file. Falls back to opening the
// PDF in a new tab if the iframe print is blocked.
export async function printInvoicePDF(
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

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 60_000);
  };

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow;
      if (!win) throw new Error("no iframe window");
      win.focus();
      win.print();
      cleanup();
    } catch {
      // Fallback: open the PDF in a new tab so the user can print manually.
      window.open(url, "_blank");
      cleanup();
    }
  };

  iframe.src = url;
  document.body.appendChild(iframe);
}
