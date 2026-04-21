import { describe, expect, it, vi } from "vitest";
import type { QuotationChargeCategory } from "../../types/pricing";
import { fetchVendorChargeCategories, saveVendorChargeCategories } from "./vendorRateCards";

function makeCategory(id = "origin"): QuotationChargeCategory {
  return {
    id,
    category_name: "Origin Charges",
    subtotal: 100,
    line_items: [],
  };
}

describe("vendor rate card storage", () => {
  it("loads charge categories from the unified service provider record", async () => {
    const eq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { charge_categories: [makeCategory()] },
        error: null,
      }),
    });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const categories = await fetchVendorChargeCategories({ from }, "np-001");

    expect(from).toHaveBeenCalledWith("service_providers");
    expect(select).toHaveBeenCalledWith("charge_categories");
    expect(eq).toHaveBeenCalledWith("id", "np-001");
    expect(categories).toEqual([makeCategory()]);
  });

  it("saves charge categories back onto service_providers without touching legacy vendor tables", async () => {
    const select = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "np-001" },
        error: null,
      }),
    });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    const categories = [makeCategory("freight")];

    await saveVendorChargeCategories({ from }, {
      vendorId: "np-001",
      vendorName: "THETIS LOGISTICS CO., LTD",
      vendorType: "International Partners",
      categories,
    });

    expect(from).toHaveBeenCalledWith("service_providers");
    expect(upsert).toHaveBeenCalledWith(
      {
        id: "np-001",
        company_name: "THETIS LOGISTICS CO., LTD",
        provider_type: "international",
        charge_categories: categories,
      },
      { onConflict: "id" },
    );
  });
});
