import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProfileLookupRecord } from '../types/profiles';
import { getAdapterForType } from '../utils/profiles/adapterRegistry';

type State = {
  results: ProfileLookupRecord[];
  loading: boolean;
  error: string | null;
};

/**
 * Async profile lookup hook — used by any module that needs to search a profile type.
 * Returns results, a search trigger, and a fetchById helper.
 *
 * Usage:
 *   const { results, search, loading } = useProfileLookup('customer');
 *   search('ABC Corp'); // triggers debounced search
 */
export function useProfileLookup(profileType: string) {
  const [state, setState] = useState<State>({ results: [], loading: false, error: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adapterInfo = getAdapterForType(profileType);

  const search = useCallback(
    (query: string, { immediate = false }: { immediate?: boolean } = {}) => {
      if (!adapterInfo) {
        setState(s => ({ ...s, results: [], loading: false }));
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const delay = immediate ? 0 : 180;
      debounceRef.current = setTimeout(async () => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
          const results = await adapterInfo.adapter.search(query, {
            providerTag: adapterInfo.providerTag,
            limit: 20,
          });
          setState({ results, loading: false, error: null });
        } catch (e) {
          setState({ results: [], loading: false, error: String(e) });
        }
      }, delay);
    },
    [adapterInfo],
  );

  const fetchById = useCallback(
    async (id: string): Promise<ProfileLookupRecord | null> => {
      if (!adapterInfo) return null;
      return adapterInfo.adapter.fetchById(id);
    },
    [adapterInfo],
  );

  // Load initial results on mount
  useEffect(() => {
    search('', { immediate: true });
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  return {
    results: state.results,
    loading: state.loading,
    error: state.error,
    search,
    fetchById,
  };
}
