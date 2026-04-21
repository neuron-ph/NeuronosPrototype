import type { Contact, Customer } from "../types/bd";
import type { QuotationNew } from "../types/pricing";

export function shouldPreserveInquiryBuilder(view: string, subView: string): boolean {
  return view === "inquiries" && subView === "builder";
}

export function buildCreateInquiryDraft(
  customer: Customer,
  contact?: Contact | null,
): Partial<QuotationNew> {
  const customerName = customer.company_name || customer.name || "";
  const contactName =
    contact?.name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
    "";

  return {
    customer_id: customer.id,
    customer_name: customerName,
    customer_company: customerName,
    contact_id: contact?.id,
    contact_person_id: contact?.id,
    contact_person_name: contactName || undefined,
    status: "Draft",
  };
}
