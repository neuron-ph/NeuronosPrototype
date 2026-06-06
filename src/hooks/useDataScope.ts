import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from './useUser';
import { queryKeys } from '../lib/queryKeys';

// NEU-012 Contract #6 — record visibility (Layer 2). This hook is the CLIENT
// mirror of the DB resolver in migrations 157-159. It must agree with
// public.current_user_visibility_dial / current_user_can_view_record:
//   effective dial = per-user override map[key]  (if present)
//                    else assigned-profile map[key]  (if present)
//                    else 'own'                       (strict fail-closed)
// No role fallback, no department concept, no team_memberships table — teams
// are users sharing users.team_id, exactly like current_user_team_ids().
// RLS is the real boundary; this only pre-filters the UI so it never over-hides.

type Dial = 'own' | 'team' | 'everything';
type DialMap = Partial<Record<string, Dial>>;

const DIAL_RANK: Record<Dial, number> = { own: 0, team: 1, everything: 2 };

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
            .select('team_id, access_profile:access_profile_id(visibility_scopes)')
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

      if (dial === 'everything') return { type: 'all' };
      if (dial === 'own') return { type: 'own', userId: user.id };

      // team — everyone sharing my team_id (incl. me), mirroring current_user_team_ids().
      const teamId = (userRow as { team_id?: string | null } | null)?.team_id ?? null;
      if (!teamId) return { type: 'own', userId: user.id };

      const { data: teammates, error: teammatesError } = await supabase
        .from('users')
        .select('id')
        .eq('team_id', teamId);
      if (teammatesError) {
        console.warn('[DataScope] team fetch failed:', teammatesError.message);
        return { type: 'own', userId: user.id };
      }

      const ids = Array.from(new Set([user.id, ...(teammates ?? []).map((r) => r.id)]));
      return { type: 'userIds', ids };
    },
  });

  return { scope, isLoaded: !isLoading };
}
