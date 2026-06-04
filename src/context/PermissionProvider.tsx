import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from '../hooks/useUser';
import type { ModuleId, ActionId } from '../components/admin/permissionsConfig';
import type { ModuleGrants } from '../components/admin/accessProfiles/accessProfileTypes';

interface PermissionContextType {
  /**
   * Check whether the current user has access to a module+action.
   * NEU-012 (strict): access is the explicit grant set of the ONE Access Profile
   * the user is assigned (users.access_profile_id). No per-user overrides, no
   * parent→child cascade at read — the profile is the single source of truth,
   * read identically here and by the DB resolver (current_user_effective_module_grant).
   */
  can: (moduleId: ModuleId, action: ActionId) => boolean;
  /**
   * Kept for route/sidebar guards. Under strict every grant is explicit, so this
   * is equivalent to `can` (no inherited baseline to distinguish from).
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
  const { user } = useUser();

  const { data, isLoading } = useQuery<{ moduleGrants: ModuleGrants }>({
    queryKey: ['permission_profile_grants', user?.id ?? ''],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return { moduleGrants: {} };

      // The user is assigned exactly one Access Profile; its module_grants ARE
      // their access. Two simple reads (access_profiles is world-readable to
      // authenticated users via access_profiles_select).
      const { data: urow, error: uErr } = await supabase
        .from('users')
        .select('access_profile_id')
        .eq('id', user.id)
        .maybeSingle();
      if (uErr) console.warn('[PermissionProvider] user fetch failed:', uErr.message);

      const profileId = (urow as { access_profile_id: string | null } | null)?.access_profile_id ?? null;
      if (!profileId) return { moduleGrants: {} };

      const { data: prof, error: pErr } = await supabase
        .from('access_profiles')
        .select('module_grants, is_active')
        .eq('id', profileId)
        .maybeSingle();
      if (pErr) console.warn('[PermissionProvider] profile fetch failed:', pErr.message);

      const row = prof as { module_grants: ModuleGrants | null; is_active: boolean } | null;
      const moduleGrants = (row?.is_active ? row.module_grants : null) ?? {};
      return { moduleGrants: moduleGrants as ModuleGrants };
    },
  });

  const moduleGrants = data?.moduleGrants ?? {};

  const can = useMemo(() => {
    return (moduleId: ModuleId, action: ActionId): boolean =>
      moduleGrants[`${moduleId}:${action}`] === true;
  }, [moduleGrants]);

  const value = useMemo<PermissionContextType>(
    () => ({ can, hasExplicitGrant: can, isLoaded: !isLoading }),
    [can, isLoading],
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
