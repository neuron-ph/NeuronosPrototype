import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from './useUser';
import { queryKeys } from '../lib/queryKeys';

/**
 * Resolves the current user's data visibility scope.
 *
 * Accepts an optional `resource` string to enable functional visibility —
 * certain departments need org-wide read access to a resource regardless of
 * their role in the hierarchy (e.g. Accounting must see all bookings to
 * process billing and e-vouchers).
 *
 * Resolution order:
 *   0. Functional visibility — department has org-wide access for this resource ('all')
 *   1. Executive dept → sees everything ('all')
 *   2. permission_override exists → elevated scope
 *   3. manager → all users in same department ('userIds')
 *   4. team_leader → all users in same team ('userIds')
 *   5. staff → own records only ('own')
 *
 * Usage in list queries:
 *   const { scope, isLoaded } = useDataScope('bookings');
 *   if (scope.type === 'all') { /* no filter *\/ }
 *   if (scope.type === 'userIds') query = query.in('created_by', scope.ids);
 *   if (scope.type === 'own') query = query.or(`created_by.eq.${scope.userId},assigned_to.eq.${scope.userId}`);
 */

/**
 * Declares which departments have org-wide read access for a given resource.
 * Add new entries here as functional requirements grow — no component changes needed.
 *
 * 'Executive' is always org-wide via the role hierarchy; listing it here is optional
 * but makes the config self-documenting.
 */
const FUNCTIONAL_VISIBILITY: Record<string, string[]> = {
  bookings: ['Accounting', 'Executive'],
  financials: ['Accounting', 'Executive'],
};

export type DataScope =
  | { type: 'all' }
  | { type: 'userIds'; ids: string[] }
  | { type: 'own'; userId: string };

export interface DataScopeResult {
  scope: DataScope;
  isLoaded: boolean;
}

export function useDataScope(resource?: string): DataScopeResult {
  const { user, effectiveDepartment, effectiveRole } = useUser();

  const { data: scope = { type: 'own', userId: '' }, isLoading } = useQuery<DataScope>({
    queryKey: queryKeys.dataScope.user(user?.id ?? '', resource),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      if (!user) {
        return { type: 'own', userId: '' };
      }

      // 0. Functional visibility — department has org-wide access for this resource
      if (resource && FUNCTIONAL_VISIBILITY[resource]?.includes(effectiveDepartment ?? '')) {
        return { type: 'all' };
      }

      // 1. Executive department — full access, no queries needed
      if (effectiveDepartment === 'Executive') {
        return { type: 'all' };
      }

      // 2. Fire permission_override check and role-based users query in parallel.
      //    For staff the users query is wasted (~1 row returned and discarded), but
      //    it saves a full round-trip for manager/team_leader paths which are common.
      const overridePromise = supabase
        .from('permission_overrides')
        .select('scope, departments')
        .eq('user_id', user.id)
        .maybeSingle();

      const deptUsersPromise =
        effectiveRole === 'manager'
          ? supabase.from('users').select('id').eq('department', effectiveDepartment).eq('is_active', true)
          : effectiveRole === 'team_leader' && user.team_id
          ? supabase.from('users').select('id').eq('team_id', user.team_id).eq('is_active', true)
          : Promise.resolve({ data: null });

      const [
        { data: override, error: overrideError },
        { data: roleUsers, error: roleUsersError },
      ] = await Promise.all([overridePromise, deptUsersPromise]);

      if (overrideError) {
        console.warn('[DataScope] permission_override fetch failed:', overrideError.message);
      }
      if (roleUsersError) {
        console.warn('[DataScope] role users fetch failed:', roleUsersError.message);
      }

      // Override takes precedence over role
      if (override) {
        if (override.scope === 'full') {
          return { type: 'all' };
        }
        if (override.scope === 'department_wide') {
          // Re-use the already-fetched dept users if role also matched department
          const ids = roleUsers?.map((u) => u.id) ??
            (await supabase.from('users').select('id').eq('department', effectiveDepartment).eq('is_active', true))
              .data?.map((u) => u.id) ?? [];
          return { type: 'userIds', ids };
        }
        if (override.scope === 'cross_department' && override.departments?.length) {
          const { data: crossUsers } = await supabase
            .from('users')
            .select('id')
            .in('department', override.departments)
            .eq('is_active', true);
          return { type: 'userIds', ids: crossUsers?.map((u) => u.id) ?? [] };
        }
      }

      // 3. Manager — all active users in same department (already fetched above)
      if (effectiveRole === 'manager') {
        return { type: 'userIds', ids: roleUsers?.map((u) => u.id) ?? [] };
      }

      // 4. Team leader — all active users in same team (already fetched above)
      if (effectiveRole === 'team_leader' && user.team_id) {
        return { type: 'userIds', ids: roleUsers?.map((u) => u.id) ?? [] };
      }

      // 5. Staff (or team_leader with no team assigned) — own records only
      return { type: 'own', userId: user.id };
    },
  });

  return { scope, isLoaded: !isLoading };
}
