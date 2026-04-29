import { supabase } from '../supabase/client';
import type {
  AssignmentProfileResolution,
  AssignmentProfileResolverInput,
  AssignmentProfileSubjectType,
  AssignmentProfileScopeKind,
  OperationalService,
  ServiceAssignmentRole,
} from '../../types/assignments';

/**
 * Unified assignment profile resolver.
 *
 * Unified assignment profile resolver. Reads from the canonical
 * assignment_profiles + assignment_profile_items tables.
 *
 * Precedence order:
 *   1. contact override          (exact dept + service scope)
 *   2. trade-party default       (exact service scope, Ops only)
 *   3. customer default          (exact dept + service scope)
 *   4. customer department default (dept-level, no service scope)
 *   5. service default           (operational_services + role catalog, Ops only)
 *   6. empty slots / none
 */
export async function resolveAssignmentProfile(
  input: AssignmentProfileResolverInput,
): Promise<AssignmentProfileResolution> {
  const { department, serviceType, customerId, contactId, tradePartyProfileId } = input;
  const isOps = department === 'Operations';

  // ── Service catalog (Ops only) ────────────────────────────────────────────
  const [service, opsRoles] = isOps
    ? await Promise.all([
        fetchService(serviceType ?? ''),
        fetchOpsRoles(serviceType ?? ''),
      ])
    : [null, [] as ServiceAssignmentRole[]];

  // Load all candidates in parallel, canonical tables only
  const [
    contactOverride,
    tradePartyDefault,
    customerServiceDefault,
    customerDeptDefault,
  ] =
    await Promise.all([
      contactId
        ? loadCanonicalProfile({ subjectType: 'contact', subjectId: contactId, department, serviceType: serviceType ?? null, scopeKind: 'override' })
        : null,
      isOps && tradePartyProfileId
        ? loadCanonicalProfile({ subjectType: 'trade_party', subjectId: tradePartyProfileId, department, serviceType: serviceType ?? null, scopeKind: 'default' })
        : null,
      customerId && serviceType
        ? loadCanonicalProfile({ subjectType: 'customer', subjectId: customerId, department, serviceType, scopeKind: 'default' })
        : null,
      customerId
        ? loadCanonicalProfile({ subjectType: 'customer', subjectId: customerId, department, serviceType: null, scopeKind: 'default' })
        : null,
    ]);

  return applyAssignmentPrecedence({
    contactOverride,
    tradePartyDefault,
    customerServiceDefault,
    customerDeptDefault,
    service,
    opsRoles,
    department,
    serviceType: serviceType ?? null,
  });
}

// ─── Pure logic (exported for tests) ─────────────────────────────────────────

export interface LoadedProfile {
  profileId:  string;
  subjectType: AssignmentProfileSubjectType;
  scopeKind:  AssignmentProfileScopeKind;
  teamPool:   { id: string | null; name: string | null };
  items:      Array<{ role_key: string; role_label: string; user_id: string; user_name: string; sort_order: number }>;
}

async function loadCanonicalProfile(params: {
  subjectType: AssignmentProfileSubjectType;
  subjectId:   string;
  department:  string;
  serviceType: string | null;
  scopeKind:   AssignmentProfileScopeKind;
}): Promise<LoadedProfile | null> {
  let query = supabase
    .from('assignment_profiles')
    .select('id, team_id, subject_type, scope_kind')
    .eq('subject_type', params.subjectType)
    .eq('subject_id',   params.subjectId)
    .eq('department',   params.department)
    .eq('scope_kind',   params.scopeKind)
    .eq('is_active',    true)
    .limit(1);

  query = params.serviceType
    ? query.eq('service_type', params.serviceType)
    : query.is('service_type', null);

  const { data: profile } = await query.maybeSingle();
  if (!profile) return null;

  const [{ data: items }, teamRow] = await Promise.all([
    supabase
      .from('assignment_profile_items')
      .select('role_key, role_label, user_id, user_name, sort_order')
      .eq('profile_id', profile.id)
      .order('sort_order'),
    profile.team_id
      ? supabase.from('teams').select('id, name').eq('id', profile.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!items || items.length === 0) return null;

  return {
    profileId:   profile.id,
    subjectType: params.subjectType,
    scopeKind:   params.scopeKind,
    teamPool: {
      id:   (teamRow?.data as { id: string; name: string } | null)?.id ?? null,
      name: (teamRow?.data as { id: string; name: string } | null)?.name ?? null,
    },
    items: items.map((i) => ({
      role_key:   i.role_key,
      role_label: i.role_label,
      user_id:    i.user_id,
      user_name:  i.user_name,
      sort_order: i.sort_order,
    })),
  };
}

async function fetchService(serviceType: string): Promise<OperationalService | null> {
  if (!serviceType) return null;
  const { data } = await supabase
    .from('operational_services')
    .select('*')
    .eq('service_type', serviceType)
    .maybeSingle();
  return (data ?? null) as OperationalService | null;
}

async function fetchOpsRoles(serviceType: string): Promise<ServiceAssignmentRole[]> {
  if (!serviceType) return [];
  const { data } = await supabase
    .from('service_assignment_roles')
    .select('*')
    .eq('service_type', serviceType)
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as ServiceAssignmentRole[];
}

/**
 * Pure precedence resolver — takes pre-loaded candidates and applies the
 * 5-level precedence without any IO. Exported for unit testing.
 */
export function applyAssignmentPrecedence(params: {
  contactOverride:        LoadedProfile | null;
  tradePartyDefault:      LoadedProfile | null;
  customerServiceDefault: LoadedProfile | null;
  customerDeptDefault:    LoadedProfile | null;
  service:                OperationalService | null;
  opsRoles:               ServiceAssignmentRole[];
  department:             string;
  serviceType:            string | null;
}): AssignmentProfileResolution {
  const { contactOverride, tradePartyDefault, customerServiceDefault,
          customerDeptDefault, service, opsRoles, department, serviceType } = params;
  const isOps = department === 'Operations';

  if (contactOverride) {
    return buildResolution({ match: contactOverride, service, opsRoles, department, serviceType, source: 'contact_override' });
  }
  if (tradePartyDefault) {
    return buildResolution({ match: tradePartyDefault, service, opsRoles, department, serviceType, source: 'trade_party_default' });
  }
  if (customerServiceDefault) {
    return buildResolution({ match: customerServiceDefault, service, opsRoles, department, serviceType, source: 'customer_default' });
  }
  if (customerDeptDefault) {
    return buildResolution({ match: customerDeptDefault, service, opsRoles, department, serviceType, source: 'department_default' });
  }

  const baseSlots = buildBaseSlots(opsRoles);
  return {
    service:     isOps ? serviceProjection(service, serviceType ?? '') : null,
    teamPool:    { id: null, name: null },
    roles:       opsRoles,
    assignments: baseSlots,
    source:      (isOps && service) ? 'service_default' : 'none',
    scopeMeta:   { profileId: null, subjectType: null, scopeKind: null },
  };
}

export function buildBaseSlots(
  roles: ServiceAssignmentRole[],
): AssignmentProfileResolution['assignments'] {
  return roles.map((r) => ({
    role_key:       r.role_key,
    role_label:     r.role_label,
    required:       r.required,
    allow_multiple: r.allow_multiple,
    sort_order:     r.sort_order,
    user_id:        null,
    user_name:      null,
  }));
}

export function applyItemsToSlots(
  baseSlots: AssignmentProfileResolution['assignments'],
  items: Array<{ role_key: string; user_id: string; user_name: string }>,
): AssignmentProfileResolution['assignments'] {
  return baseSlots.map((slot) => {
    const hit = items.find((i) => i.role_key === slot.role_key);
    return hit ? { ...slot, user_id: hit.user_id, user_name: hit.user_name } : slot;
  });
}

export function buildFreeformSlots(
  items: LoadedProfile['items'],
): AssignmentProfileResolution['assignments'] {
  return items.map((item) => ({
    role_key:       item.role_key,
    role_label:     item.role_label,
    required:       false,
    allow_multiple: false,
    sort_order:     item.sort_order,
    user_id:        item.user_id,
    user_name:      item.user_name,
  }));
}

export function serviceProjection(
  service: OperationalService | null,
  fallbackServiceType: string,
): AssignmentProfileResolution['service'] {
  return {
    service_type:        service?.service_type ?? fallbackServiceType,
    label:               service?.label        ?? fallbackServiceType,
    default_manager_id:   service?.default_manager_id   ?? null,
    default_manager_name: service?.default_manager_name ?? null,
  };
}

function buildResolution(params: {
  match:       LoadedProfile;
  service:     OperationalService | null;
  opsRoles:    ServiceAssignmentRole[];
  department:  string;
  serviceType: string | null;
  source:      AssignmentProfileResolution['source'];
}): AssignmentProfileResolution {
  const { match, service, opsRoles, department, serviceType, source } = params;
  const isOps = department === 'Operations';

  const roles: AssignmentProfileResolution['roles'] = isOps
    ? opsRoles.map((r) => ({
        role_key:       r.role_key,
        role_label:     r.role_label,
        required:       r.required,
        allow_multiple: r.allow_multiple,
        sort_order:     r.sort_order,
      }))
    : match.items.map((item) => ({
        role_key:       item.role_key,
        role_label:     item.role_label,
        required:       false,
        allow_multiple: false,
        sort_order:     item.sort_order,
      }));

  const assignments = isOps
    ? applyItemsToSlots(buildBaseSlots(opsRoles), match.items)
    : buildFreeformSlots(match.items);

  return {
    service:     isOps ? serviceProjection(service, serviceType ?? '') : null,
    teamPool:    match.teamPool,
    roles,
    assignments,
    source,
    scopeMeta: {
      profileId:   match.profileId,
      subjectType: match.subjectType,
      scopeKind:   match.scopeKind,
    },
  };
}
