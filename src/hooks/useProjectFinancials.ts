import { useMemo } from "react";
import type { FinancialData } from "./financialData";
import { useContainerFinancials } from "./useContainerFinancials";

export { type FinancialData } from "./financialData";

export function useProjectFinancials(
  projectNumber: string,
  linkedBookings: any[] = [],
  quotationId?: string,
): FinancialData {
  const linkedBookingScope = useMemo(
    () =>
      linkedBookings
        .map((booking) => booking?.bookingId || booking?.id)
        .filter(Boolean),
    [linkedBookings],
  );

  return useContainerFinancials({
    containerType: "project",
    containerReference: projectNumber,
    linkedBookings: linkedBookingScope,
    quotationId,
    includeQuotationVirtualItems: Boolean(quotationId),
    expenseSource: "evouchers",
  });
}
