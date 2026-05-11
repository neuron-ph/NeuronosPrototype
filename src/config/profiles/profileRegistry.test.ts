import { describe, it, expect } from 'vitest';
import { profileRegistry } from './profileRegistry';

const EXPECTED_ADMIN_TYPES = [
  'country',
  'port',
  'warehouse',
  'carrier',
  'forwarder',
  'consolidator',
  'shipping_line',
  'trucking_company',
  'insurer',
  'driver',
  'helper',
  'vehicle',
  'industry',
  'lead_source',
  'mode',
  'movement',
  'incoterms',
  'cargo_type',
  'cargo_nature',
  'brokerage_type',
  'customs_entry',
  'customs_entry_procedure',
  'truck_type',
  'selectivity_color',
  'examination',
  'container_type',
  'package_type',
  'preferential_treatment',
  'credit_terms',
  'cpe_code',
];

const EXPECTED_NON_ADMIN_TYPES = [
  'customer',           // CRM
  'user',               // Auth
  'consignee_or_shipper', // covered by per-customer consignee/shipper lists
  'consignee',          // managed inside each Customer's profile, not as a flat section
  'shipper',            // managed inside each Customer's profile, not as a flat section
  'agent',              // legacy stub — kept so old booking data resolves
  'overseas_agent',     // derived view of Vendors filtered by provider_type='international'
  'local_agent',        // derived view of Vendors filtered by country='Philippines'
];

describe('profileRegistry admin metadata', () => {
  it('exposes exactly the expected admin profiling sections', () => {
    const adminTypes = Object.entries(profileRegistry)
      .filter(([, e]) => !!e.admin)
      .map(([k]) => k)
      .sort();
    expect(adminTypes).toEqual([...EXPECTED_ADMIN_TYPES].sort());
  });

  it('does not declare admin metadata for CRM/auth/composite types', () => {
    for (const t of EXPECTED_NON_ADMIN_TYPES) {
      expect(profileRegistry[t]?.admin).toBeUndefined();
    }
  });

  it('every admin entry has non-empty pluralLabel, columns, and formFields', () => {
    for (const t of EXPECTED_ADMIN_TYPES) {
      const admin = profileRegistry[t]?.admin;
      expect(admin, `expected admin metadata for ${t}`).toBeDefined();
      expect(admin!.pluralLabel.length, `pluralLabel empty for ${t}`).toBeGreaterThan(0);
      expect(admin!.columns.length, `columns empty for ${t}`).toBeGreaterThan(0);
      expect(admin!.formFields.length, `formFields empty for ${t}`).toBeGreaterThan(0);
    }
  });

  it('vendor-profile sections are decoupled into standalone profile tables', () => {
    const decoupled: Array<[string, string]> = [
      ['carrier', 'profile_carriers'],
      ['forwarder', 'profile_forwarders'],
      ['shipping_line', 'profile_shipping_lines'],
      ['trucking_company', 'profile_trucking_companies'],
      ['consolidator', 'profile_consolidators'],
      ['insurer', 'profile_insurers'],
    ];
    for (const [profileType, expectedSource] of decoupled) {
      const entry = profileRegistry[profileType];
      expect(entry?.source, `${profileType} source`).toBe(expectedSource);
      expect(entry?.admin?.columns[0]?.key, `${profileType} primary column`).toBe('name');
      expect(entry?.admin?.arrayContainsFilter, `${profileType} arrayContainsFilter`).toBeUndefined();
      expect(entry?.providerTag, `${profileType} providerTag`).toBeUndefined();
    }
  });

  it('trade-party types are managed inside each Customer profile, not as flat sections', () => {
    expect(profileRegistry.consignee?.admin).toBeUndefined();
    expect(profileRegistry.shipper?.admin).toBeUndefined();
  });

  it('location sections filter on kind', () => {
    expect(profileRegistry.port?.admin?.filter?.kind).toBe('port');
    expect(profileRegistry.warehouse?.admin?.filter?.kind).toBe('warehouse');
  });

  it('dispatch_people sections filter on type', () => {
    expect(profileRegistry.driver?.admin?.filter?.type).toBe('driver');
    expect(profileRegistry.helper?.admin?.filter?.type).toBe('helper');
  });
});
