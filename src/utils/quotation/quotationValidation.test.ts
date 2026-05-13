import { describe, it, expect } from 'vitest';
import { validateQuotation } from './quotationValidation';
import type { QuotationFormContext } from '../../config/quotation/quotationFieldTypes';

// Submit-time validation policy: only fields with required:'yes' in the schema
// block submission. Per-service shipment fields are advisory, not gating.

function ctx(overrides?: Partial<QuotationFormContext>): QuotationFormContext {
  return { service_type: '', brokerage_type: '', incoterms: '', mode: '', ...overrides };
}

describe('validateQuotation — Brokerage', () => {
  it('errors when brokerage_type is missing', () => {
    const result = validateQuotation('Brokerage', {}, ctx());
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).toContain('brokerage_type');
  });

  it('is valid when only brokerage_type is set', () => {
    const result = validateQuotation(
      'Brokerage',
      { brokerageType: 'Standard' },
      ctx({ brokerage_type: 'Standard' }),
    );
    expect(result.valid).toBe(true);
  });

  it('does not require shipment detail fields at submit time', () => {
    const result = validateQuotation(
      'Brokerage',
      { brokerageType: 'Standard' },
      ctx({ brokerage_type: 'Standard' }),
    );
    const errorKeys = result.errors.map(e => e.fieldKey);
    expect(errorKeys).not.toContain('pod_aod');
    expect(errorKeys).not.toContain('mode');
    expect(errorKeys).not.toContain('cargo_type');
    expect(errorKeys).not.toContain('commodity_description');
    expect(errorKeys).not.toContain('delivery_address');
    expect(errorKeys).not.toContain('containers');
    expect(errorKeys).not.toContain('gross_weight');
  });
});

describe('validateQuotation — Forwarding', () => {
  it('is valid with empty data (no required service fields)', () => {
    const result = validateQuotation('Forwarding', {}, ctx());
    expect(result.valid).toBe(true);
  });
});

describe('validateQuotation — Trucking', () => {
  it('is valid with empty data (no required service fields)', () => {
    const result = validateQuotation('Trucking', {}, ctx());
    expect(result.valid).toBe(true);
  });
});

describe('validateQuotation — Marine Insurance', () => {
  it('is valid with empty data (no required service fields)', () => {
    const result = validateQuotation('Marine Insurance', {}, ctx());
    expect(result.valid).toBe(true);
  });
});

describe('validateQuotation — Others', () => {
  it('is valid with empty data (no required service fields)', () => {
    const result = validateQuotation('Others', {}, ctx());
    expect(result.valid).toBe(true);
  });
});
