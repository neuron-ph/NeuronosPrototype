import { describe, it, expect } from 'vitest';
import { normalizeDetails, mergeBookingRecord, canonicalKey } from './bookingDetailsCompat';
import { buildBookingPayload, toSupabaseRow } from './bookingPayload';

// ---------------------------------------------------------------------------
// bookingDetailsCompat — legacy key normalization
// ---------------------------------------------------------------------------

describe('normalizeDetails — global camelCase mappings', () => {
  it('maps accountOwner to account_owner when new key is absent', () => {
    const result = normalizeDetails({ accountOwner: 'Maria Santos' });
    expect(result.account_owner).toBe('Maria Santos');
  });

  it('does not overwrite an existing snake_case key', () => {
    const result = normalizeDetails({ accountOwner: 'Old', account_owner: 'Correct' });
    expect(result.account_owner).toBe('Correct');
  });

  it('maps all plan-listed legacy keys', () => {
    const raw = {
      accountOwner:             'owner',
      accountHandler:           'handler',
      quotationReferenceNumber: 'QUO-001',
      commodityDescription:     'Steel coils',
      deliveryAddress:          '123 Main St',
      mblMawb:                  'MBL123',
      hblHawb:                  'HBL456',
      detDemValidity:            '2026-05-01',
      containerNumbers:          ['CONT001'],
      truckType:                 '20ft',
      preferredDeliveryDate:    '2026-05-10',
      vehicleReferenceNumber:   'VEH-99',
      dateDelivered:             '2026-05-12',
      sumInsured:                500000,
      policyNumber:              'POL-001',
      serviceDescription:        'General service',
    };
    const result = normalizeDetails(raw);
    expect(result.account_owner).toBe('owner');
    expect(result.account_handler).toBe('handler');
    expect(result.quotation_reference_number).toBe('QUO-001');
    expect(result.commodity_description).toBe('Steel coils');
    expect(result.delivery_address).toBe('123 Main St');
    expect(result.mbl_mawb).toBe('MBL123');
    expect(result.hbl_hawb).toBe('HBL456');
    expect(result.det_dem_validity).toBe('2026-05-01');
    expect(result.container_numbers).toEqual(['CONT001']);
    expect(result.truck_type).toBe('20ft');
    expect(result.preferred_delivery_date).toBe('2026-05-10');
    expect(result.vehicle_reference_number).toBe('VEH-99');
    expect(result.date_delivered).toBe('2026-05-12');
    expect(result.amount_insured).toBe(500000);
    expect(result.policy_number).toBe('POL-001');
    expect(result.service_description).toBe('General service');
  });

  it('preserves original keys alongside new ones', () => {
    const result = normalizeDetails({ accountOwner: 'Alice' });
    expect(result.accountOwner).toBe('Alice');
    expect(result.account_owner).toBe('Alice');
  });

  it('passes through already-canonical snake_case keys unchanged', () => {
    const result = normalizeDetails({ account_owner: 'Bob', mbl_mawb: 'X123' });
    expect(result.account_owner).toBe('Bob');
    expect(result.mbl_mawb).toBe('X123');
    expect(result.accountOwner).toBeUndefined();
  });
});

describe('normalizeDetails — service-specific mappings', () => {
  it('maps Forwarding forwarder → agent', () => {
    const result = normalizeDetails({ forwarder: 'ABC Forwarders' }, 'Forwarding');
    expect(result.agent).toBe('ABC Forwarders');
  });

  it('does not map Brokerage forwarder to agent', () => {
    const result = normalizeDetails({ forwarder: 'ABC Forwarders' }, 'Brokerage');
    expect(result.agent).toBeUndefined();
    expect(result.forwarder).toBe('ABC Forwarders');
  });

  it('maps Trucking emptyReturn → empty_return_date (FCL field, not status date)', () => {
    const result = normalizeDetails({ emptyReturn: '2026-06-01' }, 'Trucking');
    expect(result.empty_return_date).toBe('2026-06-01');
    expect(result.date_empty_return).toBeUndefined();
  });

  it('maps Brokerage pod → pod_aod and pol → pol_aol', () => {
    const result = normalizeDetails({ pod: 'PHMNL', pol: 'CNSHA' }, 'Brokerage');
    expect(result.pod_aod).toBe('PHMNL');
    expect(result.pol_aol).toBe('CNSHA');
  });

  it('maps Marine Insurance departurePort and arrivalPort', () => {
    const result = normalizeDetails(
      { departurePort: 'CNSHA', arrivalPort: 'PHMNL' },
      'Marine Insurance',
    );
    expect(result.pol_aol).toBe('CNSHA');
    expect(result.pod_aod).toBe('PHMNL');
  });
});

describe('mergeBookingRecord', () => {
  it('flattens details into the top-level record', () => {
    const raw = {
      id: 'b1',
      service_type: 'Brokerage',
      status: 'Draft',
      details: { accountOwner: 'Maria', mblMawb: 'MBL999' },
    };
    const merged = mergeBookingRecord(raw, 'Brokerage');
    expect(merged.id).toBe('b1');
    expect(merged.account_owner).toBe('Maria');
    expect(merged.mbl_mawb).toBe('MBL999');
  });

  it('top-level columns win over details values for the same key', () => {
    const raw = {
      customer_name: 'TopLevel Corp',
      status: 'Ongoing',
      details: { customer_name: 'ShouldNotWin' },
    };
    const merged = mergeBookingRecord(raw);
    expect(merged.customer_name).toBe('TopLevel Corp');
  });

  it('infers serviceType from raw.service_type when not explicitly provided', () => {
    const raw = {
      service_type: 'Trucking',
      details: { emptyReturn: '2026-07-01' },
    };
    const merged = mergeBookingRecord(raw);
    expect(merged.empty_return_date).toBe('2026-07-01');
  });
});

describe('canonicalKey', () => {
  it('returns the snake_case key for a known legacy key', () => {
    expect(canonicalKey('accountOwner')).toBe('account_owner');
    expect(canonicalKey('sumInsured')).toBe('amount_insured');
  });

  it('returns the key unchanged when already canonical or unknown', () => {
    expect(canonicalKey('account_owner')).toBe('account_owner');
    expect(canonicalKey('some_unknown_key')).toBe('some_unknown_key');
  });

  it('applies service-specific override when serviceType is provided', () => {
    expect(canonicalKey('forwarder', 'Forwarding')).toBe('agent');
    expect(canonicalKey('forwarder', 'Brokerage')).toBe('forwarder');
  });
});

// ---------------------------------------------------------------------------
// bookingPayload — top-level / details split
// ---------------------------------------------------------------------------

describe('buildBookingPayload — Brokerage', () => {
  const formState = {
    booking_name: 'BRK-001 Test',
    booking_number: 'BRK-2026-001',
    service_type: 'Brokerage',
    customer_name: 'Acme Imports',
    status: 'Draft',
    movement_type: 'Import',
    mode: 'FCL',
    account_owner: 'Maria',
    account_handler: 'Jose',
    mbl_mawb: 'MBL123456',
    consignee: 'Manila Warehouse',
    description_of_goods: 'Steel coils',
    gross_weight: 5000,
    container_numbers: ['CONT001', 'CONT002'],
    selectivity_color: 'Yellow',
    manager_id: 'uuid-1',
    project_id: 'proj-uuid',
  };

  it('routes booking_name to topLevel.name', () => {
    const { topLevel } = buildBookingPayload(formState, 'Brokerage');
    expect(topLevel.name).toBe('BRK-001 Test');
    expect(topLevel.booking_name).toBeUndefined();
  });

  it('routes customer_name, status, movement_type, mode to topLevel', () => {
    const { topLevel } = buildBookingPayload(formState, 'Brokerage');
    expect(topLevel.customer_name).toBe('Acme Imports');
    expect(topLevel.status).toBe('Draft');
    expect(topLevel.movement_type).toBe('Import');
    expect(topLevel.mode).toBe('FCL');
  });

  it('routes service-specific fields to details', () => {
    const { details } = buildBookingPayload(formState, 'Brokerage');
    expect(details.account_owner).toBe('Maria');
    expect(details.mbl_mawb).toBe('MBL123456');
    expect(details.consignee).toBe('Manila Warehouse');
    expect(details.description_of_goods).toBe('Steel coils');
    expect(details.container_numbers).toEqual(['CONT001', 'CONT002']);
    expect(details.selectivity_color).toBe('Yellow');
  });

  it('routes team/project IDs to topLevel via TOP_LEVEL_COLUMNS sweep', () => {
    const { topLevel } = buildBookingPayload(formState, 'Brokerage');
    expect(topLevel.manager_id).toBe('uuid-1');
    expect(topLevel.project_id).toBe('proj-uuid');
  });

  it('omits undefined values from both targets', () => {
    const { topLevel, details } = buildBookingPayload({ service_type: 'Brokerage', booking_name: 'Test' }, 'Brokerage');
    expect(Object.values(topLevel).every(v => v !== undefined)).toBe(true);
    expect(Object.values(details).every(v => v !== undefined)).toBe(true);
  });
});

describe('buildBookingPayload — Trucking', () => {
  it('hides quotation_reference_number from topLevel (schema marks it hidden for Trucking)', () => {
    const formState = {
      service_type: 'Trucking',
      customer_name: 'XYZ Logistics',
      status: 'Draft',
      movement_type: 'Import',
      container_number: 'CONT-001',
      delivery_address: '456 Delivery Rd',
      date_empty_return: '2026-06-15',
    };
    const { details } = buildBookingPayload(formState, 'Trucking');
    expect(details.container_number).toBe('CONT-001');
    expect(details.delivery_address).toBe('456 Delivery Rd');
    expect(details.date_empty_return).toBe('2026-06-15');
  });
});

describe('buildBookingPayload — Marine Insurance', () => {
  it('routes amount_insured and insurer to details', () => {
    const formState = {
      service_type: 'Marine Insurance',
      customer_name: 'Pacific Freight',
      status: 'Ongoing',
      amount_insured: 1000000,
      insurer: 'Philippine Insurer',
      bl_awb_number: 'BL-2026-001',
      policy_number: 'POL-555',
    };
    const { details } = buildBookingPayload(formState, 'Marine Insurance');
    expect(details.amount_insured).toBe(1000000);
    expect(details.insurer).toBe('Philippine Insurer');
    expect(details.bl_awb_number).toBe('BL-2026-001');
    expect(details.policy_number).toBe('POL-555');
  });
});

describe('toSupabaseRow', () => {
  it('merges topLevel and details into a single row', () => {
    const topLevel = { name: 'Test', status: 'Draft', customer_name: 'Corp' };
    const details = { mbl_mawb: 'MBL001', consignee: 'Buyer Inc' };
    const row = toSupabaseRow(topLevel, details);
    expect(row.name).toBe('Test');
    expect(row.status).toBe('Draft');
    expect(row.details).toEqual({ mbl_mawb: 'MBL001', consignee: 'Buyer Inc' });
  });

  it('merges new details on top of existing details when existingDetails provided', () => {
    const topLevel = { status: 'Ongoing' };
    const newDetails = { selectivity_color: 'Orange' };
    const existingDetails = { mbl_mawb: 'MBL001', account_owner: 'Maria' };
    const row = toSupabaseRow(topLevel, newDetails, existingDetails);
    expect(row.details).toEqual({
      mbl_mawb: 'MBL001',
      account_owner: 'Maria',
      selectivity_color: 'Orange',
    });
  });

  it('new details values overwrite existing details values for the same key', () => {
    const row = toSupabaseRow(
      {},
      { mbl_mawb: 'NEW' },
      { mbl_mawb: 'OLD', carrier: 'Carrier A' },
    );
    expect((row.details as Record<string, unknown>).mbl_mawb).toBe('NEW');
    expect((row.details as Record<string, unknown>).carrier).toBe('Carrier A');
  });
});
