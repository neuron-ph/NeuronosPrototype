import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Eye } from "lucide-react";
import type { Project, InquiryService } from "../../types/pricing";
import { ForwardingSpecsDisplay } from "../bd/service-displays/ForwardingSpecsDisplay";
import { BrokerageSpecsDisplay } from "../bd/service-displays/BrokerageSpecsDisplay";
import { TruckingSpecsDisplay } from "../bd/service-displays/TruckingSpecsDisplay";
import { MarineInsuranceSpecsDisplay } from "../bd/service-displays/MarineInsuranceSpecsDisplay";
import { OthersSpecsDisplay } from "../bd/service-displays/OthersSpecsDisplay";
import { CreateBookingFromProjectPanel } from "./CreateBookingFromProjectPanel";
import { ProjectBookingReadOnlyView } from "./ProjectBookingReadOnlyView";

interface ProjectServiceCardProps {
  service: InquiryService;
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onUpdate?: () => void;
  onViewBooking?: (bookingId: string, serviceType: string) => void;
}

export function ProjectServiceCard({ service, project, currentUser, onUpdate, onViewBooking }: ProjectServiceCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<{ bookingId: string; bookingType: string } | null>(null);

  const linkedBookings = project.linkedBookings || [];
  
  // DEBUG: Log when project prop changes
  console.log(`🔍 ProjectServiceCard [${service.service_type}] - Project updated:`, {
    projectId: project.id,
    projectNumber: project.project_number,
    totalLinkedBookings: linkedBookings.length,
    linkedBookings: linkedBookings,
    lastUpdated: project.updated_at
  });

  // Check if current user can create bookings
  const canCreateBookings = 
    currentUser?.department === "Pricing" || 
    currentUser?.department === "PD" || 
    currentUser?.department === "Executive" ||
    currentUser?.department === "BD" ||
    currentUser?.department === "Business Development";

  // Get bookings for this service
  const getBookingsForService = () => {
    return linkedBookings.filter(booking => booking.serviceType === service.service_type);
  };

  const bookingsForService = getBookingsForService();
  const hasBookings = bookingsForService.length > 0;

  const handleCreateBooking = () => {
    setIsCreateModalOpen(true);
  };

  const handleViewBooking = (bookingId: string, serviceType: string) => {
    if (onViewBooking) {
      // Use callback to switch to Bookings tab
      onViewBooking(bookingId, serviceType);
    } else {
      // Fallback to local view (for backwards compatibility)
      const serviceTypeMap: Record<string, string> = {
        "Forwarding": "forwarding",
        "Brokerage": "brokerage",
        "Trucking": "trucking",
        "Marine Insurance": "marine-insurance"
      };
      
      const bookingType = serviceTypeMap[serviceType] || serviceType.toLowerCase();
      setSelectedBooking({ bookingId, bookingType });
    }
  };

  const handleBookingCreated = () => {
    setIsCreateModalOpen(false);
    if (onUpdate) {
      onUpdate();
    }
  };

  // Render service specification display
  const renderServiceSpecs = () => {
    const details = service.service_details as any;

    switch (service.service_type) {
      case "Forwarding":
        return <ForwardingSpecsDisplay details={details} />;
      case "Brokerage":
        return <BrokerageSpecsDisplay details={details} />;
      case "Trucking":
        return <TruckingSpecsDisplay details={details} />;
      case "Marine Insurance":
        return <MarineInsuranceSpecsDisplay details={details} />;
      case "Others":
        return <OthersSpecsDisplay details={details} />;
      default:
        return null;
    }
  };

  // Get service summary text
  const getServiceSummary = () => {
    const details = service.service_details as any;

    switch (service.service_type) {
      case "Forwarding":
        return `${details.mode || "—"} • ${details.cargo_type || "—"}${details.pol ? ` • ${details.pol} → ${details.pod}` : ""}`;
      case "Brokerage":
        return `${details.subtype || "—"} • ${details.type_of_entry || "—"}`;
      case "Trucking":
        return details.truck_type || "—";
      case "Marine Insurance":
        return details.commodity_description || "—";
      case "Others":
        const desc = details.service_description || "";
        return desc.length > 80 ? `${desc.substring(0, 80)}...` : desc;
      default:
        return "—";
    }
  };

  // If viewing a booking, show the readonly view
  if (selectedBooking) {
    return (
      <ProjectBookingReadOnlyView
        bookingId={selectedBooking.bookingId}
        bookingType={selectedBooking.bookingType as any}
        onBack={() => setSelectedBooking(null)}
        currentUser={currentUser}
      />
    );
  }

  return (
    <>
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "24px"
      }}>
        {/* Service Header - Collapsible */}
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "var(--theme-bg-page)",
            borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer"
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}

            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--theme-action-primary-bg)",
                marginBottom: "4px"
              }}>
                {service.service_type} Service Details
              </div>
              <div style={{
                fontSize: "13px",
                color: "var(--theme-text-muted)"
              }}>
                {getServiceSummary()}
              </div>
            </div>

            {/* Bookings count badge */}
            <div style={{
              padding: "4px 12px",
              backgroundColor: hasBookings ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
              border: `1px solid ${hasBookings ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"}`,
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: 600,
              color: hasBookings ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
            }}>
              {bookingsForService.length} {bookingsForService.length === 1 ? "Booking" : "Bookings"}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div>
            {/* Service Specification Details */}
            <div style={{ padding: "24px", borderBottom: "1px solid var(--theme-border-default)" }}>
              <div style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "16px"
              }}>
                Service Specifications
              </div>
              {renderServiceSpecs()}
            </div>

            {/* Bookings Section */}
            <div style={{ padding: "24px" }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px"
              }}>
                <div style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--theme-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Bookings ({bookingsForService.length})
                </div>

                {canCreateBookings && !hasBookings && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateBooking();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 16px",
                      backgroundColor: "var(--theme-action-primary-bg)",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "white",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg-dark, #0D5F58)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                    }}
                  >
                    <Plus size={16} />
                    Create Booking
                  </button>
                )}
              </div>

              {/* Bookings List */}
              {hasBookings ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {bookingsForService.map((booking) => (
                    <div
                      key={booking.bookingId}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewBooking(booking.bookingId, service.service_type);
                      }}
                      style={{
                        padding: "16px",
                        backgroundColor: "var(--theme-bg-page)",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                        e.currentTarget.style.borderColor = "var(--theme-border-default)";
                      }}
                    >
                      <div>
                        <div style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--theme-text-primary)",
                          marginBottom: "4px"
                        }}>
                          {booking.bookingId}
                        </div>
                        <div style={{
                          fontSize: "13px",
                          color: "var(--theme-text-muted)"
                        }}>
                          {booking.serviceType.charAt(0).toUpperCase() + booking.serviceType.slice(1).replace('-', ' ')} Booking
                        </div>
                      </div>

                      <Eye size={16} style={{ color: "var(--theme-text-muted)" }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: "32px",
                  textAlign: "center",
                  backgroundColor: "var(--theme-bg-page)",
                  border: "1px dashed var(--theme-border-default)",
                  borderRadius: "8px"
                }}>
                  <p style={{
                    fontSize: "14px",
                    color: "var(--theme-text-muted)",
                    margin: 0
                  }}>
                    No bookings created yet for this service
                  </p>
                  {canCreateBookings && (
                    <p style={{
                      fontSize: "13px",
                      color: "var(--theme-text-muted)",
                      margin: "8px 0 0 0"
                    }}>
                      Click "Create Booking" above to get started
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Booking Modal */}
      {isCreateModalOpen && (
        <CreateBookingFromProjectPanel
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          service={service}
          project={project}
          onBookingCreated={handleBookingCreated}
          currentUser={currentUser}
        />
      )}
    </>
  );
}