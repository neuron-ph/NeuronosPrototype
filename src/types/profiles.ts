// ---------------------------------------------------------------------------
// Core profile type contracts — used across booking forms, profile module, adapters
// ---------------------------------------------------------------------------

/**
 * In-memory shape for a profile field in a booking form.
 * Stores both the resolved display label and the live profile link (if any).
 * A plain-string legacy value is normalized into this shape on load.
 */
export type ProfileSelectionValue = {
  id: string | null;
  label: string;
  profileType: string;
  source: 'linked' | 'manual';
};

/**
 * Persisted metadata stored in bookings.details.profile_refs[fieldKey].
 * Always written alongside the human-readable snapshot string so that
 * detail views can show the label even if the live record is unavailable.
 */
export type ProfileRefSnapshot = {
  profile_id: string | null;
  profile_type: string;
  label_snapshot: string;
  source: 'linked' | 'manual';
};

/**
 * Normalized shape that all profile source adapters must return.
 * Drives the ProfileLookupCombobox dropdown list.
 */
export type ProfileLookupRecord = {
  id: string;
  label: string;
  profileType: string;
  status: 'active' | 'archived';
  meta?: Record<string, unknown>;
};

/**
 * Per-profile-type config entry in the profileRegistry.
 */
export type ProfileRegistryEntry = {
  /** Which Supabase table or adapter provides records for this type. */
  source: 'customers' | 'users' | 'service_providers' | 'trade_parties' | 'profile_locations' | 'profile_countries' | 'dispatch_people' | 'vehicles';
  /** Fields to search against in the lookup query. */
  searchFields: string[];
  /** Whether free-text entry is allowed as a fallback ('combo') or not ('strict'). */
  strictness: 'strict' | 'combo';
  /** Whether privileged users can quick-create a new record inline. */
  quickCreateAllowed: boolean;
  /** Tag filter applied when source = 'service_providers'. */
  providerTag?: string;
  /** Seed strategy for this profile type, if applicable. */
  seedStrategy?: 'stable-list' | 'backfill' | 'none';
};
