import { useQuery } from '@tanstack/react-query';
import { resolveAssignmentProfile } from '../utils/assignments/resolveAssignmentProfile';
import type { AssignmentProfileResolution, AssignmentProfileResolverInput } from '../types/assignments';

/**
 * Unified assignment profile resolution hook.
 *
 * Wraps resolveAssignmentProfile in React Query so multiple components reading
 * the same profile share a single network round trip.
 *
 * Replaces useAssignmentResolution (Operations-only) with a hook that works
 * for all departments.
 */
export function useAssignmentProfileResolution(
  params: AssignmentProfileResolverInput & { enabled?: boolean },
) {
  const { department, serviceType, customerId, contactId, tradePartyProfileId, enabled = true } = params;

  return useQuery<AssignmentProfileResolution>({
    queryKey: [
      'assignment_profile_resolution',
      department,
      serviceType ?? null,
      customerId ?? null,
      contactId ?? null,
      tradePartyProfileId ?? null,
    ],
    enabled: enabled && !!department,
    staleTime: 60 * 1000,
    queryFn: () =>
      resolveAssignmentProfile({
        department,
        serviceType,
        customerId,
        contactId,
        tradePartyProfileId,
      }),
  });
}
