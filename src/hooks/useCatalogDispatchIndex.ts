/**
 * useCatalogDispatchIndex
 *
 * Fetches CatalogDispatchHint for every catalog item referenced by the given
 * rate matrices. Returns a Map keyed by catalog_item_id that the contract
 * billing engine consumes via `BillingDispatchContext.catalogIndex` to route
 * per-row dispatch (Phase B of the catalog-first refactor).
 *
 * Items whose `dispatch_kind` is null are omitted from the map — the engine
 * interprets absence as "no catalog hint, fall back through legacy precedence
 * chain" (row.applies_when → category.kind → 'standard').
 *
 * For async (non-React) call paths, use `buildCatalogDispatchIndex` directly.
 *
 * @see migration 106_catalog_dispatch_metadata.sql
 * @see /docs/blueprints/CATALOG_FIRST_BILLING_BLUEPRINT.md
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import type { ContractRateMatrix } from '../types/pricing';
import type { CatalogDispatchHint } from '../utils/contractRateEngine';

/**
 * Pure async fetcher. Use in event handlers / non-React contexts.
 */
export async function buildCatalogDispatchIndex(
  matrices: ContractRateMatrix[]
): Promise<Map<string, CatalogDispatchHint>> {
  const ids = collectCatalogIds(matrices);
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, dispatch_kind, trigger_field, trigger_value')
    .in('id', ids);

  if (error || !data) return new Map();
  return rowsToIndex(data);
}

/**
 * React hook variant. Memoised on the set of referenced catalog_item_ids,
 * cached by react-query for 5 minutes (dispatch metadata changes are rare
 * and Phase A's editor invalidates the query key on save).
 */
export function useCatalogDispatchIndex(
  matrices: ContractRateMatrix[]
): Map<string, CatalogDispatchHint> {
  // Stable key derived from the sorted ID set so identical matrix shapes
  // share cache hits across renders.
  const ids = useMemo(() => collectCatalogIds(matrices), [matrices]);

  const { data } = useQuery({
    queryKey: ['catalog-dispatch-index', ids],
    queryFn: async () => {
      if (ids.length === 0) return new Map<string, CatalogDispatchHint>();
      const { data, error } = await supabase
        .from('catalog_items')
        .select('id, dispatch_kind, trigger_field, trigger_value')
        .in('id', ids);
      if (error || !data) return new Map<string, CatalogDispatchHint>();
      return rowsToIndex(data);
    },
    staleTime: 5 * 60 * 1000,
    enabled: ids.length > 0,
  });

  return data ?? new Map();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function collectCatalogIds(matrices: ContractRateMatrix[]): string[] {
  const set = new Set<string>();
  for (const m of matrices) {
    for (const r of m.rows) {
      if (r.catalog_item_id) set.add(r.catalog_item_id);
    }
  }
  // Sorted for stable query keys.
  return Array.from(set).sort();
}

type CatalogDispatchRow = {
  id: string;
  dispatch_kind: 'standard' | 'optional' | 'delivery' | null;
  trigger_field: 'permits' | 'examinations' | null;
  trigger_value: string | null;
};

function rowsToIndex(rows: CatalogDispatchRow[]): Map<string, CatalogDispatchHint> {
  const map = new Map<string, CatalogDispatchHint>();
  for (const row of rows) {
    if (!row.dispatch_kind) continue; // null = standard, no hint needed
    map.set(row.id, {
      dispatch_kind: row.dispatch_kind,
      trigger_field: row.trigger_field ?? undefined,
      trigger_value: row.trigger_value ?? undefined,
    });
  }
  return map;
}
