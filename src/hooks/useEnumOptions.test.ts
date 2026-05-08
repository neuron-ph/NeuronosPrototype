import { describe, expect, it } from 'vitest';
import { ENUM_SEEDS } from './useEnumOptions';

describe('useEnumOptions seed fallbacks', () => {
  it('includes customer industries in the seed map', () => {
    expect(ENUM_SEEDS.industry).toContain('Garments');
    expect(ENUM_SEEDS.industry).toContain('Garments/Textile');
    expect(ENUM_SEEDS.industry).toContain('Food & Beverage');
  });

  it('includes lead sources in the seed map', () => {
    expect(ENUM_SEEDS.lead_source).toEqual([
      'Referral',
      'Trade Show',
      'Cold Outreach',
      'Website',
    ]);
  });
});
