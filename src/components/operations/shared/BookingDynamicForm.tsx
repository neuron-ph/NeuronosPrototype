import React from 'react';
import { getVisibleSections } from '../../../config/booking/bookingVisibilityRules';
import { getServiceSchema } from '../../../config/booking/bookingScreenSchema';
import type { BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import type { ValidationErrors } from './bookingFormValidation';
import { groupBookingSections } from '../../../utils/bookings/groupBookingSections';
import { BookingSectionGroupCard } from './BookingSectionGroupCard';

interface Props {
  serviceType: string;
  formState: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  ctx: BookingFormContext;
  errors?: ValidationErrors;
  disabled?: boolean;
  resolvedOptions?: Record<string, string[]>;
  requiredFieldKeys?: readonly string[];
  /** Replace the rendered control for specific field keys (e.g. project_number contract picker). */
  fieldOverrides?: Record<string, React.ReactNode>;
}

/**
 * Renders all visible sections for a service type from the central booking schema,
 * grouped into General Information and Specific Booking Information.
 */
export function BookingDynamicForm({
  serviceType,
  formState,
  onChange,
  ctx,
  errors = {},
  disabled,
  resolvedOptions,
  requiredFieldKeys,
  fieldOverrides,
}: Props) {
  const schema = getServiceSchema(serviceType);

  if (!schema) return null;

  const visibleSections = getVisibleSections(schema.sections, ctx);
  const { generalSections, specificSections } = groupBookingSections(visibleSections);

  return (
    <>
      <BookingSectionGroupCard
        title="General Information"
        sections={generalSections}
        formState={formState}
        onChange={onChange}
        ctx={ctx}
        errors={errors}
        disabled={disabled}
        resolvedOptions={resolvedOptions}
        requiredFieldKeys={requiredFieldKeys}
        fieldOverrides={fieldOverrides}
      />

      <BookingSectionGroupCard
        title="Specific Booking Information"
        sections={specificSections}
        formState={formState}
        onChange={onChange}
        ctx={ctx}
        errors={errors}
        disabled={disabled}
        resolvedOptions={resolvedOptions}
        requiredFieldKeys={requiredFieldKeys}
        fieldOverrides={fieldOverrides}
      />
    </>
  );
}
