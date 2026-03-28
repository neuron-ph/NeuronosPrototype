import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, FileText } from "lucide-react";
import { CreateBookingFromProjectPanel } from "./CreateBookingFromProjectPanel";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { BookingsTable } from "../shared/BookingsTable";
import { getServiceIcon } from "../../utils/quotation-helpers";
import type { Project } from "../../types/pricing";
import { ProjectBookingReadOnlyView } from "./ProjectBookingReadOnlyView";

interface ProjectBookingsTabProps {
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  selectedBookingId?: string | null;
}

export function ProjectBookingsTab({ project, currentUser, selectedBookingId }: ProjectBookingsTabProps) {
  const queryClient = useQueryClient();
  const [selectedBooking, setSelectedBooking] = useState<{
    bookingId: string;
    bookingType: string;
  } | null>(null);
  const [hasCleanedUp, setHasCleanedUp] = useState(false);
  const [createBookingService, setCreateBookingService] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const linkedBookings = project.linkedBookings || [];
  const servicesMetadata = project.services_metadata || [];

  const bookingsQueryKey = ["project_bookings", project.project_number, linkedBookings.length, hasCleanedUp, refreshTrigger];

  const { data: verifiedBookings = [], isLoading: isVerifying } = useQuery({
    queryKey: bookingsQueryKey,
    queryFn: async () => {
      const verified: any[] = [];

      for (const booking of linkedBookings) {
        try {
          const serviceType = booking.serviceType || booking.service;
          let endpoint = "";

          switch (serviceType) {
            case "Forwarding":
              endpoint = "forwarding_bookings";
              break;
            case "Brokerage":
              endpoint = "brokerage_bookings";
              break;
            case "Trucking":
              endpoint = "trucking_bookings";
              break;
            case "Marine Insurance":
              endpoint = "marine_insurance_bookings";
              break;
            case "Others":
              endpoint = "others_bookings";
              break;
            default:
              console.warn(`Unknown service type: ${serviceType}`);
              continue;
          }

          const { data: bookingData } = await supabase.from(endpoint).select('*').eq('id', booking.bookingId).maybeSingle();

          if (bookingData) {
            verified.push({
              ...booking,
              status: bookingData.status || booking.status
            });
          } else {
            console.warn(`Booking ${booking.bookingId} not found in ${endpoint}`);
          }
        } catch (error) {
          console.error(`Error verifying booking ${booking.bookingId}:`, error);
        }
      }

      // If some bookings were removed, clean up the project automatically
      if (verified.length !== linkedBookings.length && !hasCleanedUp) {
        const orphanedCount = linkedBookings.length - verified.length;
        console.warn(
          `Found ${orphanedCount} orphaned booking reference(s) in project ${project.project_number}. ` +
          `Only ${verified.length} of ${linkedBookings.length} linked bookings actually exist.`
        );

        try {
          console.log(`Automatically cleaning up orphaned bookings from project ${project.project_number}...`);
          const { error: cleanupError } = await supabase.from('projects').update({
            linked_bookings: verified,
            updated_at: new Date().toISOString(),
          }).eq('id', project.id);

          if (!cleanupError) {
            console.log(`Cleanup completed: removed ${orphanedCount} orphaned reference(s)`);
            setHasCleanedUp(true);
            return [];
          } else {
            console.error('Failed to clean up orphaned bookings:', cleanupError?.message);
          }
        } catch (error) {
          console.error('Error during automatic cleanup:', error);
        }
      }

      return verified;
    },
    staleTime: 30_000,
  });

  // Auto-open booking if selectedBookingId is provided
  useEffect(() => {
    if (selectedBookingId && !selectedBooking && verifiedBookings.length > 0) {
      const booking = verifiedBookings.find((b: any) => b.bookingId === selectedBookingId);
      if (booking) {
        const type = booking.bookingType || booking.serviceType || booking.service || "others";
        setSelectedBooking({
          bookingId: selectedBookingId,
          bookingType: type.toLowerCase().replace(' ', '-')
        });
      }
    }
  }, [selectedBookingId, selectedBooking, verifiedBookings]);
  
  // DEBUG: Log the project data to console to help diagnose the booking issue
  console.log('🔍 ProjectBookingsTab Debug:', {
    projectId: project.id,
    projectNumber: project.project_number,
    linkedBookingsCount: linkedBookings.length,
    verifiedBookingsCount: verifiedBookings.length,
    linkedBookings: linkedBookings,
    verifiedBookings: verifiedBookings,
    bookingStatus: project.booking_status,
    isVerifying: isVerifying
  });

  return (
    <>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "32px 48px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--neuron-brand-green)",
                marginBottom: "8px",
              }}
            >
              Operational Bookings
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--neuron-ink-muted)",
                margin: 0,
              }}
            >
              View and manage bookings created from this project across all service types.
            </p>
          </div>

          {/* Create Booking dropdown — only when services exist */}
          {servicesMetadata.length > 0 && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              {servicesMetadata.length === 1 ? (
                <button
                  onClick={() => setCreateBookingService(servicesMetadata[0])}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "var(--neuron-brand-green)",
                    border: "1px solid var(--neuron-brand-green)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "white",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#0D5B57";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                  }}
                >
                  <Plus size={16} />
                  Create {servicesMetadata[0].service_type} Booking
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "var(--neuron-brand-green)",
                      border: "1px solid var(--neuron-brand-green)",
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "white",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#0D5B57";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                    }}
                  >
                    <Plus size={16} />
                    Create Booking
                    <ChevronDown size={14} />
                  </button>
                  {showServiceDropdown && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 10 }}
                        onClick={() => setShowServiceDropdown(false)}
                      />
                      <div style={{
                        position: "absolute", top: "100%", right: 0, marginTop: "4px",
                        backgroundColor: "var(--theme-bg-surface)", borderRadius: "8px",
                        border: "1px solid var(--neuron-ui-border)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20,
                        minWidth: "200px", overflow: "hidden",
                      }}>
                        {servicesMetadata.map((svc: any) => (
                          <button
                            key={svc.service_type}
                            onClick={() => {
                              setCreateBookingService(svc);
                              setShowServiceDropdown(false);
                            }}
                            style={{
                              display: "flex", alignItems: "center", gap: "8px",
                              width: "100%", padding: "10px 16px", fontSize: "13px",
                              color: "var(--theme-text-primary)", backgroundColor: "var(--theme-bg-surface)",
                              border: "none", borderBottom: "1px solid var(--theme-border-subtle)",
                              cursor: "pointer", textAlign: "left",
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F0FAFA"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = "white"}
                          >
                            {getServiceIcon(svc.service_type, { size: 15, color: "var(--theme-action-primary-bg)" })}
                            {svc.service_type}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ✨ Shared BookingsTable — same table used in Contracts */}
        <BookingsTable
          bookings={verifiedBookings}
          isLoading={isVerifying}
          onViewBooking={(bookingId, bookingType) =>
            setSelectedBooking({ bookingId, bookingType })
          }
          emptyState={
            servicesMetadata.length > 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 4px" }}>
                  No bookings yet
                </p>
                <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: "0 0 16px" }}>
                  Create bookings to start tracking operational execution for this project.
                </p>
                <button
                  onClick={() => setCreateBookingService(servicesMetadata[0])}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "var(--neuron-brand-green)",
                    border: "1px solid var(--neuron-brand-green)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "white",
                  }}
                >
                  <Plus size={16} />
                  Create Booking
                </button>
              </div>
            ) : (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--neuron-ink-muted)", marginBottom: "8px" }}>
                  No services available
                </p>
                <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0 }}>
                  No service specifications found for this project
                </p>
              </div>
            )
          }
        />
      </div>

      {/* Booking Detail Drawer */}
      {selectedBooking && (
        <ProjectBookingReadOnlyView
          bookingId={selectedBooking.bookingId}
          bookingType={selectedBooking.bookingType as any}
          onBack={() => setSelectedBooking(null)}
          currentUser={currentUser}
        />
      )}

      {/* Create Booking Panel */}
      {createBookingService && (
        <CreateBookingFromProjectPanel
          isOpen={!!createBookingService}
          onClose={() => setCreateBookingService(null)}
          project={project}
          service={createBookingService}
          currentUser={currentUser}
          onBookingCreated={() => {
            setCreateBookingService(null);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </>
  );
}