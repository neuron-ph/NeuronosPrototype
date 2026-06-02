import { ForwardingBookings } from "./operations/forwarding/ForwardingBookings";
import type { ForwardingBooking } from "../types/operations";
import { trackRecent } from "../lib/recents";
import { useUser } from "../hooks/useUser";

export type OperationsView = "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others" | "reporting";

interface OperationsProps {
  view?: OperationsView;
  currentUser?: { name: string; email: string; department: string } | null;
}

export function Operations({ view = "forwarding", currentUser }: OperationsProps) {
  const { user } = useUser();

  // ForwardingBookings owns selection + detail rendering; we only record the recent.
  const trackRecentBooking = (booking: ForwardingBooking) => {
    if (user?.id) trackRecent({
      label: booking.bookingId || "Booking",
      sub: `Operations · ${booking.customerName || ""}`,
      path: `/operations/forwarding?booking=${booking.id}`,
      type: "booking",
      time: new Date().toISOString(),
    }, user.id);
  };

  // Render the appropriate service workstation
  const renderContent = () => {
    if (view === "forwarding") {
      return (
        <ForwardingBookings
          onSelectBooking={trackRecentBooking}
          currentUser={currentUser}
        />
      );
    }

    // Placeholder for other services
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-[var(--theme-text-primary)] mb-2">Coming Soon</h2>
          <p className="text-[var(--theme-text-primary)]/60">
            {view.charAt(0).toUpperCase() + view.slice(1)} module is under development
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-[var(--theme-bg-surface)]">
      {renderContent()}
    </div>
  );
}
