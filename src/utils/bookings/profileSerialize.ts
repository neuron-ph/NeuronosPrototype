import type { ProfileSelectionValue, ProfileRefSnapshot } from '../../types/profiles';

/**
 * Type guard — true when a value is a ProfileSelectionValue object rather than
 * a legacy plain string.
 */
export function isProfileSelectionValue(v: unknown): v is ProfileSelectionValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    'label' in v &&
    'source' in v &&
    'profileType' in v
  );
}

/**
 * Normalize a raw form value for a profile-lookup field into a ProfileSelectionValue.
 * Legacy records store plain strings — wrap them as manual/unlinked.
 * Already-shaped values are returned as-is.
 */
export function normalizeProfileValue(
  raw: unknown,
  profileType: string,
): ProfileSelectionValue {
  if (isProfileSelectionValue(raw)) return raw;
  const label = typeof raw === 'string' ? raw : '';
  return { id: null, label, profileType, source: 'manual' };
}

/**
 * Extract the display string from a profile field value.
 * Works for both ProfileSelectionValue objects and legacy plain strings.
 */
export function profileValueToLabel(v: unknown): string {
  if (isProfileSelectionValue(v)) return v.label;
  if (typeof v === 'string') return v;
  return '';
}

/**
 * Build the ProfileRefSnapshot that gets stored in details.profile_refs[fieldKey].
 */
export function profileValueToRef(
  fieldKey: string,
  value: ProfileSelectionValue,
): ProfileRefSnapshot {
  return {
    profile_id: value.id,
    profile_type: value.profileType,
    label_snapshot: value.label,
    source: value.source,
  };
}

/**
 * Read a ProfileRefSnapshot from a booking's details.profile_refs object.
 * Returns null if the ref is absent or malformed (e.g. legacy record with no profile_refs).
 */
export function extractProfileRef(
  details: Record<string, unknown>,
  fieldKey: string,
): ProfileRefSnapshot | null {
  const refs = details.profile_refs;
  if (!refs || typeof refs !== 'object') return null;
  const ref = (refs as Record<string, unknown>)[fieldKey];
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  if (typeof r.label_snapshot !== 'string') return null;
  return {
    profile_id: typeof r.profile_id === 'string' ? r.profile_id : null,
    profile_type: typeof r.profile_type === 'string' ? r.profile_type : '',
    label_snapshot: r.label_snapshot,
    source: r.source === 'linked' ? 'linked' : 'manual',
  };
}

/**
 * Reconstruct a ProfileSelectionValue from persisted booking data.
 * Prefers the profile_refs metadata; falls back to the snapshot string alone.
 */
export function hydrateProfileValue(
  snapshotString: unknown,
  details: Record<string, unknown>,
  fieldKey: string,
  profileType: string,
): ProfileSelectionValue {
  const ref = extractProfileRef(details, fieldKey);
  if (ref) {
    return {
      id: ref.profile_id,
      label: ref.label_snapshot,
      profileType: ref.profile_type || profileType,
      source: ref.source,
    };
  }
  return normalizeProfileValue(snapshotString, profileType);
}

// ---------------------------------------------------------------------------
// Multi-select (array) helpers — used by multi-profile-lookup fields
// ---------------------------------------------------------------------------

/**
 * Read an array of ProfileRefSnapshots from details.profile_refs[fieldKey].
 * Returns an empty array if the entry is missing or not an array.
 */
export function extractProfileRefArray(
  details: Record<string, unknown>,
  fieldKey: string,
): ProfileRefSnapshot[] {
  const refs = details.profile_refs;
  if (!refs || typeof refs !== 'object') return [];
  const entry = (refs as Record<string, unknown>)[fieldKey];
  if (!Array.isArray(entry)) return [];
  return entry
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(r => ({
      profile_id: typeof r.profile_id === 'string' ? r.profile_id : null,
      profile_type: typeof r.profile_type === 'string' ? r.profile_type : '',
      label_snapshot: typeof r.label_snapshot === 'string' ? r.label_snapshot : '',
      source: r.source === 'linked' ? 'linked' : 'manual',
    }));
}

/**
 * Reconstruct an array of ProfileSelectionValue from persisted booking data.
 * Prefers details.profile_refs[fieldKey] (array shape); falls back to a string-array snapshot
 * stored at details[fieldKey] (legacy path), wrapping each entry as manual.
 */
export function hydrateProfileValueArray(
  snapshotArray: unknown,
  details: Record<string, unknown>,
  fieldKey: string,
  profileType: string,
): ProfileSelectionValue[] {
  const refs = extractProfileRefArray(details, fieldKey);
  if (refs.length > 0) {
    return refs.map(r => ({
      id: r.profile_id,
      label: r.label_snapshot,
      profileType: r.profile_type || profileType,
      source: r.source,
    }));
  }
  if (Array.isArray(snapshotArray)) {
    return snapshotArray
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map(label => ({ id: null, label, profileType, source: 'manual' as const }));
  }
  return [];
}

/** Build the array snapshot of profile refs to persist into details.profile_refs[fieldKey]. */
export function profileValueArrayToRefs(values: ProfileSelectionValue[]): ProfileRefSnapshot[] {
  return values.map(v => ({
    profile_id: v.id,
    profile_type: v.profileType,
    label_snapshot: v.label,
    source: v.source,
  }));
}
