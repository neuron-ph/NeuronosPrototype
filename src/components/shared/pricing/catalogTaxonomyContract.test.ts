import { describe, expect, it } from "vitest";
import { CATALOG_ITEM_SELECT_FIELDS, filterCatalogItemsByCategory, type CatalogItem } from "./CatalogItemCombobox";
import { buildCatalogSelectionPatch } from "./UniversalPricingRow";

describe("catalog taxonomy contract", () => {
  it("limits catalog item reads to taxonomy columns", () => {
    const selectedFields = CATALOG_ITEM_SELECT_FIELDS.split(",").map((field) => field.trim());

    expect(selectedFields).toEqual([
      "id",
      "name",
      "category_id",
      "created_at",
      "updated_at",
    ]);
    expect(selectedFields).not.toContain("currency");
    expect(selectedFields).not.toContain("default_price");
  });

  it("keeps catalog selection patches scoped to description and catalog linkage", () => {
    expect(buildCatalogSelectionPatch("Processing Fee", "ci-processing-fee")).toEqual({
      description: "Processing Fee",
      catalog_item_id: "ci-processing-fee",
    });

    const clearedPatch = buildCatalogSelectionPatch("Processing Fee");
    expect(clearedPatch.catalog_item_id).toBeNull();
    expect(Object.keys(clearedPatch)).not.toContain("currency");
    expect(Object.keys(clearedPatch)).not.toContain("base_cost");
    expect(Object.keys(clearedPatch)).not.toContain("final_price");
  });

  it("scopes charge options to the active catalog category", () => {
    const items: CatalogItem[] = [
      { id: "ci-brokerage", name: "Processing Fee", category_id: "cat-brokerage" },
      { id: "ci-freight", name: "Ocean Freight", category_id: "cat-freight" },
      { id: "ci-empty", name: "Uncategorized", category_id: null },
    ];

    expect(filterCatalogItemsByCategory(items, "cat-brokerage")).toEqual([
      { id: "ci-brokerage", name: "Processing Fee", category_id: "cat-brokerage" },
    ]);
    expect(filterCatalogItemsByCategory(items)).toEqual(items);
  });
});
