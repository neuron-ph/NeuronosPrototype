import { useQuery } from '@tanstack/react-query';
import { resolveAssignmentDefaults } from '../utils/assignments/resolveAssignmentDefaults';
import { queryKeys } from '../lib/queryKeys';
import type { AssignmentResolution } from '../types/assignments';

/**
 * Resolve the default assignments for a (customer, optional trade party,
 * service) tuple. Wraps resolveAssignmentDefaults in a React Query so multiple
 * components reading the same defaults share a single network round trip.
 */
export function useAssignmentResolution(params: {
  customerId: string | null | undefined;
  tradePartyProfileId?: string | null;
  serviceType: string | null | undefined;
}) {
  const { customerId, tradePartyProfileId, serviceType } = params;
  const enabled = !!serviceType;

  const query = useQuery<AssignmentResolution>({
    queryKey: queryKeys.assignments.resolved({
      customerId: customerId ?? null,
      tradePartyProfileId: tradePartyProfileId ?? null,
      serviceType: serviceType ?? '',
    }),
    enabled,
    staleTime: 60 * 1000,
    queryFn: () =>
      resolveAssignmentDefaults({
        customerId: customerId ?? null,
        tradePartyProfileId: tradePartyProfileId ?? null,
        serviceType: serviceType as string,
      }),
  });

  return {
    resolution: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
