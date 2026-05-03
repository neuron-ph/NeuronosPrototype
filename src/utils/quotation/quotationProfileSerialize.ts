import type { ProfileSelectionValue, ProfileRefSnapshot } from '../../types/profiles';

/**
 * Convert an in-memory ProfileSelectionValue into the persisted ref snapshot
 * shape stored at quotation.details.profile_refs[fieldKey]. Mirrors the booking
 * serialization so that quotation and booking ref payloads stay interchangeable.
 */
export function quotationProfileValueToRef(
  profileType: string,
  value: ProfileSelectionValue,
): ProfileRefSnapshot {
  return {
    profile_id: value.id ?? null,
    profile_type: value.profileType || profileType,
    label_snapshot: value.label ?? '',
    source: value.source === 'linked' ? 'linked' : 'manual',
  };
}

/**
 * Read a ProfileRefSnapshot from the persisted quotation details bag.
 * Returns null if no ref is present for the given fieldKey.
 */
export function readQuotationProfileRef(
  details: Record<string, unknown> | null | undefined,
  fieldKey: string,
): ProfileRefSnapshot | null {
  if (!details || typeof details !== 'object') return null;
  const refs = (details as { profile_refs?: Record<string, unknown> }).profile_refs;
  if (!refs || typeof refs !== 'object') return null;
  const raw = (refs as Record<string, unknown>)[fieldKey];
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const profileId = r.profile_id;
  const profileType = r.profile_type;
  const labelSnapshot = r.label_snapshot;
  if (typeof profileType !== 'string') return null;
  return {
    profile_id: typeof profileId === 'string' ? profileId : profileId == null ? null : String(profileId),
    profile_type: profileType,
    label_snapshot: typeof labelSnapshot === 'string' ? labelSnapshot : '',
    source: r.source === 'linked' ? 'linked' : 'manual',
  };
}

/**
 * Coerce a profile-backed quotation field value (ProfileSelectionValue, plain
 * string snapshot, null, or undefined) into a display label string.
 */
export function quotationProfileValueToLabel(
  value: ProfileSelectionValue | string | null | undefined,
): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value.label ?? '';
}
