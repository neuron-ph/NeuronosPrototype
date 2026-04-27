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

/**
 * Resources where managers (and above) in the listed departments see ALL records org-wide,
 * not just their own department's records. Staff in these departments still get 'own' scope.
 * Use case: BD managers must see contacts/customers created by Pricing or Executive.
 */
const MANAGER_WIDE_VISIBILITY: Record<string, string[]> = {
  contacts: ['Business Development'],
  customers: ['Business Development'],
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
          : Promise.resolve({ data: null, error: null });

      const membershipPromise = isTeamRole
        ? supabase
            .from('team_memberships')
            .select('team_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
        : Promise.resolve({ data: null, error: null });

      const [
        { data: override, error: overrideError },
        { data: roleUsers, error: roleUsersError },
        { data: membershipRows, error: membershipError },
      ] = await Promise.all([overridePromise, deptUsersPromise, membershipPromise]);

      if (overrideError) {
        console.warn('[DataScope] permission_override fetch failed:', overrideError.message);
      }
      if (roleUsersError) {
        console.warn('[DataScope] role users fetch failed:', roleUsersError.message);
      }
      if (membershipError) {
        console.warn('[DataScope] team memberships fetch failed:', membershipError.message);
      }

      let teamRoleUsers: ScopedUser[] | null = null;
      const teamIds = Array.from(
        new Set(((membershipRows ?? []) as Array<{ team_id: string | null }>).map((row) => row.team_id).filter(Boolean)),
      ) as string[];
      if (isTeamRole && teamIds.length > 0) {
        const { data: teamUserLinks, error: teamUserLinkError } = await supabase
          .from('team_memberships')
          .select('user_id')
          .eq('is_active', true)
          .in('team_id', teamIds);
        if (teamUserLinkError) {
          console.warn('[DataScope] team member links fetch failed:', teamUserLinkError.message);
        } else {
          const visibleUserIds = Array.from(
            new Set((teamUserLinks ?? []).map((row) => row.user_id)),
          );
          if (visibleUserIds.length > 0) {
            const { data: scopedUsers, error: scopedUsersError } = await supabase
              .from('users')
              .select('id, role')
              .in('id', visibleUserIds)
              .eq('is_active', true);
            if (scopedUsersError) {
              console.warn('[DataScope] scoped team users fetch failed:', scopedUsersError.message);
            } else {
              teamRoleUsers = (scopedUsers ?? []) as ScopedUser[];
            }
          }
        }
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
        if (resource && MANAGER_WIDE_VISIBILITY[resource]?.includes(effectiveDepartment ?? '')) {
          return { type: 'all' };
        }
        return { type: 'userIds', ids: visibleIds(roleUsers as ScopedUser[] | null) };
      }

      // 4. Team leader or supervisor — all active users in same team
      if (isTeamRole && teamRoleUsers) {
        return { type: 'userIds', ids: visibleIds(teamRoleUsers) };
      }

      // 5. Staff, supervisor with no memberships, or team_leader with no memberships — own records only
      return { type: 'own', userId: user.id };
    },
  });

  return { scope, isLoaded: !isLoading };
}
