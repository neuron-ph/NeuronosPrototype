import { useState } from "react";
import type { Project } from "../../../../types/pricing";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "../../../../hooks/useCompanySettings";

export interface Signatory {
  name: string;
  title: string;
}

export interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
}

export interface ContactFooter {
  call_numbers: string[];
  email: string;
  office_address: string;
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
    show_signatories: boolean;
    show_contact_footer: boolean;
  };
  custom_notes: string;
  bank_details?: BankDetails;
  contact_footer?: ContactFooter;
}

function joinAddress(cs: Pick<CompanySettings, "address_line1" | "address_line2" | "city" | "country">): string {
  return [
    cs.address_line1,
    cs.address_line2,
    [cs.city, cs.country].filter(Boolean).join(", "),
  ]
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

export function useQuotationDocumentState(
  project: Project,
  currentUser?: { name: string; email: string; } | null,
  companySettings?: CompanySettings,
) {
  // Accept both a Project (with optional .quotation nested) and a bare QuotationNew cast as Project.
  const quote = (project as any).quotation || (project as any);

  // Backward-compat: old handlePDFSave stored these in details JSONB with a pdf_ prefix.
  // After the fetch merge (details spread to top-level) they surface as pdf_* properties.
  // New saves write to explicit columns without the prefix; check both paths.
  const legacy = quote as any;
  const legacyDetails = legacy?.details && typeof legacy.details === "object" ? legacy.details : {};

  const cs = companySettings || DEFAULT_COMPANY_SETTINGS;
  const overrideBank = legacyDetails?.bank_details_override;
  const overrideContact = legacyDetails?.contact_footer_override;

  const initialOptions: QuotationPrintOptions = {
    signatories: {
      prepared_by: {
        // Never use created_by — it is a raw auth UUID, not a display name.
        name: quote?.prepared_by || legacy?.pdf_prepared_by || legacyDetails?.pdf_prepared_by || currentUser?.name || "System User",
        title: quote?.prepared_by_title || legacy?.pdf_prepared_by_title || legacyDetails?.pdf_prepared_by_title || "Sales Representative",
      },
      approved_by: {
        name: quote?.approved_by || legacy?.pdf_approved_by || legacyDetails?.pdf_approved_by || "Management",
        title: quote?.approved_by_title || legacy?.pdf_approved_by_title || legacyDetails?.pdf_approved_by_title || "Authorized Signatory",
      },
    },
    addressed_to: {
      name: quote?.addressed_to_name || legacy?.pdf_addressed_to_name || legacyDetails?.pdf_addressed_to_name || quote?.contact_person_name || "",
      title: quote?.addressed_to_title || legacy?.pdf_addressed_to_title || legacyDetails?.pdf_addressed_to_title || "",
    },
    validity_override: quote?.valid_until || quote?.expiry_date || "",
    payment_terms: quote?.payment_terms || legacy?.pdf_payment_terms || legacyDetails?.pdf_payment_terms || "",
    display: {
      show_bank_details: legacy?.pdf_show_bank_details ?? legacyDetails?.pdf_show_bank_details ?? true,
      show_notes: legacy?.pdf_show_notes ?? legacyDetails?.pdf_show_notes ?? true,
      show_tax_summary: legacy?.pdf_show_tax_summary ?? legacyDetails?.pdf_show_tax_summary ?? true,
      show_letterhead: legacy?.pdf_show_letterhead ?? legacyDetails?.pdf_show_letterhead ?? true,
      show_signatories: legacy?.pdf_show_signatories ?? legacyDetails?.pdf_show_signatories ?? true,
      show_contact_footer: legacy?.pdf_show_contact_footer ?? legacyDetails?.pdf_show_contact_footer ?? true,
    },
    custom_notes: quote?.custom_notes || legacy?.pdf_custom_notes || legacyDetails?.pdf_custom_notes || quote?.notes || "",
    bank_details: {
      bank_name: overrideBank?.bank_name ?? cs.bank_name ?? "",
      account_name: overrideBank?.account_name ?? cs.bank_account_name ?? "",
      account_number: overrideBank?.account_number ?? cs.bank_account_number ?? "",
    },
    contact_footer: {
      call_numbers: Array.isArray(overrideContact?.call_numbers)
        ? overrideContact.call_numbers
        : Array.isArray(cs.phone_numbers)
          ? cs.phone_numbers
          : [],
      email: overrideContact?.email ?? cs.email ?? "",
      office_address: overrideContact?.office_address ?? joinAddress(cs),
    },
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

  const emptyBank: BankDetails = { bank_name: "", account_name: "", account_number: "" };
  const emptyContact: ContactFooter = { call_numbers: [], email: "", office_address: "" };

  const updateBankDetails = (field: keyof BankDetails, value: string) => {
    setOptions(prev => ({ ...prev, bank_details: { ...(prev.bank_details ?? emptyBank), [field]: value } }));
    markDirty();
  };

  const updateContactFooter = (field: "email" | "office_address", value: string) => {
    setOptions(prev => ({ ...prev, contact_footer: { ...(prev.contact_footer ?? emptyContact), [field]: value } }));
    markDirty();
  };

  const updateCallNumber = (index: number, value: string) => {
    setOptions(prev => {
      const base = prev.contact_footer ?? emptyContact;
      const next = [...base.call_numbers];
      next[index] = value;
      return { ...prev, contact_footer: { ...base, call_numbers: next } };
    });
    markDirty();
  };

  const addCallNumber = () => {
    setOptions(prev => {
      const base = prev.contact_footer ?? emptyContact;
      return { ...prev, contact_footer: { ...base, call_numbers: [...base.call_numbers, ""] } };
    });
    markDirty();
  };

  const removeCallNumber = (index: number) => {
    setOptions(prev => {
      const base = prev.contact_footer ?? emptyContact;
      return { ...prev, contact_footer: { ...base, call_numbers: base.call_numbers.filter((_, i) => i !== index) } };
    });
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
    updateBankDetails,
    updateContactFooter,
    updateCallNumber,
    addCallNumber,
    removeCallNumber,
  };
}
