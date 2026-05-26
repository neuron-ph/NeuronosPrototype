import { describe, expect, it } from "vitest";
import {
  CATALOG_ITEM_SELECT_FIELDS,
  filterCatalogItemsByCategory,
  findCatalogItemDuplicate,
  normalizeCatalogItemName,
  type CatalogItem,
} from "./CatalogItemCombobox";
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

  it("detects redundant item names only inside the same catalog category", () => {
    const items: CatalogItem[] = [
      { id: "ci-origin-thc", name: "THC", category_id: "cat-origin" },
      { id: "ci-destination-thc", name: "THC", category_id: "cat-destination" },
      { id: "ci-uncategorized", name: "Warehouse Fee", category_id: null },
    ];

    expect(normalizeCatalogItemName("  Warehouse   Fee  ")).toBe("warehouse fee");
    expect(findCatalogItemDuplicate(items, " thc ", "cat-origin")?.id).toBe("ci-origin-thc");
    expect(findCatalogItemDuplicate(items, "THC", "cat-brokerage")).toBeNull();
    expect(findCatalogItemDuplicate(items, "warehouse fee", null)?.id).toBe("ci-uncategorized");
    expect(findCatalogItemDuplicate(items, "warehouse fee", null, "ci-uncategorized")).toBeNull();
  });
});
