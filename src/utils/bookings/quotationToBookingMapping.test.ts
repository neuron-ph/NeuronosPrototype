import { describe, it, expect } from 'vitest';
import { applyMapping, resolveField, FORWARDING_MAPPING, BROKERAGE_MAPPING, TRUCKING_MAPPING, MARINE_INSURANCE_MAPPING, OTHERS_MAPPING } from './quotationToBookingMapping';

// ---------------------------------------------------------------------------
// resolveField — canonical-first lookup
// ---------------------------------------------------------------------------

describe('resolveField', () => {
  it('prefers canonical key over legacy alias', () => {
    const mapping = FORWARDING_MAPPING.find(m => m.targetKey === 'aolPol')!;
    const source = { pol_aol: 'canonical', aolPol: 'legacy' };
    expect(resolveField(source, mapping)).toBe('canonical');
  });

  it('falls back to legacy key when canonical is absent', () => {
    const mapping = FORWARDING_MAPPING.find(m => m.targetKey === 'aolPol')!;
    const source = { aolPol: 'legacy' };
    expect(resolveField(source, mapping)).toBe('legacy');
  });

  it('falls back to project key when service_details is empty', () => {
    const mapping = FORWARDING_MAPPING.find(m => m.targetKey === 'aolPol')!;
    expect(resolveField({}, mapping, { pol_aol: 'from_project' })).toBe('from_project');
  });

  it('returns empty string when nothing matches', () => {
    const mapping = FORWARDING_MAPPING.find(m => m.targetKey === 'aolPol')!;
    expect(resolveField({}, mapping)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Forwarding mapping
// ---------------------------------------------------------------------------

describe('Forwarding mapping', () => {
  const allTargetKeys = FORWARDING_MAPPING.map(m => m.targetKey);

  it('covers all matrix carry-over fields', () => {
    expect(allTargetKeys).toContain('incoterms');
    expect(allTargetKeys).toContain('cargoType');
    expect(allTargetKeys).toContain('cargoNature');
    expect(allTargetKeys).toContain('commodityDescription');
    expect(allTargetKeys).toContain('deliveryAddress');
    expect(allTargetKeys).toContain('aolPol');
    expect(allTargetKeys).toContain('aodPod');
    expect(allTargetKeys).toContain('mode');
    expect(allTargetKeys).toContain('collectionAddress');
    expect(allTargetKeys).toContain('transitTime');
    expect(allTargetKeys).toContain('carrier');
    expect(allTargetKeys).toContain('routing');
    expect(allTargetKeys).toContain('stackable');
  });

  it('reads commodity from legacy "commodity" key (old quotation save)', () => {
    const result = applyMapping(FORWARDING_MAPPING, { commodity: 'Old Electronics' });
    expect(result.commodityDescription).toBe('Old Electronics');
  });

  it('reads routing from legacy "route" key', () => {
    const result = applyMapping(FORWARDING_MAPPING, { route: 'MNL-SIN-LAX' });
    expect(result.routing).toBe('MNL-SIN-LAX');
  });

  it('reads measurement from legacy lcl_dims', () => {
    const result = applyMapping(FORWARDING_MAPPING, { lcl_dims: '10x10x10' });
    expect(result.dimensions).toBe('10x10x10');
  });

  it('applies full set via applyMapping', () => {
    const serviceDetails = {
      incoterms: 'FOB',
      cargo_type: 'Dry',
      commodity_description: 'Electronics',
      pol_aol: 'MNL',
      pod_aod: 'LAX',
      mode: 'FCL',
      carrier_airline: 'Maersk',
    };
    const result = applyMapping(FORWARDING_MAPPING, serviceDetails);
    expect(result.incoterms).toBe('FOB');
    expect(result.cargoType).toBe('Dry');
    expect(result.commodityDescription).toBe('Electronics');
    expect(result.aolPol).toBe('MNL');
    expect(result.aodPod).toBe('LAX');
    expect(result.mode).toBe('FCL');
    expect(result.carrier).toBe('Maersk');
  });
});

// ---------------------------------------------------------------------------
// Brokerage mapping
// ---------------------------------------------------------------------------

describe('Brokerage mapping', () => {
  it('reads brokerageType from legacy "subtype" key', () => {
    const result = applyMapping(BROKERAGE_MAPPING, { subtype: 'Standard' });
    expect(result.brokerageType).toBe('Standard');
  });

  it('reads pod from canonical pod_aod', () => {
    const result = applyMapping(BROKERAGE_MAPPING, { pod_aod: 'MICP' });
    expect(result.pod).toBe('MICP');
  });

  it('reads commodity from legacy "commodity" key', () => {
    const result = applyMapping(BROKERAGE_MAPPING, { commodity: 'Goods' });
    expect(result.commodityDescription).toBe('Goods');
  });

  it('maps type_of_entry into the shared booking customs entry procedure prefill', () => {
    const result = applyMapping(BROKERAGE_MAPPING, { type_of_entry: 'Consumption' });
    expect(result.customsEntryProcedure).toBe('Consumption');
  });
});

// ---------------------------------------------------------------------------
// Trucking mapping — multi-destination repeater
// ---------------------------------------------------------------------------

describe('Trucking mapping', () => {
  it('carries trucking_line_items repeater', () => {
    const lineItems = [
      { destination: 'Pasay', truck_type: '10W', quantity: 2 },
      { destination: 'Parañaque', truck_type: '6W', quantity: 1 },
    ];
    const result = applyMapping(TRUCKING_MAPPING, { trucking_line_items: lineItems });
    expect(result.truckingLineItems).toEqual(lineItems);
  });

  it('reads pull_out_location from legacy "pull_out" key', () => {
    const result = applyMapping(TRUCKING_MAPPING, { pull_out: 'Port Area' });
    expect(result.pullOutLocation).toBe('Port Area');
  });

  it('returns empty array when trucking_line_items is explicitly empty (preserves form value)', () => {
    // An explicitly empty array means the quotation had no destinations entered yet;
    // it carries over as-is rather than falling back to a project-level key.
    const result = applyMapping(TRUCKING_MAPPING, { pull_out_location: 'Port', trucking_line_items: [] });
    expect(Array.isArray(result.truckingLineItems)).toBe(true);
    expect((result.truckingLineItems as unknown[]).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Marine Insurance mapping
// ---------------------------------------------------------------------------

describe('Marine Insurance mapping', () => {
  it('covers matrix carry-over fields', () => {
    const allTargetKeys = MARINE_INSURANCE_MAPPING.map(m => m.targetKey);
    expect(allTargetKeys).toContain('commodityDescription');
    expect(allTargetKeys).toContain('hsCode');
    expect(allTargetKeys).toContain('departurePort');
    expect(allTargetKeys).toContain('arrivalPort');
    expect(allTargetKeys).toContain('invoiceValue');
  });

  it('reads pol_aol from legacy aol_pol key (MI quotation save format)', () => {
    const result = applyMapping(MARINE_INSURANCE_MAPPING, { aol_pol: 'MICP' });
    expect(result.departurePort).toBe('MICP');
  });
});

// ---------------------------------------------------------------------------
// Others mapping
// ---------------------------------------------------------------------------

describe('Others mapping', () => {
  it('carries service_description', () => {
    const result = applyMapping(OTHERS_MAPPING, { service_description: 'Permit processing' });
    expect(result.serviceDescription).toBe('Permit processing');
  });

  it('reads from legacy serviceDescription camelCase key', () => {
    const result = applyMapping(OTHERS_MAPPING, { serviceDescription: 'Custom clearance' });
    expect(result.serviceDescription).toBe('Custom clearance');
  });
});
