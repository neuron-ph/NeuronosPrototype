/**
 * useCustomerOptions
 *
 * Shared hook that returns customer dropdown options for booking creation panels.
 * Backed by useCustomers (TanStack Query) so it shares the cache warmed by
 * useReferenceDataPrefetch — no per-panel cold fetches.
 */

import { useCustomers } from "../../../hooks/useCustomers";

interface CustomerOption {
  value: string;
  label: string;
}

export function useCustomerOptions(isOpen: boolean): CustomerOption[] {
  const { customers } = useCustomers({ enabled: isOpen });
  return customers.map((c: any) => ({
    value: c.company_name || c.name || c.id,
    label: c.company_name || c.name || c.id,
  }));
}
