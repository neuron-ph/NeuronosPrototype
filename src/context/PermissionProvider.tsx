import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from '../hooks/useUser';
import type { ModuleId, ActionId } from '../components/admin/permissionsConfig';
import type { AccessProfileSummary, ModuleGrants } from '../components/admin/accessProfiles/accessProfileTypes';
import {
  chooseRoleDefaultProfile,
  mergeGrantLayers,
} from '../components/admin/accessProfiles/accessGrantUtils';

type PermissionOverrideRow = {
  module_grants: ModuleGrants | null;
  applied_profile_id: string | null;
  profile?: AccessProfileSummary | null;
};

interface PermissionContextType {
  /**
   * Check whether the current user has access to a module+action.
   * Respects per-user module_grants overrides; falls back to inherited baseline.
   */
  can: (moduleId: ModuleId, action: ActionId) => boolean;
  /**
   * True only when an explicit per-user override grants this module+action.
   * This is used by route/sidebar guards so custom access can bypass default
   * department/role ownership rules without changing the inherited baseline.
   */
  hasExplicitGrant: (moduleId: ModuleId, action: ActionId) => boolean;
  isLoaded: boolean;
}

const PermissionContext = createContext<PermissionContextType>({
  can: () => false,
  hasExplicitGrant: () => false,
  isLoaded: false,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user, effectiveDepartment, effectiveRole } = useUser();

  const { data, isLoading } = useQuery<{
    moduleGrants: ModuleGrants;
    explicitGrants: ModuleGrants;
  }>({
    queryKey: ['permission_overrides', 'resolved_module_grants', user?.id ?? '', effectiveRole ?? '', effectiveDepartment ?? ''],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return { moduleGrants: {}, explicitGrants: {} };

      const [{ data: overrideData, error: overrideError }, { data: profilesData, error: profilesError }] = await Promise.all([
        supabase
          .from('permission_overrides')
          .select('module_grants, applied_profile_id, profile:applied_profile_id(id, name, description, target_department, target_role, module_grants, visibility_scope, visibility_departments, updated_at)')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('access_profiles')
          .select('id, name, description, target_department, target_role, module_grants, visibility_scope, visibility_departments, updated_at')
          .eq('is_active', true),
      ]);

      if (overrideError) {
        console.warn('[PermissionProvider] override fetch failed:', overrideError.message);
      }
      if (profilesError) {
        console.warn('[PermissionProvider] profiles fetch failed:', profilesError.message);
      }

      const override = (overrideData ?? null) as PermissionOverrideRow | null;
      const profiles = (profilesData ?? []) as AccessProfileSummary[];
      const baselineProfile = override?.profile
        ?? chooseRoleDefaultProfile(profiles, effectiveRole ?? 'staff', effectiveDepartment);
      const explicitGrants = (override?.module_grants ?? {}) as ModuleGrants;
      const moduleGrants = mergeGrantLayers(baselineProfile?.module_grants, explicitGrants);

      return { moduleGrants, explicitGrants };
    },
  });

  const moduleGrants = data?.moduleGrants ?? {};
  const explicitGrants = data?.explicitGrants ?? {};

  const can = useMemo(() => {
    return (moduleId: ModuleId, action: ActionId): boolean => {
      const key = `${moduleId}:${action}`;
      return moduleGrants[key] === true;
    };
  }, [moduleGrants]);

  const hasExplicitGrant = useMemo(
    () => (moduleId: ModuleId, action: ActionId): boolean => {
      const key = `${moduleId}:${action}`;
      return explicitGrants[key] === true;
    },
    [explicitGrants],
  );

  const value = useMemo<PermissionContextType>(
    () => ({ can, hasExplicitGrant, isLoaded: !isLoading }),
    [can, hasExplicitGrant, isLoading],
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionContext);
}
