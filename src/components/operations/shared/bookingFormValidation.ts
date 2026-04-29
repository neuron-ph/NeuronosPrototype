import { getServiceSchema } from '../../../config/booking/bookingScreenSchema';
import {
  getVisibleSections,
  isFieldVisible,
  isFieldRequired,
} from '../../../config/booking/bookingVisibilityRules';
import type { BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import { profileValueToLabel } from '../../../utils/bookings/profileSerialize';

export type ValidationErrors = Record<string, string>;
export const MINIMAL_CREATE_REQUIRED_FIELDS = ['customer_name', 'booking_name'] as const;

interface ValidateBookingFormOptions {
  requiredFieldKeys?: readonly string[];
}

/**
 * Validates all visible required fields in the form state.
 * Fields that are invisible (per visibility rules) are never required.
 */
export function validateBookingForm(
  formState: Record<string, unknown>,
  serviceType: string,
  ctx: BookingFormContext,
  options: ValidateBookingFormOptions = {},
): ValidationErrors {
  const schema = getServiceSchema(serviceType);
  if (!schema) return {};

  const errors: ValidationErrors = {};
  const seen = new Set<string>();
  const requiredFieldOverride = options.requiredFieldKeys
    ? new Set(options.requiredFieldKeys)
    : null;

  for (const section of getVisibleSections(schema.sections, ctx)) {
    for (const field of section.fields) {
      if (seen.has(field.key)) continue;
      seen.add(field.key);

      // Skip team-assignment — handled by form shell
      if (field.control === 'team-assignment') continue;
      // Skip invisible fields — they are never required
      if (!isFieldVisible(field, ctx)) continue;
      const isRequired = requiredFieldOverride
        ? requiredFieldOverride.has(field.key)
        : isFieldRequired(field, ctx);
      if (!isRequired) continue;

      const val = formState[field.key];
      const isEmpty =
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (field.control === 'profile-lookup' && profileValueToLabel(val).trim().length === 0) ||
        (field.control === 'multi-profile-lookup' &&
          (!Array.isArray(val) ||
            val.every((item) => profileValueToLabel(item).trim().length === 0)));

      if (isEmpty) {
        errors[field.key] = `${field.label} is required`;
      }
    }
  }

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Returns only the error message for a single field key, or undefined. */
export function fieldError(errors: ValidationErrors, key: string): string | undefined {
  return errors[key];
}
