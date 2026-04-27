import { useState, useCallback } from 'react';
import type { BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import {
  mergeBookingRecord,
  normalizeDetails,
  normalizeTopLevelFields,
} from '../../../utils/bookings/bookingDetailsCompat';
import { getServiceSchema } from '../../../config/booking/bookingScreenSchema';
import { hydrateProfileValue, hydrateProfileValueArray } from '../../../utils/bookings/profileSerialize';

export type FormState = Record<string, unknown>;

export function useBookingFormState(serviceType: string, seed?: FormState) {
  const [formState, setFormState] = useState<FormState>({
    service_type: serviceType,
    status: 'Draft',
    movement_type: '',
    mode: '',
    incoterms: '',
    ...seed,
  });

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
    const normalized = normalizeTopLevelFields(
      normalizeDetails(prefill as Record<string, unknown>, serviceType),
    );
    setFormState(prev => ({ ...prev, ...normalized }));
  }, [serviceType]);

  const context: BookingFormContext = {
    service_type: String(formState.service_type ?? serviceType),
    movement_type: String(formState.movement_type ?? ''),
    mode: String(formState.mode ?? ''),
    incoterms: String(formState.incoterms ?? ''),
    status: String(formState.status ?? ''),
  };

  return { formState, setField, setFields, initFromRecord, initFromPrefill, context };
}
