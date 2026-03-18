import { useContainerFinancials } from "./useContainerFinancials";

export function useBookingFinancials(bookingId?: string) {
  return useContainerFinancials({
    containerType: "booking",
    linkedBookings: bookingId ? [bookingId] : [],
    expenseSource: "expenses",
  });
}
