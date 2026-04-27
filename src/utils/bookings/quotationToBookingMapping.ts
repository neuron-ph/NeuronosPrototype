/**
 * Canonical quotation → booking field mapping.
 *
 * Each entry defines:
 *   sourceKeys  — keys to try in order when reading from service_details JSONB.
 *                 After Phase 3 normalization, canonical snake_case keys appear first;
 *                 legacy camelCase aliases appear after as fallbacks for old records.
 *   targetKey   — the camelCase key expected in the autofill return shape
 *                 (consumed by normalizeDetails → bookingDetailsCompat).
 *   projectKey  — optional project-level fallback key when service_details is absent.
 *
 * This table is the authoritative single source of truth consumed by
 * projectAutofill.ts and contractAutofill.ts.
 */

export type FieldMapping = {
  sourceKeys: string[];
  targetKey: string;
  projectKey?: string;
};

// ---------------------------------------------------------------------------
// Helper: look up the first matching value from a source object
// ---------------------------------------------------------------------------

export function resolveField(
  source: Record<string, unknown>,
  mapping: FieldMapping,
  projectFallback?: Record<string, unknown>,
): unknown {
  for (const key of mapping.sourceKeys) {
    const val = source[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  if (mapping.projectKey && projectFallback) {
    const val = projectFallback[mapping.projectKey];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return '';
}

/**
 * Applies all mappings for a given service to a source service_details object,
 * returning a flat object with camelCase target keys for the autofill return shape.
 */
export function applyMapping(
  mappings: FieldMapping[],
  serviceDetails: Record<string, unknown>,
  projectFields?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const mapping of mappings) {
    result[mapping.targetKey] = resolveField(serviceDetails, mapping, projectFields);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Forwarding
// Matrix carry-over fields: incoterms, cargo_type, cargo_nature, commodity_description,
// delivery_address, pol_aol, pod_aod, mode, collection_address, transit_time,
// carrier_airline, routing, stackable + mode-specific weight/measurement fields.
// ---------------------------------------------------------------------------

export const FORWARDING_MAPPING: FieldMapping[] = [
  { sourceKeys: ['incoterms'],                                                  targetKey: 'incoterms' },
  { sourceKeys: ['cargo_type', 'cargoType'],                                    targetKey: 'cargoType' },
  { sourceKeys: ['cargo_nature', 'cargoNature'],                                targetKey: 'cargoNature' },
  { sourceKeys: ['commodity_description', 'commodity', 'commodityDescription'], targetKey: 'commodityDescription', projectKey: 'commodity' },
  { sourceKeys: ['delivery_address', 'deliveryAddress'],                        targetKey: 'deliveryAddress' },
  { sourceKeys: ['pol_aol', 'aolPol', 'pol', 'aol'],                           targetKey: 'aolPol', projectKey: 'pol_aol' },
  { sourceKeys: ['pod_aod', 'aodPod', 'pod', 'aod'],                           targetKey: 'aodPod', projectKey: 'pod_aod' },
  { sourceKeys: ['mode'],                                                        targetKey: 'mode' },
  { sourceKeys: ['collection_address', 'collectionAddress'],                    targetKey: 'collectionAddress' },
  { sourceKeys: ['transit_time', 'transitTime'],                                targetKey: 'transitTime' },
  { sourceKeys: ['carrier_airline', 'carrierAirline', 'carrier'],               targetKey: 'carrier', projectKey: 'carrier' },
  { sourceKeys: ['routing', 'route'],                                            targetKey: 'routing' },
  { sourceKeys: ['stackable', 'stackability'],                                   targetKey: 'stackable' },
  { sourceKeys: ['gross_weight', 'lcl_gwt', 'air_gwt', 'grossWeight'],          targetKey: 'grossWeight', projectKey: 'gross_weight' },
  { sourceKeys: ['measurement', 'lcl_dims', 'lclDims', 'dimensions'],           targetKey: 'dimensions' },
  { sourceKeys: ['chargeable_weight', 'air_cwt', 'airCwt', 'chargeableWeight'], targetKey: 'volumeChargeableWeight' },
  { sourceKeys: ['country_of_origin', 'countryOfOrigin'],                       targetKey: 'countryOfOrigin' },
  { sourceKeys: ['preferential_treatment', 'preferentialTreatment'],            targetKey: 'preferentialTreatment' },
];

// ---------------------------------------------------------------------------
// Brokerage
// Matrix carry-over: mode, cargo_type, commodity_description, delivery_address,
// country_of_origin, preferential_treatment, type_of_entry
// ---------------------------------------------------------------------------

export const BROKERAGE_MAPPING: FieldMapping[] = [
  { sourceKeys: ['brokerage_type', 'brokerageType', 'subtype'],                 targetKey: 'brokerageType' },
  { sourceKeys: ['type_of_entry', 'typeOfEntry'],                               targetKey: 'customsEntryProcedure' },
  { sourceKeys: ['pod_aod', 'pod', 'aodPod', 'aod_pod'],                       targetKey: 'pod', projectKey: 'pod_aod' },
  { sourceKeys: ['mode'],                                                        targetKey: 'mode' },
  { sourceKeys: ['cargo_type', 'cargoType'],                                    targetKey: 'cargoType' },
  { sourceKeys: ['commodity_description', 'commodity', 'commodityDescription'], targetKey: 'commodityDescription', projectKey: 'commodity' },
  { sourceKeys: ['delivery_address', 'deliveryAddress'],                        targetKey: 'deliveryAddress' },
  { sourceKeys: ['country_of_origin', 'countryOfOrigin'],                       targetKey: 'countryOfOrigin' },
  { sourceKeys: ['preferential_treatment', 'preferentialTreatment'],            targetKey: 'preferentialTreatment' },
];

// ---------------------------------------------------------------------------
// Trucking
// Matrix carry-over: pickup_location, destination/s (repeater), truck_type,
// qty, delivery_instructions
// ---------------------------------------------------------------------------

export const TRUCKING_MAPPING: FieldMapping[] = [
  { sourceKeys: ['pull_out_location', 'pull_out', 'pullOut', 'pullOutLocation'], targetKey: 'pullOutLocation' },
  { sourceKeys: ['trucking_line_items', 'truckingLineItems'],                    targetKey: 'truckingLineItems' },
  { sourceKeys: ['truck_type', 'truckType'],                                     targetKey: 'truckType' },
  { sourceKeys: ['delivery_address', 'deliveryAddress'],                         targetKey: 'deliveryAddress' },
  { sourceKeys: ['delivery_instructions', 'deliveryInstructions'],               targetKey: 'deliveryInstructions' },
];

// ---------------------------------------------------------------------------
// Marine Insurance
// Matrix carry-over: commodity_description, hs_code, pol_aol, pod_aod, invoice_value
// ---------------------------------------------------------------------------

export const MARINE_INSURANCE_MAPPING: FieldMapping[] = [
  { sourceKeys: ['commodity_description', 'commodity', 'commodityDescription'], targetKey: 'commodityDescription', projectKey: 'commodity' },
  { sourceKeys: ['hs_codes', 'hs_code', 'hsCodes', 'hsCode'],                  targetKey: 'hsCode' },
  { sourceKeys: ['pol_aol', 'aol_pol', 'aolPol', 'pol'],                       targetKey: 'departurePort', projectKey: 'pol_aol' },
  { sourceKeys: ['pod_aod', 'aod_pod', 'aodPod', 'pod'],                       targetKey: 'arrivalPort', projectKey: 'pod_aod' },
  { sourceKeys: ['invoice_value', 'invoiceValue'],                              targetKey: 'invoiceValue' },
];

// ---------------------------------------------------------------------------
// Others
// Matrix carry-over: service_description
// ---------------------------------------------------------------------------

export const OTHERS_MAPPING: FieldMapping[] = [
  { sourceKeys: ['service_description', 'serviceDescription'], targetKey: 'serviceDescription' },
];
