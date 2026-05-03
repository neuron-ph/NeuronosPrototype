/**
 * Phase 11 integration tests — verifies the full create/display flow:
 * - Autofill normalization (project autofill → initFromPrefill → snake_case formState)
 * - Payload split (formState → buildBookingPayload → top-level + details)
 * - Display normalization (raw DB row → normalizeBookingForDisplay → all keys present)
 * - Status options (service-specific status lists)
 * - Visibility rules for all 5 services in key scenarios
 */

import { describe, it, expect } from 'vitest';
import { normalizeDetails, normalizeBookingForDisplay } from './bookingDetailsCompat';
import { buildBookingPayload, toSupabaseRow } from './bookingPayload';
import { getStatusOptions } from '../../config/booking/bookingFieldOptions';
import { getVisibleSections, getVisibleFields, isFieldRequired } from '../../config/booking/bookingVisibilityRules';
import { BOOKING_SCHEMA_MAP } from '../../config/booking/bookingScreenSchema';
import type { BookingFormContext } from '../../config/booking/bookingFieldTypes';

function ctx(overrides: Partial<BookingFormContext>): BookingFormContext {
  return { service_type: '', movement_type: '', mode: '', incoterms: '', status: '', ...overrides };
}

// ---------------------------------------------------------------------------
// Autofill normalization
// ---------------------------------------------------------------------------

describe('autofill normalization via normalizeDetails', () => {
  it('maps autofillForwardingFromProject keys to schema keys', () => {
    const autofillData = {
      name: 'FWD Shipment',
      projectNumber: 'PRJ-001',
      customerName: 'Acme Corp',
      movement: 'Import',
      quotationReferenceNumber: 'QUO-001',
      aolPol: 'PHMNL',
      aodPod: 'CNSHA',
      grossWeight: '1500',
      cargoType: 'Dry',
      commodityDescription: 'Electronics',
      preferentialTreatment: 'Form E',
    };
    const normalized = normalizeDetails(autofillData, 'Forwarding');
    expect(normalized.booking_name).toBe('FWD Shipment');
    expect(normalized.project_number).toBe('PRJ-001');
    expect(normalized.customer_name).toBe('Acme Corp');
    expect(normalized.movement_type).toBe('Import');
    expect(normalized.quotation_reference_number).toBe('QUO-001');
    expect(normalized.pol_aol).toBe('PHMNL');
    expect(normalized.pod_aod).toBe('CNSHA');
    expect(normalized.gross_weight).toBe('1500');
    expect(normalized.cargo_type).toBe('Dry');
    expect(normalized.commodity_description).toBe('Electronics');
    expect(normalized.preferential_treatment).toBe('Form E');
  });

  it('maps autofillTruckingFromProject keys', () => {
    const autofillData = {
      name: 'Trucking Run',
      customerName: 'Logistics PH',
      movement: 'Import',
      pullOutLocation: 'MICP Port',
      truckType: '20ft',
      deliveryAddress: '123 Warehouse Rd',
    };
    const normalized = normalizeDetails(autofillData, 'Trucking');
    expect(normalized.booking_name).toBe('Trucking Run');
    expect(normalized.pull_out_location).toBe('MICP Port');
    expect(normalized.truck_type).toBe('20ft');
    expect(normalized.delivery_address).toBe('123 Warehouse Rd');
  });

  it('maps autofillMarineInsuranceFromProject keys', () => {
    const autofillData = {
      name: 'Marine Policy',
      customerName: 'Pacific Freight',
      commodityDescription: 'Steel coils',
      vesselName: 'MV Pacific Star',
      estimatedDeparture: '2026-06-01',
      estimatedArrival: '2026-06-15',
    };
    const normalized = normalizeDetails(autofillData, 'Marine Insurance');
    expect(normalized.booking_name).toBe('Marine Policy');
    expect(normalized.commodity_description).toBe('Steel coils');
    expect(normalized.vessel).toBe('MV Pacific Star');
    expect(normalized.etd).toBe('2026-06-01');
    expect(normalized.eta).toBe('2026-06-15');
  });
});

// ---------------------------------------------------------------------------
// Payload split — all 5 services
// ---------------------------------------------------------------------------

describe('buildBookingPayload — correct top-level vs details split', () => {
  it('Forwarding: mode goes to topLevel, commodity_description goes to details', () => {
    const state = {
      service_type: 'Forwarding',
      booking_name: 'FWD Test',
      customer_name: 'Corp A',
      status: 'Draft',
      movement_type: 'Import',
      mode: 'FCL',
      commodity_description: 'Frozen tuna',
      pol_aol: 'CNSHA',
    };
    const { topLevel, details } = buildBookingPayload(state, 'Forwarding');
    expect(topLevel.name).toBe('FWD Test');
    expect(topLevel.customer_name).toBe('Corp A');
    expect(topLevel.mode).toBe('FCL');
    expect(topLevel.movement_type).toBe('Import');
    expect(details.commodity_description).toBe('Frozen tuna');
    expect(details.pol_aol).toBe('CNSHA');
    expect(details.mode).toBeUndefined(); // mode is top-level, not in details
  });

  it('Marine Insurance: amount_insured saved in details, status in topLevel', () => {
    const state = {
      service_type: 'Marine Insurance',
      booking_name: 'Marine Pol',
      customer_name: 'Corp B',
      status: 'Ongoing',
      amount_insured: 2000000,
      insurer: 'PH Insurer',
    };
    const { topLevel, details } = buildBookingPayload(state, 'Marine Insurance');
    expect(topLevel.status).toBe('Ongoing');
    expect(details.amount_insured).toBe(2000000);
    expect(details.insurer).toBe('PH Insurer');
  });

  it('Others: service_description saved in details', () => {
    const state = {
      service_type: 'Others',
      booking_name: 'Misc',
      customer_name: 'Corp C',
      status: 'Draft',
      service_description: 'Customs documentation only',
    };
    const { topLevel, details } = buildBookingPayload(state, 'Others');
    expect(topLevel.status).toBe('Draft');
    expect(details.service_description).toBe('Customs documentation only');
  });
});

// ---------------------------------------------------------------------------
// Display normalization — bidirectional
// ---------------------------------------------------------------------------

describe('normalizeBookingForDisplay — bidirectional aliases', () => {
  it('new snake_case record: creates camelCase aliases for old detail views', () => {
    const rawNewRecord = {
      id: 'booking-1',
      service_type: 'Forwarding',
      customer_name: 'Corp X',
      movement_type: 'Import',
      created_at: '2026-04-26T10:00:00Z',
      details: {
        mbl_mawb: 'MBL-999',
        commodity_description: 'Coffee beans',
        account_owner: 'Alice',
      },
    };
    const display = normalizeBookingForDisplay(rawNewRecord);
    // snake_case keys present
    expect(display.customer_name).toBe('Corp X');
    expect(display.mbl_mawb).toBe('MBL-999');
    expect(display.commodity_description).toBe('Coffee beans');
    // reverse aliases for old detail views
    expect(display.customerName).toBe('Corp X');
    expect(display.movement).toBe('Import');
    expect(display.bookingId).toBe('booking-1');
    expect(display.serviceType).toBe('Forwarding');
    expect(display.createdAt).toBe('2026-04-26T10:00:00Z');
    expect(display.mblMawb).toBe('MBL-999');
    expect(display.commodityDescription).toBe('Coffee beans');
    expect(display.accountOwner).toBe('Alice');
  });

  it('old camelCase record: normalizes to snake_case and keeps camelCase aliases', () => {
    const rawOldRecord = {
      id: 'booking-2',
      service_type: 'Brokerage',
      customer_name: 'Corp Y',
      movement_type: 'EXPORT',
      details: {
        mblMawb: 'MBL-OLD',
        accountOwner: 'Bob',
        registryNumber: 'REG-001',
      },
    };
    const display = normalizeBookingForDisplay(rawOldRecord);
    // Should normalize uppercase movement
    expect(display.movement_type).toBe('Export');
    expect(display.movement).toBe('Export');
    // Should normalize camelCase details
    expect(display.mbl_mawb).toBe('MBL-OLD');
    expect(display.account_owner).toBe('Bob');
    expect(display.registry_number).toBe('REG-001');
    // Should preserve camelCase too
    expect(display.mblMawb).toBe('MBL-OLD');
    expect(display.accountOwner).toBe('Bob');
  });

  it('normalizes legacy customsEntryProcedureCode into shared customs_entry_procedure', () => {
    const rawOldRecord = {
      service_type: 'Forwarding',
      details: {
        customsEntryProcedureCode: 'Consumption',
      },
    };
    const display = normalizeBookingForDisplay(rawOldRecord, 'Forwarding');
    expect(display.customs_entry_procedure).toBe('Consumption');
    expect(display.customsEntryProcedureCode).toBe('Consumption');
  });

  it('does not reinterpret brokerage_fee_net_of_vat as brokerage_fee_sad', () => {
    const rawOldRecord = {
      service_type: 'Brokerage',
      details: {
        brokerage_fee_net_of_vat: 1500,
      },
    };
    const display = normalizeBookingForDisplay(rawOldRecord, 'Brokerage');
    expect(display.brokerage_fee_net_of_vat).toBe(1500);
    expect(display.brokerage_fee_sad).toBeUndefined();
  });

  it('normalizes AIR mode from old records', () => {
    const raw = { service_type: 'Forwarding', mode: 'AIR', details: {} };
    const display = normalizeBookingForDisplay(raw);
    expect(display.mode).toBe('Air Freight');
  });
});

// ---------------------------------------------------------------------------
// Service-specific status options
// ---------------------------------------------------------------------------

describe('status options are service-specific', () => {
  it('Brokerage has Waiting for Arrival and Audited', () => {
    const opts = getStatusOptions('Brokerage');
    expect(opts).toContain('Waiting for Arrival');
    expect(opts).toContain('Audited');
    expect(opts).not.toContain('Liquidated');
  });

  it('Trucking has Empty Return and Liquidated', () => {
    const opts = getStatusOptions('Trucking');
    expect(opts).toContain('Empty Return');
    expect(opts).toContain('Liquidated');
    expect(opts).not.toContain('Waiting for Arrival');
  });

  it('Marine Insurance has Issued', () => {
    const opts = getStatusOptions('Marine Insurance');
    expect(opts).toContain('Issued');
    expect(opts).not.toContain('In Transit');
  });

  it('Forwarding has In Transit', () => {
    const opts = getStatusOptions('Forwarding');
    expect(opts).toContain('In Transit');
    expect(opts).not.toContain('Issued');
  });
});

// ---------------------------------------------------------------------------
// Full visibility checks for all 5 services
// ---------------------------------------------------------------------------

describe('schema visibility — all 5 services have General Information section', () => {
  const services = ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'] as const;
  for (const svc of services) {
    it(`${svc} renders general_information section`, () => {
      const context = ctx({ service_type: svc });
      const schema = BOOKING_SCHEMA_MAP[svc];
      const sections = getVisibleSections(schema.sections, context);
      expect(sections.some(s => s.key === 'general_information')).toBe(true);
    });
  }
});

describe('schema visibility — General Specific sections appear for each service', () => {
  const SPECIFIC_SECTIONS: Record<string, string> = {
    Brokerage: 'brokerage_general_specific',
    Forwarding: 'forwarding_general_specific',
    Trucking: 'trucking_general_specific',
    'Marine Insurance': 'marine_general_specific',
    Others: 'others_general_specific',
  };

  for (const [svc, sectionKey] of Object.entries(SPECIFIC_SECTIONS)) {
    it(`${svc} renders its general specific section`, () => {
      const context = ctx({ service_type: svc });
      const schema = BOOKING_SCHEMA_MAP[svc as never];
      const sections = getVisibleSections(schema.sections, context);
      expect(sections.some(s => s.key === sectionKey)).toBe(true);
    });
  }
});

describe('schema visibility — conditional sections', () => {
  it('Brokerage FCL section hidden when mode = LCL', () => {
    const context = ctx({ service_type: 'Brokerage', mode: 'LCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Brokerage'].sections, context);
    expect(sections.some(s => s.key === 'brokerage_fcl')).toBe(false);
    expect(sections.some(s => s.key === 'brokerage_lcl')).toBe(true);
  });

  it('Forwarding Air section visible when mode = Air Freight', () => {
    const context = ctx({ service_type: 'Forwarding', mode: 'Air Freight' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Forwarding'].sections, context);
    expect(sections.some(s => s.key === 'forwarding_air')).toBe(true);
    expect(sections.some(s => s.key === 'forwarding_fcl')).toBe(false);
  });

  it('Trucking FCL section hidden when mode = LCL', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Domestic', mode: 'LCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    expect(sections.some(s => s.key === 'trucking_fcl')).toBe(false);
  });

  it('Trucking FCL section visible when mode = FCL', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'FCL' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Trucking'].sections, context);
    expect(sections.some(s => s.key === 'trucking_fcl')).toBe(true);
  });

  it('Marine Insurance optional internal always visible', () => {
    const context = ctx({ service_type: 'Marine Insurance', status: 'Draft' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Marine Insurance'].sections, context);
    expect(sections.some(s => s.key === 'marine_optional_internal')).toBe(true);
  });

  it('Others optional internal always visible', () => {
    const context = ctx({ service_type: 'Others', status: 'Draft' });
    const sections = getVisibleSections(BOOKING_SCHEMA_MAP['Others'].sections, context);
    expect(sections.some(s => s.key === 'others_optional_internal')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Minimal create validation — no required field should block a manual booking
// ---------------------------------------------------------------------------

function getRequiredFieldKeys(serviceType: string, context: BookingFormContext): string[] {
  const schema = BOOKING_SCHEMA_MAP[serviceType as never];
  const required: string[] = [];
  const seen = new Set<string>();
  for (const section of getVisibleSections(schema.sections, context)) {
    for (const field of getVisibleFields(section, context)) {
      if (seen.has(field.key) || field.control === 'team-assignment') continue;
      seen.add(field.key);
      if (isFieldRequired(field, context)) required.push(field.key);
    }
  }
  return required;
}

// Matrix-first rule: generated fields stay optional, but matrix-Yes GI fields
// like account_owner and project_number are now required.
describe('generated fields remain optional while matrix GI fields may be required', () => {
  const NEVER_REQUIRED_KEYS = [
    'booking_number',
    'quotation_reference_number',
    'account_handler',
    'services',
    'service',
    'service_type',
  ];

  const services = ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'] as const;
  for (const svc of services) {
    it(`${svc}: generated/lineage/catalog fields not required`, () => {
      const context = ctx({ service_type: svc, movement_type: 'Import', mode: 'FCL', status: 'Draft' });
      const required = getRequiredFieldKeys(svc, context);
      for (const key of NEVER_REQUIRED_KEYS) {
        expect(required, `${key} must not be required for ${svc}`).not.toContain(key);
      }
    });
  }
});

describe('minimal create validation — matrix-required GI fields are enforced', () => {
  it('Brokerage: matrix GI fields are required; generated ids remain optional', () => {
    const context = ctx({ service_type: 'Brokerage', mode: 'FCL', status: 'Draft' });
    const allRequired = getRequiredFieldKeys('Brokerage', context);
    expect(allRequired).toContain('customer_name');
    expect(allRequired).toContain('status');
    expect(allRequired).toContain('account_owner');
    expect(allRequired).toContain('project_number');
    expect(allRequired).toContain('consignee');
    expect(allRequired).toContain('customs_entry');
    expect(allRequired).toContain('customs_entry_procedure');
    expect(allRequired).not.toContain('booking_name');
    expect(allRequired).not.toContain('booking_number');
    expect(allRequired).not.toContain('quotation_reference_number');
    expect(allRequired).not.toContain('account_handler');
    expect(allRequired).not.toContain('services');
  });

  it('Forwarding: pol_aol and pod_aod are required (spec says Yes), others not blocking on create', () => {
    const context = ctx({ service_type: 'Forwarding', mode: 'FCL', status: 'Draft' });
    const allRequired = getRequiredFieldKeys('Forwarding', context);
    expect(allRequired).toContain('customer_name');
    // pol_aol and pod_aod are 'yes' in Forwarding per spec
    expect(allRequired).toContain('pol_aol');
    expect(allRequired).toContain('pod_aod');
    // lineage/generated and optional booking_name not required
    expect(allRequired).not.toContain('booking_name');
    expect(allRequired).not.toContain('booking_number');
    expect(allRequired).not.toContain('quotation_reference_number');
  });

  it('Trucking: mode, truck_type, consignee, pickup, destinations, delivery details, and date_delivered are required', () => {
    const context = ctx({ service_type: 'Trucking', movement_type: 'Import', mode: 'LCL', status: 'Draft' });
    const allRequired = getRequiredFieldKeys('Trucking', context);
    expect(allRequired).toContain('mode');
    expect(allRequired).toContain('truck_type');
    expect(allRequired).toContain('consignee');
    expect(allRequired).toContain('pull_out_location');
    expect(allRequired).toContain('trucking_line_items');
    expect(allRequired).toContain('delivery_address');
    expect(allRequired).toContain('delivery_instructions');
    expect(allRequired).toContain('date_delivered');
    expect(allRequired).not.toContain('booking_number');
    expect(allRequired).not.toContain('service'); // catalog not wired yet
  });

  it('Marine Insurance: shipper, consignee, bl_awb_number, amount_insured, insurer required', () => {
    const context = ctx({ service_type: 'Marine Insurance', status: 'Draft' });
    const allRequired = getRequiredFieldKeys('Marine Insurance', context);
    expect(allRequired).toContain('shipper');
    expect(allRequired).toContain('consignee');
    expect(allRequired).toContain('bl_awb_number');
    expect(allRequired).toContain('amount_insured');
    expect(allRequired).toContain('insurer');
    expect(allRequired).not.toContain('service');
  });

  it('Others: service_description required', () => {
    const context = ctx({ service_type: 'Others', status: 'Draft' });
    const allRequired = getRequiredFieldKeys('Others', context);
    expect(allRequired).toContain('service_description');
    expect(allRequired).not.toContain('service');
  });
});

// ---------------------------------------------------------------------------
// Compat fixes
// ---------------------------------------------------------------------------

describe('compat fix — cyFee mapping', () => {
  it('old cyFee normalizes to cy_fee', () => {
    const result = normalizeDetails({ cyFee: 'Yes' }, 'Trucking');
    expect(result.cy_fee).toBe('Yes');
  });
});

describe('compat fix — Trucking emptyReturn maps to empty_return_date (FCL field)', () => {
  it('old Trucking emptyReturn maps to empty_return_date, not date_empty_return', () => {
    const result = normalizeDetails({ emptyReturn: '2026-06-15' }, 'Trucking');
    expect(result.empty_return_date).toBe('2026-06-15');
    expect(result.date_empty_return).toBeUndefined();
  });
});

describe('compat fix — no duplicate grossWeight warning', () => {
  it('grossWeight normalizes to gross_weight once', () => {
    const result = normalizeDetails({ grossWeight: '1500' });
    expect(result.gross_weight).toBe('1500');
    // Only one canonical entry, both old and new keys present but no double-write issues
  });
});

describe('toSupabaseRow — round-trip', () => {
  it('round-trip: form state → payload → supabase row preserves all values', () => {
    const state = {
      service_type: 'Brokerage',
      booking_name: 'Import Entry',
      customer_name: 'Importer PH',
      status: 'Draft',
      movement_type: 'Import',
      mode: 'FCL',
      mbl_mawb: 'MBL-111',
      selectivity_color: 'Yellow',
      container_numbers: ['CONT001'],
    };
    const { topLevel, details } = buildBookingPayload(state, 'Brokerage');
    const row = toSupabaseRow(topLevel, details);

    expect(row.name).toBe('Import Entry');
    expect(row.customer_name).toBe('Importer PH');
    expect(row.mode).toBe('FCL');
    expect((row.details as Record<string, unknown>).mbl_mawb).toBe('MBL-111');
    expect((row.details as Record<string, unknown>).selectivity_color).toBe('Yellow');
    expect((row.details as Record<string, unknown>).container_numbers).toEqual(['CONT001']);
  });
});
