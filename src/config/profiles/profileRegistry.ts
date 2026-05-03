import type { ProfileRegistryEntry } from '../../types/profiles';

// Phase 3 adds dispatch_people and vehicles as new source types.
// The ProfileRegistryEntry source union is extended to include them.

/**
 * Central registry mapping every profile type string to its lookup config.
 * BookingFieldRenderer and ProfileLookupCombobox resolve behavior from here
 * rather than duplicating per-field logic.
 *
 * The optional `admin` block declares how the type appears in the Admin →
 * Profiling UI. Entries without `admin` (customer, user, consignee_or_shipper)
 * are intentionally not surfaced as flat sections.
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
    admin: {
      label: 'Country',
      pluralLabel: 'Countries',
      description: 'Country records, priority order, and active availability.',
      orderBy: { column: 'sort_order', ascending: true },
      columns: [
        { key: 'iso_code', header: 'ISO', width: '80px', type: 'monospace' },
        { key: 'name', header: 'Name' },
        { key: 'sort_order', header: 'Priority', width: '120px', align: 'right' },
      ],
      formFields: [
        { key: 'iso_code', label: 'ISO Code', control: 'text', required: true, maxLength: 2, uppercase: true, placeholder: 'e.g. PH' },
        { key: 'name', label: 'Name', control: 'text', required: true, placeholder: 'Philippines' },
        { key: 'sort_order', label: 'Priority', control: 'number', placeholder: '999', helpText: 'Lower numbers appear first. Defaults to 999.' },
      ],
    },
  },

  // ---- Strict select + privileged quick-create ----
  port: {
    source: 'profile_locations',
    searchFields: ['name', 'code'],
    strictness: 'strict',
    quickCreateAllowed: true,
    seedStrategy: 'stable-list',
    admin: {
      label: 'Port',
      pluralLabel: 'Ports',
      description: 'Ports and airports referenced from quotations and bookings.',
      filter: { kind: 'port' },
      insertDefaults: { kind: 'port' },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'code', header: 'Code', width: '120px', type: 'monospace' },
        { key: 'transport_modes', header: 'Modes', type: 'pills' },
      ],
      formFields: [
        { key: 'name', label: 'Name', control: 'text', required: true, placeholder: 'Manila International Container Port' },
        { key: 'code', label: 'Code', control: 'text', placeholder: 'PHMNL', uppercase: true },
        { key: 'transport_modes', label: 'Transport Modes', control: 'multi-checkbox', options: [
          { value: 'sea', label: 'Sea' },
          { value: 'air', label: 'Air' },
          { value: 'land', label: 'Land' },
          { value: 'multi', label: 'Multi' },
        ] },
      ],
    },
  },

  // ---- Combo / manual fallback (onboarding-heavy) ----
  consignee: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
    // No admin — consignees are managed inside each Customer's profile
    // (Customers module owns the consignee list per customer).
  },
  shipper: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
    // No admin — shippers are managed inside each Customer's profile
    // (Customers module owns the shipper list per customer).
  },
  consignee_or_shipper: {
    source: 'trade_parties',
    searchFields: ['name', 'aliases'],
    strictness: 'combo',
    quickCreateAllowed: true,
    seedStrategy: 'backfill',
    // No admin — covered by Consignees and Shippers sections.
  },
  carrier: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'carrier',
    admin: serviceProviderAdmin('Carrier', 'Carriers', 'Sea and air carriers used in shipment fields.', 'carrier'),
  },
  // Agents are a derived view of Vendors filtered by where the vendor is based.
  // Two flavors share the same Vendor dataset (service_providers) but differ
  // by `providerScope`. Neither has an admin block — managed in /pricing/vendors.
  overseas_agent: {
    source: 'service_providers',
    searchFields: ['company_name'],
    strictness: 'combo',
    quickCreateAllowed: false,
    providerScope: 'overseas',
  },
  local_agent: {
    source: 'service_providers',
    searchFields: ['company_name'],
    strictness: 'combo',
    quickCreateAllowed: false,
    providerScope: 'local',
  },
  // Legacy `agent` entry — kept so previously-saved booking data with
  // profileType: 'agent' still resolves through the adapter. New booking
  // schema fields use overseas_agent / local_agent instead.
  agent: {
    source: 'service_providers',
    searchFields: ['company_name'],
    strictness: 'combo',
    quickCreateAllowed: false,
  },
  consolidator: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'consolidator',
    admin: serviceProviderAdmin('Consolidator', 'Consolidators', 'LCL consolidators.', 'consolidator'),
  },
  forwarder: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'forwarder',
    admin: serviceProviderAdmin('Forwarder', 'Forwarders', 'Forwarders backing the operational party in shipment fields.', 'forwarder'),
  },
  shipping_line: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'shipping_line',
    admin: serviceProviderAdmin('Shipping Line', 'Shipping Lines', 'Shipping lines used in trucking and FCL bookings.', 'shipping_line'),
  },
  trucking_company: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'trucking_company',
    admin: serviceProviderAdmin('Trucking Company', 'Trucking Companies', 'Subcontracted trucking companies.', 'trucking_company'),
  },
  insurer: {
    source: 'service_providers',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    providerTag: 'insurer',
    admin: serviceProviderAdmin('Insurer', 'Insurers', 'Marine insurance providers.', 'insurer'),
  },
  warehouse: {
    source: 'profile_locations',
    searchFields: ['name', 'code'],
    strictness: 'combo',
    quickCreateAllowed: true,
    admin: {
      label: 'Warehouse',
      pluralLabel: 'Warehouses',
      description: 'Warehouses, yards, and empty-return locations.',
      filter: { kind: 'warehouse' },
      insertDefaults: { kind: 'warehouse' },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'code', header: 'Code', width: '120px', type: 'monospace' },
      ],
      formFields: [
        { key: 'name', label: 'Name', control: 'text', required: true },
        { key: 'code', label: 'Code', control: 'text', uppercase: true },
      ],
    },
  },

  // ---- Phase 3: Dispatch ----
  driver: {
    source: 'dispatch_people',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    admin: {
      label: 'Driver',
      pluralLabel: 'Drivers',
      description: 'Drivers available to dispatch dropdowns.',
      filter: { type: 'driver' },
      insertDefaults: { type: 'driver' },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'phone', header: 'Phone', width: '160px' },
        { key: 'license_number', header: 'License', width: '180px', type: 'monospace' },
      ],
      formFields: [
        { key: 'name', label: 'Name', control: 'text', required: true },
        { key: 'phone', label: 'Phone', control: 'text' },
        { key: 'license_number', label: 'License Number', control: 'text' },
      ],
    },
  },
  helper: {
    source: 'dispatch_people',
    searchFields: ['name'],
    strictness: 'combo',
    quickCreateAllowed: true,
    admin: {
      label: 'Helper',
      pluralLabel: 'Helpers',
      description: 'Helpers and porters available to dispatch dropdowns.',
      filter: { type: 'helper' },
      insertDefaults: { type: 'helper' },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'phone', header: 'Phone', width: '160px' },
        { key: 'license_number', header: 'License', width: '180px', type: 'monospace' },
      ],
      formFields: [
        { key: 'name', label: 'Name', control: 'text', required: true },
        { key: 'phone', label: 'Phone', control: 'text' },
        { key: 'license_number', label: 'License Number', control: 'text' },
      ],
    },
  },
  vehicle: {
    source: 'vehicles',
    searchFields: ['plate_number', 'vehicle_type'],
    strictness: 'combo',
    quickCreateAllowed: true,
    admin: {
      label: 'Vehicle',
      pluralLabel: 'Vehicles',
      description: 'Vehicle records and capacity references.',
      orderBy: { column: 'plate_number', ascending: true },
      columns: [
        { key: 'plate_number', header: 'Plate Number', width: '160px', type: 'monospace' },
        { key: 'vehicle_type', header: 'Type' },
        { key: 'capacity', header: 'Capacity', width: '160px' },
      ],
      formFields: [
        { key: 'plate_number', label: 'Plate Number', control: 'text', required: true, uppercase: true },
        { key: 'vehicle_type', label: 'Vehicle Type', control: 'text', placeholder: '10-wheeler, Container Truck…' },
        { key: 'capacity', label: 'Capacity', control: 'text', placeholder: '20ft, 40HQ, 5 tons…' },
      ],
    },
  },

  // ---- Enum-style governance lists (migration 088) ----
  // Each is a single-column controlled vocabulary that used to be hardcoded
  // in src/config/booking/bookingFieldOptions.ts. Now editable from
  // Admin → Profiling. All share the same shape: searchFields=['value','label'],
  // strict select, no quick-create, sort by sort_order.
  mode: enumProfile('Mode', 'Modes', 'Transport mode for quotations and bookings (FCL, LCL, Air Freight).', 'profile_modes'),
  movement: {
    ...enumProfile('Movement', 'Movements', 'Direction of cargo flow (Import, Export, Domestic).', 'profile_movements'),
    admin: {
      ...enumProfile('Movement', 'Movements', 'Direction of cargo flow (Import, Export, Domestic).', 'profile_movements').admin!,
      // New movements default to applying across all service types. Restrict
      // per-service via the applicable_service_types[] column once a richer
      // multi-field admin UI exists.
      insertDefaults: {
        applicable_service_types: ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'],
      },
    },
  },
  incoterms: enumProfile('Incoterm', 'Incoterms', 'International commercial terms (EXW, FOB, CIF, …).', 'profile_incoterms'),
  cargo_type: enumProfile('Cargo Type', 'Cargo Types', 'Cargo handling type (Dry, Reefer, Breakbulk, …).', 'profile_cargo_types'),
  cargo_nature: enumProfile('Cargo Nature', 'Cargo Natures', 'Nature of the cargo (General, Dangerous Goods, Perishables, …).', 'profile_cargo_natures'),
  brokerage_type: enumProfile('Type of Entry', 'Types of Entry', 'Brokerage entry type (Standard, All-Inclusive, Non-Regular).', 'profile_brokerage_types'),
  customs_entry: enumProfile('Customs Entry', 'Customs Entries', 'Formal vs Informal customs entry.', 'profile_customs_entries'),
  customs_entry_procedure: enumProfile('Customs Entry Procedure', 'Customs Entry Procedures', 'Customs procedure (Consumption, PEZA, Warehousing).', 'profile_customs_entry_procedures'),
  truck_type: enumProfile('Truck Type', 'Truck Types', 'Truck size for trucking quotations and bookings.', 'profile_truck_types'),
  selectivity_color: enumProfile('Selectivity Color', 'Selectivity Colors', 'Brokerage selectivity color (Yellow, Orange, Red).', 'profile_selectivity_colors'),
  examination: enumProfile('Examination', 'Examinations', 'Brokerage examination type (X-ray, Spotcheck, DEA).', 'profile_examinations'),
  container_type: enumProfile('Container Type', 'Container Types', 'Container size for FCL (20ft, 40ft, 45ft).', 'profile_container_types'),
  package_type: enumProfile('Package Type', 'Package Types', 'Forwarding package type (Pallet, Carton, …).', 'profile_package_types'),
  preferential_treatment: enumProfile('Preferential Treatment', 'Preferential Treatments', 'Trade agreement form (Form E, Form D, …).', 'profile_preferential_treatments'),
  credit_terms: enumProfile('Credit Term', 'Credit Terms', 'Customer payment terms (Cash, 30 Days, …).', 'profile_credit_terms'),
  cpe_code: enumProfile('CPE Code', 'CPE Codes', 'Forwarding Customs Procedure Entry code.', 'profile_cpe_codes'),
  // service_status is per-service-type (composite key). Registered as a
  // lookup-only source so useEnumOptions() can fetch it; no admin block until
  // ProfileSection supports composite-key tables.
  service_status: {
    source: 'profile_service_statuses',
    searchFields: ['value', 'label'],
    strictness: 'strict',
    quickCreateAllowed: false,
    seedStrategy: 'stable-list',
  },
};

/**
 * Helper for the flat enum-style profile types added in migration 088.
 * Every one of them follows the same shape: a single `value` column governed
 * by executives, sorted by sort_order, archivable via is_active.
 */
function enumProfile(
  label: string,
  pluralLabel: string,
  description: string,
  source: ProfileRegistryEntry['source'],
): ProfileRegistryEntry {
  return {
    source,
    searchFields: ['value', 'label'],
    strictness: 'strict',
    quickCreateAllowed: false,
    seedStrategy: 'stable-list',
    admin: {
      label,
      pluralLabel,
      description,
      orderBy: { column: 'sort_order', ascending: true },
      columns: [
        { key: 'value', header: 'Value' },
        { key: 'sort_order', header: 'Order', width: '100px', align: 'right' },
      ],
      formFields: [
        { key: 'value', label: 'Value', control: 'text', required: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serviceProviderAdmin(
  label: string,
  pluralLabel: string,
  description: string,
  providerTag: string,
  extraColumns: string[] = [],
) {
  const baseColumns = [
    { key: 'company_name', header: 'Name' },
    { key: 'country', header: 'Country', width: '160px' },
    ...(extraColumns.includes('territory') ? [{ key: 'territory', header: 'Territory', width: '160px' }] : []),
    { key: 'contact_person', header: 'Contact Person' },
    { key: 'contact_email', header: 'Contact Email' },
  ];
  return {
    label,
    pluralLabel,
    description,
    arrayContainsFilter: { booking_profile_tags: providerTag },
    insertDefaults: { booking_profile_tags: [providerTag], provider_type: providerTag },
    orderBy: { column: 'company_name', ascending: true },
    columns: baseColumns,
    formFields: [
      { key: 'company_name' as const, label: 'Company Name', control: 'text' as const, required: true },
      { key: 'country' as const, label: 'Country', control: 'text' as const },
      { key: 'territory' as const, label: 'Territory', control: 'text' as const },
      { key: 'wca_number' as const, label: 'WCA Number', control: 'text' as const },
      { key: 'contact_person' as const, label: 'Contact Person', control: 'text' as const },
      { key: 'contact_email' as const, label: 'Contact Email', control: 'text' as const },
      { key: 'contact_phone' as const, label: 'Contact Phone', control: 'text' as const },
      { key: 'address' as const, label: 'Address', control: 'textarea' as const },
      { key: 'notes' as const, label: 'Notes', control: 'textarea' as const },
    ],
  };
}
