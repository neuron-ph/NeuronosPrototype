import { supabase } from '../supabase/client';
import type {
  AssignmentResolution,
  AssignmentResolverInput,
  OperationalService,
  ResolvedAssignment,
  ServiceAssignmentRole,
} from '../../types/assignments';

/**
 * Resolve the default assignments for a (customer, optional trade party,
 * service) tuple. Resolution order:
 *
 *   1. trade-party default profile (if tradePartyProfileId provided)
 *   2. customer default profile
 *   3. service default — empty role slots, just the service-level manager
 *   4. legacy customer_team_profiles fallback (read-only)
 *
 * The returned `roles` array is the canonical role catalog for the service —
 * the form should always render these slots, in order, even if no default
 * matched. Slots without a default surface as user_id/user_name = null.
 */
export async function resolveAssignmentDefaults({
  customerId,
  tradePartyProfileId,
  serviceType,
}: AssignmentResolverInput): Promise<AssignmentResolution> {
  // ── 1. Service catalog (always needed) ────────────────────────────────────
  const [serviceRes, rolesRes] = await Promise.all([
    supabase
      .from('operational_services')
      .select('*')
      .eq('service_type', serviceType)
      .maybeSingle(),
    supabase
      .from('service_assignment_roles')
      .select('*')
      .eq('service_type', serviceType)
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  const service = (serviceRes.data ?? null) as OperationalService | null;
  const roles = (rolesRes.data ?? []) as ServiceAssignmentRole[];

  const baseSlots: ResolvedAssignment[] = roles.map((r) => ({
    role_key: r.role_key,
    role_label: r.role_label,
    required: r.required,
    allow_multiple: r.allow_multiple,
    sort_order: r.sort_order,
    user_id: null,
    user_name: null,
  }));

  // ── 2. Try the new default profile system first ────────────────────────────
  const matchTradeParty = tradePartyProfileId
    ? await loadDefaultProfileItems({
        subjectType: 'trade_party',
        subjectId: tradePartyProfileId,
        serviceType,
      })
    : null;

  if (matchTradeParty && matchTradeParty.items.length > 0) {
    return {
      service: serviceProjection(service, serviceType),
      teamPool: matchTradeParty.teamPool,
      roles,
      assignments: applyItemsToSlots(baseSlots, matchTradeParty.items),
      source: 'trade_party_default',
    };
  }

  const matchCustomer = customerId
    ? await loadDefaultProfileItems({
        subjectType: 'customer',
        subjectId: customerId,
        serviceType,
      })
    : null;

  if (matchCustomer && matchCustomer.items.length > 0) {
    return {
      service: serviceProjection(service, serviceType),
      teamPool: matchCustomer.teamPool,
      roles,
      assignments: applyItemsToSlots(baseSlots, matchCustomer.items),
      source: 'customer_default',
    };
  }

  // ── 3. Legacy customer_team_profiles fallback ──────────────────────────────
  if (customerId) {
    const legacy = await loadLegacyProfile(customerId, serviceType);
    if (legacy && legacy.items.length > 0) {
      return {
        service: serviceProjection(service, serviceType),
        teamPool: legacy.teamPool,
        roles,
        assignments: applyItemsToSlots(baseSlots, legacy.items),
        source: 'legacy_customer_team_profile',
      };
    }
  }

  // ── 4. Service-only fallback ───────────────────────────────────────────────
  return {
    service: serviceProjection(service, serviceType),
    teamPool: { id: null, name: null },
    roles,
    assignments: baseSlots,
    source: service ? 'service_default' : 'none',
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

interface ResolvedItems {
  teamPool: { id: string | null; name: string | null };
  items: Array<{ role_key: string; role_label: string; user_id: string; user_name: string }>;
}

async function loadDefaultProfileItems(params: {
  subjectType: 'customer' | 'trade_party';
  subjectId: string;
  serviceType: string;
}): Promise<ResolvedItems | null> {
  const { data: profile } = await supabase
    .from('assignment_default_profiles')
    .select('id, team_id')
    .eq('subject_type', params.subjectType)
    .eq('subject_id', params.subjectId)
    .eq('service_type', params.serviceType)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!profile) return null;

  const [{ data: items }, teamPool] = await Promise.all([
    supabase
      .from('assignment_default_items')
      .select('role_key, role_label, user_id, user_name')
      .eq('profile_id', profile.id),
    profile.team_id
      ? supabase.from('teams').select('id, name').eq('id', profile.team_id).maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string } | null }),
  ]);

  return {
    teamPool: {
      id: teamPool?.data?.id ?? null,
      name: teamPool?.data?.name ?? null,
    },
    items: (items ?? []).map((i) => ({
      role_key: i.role_key,
      role_label: i.role_label,
      user_id: i.user_id,
      user_name: i.user_name,
    })),
  };
}

async function loadLegacyProfile(
  customerId: string,
  serviceType: string,
): Promise<ResolvedItems | null> {
  const { data: profile } = await supabase
    .from('customer_team_profiles')
    .select('team_id, team_name, assignments')
    .eq('customer_id', customerId)
    .eq('department', 'Operations')
    .eq('service_type', serviceType)
    .limit(1)
    .maybeSingle();

  if (!profile) return null;
  const raw = (profile.assignments ?? []) as Array<{
    role_key?: string;
    role_label?: string;
    user_id?: string;
    user_name?: string;
  }>;
  // Drop the legacy 'manager' entry — the new model expresses service manager
  // separately, not as a per-booking assignment role.
  const items = raw
    .filter((a) => a.role_key && a.user_id && a.role_key !== 'manager')
    .map((a) => ({
      role_key: a.role_key as string,
      role_label: a.role_label ?? (a.role_key as string),
      user_id: a.user_id as string,
      user_name: a.user_name ?? '',
    }));
  return {
    teamPool: { id: profile.team_id ?? null, name: profile.team_name ?? null },
    items,
  };
}

function serviceProjection(
  service: OperationalService | null,
  fallbackServiceType: string,
): AssignmentResolution['service'] {
  if (service) {
    return {
      service_type: service.service_type,
      label: service.label,
      default_manager_id: service.default_manager_id,
      default_manager_name: service.default_manager_name,
    };
  }
  return {
    service_type: fallbackServiceType,
    label: fallbackServiceType,
    default_manager_id: null,
    default_manager_name: null,
  };
}

function applyItemsToSlots(
  baseSlots: ResolvedAssignment[],
  items: Array<{ role_key: string; user_id: string; user_name: string }>,
): ResolvedAssignment[] {
  return baseSlots.map((slot) => {
    const hit = items.find((i) => i.role_key === slot.role_key);
    if (!hit) return slot;
    return { ...slot, user_id: hit.user_id, user_name: hit.user_name };
  });
}
