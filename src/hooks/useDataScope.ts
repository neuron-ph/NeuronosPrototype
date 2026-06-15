import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from './useUser';
import { queryKeys } from '../lib/queryKeys';

// NEU-012 Contract #6 — record visibility (Layer 2). This hook is the CLIENT
// mirror of the DB resolver in migrations 157-159 + 186. It must agree with
// public.current_user_visibility_dial / current_user_can_view_record:
//   effective dial = per-user override map[key]  (if present)
//                    else assigned-profile map[key]  (if present)
//                    else 'own'                       (strict fail-closed)
// No role fallback. Teams resolve via team_memberships (active rows, union
// across my teams), exactly like current_user_team_ids() after migration 186 —
// legacy users.team_id is dead (never written by the Teams UI; see
// PLAN_CREW_VISIBILITY_2026-06.md F2/D8). 'department' (migration 190) resolves
// to everyone sharing my users.department, like current_user_department_user_ids().
// RLS is the real boundary; this only pre-filters the UI so it never over-hides.

type Dial = 'own' | 'team' | 'department' | 'org_wide' | 'everything';
type DialMap = Partial<Record<string, Dial>>;

// Record Visibility V2 (migrations 209-212): 'org_wide' = all NON-restricted +
// my closure. The client CANNOT replicate the per-record confidential/closure cut,
// so it must NOT pre-filter org_wide types by owner — it returns {type:'all'} and
// lets RLS do the real cut (never over-hide; see the v2 spec, Inv. 7).
const DIAL_RANK: Record<Dial, number> = { own: 0, team: 1, department: 2, org_wide: 3, everything: 4 };

// Canonical record-type keys (must match the seed in migration 157).
const BOOKING_KEYS = [
  'bookings_forwarding', 'bookings_brokerage', 'bookings_trucking',
  'bookings_marine_insurance', 'bookings_others',
];
const FINANCIAL_KEYS = ['invoices', 'collections', 'billings', 'expenses'];
const ALL_KEYS = [
  'contacts', 'customers', 'quotations', 'tasks', 'evouchers',
  ...FINANCIAL_KEYS, ...BOOKING_KEYS,
];

// A resource hint maps to one or more record-type keys. For a single record
// type we return its exact dial; for multi-type or unknown resources we return
// the MOST PERMISSIVE dial across the relevant keys, so the client filter is
// never stricter than the DB (RLS still tightens each type individually).
function keysForResource(resource?: string): string[] {
  if (!resource) return ALL_KEYS;
  if (resource === 'financials') return FINANCIAL_KEYS;
  if (resource === 'bookings') return BOOKING_KEYS;
  if (ALL_KEYS.includes(resource)) return [resource];
  return ALL_KEYS;
}

function dialForKey(key: string, override: DialMap, profile: DialMap): Dial {
  if (override[key] !== undefined) return override[key] as Dial;
  if (profile[key] !== undefined) return profile[key] as Dial;
  return 'own';
}

function effectiveDial(resource: string | undefined, override: DialMap, profile: DialMap): Dial {
  let best: Dial = 'own';
  for (const key of keysForResource(resource)) {
    const d = dialForKey(key, override, profile);
    if (DIAL_RANK[d] > DIAL_RANK[best]) best = d;
  }
  return best;
}

export type DataScope =
  | { type: 'all' }
  | { type: 'userIds'; ids: string[] }
  | { type: 'own'; userId: string };

export interface DataScopeResult {
  scope: DataScope;
  isLoaded: boolean;
}

export function useDataScope(resource?: string): DataScopeResult {
  const { user } = useUser();

  const { data: scope = { type: 'own', userId: '' }, isLoading } = useQuery<DataScope>({
    queryKey: queryKeys.dataScope.user(user?.id ?? '', resource),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return { type: 'own', userId: '' };

      const [{ data: overrideRow, error: overrideError }, { data: userRow, error: userError }] =
        await Promise.all([
          supabase
            .from('permission_overrides')
            .select('visibility_scopes')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('users')
            .select('access_profile:access_profile_id(visibility_scopes)')
            .eq('id', user.id)
            .maybeSingle(),
        ]);

      if (overrideError) console.warn('[DataScope] override fetch failed:', overrideError.message);
      if (userError) console.warn('[DataScope] profile fetch failed:', userError.message);

      const override = (overrideRow?.visibility_scopes ?? {}) as DialMap;
      const apNode = (userRow as { access_profile?: unknown } | null)?.access_profile;
      const profileNode = (Array.isArray(apNode) ? apNode[0] : apNode) as
        | { visibility_scopes?: DialMap }
        | null
        | undefined;
      const profile = (profileNode?.visibility_scopes ?? {}) as DialMap;

      const dial = effectiveDial(resource, override, profile);

      // 'everything' (all-records) and 'org_wide' both mean "don't pre-filter by
      // owner" — RLS performs the real cut (org_wide hides restricted; everything
      // does not). Either way the client must not over-hide (v2 spec, Inv. 7).
      if (dial === 'everything' || dial === 'org_wide') return { type: 'all' };
      if (dial === 'own') return { type: 'own', userId: user.id };

      // department — everyone sharing my users.department (incl. me),
      // mirroring current_user_department_user_ids() (migration 190).
      if (dial === 'department') {
        const dept = user.department ?? null;
        if (!dept) return { type: 'own', userId: user.id };
        const { data: deptUsers, error: deptError } = await supabase
          .from('users')
          .select('id')
          .eq('department', dept);
        if (deptError) {
          console.warn('[DataScope] department fetch failed:', deptError.message);
          return { type: 'own', userId: user.id };
        }
        const ids = Array.from(new Set([user.id, ...(deptUsers ?? []).map((r) => r.id)]));
        return { type: 'userIds', ids };
      }

      // team — me + every active member of every team I'm an active member of,
      // mirroring current_user_team_ids() (migration 186, team_memberships-based).
      const { data: myTeams, error: myTeamsError } = await supabase
        .from('team_memberships')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (myTeamsError) {
        console.warn('[DataScope] team fetch failed:', myTeamsError.message);
        return { type: 'own', userId: user.id };
      }
      const teamIds = (myTeams ?? []).map((r) => r.team_id);
      if (teamIds.length === 0) return { type: 'own', userId: user.id };

      const { data: teammates, error: teammatesError } = await supabase
        .from('team_memberships')
        .select('user_id')
        .in('team_id', teamIds)
        .eq('is_active', true);
      if (teammatesError) {
        console.warn('[DataScope] teammates fetch failed:', teammatesError.message);
        return { type: 'own', userId: user.id };
      }

      const ids = Array.from(new Set([user.id, ...(teammates ?? []).map((r) => r.user_id)]));
      return { type: 'userIds', ids };
    },
  });

  return { scope, isLoaded: !isLoading };
}
