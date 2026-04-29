/**
 * V1 team-structure types.
 *
 * Service / Team / Assignment Role / Default / Booking Assignment are separate
 * concepts. The legacy team-profile types in src/types/bd.ts continue to work
 * for older code paths during the rollout.
 */

// ─── Canonical profile types (Phase 1 — 067_canonical_assignment_profiles) ───

export type AssignmentProfileSubjectType = 'customer' | 'contact' | 'trade_party';
export type AssignmentProfileScopeKind   = 'default' | 'override' | 'ownership';

export type AssignmentProfileSource =
  | 'contact_override'
  | 'trade_party_default'
  | 'customer_default'
  | 'department_default'
  | 'service_default'
  | 'legacy_fallback'
  | 'manual'
  | 'none';

export interface AssignmentProfile {
  id:           string;
  subject_type: AssignmentProfileSubjectType;
  subject_id:   string;
  customer_id:  string | null;
  department:   string;
  service_type: string | null;
  team_id:      string | null;
  scope_kind:   AssignmentProfileScopeKind;
  source_label: string | null;
  notes:        string | null;
  is_active:    boolean;
  created_by:   string | null;
  updated_by:   string | null;
  created_at:   string;
  updated_at:   string;
}

export interface AssignmentProfileItem {
  id:         string;
  profile_id: string;
  role_key:   string;
  role_label: string;
  user_id:    string;
  user_name:  string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Input shape for the replace_assignment_profile_atomic RPC. */
export interface AssignmentProfileUpsertInput {
  subjectType:  AssignmentProfileSubjectType;
  subjectId:    string;
  customerId:   string | null;
  department:   string;
  serviceType?: string | null;
  scopeKind?:   AssignmentProfileScopeKind;
  teamId?:      string | null;
  assignments:  Array<{ role_key: string; role_label: string; user_id: string; user_name: string }>;
}

/**
 * Resolved profile shape returned by resolveAssignmentProfile.
 * Covers both Ops (service-scoped, role-catalog slots) and non-Ops
 * (dept-level, freeform slots).
 */
export interface AssignmentProfileResolution {
  service: {
    service_type:        string;
    label:               string;
    default_manager_id:   string | null;
    default_manager_name: string | null;
  } | null;
  teamPool: { id: string | null; name: string | null };
  /** Role catalog slots for Ops; freeform items for non-Ops. */
  roles: Array<{
    role_key:       string;
    role_label:     string;
    required:       boolean;
    allow_multiple: boolean;
    sort_order:     number;
  }>;
  assignments: Array<{
    role_key:       string;
    role_label:     string;
    required:       boolean;
    allow_multiple: boolean;
    sort_order:     number;
    user_id:        string | null;
    user_name:      string | null;
  }>;
  source:    AssignmentProfileSource;
  scopeMeta: {
    profileId:   string | null;
    subjectType: AssignmentProfileSubjectType | null;
    scopeKind:   AssignmentProfileScopeKind | null;
  };
}

export interface AssignmentProfileResolverInput {
  department:          string;
  serviceType?:        string | null;
  customerId?:         string | null;
  contactId?:          string | null;
  tradePartyProfileId?: string | null;
}

// ─── Legacy types (kept for backward-compat during rollout) ──────────────────

export type AssignmentSubjectType = 'customer' | 'trade_party';

export type BookingAssignmentSource =
  | 'service_default'
  | 'customer_default'
  | 'trade_party_default'
  | 'manual'
  | 'legacy';

/** @deprecated — use AssignmentProfileSource from the canonical resolver */
export type AssignmentResolutionSource =
  | 'trade_party_default'
  | 'customer_default'
  | 'service_default'
  | 'none';

export interface OperationalService {
  id: string;
  service_type: string;
  label: string;
  department: string;
  default_manager_id: string | null;
  default_manager_name: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceAssignmentRole {
  id: string;
  service_type: string;
  role_key: string;
  role_label: string;
  required: boolean;
  allow_multiple: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentDefaultProfile {
  id: string;
  subject_type: AssignmentSubjectType;
  subject_id: string;
  customer_id: string | null;
  service_type: string;
  team_id: string | null;
  source_label: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentDefaultItem {
  id: string;
  profile_id: string;
  role_key: string;
  role_label: string;
  user_id: string;
  user_name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BookingAssignment {
  id: string;
  booking_id: string;
  service_type: string;
  role_key: string;
  role_label: string;
  user_id: string;
  user_name: string;
  source: BookingAssignmentSource;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pending shape used by forms before a booking exists. Inserts of these become
 * BookingAssignment rows once the booking has an id.
 */
export interface BookingAssignmentInput {
  role_key: string;
  role_label: string;
  user_id: string;
  user_name: string;
  source?: BookingAssignmentSource;
}

export interface AssignmentResolverInput {
  customerId: string | null | undefined;
  tradePartyProfileId?: string | null;
  serviceType: string;
}

export interface ResolvedAssignment {
  /** Slot definition driving the form. */
  role_key: string;
  role_label: string;
  required: boolean;
  allow_multiple: boolean;
  sort_order: number;
  /** Resolved default user (if any). */
  user_id: string | null;
  user_name: string | null;
}

export interface AssignmentResolution {
  service: {
    service_type: string;
    label: string;
    default_manager_id: string | null;
    default_manager_name: string | null;
  } | null;
  teamPool: {
    id: string | null;
    name: string | null;
  };
  roles: ServiceAssignmentRole[];
  assignments: ResolvedAssignment[];
  source: AssignmentResolutionSource;
}

/**
 * Compatibility projection — the legacy bookings columns derived from a set of
 * booking_assignments rows. Used by the create/detail flows so existing
 * dashboards and list filters keep working until they migrate.
 */
export interface BookingAssignmentProjection {
  team_id: string | null;
  team_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  handler_id: string | null;
  handler_name: string | null;
}
