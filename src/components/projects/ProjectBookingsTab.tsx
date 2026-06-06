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
import { usePermission } from "../../context/PermissionProvider";
import { BookingCancelDeletePanel } from "../operations/shared/BookingCancelDeletePanel";
import { opsModuleForService } from "../../utils/bookings/opsModuleForService";
import type { ExecutionStatus } from "../../types/operations";

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
  const { can } = usePermission();
  // NEU-012: creating a booking FROM a project gates on the project's
  // Bookings-tab Create grant — the same key the bookings INSERT RLS policy
  // accepts (migration 141) — not a hardcoded department allowlist. The project
  // dictates which services it needs, so this is service-agnostic by design.
  const canCreateBooking = can("ops_projects_bookings_tab", "create");
  const [selectedBooking, setSelectedBooking] = useState<{
    bookingId: string;
    bookingType: string;
    bookingLabel?: string;
    bookingStatus?: ExecutionStatus;
    serviceType?: string; // NEU-019 WG-21: raw service label for per-service grants
  } | null>(null);
  const [cancelPanelOpen, setCancelPanelOpen] = useState(false);
  const [createBookingService, setCreateBookingService] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const servicesMetadata = project.services_metadata || [];

  const bookingsQueryKey = ["project_bookings", project.id, refreshTrigger];

  const { data: verifiedBookings = [], isLoading: isVerifying } = useQuery({
    queryKey: bookingsQueryKey,
    queryFn: async () => {
      // Single source of truth: bookings linked via the bookings.project_id
      // column (NEU-013). No more projects.linked_bookings JSONB array.
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, service_type, booking_number, name')
        .eq('project_id', project.id);

      if (error) {
        console.error('[ProjectBookingsTab] Failed to fetch project bookings:', error);
        return [];
      }

      return (data ?? []).map((b) => ({
        bookingId: b.id,
        bookingNumber: b.booking_number,
        serviceType: b.service_type,
        status: b.status,
        name: b.name ?? undefined,
      }));
    },
    staleTime: 30_000,
  });

  // Service types that already have a booking under this project — one per
  // service type is the hard rule (enforced by DB constraint in migration 110).
  const bookedServiceTypes = new Set<string>(
    verifiedBookings
      .map((b: any) => b.serviceType || b.service_type)
      .filter(Boolean)
  );
  const singleSvc = servicesMetadata[0];
  const singleSvcAlreadyBooked = singleSvc ? bookedServiceTypes.has(singleSvc.service_type) : false;
  const allServicesBooked = servicesMetadata.length > 0
    && servicesMetadata.every((svc: any) => bookedServiceTypes.has(svc.service_type));

  // Auto-open booking if selectedBookingId is provided
  useEffect(() => {
    if (selectedBookingId && !selectedBooking && verifiedBookings.length > 0) {
      const booking = verifiedBookings.find((b: any) => b.bookingId === selectedBookingId);
      if (booking) {
        const type = booking.serviceType || "others";
        setSelectedBooking({
          bookingId: selectedBookingId,
          bookingType: type.toLowerCase().replace(' ', '-'),
          bookingLabel: booking.name || booking.bookingNumber || selectedBookingId,
          bookingStatus: booking.status as ExecutionStatus,
          serviceType: booking.serviceType, // NEU-019 WG-21
        });
      }
    }
  }, [selectedBookingId, selectedBooking, verifiedBookings]);
  

  return (
    <>
      <div
        style={{
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
                color: "var(--theme-action-primary-bg)",
                marginBottom: "8px",
              }}
            >
              Operational Bookings
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--theme-text-muted)",
                margin: 0,
              }}
            >
              View and manage bookings created from this project across all service types.
            </p>
          </div>

          {/* Create Booking dropdown — only when services exist AND user can create bookings */}
          {servicesMetadata.length > 0 && canCreateBooking && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              {servicesMetadata.length === 1 ? (
                <button
                  onClick={() => !singleSvcAlreadyBooked && setCreateBookingService(singleSvc)}
                  disabled={singleSvcAlreadyBooked}
                  title={singleSvcAlreadyBooked ? `A ${singleSvc.service_type} booking already exists for this project` : undefined}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: singleSvcAlreadyBooked ? "var(--theme-bg-surface-subtle)" : "var(--theme-action-primary-bg)",
                    border: `1px solid ${singleSvcAlreadyBooked ? "var(--theme-border-default)" : "var(--theme-action-primary-bg)"}`,
                    borderRadius: "6px",
                    cursor: singleSvcAlreadyBooked ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: singleSvcAlreadyBooked ? "var(--theme-text-muted)" : "white",
                    opacity: singleSvcAlreadyBooked ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (singleSvcAlreadyBooked) return;
                    e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg-dark, #0D5B57)";
                  }}
                  onMouseLeave={(e) => {
                    if (singleSvcAlreadyBooked) return;
                    e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                  }}
                >
                  <Plus size={16} />
                  {singleSvcAlreadyBooked
                    ? `${singleSvc.service_type} booking already created`
                    : `Create ${singleSvc.service_type} Booking`}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => !allServicesBooked && setShowServiceDropdown(!showServiceDropdown)}
                    disabled={allServicesBooked}
                    title={allServicesBooked ? "All services for this project already have bookings" : undefined}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: allServicesBooked ? "var(--theme-bg-surface-subtle)" : "var(--theme-action-primary-bg)",
                      border: `1px solid ${allServicesBooked ? "var(--theme-border-default)" : "var(--theme-action-primary-bg)"}`,
                      borderRadius: "6px",
                      cursor: allServicesBooked ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: allServicesBooked ? "var(--theme-text-muted)" : "white",
                      opacity: allServicesBooked ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (allServicesBooked) return;
                      e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg-dark, #0D5B57)";
                    }}
                    onMouseLeave={(e) => {
                      if (allServicesBooked) return;
                      e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                    }}
                  >
                    <Plus size={16} />
                    {allServicesBooked ? "All services booked" : "Create Booking"}
                    {!allServicesBooked && <ChevronDown size={14} />}
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
                        border: "1px solid var(--theme-border-default)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20,
                        minWidth: "200px", overflow: "hidden",
                      }}>
                        {servicesMetadata.map((svc: any) => {
                          const alreadyBooked = bookedServiceTypes.has(svc.service_type);
                          return (
                            <button
                              key={svc.service_type}
                              disabled={alreadyBooked}
                              title={alreadyBooked ? `A ${svc.service_type} booking already exists for this project` : undefined}
                              onClick={() => {
                                if (alreadyBooked) return;
                                setCreateBookingService(svc);
                                setShowServiceDropdown(false);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between",
                                width: "100%", padding: "10px 16px", fontSize: "13px",
                                color: alreadyBooked ? "var(--theme-text-muted)" : "var(--theme-text-primary)",
                                backgroundColor: "var(--theme-bg-surface)",
                                border: "none", borderBottom: "1px solid var(--theme-border-subtle)",
                                cursor: alreadyBooked ? "not-allowed" : "pointer", textAlign: "left",
                                opacity: alreadyBooked ? 0.55 : 1,
                              }}
                              onMouseEnter={e => { if (!alreadyBooked) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                              onMouseLeave={e => { if (!alreadyBooked) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {getServiceIcon(svc.service_type, { size: 15, color: alreadyBooked ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)" })}
                                {svc.service_type}
                              </span>
                              {alreadyBooked && (
                                <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", fontStyle: "italic" }}>
                                  Already booked
                                </span>
                              )}
                            </button>
                          );
                        })}
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
          onViewBooking={(bookingId, bookingType) => {
            const b = verifiedBookings.find((x: any) => x.bookingId === bookingId);
            setSelectedBooking({
              bookingId,
              bookingType,
              bookingLabel: b?.name || b?.bookingNumber || bookingId,
              bookingStatus: b?.status as ExecutionStatus,
              serviceType: b?.serviceType, // NEU-019 WG-21
            });
          }}
          emptyState={
            servicesMetadata.length > 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)", margin: "0 0 4px" }}>
                  No bookings yet
                </p>
                <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: "0 0 16px" }}>
                  Create bookings to start tracking operational execution for this project.
                </p>
                {canCreateBooking && (
                  <button
                    onClick={() => setCreateBookingService(servicesMetadata[0])}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "var(--theme-action-primary-bg)",
                      border: "1px solid var(--theme-action-primary-bg)",
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
                )}
              </div>
            ) : (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginBottom: "8px" }}>
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
          onBack={() => { setSelectedBooking(null); setCancelPanelOpen(false); }}
          currentUser={currentUser}
          onOpenCancelDelete={() => setCancelPanelOpen(true)}
          onBookingUpdated={() => {
            setSelectedBooking(null);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}

      {/* Cancel / Delete Panel — rendered outside the drawer so z-index is not blocked */}
      {selectedBooking && (
        <BookingCancelDeletePanel
          isOpen={cancelPanelOpen}
          onClose={() => setCancelPanelOpen(false)}
          bookingId={selectedBooking.bookingId}
          bookingLabel={selectedBooking.bookingLabel || selectedBooking.bookingId}
          currentStatus={selectedBooking.bookingStatus || "Draft"}
          currentUser={currentUser}
          allowCancel={can(opsModuleForService(selectedBooking.serviceType || ""), "edit")} // NEU-019 WG-21
          allowDelete={can(opsModuleForService(selectedBooking.serviceType || ""), "delete")} // NEU-019 WG-21
          onSuccess={(action) => {
            setCancelPanelOpen(false);
            setSelectedBooking(null);
            setRefreshTrigger(prev => prev + 1);
          }}
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