import { describe, expect, it } from "vitest";
import { buildCreateInquiryDraft, shouldPreserveInquiryBuilder } from "./createInquiryFlow";
import type { Contact, Customer } from "../types/bd";

const customer: Customer = {
  id: "cust-001",
  name: "Pepsi Cola Product Philippines Inc",
  company_name: "Pepsi Cola Product Philippines Inc",
  industry: "Food & Beverage",
  status: "Active",
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
};

const contact: Contact = {
  id: "contact-001",
  name: "Aran Bondocoy",
  first_name: "Aran",
  last_name: "Bondocoy",
  title: "Importation Services",
  email: "aran.bondocoy@pcppi.com.ph",
  phone: "09563159829",
  customer_id: customer.id,
  notes: null,
  created_by: null,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-20T00:00:00.000Z",
};

describe("create inquiry flow", () => {
  it("preserves the builder when contact detail switches into inquiries", () => {
    expect(shouldPreserveInquiryBuilder("inquiries", "builder")).toBe(true);
    expect(shouldPreserveInquiryBuilder("inquiries", "list")).toBe(false);
    expect(shouldPreserveInquiryBuilder("contacts", "builder")).toBe(false);
  });

  it("builds a customer and contact-prefilled inquiry draft", () => {
    expect(buildCreateInquiryDraft(customer, contact)).toMatchObject({
      customer_id: "cust-001",
      customer_name: "Pepsi Cola Product Philippines Inc",
      customer_company: "Pepsi Cola Product Philippines Inc",
      contact_id: "contact-001",
      contact_person_id: "contact-001",
      contact_person_name: "Aran Bondocoy",
      status: "Draft",
    });
  });
});
