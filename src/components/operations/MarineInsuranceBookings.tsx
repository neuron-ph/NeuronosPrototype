import { useState, useEffect } from "react";
import { Plus, Search, Shield, Briefcase, UserCheck, FileEdit, Clock, CheckCircle, Trash2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { assessBookingFinancialState, canHardDeleteBooking, getBookingCancellationMessage } from "../../utils/bookingCancellation";
import { CreateMarineInsuranceBookingPanel } from "./CreateMarineInsuranceBookingPanel";
import { MarineInsuranceBookingDetails } from "./MarineInsuranceBookingDetails";
import { NeuronStatusPill } from "../NeuronStatusPill";
import { toast } from "../ui/toast-utils";
import { useCachedFetch, useInvalidateCache } from "../../hooks/useNeuronCache";
import { SkeletonTable } from "../shared/NeuronSkeleton";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";

interface MarineInsuranceBooking {
  bookingId: string;
  customerName: string;
  status: string;
  coverageType?: string;
  insuredValue?: string;
  vessel?: string;
  voyage?: string;
  projectNumber?: string;
  accountOwner?: string;
  accountHandler?: string;
  createdAt: string;
  updatedAt: string;
}

interface MarineInsuranceBookingsProps {
  currentUser?: { name: string; email: string; department: string } | null;
  pendingBookingId?: string | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

export function MarineInsuranceBookings({ currentUser, pendingBookingId, initialTab, highlightId }: MarineInsuranceBookingsProps = {}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [movementFilter, setMovementFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "my" | "draft" | "in-progress" | "completed">("all");
  const [timePeriodFilter, setTimePeriodFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [coverageTypeFilter, setCoverageTypeFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<MarineInsuranceBooking | null>(null);
  const invalidateCache = useInvalidateCache();

  // ── Cached bookings fetch ─────────────────────────────────
  const bookingsFetcher = async (): Promise<MarineInsuranceBooking[]> => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('service_type', 'Marine Insurance')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => {
      const d = row.details || {};
      return {
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
        coverageType: d.coverage_type,
        insuredValue: d.insured_value ? String(d.insured_value) : undefined,
        vessel: d.vessel,
        voyage: d.voyage,
      } as MarineInsuranceBooking;
    });
  };

  const { data: bookings, isLoading, refresh: fetchBookings } = useCachedFetch<MarineInsuranceBooking[]>(
    "marine-insurance-bookings",
    bookingsFetcher,
    [],
  );

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

  const handleDeleteBooking = async (bookingId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click

    try {
      const financialState = await assessBookingFinancialState(bookingId);
      if (!canHardDeleteBooking(financialState)) {
        toast.error(getBookingCancellationMessage(financialState));
        return;
      }

      if (!window.confirm(`Delete booking ${bookingId}? No linked charges, costs, invoices, or collections were found.`)) {
        return;
      }

      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (error) throw error;

      toast.success('Booking deleted successfully');
      fetchBookings(); // Refresh list
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Unable to delete booking');
    }
  };

  // Get unique values for filters
  const uniqueOwners = Array.from(new Set(bookings.map(b => b.accountOwner).filter(Boolean)));
  const uniqueCoverageTypes = Array.from(new Set(bookings.map(b => b.coverageType).filter(Boolean)));

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
      (booking.vessel && booking.vessel.toLowerCase().includes(searchTerm.toLowerCase())) ||
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

    // Coverage Type filter
    if (coverageTypeFilter !== "all" && booking.coverageType !== coverageTypeFilter) return false;

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
      <MarineInsuranceBookingDetails 
        booking={selectedBooking} 
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
      <div style={{ minHeight: "100vh", background: "#FFFFFF" }}>
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
                color: "#12332B", 
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}>
                Marine Insurance
              </h1>
              <p style={{ 
                fontSize: "14px", 
                color: "#667085"
              }}>
                Manage marine cargo insurance bookings and coverage
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
                  background: "#0F766E",
                  color: "white",
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
                color: "#667085",
              }}
            />
            <input
              type="text"
              placeholder="Search by Booking ID, Customer, Vessel, or Project Number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
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
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
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
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
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
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
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
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Owners</option>
              {uniqueOwners.map(owner => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>

            {/* Coverage Type Filter */}
            <select
              value={coverageTypeFilter}
              onChange={(e) => setCoverageTypeFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "14px",
                color: "#12332B",
                backgroundColor: "#FFFFFF",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Coverage Types</option>
              {uniqueCoverageTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div style={{ 
            display: "flex", 
            gap: "8px", 
            borderBottom: "1px solid #E5E7EB",
            marginBottom: "24px"
          }}>
            <TabButton
              icon={<Briefcase size={18} />}
              label="All Bookings"
              count={allCount}
              isActive={activeTab === "all"}
              color="#0F766E"
              onClick={() => setActiveTab("all")}
            />
            <TabButton
              icon={<UserCheck size={18} />}
              label="Assigned to Me"
              count={myCount}
              isActive={activeTab === "my"}
              color="#8B5CF6"
              onClick={() => setActiveTab("my")}
            />
            <TabButton
              icon={<FileEdit size={18} />}
              label="Draft"
              count={draftCount}
              isActive={activeTab === "draft"}
              color="#6B7280"
              onClick={() => setActiveTab("draft")}
            />
            <TabButton
              icon={<Clock size={18} />}
              label="In Progress"
              count={inProgressCount}
              isActive={activeTab === "in-progress"}
              color="#0F766E"
              onClick={() => setActiveTab("in-progress")}
            />
            <TabButton
              icon={<CheckCircle size={18} />}
              label="Completed"
              count={completedCount}
              isActive={activeTab === "completed"}
              color="#10B981"
              onClick={() => setActiveTab("completed")}
            />
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
              <div className="text-[#12332B]/60 mb-2">
                {searchTerm || statusFilter !== "all" 
                  ? "No bookings match your filters" 
                  : "No marine insurance bookings yet"}
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[#0F766E] hover:underline"
              >
                Create your first booking
              </button>
            </div>
          ) : (
            <div style={{
              border: "1px solid #E5E7EB",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "#FFFFFF"
            }}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#12332B]/10">
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Booking Details
                    </th>
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Vessel
                    </th>
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Coverage Type
                    </th>
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide">
                      Created
                    </th>
                    <th className="text-center py-3 px-4 text-[#667085] font-semibold text-xs uppercase tracking-wide" style={{ width: "80px" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((booking) => (
                    <tr
                      key={booking.bookingId}
                      className="border-b border-[#12332B]/5 hover:bg-[#0F766E]/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedBooking(booking)}
                    >
                      <td className="py-4 px-4">
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <Shield size={20} color="#0F766E" style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{ 
                              fontSize: "14px", 
                              fontWeight: 600, 
                              color: "#12332B",
                              marginBottom: "2px"
                            }}>
                              {(booking as any).booking_number || booking.bookingId}
                            </div>
                            {booking.projectNumber && (
                              <div style={{ 
                                fontSize: "13px", 
                                color: "#667085"
                              }}>
                                Project: {booking.projectNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "14px", color: "#12332B" }}>
                          {booking.customerName}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "#12332B" }}>
                          {booking.vessel || <span style={{ color: "#667085" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ 
                          fontSize: "13px", 
                          fontWeight: 500,
                          color: "#12332B" 
                        }}>
                          {booking.coverageType || "—"}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <NeuronStatusPill status={booking.status} />
                      </td>
                      <td className="py-4 px-4">
                        <div style={{ fontSize: "13px", color: "#667085" }}>
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={(e) => handleDeleteBooking(booking.bookingId, e)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "1px solid #FCA5A5",
                            borderRadius: "6px",
                            background: "white",
                            color: "#DC2626",
                            cursor: "pointer",
                            transition: "all 150ms"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#DC2626";
                            e.currentTarget.style.color = "white";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "white";
                            e.currentTarget.style.color = "#DC2626";
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
        <CreateMarineInsuranceBookingPanel
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onBookingCreated={handleBookingCreated}
          currentUser={currentUser}
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
        color: isActive ? color : (isHovered ? "#12332B" : "#667085"),
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
