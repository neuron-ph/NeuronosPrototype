import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, Truck, Briefcase, UserCheck, FileEdit, Clock, CheckCircle, Archive } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { CreateTruckingBookingPanel } from "./CreateTruckingBookingPanel";
import { TruckingBookingDetails } from "./TruckingBookingDetails";
import { NeuronStatusPill } from "../NeuronStatusPill";
import { useQueryClient } from "@tanstack/react-query";
import { useDataScope } from "../../hooks/useDataScope";
import { useBookingAssignmentVisibility } from "../../hooks/useBookingAssignmentVisibility";
import { useBookingsPaginated, useBookingTabCounts, useBookingFilterOptions } from "../../hooks/useBookingsPaginated";
import { SkeletonTable } from "../shared/NeuronSkeleton";
import { usePermission } from "../../context/PermissionProvider";
import { normalizeDetails } from "../../utils/bookings/bookingDetailsCompat";
import { getStatusOptions } from "../../config/booking/bookingFieldOptions";
import { useUnreadEntityIds } from "../../hooks/useNotifications";
import { useUrlSelection } from "../../hooks/useUrlSelection";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";
import { TablePagination } from "../shared/TablePagination";

interface TruckingBooking {
  bookingId: string;
  customerName: string;
  movement?: string;
  status: string;
  truckType?: string;       // @deprecated — use trucking_line_items; kept for backward compat list display
  deliveryAddress?: string;  // @deprecated — use trucking_line_items; kept for backward compat list display
  preferredDeliveryDate?: string;
  projectNumber?: string;
  accountOwner?: string;
  accountHandler?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Volume cell for the trucking list: "{qty}X{size} {carrier}" e.g. "1X40 MSC MEDITERRANEAN…".
 * Pulls qty + size from the first trucking line item (falling back to the legacy flat fields)
 * and appends the full shipping-line name — the cell truncates it with an ellipsis.
 */
function formatTruckingVolume(booking: Record<string, any>): string {
  const first = Array.isArray(booking.trucking_line_items) ? booking.trucking_line_items[0] : undefined;
  const qty = String(first?.quantity ?? booking.qty ?? "").trim();
  const rawSize = String(first?.truck_type ?? booking.truck_type ?? "").trim();
  const size = rawSize.replace(/ft$/i, ""); // "40ft" → "40", "4W" stays "4W"
  const carrier = String(booking.shipping_line ?? "").trim();

  const spec = size ? (qty ? `${qty}X${size}` : size) : "";
  return [spec, carrier].filter(Boolean).join(" ");
}

interface TruckingBookingsProps {
  currentUser?: { name: string; email: string; department: string } | null;
  pendingBookingId?: string | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

export function TruckingBookings({ currentUser, pendingBookingId, initialTab, highlightId }: TruckingBookingsProps = {}) {
  const { can } = usePermission();
  const canViewAllTab        = can("ops_trucking_all_tab", "view");
  const canViewMyTab         = can("ops_trucking_my_tab", "view");
  const canViewDraftTab      = can("ops_trucking_draft_tab", "view");
  const canViewInProgressTab = can("ops_trucking_in_progress_tab", "view");
  const canViewCompletedTab  = can("ops_trucking_completed_tab", "view");
  const canViewCancelledTab  = can("ops_trucking_cancelled_tab", "view");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  const [truckTypeFilter, setTruckTypeFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<TruckingBooking | null>(null);
  const [urlBookingId, setUrlBookingId] = useUrlSelection("booking");
  const suppressUrlSelectionRef = useRef(false);
  const [resumeDraft, setResumeDraft] = useState<Record<string, unknown> | null>(null);

  const { scope, isLoaded: scopeLoaded } = useDataScope('bookings_trucking');
  const { index: assignmentIndex, isLoaded: assignmentIndexLoaded } = useBookingAssignmentVisibility({
    userIds: scope.type === 'userIds' ? scope.ids : null,
  });

  // ── Bookings fetch (server-side: filters/tab/scope run in the DB) ──────────
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const dataReady = scopeLoaded && assignmentIndexLoaded;

  const filterKey = JSON.stringify({
    activeTab, searchTerm, statusFilter, movementFilter, timePeriodFilter, ownerFilter, handlerFilter, truckTypeFilter,
  });
  useEffect(() => { setPage(0); }, [filterKey]);

  const mapTruckingRow = (row: any): TruckingBooking => {
    const d = normalizeDetails(row.details || {}, "Trucking");
    return {
      ...d,
      ...row,
      bookingId: row.id,
      booking_number: row.booking_number,
      customerName: row.customer_name,
      projectNumber: row.project_id,
      accountOwner: row.manager_name,
      accountHandler: row.handler_name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      truckType: d.truck_type,
      deliveryAddress: d.delivery_address,
      preferredDeliveryDate: d.preferred_delivery_date,
    } as TruckingBooking;
  };

  const {
    rows: rawPage,
    total,
    totalPages,
    pageSize,
    isLoading,
    isFetching,
  } = useBookingsPaginated({
    serviceType: "Trucking",
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
    movementField: { value: movementFilter, kind: "json", name: "movement_type" },
    typeField: { value: truckTypeFilter, kind: "json", name: "truck_type" },
  });

  const bookings = useMemo(() => rawPage.map(mapTruckingRow), [rawPage]);
  const pagedBookings = bookings;
  const fetchBookings = () => { queryClient.invalidateQueries({ queryKey: ["bookings"] }); };

  useRealtimeSync({ table: "bookings", queryKey: ["bookings"] });

  const { data: tabCounts } = useBookingTabCounts({
    serviceType: "Trucking", scope, assignmentIndex, currentUserName: currentUser?.name, enabled: dataReady,
  });
  const { data: bookingOptions } = useBookingFilterOptions({
    serviceType: "Trucking", typeField: { kind: "json", name: "truck_type" }, enabled: dataReady,
  });

  // Deep-link: auto-select booking from URL param or pendingBookingId
  const deepLinkId = urlBookingId ?? pendingBookingId;
  useEffect(() => {
    if (suppressUrlSelectionRef.current) {
      if (!deepLinkId) suppressUrlSelectionRef.current = false;
      return;
    }
    if (!deepLinkId || bookings.length === 0 || isLoading || selectedBooking) return;
    const match = bookings.find(b => b.bookingId === deepLinkId);
    if (match) {
      setSelectedBooking(match);
      setUrlBookingId(match.bookingId);
    }
  }, [deepLinkId, bookings, isLoading, selectedBooking, setUrlBookingId]);

  // Restore from URL on mount when booking isn't in the current list (e.g. page refresh)
  useEffect(() => {
    if (suppressUrlSelectionRef.current) {
      if (!urlBookingId) suppressUrlSelectionRef.current = false;
      return;
    }
    if (!urlBookingId || selectedBooking || isLoading) return;
    // If bookings loaded but no match, fetch directly from DB
    if (bookings.length > 0 && !bookings.find(b => b.bookingId === urlBookingId)) {
      // Booking not in scoped list — clear stale URL param
      setUrlBookingId(null);
      return;
    }
    if (bookings.length === 0 && !isLoading && scopeLoaded && assignmentIndexLoaded) {
      // All data loaded, still no bookings — fetch directly
      (async () => {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', urlBookingId)
          .eq('service_type', 'Trucking')
          .single();
        if (error || !data) {
          setUrlBookingId(null);
          return;
        }
        const d = normalizeDetails(data.details || {}, "Trucking");
        setSelectedBooking({
          ...d,
          ...data,
          bookingId: data.id,
          customerName: data.customer_name,
          projectNumber: data.project_id,
          accountOwner: data.manager_name,
          accountHandler: data.handler_name,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at || data.created_at,
          truckType: d.truck_type,
          deliveryAddress: d.delivery_address,
          preferredDeliveryDate: d.preferred_delivery_date,
        } as TruckingBooking);
      })();
    }
  }, [urlBookingId, selectedBooking, bookings, isLoading, scopeLoaded, assignmentIndexLoaded, setUrlBookingId]);

  const handleBookingCreated = () => {
    setShowCreateModal(false);
    fetchBookings();
  };

  // Filter dropdown options + tab counts come from dedicated scoped queries
  const uniqueOwners = bookingOptions?.owners ?? [];
  const uniqueHandlers = bookingOptions?.handlers ?? [];
  const uniqueTruckTypes = bookingOptions?.types ?? [];

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
      <TruckingBookingDetails
        booking={selectedBooking as any}
        onBack={() => {
          suppressUrlSelectionRef.current = true;
          setUrlBookingId(null);
          setSelectedBooking(null);
        }}
        onUpdate={fetchBookings}
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
                Trucking
              </h1>
              <p style={{ 
                fontSize: "14px", 
                color: "var(--theme-text-muted)"
              }}>
                Manage trucking and inland transportation bookings
              </p>
            </div>
            
            {/* Action Button */}
            <div className="flex items-center gap-3">
              {can("ops_trucking", "create") && <button
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
              placeholder="Search by Booking ID, Customer, Delivery Address, or Project Number..."
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
              onChange={(e) => setStatusFilter(e.target.value)}
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
              {getStatusOptions("Trucking").map((status) => (
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

            {/* Truck Type Filter */}
            <select
              value={truckTypeFilter}
              onChange={(e) => setTruckTypeFilter(e.target.value)}
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
              <option value="all">All Truck Types</option>
              {uniqueTruckTypes.map(type => (
                <option key={type} value={type}>{type}</option>
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
                  : "No trucking bookings yet"}
              </div>
              {can("ops_trucking", "create") && (
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
                      Project No.
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Client Name
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Address
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Container No.
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Volume
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Pullout Name
                    </th>
                    <th className="text-left py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBookings.map((booking) => (
                    <tr
                      key={booking.bookingId}
                      className="border-b border-[var(--theme-text-primary)]/5 hover:bg-[var(--theme-action-primary-bg)]/5 transition-colors cursor-pointer"
                      onClick={() => {
                        if (booking.status === "Draft") {
                          // WG-09: resuming a draft re-opens the create panel in
                          // edit mode (updates the row) — needs a write grant
                          if (can("ops_trucking", "create") || can("ops_trucking", "edit")) {
                            setResumeDraft({ ...(booking as any), id: booking.bookingId });
                          }
                        } else {
                          suppressUrlSelectionRef.current = false;
                          setSelectedBooking(booking);
                          setUrlBookingId(booking.bookingId);
                        }
                      }}
                    >
                      <td className="py-4 px-4">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {unreadBookingIds.has(booking.bookingId) && (
                            <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "var(--theme-status-danger-fg)", flexShrink: 0 }} />
                          )}
                          <Truck size={20} color="var(--theme-action-primary-bg)" style={{ flexShrink: 0 }} />
                          <div style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--theme-text-primary)",
                          }}>
                            {(booking as any).booking_number || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
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
                          {booking.deliveryAddress || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                          {(booking as any).name || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div
                          title={formatTruckingVolume(booking as any) || undefined}
                          style={{
                            fontSize: "13px",
                            color: "var(--theme-text-primary)",
                            maxWidth: "220px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {formatTruckingVolume(booking as any) || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>
                          {(booking as any).pull_out_location || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <NeuronStatusPill status={booking.status} />
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
        <CreateTruckingBookingPanel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onBookingCreated={handleBookingCreated}
          currentUser={currentUser as any}
        />
      )}
      {resumeDraft && (
        <CreateTruckingBookingPanel
          isOpen={!!resumeDraft}
          onClose={() => setResumeDraft(null)}
          onBookingCreated={() => {
            setResumeDraft(null);
            fetchBookings();
          }}
          currentUser={currentUser as any}
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
        {count}
      </span>
    </button>
  );
}
