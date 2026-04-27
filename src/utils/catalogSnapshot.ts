import type { CatalogSnapshot } from "../types/catalogLineItems";

export function buildCatalogSnapshot(
  item: {
    description?: string;
    unit_type?: string | null;
    tax_code?: string | null;
    amount?: number;
    currency?: string;
  },
  categoryName: string | null
): CatalogSnapshot {
  return {
    name: item.description || "",
    unit_type: item.unit_type ?? null,
    tax_code: item.tax_code ?? null,
    category_name: categoryName,
    default_price: item.amount || 0,
    currency: item.currency || "PHP",
  };
}
