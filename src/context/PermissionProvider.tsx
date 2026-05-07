import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from '../hooks/useUser';
import { getInheritedPermission } from '../components/admin/permissionsConfig';
import type { ModuleId, ActionId } from '../components/admin/permissionsConfig';

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

  const { data: moduleGrants = {}, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ['permission_overrides', 'module_grants', user?.id ?? ''],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase
        .from('permission_overrides')
        .select('module_grants')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('[PermissionProvider] fetch failed:', error.message);
        return {};
      }
      return (data?.module_grants as Record<string, boolean>) ?? {};
    },
  });

  const can = useMemo(() => {
    const dept = effectiveDepartment ?? '';
    const role = effectiveRole ?? 'staff';
    return (moduleId: ModuleId, action: ActionId): boolean => {
      const key = `${moduleId}:${action}`;
      if (key in moduleGrants) return moduleGrants[key];
      return getInheritedPermission(role, dept, moduleId, action);
    };
  }, [moduleGrants, effectiveDepartment, effectiveRole]);

  const hasExplicitGrant = useMemo(
    () => (moduleId: ModuleId, action: ActionId): boolean => {
      const key = `${moduleId}:${action}`;
      return moduleGrants[key] === true;
    },
    [moduleGrants],
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
