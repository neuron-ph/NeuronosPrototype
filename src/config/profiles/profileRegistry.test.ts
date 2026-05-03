import { describe, it, expect } from 'vitest';
import { profileRegistry } from './profileRegistry';

const EXPECTED_ADMIN_TYPES = [
  'port',
  'warehouse',
  'country',
  'carrier',
  'forwarder',
  'consolidator',
  'shipping_line',
  'trucking_company',
  'insurer',
  'driver',
  'helper',
  'vehicle',
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
  it('exposes exactly the 12 expected sections as flat admin entries', () => {
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

  it('service_provider sections all use arrayContainsFilter on booking_profile_tags', () => {
    const serviceProviderTypes = ['carrier', 'forwarder', 'consolidator', 'shipping_line', 'trucking_company', 'insurer'];
    for (const t of serviceProviderTypes) {
      const admin = profileRegistry[t]?.admin;
      expect(admin?.arrayContainsFilter?.booking_profile_tags).toBe(t);
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
