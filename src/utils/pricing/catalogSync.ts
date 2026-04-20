import type { QuotationChargeCategory } from "../../types/pricing";
import { supabase } from "../supabase/client";

export type CatalogSide = "revenue" | "expense" | "both";

export interface CatalogCategoryRef {
  id: string;
  name?: string;
  side?: CatalogSide;
}

export interface CatalogItemRef {
  id: string;
  name?: string;
  category_id?: string | null;
}

export interface CatalogSyncClient {
  findCategoryByName(name: string, side: CatalogSide): Promise<CatalogCategoryRef | null>;
  createCategory(input: { name: string; side: CatalogSide }): Promise<CatalogCategoryRef>;
  findItemByName(name: string, categoryId?: string): Promise<CatalogItemRef | null>;
  createItem(input: { name: string; category_id?: string | null }): Promise<CatalogItemRef>;
}

export interface CatalogSyncOptions {
  side: CatalogSide;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCategoryName(category: QuotationChargeCategory): string {
  return (category.category_name || category.name || "").trim();
}

function getItemName(description: string): string {
  return description.trim();
}

export function createSupabaseCatalogSyncClient(): CatalogSyncClient {
  return {
    async findCategoryByName(name, side) {
      let query = supabase
        .from("catalog_categories")
        .select("id, name, side")
        .ilike("name", name.trim());

      if (side !== "both") {
        query = query.in("side", [side, "both"]);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },

    async createCategory(input) {
      const { data, error } = await supabase
        .from("catalog_categories")
        .insert({
          id: makeId("cat"),
          name: input.name.trim(),
          side: input.side,
          sort_order: 100,
          is_default: false,
        })
        .select("id, name, side")
        .single();

      if (error) throw new Error(error.message);
      return data;
    },

    async findItemByName(name, categoryId) {
      let query = supabase
        .from("catalog_items")
        .select("id, name, category_id")
        .ilike("name", name.trim());

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },

    async createItem(input) {
      const { data, error } = await supabase
        .from("catalog_items")
        .insert({
          id: makeId("ci"),
          name: input.name.trim(),
          category_id: input.category_id ?? null,
        })
        .select("id, name, category_id")
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
  };
}

export async function syncChargeCategoriesToCatalog(
  categories: QuotationChargeCategory[],
  client: CatalogSyncClient,
  options: CatalogSyncOptions,
): Promise<QuotationChargeCategory[]> {
  const syncedCategories: QuotationChargeCategory[] = [];

  for (const category of categories) {
    const categoryName = getCategoryName(category);
    let catalogCategoryId = category.catalog_category_id;

    if (!catalogCategoryId && categoryName) {
      const existingCategory = await client.findCategoryByName(categoryName, options.side);
      const catalogCategory = existingCategory ?? await client.createCategory({
        name: categoryName,
        side: options.side,
      });
      catalogCategoryId = catalogCategory.id;
    }

    const lineItems = [];
    for (const item of category.line_items || []) {
      const itemName = getItemName(item.description);
      let catalogItemId = item.catalog_item_id;

      if (!catalogItemId && itemName) {
        const existingItem = await client.findItemByName(itemName, catalogCategoryId);
        const catalogItem = existingItem ?? await client.createItem({
          name: itemName,
          category_id: catalogCategoryId ?? null,
        });
        catalogItemId = catalogItem.id;
      }

      lineItems.push({
        ...item,
        catalog_item_id: catalogItemId,
      });
    }

    syncedCategories.push({
      ...category,
      catalog_category_id: catalogCategoryId,
      line_items: lineItems,
    });
  }

  return syncedCategories;
}
