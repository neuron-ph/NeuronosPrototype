import { ArrowLeft, Calendar, Package, User } from "lucide-react";
import { ForwardingBookingDetails } from "./forwarding/ForwardingBookingDetails";
import { TruckingBookingDetails } from "./TruckingBookingDetails";
import { BrokerageBookingDetails } from "./BrokerageBookingDetails";
import { MarineInsuranceBookingDetails } from "./MarineInsuranceBookingDetails";
import { OthersBookingDetails } from "./OthersBookingDetails";
import { normalizeBookingForDisplay } from "../../utils/bookings/bookingDetailsCompat";

interface BookingFullViewProps {
  booking: Record<string, unknown>;
  onBack: () => void;
}

export function BookingFullView({ booking: rawBooking, onBack }: BookingFullViewProps) {
  if (!rawBooking) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--neuron-bg-page)] text-[var(--neuron-ink-muted)]">
        <Package size={48} className="mb-4 opacity-50" />
        <h3 className="text-lg font-medium">Booking Not Found</h3>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-[var(--theme-bg-surface)] border border-[var(--neuron-ui-border)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Normalize once before any display or dispatch.
  // This ensures both old-format (camelCase details) and new-format (snake_case details)
  // bookings surface all their fields under the right keys for every detail component.
  const booking = normalizeBookingForDisplay(rawBooking);

  // Resolve service type — new records use snake_case `service_type`, old records used `serviceType`
  const serviceType = String(
    booking.service_type ?? booking.serviceType ?? booking.type ?? "Forwarding",
  );

  const noop = () => {};

  const renderDetailView = () => {
    switch (serviceType) {
      case "Forwarding":
      case "Freight Forwarding":
        return <ForwardingBookingDetails booking={booking as never} onBack={onBack} onBookingUpdated={noop} />;

      case "Trucking":
        return <TruckingBookingDetails booking={booking as never} onBack={onBack} onUpdate={noop} />;

      case "Brokerage":
      case "Customs Brokerage":
        return <BrokerageBookingDetails booking={booking as never} onBack={onBack} onUpdate={noop} />;

      case "Marine Insurance":
        return <MarineInsuranceBookingDetails booking={booking as never} onBack={onBack} onUpdate={noop} />;

      case "Others":
        return <OthersBookingDetails booking={booking as never} onBack={onBack} onUpdate={noop} />;

      default:
        return <ForwardingBookingDetails booking={booking as never} onBack={onBack} onBookingUpdated={noop} />;
    }
  };

  const displayName = String(booking.name ?? booking.bookingId ?? booking.id ?? "Booking");
  const customerName = String(booking.customer_name ?? booking.customerName ?? "Unknown Customer");
  const createdAt = booking.created_at ?? booking.createdAt;

  return (
    <div className="h-full flex flex-col bg-[var(--neuron-bg-page)]">
      <div className="px-8 py-4 border-b border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[var(--theme-bg-surface-subtle)] rounded-lg text-[var(--neuron-ink-muted)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[var(--neuron-ink-primary)]">{displayName}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                {String(booking.status ?? "Draft")}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-[var(--neuron-ink-muted)]">
              <span className="flex items-center gap-1.5">
                <User size={14} />
                {customerName}
              </span>
              <span className="flex items-center gap-1.5">
                <Package size={14} />
                {serviceType}
              </span>
              {createdAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(String(createdAt)).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {renderDetailView()}
      </div>
    </div>
  );
}
