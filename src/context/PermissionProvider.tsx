import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from '../hooks/useUser';
import type { ModuleId, ActionId } from '../components/admin/permissionsConfig';
import type { ModuleGrants } from '../components/admin/accessProfiles/accessProfileTypes';

interface PermissionContextType {
  /**
   * Check whether the current user has access to a module+action.
   * NEU-012 (strict, corrected 2026-06-05): access is the assigned Access Profile
   * (users.access_profile_id) with a VISIBLE per-user customization layer on top:
   *   effective(key) = override[key] if present else profile[key] else false.
   * Explicit, no parent→child cascade at read, no role fallback — read identically
   * here and by the DB resolver (current_user_effective_module_grant).
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
    // Permission edits are admin-driven and rare, but an open session caches
    // grants and won't notice a change until they go stale. Keep a short TTL and
    // refetch when the user refocuses the tab so access changes surface within
    // ~1 min (usually instantly on focus) without polling — cheap at SME scale.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return { moduleGrants: {} };

      // Base: the assigned Access Profile (access_profiles is world-readable to
      // authenticated users via access_profiles_select).
      const { data: urow, error: uErr } = await supabase
        .from('users')
        .select('access_profile_id')
        .eq('id', user.id)
        .maybeSingle();
      if (uErr) console.warn('[PermissionProvider] user fetch failed:', uErr.message);

      const profileId = (urow as { access_profile_id: string | null } | null)?.access_profile_id ?? null;

      let profileGrants: ModuleGrants = {};
      if (profileId) {
        const { data: prof, error: pErr } = await supabase
          .from('access_profiles')
          .select('module_grants, is_active')
          .eq('id', profileId)
          .maybeSingle();
        if (pErr) console.warn('[PermissionProvider] profile fetch failed:', pErr.message);
        const row = prof as { module_grants: ModuleGrants | null; is_active: boolean } | null;
        profileGrants = (row?.is_active ? row.module_grants : null) ?? {};
      }

      // Overlay: the visible per-user customization (permission_overrides). RLS
      // (overrides_select) lets a user read its own row.
      const { data: ovr, error: oErr } = await supabase
        .from('permission_overrides')
        .select('module_grants')
        .eq('user_id', user.id)
        .maybeSingle();
      if (oErr) console.warn('[PermissionProvider] override fetch failed:', oErr.message);
      const overrideGrants = ((ovr as { module_grants: ModuleGrants | null } | null)?.module_grants ?? {}) as ModuleGrants;

      // effective(key) = override[key] if present else profile[key] else false.
      const moduleGrants = { ...profileGrants, ...overrideGrants };
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
