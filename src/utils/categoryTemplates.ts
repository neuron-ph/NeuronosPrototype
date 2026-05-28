import { supabase } from "./supabase/client";
import type {
  CategoryTemplate,
  TemplateItemEntry,
} from "../types/categoryTemplates";
import type {
  SellingPriceCategory,
  SellingPriceLineItem,
} from "../types/pricing";

// ── CRUD ──

export async function fetchTemplates(): Promise<CategoryTemplate[]> {
  const { data, error } = await supabase
    .from("category_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(
  template: Pick<CategoryTemplate, "name" | "description" | "category_name" | "catalog_category_id" | "items"> & {
    created_by?: string;
    created_by_name?: string;
  }
): Promise<CategoryTemplate> {
  const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from("category_templates")
    .insert({ id, ...template })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplate(
  id: string,
  updates: Partial<Pick<CategoryTemplate, "name" | "description" | "category_name" | "catalog_category_id" | "items" | "updated_by">>
): Promise<void> {
  const { error } = await supabase
    .from("category_templates")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from("category_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Conversion: Selling category → Template items ──

export function sellingCategoryToTemplateItems(
  category: SellingPriceCategory
): TemplateItemEntry[] {
  return category.line_items
    .filter((item) => item.catalog_item_id)
    .map((item) => ({
      catalog_item_id: item.catalog_item_id!,
      description: item.description,
    }));
}

// ── Conversion: Template → Selling category (with catalog resolution) ──

export async function resolveAndLoadTemplate(
  template: CategoryTemplate
): Promise<SellingPriceCategory> {
  const catalogIds = template.items.map((item) => item.catalog_item_id);

  const catalogMap = new Map<string, string>();
  if (catalogIds.length > 0) {
    const { data } = await supabase
      .from("catalog_items")
      .select("id, name")
      .in("id", catalogIds);
    if (data) {
      data.forEach((row: { id: string; name: string }) =>
        catalogMap.set(row.id, row.name)
      );
    }
  }

  const lineItems: SellingPriceLineItem[] = template.items.map((item) => ({
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: catalogMap.get(item.catalog_item_id) ?? item.description,
    catalog_item_id: item.catalog_item_id,
    price: 0,
    currency: "PHP",
    quantity: 1,
    forex_rate: 1,
    is_taxed: false,
    remarks: "",
    amount: 0,
    base_cost: 0,
    amount_added: 0,
    percentage_added: 0,
    final_price: 0,
  }));

  return {
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category_name: template.category_name,
    catalog_category_id: template.catalog_category_id,
    line_items: lineItems,
    subtotal: 0,
    is_expanded: true,
  };
}
