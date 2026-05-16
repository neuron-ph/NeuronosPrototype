// Thin compatibility wrapper. Resolves the QuotationNew into the normalized
// PrintableDocument model then delegates rendering to PrintableDocumentPdf so
// preview HTML and downloaded PDF stay in lockstep.

import { pdf } from "@react-pdf/renderer";
import type { QuotationNew } from "../../types/pricing";
import type { QuotationPrintOptions } from "../projects/quotation/screen/useQuotationDocumentState";
import type { CompanySettings } from "../../hooks/useCompanySettings";
import { resolveQuotationPrintableDocument } from "../../utils/documents/quotationDocumentResolver";
import { PrintableDocumentPdf } from "../documents/PrintableDocumentPdf";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

interface QuotationPDFDocumentProps {
  quotation: QuotationNew;
  options: QuotationPrintOptions;
  companySettings: CompanySettings;
}

export function QuotationPDFDocument({ quotation, options, companySettings }: QuotationPDFDocumentProps) {
  const doc = resolveQuotationPrintableDocument({
    quotation,
    options,
    companySettings,
    fallbackLogo: logoImage as unknown as string,
  });
  return <PrintableDocumentPdf document={doc} />;
}

export async function downloadQuotationPDF(
  quotation: QuotationNew,
  options: QuotationPrintOptions,
  companySettings: CompanySettings,
): Promise<void> {
  const doc = (
    <QuotationPDFDocument
      quotation={quotation}
      options={options}
      companySettings={companySettings}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Quotation-${quotation.quote_number || (quotation as any).quotation_number || "untitled"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
