import React from "react";
import type { Project, QuotationNew } from "../../../types/pricing";
import type { QuotationPrintOptions } from "./screen/useQuotationDocumentState";
import { resolveQuotationPrintableDocument } from "../../../utils/documents/quotationDocumentResolver";
import { PrintableDocumentHtml } from "../../documents/PrintableDocumentHtml";
import { useCompanySettings } from "../../../hooks/useCompanySettings";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

interface QuotationDocumentProps {
  project: Project;
  quotation?: QuotationNew;
  mode?: "print" | "preview";
  currentUser?: { name: string; email: string } | null;
  options?: QuotationPrintOptions;
}

// Compatibility wrapper. The renderer now reads from the normalized
// PrintableDocument model produced by `resolveQuotationPrintableDocument`,
// so business rules live in one place (the resolver) and HTML preview +
// react-pdf blob stay in lockstep.
export const QuotationDocument = React.forwardRef<HTMLDivElement, QuotationDocumentProps>(
  ({ project, quotation: quotationProp, mode = "print", currentUser, options }, ref) => {
    const { settings: companySettings } = useCompanySettings();
    const resolvedQuotation: QuotationNew =
      quotationProp ?? ((project as any).quotation as QuotationNew) ?? ((project as any) as QuotationNew);

    const doc = resolveQuotationPrintableDocument({
      quotation: resolvedQuotation,
      project,
      options,
      companySettings,
      currentUser,
      fallbackLogo: logoImage as unknown as string,
    });

    return <PrintableDocumentHtml ref={ref} document={doc} mode={mode} />;
  },
);

QuotationDocument.displayName = "QuotationDocument";
