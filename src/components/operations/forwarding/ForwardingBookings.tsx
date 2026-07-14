import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, Package, Briefcase, UserCheck, FileEdit, Clock, CheckCircle, Archive } from "lucide-react";
import { CreateForwardingBookingPanel } from "./CreateForwardingBookingPanel";
import { ForwardingBookingDetails } from "./ForwardingBookingDetails";
import { useUrlSelection } from "../../../hooks/useUrlSelection";
import type { ForwardingBooking, ExecutionStatus } from "../../../types/operations";
import { NeuronStatusPill } from "../../NeuronStatusPill";
import { SkeletonTable } from "../../shared/NeuronSkeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useDataScope } from "../../../hooks/useDataScope";
import { useBookingAssignmentVisibility } from "../../../hooks/useBookingAssignmentVisibility";
import { useBookingsPaginated, useBookingTabCounts, useBookingFilterOptions } from "../../../hooks/useBookingsPaginated";
import { usePermission } from "../../../context/PermissionProvider";
import { useUnreadEntityIds } from "../../../hooks/useNotifications";
import { normalizeDetails } from "../../../utils/bookings/bookingDetailsCompat";
import { getStatusOptions } from "../../../config/booking/bookingFieldOptions";
import { useRealtimeSync } from "../../../hooks/useRealtimeSync";
import { TablePagination } from "../../shared/TablePagination";

interface ForwardingBookingsProps {
  /** Optional notification when a booking is opened (e.g. to record a recent). */
  onSelectBooking?: (booking: ForwardingBooking) => void;
  currentUser?: { id?: string; name: string; email: string; department: string } | null;
  /** Deep-link: auto-select this booking when loaded */
  pendingBookingId?: string | null;
  /** Deep-link: tab to open the detail on */
  initialTab?: string | null;
  /** Deep-link: row/item to highlight inside the detail */
  highlightId?: string | null;
}

/** Maps a unified bookings row to the ForwardingBooking shape */
function mapToForwardingBooking(row: Record<string, any>): ForwardingBooking {
  const d = normalizeDetails(row.details || {}, "Forwarding");
  return {
    // Spread details first so top-level fields override
    ...d,
    ...row,
    // Explicit camelCase mappings expected by ForwardingBooking type
    bookingId: row.id,
    id: row.id,
    booking_number: row.booking_number,
    customerName: row.customer_name,
    projectNumber: d.project_number || row.project_id,
    accountOwner: d.account_owner || row.manager_name,
    accountHandler: d.account_handler || row.handler_name,
    assigned_handler_name: row.handler_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    movement: row.movement_type || d.movement_type,
    mode: row.mode || d.mode,
    // Shipment fields from details
    aolPol: d.aol_pol,
    aodPod: d.aod_pod,
    consignee: d.consignee,
    shipper: d.shipper,
    carrier: d.carrier,
    mblMawb: d.mbl_mawb,
    hblHawb: d.hbl_hawb,
    commodityDescription: d.commodity_description,
    grossWeight: d.gross_weight,
    eta: d.eta,
    typeOfEntry: d.type_of_entry,
    cargoType: d.cargo_type,
    stackability: d.stackability,
    deliveryAddress: d.delivery_address,
    quotationReferenceNumber: d.quotation_reference_number,
    countryOfOrigin: d.country_of_origin,
    preferentialTreatment: d.preferential_treatment,
    forwarder: d.forwarder,
    dimensions: d.dimensions,
    registryNumber: d.registry_number,
  } as unknown as ForwardingBooking;
}

export function ForwardingBookings({ onSelectBooking, currentUser, pendingBookingId, initialTab, highlightId }: ForwardingBookingsProps) {
  const { can } = usePermission();
  const canViewAllTab        = can("ops_forwarding_all_tab", "view");
  const canViewMyTab         = can("ops_forwarding_my_tab", "view");
  const canViewDraftTab      = can("ops_forwarding_draft_tab", "view");
  const canViewInProgressTab = can("ops_forwarding_in_progress_tab", "view");
  const canViewCompletedTab  = can("ops_forwarding_completed_tab", "view");
  const canViewCancelledTab  = can("ops_forwarding_cancelled_tab", "view");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [movementFilter, setMovementFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "my" | "draft" | "in-progress" | "completed" | "cancelled">(() => {
    if (canViewAllTab)        return "all";
    if (canViewMyTab)         return "my";
    if (canViewDraftTab)      return "draft";
    if (canViewInProgressTab) return "in-progress";
    if (canViewCompletedTab)  return "completed";
    return "cancelled";
  });
  const [timePeriodFilter, setTimePeriodFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [handlerFilter, setHandlerFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [resumeDraft, setResumeDraft] = useState<Record<string, unknown> | null>(null);
  const [urlBookingId, setUrlBookingId] = useUrlSelection("booking");
  const suppressUrlSelectionRef = useRef(false);
  const [selectedBooking, setSelectedBooking] = useState<ForwardingBooking | null>(null);

  const { scope, isLoaded: scopeLoaded } = useDataScope('bookings_forwarding');
  const { index: assignmentIndex, isLoaded: assignmentIndexLoaded } = useBookingAssignmentVisibility({
    userIds: scope.type === 'userIds' ? scope.ids : null,
  });

  // ── Bookings fetch (server-side: filters/tab/scope run in the DB) ──────────
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const dataReady = scopeLoaded && assignmentIndexLoaded;

  const filterKey = JSON.stringify({
    activeTab, searchTerm, statusFilter, movementFilter, timePeriodFilter, ownerFilter, handlerFilter, modeFilter,
  });
  useEffect(() => { setPage(0); }, [filterKey]);

  const {
    rows: rawPage,
    total,
    totalPages,
    pageSize,
    isLoading,
    isFetching,
  } = useBookingsPaginated({
    serviceType: "Forwarding",
    page,
    enabled: dataReady,
    scope,
    assignmentIndex,
    currentUserName: currentUser?.name,
    tab: activeTab,
    search: searchTerm,
    status: statusFilter,
    owner: ownerFilter,
    handler: handlerFilter,
    timePeriod: timePeriodFilter,
    movementField: { value: movementFilter, kind: "column", name: "movement_type" },
    typeField: { value: modeFilter, kind: "column", name: "mode" },
  });

  const bookings = useMemo(() => rawPage.map(mapToForwardingBooking), [rawPage]);
  const pagedBookings = bookings;
  const fetchBookings = () => { queryClient.invalidateQueries({ queryKey: ["bookings"] }); };

  useRealtimeSync({ table: "bookings", queryKey: ["bookings"] });

  const { data: tabCounts } = useBookingTabCounts({
    serviceType: "Forwarding", scope, assignmentIndex, currentUserName: currentUser?.name, enabled: dataReady,
  });
  const { data: bookingOptions } = useBookingFilterOptions({
    serviceType: "Forwarding", typeField: { kind: "column", name: "mode" }, enabled: dataReady,
  });

  // Keep the open detail in sync with the latest bookings data after a refetch
  useEffect(() => {
    if (selectedBooking && bookings.length > 0) {
      const updated = bookings.find(b => b.bookingId === selectedBooking.bookingId);
      if (updated && updated !== selectedBooking) {
        setSelectedBooking(updated);
      }
    }
  }, [bookings]);

  // Deep-link: auto-select booking from URL param or pendingBookingId.
  // suppressUrlSelectionRef prevents the just-cleared id from re-opening the
  // detail right after the user clicks "Back" (the bounce-back bug).
  const effectiveBookingId = urlBookingId ?? pendingBookingId;
  useEffect(() => {
    if (suppressUrlSelectionRef.current) {
      if (!effectiveBookingId) suppressUrlSelectionRef.current = false;
      return;
    }
    if (!effectiveBookingId || selectedBooking || isLoading) return;
    const match = bookings.find(b => b.bookingId === effectiveBookingId || b.id === effectiveBookingId);
    if (match) {
      setSelectedBooking(match);
      setUrlBookingId(match.bookingId);
      onSelectBooking?.(match);
    }
  }, [effectiveBookingId, bookings, isLoading, selectedBooking]);

  const handleBookingCreated = () => {
    setShowCreateModal(false);
    fetchBookings();
  };

  // Filter dropdown options + tab counts come from dedicated scoped queries
  const uniqueOwners = bookingOptions?.owners ?? [];
  const uniqueHandlers = bookingOptions?.handlers ?? [];
  const uniqueModes = bookingOptions?.types ?? [];

  const unreadBookingIds = useUnreadEntityIds(
    "booking",
    pagedBookings.map((b) => b.bookingId),
  );

  const allCount = tabCounts?.all ?? 0;
  const myCount = tabCounts?.my ?? 0;
  const draftCount = tabCounts?.draft ?? 0;
  const inProgressCount = tabCounts?.inProgress ?? 0;
  const completedCount = tabCounts?.completed ?? 0;
  const cancelledCount = tabCounts?.cancelled ?? 0;

  if (selectedBooking) {
    return (
      <ForwardingBookingDetails
        booking={selectedBooking}
        onBack={() => {
          suppressUrlSelectionRef.current = true;
          setUrlBookingId(null);
          setSelectedBooking(null);
        }}
        onBookingUpdated={fetchBookings}
        currentUser={currentUser}
        initialTab={initialTab}
        highlightId={highlightId}
      />
    );
  }

  return (
    <>
      <div style={{ minHeight: "100vh", background: "var(--theme-bg-surface)" }}>
        {/* Header */}
        <div style={{ padding: "32px 48px 24px 48px" }}>
          <div style={{ 
            display: "flex", 
            alignItems: "start", 
            justifyContent: "space-between", 
            marginBottom: "24px" 
          }}>
            <div>
              <h1 style={{ 
                fontSize: "32px", 
                fontWeight: 600, 
                color: "var(--theme-text-primary)", 
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}>
                Forwarding
              </h1>
              <p style={{ 
                fontSize: "14px", 
                color: "var(--theme-text-muted)"
              }}>
                Manage freight forwarding operations and shipments
              </p>
            </div>
            
            {/* Action Button */}
            <div className="flex items-center gap-3">
              {can("ops_forwarding", "create") && <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "8px",
                  background: "var(--theme-action-primary-bg)",
                  color: "var(--theme-action-primary-text)",
                  cursor: "pointer",
                }}
              >
                <Plus size={16} />
                New Booking
              </button>}
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ position: "relative", marginBottom: "24px" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--theme-text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search by Booking Number, Customer, or Project Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            />
          </div>

          {/* Filter Row */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", 
            gap: "12px",
            marginBottom: "24px"
          }}>
            {/* Time Period Filter */}
            <select
              value={timePeriodFilter}
              onChange={(e) => setTimePeriodFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExecutionStatus | "all")}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Statuses</option>
              {getStatusOptions("Forwarding").map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>

            {/* Movement Filter */}
            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Movements</option>
              <option value="IMPORT">Import</option>
              <option value="EXPORT">Export</option>
            </select>

            {/* Account Owner Filter */}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Owners</option>
              {uniqueOwners.map(owner => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>

            {/* Handler Filter */}
            <select
              value={handlerFilter}
              onChange={(e) => setHandlerFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Handlers</option>
              <option value="unassigned">Unassigned</option>
              {uniqueHandlers.map(handler => (
                <option key={handler} value={handler}>{handler}</option>
              ))}
            </select>

            {/* Mode Filter */}
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Modes</option>
              {uniqueModes.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex",
            gap: "8px",
            borderBottom: "1px solid var(--theme-border-default)",
            marginBottom: "24px"
          }}>
            {canViewAllTab && (
              <TabButton
                icon={<Briefcase size={18} />}
                label="All Bookings"
                count={allCount}
                isActive={activeTab === "all"}
                color="var(--theme-action-primary-bg)"
                onClick={() => setActiveTab("all")}
              />
            )}
            {canViewMyTab && (
              <TabButton
                icon={<UserCheck size={18} />}
                label="Assigned to Me"
                count={myCount}
                isActive={activeTab === "my"}
                color="var(--neuron-status-accent-fg)"
                onClick={() => setActiveTab("my")}
              />
            )}
            {canViewDraftTab && (
              <TabButton
                icon={<FileEdit size={18} />}
                label="Draft"
                count={draftCount}
                isActive={activeTab === "draft"}
                color="var(--theme-text-muted)"
                onClick={() => setActiveTab("draft")}
              />
            )}
            {canViewInProgressTab && (
              <TabButton
                icon={<Clock size={18} />}
                label="In Progress"
                count={inProgressCount}
                isActive={activeTab === "in-progress"}
                color="var(--theme-action-primary-bg)"
                onClick={() => setActiveTab("in-progress")}
              />
            )}
            {canViewCompletedTab && (
              <TabButton
                icon={<CheckCircle size={18} />}
                label="Completed"
                count={completedCount}
                isActive={activeTab === "completed"}
                color="var(--theme-status-success-fg)"
                onClick={() => setActiveTab("completed")}
              />
            )}
            {canViewCancelledTab && (
              <TabButton
                icon={<Archive size={18} />}
                label="Archived"
                count={cancelledCount}
                isActive={activeTab === "cancelled"}
                color="var(--theme-text-muted)"
                onClick={() => setActiveTab("cancelled")}
              />
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ padding: "0 48px 48px 48px" }}>
          {isLoading ? (
            <div className="mt-2">
              <SkeletonTable rows={10} cols={6} />
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="text-[var(--theme-text-primary)]/60 mb-2">
                {searchTerm || statusFilter !== "all" 
                  ? "No bookings match your filters" 
                  : "No forwarding bookings yet"}
              </div>
              {can("ops_forwarding", "create") && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[var(--theme-action-primary-bg)] hover:underline"
              >
                Create your first booking
              </button>
              )}
            </div>
          ) : (
            <div style={{
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)"
            }}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--theme-text-primary)]/10">
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Booking Details
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Route
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Movement
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Mode
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Team
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Handler
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBookings.map((booking, index) => (
                    <tr
                      key={`${booking.bookingId}-${index}`}
                      className="border-b border-[var(--theme-text-primary)]/5 hover:bg-[var(--theme-action-primary-bg)]/5 transition-colors cursor-pointer"
                      onClick={() => {
                        if (booking.status === "Draft") {
                          // WG-09: resuming a draft re-opens the create panel in
                          // edit mode (updates the row) — needs a write grant
                          if (can("ops_forwarding", "create") || can("ops_forwarding", "edit")) {
                            setResumeDraft({ ...(booking as any), id: booking.bookingId });
                          }
                        } else {
                          suppressUrlSelectionRef.current = false;
                          setSelectedBooking(booking);
                          setUrlBookingId(booking.bookingId);
                          onSelectBooking?.(booking);
                        }
                      }}
                    >
                      <td className="py-4 px-4">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {unreadBookingIds.has(booking.bookingId) && (
                            <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "var(--theme-status-danger-fg)", flexShrink: 0 }} />
                          )}
                          <Package size={20} color="var(--theme-action-primary-bg)" style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "var(--theme-text-primary)",
                              marginBottom: "2px"
                            }}>
                              {(booking as any).name || (booking as any).booking_number || "Unnamed Booking"}
                            </div>
                            {(booking as any).name && (booking as any).booking_number && (
                              <div style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                                {(booking as any).booking_number}
                              </div>
                            )}
                            {booking.projectNumber && (
                              <div style={{
                                fontSize: "13px",
                                color: "var(--theme-text-muted)"
                              }}>
                                Project: {booking.projectNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "14px", color: "var(--theme-text-primary)" }}>
                          {booking.customerName}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>
                          {booking.portOfLoading && booking.portOfDischarge ? (
                            <>
                              <div>{booking.portOfLoading}</div>
                              <div style={{ color: "var(--theme-text-muted)" }}>→ {booking.portOfDischarge}</div>
                            </>
                          ) : (
                            <span style={{ color: "var(--theme-text-muted)" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: booking.movement === "EXPORT" ? "var(--theme-status-warning-bg)" : "var(--theme-status-success-bg)",
                          color: booking.movement === "EXPORT" ? "var(--theme-status-warning-fg)" : "var(--theme-action-primary-bg)",
                        }}>
                          {booking.movement || "IMPORT"}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ 
                          fontSize: "13px", 
                          fontWeight: 500,
                          color: "var(--theme-text-primary)" 
                        }}>
                          {booking.mode || "—"}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>
                          {booking.assigned_handler_name ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{booking.assigned_handler_name}</div>
                              <div style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>Handler</div>
                            </div>
                          ) : (
                            <span style={{ color: "var(--theme-text-muted)" }}>Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {booking.accountHandler ? (
                          <div style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>
                            {booking.accountHandler}
                          </div>
                        ) : (
                          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <NeuronStatusPill status={booking.status} />
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                isFetching={isFetching}
              />
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateForwardingBookingPanel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onBookingCreated={handleBookingCreated}
          currentUser={currentUser}
        />
      )}
      {resumeDraft && (
        <CreateForwardingBookingPanel
          isOpen={!!resumeDraft}
          onClose={() => setResumeDraft(null)}
          onBookingCreated={() => {
            setResumeDraft(null);
            fetchBookings();
          }}
          currentUser={currentUser}
          draftBookingId={String(resumeDraft.id)}
          draftData={resumeDraft}
        />
      )}
    </>
  );
}

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  isActive: boolean;
  color: string;
  onClick: () => void;
}

function TabButton({ icon, label, count, isActive, color, onClick }: TabButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 20px",
        background: "transparent",
        border: "none",
        borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
        color: isActive ? color : (isHovered ? "var(--theme-text-primary)" : "var(--theme-text-muted)"),
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s ease",
        marginBottom: "-1px"
      }}
    >
      {icon}
      {label}
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "11px",
          fontWeight: 700,
          background: isActive ? color : `${color}15`,
          color: isActive ? "#FFFFFF" : color,
          minWidth: "20px",
          textAlign: "center"
        }}
      >
        {count}</span>
    </button>
  );
}
