import type { ProfileRefSnapshot } from '../../types/profiles';

/**
 * Service scope keys for namespacing quotation profile refs. Match the lowercased
 * service_type from services_metadata.
 */
export type QuotationServiceScope = 'brokerage' | 'forwarding' | 'trucking' | 'marine_insurance';

/**
 * The persisted shape of `quotation.details.profile_refs` after this pass.
 * Each service has its own bucket so that fields sharing a key across services
 * (e.g. pod_aod in Brokerage, Forwarding, and Marine Insurance) don't collide.
 *
 * Legacy quotations may store a flat `Record<string, ProfileRefSnapshot>`;
 * `migrateLegacyProfileRefs` upgrades them on load.
 */
export type NamespacedProfileRefs = Partial<Record<QuotationServiceScope, Record<string, ProfileRefSnapshot>>>;

const ALL_SCOPES: QuotationServiceScope[] = ['brokerage', 'forwarding', 'trucking', 'marine_insurance'];

/** Lowercase + underscore-normalize a service_type string into a scope key. */
export function serviceTypeToScope(serviceType: string | null | undefined): QuotationServiceScope | null {
  if (!serviceType) return null;
  const normalized = serviceType.trim().toLowerCase().replace(/\s+/g, '_');
  if ((ALL_SCOPES as string[]).includes(normalized)) return normalized as QuotationServiceScope;
  return null;
}

/**
 * Read a profile ref out of a namespaced refs bag for a given service+fieldKey.
 * Returns null if absent.
 */
export function readNamespacedRef(
  refs: NamespacedProfileRefs | null | undefined,
  scope: QuotationServiceScope,
  fieldKey: string,
): ProfileRefSnapshot | null {
  if (!refs || typeof refs !== 'object') return null;
  const bucket = refs[scope];
  if (!bucket || typeof bucket !== 'object') return null;
  const raw = bucket[fieldKey];
  if (!raw || typeof raw !== 'object') return null;
  return raw as ProfileRefSnapshot;
}

/**
 * Detects whether a stored profile_refs bag is in the legacy flat shape
 * (keys are field names) vs the namespaced shape (keys are service scopes).
 * A bag is considered legacy if any top-level value looks like a snapshot
 * (has `profile_type`) rather than a sub-bucket of refs.
 */
export function isLegacyProfileRefs(refs: unknown): refs is Record<string, ProfileRefSnapshot> {
  if (!refs || typeof refs !== 'object') return false;
  for (const v of Object.values(refs as Record<string, unknown>)) {
    if (v && typeof v === 'object' && 'profile_type' in (v as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
}

/**
 * Best-effort migration of a legacy flat refs bag into a namespaced one.
 * Each legacy ref is fanned out to every service that's actually present in
 * the quotation and that uses that fieldKey, so no service silently loses a
 * ref it had before. The first save after load replaces the legacy shape.
 */
export function migrateLegacyProfileRefs(
  legacy: Record<string, ProfileRefSnapshot>,
  servicesPresent: QuotationServiceScope[],
): NamespacedProfileRefs {
  const out: NamespacedProfileRefs = {};
  // Field keys per service — must match the keys recordProfileRef uses on save.
  const fieldsByScope: Record<QuotationServiceScope, string[]> = {
    brokerage: ['pod_aod', 'country_of_origin'],
    forwarding: ['pol_aol', 'pod_aod', 'carrier_airline'],
    trucking: [],
    marine_insurance: ['pol_aol', 'pod_aod'],
  };
  for (const scope of servicesPresent) {
    const fields = fieldsByScope[scope] ?? [];
    for (const f of fields) {
      const ref = legacy[f];
      if (ref) {
        const bucket = (out[scope] ??= {});
        bucket[f] = ref;
      }
    }
  }
  return out;
}

/**
 * Read profile refs from `quotation.details`, normalizing legacy flat shape
 * into a namespaced shape. Always returns a NamespacedProfileRefs (possibly empty).
 */
export function readProfileRefsFromDetails(
  details: Record<string, unknown> | null | undefined,
  servicesPresent: QuotationServiceScope[],
): NamespacedProfileRefs {
  if (!details) return {};
  const raw = (details as { profile_refs?: unknown }).profile_refs;
  if (!raw || typeof raw !== 'object') return {};
  if (isLegacyProfileRefs(raw)) {
    return migrateLegacyProfileRefs(raw, servicesPresent);
  }
  return raw as NamespacedProfileRefs;
}
