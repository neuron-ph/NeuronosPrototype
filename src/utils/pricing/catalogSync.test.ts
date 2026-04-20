import { describe, expect, it } from "vitest";
import type { QuotationChargeCategory } from "../../types/pricing";
import { syncChargeCategoriesToCatalog, type CatalogSyncClient } from "./catalogSync";

function makeClient(): CatalogSyncClient & {
  categories: Array<{ id: string; name: string; side: "revenue" | "expense" | "both" }>;
  items: Array<{ id: string; name: string; category_id: string | null }>;
} {
  const categories: Array<{ id: string; name: string; side: "revenue" | "expense" | "both" }> = [
    { id: "cat-origin", name: "Origin Charges", side: "revenue" },
  ];
  const items: Array<{ id: string; name: string; category_id: string | null }> = [
    { id: "ci-document-fee", name: "Document Fee", category_id: "cat-origin" },
  ];
  const client = {
    categories,
    items,
    async findCategoryByName(name: string) {
      return client.categories.find((category) => category.name.toLowerCase() === name.toLowerCase()) ?? null;
    },
    async createCategory(input: { name: string; side: "revenue" | "expense" | "both" }) {
      const category = {
        id: `cat-${input.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: input.name,
        side: input.side,
      };
      client.categories.push(category);
      return category;
    },
    async findItemByName(name: string, categoryId?: string) {
      return client.items.find((item) => {
        const sameName = item.name.toLowerCase() === name.toLowerCase();
        return sameName && (!categoryId || item.category_id === categoryId);
      }) ?? null;
    },
    async createItem(input: { name: string; category_id?: string | null }) {
      const item = {
        id: `ci-${input.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: input.name,
        category_id: input.category_id ?? null,
      };
      client.items.push(item);
      return item;
    },
  };

  return client;
}

describe("syncChargeCategoriesToCatalog", () => {
  it("links vendor categories and typed line items to catalog entries", async () => {
    const client = makeClient();
    const categories: QuotationChargeCategory[] = [
      {
        id: "local-origin",
        category_name: "Origin Charges",
        name: "Origin Charges",
        subtotal: 190,
        line_items: [
          {
            id: "line-existing",
            description: "Document Fee",
            price: 50,
            currency: "USD",
            quantity: 1,
            forex_rate: 1,
            is_taxed: false,
            remarks: "per shipment",
            amount: 50,
          },
          {
            id: "line-new",
            description: "THC (Terminal Handling Charge)",
            price: 140,
            currency: "USD",
            quantity: 1,
            forex_rate: 1,
            is_taxed: false,
            remarks: "per container",
            amount: 140,
          },
        ],
      },
    ];

    const synced = await syncChargeCategoriesToCatalog(categories, client, { side: "revenue" });

    expect(synced[0].catalog_category_id).toBe("cat-origin");
    expect(synced[0].line_items[0].catalog_item_id).toBe("ci-document-fee");
    expect(synced[0].line_items[1].catalog_item_id).toBe("ci-thc-(terminal-handling-charge)");
    expect(client.items).toContainEqual({
      id: "ci-thc-(terminal-handling-charge)",
      name: "THC (Terminal Handling Charge)",
      category_id: "cat-origin",
    });
  });

  it("creates custom vendor categories before creating their line items", async () => {
    const client = makeClient();
    const categories: QuotationChargeCategory[] = [
      {
        id: "local-customs",
        category_name: "Customs Support",
        subtotal: 75,
        line_items: [
          {
            id: "line-new",
            description: "PEZA Coordination",
            price: 75,
            currency: "USD",
            quantity: 1,
            forex_rate: 1,
            is_taxed: false,
            remarks: "",
            amount: 75,
          },
        ],
      },
    ];

    const synced = await syncChargeCategoriesToCatalog(categories, client, { side: "revenue" });

    expect(synced[0].catalog_category_id).toBe("cat-customs-support");
    expect(synced[0].line_items[0].catalog_item_id).toBe("ci-peza-coordination");
    expect(client.items.find((item) => item.id === "ci-peza-coordination")?.category_id).toBe("cat-customs-support");
  });
});
