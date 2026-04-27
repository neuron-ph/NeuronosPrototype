import React from 'react';
import { getVisibleSections } from '../../../config/booking/bookingVisibilityRules';
import { getServiceSchema } from '../../../config/booking/bookingScreenSchema';
import type { BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import type { ValidationErrors } from './bookingFormValidation';
import { useBookingServiceOptions } from '../../../hooks/useBookingServiceOptions';
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
}

/**
 * Renders all visible sections for a service type from the central booking schema,
 * grouped into General Information and Specific Booking Information.
 * Fetches DB-backed service/sub-service catalog options and injects them into each section.
 */
export function BookingDynamicForm({
  serviceType,
  formState,
  onChange,
  ctx,
  errors = {},
  disabled,
  resolvedOptions,
}: Props) {
  const schema = getServiceSchema(serviceType);
  const { services, subServices } = useBookingServiceOptions(serviceType);

  // Merge DB-backed catalog options with any caller-provided resolvedOptions
  const catalogOptions: Record<string, string[]> = {
    ...(resolvedOptions ?? {}),
    ...(services.length > 0 ? { service_catalog: services } : {}),
    ...(subServices.length > 0 ? { sub_service_catalog: subServices } : {}),
  };

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
        catalogOptions={catalogOptions}
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
        catalogOptions={catalogOptions}
      />
    </>
  );
}
