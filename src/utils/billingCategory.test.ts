import { describe, expect, it } from "vitest";
import { getBillingDisplayCategory } from "./billingCategory";

describe("getBillingDisplayCategory", () => {
  it("uses category when quotation_category is missing", () => {
    expect(getBillingDisplayCategory({ category: "Billable Expenses" })).toBe("Billable Expenses");
  });

  it("prefers quotation_category for quotation-backed billings", () => {
    expect(
      getBillingDisplayCategory({
        quotation_category: "Brokerage Charges",
        category: "Billable Expenses",
      }),
    ).toBe("Brokerage Charges");
  });

  it("falls back to General for uncategorized billing rows", () => {
    expect(getBillingDisplayCategory({})).toBe("General");
  });
});
