import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from './useUser';
import { queryKeys } from '../lib/queryKeys';
import { BLOCK_HIGHER_RANK_VISIBILITY_GRANT } from '../lib/rbacGrantKeys';
import {
  normalizeLegacyVisibilityScope,
  roleDefaultVisibilityScope,
} from '../components/admin/accessProfiles/accessGrantUtils';

type ScopedUser = { id: string; role: string | null };

type PermissionOverrideScope = {
  scope: 'own' | 'team' | 'department' | 'selected_departments' | 'all' | 'department_wide' | 'cross_department' | 'full' | null;
  departments: string[] | null;
  module_grants: Record<string, boolean> | null;
  applied_profile_id?: string | null;
  profile?: {
    visibility_scope?: 'own' | 'team' | 'department' | 'selected_departments' | 'all' | null;
    visibility_departments?: string[] | null;
  } | null;
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

export function useDataScope(_resource?: string): DataScopeResult {
  const { user, effectiveDepartment, effectiveRole } = useUser();

  const { data: scope = { type: 'own', userId: '' }, isLoading } = useQuery<DataScope>({
    queryKey: queryKeys.dataScope.user(user?.id ?? '', _resource),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) {
        return { type: 'own', userId: '' };
      }

      const { data: override, error: overrideError } = await supabase
        .from('permission_overrides')
        .select('scope, departments, module_grants, applied_profile_id, profile:applied_profile_id(visibility_scope, visibility_departments)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (overrideError) {
        console.warn('[DataScope] permission_override fetch failed:', overrideError.message);
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

      const resolvedScope = normalizeLegacyVisibilityScope(
        permissionOverride?.scope ?? permissionOverride?.profile?.visibility_scope ?? null,
      ) ?? roleDefaultVisibilityScope(effectiveRole ?? 'staff');
      const resolvedDepartments =
        permissionOverride?.departments
        ?? permissionOverride?.profile?.visibility_departments
        ?? [];

      if (resolvedScope === 'all') {
        return { type: 'all' };
      }

      if (resolvedScope === 'department') {
        const { data: departmentUsers, error: departmentUsersError } = await supabase
          .from('users')
          .select('id, role')
          .eq('department', effectiveDepartment)
          .eq('is_active', true);
        if (departmentUsersError) {
          console.warn('[DataScope] department users fetch failed:', departmentUsersError.message);
          return { type: 'own', userId: user.id };
        }
        return { type: 'userIds', ids: visibleIds(departmentUsers as ScopedUser[] | null) };
      }

      if (resolvedScope === 'selected_departments') {
        if (resolvedDepartments.length === 0) {
          return { type: 'own', userId: user.id };
        }
        const { data: crossUsers, error: crossUsersError } = await supabase
          .from('users')
          .select('id, role')
          .in('department', resolvedDepartments)
          .eq('is_active', true);
        if (crossUsersError) {
          console.warn('[DataScope] selected departments fetch failed:', crossUsersError.message);
          return { type: 'own', userId: user.id };
        }
        return { type: 'userIds', ids: visibleIds(crossUsers as ScopedUser[] | null) };
      }

      if (resolvedScope === 'team') {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('is_active', true);
        if (membershipError) {
          console.warn('[DataScope] team memberships fetch failed:', membershipError.message);
          return { type: 'own', userId: user.id };
        }

        const teamIds = Array.from(
          new Set(((membershipRows ?? []) as Array<{ team_id: string | null }>).map((row) => row.team_id).filter(Boolean)),
        ) as string[];
        if (teamIds.length === 0) {
          return { type: 'own', userId: user.id };
        }

        const { data: teamLinks, error: teamLinksError } = await supabase
          .from('team_memberships')
          .select('user_id')
          .eq('is_active', true)
          .in('team_id', teamIds);
        if (teamLinksError) {
          console.warn('[DataScope] team member links fetch failed:', teamLinksError.message);
          return { type: 'own', userId: user.id };
        }

        const teamUserIds = Array.from(new Set((teamLinks ?? []).map((row) => row.user_id)));
        if (teamUserIds.length === 0) {
          return { type: 'own', userId: user.id };
        }

        const { data: teamUsers, error: teamUsersError } = await supabase
          .from('users')
          .select('id, role')
          .in('id', teamUserIds)
          .eq('is_active', true);
        if (teamUsersError) {
          console.warn('[DataScope] team users fetch failed:', teamUsersError.message);
          return { type: 'own', userId: user.id };
        }

        return { type: 'userIds', ids: visibleIds(teamUsers as ScopedUser[] | null) };
      }

      return { type: 'own', userId: user.id };
    },
  });

  return { scope, isLoaded: !isLoading };
}
