import { useState } from "react";
import type { Project } from "../../../../types/pricing";

export interface Signatory {
  name: string;
  title: string;
}

export interface QuotationPrintOptions {
  signatories: {
    prepared_by: Signatory;
    approved_by: Signatory;
  };
  addressed_to: { name: string; title: string };
  validity_override: string;
  payment_terms: string;
  display: {
    show_bank_details: boolean;
    show_notes: boolean;
    show_tax_summary: boolean;
    show_letterhead: boolean;
  };
  custom_notes: string;
}

export function useQuotationDocumentState(project: Project, currentUser?: { name: string; email: string; } | null) {
  // Accept both a Project (with optional .quotation nested) and a bare QuotationNew cast as Project.
  const quote = (project as any).quotation || (project as any);

  // Backward-compat: old handlePDFSave stored these in details JSONB with a pdf_ prefix.
  // After the fetch merge (details spread to top-level) they surface as pdf_* properties.
  // New saves write to explicit columns without the prefix; check both paths.
  const legacy = quote as any;

  const initialOptions: QuotationPrintOptions = {
    signatories: {
      prepared_by: {
        // Never use created_by — it is a raw auth UUID, not a display name.
        name: quote?.prepared_by || legacy?.pdf_prepared_by || currentUser?.name || "System User",
        title: quote?.prepared_by_title || legacy?.pdf_prepared_by_title || "Sales Representative",
      },
      approved_by: {
        name: quote?.approved_by || legacy?.pdf_approved_by || "Management",
        title: quote?.approved_by_title || legacy?.pdf_approved_by_title || "Authorized Signatory",
      },
    },
    addressed_to: {
      name: quote?.addressed_to_name || legacy?.pdf_addressed_to_name || quote?.contact_person_name || "",
      title: quote?.addressed_to_title || legacy?.pdf_addressed_to_title || "",
    },
    validity_override: quote?.valid_until || quote?.expiry_date || "",
    payment_terms: quote?.payment_terms || legacy?.pdf_payment_terms || "",
    display: {
      show_bank_details: true,
      show_notes: true,
      show_tax_summary: true,
      show_letterhead: true,
    },
    custom_notes: quote?.custom_notes || legacy?.pdf_custom_notes || quote?.notes || "",
  };

  const [options, setOptions] = useState<QuotationPrintOptions>(initialOptions);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = () => setIsDirty(true);
  const markClean = () => setIsDirty(false);

  const updateSignatory = (type: "prepared_by" | "approved_by", field: "name" | "title", value: string) => {
    setOptions(prev => ({
      ...prev,
      signatories: {
        ...prev.signatories,
        [type]: { ...prev.signatories[type], [field]: value },
      },
    }));
    markDirty();
  };

  const updateAddressedTo = (field: "name" | "title", value: string) => {
    setOptions(prev => ({ ...prev, addressed_to: { ...prev.addressed_to, [field]: value } }));
    markDirty();
  };

  const setValidityOverride = (date: string) => {
    setOptions(prev => ({ ...prev, validity_override: date }));
    markDirty();
  };

  const setPaymentTerms = (terms: string) => {
    setOptions(prev => ({ ...prev, payment_terms: terms }));
    markDirty();
  };

  const toggleDisplay = (key: keyof QuotationPrintOptions["display"]) => {
    setOptions(prev => ({
      ...prev,
      display: { ...prev.display, [key]: !prev.display[key] },
    }));
    markDirty();
  };

  const setCustomNotes = (text: string) => {
    setOptions(prev => ({ ...prev, custom_notes: text }));
    markDirty();
  };

  return {
    options,
    isDirty,
    markClean,
    updateSignatory,
    updateAddressedTo,
    setValidityOverride,
    setPaymentTerms,
    toggleDisplay,
    setCustomNotes,
  };
}
