import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from './useUser';
import { queryKeys } from '../lib/queryKeys';
import { BLOCK_HIGHER_RANK_VISIBILITY_GRANT } from '../lib/rbacGrantKeys';

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

type ScopedUser = { id: string; role: string | null };
type PermissionOverrideScope = {
  scope: 'department_wide' | 'cross_department' | 'full';
  departments: string[] | null;
  module_grants: Record<string, boolean> | null;
};

const ROLE_LEVEL: Record<string, number> = {
  staff: 0,
  team_leader: 1,
  supervisor: 2,
  manager: 3,
  executive: 4,
};

function getRoleLevel(role?: string | null): number {
  return ROLE_LEVEL[role ?? 'staff'] ?? ROLE_LEVEL.staff;
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

      // 1. Executive department or executive role — full access
      if (effectiveDepartment === 'Executive' || effectiveRole === 'executive') {
        return { type: 'all' };
      }

      // 2. Fire permission_override check and role-based users query in parallel.
      const overridePromise = supabase
        .from('permission_overrides')
        .select('scope, departments, module_grants')
        .eq('user_id', user.id)
        .maybeSingle();

      const isTeamRole = effectiveRole === 'team_leader' || effectiveRole === 'supervisor';

      const deptUsersPromise =
        effectiveRole === 'manager'
          ? supabase.from('users').select('id, role').eq('department', effectiveDepartment).eq('is_active', true)
          : isTeamRole && user.team_id
          ? supabase.from('users').select('id, role').eq('team_id', user.team_id).eq('is_active', true)
          : Promise.resolve({ data: null, error: null });

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

      const permissionOverride = override as PermissionOverrideScope | null;
      const blockHigherRankVisibility =
        permissionOverride?.module_grants?.[BLOCK_HIGHER_RANK_VISIBILITY_GRANT] === true;
      const myRoleLevel = getRoleLevel(effectiveRole);
      const visibleIds = (rows?: ScopedUser[] | null): string[] =>
        (rows ?? [])
          .filter((row) => (
            row.id === user.id ||
            !blockHigherRankVisibility ||
            getRoleLevel(row.role) <= myRoleLevel
          ))
          .map((row) => row.id);

      // Override takes precedence over role
      if (permissionOverride) {
        if (permissionOverride.scope === 'full') {
          return { type: 'all' };
        }
        if (permissionOverride.scope === 'department_wide') {
          const departmentRows =
            effectiveRole === 'manager'
              ? (roleUsers as ScopedUser[] | null)
              : ((await supabase
                .from('users')
                .select('id, role')
                .eq('department', effectiveDepartment)
                .eq('is_active', true)).data as ScopedUser[] | null);
          const ids = visibleIds(departmentRows);
          return { type: 'userIds', ids };
        }
        if (permissionOverride.scope === 'cross_department' && permissionOverride.departments?.length) {
          const { data: crossUsers } = await supabase
            .from('users')
            .select('id, role')
            .in('department', permissionOverride.departments)
            .eq('is_active', true);
          return { type: 'userIds', ids: visibleIds(crossUsers as ScopedUser[] | null) };
        }
      }

      // 3. Manager — all active users in same department
      if (effectiveRole === 'manager') {
        return { type: 'userIds', ids: visibleIds(roleUsers as ScopedUser[] | null) };
      }

      // 4. Team leader or supervisor — all active users in same team
      if (isTeamRole && user.team_id) {
        return { type: 'userIds', ids: visibleIds(roleUsers as ScopedUser[] | null) };
      }

      // 5. Staff, supervisor with no team, or team_leader with no team — own records only
      return { type: 'own', userId: user.id };
    },
  });

  return { scope, isLoaded: !isLoading };
}
