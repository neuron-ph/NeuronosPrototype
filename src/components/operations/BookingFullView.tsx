import { ArrowLeft, Calendar, MapPin, Package, User } from "lucide-react";
import { useState } from "react";
import { ForwardingBookingDetails } from "./forwarding/ForwardingBookingDetails";
import { TruckingBookingDetails } from "./TruckingBookingDetails";
import { BrokerageBookingDetails } from "./BrokerageBookingDetails";
import { MarineInsuranceBookingDetails } from "./MarineInsuranceBookingDetails";
import { OthersBookingDetails } from "./OthersBookingDetails";

interface BookingFullViewProps {
  booking: any;
  onBack: () => void;
}

export function BookingFullView({ booking, onBack }: BookingFullViewProps) {
  // If no booking is provided, show error or empty state
  if (!booking) {
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

  // Determine which detail view to show based on booking type
  // This logic assumes booking object has a 'type' or 'serviceType' field
  // You might need to adjust this based on your actual data structure
  
  const renderDetailView = () => {
    // Check for explicit service type or infer from ID prefix/structure
    const serviceType = booking.serviceType || booking.type || "Forwarding";
    
    const noop = () => {};
    switch (serviceType) {
      case "Forwarding":
      case "Freight Forwarding":
        return <ForwardingBookingDetails booking={booking} onBack={onBack} onBookingUpdated={noop} />;

      case "Trucking":
        return <TruckingBookingDetails booking={booking} onBack={onBack} onUpdate={noop} />;

      case "Brokerage":
      case "Customs Brokerage":
        return <BrokerageBookingDetails booking={booking} onBack={onBack} onUpdate={noop} />;

      case "Marine Insurance":
        return <MarineInsuranceBookingDetails booking={booking} onBack={onBack} onUpdate={noop} />;

      case "Others":
        return <OthersBookingDetails booking={booking} onBack={onBack} onUpdate={noop} />;

      default:
        return <ForwardingBookingDetails booking={booking} onBack={onBack} onBookingUpdated={noop} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--neuron-bg-page)]">
      {/* Header */}
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
              <h1 className="text-xl font-semibold text-[var(--neuron-ink-primary)]">
                {booking.name || booking.bookingId || booking.id || "New Booking"}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100`}>
                {booking.status || "Draft"}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-[var(--neuron-ink-muted)]">
              <span className="flex items-center gap-1.5">
                <User size={14} />
                {booking.customerName || "Unknown Customer"}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={14} />
                {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : "No Date"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Action buttons can go here */}
          <button className="px-4 py-2 text-sm font-medium text-[var(--neuron-ink-primary)] border border-[var(--neuron-ui-border)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] bg-[var(--theme-bg-surface)] shadow-sm transition-all">
            Edit Booking
          </button>
          <button className="px-4 py-2 text-sm font-medium text-white bg-[var(--neuron-brand-green)] rounded-lg hover:bg-[var(--neuron-brand-green-hover)] shadow-sm transition-all">
            Update Status
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {renderDetailView()}
      </div>
    </div>
  );
}
