import { useState, useEffect } from "react";
import { Clipboard, Plus } from "lucide-react";
import type { Project, InquiryService } from "../../types/pricing";
import { ProjectBookingReadOnlyView } from "./ProjectBookingReadOnlyView";
import { CreateBookingFromProjectModal } from "./CreateBookingFromProjectModal";
import { ForwardingSpecsDisplay } from "../bd/service-displays/ForwardingSpecsDisplay";
import { BrokerageSpecsDisplay } from "../bd/service-displays/BrokerageSpecsDisplay";
import { TruckingSpecsDisplay } from "../bd/service-displays/TruckingSpecsDisplay";
import { MarineInsuranceSpecsDisplay } from "../bd/service-displays/MarineInsuranceSpecsDisplay";
import { OthersSpecsDisplay } from "../bd/service-displays/OthersSpecsDisplay";

interface ProjectBookingsTabBDProps {
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onUpdate?: () => void;
}

export function ProjectBookingsTabBD({ project, currentUser, onUpdate }: ProjectBookingsTabBDProps) {
  const [expandedServices, setExpandedServices] = useState<Record<number, boolean>>({});
  const [selectedBooking, setSelectedBooking] = useState<{ bookingId: string; bookingType: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<InquiryService | null>(null);

  const servicesMetadata = project.services_metadata || [];
  const linkedBookings = project.linkedBookings || [];
  
  // Check if current user can create bookings (Pricing, PD, Executive, or BD)
  // BD needs to add instructions for Operations when PD makes bookings
  const canCreateBookings = 
    currentUser?.department === "Pricing" || 
    currentUser?.department === "PD" || 
    currentUser?.department === "Executive" ||
    currentUser?.department === "BD" ||
    currentUser?.department === "Business Development";
  
  console.log("ProjectBookingsTabBD - User:", currentUser?.name, "| Department:", currentUser?.department, "| Can Create Bookings:", canCreateBookings);

  const toggleServiceExpanded = (index: number) => {
    setExpandedServices(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleCreateBooking = (service: InquiryService) => {
    setSelectedService(service);
    setIsCreateModalOpen(true);
  };

  const handleViewBooking = (bookingId: string, serviceType: string) => {
    // Map service type to booking type
    const bookingTypeMap: Record<string, string> = {
      "Forwarding": "forwarding",
      "Brokerage": "brokerage",
      "Trucking": "trucking",
      "Marine Insurance": "marine-insurance",
      "Others": "others"
    };

    const bookingType = bookingTypeMap[serviceType];
    if (bookingType) {
      setSelectedBooking({ bookingId, bookingType });
    }
  };

  // Get bookings for a specific service
  const getBookingsForService = (serviceType: string) => {
    return linkedBookings.filter(b => b.serviceType === serviceType);
  };

  // If viewing a specific booking, show the read-only view
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
    <div style={{
      flex: 1,
      overflow: "auto"
    }}>
      {/* Main Content Area */}
      <div style={{
        padding: "32px 48px",
        maxWidth: "1400px",
        margin: "0 auto"
      }}>

        {/* Header Section */}
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <Clipboard size={18} />
            Project Bookings
          </h2>
          <p style={{
            fontSize: "13px",
            color: "var(--theme-text-muted)",
            margin: 0
          }}>
            View operational bookings created from this project. Click on any booking to view details and add comments.
          </p>
        </div>

        {servicesMetadata.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
              gap: "20px",
            }}
          >
            {servicesMetadata
              .filter((service) => {
                // Only show services that have bookings
                const bookingsForService = getBookingsForService(service.service_type);
                return bookingsForService.length > 0;
              })
              .map((service, idx) => {
              const isExpanded = expandedServices[idx] ?? false;
              const bookingsForService = getBookingsForService(service.service_type);
              const hasBookings = bookingsForService.length > 0;

              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "8px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Service Header */}
                  <div
                    style={{
                      padding: "16px 20px",
                      backgroundColor: "var(--theme-bg-page)",
                      borderBottom: "1px solid var(--theme-border-default)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "var(--theme-action-primary-bg)",
                            marginBottom: "4px",
                          }}
                        >
                          {service.service_type}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--theme-text-muted)",
                          }}
                        >
                          {service.service_type === "Forwarding" && (
                            <>
                              {service.service_details.mode} • {service.service_details.cargo_type}
                              {service.service_details.pol && ` • ${service.service_details.pol} → ${service.service_details.pod}`}
                            </>
                          )}
                          {service.service_type === "Brokerage" && (
                            <>
                              {service.service_details.subtype} • {service.service_details.type_of_entry}
                            </>
                          )}
                          {service.service_type === "Trucking" && (
                            <>
                              {service.service_details.truck_type}
                            </>
                          )}
                          {service.service_type === "Marine Insurance" && (
                            <>
                              {service.service_details.commodity_description}
                            </>
                          )}
                          {service.service_type === "Others" && (
                            <>
                              {service.service_details.service_description?.substring(0, 60)}
                              {service.service_details.service_description?.length > 60 ? "..." : ""}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Bookings count badge */}
                      <div
                        style={{
                          padding: "4px 10px",
                          backgroundColor: hasBookings ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                          border: `1px solid ${
                            hasBookings ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"
                          }`,
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: hasBookings
                            ? "var(--theme-action-primary-bg)"
                            : "var(--theme-text-muted)",
                        }}
                      >
                        {bookingsForService.length}
                      </div>
                    </div>
                  </div>

                  {/* Service Specification Toggle */}
                  <div
                    onClick={() => toggleServiceExpanded(idx)}
                    style={{
                      padding: "12px 20px",
                      backgroundColor: "var(--theme-bg-page)",
                      borderBottom: "1px solid var(--theme-border-default)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--theme-action-primary-bg)",
                      transition: "background-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    }}
                  >
                    {isExpanded ? "▼" : "▶"} {isExpanded ? "Hide" : "Show"} Service Specification
                  </div>

                  {/* Expanded Service Specification */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "16px 20px",
                        backgroundColor: "var(--theme-bg-page)",
                        borderBottom: "1px solid var(--theme-border-default)",
                      }}
                    >
                      <ServiceSpecificationDisplay service={service} />
                    </div>
                  )}

                  {/* Bookings Section */}
                  <div style={{ padding: "16px 20px", flex: 1 }}>
                    {/* Section Header with Create Button */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: hasBookings ? "12px" : "0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--theme-text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Bookings ({bookingsForService.length})
                      </div>
                      {canCreateBookings && !hasBookings && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateBooking(service);
                          }}
                          style={{
                            padding: "6px 12px",
                            background: "var(--theme-action-primary-bg)",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            transition: "all 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--theme-action-primary-bg-dark, #0D5F58)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              "var(--theme-action-primary-bg)";
                          }}
                        >
                          <Plus size={14} />
                          Create
                        </button>
                      )}
                    </div>

                    {/* Bookings List or Empty State */}
                    {hasBookings ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {bookingsForService.map((booking, bookingIdx) => (
                          <div
                            key={bookingIdx}
                            onClick={() =>
                              handleViewBooking(
                                booking.bookingNumber,
                                service.service_type
                              )
                            }
                            style={{
                              padding: "12px 16px",
                              background: "var(--theme-status-success-bg)",
                              border: "1px solid var(--theme-status-success-border)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor =
                                "var(--theme-action-primary-bg)";
                              e.currentTarget.style.boxShadow =
                                "0 0 0 2px rgba(15, 118, 110, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--theme-status-success-border)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--theme-text-primary)",
                                marginBottom: "4px",
                              }}
                            >
                              {booking.bookingNumber}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--theme-text-muted)",
                              }}
                            >
                              Created:{" "}
                              {booking.createdAt
                                ? new Date(
                                    booking.createdAt
                                  ).toLocaleDateString()
                                : "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "24px 16px",
                          textAlign: "center",
                          backgroundColor: "var(--theme-bg-page)",
                          border: "1px dashed var(--theme-border-default)",
                          borderRadius: "6px",
                          marginTop: "12px",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--theme-text-muted)",
                            margin: 0,
                          }}
                        >
                          No bookings yet
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            padding: "48px 24px",
            textAlign: "center"
          }}>
            <p style={{
              fontSize: "14px",
              color: "var(--theme-text-muted)",
              marginBottom: "8px"
            }}>
              No service specifications available
            </p>
            <p style={{
              fontSize: "13px",
              color: "var(--theme-text-muted)",
              margin: 0
            }}>
              Service specifications are inherited from Quotation {project.quotation_number}
            </p>
          </div>
        )}
      </div>

      {/* Create Booking Modal */}
      {isCreateModalOpen && selectedService && (
        <CreateBookingFromProjectModal
          isOpen={isCreateModalOpen}
          project={project}
          service={selectedService}
          currentUser={currentUser}
          onClose={() => {
            setIsCreateModalOpen(false);
            setSelectedService(null);
          }}
          onSuccess={() => {
            if (onUpdate) onUpdate();
            setIsCreateModalOpen(false);
            setSelectedService(null);
          }}
        />
      )}
    </div>
  );
}

// Helper component to render service-specific specification displays
function ServiceSpecificationDisplay({ service }: { service: InquiryService }) {
  switch (service.service_type) {
    case "Forwarding":
      return <ForwardingSpecsDisplay details={service.service_details as any} />;
    case "Brokerage":
      return <BrokerageSpecsDisplay details={service.service_details as any} />;
    case "Trucking":
      return <TruckingSpecsDisplay details={service.service_details as any} />;
    case "Marine Insurance":
      return <MarineInsuranceSpecsDisplay details={service.service_details as any} />;
    case "Others":
      return <OthersSpecsDisplay details={service.service_details as any} />;
    default:
      return null;
  }
}