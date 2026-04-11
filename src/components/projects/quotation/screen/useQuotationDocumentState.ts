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
  validity_override?: string;
  payment_terms: string;
  custom_notes: string;
  display: {
    show_bank_details: boolean;
    show_tax_summary: boolean;
  };
}

export function useQuotationDocumentState(project: Project, currentUser?: { name: string; email: string; } | null) {
  const quote = project.quotation || (project as any);

  const [options, setOptions] = useState<QuotationPrintOptions>({
    signatories: {
      prepared_by: {
        name: quote?.prepared_by || quote?.created_by || currentUser?.name || "System User",
        title: quote?.prepared_by_title || "Sales Representative"
      },
      approved_by: {
        name: quote?.approved_by || "Management",
        title: quote?.approved_by_title || "Authorized Signatory"
      }
    },
    addressed_to: {
      name: quote?.addressed_to_name || quote?.contact_name || quote?.contact_person_name || "",
      title: quote?.addressed_to_title || ""
    },
    validity_override: quote?.valid_until || quote?.expiry_date || "",
    payment_terms: quote?.payment_terms || "",
    custom_notes: quote?.custom_notes || quote?.notes || "",
    display: {
      show_bank_details: true,
      show_tax_summary: true,
    },
  });

  // Actions
  const updateSignatory = (type: "prepared_by" | "approved_by", field: "name" | "title", value: string) => {
    setOptions(prev => ({
      ...prev,
      signatories: {
        ...prev.signatories,
        [type]: {
          ...prev.signatories[type],
          [field]: value
        }
      }
    }));
  };

  const updateAddressedTo = (field: "name" | "title", value: string) => {
    setOptions(prev => ({
      ...prev,
      addressed_to: { ...prev.addressed_to, [field]: value }
    }));
  };

  const setValidityOverride = (date: string) => {
    setOptions(prev => ({ ...prev, validity_override: date }));
  };

  const setPaymentTerms = (terms: string) => {
    setOptions(prev => ({ ...prev, payment_terms: terms }));
  };

  const toggleDisplay = (key: keyof QuotationPrintOptions["display"]) => {
    setOptions(prev => ({
      ...prev,
      display: {
        ...prev.display,
        [key]: !prev.display[key]
      }
    }));
  };

  const setCustomNotes = (text: string) => {
    setOptions(prev => ({ ...prev, custom_notes: text }));
  };

  return {
    options,
    updateSignatory,
    updateAddressedTo,
    setValidityOverride,
    setPaymentTerms,
    toggleDisplay,
    setCustomNotes,
  };
}
