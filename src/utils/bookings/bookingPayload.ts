import { getServiceSchema } from '../../config/booking/bookingScreenSchema';
import { isProfileSelectionValue, profileValueArrayToRefs, profileValueToLabel, profileValueToRef } from './profileSerialize';
import type { ProfileSelectionValue } from '../../types/profiles';

/**
 * Canonical top-level booking columns that are always written directly to the
 * `bookings` table row, regardless of which schema fields drove them.
 * These bypass the schema-driven split because they are set by the form shell
 * (team assignment, project/contract links) rather than by individual field defs.
 */
export const TOP_LEVEL_COLUMNS = new Set([
  'booking_number',
  'name',
  'service_type',
  'customer_name',
  'customer_id',
  'status',
  'movement_type',
  'mode',
  'project_id',
  'contract_id',
  'manager_id',
  'manager_name',
  'supervisor_id',
  'supervisor_name',
  'handler_id',
  'handler_name',
  'team_id',
  'team_name',
]);

export type BookingPayload = {
  topLevel: Record<string, unknown>;
  details: Record<string, unknown>;
};

/**
 * Splits a flat form state object into the two Supabase write targets:
 * - `topLevel`  → fields that map to `bookings` columns
 * - `details`   → fields that are stored in `bookings.details` JSONB
 *
 * Driving logic:
 * 1. Walk every field in the service schema; use `field.storage` to route the value.
 *    `field.storageKey` is used when the column name differs from the field key
 *    (e.g. `booking_name` → `name`).
 * 2. After the schema walk, also sweep `TOP_LEVEL_COLUMNS` directly from formState
 *    to catch team-assignment sub-fields and project/contract IDs that live outside
 *    the schema field list.
 * 3. Fields with undefined values are omitted from the payload.
 */
export function buildBookingPayload(
  formState: Record<string, unknown>,
  serviceType: string,
): BookingPayload {
  const schema = getServiceSchema(serviceType);
  const topLevel: Record<string, unknown> = {};
  const details: Record<string, unknown> = {};

  if (schema) {
    const seen = new Set<string>();

    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (seen.has(field.key)) continue; // shared fields (e.g. primary_trade_party) appear in one section only
        seen.add(field.key);

        const val = formState[field.key];
        if (val === undefined) continue;

        if (field.control === 'profile-lookup' && isProfileSelectionValue(val)) {
          // Write snapshot label to the column/detail key, and link metadata to profile_refs
          const snapshotLabel = profileValueToLabel(val);
          if (field.storage === 'top-level') {
            const col = field.storageKey ?? field.key;
            topLevel[col] = snapshotLabel;
            // customer_id is fully derived from the customer_name profile field.
            // Always write it — including null — so the sweep below cannot restore a stale value.
            if (field.key === 'customer_name') {
              topLevel['customer_id'] = val.id ?? null;
            }
          } else {
            details[field.key] = snapshotLabel;
          }
          const existingRefs = (details.profile_refs as Record<string, unknown>) ?? {};
          details.profile_refs = { ...existingRefs, [field.key]: profileValueToRef(field.key, val) };
        } else if (field.control === 'multi-profile-lookup' && Array.isArray(val)) {
          // Multi-select profile field — persist labels[] for backward-compat plus refs[]
          const items = (val as Array<ProfileSelectionValue | string>).map(item =>
            typeof item === 'string'
              ? { id: null, label: item, profileType: field.profileType ?? '', source: 'manual' as const }
              : item,
          );
          const labels = items.map(i => i.label).filter(l => l && l.trim().length > 0);
          if (field.storage === 'top-level') {
            topLevel[field.storageKey ?? field.key] = labels;
          } else {
            details[field.key] = labels;
          }
          const existingRefs = (details.profile_refs as Record<string, unknown>) ?? {};
          details.profile_refs = { ...existingRefs, [field.key]: profileValueArrayToRefs(items) };
        } else if (field.storage === 'top-level') {
          const col = field.storageKey ?? field.key;
          topLevel[col] = val;
        } else {
          details[field.key] = val;
        }
      }
    }
  }

  // Sweep top-level columns that live outside the schema (team IDs, project/contract links)
  for (const col of TOP_LEVEL_COLUMNS) {
    if (col in formState && !(col in topLevel)) {
      topLevel[col] = formState[col];
    }
  }

  return { topLevel, details };
}

/**
 * Returns only the details portion of the payload. Useful for partial updates
 * where only the service-specific fields changed and top-level columns are untouched.
 */
export function buildDetailsPayload(
  formState: Record<string, unknown>,
  serviceType: string,
): Record<string, unknown> {
  return buildBookingPayload(formState, serviceType).details;
}

/**
 * Assembles the final Supabase insert/update object by merging topLevel fields
 * and wrapping details as a JSONB column.
 *
 * Usage:
 *   const { topLevel, details } = buildBookingPayload(formState, serviceType);
 *   const row = toSupabaseRow(topLevel, details);
 *   await supabase.from('bookings').insert(row);
 */
export function toSupabaseRow(
  topLevel: Record<string, unknown>,
  details: Record<string, unknown>,
  existingDetails?: Record<string, unknown>,
): Record<string, unknown> {
  const mergedDetails = existingDetails
    ? { ...existingDetails, ...details }  // preserve existing detail keys not in the current form
    : details;

  return { ...topLevel, details: mergedDetails };
}
