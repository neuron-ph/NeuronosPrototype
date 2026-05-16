import { useState } from "react";
import type { Project } from "../../../../types/pricing";
import { Invoice } from "../../../../types/accounting";
import { InvoicePrintOptions, InvoiceBankDetails } from "../InvoiceDocument";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "../../../../hooks/useCompanySettings";

export interface Signatory {
  name: string;
  title: string;
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

export function useInvoiceDocumentState(
  project: Project,
  invoice: Invoice,
  currentUser?: { name: string; email: string; } | null,
  companySettings?: CompanySettings,
) {
  const cs = companySettings || DEFAULT_COMPANY_SETTINGS;
  const meta = (invoice as any).metadata && typeof (invoice as any).metadata === "object" ? (invoice as any).metadata : {};
  const overrideBank = meta?.bank_details_override;
  const overrideContact = meta?.contact_footer_override;

  // Initialize state with invoice defaults or intelligent fallbacks
  const [options, setOptions] = useState<InvoicePrintOptions>({
    signatories: {
      prepared_by: {
        name: invoice.created_by_name || currentUser?.name || "System User",
        title: "Authorized User"
      },
      approved_by: {
        name: "MANAGEMENT",
        title: "Authorized Signatory"
      }
    },
    display: {
      show_bank_details: true,
      show_notes: true,
      show_tax_summary: true
    },
    custom_notes: invoice.notes || "",
    bank_details: {
      bank_name: overrideBank?.bank_name ?? cs.bank_name ?? "",
      account_name: overrideBank?.account_name ?? cs.bank_account_name ?? "",
      account_number: overrideBank?.account_number ?? cs.bank_account_number ?? "",
    },
    contact_footer: {
      call_numbers: Array.isArray(overrideContact?.call_numbers)
        ? overrideContact.call_numbers
        : Array.isArray(cs.phone_numbers) ? cs.phone_numbers : [],
      email: overrideContact?.email ?? cs.email ?? "",
      office_address: overrideContact?.office_address ?? joinAddress(cs),
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

  const toggleDisplay = (key: keyof InvoicePrintOptions["display"]) => {
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

  const updateBankDetails = (field: keyof InvoiceBankDetails, value: string) => {
    setOptions(prev => ({
      ...prev,
      bank_details: {
        ...(prev.bank_details || { bank_name: "", account_name: "", account_number: "" }),
        [field]: value,
      },
    }));
  };

  const updateContactFooter = (field: "email" | "office_address", value: string) => {
    setOptions(prev => ({
      ...prev,
      contact_footer: {
        ...(prev.contact_footer || { call_numbers: [], email: "", office_address: "" }),
        [field]: value,
      },
    }));
  };

  const updateCallNumber = (index: number, value: string) => {
    setOptions(prev => {
      const base = prev.contact_footer || { call_numbers: [], email: "", office_address: "" };
      const next = [...base.call_numbers];
      next[index] = value;
      return { ...prev, contact_footer: { ...base, call_numbers: next } };
    });
  };

  const addCallNumber = () => {
    setOptions(prev => {
      const base = prev.contact_footer || { call_numbers: [], email: "", office_address: "" };
      return { ...prev, contact_footer: { ...base, call_numbers: [...base.call_numbers, ""] } };
    });
  };

  const removeCallNumber = (index: number) => {
    setOptions(prev => {
      const base = prev.contact_footer || { call_numbers: [], email: "", office_address: "" };
      return {
        ...prev,
        contact_footer: { ...base, call_numbers: base.call_numbers.filter((_, i) => i !== index) },
      };
    });
  };

  return {
    options,
    updateSignatory,
    toggleDisplay,
    setCustomNotes,
    updateBankDetails,
    updateContactFooter,
    updateCallNumber,
    addCallNumber,
    removeCallNumber,
  };
}
