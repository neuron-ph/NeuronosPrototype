import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Wrench, Briefcase, UserCheck, FileEdit, Clock, CheckCircle, Trash2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { assessBookingFinancialState, canHardDeleteBooking, getBookingCancellationMessage } from "../../utils/bookingCancellation";
import { CreateOthersBookingPanel } from "./CreateOthersBookingPanel";
import { OthersBookingDetails } from "./OthersBookingDetails";
import { NeuronStatusPill } from "../NeuronStatusPill";
import { toast } from "../ui/toast-utils";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { useDataScope } from "../../hooks/useDataScope";
import { SkeletonTable } from "../shared/NeuronSkeleton";
import { usePermission } from "../../context/PermissionProvider";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";
import { logDeletion } from "../../utils/activityLog";
import type { ExecutionStatus } from "../../types/operations";

interface OthersBooking {
  bookingId: string;
  customerName: string;
  movement?: string;
  status: string;
  serviceDescription?: string;
  projectNumber?: string;
  accountOwner?: string;
  accountHandler?: string;
  createdAt: string;
  updatedAt: string;
}

interface OthersBookingsProps {
  currentUser?: { name: string; email: string; department: string } | null;
  pendingBookingId?: string | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

export function OthersBookings({ currentUser, pendingBookingId, initialTab, highlightId }: OthersBookingsProps = {}) {
  const { can } = usePermission();
  const canViewAllTab        = can("ops_others_all_tab", "view");
  const canViewMyTab         = can("ops_others_my_tab", "view");
  const canViewDraftTab      = can("ops_others_draft_tab", "view");
  const canViewInProgressTab = can("ops_others_in_progress_tab", "view");
  const canViewCompletedTab  = can("ops_others_completed_tab", "view");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [movementFilter, setMovementFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "my" | "draft" | "in-progress" | "completed">(() => {
    if (canViewAllTab)        return "all";
    if (canViewMyTab)         return "my";
    if (canViewDraftTab)      return "draft";
    if (canViewInProgressTab) return "in-progress";
    return "completed";
  });
  const [timePeriodFilter, setTimePeriodFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [handlerFilter, setHandlerFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<OthersBooking | null>(null);

  const { scope, isLoaded: scopeLoaded } = useDataScope('bookings');

  // ── Bookings fetch ────────────────────────────────────────
  const { data: rawBookings = [], isLoading, refetch } = useQuery<OthersBooking[]>({
    queryKey: queryKeys.bookings.list("others"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('service_type', 'Others')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => {
        const d = row.details || {};
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
          serviceDescription: d.description || row.notes,
        } as OthersBooking;
      });
    },
    // Inherits 5-minute staleTime from global QueryClient config
  });
  const fetchBookings = () => { refetch(); };

  const bookings = useMemo(() => {
    if (!scopeLoaded) return [];
    if (scope.type === 'all') return rawBookings;
    if (scope.type === 'userIds') return rawBookings.filter(b =>
      scope.ids.includes((b as any).created_by || '') ||
      scope.ids.includes((b as any).manager_id || '') ||
      scope.ids.includes((b as any).supervisor_id || '') ||
      scope.ids.includes((b as any).handler_id || '')
    );
    return rawBookings.filter(b =>
      (b as any).created_by === scope.userId ||
      (b as any).manager_id === scope.userId ||
      (b as any).supervisor_id === scope.userId ||
      (b as any).handler_id === scope.userId
    );
  }, [rawBookings, scope, scopeLoaded]);

  // Deep-link: auto-select booking from pendingBookingId
  useEffect(() => {
    if (!pendingBookingId || bookings.length === 0 || isLoading) return;
    const match = bookings.find(b => b.bookingId === pendingBookingId);
    if (match) {
      setSelectedBooking(match);
    }
  }, [pendingBookingId, bookings, isLoading]);

  const handleBookingCreated = () => {
    setShowCreateModal(false);
    fetchBookings();
  };

  const handleDeleteBooking = async (bookingId: string, bookingLabel: string, currentStatus: ExecutionStatus, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click

    try {
      const financialState = await assessBookingFinancialState(bookingId);
      if (!canHardDeleteBooking(currentStatus, financialState)) {
        toast.error(getBookingCancellationMessage(currentStatus, financialState));
        return;
      }

      if (!window.confirm(`Delete booking ${bookingLabel}? No linked invoices, collections, expenses, or e-vouchers were found.`)) {
        return;
      }

      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (error) throw error;

      logDeletion("booking", bookingId, bookingLabel, { id: "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      toast.success('Booking deleted successfully');
      fetchBookings(); // Refresh list
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Unable to delete booking');
    }
  };

  // Get unique values for filters
  const uniqueOwners = Array.from(new Set(bookings.map(b => b.accountOwner).filter(Boolean)));
  const uniqueHandlers = Array.from(new Set(bookings.map(b => b.accountHandler).filter(Boolean)));

  // Filter bookings by tab first
  const getFilteredByTab = () => {
    let filtered = bookings;

    if (activeTab === "my") {
      filtered = bookings.filter(b => 
        b.accountOwner === currentUser?.name || 
        b.accountHandler === currentUser?.name
      );
    } else if (activeTab === "draft") {
      filtered = bookings.filter(b => b.status === "Draft");
    } else if (activeTab === "in-progress") {
      filtered = bookings.filter(b => b.status === "In Progress");
    } else if (activeTab === "completed") {
      filtered = bookings.filter(b => b.status === "Completed");
    }

    return filtered;
  };

  // Apply all filters
  const filteredBookings = getFilteredByTab().filter(booking => {
    // Search filter
    const matchesSearch =
      ((booking as any).booking_number || booking.bookingId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (booking.serviceDescription && booking.serviceDescription.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (booking.projectNumber && booking.projectNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    // Time period filter
    if (timePeriodFilter !== "all") {
      const bookingDate = new Date(booking.createdAt);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (timePeriodFilter === "7days" && daysDiff > 7) return false;
      if (timePeriodFilter === "30days" && daysDiff > 30) return false;
      if (timePeriodFilter === "90days" && daysDiff > 90) return false;
    }

    // Status filter
    const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
    if (!matchesStatus) return false;

    // Movement filter
    const matchesMovement = movementFilter === "all" || (booking.movement || "IMPORT") === movementFilter;
    if (!matchesMovement) return false;

    // Owner filter
    if (ownerFilter !== "all" && booking.accountOwner !== ownerFilter) return false;

    // Handler filter
    if (handlerFilter === "unassigned" && booking.accountHandler) return false;
    if (handlerFilter !== "all" && handlerFilter !== "unassigned" && booking.accountHandler !== handlerFilter) return false;

    return true;
  });

  // Calculate counts for tabs
  const allCount = bookings.length;
  const myCount = bookings.filter(b => 
    b.accountOwner === currentUser?.name || b.accountHandler === currentUser?.name
  ).length;
  const draftCount = bookings.filter(b => b.status === "Draft").length;
  const inProgressCount = bookings.filter(b => b.status === "In Progress").length;
  const completedCount = bookings.filter(b => b.status === "Completed").length;

  if (selectedBooking) {
    return (
      <OthersBookingDetails
        booking={selectedBooking as any}
        onBack={() => {
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
                Others
              </h1>
              <p style={{ 
                fontSize: "14px", 
                color: "var(--theme-text-muted)"
              }}>
                Manage miscellaneous services and special requests
              </p>
            </div>
            
            {/* Action Button */}
            <div className="flex items-center gap-3">
              <NeuronRefreshButton 
                onRefresh={fetchBookings}
                label="Refresh bookings"
              />
              <button
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
              </button>
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
              placeholder="Search by Booking ID, Customer, Service Description, or Project Number..."
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
              <option value="Draft">Draft</option>
              <option value="Confirmed">Confirmed</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending">Pending</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
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
          </div>
        </div>

        {/* Table */}
        <div style={{ padding: "0 48px 48px 48px" }}>
          {isLoading ? (
            <div className="mt-2">
              <SkeletonTable rows={10} cols={6} />
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="text-[var(--theme-text-primary)]/60 mb-2">
                {searchTerm || statusFilter !== "all" 
                  ? "No bookings match your filters" 
                  : "No other service bookings yet"}
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[var(--theme-action-primary-bg)] hover:underline"
              >
                Create your first booking
              </button>
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
                      Service Description
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
                    <th className="text-center py-3 px-4 text-[var(--theme-text-muted)] font-semibold text-xs uppercase tracking-wide" style={{ width: "80px" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((booking) => (
                    <tr
                      key={booking.bookingId}
                      className="border-b border-[var(--theme-text-primary)]/5 hover:bg-[var(--theme-action-primary-bg)]/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedBooking(booking)}
                    >
                      <td className="py-4 px-4">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <Wrench size={20} color="var(--theme-action-primary-bg)" style={{ flexShrink: 0 }} />
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
                          {booking.serviceDescription || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
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
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={(e) => handleDeleteBooking(booking.bookingId, (booking as any).booking_number || booking.bookingId, booking.status as ExecutionStatus, e)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "1px solid var(--theme-status-danger-border)",
                            borderRadius: "6px",
                            background: "var(--theme-bg-surface)",
                            color: "var(--theme-status-danger-fg)",
                            cursor: "pointer",
                            transition: "all 150ms"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--theme-status-danger-fg)";
                            e.currentTarget.style.color = "var(--theme-text-inverse)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--theme-bg-surface)";
                            e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateOthersBookingPanel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onBookingCreated={handleBookingCreated}
          currentUser={currentUser as any}
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
