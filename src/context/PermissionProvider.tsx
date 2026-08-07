import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { useUser } from '../hooks/useUser';
import type { ModuleId, ActionId } from '../components/admin/permissionsConfig';
import type { ModuleGrants } from '../components/admin/accessProfiles/accessProfileTypes';

interface PermissionContextType {
  /**
   * Check whether the current user has access to a module+action.
   * "The matrix is king" (migrations 220/221): access is the user's single flat,
   * explicit matrix — permission_overrides.module_grants — read VERBATIM:
   *   effective(key) = grants[key] === true, absent => denied.
   * No profile fallback, no parent→child cascade, no role default. Reads
   * identically to the DB resolver (current_user_effective_module_grant). The
   * assigned profile is a UI template only (used to fill the matrix), with zero
   * read-weight.
   */
  can: (moduleId: ModuleId, action: ActionId) => boolean;
  /**
   * Kept for route/sidebar guards. Under strict every grant is explicit, so this
   * is equivalent to `can` (no inherited baseline to distinguish from).
   */
  hasExplicitGrant: (moduleId: ModuleId, action: ActionId) => boolean;
  isLoaded: boolean;
  /**
   * True when the permission_overrides row could not be READ, as opposed to the
   * user genuinely holding no grants. Both look like an empty grant set to
   * can(), so callers that want to explain themselves must ask for this.
   */
  grantsUnreadable: boolean;
}

const PermissionContext = createContext<PermissionContextType>({
  can: () => false,
  hasExplicitGrant: () => false,
  isLoaded: false,
  grantsUnreadable: false,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();

  const { data, isLoading } = useQuery<{ moduleGrants: ModuleGrants; unreadable: boolean }>({
    queryKey: ['permission_profile_grants', user?.id ?? ''],
    enabled: !!user,
    // Permission edits are admin-driven and rare, but an open session caches
    // grants and won't notice a change until they go stale. Keep a short TTL and
    // refetch when the user refocuses the tab so access changes surface within
    // ~1 min (usually instantly on focus) without polling — cheap at SME scale.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return { moduleGrants: {}, unreadable: false };

      // The user's flat matrix is the sole source of truth (permission_overrides).
      // RLS (overrides_select) lets a user read its own row. No profile, no merge.
      const { data: ovr, error: oErr } = await supabase
        .from('permission_overrides')
        .select('module_grants')
        .eq('user_id', user.id)
        .maybeSingle();
      if (oErr) console.warn('[PermissionProvider] matrix fetch failed:', oErr.message);

      // A signed-in user ALWAYS has an overrides row — applying an access
      // profile materialises one. Getting no row back therefore does not mean
      // "no permissions", it means the row could not be read: the RLS policy
      // resolves auth.uid() -> users.auth_id -> user_id, so a broken auth_id
      // link returns nothing and every can() then answers false. That is
      // indistinguishable from a genuinely empty grant set unless we say so —
      // and it is exactly how bd@neuron.com.ph came to sign in, see a
      // dashboard, and be blocked from all 7 of its granted routes in silence.
      const unreadable = !oErr && ovr === null;
      const moduleGrants = ((ovr as { module_grants: ModuleGrants | null } | null)?.module_grants ?? {}) as ModuleGrants;
      return { moduleGrants, unreadable };
    },
  });

  const moduleGrants = data?.moduleGrants ?? {};
  const grantsUnreadable = data?.unreadable ?? false;

  useEffect(() => {
    if (!grantsUnreadable || !user) return;
    console.error(
      `[PermissionProvider] no permission_overrides row readable for "${user.id}". ` +
        `Every permission check will fail. Usually a users.auth_id that does not ` +
        `match the signed-in auth account.`,
    );
  }, [grantsUnreadable, user]);

  const can = useMemo(() => {
    return (moduleId: ModuleId, action: ActionId): boolean =>
      moduleGrants[`${moduleId}:${action}`] === true;
  }, [moduleGrants]);

  const value = useMemo<PermissionContextType>(
    () => ({ can, hasExplicitGrant: can, isLoaded: !isLoading, grantsUnreadable }),
    [can, isLoading, grantsUnreadable],
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
