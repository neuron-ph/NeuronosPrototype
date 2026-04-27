import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase/client';

type UsageCheckResult = {
  count: number;
  loading: boolean;
  checked: boolean;
};

/**
 * Checks how many active bookings reference a given profile ID via profile_refs.
 * Calls the `get_profile_booking_usage` RPC which does an exact JSONB scan for
 * details.profile_refs.*.profile_id matches.
 */
export function useProfileUsageCheck() {
  const [state, setState] = useState<UsageCheckResult>({ count: 0, loading: false, checked: false });

  const check = useCallback(async (profileId: string): Promise<number> => {
    setState({ count: 0, loading: true, checked: false });
    try {
      const { data, error } = await supabase.rpc('get_profile_booking_usage', { p_profile_id: profileId });
      const n = error ? 0 : (data as number) ?? 0;
      setState({ count: n, loading: false, checked: true });
      return n;
    } catch {
      setState({ count: 0, loading: false, checked: true });
      return 0;
    }
  }, []);

  const reset = useCallback(() => setState({ count: 0, loading: false, checked: false }), []);

  return { ...state, check, reset };
}
