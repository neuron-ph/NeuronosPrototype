import { describe, it, expect } from 'vitest';
import { validateQuotation } from './quotationValidation';
import type { QuotationFormContext } from '../../config/quotation/quotationFieldTypes';

function ctx(overrides?: Partial<QuotationFormContext>): QuotationFormContext {
  return { service_type: '', brokerage_type: '', incoterms: '', mode: '', ...overrides };
}

// ---------------------------------------------------------------------------
// Brokerage
// ---------------------------------------------------------------------------

describe('validateQuotation — Brokerage', () => {
  it('is invalid when required shared fields are missing', () => {
    const result = validateQuotation(
      'Brokerage',
      { brokerageType: 'Standard' }, // missing pod, mode, cargoType, commodityDescription, deliveryAddress
      ctx({ brokerage_type: 'Standard' }),
    );
    expect(result.valid).toBe(false);
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('pod_aod');
    expect(errorKeys).toContain('mode');
    expect(errorKeys).toContain('cargo_type');
    expect(errorKeys).toContain('commodity_description');
    expect(errorKeys).toContain('delivery_address');
  });

  it('finds commodity_description from legacy "commodity" key', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'Standard',
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity: 'Electronics', // legacy key
        deliveryAddress: '123 Main St',
      },
      ctx({ brokerage_type: 'Standard', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('commodity_description');
  });

  it('does not require type_of_entry for All-Inclusive', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'All-Inclusive',
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
        countryOfOrigin: 'Japan',
        preferentialTreatment: 'Form E',
      },
      ctx({ brokerage_type: 'All-Inclusive', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('type_of_entry');
  });

  it('requires country_of_origin and preferential_treatment for All-Inclusive', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'All-Inclusive',
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
        // missing countryOfOrigin and preferentialTreatment
      },
      ctx({ brokerage_type: 'All-Inclusive', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('country_of_origin');
    expect(errorKeys).toContain('preferential_treatment');
  });

  it('does not require country_of_origin for Standard', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'Standard',
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
      },
      ctx({ brokerage_type: 'Standard', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('country_of_origin');
    expect(errorKeys).not.toContain('preferential_treatment');
  });

  it('requires FCL containers when mode is FCL', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'Standard',
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
        // missing containers
      },
      ctx({ brokerage_type: 'Standard', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('containers');
  });

  it('requires gross_weight and measurement when mode is LCL', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'Standard',
        pod: 'MICP',
        mode: 'LCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
      },
      ctx({ brokerage_type: 'Standard', mode: 'LCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('gross_weight');
    expect(errorKeys).toContain('measurement');
  });

  it('is valid for a complete Standard FCL quotation', () => {
    const result = validateQuotation(
      'Brokerage',
      {
        brokerageType: 'Standard',
        consumption: true,       // type_of_entry required for Standard
        pod: 'MICP',
        mode: 'FCL',
        cargoType: 'Dry',
        commodity_description: 'Electronics',
        deliveryAddress: '123 Main St',
        containers: [{ id: '1', type: '20ft', qty: 1 }],
      },
      ctx({ brokerage_type: 'Standard', mode: 'FCL' }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

describe('validateQuotation — Forwarding', () => {
  it('is invalid when required core fields are missing', () => {
    const result = validateQuotation(
      'Forwarding',
      {}, // completely empty
      ctx({ incoterms: '' }),
    );
    expect(result.valid).toBe(false);
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('incoterms');
    expect(errorKeys).toContain('cargo_type');
    expect(errorKeys).toContain('cargo_nature');
    expect(errorKeys).toContain('commodity_description');
    expect(errorKeys).toContain('pol_aol');
    expect(errorKeys).toContain('pod_aod');
    expect(errorKeys).toContain('mode');
  });

  it('requires collection_address for EXW', () => {
    const result = validateQuotation(
      'Forwarding',
      {
        incoterms: 'EXW',
        cargo_type: 'Dry',
        cargo_nature: 'General Cargo',
        commodity_description: 'Goods',
        pol_aol: 'MNL',
        pod_aod: 'LAX',
        mode: 'FCL',
        containers: [{ id: '1', type: '20ft', qty: 1 }],
        // missing collection_address
      },
      ctx({ incoterms: 'EXW', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('collection_address');
  });

  it('requires delivery_address for DAP', () => {
    const result = validateQuotation(
      'Forwarding',
      {
        incoterms: 'DAP',
        cargo_type: 'Dry',
        cargo_nature: 'General Cargo',
        commodity_description: 'Goods',
        pol_aol: 'MNL',
        pod_aod: 'LAX',
        mode: 'FCL',
        containers: [{ id: '1', type: '20ft', qty: 1 }],
        // missing delivery_address
      },
      ctx({ incoterms: 'DAP', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('delivery_address');
  });

  it('does not require delivery_address for FOB', () => {
    const result = validateQuotation(
      'Forwarding',
      {
        incoterms: 'FOB',
        cargo_type: 'Dry',
        cargo_nature: 'General Cargo',
        commodity_description: 'Goods',
        pol_aol: 'MNL',
        pod_aod: 'LAX',
        mode: 'FCL',
        containers: [{ id: '1', type: '20ft', qty: 1 }],
      },
      ctx({ incoterms: 'FOB', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('delivery_address');
  });

  it('finds pol_aol from legacy aolPol key', () => {
    const result = validateQuotation(
      'Forwarding',
      {
        incoterms: 'FOB',
        cargo_type: 'Dry',
        cargo_nature: 'General Cargo',
        commodity_description: 'Goods',
        aolPol: 'MNL', // legacy
        pod_aod: 'LAX',
        mode: 'FCL',
        containers: [{ id: '1', type: '20ft', qty: 1 }],
      },
      ctx({ incoterms: 'FOB', mode: 'FCL' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('pol_aol');
  });
});

// ---------------------------------------------------------------------------
// Trucking
// ---------------------------------------------------------------------------

describe('validateQuotation — Trucking', () => {
  it('requires pull_out_location', () => {
    const result = validateQuotation('Trucking', {}, ctx());
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('pull_out_location');
  });

  it('requires trucking_line_items', () => {
    const result = validateQuotation('Trucking', { pull_out_location: 'Port' }, ctx());
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('trucking_line_items');
  });

  it('finds pull_out_location from legacy pullOut key', () => {
    const result = validateQuotation(
      'Trucking',
      {
        pullOut: 'Port Area', // legacy
        trucking_line_items: [{ destination: 'Pasay', truck_type: '10W', quantity: 1 }],
      },
      ctx(),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('pull_out_location');
  });
});

// ---------------------------------------------------------------------------
// Marine Insurance
// ---------------------------------------------------------------------------

describe('validateQuotation — Marine Insurance', () => {
  const required = ['commodity_description', 'pol_aol', 'pod_aod', 'invoice_value'];

  it.each(required)('requires %s', (key) => {
    const result = validateQuotation('Marine Insurance', {}, ctx());
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain(key);
  });
});

// ---------------------------------------------------------------------------
// Others
// ---------------------------------------------------------------------------

describe('validateQuotation — Others', () => {
  it('requires service_description', () => {
    const result = validateQuotation('Others', {}, ctx());
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('service_description');
  });

  it('is valid when service_description present', () => {
    const result = validateQuotation(
      'Others',
      { service_description: 'Permit processing' },
      ctx(),
    );
    expect(result.valid).toBe(true);
  });

  it('finds service_description from legacy serviceDescription key', () => {
    const result = validateQuotation(
      'Others',
      { serviceDescription: 'Permit processing' }, // legacy
      ctx(),
    );
    expect(result.valid).toBe(true);
  });
});
