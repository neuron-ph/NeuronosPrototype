/**
 * useEnumOptions
 *
 * Replaces the old hardcoded option arrays in
 * src/config/booking/bookingFieldOptions.ts. Each enum kind now lives in its
 * own profile_<plural> table (migration 088) so executives can edit values
 * from Admin → Profiling without a code deploy.
 *
 * Returns active values sorted by sort_order. While the first fetch is in
 * flight the seed fallback (passed by the caller, or derived from the
 * built-in seed map) is returned so dropdowns are never empty on first paint.
 *
 * The seed map mirrors the canonical values inserted by migration 088. It
 * exists so:
 *   1. Tests and SSR contexts that don't have a Supabase session still work.
 *   2. The very first render of any dropdown shows the right options before
 *      the network round-trip completes.
 * The DB is the source of truth — once the fetch resolves, the cached list
 * supersedes the seed.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { queryKeys } from '../lib/queryKeys';

// ---------------------------------------------------------------------------
// Kind → table mapping (must match profileRegistry sources)
// ---------------------------------------------------------------------------

export type EnumKind =
  | 'mode'
  | 'movement'
  | 'incoterms'
  | 'cargo_type'
  | 'cargo_nature'
  | 'brokerage_type'
  | 'customs_entry'
  | 'customs_entry_procedure'
  | 'truck_type'
  | 'selectivity_color'
  | 'examination'
  | 'container_type'
  | 'package_type'
  | 'preferential_treatment'
  | 'credit_terms'
  | 'cpe_code'
  | 'service_status';

const TABLE_BY_KIND: Record<EnumKind, string> = {
  mode: 'profile_modes',
  movement: 'profile_movements',
  incoterms: 'profile_incoterms',
  cargo_type: 'profile_cargo_types',
  cargo_nature: 'profile_cargo_natures',
  brokerage_type: 'profile_brokerage_types',
  customs_entry: 'profile_customs_entries',
  customs_entry_procedure: 'profile_customs_entry_procedures',
  truck_type: 'profile_truck_types',
  selectivity_color: 'profile_selectivity_colors',
  examination: 'profile_examinations',
  container_type: 'profile_container_types',
  package_type: 'profile_package_types',
  preferential_treatment: 'profile_preferential_treatments',
  credit_terms: 'profile_credit_terms',
  cpe_code: 'profile_cpe_codes',
  service_status: 'profile_service_statuses',
};

// ---------------------------------------------------------------------------
// Seed fallbacks — match migration 088 exactly. Tests and pre-fetch render
// rely on these. DB is still the source of truth at runtime.
// ---------------------------------------------------------------------------

export const ENUM_SEEDS: Record<EnumKind, string[]> = {
  mode: ['FCL', 'LCL', 'Air Freight'],
  movement: ['Import', 'Export', 'Domestic'],
  incoterms: ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDU', 'DDP'],
  cargo_type: ['Dry', 'Reefer', 'Breakbulk', 'RORO', 'Dangerous Goods', 'Perishables', 'Other'],
  cargo_nature: ['General Cargo', 'Dangerous Goods', 'Perishables', 'Valuables', 'Temperature Controlled'],
  brokerage_type: ['Standard', 'All-Inclusive', 'Non-Regular'],
  customs_entry: ['Formal', 'Informal'],
  customs_entry_procedure: ['Consumption', 'PEZA', 'Warehousing'],
  truck_type: ['4W', '6W', '10W', '20ft', '40ft', '45ft'],
  selectivity_color: ['Yellow', 'Orange', 'Red'],
  examination: ['X-ray', 'Spotcheck', 'DEA'],
  container_type: ['20ft', '40ft', '45ft'],
  package_type: ['Pallet', 'Carton', 'Crate', 'Bag', 'Drum', 'Bundle', 'Container', 'Other'],
  preferential_treatment: ['Form E', 'Form D'],
  credit_terms: ['Cash', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days'],
  cpe_code: ['23', '24'],
  service_status: [], // never used in flat form — always scoped by service_type
};

// Per-service-type seed for service_status.
const SERVICE_STATUS_SEEDS: Record<string, string[]> = {
  Brokerage: ['Draft', 'Waiting for Arrival', 'Ongoing', 'Delivered', 'Billed', 'Paid', 'Audited', 'Cancelled'],
  Forwarding: ['Draft', 'Ongoing', 'In Transit', 'Delivered', 'Completed', 'Billed', 'Paid', 'Cancelled'],
  Trucking: ['Draft', 'Ongoing', 'Delivered', 'Empty Return', 'Liquidated', 'Billed', 'Paid', 'Cancelled'],
  'Marine Insurance': ['Draft', 'Ongoing', 'Issued', 'Billed', 'Paid', 'Cancelled'],
  Others: ['Draft', 'Ongoing', 'Completed', 'Billed', 'Paid', 'Cancelled'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type Row = { value: string; sort_order: number; is_active: boolean; applicable_service_types?: string[] | null; service_type?: string | null };

export type EnumOptionsScope = {
  /** For `movement` — restrict to options whose applicable_service_types contains this. */
  serviceType?: string;
};

/**
 * Returns the active option values for an enum kind, sorted by sort_order.
 * Falls back to the seed array while the first fetch is in flight.
 */
export function useEnumOptions(kind: EnumKind, scope: EnumOptionsScope = {}): string[] {
  const table = TABLE_BY_KIND[kind];
  const { data } = useQuery({
    queryKey: queryKeys.enumOptions.kind(kind),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('value, sort_order, is_active, applicable_service_types, service_type')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 5 * 60 * 1000, // 5 min — governance lists change rarely
  });

  if (!data) {
    return seedFor(kind, scope);
  }
  return applyScope(kind, data, scope).map(r => r.value);
}

/**
 * Returns the per-service-type status options. Convenience wrapper around
 * useEnumOptions('service_status') filtered by service_type.
 */
export function useServiceStatusOptions(serviceType: string): string[] {
  const { data } = useQuery({
    queryKey: queryKeys.enumOptions.kind('service_status'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE_BY_KIND.service_status)
        .select('value, sort_order, is_active, service_type')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return SERVICE_STATUS_SEEDS[serviceType] ?? [];
  return data.filter(r => r.service_type === serviceType).map(r => r.value);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function seedFor(kind: EnumKind, scope: EnumOptionsScope): string[] {
  if (kind === 'movement' && scope.serviceType) {
    // Domestic only applies to Forwarding/Trucking.
    return scope.serviceType === 'Forwarding' || scope.serviceType === 'Trucking'
      ? ['Import', 'Export', 'Domestic']
      : ['Import', 'Export'];
  }
  return ENUM_SEEDS[kind];
}

function applyScope(kind: EnumKind, rows: Row[], scope: EnumOptionsScope): Row[] {
  if (kind === 'movement' && scope.serviceType) {
    return rows.filter(r => Array.isArray(r.applicable_service_types) && r.applicable_service_types.includes(scope.serviceType!));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Bundle helper — fetches every flat enum kind in a single hook call so the
// BookingFieldRenderer can resolve any `optionsKind` without conditional
// hooks. service_status is intentionally excluded — its per-service-type
// scoping needs the dedicated useServiceStatusOptions().
// ---------------------------------------------------------------------------

const FLAT_ENUM_KINDS = [
  'mode', 'movement', 'incoterms', 'cargo_type', 'cargo_nature', 'brokerage_type',
  'customs_entry', 'customs_entry_procedure', 'truck_type', 'selectivity_color',
  'examination', 'container_type', 'package_type', 'preferential_treatment',
  'credit_terms', 'cpe_code',
] as const satisfies readonly EnumKind[];

export type EnumBundle = Record<EnumKind, string[]>;

/**
 * Returns every flat enum kind's options in one bundle. Each kind is fetched
 * by its own useQuery so they stay independently cacheable. Movement is
 * served unscoped here; if a caller needs it filtered by service_type they
 * should call useEnumOptions('movement', { serviceType }) directly.
 */
export function useAllEnumOptions(): EnumBundle {
  // Hooks must be called unconditionally and in the same order every render.
  // Calling useEnumOptions for each kind is safe because the kind list is a
  // module-level constant. TanStack dedups the queries.
  /* eslint-disable react-hooks/rules-of-hooks */
  const bundle = {} as EnumBundle;
  for (const kind of FLAT_ENUM_KINDS) {
    bundle[kind] = useEnumOptions(kind);
  }
  // service_status placeholder — flat consumers should not read this; use
  // useServiceStatusOptions(serviceType) instead.
  bundle.service_status = [];
  /* eslint-enable react-hooks/rules-of-hooks */
  return bundle;
}
