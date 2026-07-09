/**
 * Contract-rate catalog id re-resolution.
 *
 * Contract rate matrices store a POINT-IN-TIME snapshot of each charge's
 * catalog_item_id. The catalog is mutable — items get re-created (new ids),
 * renamed, or removed over a contract's life — so those snapshotted ids drift
 * and go stale. When Apply-to-Billings inserts a billing row carrying a stale
 * id, the billing_line_items_catalog_item_id_fkey FK rejects the whole batch.
 *
 * Rather than trust the snapshot's id, we re-resolve it against the LIVE catalog
 * at Apply time using the reliable key — the charge NAME (+ category to break
 * ties). This is cause-agnostic: it heals ids that drifted for any reason and
 * keeps every billing row bound to a valid catalog item.
 *
 * Matching is EXACT (normalized), never fuzzy — a wrong match would bill the
 * wrong charge/GL account. Anything that doesn't cleanly resolve is returned in
 * `unresolved` so the caller can block the apply and tell the user what to fix,
 * instead of inserting a broken (or silently wrong) row.
 */

import { supabase } from "./supabase/client";
import { normalizeCatalogItemName } from "../components/shared/pricing/CatalogItemCombobox";

export interface UnresolvedCharge {
  description: string;
  category: string | null;
}

export interface CatalogResolutionResult<T> {
  /** Items with catalog_item_id re-pointed to the live catalog where needed. */
  items: T[];
  /** Charges whose catalog_item_id could not be validated or re-resolved. */
  unresolved: UnresolvedCharge[];
}

type ResolvableItem = {
  catalog_item_id?: string | null;
  catalog_category_id?: string | null;
  description?: string;
  quotation_category?: string | null;
};

/**
 * Re-point stale catalog_item_ids on generated billing items to the live catalog.
 *
 * - id still exists in the catalog        → kept as-is
 * - id stale/missing, name matches 1 item → re-pointed to that item
 * - id stale, name matches >1 item        → disambiguated by category; else unresolved
 * - name matches 0 items                  → unresolved (needs a catalog fix)
 */
export async function resolveContractCatalogIds<T extends ResolvableItem>(
  items: T[],
): Promise<CatalogResolutionResult<T>> {
  if (items.length === 0) return { items, unresolved: [] };

  const { data: catRows, error } = await supabase
    .from("catalog_items")
    .select("id, name, category_id");
  if (error) throw new Error(`Catalog lookup failed: ${error.message}`);

  const liveIds = new Set<string>((catRows ?? []).map((r) => r.id));

  // normalized name → candidate live items (with catalog category id for tie-breaking)
  const byName = new Map<string, { id: string; categoryId: string | null }[]>();
  for (const r of catRows ?? []) {
    const key = normalizeCatalogItemName(r.name ?? "");
    if (!key) continue;
    const bucket = byName.get(key) ?? [];
    bucket.push({ id: r.id, categoryId: (r.category_id ?? null) as string | null });
    byName.set(key, bucket);
  }

  const unresolved: UnresolvedCharge[] = [];

  const resolved = items.map((item) => {
    // Already bound to a live catalog item — nothing to do.
    if (item.catalog_item_id && liveIds.has(item.catalog_item_id)) return item;

    const nameKey = normalizeCatalogItemName(item.description ?? "");
    const candidates = nameKey ? byName.get(nameKey) ?? [] : [];

    let match: { id: string } | undefined;
    if (candidates.length === 1) {
      // Unique name in the catalog — safe regardless of category.
      match = candidates[0];
    } else if (candidates.length > 1 && item.catalog_category_id) {
      // Same name in several categories — disambiguate by the contract line's
      // catalog category id (precise; no fuzzy name/label matching).
      const inCategory = candidates.filter((c) => c.categoryId === item.catalog_category_id);
      if (inCategory.length === 1) match = inCategory[0];
    }

    if (match) return { ...item, catalog_item_id: match.id };

    unresolved.push({
      description: item.description ?? "",
      category: item.quotation_category ?? null,
    });
    return item;
  });

  return { items: resolved, unresolved };
}
