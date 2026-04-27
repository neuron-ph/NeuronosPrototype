import { describe, it, expect } from 'vitest';
import { normalizeQuotationDetails, normalizeServicesMetadata } from './quotationNormalize';

// ---------------------------------------------------------------------------
// Brokerage normalization
// ---------------------------------------------------------------------------

describe('normalizeQuotationDetails — Brokerage', () => {
  it('maps legacy "commodity" to "commodity_description"', () => {
    const out = normalizeQuotationDetails('Brokerage', { commodity: 'Electronics' });
    expect(out.commodity_description).toBe('Electronics');
    expect(out.commodity).toBe('Electronics'); // legacy key preserved
  });

  it('maps legacy "pod" to "pod_aod"', () => {
    const out = normalizeQuotationDetails('Brokerage', { pod: 'MICP' });
    expect(out.pod_aod).toBe('MICP');
    expect(out.pod).toBe('MICP');
  });

  it('maps legacy "lcl_gwt" to "gross_weight"', () => {
    const out = normalizeQuotationDetails('Brokerage', { lcl_gwt: '500' });
    expect(out.gross_weight).toBe('500');
    expect(out.lcl_gwt).toBe('500');
  });

  it('maps legacy "lcl_dims" to "measurement"', () => {
    const out = normalizeQuotationDetails('Brokerage', { lcl_dims: '10x10x10' });
    expect(out.measurement).toBe('10x10x10');
    expect(out.lcl_dims).toBe('10x10x10');
  });

  it('maps legacy "air_cwt" to "chargeable_weight"', () => {
    const out = normalizeQuotationDetails('Brokerage', { air_cwt: '600' });
    expect(out.chargeable_weight).toBe('600');
    expect(out.air_cwt).toBe('600');
  });

  it('does not overwrite an existing canonical key', () => {
    const out = normalizeQuotationDetails('Brokerage', {
      commodity: 'Old',
      commodity_description: 'New',
    });
    expect(out.commodity_description).toBe('New'); // canonical wins
    expect(out.commodity).toBe('Old');              // legacy preserved as-is
  });

  it('back-fills legacy alias when only canonical key is present', () => {
    const out = normalizeQuotationDetails('Brokerage', {
      commodity_description: 'Electronics',
    });
    expect(out.commodity).toBe('Electronics'); // back-filled
  });
});

// ---------------------------------------------------------------------------
// Forwarding normalization
// ---------------------------------------------------------------------------

describe('normalizeQuotationDetails — Forwarding', () => {
  it('maps legacy "aolPol" to "pol_aol"', () => {
    const out = normalizeQuotationDetails('Forwarding', { aolPol: 'MNL' });
    expect(out.pol_aol).toBe('MNL');
    expect(out.aolPol).toBe('MNL');
  });

  it('maps legacy "route" to "routing"', () => {
    const out = normalizeQuotationDetails('Forwarding', { route: 'MNL-SIN-LAX' });
    expect(out.routing).toBe('MNL-SIN-LAX');
    expect(out.route).toBe('MNL-SIN-LAX');
  });

  it('maps legacy "commodity" to "commodity_description"', () => {
    const out = normalizeQuotationDetails('Forwarding', { commodity: 'Shoes' });
    expect(out.commodity_description).toBe('Shoes');
  });
});

// ---------------------------------------------------------------------------
// Marine Insurance normalization
// ---------------------------------------------------------------------------

describe('normalizeQuotationDetails — Marine Insurance', () => {
  it('maps legacy "aol_pol" to "pol_aol"', () => {
    const out = normalizeQuotationDetails('Marine Insurance', { aol_pol: 'MICP' });
    expect(out.pol_aol).toBe('MICP');
  });

  it('maps legacy "aod_pod" to "pod_aod"', () => {
    const out = normalizeQuotationDetails('Marine Insurance', { aod_pod: 'LA' });
    expect(out.pod_aod).toBe('LA');
  });
});

// ---------------------------------------------------------------------------
// Trucking normalization
// ---------------------------------------------------------------------------

describe('normalizeQuotationDetails — Trucking', () => {
  it('maps legacy "pull_out" to "pull_out_location"', () => {
    const out = normalizeQuotationDetails('Trucking', { pull_out: 'Port Area' });
    expect(out.pull_out_location).toBe('Port Area');
    expect(out.pull_out).toBe('Port Area');
  });
});

// ---------------------------------------------------------------------------
// normalizeServicesMetadata
// ---------------------------------------------------------------------------

describe('normalizeServicesMetadata', () => {
  it('normalizes all services in the array', () => {
    const input = [
      { service_type: 'Brokerage', service_details: { commodity: 'Goods' } },
      { service_type: 'Forwarding', service_details: { route: 'MNL-LAX' } },
    ];
    const result = normalizeServicesMetadata(input);
    expect(result[0].service_details.commodity_description).toBe('Goods');
    expect(result[1].service_details.routing).toBe('MNL-LAX');
  });

  it('preserves extra fields not in the schema', () => {
    const input = [
      { service_type: 'Brokerage', service_details: { unknown_field: 'keep me' } },
    ];
    const result = normalizeServicesMetadata(input);
    expect(result[0].service_details.unknown_field).toBe('keep me');
  });
});
