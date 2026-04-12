import { useState } from "react";
import { Ship, FileText, Truck, Shield, Package, ArrowLeft } from "lucide-react";
import { CreateForwardingBookingPanel } from "./forwarding/CreateForwardingBookingPanel";
import { CreateBrokerageBookingPanel } from "./CreateBrokerageBookingPanel";
import { CreateTruckingBookingPanel } from "./CreateTruckingBookingPanel";
import { CreateMarineInsuranceBookingPanel } from "./CreateMarineInsuranceBookingPanel";
import { CreateOthersBookingPanel } from "./CreateOthersBookingPanel";
import { useUser } from "../../hooks/useUser";

interface CreateBookingProps {
  onBack: () => void;
  onSubmit: (bookingData: any) => void;
}

export function CreateBooking({ onBack, onSubmit }: CreateBookingProps) {
  const { user } = useUser();
  const [activeService, setActiveService] = useState<string | null>(null);

  const handleClose = () => setActiveService(null);

  const handleSuccess = (data: any) => {
    handleClose();
    onSubmit(data);
  };

  const services = [
    {
      id: "Forwarding",
      title: "Forwarding",
      description: "International freight forwarding (Sea/Air)",
      icon: Ship,
      color: "var(--theme-action-primary-bg)",
      bgColor: "var(--theme-bg-surface-tint)"
    },
    {
      id: "Brokerage",
      title: "Brokerage",
      description: "Customs clearance and documentation",
      icon: FileText,
      color: "var(--neuron-semantic-warn)",
      bgColor: "var(--theme-status-warning-bg)"
    },
    {
      id: "Trucking",
      title: "Trucking",
      description: "Local transport and delivery",
      icon: Truck,
      color: "var(--neuron-semantic-info)",
      bgColor: "var(--neuron-semantic-info-bg)"
    },
    {
      id: "Marine Insurance",
      title: "Marine Insurance",
      description: "Cargo protection and insurance",
      icon: Shield,
      color: "var(--neuron-semantic-danger)",
      bgColor: "var(--theme-status-danger-bg)"
    },
    {
      id: "Others",
      title: "Others",
      description: "Special services and miscellaneous",
      icon: Package,
      color: "var(--theme-text-secondary)",
      bgColor: "var(--neuron-pill-inactive-bg)"
    }
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--neuron-bg-page)]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-[var(--theme-bg-surface-subtle)] rounded-lg text-[var(--neuron-ink-muted)] transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[var(--neuron-ink-primary)]">Create New Booking</h1>
          <p className="text-sm text-[var(--neuron-ink-muted)]">Select a service type to proceed</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => setActiveService(service.id)}
              className="flex flex-col items-start p-6 bg-[var(--theme-bg-surface)] rounded-xl border border-[var(--neuron-ui-border)] hover:border-[var(--neuron-brand-green)] hover:shadow-md transition-all text-left group"
            >
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: service.bgColor }}
              >
                <service.icon size={24} style={{ color: service.color }} />
              </div>
              <h3 className="text-lg font-semibold text-[var(--neuron-ink-primary)] mb-2 group-hover:text-[var(--neuron-brand-green)] transition-colors">
                {service.title}
              </h3>
              <p className="text-sm text-[var(--neuron-ink-muted)] leading-relaxed">
                {service.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Panels */}
      {activeService === "Forwarding" && (
        <CreateForwardingBookingPanel
          isOpen={true}
          onClose={handleClose}
          onBookingCreated={handleSuccess}
          currentUser={user}
        />
      )}
      
      {activeService === "Brokerage" && (
        <CreateBrokerageBookingPanel
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
          currentUser={user}
        />
      )}

      {activeService === "Trucking" && (
        <CreateTruckingBookingPanel
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}

      {activeService === "Marine Insurance" && (
        <CreateMarineInsuranceBookingPanel
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}

      {activeService === "Others" && (
        <CreateOthersBookingPanel
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
