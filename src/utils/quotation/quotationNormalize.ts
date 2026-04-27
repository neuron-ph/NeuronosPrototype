import { QUOTATION_SCHEMA_MAP } from '../../config/quotation/quotationScreenSchema';
import type { ServiceType } from '../../config/booking/bookingFieldTypes';

/**
 * Normalizes a service_details JSONB object written by the QuotationBuilderV3
 * save handler into a canonical-key form, while preserving all existing legacy
 * keys (dual-write strategy).
 *
 * Canonical keys are determined by each field's `key` in the quotation schema.
 * Legacy aliases are listed in each field's `legacyKeys` array.
 *
 * Rules:
 * - If a legacy key is present and the canonical key is absent, copy the value
 *   to the canonical key.
 * - If the canonical key is present, write it to any legacy aliases that are
 *   absent, so old readers continue to find their expected key.
 * - Never overwrite an existing value.
 */
export function normalizeQuotationDetails(
  serviceType: ServiceType,
  serviceDetails: Record<string, unknown>,
): Record<string, unknown> {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  const out: Record<string, unknown> = { ...serviceDetails };

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!field.legacyKeys || field.legacyKeys.length === 0) continue;

      const canonicalKey = field.key;

      // If canonical is missing, populate it from the first matching legacy alias.
      if (!(canonicalKey in out)) {
        for (const alias of field.legacyKeys) {
          if (alias in out) {
            out[canonicalKey] = out[alias];
            break;
          }
        }
      }

      // If canonical is now present, back-fill any absent legacy aliases so
      // existing readers still find the value they expect.
      if (canonicalKey in out) {
        for (const alias of field.legacyKeys) {
          if (!(alias in out)) {
            out[alias] = out[canonicalKey];
          }
        }
      }
    }
  }

  return out;
}

/**
 * Normalizes the services_metadata array built by QuotationBuilderV3.
 * Applies normalizeQuotationDetails to each service's service_details.
 */
export function normalizeServicesMetadata(
  servicesMetadata: Array<{ service_type: string; service_details: Record<string, unknown> }>,
): Array<{ service_type: string; service_details: Record<string, unknown> }> {
  return servicesMetadata.map(entry => ({
    ...entry,
    service_details: normalizeQuotationDetails(
      entry.service_type as ServiceType,
      entry.service_details,
    ),
  }));
}
