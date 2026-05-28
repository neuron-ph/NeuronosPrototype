import { useState, useEffect } from "react";
import { ForwardingBookings } from "./operations/forwarding/ForwardingBookings";
import { ForwardingBookingDetails } from "./operations/forwarding/ForwardingBookingDetails";
import type { ForwardingBooking } from "../types/operations";
import { trackRecent } from "../lib/recents";
import { useUser } from "../hooks/useUser";
import { useUrlSelection } from "../hooks/useUrlSelection";

export type OperationsView = "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others" | "reporting";
type SubView = "list" | "detail";

interface OperationsProps {
  view?: OperationsView;
  currentUser?: { name: string; email: string; department: string } | null;
}

export function Operations({ view = "forwarding", currentUser }: OperationsProps) {
  const [urlBookingId, setUrlBookingId] = useUrlSelection("booking");
  const [subView, setSubView] = useState<SubView>(urlBookingId ? "detail" : "list");
  const [selectedBooking, setSelectedBooking] = useState<ForwardingBooking | null>(null);
  const { user } = useUser();

  // Reset to list view when switching between main views
  useEffect(() => {
    setSubView("list");
    setSelectedBooking(null);
    setUrlBookingId(null);
  }, [view]);

  const handleSelectBooking = (booking: ForwardingBooking) => {
    setSelectedBooking(booking);
    setSubView("detail");
    setUrlBookingId(booking.id ?? booking.bookingId);
    if (user?.id) trackRecent({
      label: booking.bookingId || "Booking",
      sub: `Operations · ${booking.customerName || ""}`,
      path: `/operations/forwarding?booking=${booking.id}`,
      type: "booking",
      time: new Date().toISOString(),
    }, user.id);
  };

  const handleBackToList = () => {
    setSubView("list");
    setSelectedBooking(null);
    setUrlBookingId(null);
  };

  const handleBookingUpdated = () => {
    console.log("Booking updated - changes saved");
  };

  // Render the appropriate service workstation
  const renderContent = () => {
    if (view === "forwarding") {
      if (subView === "detail" && selectedBooking) {
        return (
          <ForwardingBookingDetails
            booking={selectedBooking}
            onBack={handleBackToList}
            onBookingUpdated={handleBookingUpdated}
            currentUser={currentUser}
          />
        );
      }
      return (
        <ForwardingBookings
          onSelectBooking={handleSelectBooking}
          currentUser={currentUser}
          pendingBookingId={urlBookingId}
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
