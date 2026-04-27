import type { ProfileRegistryEntry } from '../../types/profiles';

// Phase 3 adds dispatch_people and vehicles as new source types.
// The ProfileRegistryEntry source union is extended to include them.

/**
 * Central registry mapping every profile type string to its lookup config.
 * BookingFieldRenderer and ProfileLookupCombobox resolve behavior from here
 * rather than duplicating per-field logic.
 */
export const profileRegistry: Record<string, ProfileRegistryEntry> = {
  // ---- Strict select-only (no manual fallback) ----
  customer: {
    source: 'customers',
    searchFields: ['name'],
    strictness: 'strict',
    quickCreateAllowed: false,
  },
  user: {
    source: 'users',
    searchFields: ['full_name', 'email'],
    strictness: 'strict',
    quickCreateAllowed: false,
  },
  country: {
    source: 'profile_countries',
    searchFields: ['name', 'iso_code'],
    strictness: 'strict',
    quickCreateAllowed: false,
    seedStrategy: 'stable-list',
  },

  // ---- Strict select + privileged quick-create ----
  port: {
    source: 'profile_locations',
    searchFields: ['name', 'code'],
    strictness: 'strict',
    quickCreateAllowed: true,
    seedStrategy: 'stable-list',
  },

  // ---- Combo / manual fallback (onboarding-heavy) ----
  consignee: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
  },
  shipper: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
  },
  consignee_or_shipper: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
  },
  carrier: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'carrier',
  },
  agent: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'agent',
  },
  consolidator: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'consolidator',
  },
  forwarder: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'forwarder',
  },
  shipping_line: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'shipping_line',
  },
  trucking_company: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'trucking_company',
  },
  insurer: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'insurer',
  },
  warehouse: {
    source: 'profile_locations',
    searchFields: ['name', 'code'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },

  // ---- Phase 3: Dispatch ----
  driver: {
    source: 'dispatch_people',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },
  helper: {
    source: 'dispatch_people',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },
  vehicle: {
    source: 'vehicles',
    searchFields: ['plate_number', 'vehicle_type'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },

  // ---- Booking service catalogs (per-booking-type, multi-select) ----
  service_catalog: {
    source: 'booking_service_catalog',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },
  sub_service_catalog: {
    source: 'booking_subservice_catalog',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
  },
};
