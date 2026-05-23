import { useState, useCallback } from 'react';
import type { BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import {
  mergeBookingRecord,
  normalizeDetails,
  normalizeTopLevelFields,
} from '../../../utils/bookings/bookingDetailsCompat';
import { getServiceSchema } from '../../../config/booking/bookingScreenSchema';
import { hydrateProfileValue, hydrateProfileValueArray } from '../../../utils/bookings/profileSerialize';
import { getSelectedCustomer } from '../../../utils/bookings/selectedCustomer';

export type FormState = Record<string, unknown>;

// Keys that should never enter formState — they're constraints/hints carried
// alongside the booking but not part of the booking row itself.
const NON_PERSISTED_PREFILL_KEYS = new Set(['pol_options', 'pod_options']);

function splitPrefill(prefill: FormState): { persisted: FormState; constraints: FormState } {
  const persisted: FormState = {};
  const constraints: FormState = {};
  for (const [key, value] of Object.entries(prefill)) {
    if (NON_PERSISTED_PREFILL_KEYS.has(key)) {
      constraints[key] = value;
    } else {
      persisted[key] = value;
    }
  }
  return { persisted, constraints };
}

export function useBookingFormState(serviceType: string, seed?: FormState) {
  const { persisted: seedPersisted, constraints: seedConstraints } = splitPrefill(seed ?? {});
  const [formState, setFormState] = useState<FormState>({
    service_type: serviceType,
    status: 'Draft',
    movement_type: '',
    mode: '',
    incoterms: '',
    ...seedPersisted,
  });
  // Held outside formState so it never ends up persisted to the booking row.
  const [constraints, setConstraints] = useState<FormState>(seedConstraints);

  const setField = useCallback((key: string, value: unknown) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  }, []);

  const setFields = useCallback((fields: FormState) => {
    setFormState(prev => ({ ...prev, ...fields }));
  }, []);

  // Pre-fill from a raw Supabase booking row (normalizes legacy camelCase keys + uppercase movement)
  // Also hydrates profile-lookup fields into ProfileSelectionValue so the combobox receives
  // the correct shape instead of a plain string.
  const initFromRecord = useCallback((raw: Record<string, unknown>) => {
    const merged = normalizeTopLevelFields(mergeBookingRecord(raw, serviceType));
    const schema = getServiceSchema(serviceType);
    if (schema) {
      // Reverse-hydrate fields whose value lives under a different column name
      // (e.g. booking_name → row.name). Without this, the form field reads
      // formState[field.key] and finds undefined for any field with storageKey.
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (!field.storageKey || field.storageKey === field.key) continue;
          if (merged[field.key] === undefined && merged[field.storageKey] !== undefined) {
            merged[field.key] = merged[field.storageKey];
          }
        }
      }
      // Coerce legacy string[] values for repeater fields into row objects keyed
      // by the first repeater column. Lets old container_numbers data render in
      // the new per-container repeater (Brokerage delivery-address-per-container).
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (field.control !== 'repeater' || !field.repeaterColumns?.length) continue;
          const val = merged[field.key];
          if (Array.isArray(val) && val.length > 0 && val.every(v => typeof v === 'string')) {
            const firstKey = field.repeaterColumns[0].key;
            merged[field.key] = (val as string[]).map(s => ({ [firstKey]: s }));
          }
        }
      }
      const seen = new Set<string>();
      const details = (raw.details as Record<string, unknown>) ?? {};
      for (const section of schema.sections) {
        for (const field of section.fields) {
          if (seen.has(field.key)) continue;
          if (field.control !== 'profile-lookup' && field.control !== 'multi-profile-lookup') continue;
          seen.add(field.key);
          const snapshotKey = field.storageKey ?? field.key;
          const rawVal = merged[snapshotKey] ?? merged[field.key];
          if (field.control === 'multi-profile-lookup') {
            merged[field.key] = hydrateProfileValueArray(rawVal, details, field.key, field.profileType ?? '');
          } else {
            merged[field.key] = hydrateProfileValue(rawVal, details, field.key, field.profileType ?? '');
          }
          // Also write to storageKey if different so top-level fields resolve correctly
          if (field.storageKey && field.storageKey !== field.key) {
            merged[field.storageKey] = merged[field.key];
          }
        }
      }
    }
    setFormState(merged);
  }, [serviceType]);

  // Pre-fill from a flat prefill object (e.g. from project autofill — normalizes legacy keys + field aliases)
  const initFromPrefill = useCallback((prefill: FormState) => {
    const { persisted, constraints: prefillConstraints } = splitPrefill(prefill);
    const normalized = normalizeTopLevelFields(
      normalizeDetails(persisted as Record<string, unknown>, serviceType),
    );
    setFormState(prev => ({ ...prev, ...normalized }));
    if (Object.keys(prefillConstraints).length > 0) {
      setConstraints(prev => ({ ...prev, ...prefillConstraints }));
    }
  }, [serviceType]);

  // The customer field on bookings is a profile-lookup, so its value is a
  // ProfileSelectionValue (object), not a plain string. Resolve both id and
  // display name once, then expose them on the context so per-customer
  // lookups (like the consignee picker) can scope correctly.
  const selectedCustomer = getSelectedCustomer(formState);

  const polOptions = Array.isArray(constraints.pol_options) ? (constraints.pol_options as string[]) : undefined;
  const podOptions = Array.isArray(constraints.pod_options) ? (constraints.pod_options as string[]) : undefined;

  const context: BookingFormContext = {
    service_type: String(formState.service_type ?? serviceType),
    movement_type: String(formState.movement_type ?? ''),
    mode: String(formState.mode ?? ''),
    incoterms: String(formState.incoterms ?? ''),
    status: String(formState.status ?? ''),
    type_of_package: String(formState.type_of_package ?? ''),
    customer_id: selectedCustomer.customerId,
    customer_name: selectedCustomer.customerName || null,
    pol_options: polOptions,
    pod_options: podOptions,
  };

  // Imperative setter for non-persisted constraints (e.g. contract-detected
  // POL/POD allowed lists on ad-hoc bookings). Pass `null`/empty arrays to
  // clear a specific constraint.
  const setConstraint = useCallback((key: 'pol_options' | 'pod_options', value: string[] | null) => {
    setConstraints(prev => ({ ...prev, [key]: value && value.length > 0 ? value : undefined }));
  }, []);

  return { formState, setField, setFields, initFromRecord, initFromPrefill, context, setConstraint };
}
