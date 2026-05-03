import { describe, it, expect } from 'vitest';
import {
  serviceTypeToScope,
  readNamespacedRef,
  isLegacyProfileRefs,
  migrateLegacyProfileRefs,
  readProfileRefsFromDetails,
} from './profileRefsKey';
import type { ProfileRefSnapshot } from '../../types/profiles';

const portRef = (label: string, id: string | null = null): ProfileRefSnapshot => ({
  profile_id: id,
  profile_type: 'port',
  label_snapshot: label,
  source: id ? 'linked' : 'manual',
});

describe('serviceTypeToScope', () => {
  it('lowercases and underscore-normalizes service_type strings', () => {
    expect(serviceTypeToScope('Brokerage')).toBe('brokerage');
    expect(serviceTypeToScope('Marine Insurance')).toBe('marine_insurance');
    expect(serviceTypeToScope('Forwarding')).toBe('forwarding');
    expect(serviceTypeToScope('Trucking')).toBe('trucking');
  });

  it('returns null for unknown or empty service_type', () => {
    expect(serviceTypeToScope('Others')).toBeNull();
    expect(serviceTypeToScope('')).toBeNull();
    expect(serviceTypeToScope(null)).toBeNull();
    expect(serviceTypeToScope(undefined)).toBeNull();
  });
});

describe('readNamespacedRef', () => {
  it('returns the ref under the given service scope and field key', () => {
    const refs = {
      brokerage: { pod_aod: portRef('PHMNL', 'p1') },
      forwarding: { pod_aod: portRef('VNHAN', 'p2') },
    };
    expect(readNamespacedRef(refs, 'brokerage', 'pod_aod')?.label_snapshot).toBe('PHMNL');
    expect(readNamespacedRef(refs, 'forwarding', 'pod_aod')?.label_snapshot).toBe('VNHAN');
  });

  it('returns null when the scope or field is absent', () => {
    expect(readNamespacedRef({}, 'brokerage', 'pod_aod')).toBeNull();
    expect(readNamespacedRef({ brokerage: {} }, 'brokerage', 'pod_aod')).toBeNull();
    expect(readNamespacedRef(null, 'brokerage', 'pod_aod')).toBeNull();
    expect(readNamespacedRef(undefined, 'brokerage', 'pod_aod')).toBeNull();
  });
});

describe('isLegacyProfileRefs', () => {
  it('detects flat refs by looking for profile_type at the value level', () => {
    expect(isLegacyProfileRefs({ pod_aod: portRef('PHMNL') })).toBe(true);
  });

  it('returns false for namespaced refs', () => {
    expect(isLegacyProfileRefs({ brokerage: { pod_aod: portRef('PHMNL') } })).toBe(false);
  });

  it('returns false for empty bag, null, or non-object', () => {
    expect(isLegacyProfileRefs({})).toBe(false);
    expect(isLegacyProfileRefs(null)).toBe(false);
    expect(isLegacyProfileRefs('foo')).toBe(false);
  });
});

describe('migrateLegacyProfileRefs', () => {
  it('fans the same legacy ref out to every service that uses that field key', () => {
    const legacy = { pod_aod: portRef('PHMNL', 'p1'), country_of_origin: portRef('CN', 'c1') };
    const migrated = migrateLegacyProfileRefs(legacy, ['brokerage', 'forwarding', 'marine_insurance']);
    expect(migrated.brokerage?.pod_aod?.label_snapshot).toBe('PHMNL');
    expect(migrated.forwarding?.pod_aod?.label_snapshot).toBe('PHMNL');
    expect(migrated.marine_insurance?.pod_aod?.label_snapshot).toBe('PHMNL');
    // country_of_origin is brokerage-only
    expect(migrated.brokerage?.country_of_origin?.label_snapshot).toBe('CN');
    expect(migrated.forwarding?.country_of_origin).toBeUndefined();
  });

  it('skips services that aren\'t present in the quotation', () => {
    const legacy = { pod_aod: portRef('PHMNL', 'p1') };
    const migrated = migrateLegacyProfileRefs(legacy, ['brokerage']);
    expect(migrated.brokerage?.pod_aod).toBeDefined();
    expect(migrated.forwarding).toBeUndefined();
    expect(migrated.marine_insurance).toBeUndefined();
  });

  it('skips field keys not declared for a scope', () => {
    const legacy = { pol_aol: portRef('CNSHA', 'p9') };
    // Brokerage does not use pol_aol
    const migrated = migrateLegacyProfileRefs(legacy, ['brokerage']);
    expect(migrated.brokerage?.pol_aol).toBeUndefined();
  });
});

describe('readProfileRefsFromDetails', () => {
  it('returns empty bag when details is null/undefined or has no profile_refs', () => {
    expect(readProfileRefsFromDetails(null, ['brokerage'])).toEqual({});
    expect(readProfileRefsFromDetails({}, ['brokerage'])).toEqual({});
    expect(readProfileRefsFromDetails({ profile_refs: null }, ['brokerage'])).toEqual({});
  });

  it('returns the namespaced bag verbatim when already namespaced', () => {
    const bag = { brokerage: { pod_aod: portRef('PHMNL') }, forwarding: { pol_aol: portRef('CNSHA') } };
    expect(readProfileRefsFromDetails({ profile_refs: bag }, ['brokerage', 'forwarding'])).toEqual(bag);
  });

  it('migrates legacy flat refs into the namespaced shape', () => {
    const legacy = { pod_aod: portRef('PHMNL', 'p1') };
    const result = readProfileRefsFromDetails(
      { profile_refs: legacy },
      ['brokerage', 'forwarding'],
    );
    expect(result.brokerage?.pod_aod?.label_snapshot).toBe('PHMNL');
    expect(result.forwarding?.pod_aod?.label_snapshot).toBe('PHMNL');
  });
});

describe('multi-service collision (the regression this fix targets)', () => {
  it('lets Forwarding and Marine Insurance hold independent pod_aod selections', () => {
    // Build the namespaced bag the way QuotationBuilderV3 saveQuotation now does
    const profile_refs = {
      forwarding: { pod_aod: portRef('VNHAN', 'fp') },
      marine_insurance: { pod_aod: portRef('PHMNL', 'mp') },
    };
    expect(readNamespacedRef(profile_refs, 'forwarding', 'pod_aod')?.profile_id).toBe('fp');
    expect(readNamespacedRef(profile_refs, 'marine_insurance', 'pod_aod')?.profile_id).toBe('mp');
  });
});

describe('unlink semantics (the regression this fix targets)', () => {
  it('rebuild-from-scratch model: an empty refs bag means no refs persist', () => {
    // Simulates: user had a linked ref, cleared the field, save runs.
    // recordProfileRef would not have been called, so profile_refs ends up {}.
    // The saved details.profile_refs is exactly that — no leak from prior bag.
    const newRefs = {};
    expect(readNamespacedRef(newRefs, 'brokerage', 'pod_aod')).toBeNull();
  });
});
