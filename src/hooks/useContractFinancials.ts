import type { FinancialData } from "./financialData";
import { useContainerFinancials } from "./useContainerFinancials";

/**
 * Contract financials are resolved through the shared booking-first container hook.
 */
export function useContractFinancials(
  contractReference: string,
  linkedBookingIds: string[] = [],
  contractId?: string,
): FinancialData {
  void contractId;

  return useContainerFinancials({
    containerType: "contract",
    containerReference: contractReference,
    linkedBookings: linkedBookingIds,
    expenseSource: "evouchers",
  });
}
