import { describe, expect, it } from 'vitest';
import { BOOKING_SCHEMA_MAP } from '../../config/booking/bookingScreenSchema';
import { getVisibleSections } from '../../config/booking/bookingVisibilityRules';
import type { BookingFormContext } from '../../config/booking/bookingFieldTypes';
import { groupBookingSections } from './groupBookingSections';

function ctx(overrides: Partial<BookingFormContext>): BookingFormContext {
  return {
    service_type: '',
    movement_type: '',
    mode: '',
    incoterms: '',
    status: '',
    ...overrides,
  };
}

describe('groupBookingSections', () => {
  it('groups Brokerage overview and general-specific sections into General Information', () => {
    const sections = getVisibleSections(
      BOOKING_SCHEMA_MAP.Brokerage.sections,
      ctx({ service_type: 'Brokerage', movement_type: 'Import', mode: 'FCL', status: 'Draft' }),
    );

    const grouped = groupBookingSections(sections);

    expect(grouped.generalSections.map(section => section.key)).toEqual([
      'general_information',
      'brokerage_general_specific',
    ]);
    expect(grouped.specificSections.map(section => section.key)).toContain('brokerage_details');
    expect(grouped.specificSections.map(section => section.key)).toContain('brokerage_fcl');
  });

  it('groups Trucking general-specific with General Information and keeps FCL details separate', () => {
    const sections = getVisibleSections(
      BOOKING_SCHEMA_MAP.Trucking.sections,
      ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL', status: 'Draft' }),
    );

    const grouped = groupBookingSections(sections);

    expect(grouped.generalSections.map(section => section.key)).toEqual([
      'general_information',
      'trucking_general_specific',
    ]);
    expect(grouped.specificSections.map(section => section.key)).toEqual([
      'trucking_delivery',
      'trucking_destinations',
      'trucking_fcl',
    ]);
  });
});
