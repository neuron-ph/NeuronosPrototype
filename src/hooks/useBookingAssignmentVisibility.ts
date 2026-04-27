import { useQuery } from '@tanstack/react-query';
import { supabase } from '../utils/supabase/client';
import { queryKeys } from '../lib/queryKeys';
import { useUser } from './useUser';
import {
  buildAssignmentVisibilityIndex,
  type AssignmentVisibilityIndex,
} from '../utils/assignments/applyAssignmentVisibility';

/**
 * Returns an index of every booking_assignments row whose user_id matches
 * a member of the current user's data scope (or just the current user for
 * 'own' scope). List pages use this together with their existing
 * useDataScope() result to filter bookings inclusively — i.e. a user assigned
 * via booking_assignments shows up in their personal list even if they are
 * not on the legacy manager/supervisor/handler columns.
 *
 * The hook fetches a slim set of rows (booking_id, user_id) keyed off the
 * current user only. Pages that need the broader scope (manager seeing
 * subordinates) should pass `includeUserIds` so the index covers the full set.
 */
export function useBookingAssignmentVisibility(opts: {
  userIds?: string[] | null;
} = {}): { index: AssignmentVisibilityIndex; isLoaded: boolean } {
  const { user } = useUser();
  const ids = (opts.userIds && opts.userIds.length > 0)
    ? opts.userIds
    : user?.id
      ? [user.id]
      : [];

  const enabled = ids.length > 0;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.assignments.visibilityForUser(ids.slice().sort().join(',')),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_assignments')
        .select('booking_id, user_id')
        .in('user_id', ids);
      if (error) throw error;
      return (data ?? []) as Array<{ booking_id: string; user_id: string }>;
    },
  });

  return {
    index: buildAssignmentVisibilityIndex(data),
    isLoaded: !enabled || !isLoading,
  };
}
