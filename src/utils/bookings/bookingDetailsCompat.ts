/**
 * Compatibility layer for booking details JSONB.
 *
 * Old records stored service-specific fields in camelCase. New records use snake_case.
 * This module normalizes old keys to their canonical snake_case equivalents so that
 * create/edit/detail screens only ever deal with snake_case keys.
 *
 * Rules:
 * - If the snake_case key is already present, it wins (no overwrite).
 * - Old camelCase keys are not removed from the returned object so display code that
 *   still references them doesn't break during the transition period.
 * - Service-specific renames (e.g. Forwarding "forwarder" → "agent") are applied only
 *   when serviceType is provided.
 */

// ---------------------------------------------------------------------------
// Global camelCase → snake_case mappings (apply to all services)
// ---------------------------------------------------------------------------

const GLOBAL_LEGACY_MAP: Record<string, string> = {
  accountOwner:             'account_owner',
  accountHandler:           'account_handler',
  quotationReferenceNumber: 'quotation_reference_number',
  commodityDescription:     'commodity_description',
  deliveryAddress:          'delivery_address',
  mblMawb:                  'mbl_mawb',
  hblHawb:                  'hbl_hawb',
  detDemValidity:            'det_dem_validity',
  containerNumbers:          'container_numbers',
  truckType:                 'truck_type',
  preferredDeliveryDate:    'preferred_delivery_date',
  vehicleReferenceNumber:   'vehicle_reference_number',
  dateDelivered:             'date_delivered',
  sumInsured:                'amount_insured',
  policyNumber:              'policy_number',
  serviceDescription:        'service_description',
  // Brokerage
  registryNumber:            'registry_number',
  descriptionOfGoods:        'description_of_goods',
  grossWeight:               'gross_weight',
  chargeableWeight:          'chargeable_weight',
  countryOfOrigin:           'country_of_origin',
  flightNumber:              'flight_number',
  sealNumbers:               'seal_numbers',
  tareWeight:                'tare_weight',
  containerDeposit:          'container_deposit',
  storageValidity:           'storage_validity',
  croAvailability:           'cro_availability',
  bookingConfirmationNumber: 'booking_confirmation_number',
  pullOutCollectionAddress:  'pull_out_collection_address',
  truckingName:              'trucking_name',
  plateNumber:               'plate_number',
  selectivityColor:          'selectivity_color',
  entryNumber:               'entry_number',
  customsDutiesTaxesPaid:    'customs_duties_taxes_paid',
  brokerageFeeNetOfVat:      'brokerage_fee_net_of_vat',
  brokerageFeeSad:           'brokerage_fee_sad',
  dimensions:                'measurement',
  hsCodes:                   'hs_codes',
  rateOfDuty:                'rate_of_duty',
  locationOfGoods:           'location_of_goods',
  warehouseLocation:         'warehouse_location',
  strippingDate:             'stripping_date',
  // Forwarding
  cargoType:                 'cargo_type',
  cargoNature:               'cargo_nature',
  countryOfDestination:      'country_of_destination',
  taggingTime:               'tagging_time',
  typeOfPackage:             'type_of_package',
  cutOffTime:                'cut_off_time',
  transitTime:               'transit_time',
  shippingCharges:           'shipping_charges',
  consolidatorCharges:       'consolidator_charges',
  collectionAddress:         'collection_address',
  overseasAgent:             'overseas_agent',
  localAgent:                'local_agent',
  subServices:               'sub_services',
  customsEntryProcedure:     'customs_entry_procedure',
  customsEntryProcedureCode: 'customs_entry_procedure',
  customsEntryType:          'customs_entry_procedure',
  // Trucking
  pullOut:                   'pull_out_location',
  pullOutDate:               'pull_out_date',
  dateEmptyReturn:           'date_empty_return',
  deliveryInstructions:      'delivery_instructions',
  truckingLineItems:         'trucking_line_items',
  tabsBooking:               'tabs_booking',
  cyFee:                     'cy_fee',
  eirAvailability:           'eir_availability',
  earlyGateIn:               'early_gate_in',
  shippingLine:              'shipping_line',
  containerNumber:           'container_number',
  // Marine Insurance
  blAwbNumber:               'bl_awb_number',
  amountInsured:             'amount_insured',  // already snake but just in case
  dateIssued:                'date_issued',
  coverageType:              'coverage_type',
  policyStartDate:           'policy_start_date',
  policyEndDate:             'policy_end_date',
  // Aliases from project autofill functions (autofillXxxFromProject returns these camelCase keys)
  movement:                  'movement_type',
  name:                      'booking_name',
  customerName:              'customer_name',
  projectNumber:             'project_number',
  aolPol:                    'pol_aol',
  aodPod:                    'pod_aod',
  // grossWeight already mapped above — no duplicate
  preferentialTreatment:     'preferential_treatment',
  // Quotation save-handler output keys — normalize so booking-side compat picks them up
  commodity:                 'commodity_description',  // QuotationBuilderV3 writes 'commodity'
  lcl_gwt:                   'gross_weight',           // LCL gross weight from quotation forms
  lcl_dims:                  'measurement',            // LCL dimensions → canonical measurement
  air_gwt:                   'gross_weight',           // Air gross weight (same canonical target)
  air_cwt:                   'chargeable_weight',      // Air chargeable weight
  route:                     'routing',                // Forwarding 'route' → canonical 'routing'
  pull_out:                  'pull_out_location',      // Trucking pull_out → canonical
  stackability:              'stackable',
  customs_entry_procedure_code: 'customs_entry_procedure',
  pullOutLocation:           'pull_out_location',
  hsCode:                    'hs_codes',
  brokerageType:             'brokerage_type',
  vesselName:                'vessel',
  estimatedDeparture:        'etd',
  estimatedArrival:          'eta',
  // Others
  scheduleDate:              'schedule_date',
  completionDate:            'completion_date',
  contactPerson:             'contact_person',
  contactNumber:             'contact_number',
  specialInstructions:       'special_instructions',
  estimatedCost:             'estimated_cost',
  actualCost:                'actual_cost',
  deliveryLocation:          'delivery_location',
  serviceType:               'service',          // Others old field "serviceType" → "service"
};

// ---------------------------------------------------------------------------
// Service-specific renames (semantic changes, not just casing)
// ---------------------------------------------------------------------------

const SERVICE_LEGACY_MAP: Record<string, Record<string, string>> = {
  // Forwarding: old "forwarder" field becomes "agent" (client terminology change)
  Forwarding: {
    forwarder: 'agent',
  },
  // Trucking: old "emptyReturn" stored the FCL empty-return date/text → maps to the FCL field.
  // "date_empty_return" is a separate field driven by status = Empty Return.
  Trucking: {
    emptyReturn: 'empty_return',
  },
  // Brokerage: "pod" shorthand → canonical "pod_aod"
  Brokerage: {
    pod: 'pod_aod',
    pol: 'pol_aol',
  },
  // Marine Insurance: old field aliases
  'Marine Insurance': {
    departurePort: 'pol_aol',
    arrivalPort:   'pod_aod',
  },
};

// ---------------------------------------------------------------------------
// Core normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw details JSONB object to snake_case keys.
 * Existing snake_case keys are never overwritten — old camelCase values only
 * fill in when no snake_case value is already present.
 */
export function normalizeDetails(
  raw: Record<string, unknown>,
  serviceType?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  const serviceMap = serviceType ? (SERVICE_LEGACY_MAP[serviceType] ?? {}) : {};
  const combined = { ...GLOBAL_LEGACY_MAP, ...serviceMap };

  for (const [oldKey, newKey] of Object.entries(combined)) {
    if (oldKey in out && !(newKey in out)) {
      out[newKey] = out[oldKey];
    }
  }

  return out;
}

/**
 * Merges a raw Supabase booking row (top-level columns + details JSONB) into a
 * single flat object suitable for pre-filling a form.
 *
 * Mirrors the existing `{ ...data?.details, ...data }` pattern used elsewhere in
 * the codebase, but additionally normalizes legacy detail keys before merging so
 * form fields referencing snake_case keys find their values.
 *
 * Top-level columns always win over details values for the same key.
 * The `profile_refs` block is preserved as-is — profileSerialize helpers consume it separately.
 */
export function mergeBookingRecord(
  raw: Record<string, unknown>,
  serviceType?: string,
): Record<string, unknown> {
  const rawDetails = (raw.details as Record<string, unknown>) ?? {};
  const normalizedDetails = normalizeDetails(rawDetails, serviceType ?? String(raw.service_type ?? ''));
  const merged = { ...normalizedDetails, ...raw };
  // Keep profile_refs accessible at the top level for hydration helpers
  if (rawDetails.profile_refs && !merged.profile_refs) {
    merged.profile_refs = rawDetails.profile_refs;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Reverse aliases — new snake_case keys → old camelCase display names
// Used by normalizeBookingForDisplay so existing detail-view components that
// still read camelCase props continue to work with new-format bookings.
// ---------------------------------------------------------------------------

const REVERSE_DISPLAY_MAP: Record<string, string> = {
  // Top-level column aliases that old detail views still read as camelCase
  movement_type:               'movement',
  customer_name:               'customerName',
  account_owner:               'accountOwner',
  account_handler:             'accountHandler',
  project_number:              'projectNumber',
  quotation_reference_number:  'quotationReferenceNumber',
  created_at:                  'createdAt',
  updated_at:                  'updatedAt',
  booking_number:              'bookingNumber',
  service_type:                'serviceType',
  // id → bookingId (ForwardingBookingDetails uses booking.bookingId)
  id:                          'bookingId',
};

/**
 * Normalizes a raw booking record for display in detail view components.
 *
 * Applies:
 * 1. mergeBookingRecord — flattens details JSONB and normalizes old camelCase keys → snake_case
 * 2. normalizeTopLevelFields — fixes UPPERCASE movement_type and AIR mode
 * 3. Reverse aliases — adds camelCase props so existing detail views that still read
 *    camelCase field names (e.g. booking.customerName, booking.movement) find their values
 *    even when the underlying record was saved with snake_case keys.
 */
export function normalizeBookingForDisplay(
  raw: Record<string, unknown>,
  serviceType?: string,
): Record<string, unknown> {
  const merged = normalizeTopLevelFields(
    mergeBookingRecord(raw, serviceType ?? String(raw.service_type ?? '')),
  );

  // Build reverse alias set from GLOBAL_LEGACY_MAP
  const allOldToNew = { ...GLOBAL_LEGACY_MAP };
  if (serviceType) Object.assign(allOldToNew, SERVICE_LEGACY_MAP[serviceType] ?? {});

  // Add camelCase aliases for any snake_case key that doesn't already have one
  for (const [oldKey, newKey] of Object.entries(allOldToNew)) {
    if (newKey in merged && !(oldKey in merged)) {
      merged[oldKey] = merged[newKey];
    }
  }

  // Apply top-level reverse map
  for (const [newKey, oldKey] of Object.entries(REVERSE_DISPLAY_MAP)) {
    if (newKey in merged && !(oldKey in merged)) {
      merged[oldKey] = merged[newKey];
    }
  }

  return merged;
}

/**
 * Returns the canonical snake_case key for a given legacy key, or the key itself
 * if no mapping exists (i.e. it is already canonical).
 */
export function canonicalKey(key: string, serviceType?: string): string {
  const serviceMap = serviceType ? (SERVICE_LEGACY_MAP[serviceType] ?? {}) : {};
  return serviceMap[key] ?? GLOBAL_LEGACY_MAP[key] ?? key;
}

/**
 * Normalizes top-level booking column values that may differ between old and new records.
 * Called by useBookingFormState.initFromRecord after merging details.
 *
 * Currently handles:
 * - movement_type: old records stored "IMPORT"/"EXPORT" (uppercase); new schema uses "Import"/"Export"
 */
export function normalizeTopLevelFields(record: Record<string, unknown>): Record<string, unknown> {
  const out = { ...record };
  if (typeof out.movement_type === 'string' && out.movement_type.length > 0) {
    const mv = out.movement_type as string;
    if (mv === mv.toUpperCase()) {
      out.movement_type = mv.charAt(0) + mv.slice(1).toLowerCase();
    }
  }
  // Old Forwarding stored mode as "AIR"; new schema uses "Air Freight"
  if (out.mode === 'AIR' || out.mode === 'Air') {
    out.mode = 'Air Freight';
  }
  return out;
}
