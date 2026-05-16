import { describe, expect, it } from "vitest";
import { DEFAULT_COMPANY_SETTINGS, normalizeCompanySettings } from "./useCompanySettings";

describe("normalizeCompanySettings", () => {
  it("fills blank Supabase fields from document defaults", () => {
    const settings = normalizeCompanySettings({
      id: "default",
      company_name: "",
      address_line1: null,
      address_line2: "   ",
      city: null,
      country: "",
      phone_numbers: [],
      email: null,
      bank_name: "",
      bank_account_name: null,
      bank_account_number: "",
      logo_url: null,
      updated_at: "",
    });

    expect(settings.company_name).toBe("Neuron Logistics Inc.");
    expect(settings.address_line1).toBe(DEFAULT_COMPANY_SETTINGS.address_line1);
    expect(settings.phone_numbers).toEqual(DEFAULT_COMPANY_SETTINGS.phone_numbers);
    expect(settings.email).toBe(DEFAULT_COMPANY_SETTINGS.email);
    expect(settings.bank_account_name).toBe("Neuron Logistics Inc.");
  });

  it("preserves explicitly configured non-empty values", () => {
    const settings = normalizeCompanySettings({
      company_name: "Custom Logistics",
      phone_numbers: [" +1 555 0100 ", ""],
      email: "ops@example.com",
    });

    expect(settings.company_name).toBe("Custom Logistics");
    expect(settings.phone_numbers).toEqual(["+1 555 0100"]);
    expect(settings.email).toBe("ops@example.com");
  });
});
