import type { ProfileLookupRecord } from '../../types/profiles';

/**
 * Every profile source must implement this interface.
 * Adapters normalize source-specific rows into the shared ProfileLookupRecord shape
 * so that ProfileLookupCombobox doesn't need to know about the underlying table.
 */
export interface ProfileAdapter {
  profileType: string;
  /**
   * Search for records matching `query`. Returns up to `limit` results.
   * If `providerTag` is provided, results are filtered to service_providers
   * with that tag in their booking_profile_tags array.
   * If `serviceType` is provided, catalog adapters scope results to that booking type.
   */
  search(query: string, options?: { limit?: number; providerTag?: string; providerScope?: 'local' | 'overseas'; serviceType?: string }): Promise<ProfileLookupRecord[]>;
  /**
   * Fetch a single record by ID (used to re-validate a previously linked profile).
   * Returns null if the record is archived or not found.
   */
  fetchById(id: string): Promise<ProfileLookupRecord | null>;
}

// ---------------------------------------------------------------------------
// Normalization helpers used by concrete adapters
// ---------------------------------------------------------------------------

export function toRecord(
  id: string,
  label: string,
  profileType: string,
  isActive: boolean,
  meta?: Record<string, unknown>,
): ProfileLookupRecord {
  return { id, label, profileType, status: isActive ? 'active' : 'archived', meta };
}
