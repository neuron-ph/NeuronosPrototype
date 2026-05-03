import { describe, it, expect } from 'vitest';
import {
  BROKERAGE_QUOTATION_SCHEMA,
  FORWARDING_QUOTATION_SCHEMA,
  TRUCKING_QUOTATION_SCHEMA,
  MARINE_INSURANCE_QUOTATION_SCHEMA,
  OTHERS_QUOTATION_SCHEMA,
  QUOTATION_SCHEMA_MAP,
  QUOTATION_GENERAL_SECTION,
  getVisibleSections,
  getVisibleFields,
} from './quotationScreenSchema';
import type { QuotationFormContext } from './quotationFieldTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allFields(schema: typeof BROKERAGE_QUOTATION_SCHEMA) {
  return schema.sections.flatMap(s => s.fields);
}

function findField(schema: typeof BROKERAGE_QUOTATION_SCHEMA, key: string) {
  return allFields(schema).find(f => f.key === key);
}

function ctxBrokerage(overrides?: Partial<QuotationFormContext>): QuotationFormContext {
  return { service_type: 'Brokerage', brokerage_type: 'Standard', incoterms: '', mode: 'FCL', ...overrides };
}

function ctxForwarding(overrides?: Partial<QuotationFormContext>): QuotationFormContext {
  return { service_type: 'Forwarding', brokerage_type: '', incoterms: 'EXW', mode: 'FCL', ...overrides };
}

// ---------------------------------------------------------------------------
// Shared General Information
// ---------------------------------------------------------------------------

describe('Quotation General Section', () => {
  const requiredKeys = ['customer', 'contact_person', 'quotation_name', 'services', 'date'];
  const presentKeys = ['credit_terms', 'validity'];

  it.each(requiredKeys)('has required field: %s', (key) => {
    const field = QUOTATION_GENERAL_SECTION.fields.find(f => f.key === key);
    expect(field).toBeDefined();
    expect(field!.required).toBe('yes');
  });

  it.each(presentKeys)('has optional field: %s', (key) => {
    const field = QUOTATION_GENERAL_SECTION.fields.find(f => f.key === key);
    expect(field).toBeDefined();
  });

  it('shares the same general section across all five service schemas', () => {
    const schemas = Object.values(QUOTATION_SCHEMA_MAP);
    schemas.forEach(schema => {
      const hasGeneral = schema.sections.some(s => s.key === 'general_information');
      expect(hasGeneral).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Brokerage Quotation — matrix fields
// ---------------------------------------------------------------------------

describe('Brokerage quotation schema', () => {
  it('defines a brokerage_type package selector', () => {
    const field = findField(BROKERAGE_QUOTATION_SCHEMA, 'brokerage_type');
    expect(field).toBeDefined();
    expect(field!.optionsKind).toBe('brokerage_type');
  });

  const alwaysVisibleFields = ['pod_aod', 'mode', 'cargo_type', 'commodity_description', 'delivery_address'];
  it.each(alwaysVisibleFields)('shows %s for all packages (no showWhen restriction)', (key) => {
    const field = findField(BROKERAGE_QUOTATION_SCHEMA, key);
    expect(field).toBeDefined();
    expect(field!.showWhen).toBeUndefined();
  });

  it('shows type_of_entry for Standard and Non-Regular only', () => {
    const field = findField(BROKERAGE_QUOTATION_SCHEMA, 'type_of_entry');
    expect(field).toBeDefined();
    expect(field!.showWhen).toEqual([{ field: 'brokerage_type', op: 'in', value: ['Standard', 'Non-Regular'] }]);

    const standardCtx = ctxBrokerage({ brokerage_type: 'Standard' });
    const allInclusiveCtx = ctxBrokerage({ brokerage_type: 'All-Inclusive' });

    const standardVisible = getVisibleFields(
      BROKERAGE_QUOTATION_SCHEMA.sections.flatMap(s => s.fields),
      standardCtx,
    ).some(f => f.key === 'type_of_entry');

    const allInclusiveVisible = getVisibleFields(
      BROKERAGE_QUOTATION_SCHEMA.sections.flatMap(s => s.fields),
      allInclusiveCtx,
    ).some(f => f.key === 'type_of_entry');

    expect(standardVisible).toBe(true);
    expect(allInclusiveVisible).toBe(false);
  });

  it('shows country_of_origin and preferential_treatment for All-Inclusive only', () => {
    const coField = findField(BROKERAGE_QUOTATION_SCHEMA, 'country_of_origin');
    const ptField = findField(BROKERAGE_QUOTATION_SCHEMA, 'preferential_treatment');
    expect(coField!.showWhen).toEqual([{ field: 'brokerage_type', op: 'eq', value: 'All-Inclusive' }]);
    expect(ptField!.showWhen).toEqual([{ field: 'brokerage_type', op: 'eq', value: 'All-Inclusive' }]);
  });

  it('FCL overlay section is gated on mode=FCL', () => {
    const fclSection = BROKERAGE_QUOTATION_SCHEMA.sections.find(s => s.key === 'brokerage_fcl_overlay');
    expect(fclSection).toBeDefined();
    expect(fclSection!.showWhen).toEqual([{ field: 'mode', op: 'eq', value: 'FCL' }]);
  });

  it('LCL overlay has gross_weight and measurement', () => {
    const lclSection = BROKERAGE_QUOTATION_SCHEMA.sections.find(s => s.key === 'brokerage_lcl_overlay');
    const keys = lclSection!.fields.map(f => f.key);
    expect(keys).toContain('gross_weight');
    expect(keys).toContain('measurement');
  });

  it('Air overlay has gross_weight and chargeable_weight', () => {
    const airSection = BROKERAGE_QUOTATION_SCHEMA.sections.find(s => s.key === 'brokerage_air_overlay');
    const keys = airSection!.fields.map(f => f.key);
    expect(keys).toContain('gross_weight');
    expect(keys).toContain('chargeable_weight');
  });

  it('getVisibleSections excludes LCL/Air overlays when mode is FCL', () => {
    const ctx = ctxBrokerage({ mode: 'FCL' });
    const visible = getVisibleSections('Brokerage', ctx);
    const keys = visible.map(s => s.key);
    expect(keys).toContain('brokerage_fcl_overlay');
    expect(keys).not.toContain('brokerage_lcl_overlay');
    expect(keys).not.toContain('brokerage_air_overlay');
  });

  it('getVisibleSections excludes FCL/Air overlays when mode is LCL', () => {
    const ctx = ctxBrokerage({ mode: 'LCL' });
    const visible = getVisibleSections('Brokerage', ctx);
    const keys = visible.map(s => s.key);
    expect(keys).not.toContain('brokerage_fcl_overlay');
    expect(keys).toContain('brokerage_lcl_overlay');
    expect(keys).not.toContain('brokerage_air_overlay');
  });

  it('legacy keys cover old QuotationBuilderV3 save handler output', () => {
    const commodity = findField(BROKERAGE_QUOTATION_SCHEMA, 'commodity_description');
    expect(commodity!.legacyKeys).toContain('commodity');

    const pod = findField(BROKERAGE_QUOTATION_SCHEMA, 'pod_aod');
    expect(pod!.legacyKeys).toContain('pod');
  });
});

// ---------------------------------------------------------------------------
// Forwarding Quotation — incoterm matrix
// ---------------------------------------------------------------------------

describe('Forwarding quotation schema', () => {
  const alwaysVisibleFields = [
    'incoterms', 'cargo_type', 'cargo_nature', 'commodity_description',
    'pol_aol', 'pod_aod', 'mode',
  ];

  it.each(alwaysVisibleFields)('shows %s for all incoterms (no showWhen)', (key) => {
    const field = findField(FORWARDING_QUOTATION_SCHEMA, key);
    expect(field).toBeDefined();
    expect(field!.showWhen).toBeUndefined();
  });

  it('shows collection_address only for EXW', () => {
    const field = findField(FORWARDING_QUOTATION_SCHEMA, 'collection_address');
    expect(field!.showWhen).toEqual([{ field: 'incoterms', op: 'in', value: ['EXW'] }]);

    const exwCtx = ctxForwarding({ incoterms: 'EXW' });
    const fobCtx = ctxForwarding({ incoterms: 'FOB' });

    const coreFields = FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_core')!.fields;

    expect(getVisibleFields(coreFields, exwCtx).some(f => f.key === 'collection_address')).toBe(true);
    expect(getVisibleFields(coreFields, fobCtx).some(f => f.key === 'collection_address')).toBe(false);
  });

  it('shows delivery_address only for DAP, DDU, DDP', () => {
    const field = findField(FORWARDING_QUOTATION_SCHEMA, 'delivery_address');
    expect(field!.showWhen).toEqual([{ field: 'incoterms', op: 'in', value: ['DAP', 'DDU', 'DDP'] }]);

    const coreFields = FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_core')!.fields;

    expect(getVisibleFields(coreFields, ctxForwarding({ incoterms: 'DAP' })).some(f => f.key === 'delivery_address')).toBe(true);
    expect(getVisibleFields(coreFields, ctxForwarding({ incoterms: 'DDU' })).some(f => f.key === 'delivery_address')).toBe(true);
    expect(getVisibleFields(coreFields, ctxForwarding({ incoterms: 'DDP' })).some(f => f.key === 'delivery_address')).toBe(true);
    expect(getVisibleFields(coreFields, ctxForwarding({ incoterms: 'FOB' })).some(f => f.key === 'delivery_address')).toBe(false);
    expect(getVisibleFields(coreFields, ctxForwarding({ incoterms: 'CFR' })).some(f => f.key === 'delivery_address')).toBe(false);
  });

  it('shows transit_time, carrier_airline, routing for EXW/FOB/FCA only', () => {
    const coreFields = FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_core')!.fields;
    const conditionalKeys = ['transit_time', 'carrier_airline', 'routing'];

    for (const incoterms of ['EXW', 'FOB', 'FCA']) {
      const ctx = ctxForwarding({ incoterms });
      const visibleKeys = getVisibleFields(coreFields, ctx).map(f => f.key);
      conditionalKeys.forEach(key => expect(visibleKeys).toContain(key));
    }

    for (const incoterms of ['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDU', 'DDP']) {
      const ctx = ctxForwarding({ incoterms });
      const visibleKeys = getVisibleFields(coreFields, ctx).map(f => f.key);
      conditionalKeys.forEach(key => expect(visibleKeys).not.toContain(key));
    }
  });

  it('shows stackable for EXW/FOB/FCA/DAP/DDU/DDP', () => {
    const coreFields = FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_core')!.fields;

    for (const incoterms of ['EXW', 'FOB', 'FCA', 'DAP', 'DDU', 'DDP']) {
      const ctx = ctxForwarding({ incoterms });
      expect(getVisibleFields(coreFields, ctx).some(f => f.key === 'stackable')).toBe(true);
    }

    for (const incoterms of ['CFR', 'CIF', 'CPT', 'CIP']) {
      const ctx = ctxForwarding({ incoterms });
      expect(getVisibleFields(coreFields, ctx).some(f => f.key === 'stackable')).toBe(false);
    }
  });

  it('FCL/LCL/Air freight overlays are gated on mode', () => {
    expect(FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_fcl_overlay')!.showWhen)
      .toEqual([{ field: 'mode', op: 'eq', value: 'FCL' }]);

    expect(FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_lcl_overlay')!.showWhen)
      .toEqual([{ field: 'mode', op: 'eq', value: 'LCL' }]);

    expect(FORWARDING_QUOTATION_SCHEMA.sections.find(s => s.key === 'forwarding_air_overlay')!.showWhen)
      .toEqual([{ field: 'mode', op: 'eq', value: 'Air Freight' }]);
  });

  it('legacy keys cover old aolPol/aodPod/commodity camelCase saves', () => {
    const pol = findField(FORWARDING_QUOTATION_SCHEMA, 'pol_aol');
    expect(pol!.legacyKeys).toContain('aolPol');

    const pod = findField(FORWARDING_QUOTATION_SCHEMA, 'pod_aod');
    expect(pod!.legacyKeys).toContain('aodPod');

    const commodity = findField(FORWARDING_QUOTATION_SCHEMA, 'commodity_description');
    expect(commodity!.legacyKeys).toContain('commodity');

    const routing = findField(FORWARDING_QUOTATION_SCHEMA, 'routing');
    expect(routing!.legacyKeys).toContain('route');
  });
});

// ---------------------------------------------------------------------------
// Trucking Quotation — matrix fields
// ---------------------------------------------------------------------------

describe('Trucking quotation schema', () => {
  it('has pull_out_location (Pickup Location)', () => {
    const field = findField(TRUCKING_QUOTATION_SCHEMA, 'pull_out_location');
    expect(field).toBeDefined();
    expect(field!.required).toBe('yes');
  });

  it('has trucking_line_items repeater (Destination/s) with destination/truck_type/quantity columns', () => {
    const field = findField(TRUCKING_QUOTATION_SCHEMA, 'trucking_line_items');
    expect(field).toBeDefined();
    expect(field!.control).toBe('repeater');
    const colKeys = field!.repeaterColumns!.map(c => c.key);
    expect(colKeys).toContain('destination');
    expect(colKeys).toContain('truck_type');
    expect(colKeys).toContain('quantity');
  });

  it('has delivery_instructions', () => {
    const field = findField(TRUCKING_QUOTATION_SCHEMA, 'delivery_instructions');
    expect(field).toBeDefined();
  });

  it('does not introduce a trucking_mode field', () => {
    const field = findField(TRUCKING_QUOTATION_SCHEMA, 'trucking_mode');
    expect(field).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Marine Insurance Quotation — matrix fields
// ---------------------------------------------------------------------------

describe('Marine Insurance quotation schema', () => {
  const requiredKeys = ['commodity_description', 'pol_aol', 'pod_aod', 'invoice_value'];
  const presentKeys = ['hs_codes'];

  it.each(requiredKeys)('has required field: %s', (key) => {
    const field = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, key);
    expect(field).toBeDefined();
    expect(field!.required).toBe('yes');
  });

  it.each(presentKeys)('has optional field: %s', (key) => {
    const field = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, key);
    expect(field).toBeDefined();
  });

  it('legacy keys cover old departurePort/arrivalPort aliases', () => {
    const pol = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, 'pol_aol');
    expect(pol!.legacyKeys).toContain('departurePort');

    const pod = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, 'pod_aod');
    expect(pod!.legacyKeys).toContain('arrivalPort');
  });
});

// ---------------------------------------------------------------------------
// Others Quotation — matrix fields
// ---------------------------------------------------------------------------

describe('Others quotation schema', () => {
  it('has required service_description', () => {
    const field = findField(OTHERS_QUOTATION_SCHEMA, 'service_description');
    expect(field).toBeDefined();
    expect(field!.required).toBe('yes');
    expect(field!.legacyKeys).toContain('serviceDescription');
  });
});

// ---------------------------------------------------------------------------
// QUOTATION_SCHEMA_MAP
// ---------------------------------------------------------------------------

describe('QUOTATION_SCHEMA_MAP', () => {
  const serviceTypes = ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'] as const;

  it.each(serviceTypes)('has an entry for %s', (serviceType) => {
    expect(QUOTATION_SCHEMA_MAP[serviceType]).toBeDefined();
    expect(QUOTATION_SCHEMA_MAP[serviceType].serviceType).toBe(serviceType);
  });

  it.each(serviceTypes)('%s schema includes general_information section', (serviceType) => {
    const schema = QUOTATION_SCHEMA_MAP[serviceType];
    expect(schema.sections.some(s => s.key === 'general_information')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No unapproved invented fields
// ---------------------------------------------------------------------------

describe('Guardrails — no invented fields', () => {
  it('does not define agent_origin', () => {
    Object.values(QUOTATION_SCHEMA_MAP).forEach(schema => {
      const found = schema.sections.flatMap(s => s.fields).find(f => f.key === 'agent_origin');
      expect(found).toBeUndefined();
    });
  });

  it('does not define agent_destination', () => {
    Object.values(QUOTATION_SCHEMA_MAP).forEach(schema => {
      const found = schema.sections.flatMap(s => s.fields).find(f => f.key === 'agent_destination');
      expect(found).toBeUndefined();
    });
  });

  it('Brokerage pod_aod is profile-lookup with profileType=port', () => {
    const f = findField(BROKERAGE_QUOTATION_SCHEMA, 'pod_aod');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('port');
  });

  it('Brokerage country_of_origin is profile-lookup with profileType=country', () => {
    const f = findField(BROKERAGE_QUOTATION_SCHEMA, 'country_of_origin');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('country');
  });

  it('Brokerage preferential_treatment is dropdown sourced from profile_preferential_treatments', () => {
    const f = findField(BROKERAGE_QUOTATION_SCHEMA, 'preferential_treatment');
    expect(f!.control).toBe('dropdown');
    expect(f!.optionsKind).toBe('preferential_treatment');
  });

  it('Forwarding pol_aol is profile-lookup with profileType=port', () => {
    const f = findField(FORWARDING_QUOTATION_SCHEMA, 'pol_aol');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('port');
  });

  it('Forwarding pod_aod is profile-lookup with profileType=port', () => {
    const f = findField(FORWARDING_QUOTATION_SCHEMA, 'pod_aod');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('port');
  });

  it('Forwarding carrier_airline is profile-lookup with profileType=carrier', () => {
    const f = findField(FORWARDING_QUOTATION_SCHEMA, 'carrier_airline');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('carrier');
  });

  it('Marine Insurance pol_aol is profile-lookup with profileType=port', () => {
    const f = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, 'pol_aol');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('port');
  });

  it('Marine Insurance pod_aod is profile-lookup with profileType=port', () => {
    const f = findField(MARINE_INSURANCE_QUOTATION_SCHEMA, 'pod_aod');
    expect(f!.control).toBe('profile-lookup');
    expect(f!.profileType).toBe('port');
  });

  it('does not define brokerage_fee_sad', () => {
    Object.values(QUOTATION_SCHEMA_MAP).forEach(schema => {
      const found = schema.sections.flatMap(s => s.fields).find(f => f.key === 'brokerage_fee_sad');
      expect(found).toBeUndefined();
    });
  });
});
