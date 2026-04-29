import { describe, it, expect } from 'vitest';
import { getVisibleFields, getVisibleSections } from './bookingVisibilityRules';
import { BOOKING_SCHEMA_MAP } from './bookingScreenSchema';
import type { BookingFormContext } from './bookingFieldTypes';
import { validateBookingForm } from '../../components/operations/shared/bookingFormValidation';

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

describe('Brokerage import customs section', () => {
  it('is visible when movement_type = Import', () => {
    const sections = getVisibleSections(
      BOOKING_SCHEMA_MAP['Brokerage'].sections,
      ctx({ service_type: 'Brokerage', movement_type: 'Import', mode: 'FCL' }),
    );
    expect(sections.some(s => s.key === 'brokerage_import_customs')).toBe(true);
  });

  it('is hidden when movement_type = Export', () => {
    const sections = getVisibleSections(
      BOOKING_SCHEMA_MAP['Brokerage'].sections,
      ctx({ service_type: 'Brokerage', movement_type: 'Export', mode: 'FCL' }),
    );
    expect(sections.some(s => s.key === 'brokerage_import_customs')).toBe(false);
  });
});

describe('Brokerage FCL Export fields', () => {
  it('shows seal_numbers, tare_weight, vgm when mode = FCL and movement_type = Export', () => {
    const context = ctx({ service_type: 'Brokerage', movement_type: 'Export', mode: 'FCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, context);
    const fcl = sections.find(s => s.key === 'brokerage_fcl');
    expect(fcl).toBeDefined();
    const fields = getVisibleFields(fcl!, context);
    expect(fields.some(f => f.key === 'seal_numbers')).toBe(true);
    expect(fields.some(f => f.key === 'tare_weight')).toBe(true);
    expect(fields.some(f => f.key === 'vgm')).toBe(true);
  });

  it('hides seal_numbers, tare_weight, vgm when movement_type = Import', () => {
    const context = ctx({ service_type: 'Brokerage', movement_type: 'Import', mode: 'FCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, context);
    const fcl = sections.find(s => s.key === 'brokerage_fcl');
    expect(fcl).toBeDefined();
    const fields = getVisibleFields(fcl!, context);
    expect(fields.some(f => f.key === 'seal_numbers')).toBe(false);
    expect(fields.some(f => f.key === 'container_deposit')).toBe(true);
  });

  it('hides FCL section entirely when mode = LCL', () => {
    const sections = getVisibleSections(
      BOOKING_SCHEMA_MAP['Brokerage'].sections,
      ctx({ service_type: 'Brokerage', movement_type: 'Export', mode: 'LCL' }),
    );
    expect(sections.some(s => s.key === 'brokerage_fcl')).toBe(false);
  });
});

describe('Forwarding EXW collection address', () => {
  it('shows collection_address when incoterms = EXW', () => {
    const context = ctx({ service_type: 'Forwarding', movement_type: 'Export', mode: 'FCL', incoterms: 'EXW' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Forwarding'].sections, context);
    const incoterm = sections.find(s => s.key === 'forwarding_incoterm');
    expect(incoterm).toBeDefined();
    const fields = getVisibleFields(incoterm!, context);
    expect(fields.some(f => f.key === 'collection_address')).toBe(true);
    expect(fields.some(f => f.key === 'delivery_address')).toBe(false);
  });
});

describe('Forwarding DAP/DDU/DDP delivery address', () => {
  it.each(['DAP', 'DDU', 'DDP'])('shows delivery_address when incoterms = %s', (incoterm) => {
    const context = ctx({ service_type: 'Forwarding', movement_type: 'Export', mode: 'FCL', incoterms: incoterm });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Forwarding'].sections, context);
    const incoSection = sections.find(s => s.key === 'forwarding_incoterm');
    expect(incoSection).toBeDefined();
    const fields = getVisibleFields(incoSection!, context);
    expect(fields.some(f => f.key === 'delivery_address')).toBe(true);
    expect(fields.some(f => f.key === 'collection_address')).toBe(false);
  });

  it('shows neither when incoterms = FOB', () => {
    const context = ctx({ service_type: 'Forwarding', movement_type: 'Export', mode: 'FCL', incoterms: 'FOB' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Forwarding'].sections, context);
    const incoSection = sections.find(s => s.key === 'forwarding_incoterm');
    const fields = getVisibleFields(incoSection!, context);
    expect(fields.some(f => f.key === 'delivery_address')).toBe(false);
    expect(fields.some(f => f.key === 'collection_address')).toBe(false);
  });
});

describe('Trucking Empty Return date fields', () => {
  it('shows date_delivered and date_empty_return when status = Empty Return', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL', status: 'Empty Return' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    const delivery = sections.find(s => s.key === 'trucking_delivery');
    expect(delivery).toBeDefined();
    const fields = getVisibleFields(delivery!, context);
    expect(fields.some(f => f.key === 'date_delivered')).toBe(true);
    expect(fields.some(f => f.key === 'date_empty_return')).toBe(true);
  });

  it('shows date_delivered but not date_empty_return when status = Delivered', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL', status: 'Delivered' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    const delivery = sections.find(s => s.key === 'trucking_delivery');
    const fields = getVisibleFields(delivery!, context);
    expect(fields.some(f => f.key === 'date_delivered')).toBe(true);
    expect(fields.some(f => f.key === 'date_empty_return')).toBe(false);
  });

  it('shows date_delivered even when status = Draft, but keeps date_empty_return hidden', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL', status: 'Draft' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    const delivery = sections.find(s => s.key === 'trucking_delivery');
    const fields = getVisibleFields(delivery!, context);
    expect(fields.some(f => f.key === 'date_delivered')).toBe(true);
    expect(fields.some(f => f.key === 'date_empty_return')).toBe(false);
  });
});

describe('Marine Insurance date_issued', () => {
  it('shows date_issued when status = Issued', () => {
    const context = ctx({ service_type: 'Marine Insurance', status: 'Issued' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Marine Insurance'].sections, context);
    const policy = sections.find(s => s.key === 'marine_policy');
    expect(policy).toBeDefined();
    const fields = getVisibleFields(policy!, context);
    expect(fields.some(f => f.key === 'date_issued')).toBe(true);
  });

  it('shows date_issued when status = Billed or Paid', () => {
    for (const status of ['Billed', 'Paid']) {
      const context = ctx({ service_type: 'Marine Insurance', status });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Marine Insurance'].sections, context);
      const policy = sections.find(s => s.key === 'marine_policy');
      const fields = getVisibleFields(policy!, context);
      expect(fields.some(f => f.key === 'date_issued')).toBe(true);
    }
  });

  it('hides date_issued when status = Draft or Ongoing', () => {
    for (const status of ['Draft', 'Ongoing']) {
      const context = ctx({ service_type: 'Marine Insurance', status });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Marine Insurance'].sections, context);
      const policy = sections.find(s => s.key === 'marine_policy');
      const fields = getVisibleFields(policy!, context);
      expect(fields.some(f => f.key === 'date_issued')).toBe(false);
    }
  });
});

describe('Shared General Information', () => {
  it('hides quotation_reference_number for Trucking', () => {
    const context = ctx({ service_type: 'Trucking', mode: 'LCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    const general = sections.find(s => s.key === 'general_information');
    expect(general).toBeDefined();
    const fields = getVisibleFields(general!, context);
    expect(fields.some(f => f.key === 'quotation_reference_number')).toBe(false);
  });

  it('shows quotation_reference_number for Brokerage', () => {
    const context = ctx({ service_type: 'Brokerage' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, context);
    const general = sections.find(s => s.key === 'general_information');
    const fields = getVisibleFields(general!, context);
    expect(fields.some(f => f.key === 'quotation_reference_number')).toBe(true);
  });

  it('does not show account_handler in shared general information', () => {
    for (const st of ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'account_handler')).toBe(false);
    }
  });

  it('shows Service/s before a full-width Booking Name for Brokerage', () => {
    const context = ctx({ service_type: 'Brokerage' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, context);
    const general = sections.find(s => s.key === 'general_information');
    const fields = getVisibleFields(general!, context);
    const servicesIndex = fields.findIndex(f => f.key === 'services');
    const bookingNameIndex = fields.findIndex(f => f.key === 'booking_name');

    expect(servicesIndex).toBeGreaterThan(-1);
    expect(bookingNameIndex).toBeGreaterThan(-1);
    expect(servicesIndex).toBeLessThan(bookingNameIndex);
    expect(fields[servicesIndex]?.gridSpan).toBe(1);
    expect(fields[bookingNameIndex]?.gridSpan).toBe(3);
  });

  it('uses the fixed five-service options for every Service/s selector', () => {
    const brokerageContext = ctx({ service_type: 'Brokerage' });
    const brokerageSections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, brokerageContext);
    const brokerageGeneral = brokerageSections.find(s => s.key === 'general_information');
    const brokerageServices = getVisibleFields(brokerageGeneral!, brokerageContext).find(f => f.key === 'services');

    expect(brokerageServices?.control).toBe('multi-select');
    expect(brokerageServices?.optionKey).toBe('operation_services');

    for (const st of ['Trucking', 'Marine Insurance', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const serviceField = sections
        .flatMap(section => getVisibleFields(section, context))
        .find(field => field.key === 'service');

      expect(serviceField?.control).toBe('multi-select');
      expect(serviceField?.optionKey).toBe('operation_services');
    }
  });

  it('uses manual multi-value entry for Sub-Service/s fields', () => {
    for (const st of ['Brokerage', 'Forwarding'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const subServicesField = sections
        .flatMap(section => getVisibleFields(section, context))
        .find(field => field.key === 'sub_services');

      expect(subServicesField?.control).toBe('multi-value');
      expect(subServicesField?.profileType).toBeUndefined();
    }
  });

  it('shows movement_type for Brokerage, Forwarding, Trucking (matrix: BR=Yes FWD=Yes TKG=Yes)', () => {
    for (const st of ['Brokerage', 'Forwarding', 'Trucking'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'movement_type')).toBe(true);
    }
  });

  it('hides movement_type for Marine Insurance and Others (matrix: MI=No OT=No)', () => {
    for (const st of ['Marine Insurance', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'movement_type')).toBe(false);
    }
  });

  it('shows consignee in GI for all five services (matrix: all=Yes)', () => {
    for (const st of ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'consignee')).toBe(true);
    }
  });

  it('shows customs_entry in GI for Brokerage and Forwarding only (matrix: BR=Yes FWD=Yes TKG=No MI=No OT=No)', () => {
    for (const st of ['Brokerage', 'Forwarding'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'customs_entry')).toBe(true);
    }
    for (const st of ['Trucking', 'Marine Insurance', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'customs_entry')).toBe(false);
    }
  });

  it('shows customs_entry_procedure in GI for BR, FWD, TKG (matrix: Yes for those three)', () => {
    for (const st of ['Brokerage', 'Forwarding', 'Trucking'] as const) {
      const context = ctx({ service_type: st, mode: st === 'Trucking' ? 'LCL' : 'FCL' });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'customs_entry_procedure')).toBe(true);
    }
  });

  it('shows overseas_agent in GI for FWD and MI only (matrix: FWD=Yes MI=Yes others=No)', () => {
    for (const st of ['Forwarding', 'Marine Insurance'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'overseas_agent')).toBe(true);
    }
    for (const st of ['Brokerage', 'Trucking', 'Others'] as const) {
      const context = ctx({ service_type: st });
      const sections = getVisibleSections(BOOKING_SCHEMA_MAP[st].sections, context);
      const general = sections.find(s => s.key === 'general_information');
      const fields = getVisibleFields(general!, context);
      expect(fields.some(f => f.key === 'overseas_agent')).toBe(false);
    }
  });

  it('treats matrix-Yes GI fields as required for Brokerage', () => {
    const context = ctx({ service_type: 'Brokerage' });
    const errors = validateBookingForm({ service_type: 'Brokerage', status: 'Draft' }, 'Brokerage', context);
    expect(errors.account_owner).toBeDefined();
    expect(errors.project_number).toBeDefined();
    expect(errors.team_assignment).toBeUndefined(); // team-assignment handled by form shell
    expect(errors.consignee).toBeDefined();
    expect(errors.customs_entry).toBeDefined();
    expect(errors.customs_entry_procedure).toBeDefined();
  });

  it('treats matrix-Yes GI agent fields as required for Forwarding', () => {
    const context = ctx({ service_type: 'Forwarding' });
    const errors = validateBookingForm({ service_type: 'Forwarding', status: 'Draft' }, 'Forwarding', context);
    expect(errors.overseas_agent).toBeDefined();
    expect(errors.local_agent).toBeDefined();
  });

  it('shows the trucking FCL section only when mode = FCL', () => {
    const fclContext = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL', status: 'Draft' });
    const fclSections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, fclContext);
    expect(fclSections.some(s => s.key === 'trucking_fcl')).toBe(true);

    const lclContext = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'LCL', status: 'Draft' });
    const lclSections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, lclContext);
    expect(lclSections.some(s => s.key === 'trucking_fcl')).toBe(false);
  });
});
