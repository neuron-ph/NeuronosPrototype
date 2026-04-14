import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Lock, Clock, ChevronRight, User } from "lucide-react";
import type { ForwardingBooking, ExecutionStatus } from "../../../types/operations";
import { UnifiedBillingsTab } from "../../shared/billings/UnifiedBillingsTab";
import { ExpensesTab } from "../shared/ExpensesTab";
import { BookingCommentsTab } from "../../shared/BookingCommentsTab";
import { useProjectFinancials } from "../../../hooks/useProjectFinancials";
import { StatusSelector } from "../../StatusSelector";

import { EditableMultiInputField } from "../../shared/EditableMultiInputField";
import { EditableSectionCard, useSectionEdit } from "../../shared/EditableSectionCard";
import { EditableField } from "../../shared/EditableField";
import { ConsigneeInfoBadge } from "../../shared/ConsigneeInfoBadge";
import { assessBookingFinancialState, canTransitionBookingToCancelled, getBookingCancellationStatusMessage } from "../../../utils/bookingCancellation";
import { BookingCancelDeletePanel } from "../shared/BookingCancelDeletePanel";
import { RequestBillingButton } from "../../common/RequestBillingButton";
import { loadBookingActivityLog, appendBookingActivity } from "../../../utils/bookingActivityLog";
import { BookingTeamSection } from "../shared/BookingTeamSection";
import { useUser } from "../../../hooks/useUser";
import { fireBillingTicketOnCompletion } from "../../../utils/workflowTickets";
import { logStatusChange } from "../../../utils/activityLog";

interface ForwardingBookingDetailsProps {
  booking: ForwardingBooking;
  onBack: () => void;
  onBookingUpdated: () => void;
  currentUser?: { name: string; email: string; department: string } | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

type DetailTab = "booking-info" | "billings" | "expenses" | "comments";

const STATUS_COLORS: Record<ExecutionStatus, string> = {
  "Draft": "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)] border-[var(--theme-border-default)]",
  "Confirmed": "bg-blue-50 text-blue-700 border-blue-300",
  "In Progress": "bg-[var(--theme-action-primary-bg)]/10 text-[var(--theme-action-primary-bg)] border-[var(--theme-action-primary-bg)]/30",
  "Pending": "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)] border-amber-300",
  "On Hold": "bg-orange-50 text-orange-700 border-orange-300",
  "Delivered": "bg-indigo-50 text-indigo-700 border-indigo-300",
  "Completed": "bg-emerald-50 text-emerald-700 border-emerald-300",
  "Cancelled": "bg-[var(--theme-status-danger-bg)] text-red-700 border-red-300",
  "Closed": "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] border-[var(--theme-border-default)]",
};

// Activity Timeline Data Structure
interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: "field_updated" | "status_changed" | "created" | "note_added";
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  statusFrom?: ExecutionStatus;
  statusTo?: ExecutionStatus;
  note?: string;
}

// Initial mock activity data - starting point
const initialActivityLog: ActivityLogEntry[] = [
  {
    id: "init-1",
    timestamp: new Date("2024-12-22T16:45:00"),
    user: "System",
    action: "created"
  },
];

// Field locking rules based on status
// NOTE: All fields are now editable regardless of status since changes are tracked in activity log
function isFieldLocked(fieldName: string, status: ExecutionStatus): { locked: boolean; reason: string } {
  // All fields are editable - changes will be tracked in the activity log
  return { locked: false, reason: "" };
}

export function ForwardingBookingDetails({
  booking,
  onBack,
  onBookingUpdated,
  currentUser,
  initialTab,
  highlightId
}: ForwardingBookingDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(
    (initialTab as DetailTab) || "booking-info"
  );
  const [showTimeline, setShowTimeline] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog);
  const { user } = useUser();

  const { data: fetchedActivityLog } = useQuery({
    queryKey: ["forwarding_booking_activity", booking.bookingId],
    queryFn: async () => {
      const entries = await loadBookingActivityLog(booking.bookingId);
      return entries as ActivityLogEntry[];
    },
    enabled: !!booking.bookingId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (fetchedActivityLog && fetchedActivityLog.length > 0) {
      setActivityLog(fetchedActivityLog);
    }
  }, [fetchedActivityLog]);

  // Local state to track edited booking values
  const [editedBooking, setEditedBooking] = useState<ForwardingBooking>(booking);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCancelDeletePanel, setShowCancelDeletePanel] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  // Function to add new activity
  const addActivity = (
    fieldName: string,
    oldValue: string,
    newValue: string
  ) => {
    const newActivity: ActivityLogEntry = {
      id: `activity-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      user: currentUser?.name || "Current User",
      action: "field_updated",
      fieldName,
      oldValue,
      newValue
    };

    setActivityLog(prev => [newActivity, ...prev]);
    appendBookingActivity(booking.bookingId, { action: "field_updated", fieldName, oldValue, newValue, user: currentUser?.name || "Current User" }, { name: currentUser?.name || "Current User", department: currentUser?.department || "Operations" });
  };

  const handleStatusUpdate = async (newStatus: ExecutionStatus) => {
    const oldStatus = editedBooking.status;
    if (oldStatus === newStatus) return;

    if (newStatus === "Cancelled") {
      const financialState = await assessBookingFinancialState(booking.bookingId);
      if (!canTransitionBookingToCancelled(oldStatus, financialState)) {
        toast.error(getBookingCancellationStatusMessage(oldStatus, financialState));
        return;
      }
    }

    // Optimistic Update
    setEditedBooking(prev => ({
      ...prev,
      status: newStatus
    }));

    // Add activity log
    const newActivity: ActivityLogEntry = {
      id: `activity-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      user: currentUser?.name || "Current User",
      action: "status_changed",
      statusFrom: oldStatus,
      statusTo: newStatus
    };
    setActivityLog(prev => [newActivity, ...prev]);
    appendBookingActivity(booking.bookingId, { action: "status_changed", statusFrom: oldStatus, statusTo: newStatus, user: currentUser?.name || "Current User" }, { name: currentUser?.name || "Current User", department: currentUser?.department || "Operations" });

    // Persist to backend
    try {
      const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', booking.id || booking.bookingId);
      if (error) throw error;
      logStatusChange("booking", booking.id || booking.bookingId, (booking as any).booking_number ?? booking.bookingId, oldStatus, newStatus, { id: user?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      toast.success(`Status updated to ${newStatus}`);
      onBookingUpdated();
      if (newStatus === "Completed" && user?.id) {
        fireBillingTicketOnCompletion({
          bookingId: booking.id || booking.bookingId,
          bookingNumber: (booking as any).booking_number || booking.bookingId,
          userId: user.id,
          userName: currentUser?.name || user.name || "Operations",
          userDept: currentUser?.department || user.department || "Operations",
        });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
      // Revert optimistic update
      setEditedBooking(prev => ({ ...prev, status: oldStatus }));
    }
  };

  const financials = useProjectFinancials(booking.projectNumber || "", [{ bookingId: booking.bookingId }]);
  const bookingBillingItems = financials.billingItems.filter(item => item.booking_id === booking.bookingId);
  const [pendingBillableCount, setPendingBillableCount] = useState(0);

  return (
    <div style={{ 
      backgroundColor: "var(--theme-bg-surface)",
      display: "flex",
      flexDirection: "column",
      height: "100vh"
    }}>
      {/* Header Bar */}
      <div style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "none",
              border: "none",
              color: "var(--neuron-ink-secondary)",
              cursor: "pointer",
              fontSize: "13px",
              marginBottom: "12px",
              padding: "0"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--neuron-brand-green)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--neuron-ink-secondary)";
            }}
          >
            <ArrowLeft size={16} />
            Back to Forwarding Bookings
          </button>
          
          <h1 style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            marginBottom: "4px"
          }}>
            {(booking as any).name || booking.customerName}
          </h1>
          {(booking as any).name && (
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", marginBottom: "2px", fontWeight: 500 }}>
              {booking.customerName}
            </p>
          )}
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>
            {(booking as any).booking_number || booking.bookingId}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Request Billing — visible when Completed, or Cancelled with unbilled items */}
          {(editedBooking.status === "Completed" || (editedBooking.status === "Cancelled" && bookingBillingItems.some(item => item.status === "unbilled"))) && (
            <RequestBillingButton
              bookingId={booking.bookingId}
              bookingNumber={(booking as any).booking_number || booking.bookingId}
              currentUser={currentUser}
            />
          )}
          {/* Status Selector - Moved to Header */}
          <StatusSelector
            status={editedBooking.status}
            onUpdateStatus={handleStatusUpdate}
          />
        </div>
      </div>

      {/* Merged Toolbar: Tabs + Actions */}
      <div style={{
        padding: "0 48px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: "56px"
      }}>
        {/* Tabs - Left Side */}
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button
            onClick={() => setActiveTab("booking-info")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "booking-info" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "booking-info" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Booking Information
          </button>
          <button
            onClick={() => setActiveTab("billings")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "billings" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "billings" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Billings
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "expenses" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "expenses" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Expenses
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "comments" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "comments" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Comments
          </button>
        </div>

        {/* Action Buttons - Right Side */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Activity Timeline Button */}
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              backgroundColor: showTimeline ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
              border: `1px solid ${showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`, // Thinner border to match other controls
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              if (!showTimeline) {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
              }
            }}
            onMouseLeave={(e) => {
              if (!showTimeline) {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }
            }}
          >
            <Clock size={16} />
            Activity
          </button>

          {/* Movement Badge */}
          <div style={{
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            backgroundColor: booking.movement === "EXPORT" ? "var(--theme-status-warning-bg)" : "var(--theme-status-success-bg)",
            color: booking.movement === "EXPORT" ? "var(--theme-status-warning-fg)" : "var(--theme-action-primary-bg)",
            border: `1px solid ${booking.movement === "EXPORT" ? "var(--theme-status-warning-border)" : "var(--theme-status-success-border)"}`
          }}>
            {booking.movement || "IMPORT"}
          </div>

          {/* Kebab Menu */}
          <div style={{ position: "relative" }} ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer" }}
            >
              <MoreVertical size={18} />
            </button>
            {showMoreMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", width: "200px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--theme-border-default)", borderRadius: "8px", boxShadow: "var(--elevation-2)", zIndex: 100, overflow: "hidden" }}>
                <button
                  onClick={() => { setShowMoreMenu(false); setShowCancelDeletePanel(true); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Cancel / Delete Booking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <BookingCancelDeletePanel
        isOpen={showCancelDeletePanel}
        onClose={() => setShowCancelDeletePanel(false)}
        bookingId={booking.bookingId}
        bookingLabel={(booking as any).name || (booking as any).booking_number || "Unnamed Booking"}
        currentStatus={editedBooking.status}
        currentUser={currentUser}
        onSuccess={(action) => {
          if (action === "deleted") {
            onBack();
          } else {
            setEditedBooking(prev => ({ ...prev, status: "Cancelled" }));
            onBookingUpdated();
          }
        }}
      />


      {/* Content with Timeline Sidebar */}
      <div style={{
        flex: 1,
        overflow: "hidden",
        display: "flex"
      }}>
        {/* Main Content */}
        <div style={{ 
          flex: showTimeline ? "0 0 65%" : "1",
          overflow: "auto",
          transition: "flex 0.3s ease"
        }}>
          {activeTab === "booking-info" && (
            <BookingInformationTab
              booking={editedBooking}
              onBookingUpdated={onBookingUpdated}
              addActivity={addActivity}
              setEditedBooking={setEditedBooking}
              currentUser={currentUser}
            />
          )}
          {activeTab === "billings" && (
            <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
              <UnifiedBillingsTab
                items={bookingBillingItems}
                projectId={booking.projectNumber || ""}
                bookingId={booking.bookingId}
                onRefresh={financials.refresh}
                isLoading={financials.isLoading}
                pendingBillableCount={pendingBillableCount}
              />
            </div>
          )}
          {activeTab === "expenses" && (
            <ExpensesTab
              bookingId={booking.bookingId}
              bookingNumber={(booking as any).booking_number || booking.bookingId}
              bookingType="forwarding"
              currentUser={currentUser}
              highlightId={activeTab === "expenses" ? highlightId : undefined}
              existingBillingItems={bookingBillingItems}
              onPendingCountChange={setPendingBillableCount}
            />
          )}
          {activeTab === "comments" && (
            <BookingCommentsTab bookingId={booking.bookingId} />
          )}
        </div>

        {/* Timeline Sidebar */}
        {showTimeline && (
          <div style={{
            flex: "0 0 35%",
            borderLeft: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--neuron-pill-inactive-bg)",
            overflow: "auto"
          }}>
            <ActivityTimeline activities={activityLog} />
          </div>
        )}
      </div>
    </div>
  );
}

// Activity Timeline Component
function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  return (
    <div style={{ padding: "24px" }}>
      <h3 style={{
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--neuron-brand-green)",
        marginBottom: "20px"
      }}>
        Activity Timeline
      </h3>

      <div style={{ position: "relative" }}>
        {/* Timeline Line */}
        <div style={{
          position: "absolute",
          left: "15px",
          top: "0",
          bottom: "0",
          width: "2px",
          backgroundColor: "var(--theme-border-default)"
        }} />

        {/* Activity Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activities.map((activity, index) => (
            <div key={activity.id} style={{ position: "relative", paddingLeft: "40px" }}>
              {/* Timeline Dot */}
              <div style={{
                position: "absolute",
                left: "8px",
                top: "4px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: activity.action === "status_changed" ? "var(--theme-action-primary-bg)" :
                               activity.action === "created" ? "var(--theme-text-muted)" :
                               activity.action === "field_updated" ? "var(--neuron-semantic-info)" : "var(--theme-status-warning-fg)",
                border: "3px solid var(--neuron-pill-inactive-bg)"
              }} />

              {/* Activity Content */}
              <div style={{
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                padding: "12px 16px"
              }}>
                {/* Timestamp */}
                <div style={{
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)",
                  marginBottom: "6px"
                }}>
                  {activity.timestamp.toLocaleString()}
                </div>

                {/* Action Description */}
                {activity.action === "field_updated" && (
                  <div>
                    <div style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      marginBottom: "4px"
                    }}>
                      <span style={{ fontWeight: 600 }}>{activity.fieldName}</span> updated
                    </div>
                    {activity.oldValue && activity.newValue && (
                      <div style={{
                        fontSize: "12px",
                        color: "var(--neuron-ink-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "6px"
                      }}>
                        <span style={{
                          padding: "2px 8px",
                          backgroundColor: "var(--theme-status-danger-bg)",
                          borderRadius: "4px",
                          textDecoration: "line-through",
                          color: "var(--theme-status-danger-fg)"
                        }}>
                          {activity.oldValue || "(empty)"}
                        </span>
                        <ChevronRight size={12} />
                        <span style={{
                          padding: "2px 8px",
                          backgroundColor: "var(--theme-status-success-bg)",
                          borderRadius: "4px",
                          color: "var(--theme-status-success-fg)"
                        }}>
                          {activity.newValue}
                        </span>
                      </div>
                    )}
                    {!activity.oldValue && activity.newValue && (
                      <div style={{
                        fontSize: "12px",
                        color: "var(--neuron-ink-secondary)",
                        marginTop: "6px"
                      }}>
                        Set to: <span style={{
                          padding: "2px 8px",
                          backgroundColor: "var(--theme-status-success-bg)",
                          borderRadius: "4px",
                          color: "var(--theme-status-success-fg)",
                          fontWeight: 500
                        }}>
                          {activity.newValue}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {activity.action === "status_changed" && (
                  <div>
                    <div style={{
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      marginBottom: "6px"
                    }}>
                      Status changed
                    </div>
                    <div style={{
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <span style={{
                        padding: "4px 10px",
                        backgroundColor: "var(--theme-bg-surface-subtle)",
                        borderRadius: "4px",
                        color: "var(--theme-text-muted)",
                        fontSize: "11px",
                        fontWeight: 500
                      }}>
                        {activity.statusFrom}
                      </span>
                      <ChevronRight size={12} />
                      <span style={{
                        padding: "4px 10px",
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        borderRadius: "4px",
                        color: "var(--theme-action-primary-bg)",
                        fontSize: "11px",
                        fontWeight: 500
                      }}>
                        {activity.statusTo}
                      </span>
                    </div>
                  </div>
                )}

                {activity.action === "created" && (
                  <div style={{
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)"
                  }}>
                    Booking created
                  </div>
                )}

                {/* User */}
                <div style={{
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)",
                  marginTop: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  <User size={10} />
                  {activity.user}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Reusable Field Components
interface LockedFieldProps {
  label: string;
  value: string;
  tooltip?: string;
}

function LockedField({ label, value, tooltip = "This field is locked because it's inherited from the Project" }: LockedFieldProps) {
  return (
    <div>
      <label style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--neuron-ink-base)",
        marginBottom: "8px"
      }}>
        {label}
        <Lock size={12} color="var(--theme-text-muted)" style={{ cursor: "help" }} />
      </label>
      <div style={{
        padding: "10px 14px",
        backgroundColor: "var(--theme-bg-page)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "6px",
        fontSize: "14px",
        color: "var(--theme-text-muted)",
        cursor: "not-allowed"
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ── Field label mapping for activity log ──
const FIELD_LABELS: Record<string, string> = {
  accountHandler: "Account Handler",
  typeOfEntry: "Type of Entry",
  cargoType: "Cargo Type",
  deliveryAddress: "Delivery Address",
  consignee: "Consignee",
  shipper: "Shipper",
  mblMawb: "MBL/MAWB",
  hblHawb: "HBL/HAWB",
  bookingReferenceNumber: "Booking Reference No.",
  registryNumber: "Registry Number",
  carrier: "Carrier",
  forwarder: "Forwarder",
  countryOfOrigin: "Country of Origin",
  aolPol: "AOL/POL",
  aodPod: "AOD/POD",
  eta: "ETA",
  lct: "LCT",
  transitTime: "Transit Time",
  route: "Route",
  grossWeight: "Gross Weight",
  dimensions: "Dimensions",
  commodityDescription: "Commodity Description",
  preferentialTreatment: "Preferential Treatment",
  warehouseLocation: "Warehouse Location",
  containerNumbers: "Container Numbers",
  detDemValidity: "Det/Dem Validity",
  storageValidity: "Storage Validity",
  croAvailability: "CRO Availability",
  containerDeposit: "Container Deposit",
  emptyReturn: "Empty Return",
  tareWeight: "Tare Weight",
  vgm: "VGM",
  truckingName: "Trucking Name",
  plateNumber: "Plate Number",
  pickupLocation: "Pickup Location",
  warehouseAddress: "Warehouse Address",
  assigned_manager_name: "Assigned Manager",
  assigned_supervisor_name: "Assigned Supervisor",
  assigned_handler_name: "Assigned Handler",
};

/**
 * Diffs a draft against the original booking for the given fields,
 * logs activity for each changed field, and merges updates into editedBooking.
 */
async function diffAndApply(
  original: ForwardingBooking,
  draft: ForwardingBooking,
  fields: string[],
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void,
  setEditedBooking: (fn: (prev: ForwardingBooking) => ForwardingBooking) => void,
  onBookingUpdated: () => void,
) {
  const updates: Record<string, any> = {};
  fields.forEach((field) => {
    const oldVal = String((original as any)[field] ?? "");
    const newVal = String((draft as any)[field] ?? "");
    if (oldVal !== newVal) {
      addActivity(FIELD_LABELS[field] || field, oldVal, newVal);
      updates[field] = (draft as any)[field];
    }
  });
  if (Object.keys(updates).length > 0) {
    const existingDetails = (original as any).details || {};
    const { error } = await supabase
      .from('bookings')
      .update({ details: { ...existingDetails, ...updates } })
      .eq('id', (original as any).id || original.bookingId);
    if (error) {
      toast.error("Failed to save changes");
      return;
    }
    setEditedBooking((prev: ForwardingBooking) => ({ ...prev, ...updates }));
    onBookingUpdated();
    toast.success("Changes saved");
  }
}

// Booking Information Tab Component
function BookingInformationTab({
  booking,
  onBookingUpdated,
  addActivity,
  setEditedBooking,
  currentUser,
}: {
  booking: ForwardingBooking;
  onBookingUpdated: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void;
  setEditedBooking: (fn: any) => void;
  currentUser?: { name: string; email: string; department: string } | null;
}) {
  // Per-section edit state via shared hook
  const generalSection = useSectionEdit(booking);
  const shipmentSection = useSectionEdit(booking);
  const containerSection = useSectionEdit(booking);
  const warehouseSection = useSectionEdit(booking);

  // Field lists per section (for diff on save)
  const GENERAL_FIELDS = ["accountHandler", "typeOfEntry", "cargoType", "deliveryAddress"];
  const SHIPMENT_FIELDS = [
    "consignee", "shipper", "mblMawb", "hblHawb", "bookingReferenceNumber",
    "registryNumber", "carrier", "forwarder", "countryOfOrigin",
    "aolPol", "aodPod", "eta", "lct", "transitTime", "route",
    "grossWeight", "dimensions", "commodityDescription", "preferentialTreatment",
  ];
  const CONTAINER_FIELDS = [
    "containerNumbers", "detDemValidity", "storageValidity", "croAvailability",
    "containerDeposit", "emptyReturn", "tareWeight", "vgm",
    "truckingName", "plateNumber", "pickupLocation", "warehouseAddress",
  ];
  const WAREHOUSE_FIELDS = ["warehouseLocation"];
  
  const gMode = generalSection.isEditing ? "edit" : "view";
  const sMode = shipmentSection.isEditing ? "edit" : "view";
  const cMode = containerSection.isEditing ? "edit" : "view";
  const wMode = warehouseSection.isEditing ? "edit" : "view";

  return (
    <div style={{
      padding: "32px 48px",
      maxWidth: "1400px",
      margin: "0 auto"
    }}>

      {/* ── Team Assignment ── */}
      <BookingTeamSection
        bookingId={(booking as any).id || booking.bookingId}
        bookingNumber={(booking as any).booking_number || booking.bookingId}
        serviceType="Forwarding"
        customerName={booking.customerName}
        customerId={(booking as any).customer_id}
        teamId={(booking as any).team_id}
        teamName={(booking as any).team_name}
        managerId={(booking as any).manager_id}
        managerName={(booking as any).manager_name}
        supervisorId={(booking as any).supervisor_id}
        supervisorName={(booking as any).supervisor_name}
        handlerId={(booking as any).handler_id}
        handlerName={(booking as any).handler_name}
        currentUser={currentUser}
        onUpdate={onBookingUpdated}
        addActivity={addActivity}
      />

      {/* ── General Information ── */}
      <EditableSectionCard
        title="General Information"
        subtitle={`Last updated by ${booking.accountHandler || "System"}, ${new Date(booking.updatedAt).toLocaleString()}`}
        isEditing={generalSection.isEditing}
        onEdit={generalSection.startEditing}
        onCancel={generalSection.cancel}
        onSave={() => {
          const draft = generalSection.save();
          diffAndApply(booking, draft, GENERAL_FIELDS, addActivity, setEditedBooking, onBookingUpdated);
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Customer Name, Account Owner (always locked) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <LockedField label="Customer Name" value={booking.customerName} />
            <LockedField label="Account Owner" value={booking.accountOwner || ""} />
          </div>

          {/* Row 2: Account Handler, Mode, Type of Entry */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField
              label="Account Handler"
              value={generalSection.draft.accountHandler || ""}
              mode={gMode}
              placeholder="Assign handler..."
              onChange={(v) => generalSection.updateField("accountHandler", v)}
            />
            <LockedField label="Mode" value={booking.mode} />
            <EditableField
              label="Type of Entry"
              value={generalSection.draft.typeOfEntry || ""}
              mode={gMode}
              placeholder="Enter type..."
              onChange={(v) => generalSection.updateField("typeOfEntry", v)}
            />
          </div>

          {/* Row 3: Cargo Type, Quotation Reference, Project Number */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField
              label="Cargo Type"
              value={generalSection.draft.cargoType || ""}
              mode={gMode}
              placeholder="Enter cargo type..."
              onChange={(v) => generalSection.updateField("cargoType", v)}
            />
            <LockedField label="Quotation Reference" value={booking.quotationReferenceNumber || ""} />
            {booking.projectNumber && (
              <LockedField label="Project Number" value={booking.projectNumber} />
            )}
          </div>

          {/* Row 4: Delivery Address */}
          <EditableField
            label="Delivery Address"
            value={generalSection.draft.deliveryAddress || ""}
            mode={gMode}
            type="textarea"
            placeholder="Enter delivery address..."
            onChange={(v) => generalSection.updateField("deliveryAddress", v)}
          />
        </div>

        {/* Status-dependent fields (always visible, not editable via section) */}
        {booking.status === "Pending" && booking.pendingReason && (
          <div style={{ marginTop: "20px", padding: "16px", backgroundColor: "var(--theme-status-warning-bg)", border: "1px solid var(--theme-status-warning-border)", borderRadius: "8px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--theme-status-warning-fg)", marginBottom: "8px" }}>
              Pending Reason
            </label>
            <p style={{ fontSize: "14px", color: "var(--theme-status-warning-fg)", margin: 0 }}>{booking.pendingReason}</p>
          </div>
        )}
        {booking.status === "Cancelled" && (
          <div style={{ marginTop: "20px", padding: "16px", backgroundColor: "var(--theme-status-danger-bg)", border: "1px solid var(--theme-status-danger-border)", borderRadius: "8px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--theme-status-danger-fg)", marginBottom: "8px" }}>
              Cancellation Reason
            </label>
            <p style={{ fontSize: "14px", color: "var(--theme-status-danger-fg)", margin: "0 0 12px" }}>{booking.cancellationReason}</p>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--theme-status-danger-fg)", marginBottom: "8px" }}>
              Cancelled Date
            </label>
            <p style={{ fontSize: "14px", color: "var(--theme-status-danger-fg)", margin: 0 }}>
              {booking.cancelledDate ? new Date(booking.cancelledDate).toLocaleDateString() : "—"}
            </p>
          </div>
        )}
      </EditableSectionCard>

      {/* ── Shipment Information ── */}
      <EditableSectionCard
        title="Shipment Information"
        isEditing={shipmentSection.isEditing}
        onEdit={shipmentSection.startEditing}
        onCancel={shipmentSection.cancel}
        onSave={() => {
          const draft = shipmentSection.save();
          diffAndApply(booking, draft, SHIPMENT_FIELDS, addActivity, setEditedBooking, onBookingUpdated);
        }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Consignee, Shipper */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <EditableField
                label="Consignee"
                value={shipmentSection.draft.consignee || ""}
                mode={sMode}
                placeholder="Enter consignee..."
                required
                onChange={(v) => shipmentSection.updateField("consignee", v)}
              />
              {!shipmentSection.isEditing && <ConsigneeInfoBadge consigneeId={(booking as any).consignee_id} />}
            </div>
            <EditableField
              label="Shipper"
              value={shipmentSection.draft.shipper || ""}
              mode={sMode}
              placeholder="Enter shipper..."
              required
              onChange={(v) => shipmentSection.updateField("shipper", v)}
            />
          </div>

          {/* Row 2: MBL/MAWB or Booking Ref, HBL/HAWB, Registry */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            {booking.movement === "EXPORT" ? (
              <EditableMultiInputField
                fieldName="bookingReferenceNumber"
                label="Booking Reference No."
                value={shipmentSection.draft.bookingReferenceNumber || ""}
                status={booking.status}
                placeholder="Enter booking ref..."
                addButtonText="Add Reference No."
                mode={sMode}
                onChange={(v) => shipmentSection.updateField("bookingReferenceNumber", v)}
              />
            ) : (
              <EditableMultiInputField
                fieldName="mblMawb"
                label="MBL/MAWB"
                value={shipmentSection.draft.mblMawb || ""}
                status={booking.status}
                placeholder="Enter MBL/MAWB..."
                addButtonText="Add MBL/MAWB"
                mode={sMode}
                onChange={(v) => shipmentSection.updateField("mblMawb", v)}
              />
            )}
            <EditableMultiInputField
              fieldName="hblHawb"
              label={booking.movement === "EXPORT" ? "House Bill of Lading" : "HBL/HAWB"}
              value={shipmentSection.draft.hblHawb || ""}
              status={booking.status}
              placeholder="Enter HBL/HAWB..."
              addButtonText="Add HBL/HAWB"
              mode={sMode}
              onChange={(v) => shipmentSection.updateField("hblHawb", v)}
            />
            <EditableMultiInputField
              fieldName="registryNumber"
              label="Registry Number"
              value={shipmentSection.draft.registryNumber || ""}
              status={booking.status}
              placeholder="Enter registry number..."
              addButtonText="Add Registry"
              mode={sMode}
              onChange={(v) => shipmentSection.updateField("registryNumber", v)}
            />
          </div>

          {/* Row 3: Carrier, Forwarder, Country of Origin */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField
              label="Carrier"
              value={shipmentSection.draft.carrier || ""}
              mode={sMode}
              placeholder="Enter carrier..."
              onChange={(v) => shipmentSection.updateField("carrier", v)}
            />
            <EditableField
              label="Forwarder"
              value={shipmentSection.draft.forwarder || ""}
              mode={sMode}
              placeholder="Enter forwarder..."
              onChange={(v) => shipmentSection.updateField("forwarder", v)}
            />
            <EditableField
              label="Country of Origin"
              value={shipmentSection.draft.countryOfOrigin || ""}
              mode={sMode}
              placeholder="Enter country..."
              onChange={(v) => shipmentSection.updateField("countryOfOrigin", v)}
            />
          </div>

          {/* Row 4: AOL/POL, AOD/POD, ETA */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField
              label="AOL/POL"
              value={shipmentSection.draft.aolPol || ""}
              mode={sMode}
              placeholder="Enter airport/port of loading..."
              onChange={(v) => shipmentSection.updateField("aolPol", v)}
            />
            <EditableField
              label="AOD/POD"
              value={shipmentSection.draft.aodPod || ""}
              mode={sMode}
              placeholder="Enter airport/port of discharge..."
              onChange={(v) => shipmentSection.updateField("aodPod", v)}
            />
            <EditableField
              label="ETA"
              value={shipmentSection.draft.eta ? new Date(shipmentSection.draft.eta).toISOString().split('T')[0] : ""}
              type="date"
              mode={sMode}
              placeholder="Set ETA..."
              onChange={(v) => shipmentSection.updateField("eta", v)}
            />
          </div>

          {/* Export Specifics: LCT, Transit Time, Route */}
          {booking.movement === "EXPORT" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <EditableField
                label="LCT (Last Cargo Time)"
                value={shipmentSection.draft.lct || ""}
                type="date"
                mode={sMode}
                onChange={(v) => shipmentSection.updateField("lct", v)}
              />
              <EditableField
                label="Transit Time"
                value={shipmentSection.draft.transitTime || ""}
                mode={sMode}
                placeholder="e.g. 15 days"
                onChange={(v) => shipmentSection.updateField("transitTime", v)}
              />
              <EditableField
                label="Route"
                value={shipmentSection.draft.route || ""}
                mode={sMode}
                placeholder="e.g. MNL-SIN-LAX"
                onChange={(v) => shipmentSection.updateField("route", v)}
              />
            </div>
          )}

          {/* Row 5: Gross Weight, Dimensions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField
              label="Gross Weight"
              value={shipmentSection.draft.grossWeight || ""}
              mode={sMode}
              placeholder="Enter weight (e.g., 1000 kg)..."
              onChange={(v) => shipmentSection.updateField("grossWeight", v)}
            />
            <EditableField
              label="Dimensions"
              value={shipmentSection.draft.dimensions || ""}
              mode={sMode}
              placeholder="Enter dimensions (e.g., 120x80x100 cm)..."
              onChange={(v) => shipmentSection.updateField("dimensions", v)}
            />
          </div>

          {/* Row 6: Commodity Description */}
          <EditableField
            label="Commodity Description"
            value={shipmentSection.draft.commodityDescription || ""}
            type="textarea"
            mode={sMode}
            placeholder="Enter detailed commodity description..."
            onChange={(v) => shipmentSection.updateField("commodityDescription", v)}
          />

          {/* Preferential Treatment */}
          <EditableField
            label="Preferential Treatment"
            value={shipmentSection.draft.preferentialTreatment || ""}
            mode={sMode}
            placeholder="Enter preferential treatment details..."
            onChange={(v) => shipmentSection.updateField("preferentialTreatment", v)}
          />
        </div>
      </EditableSectionCard>

      {/* ── Container Details (FCL only) ── */}
      {booking.mode === "FCL" && (
        <EditableSectionCard
          title="Container Details"
          isEditing={containerSection.isEditing}
          onEdit={containerSection.startEditing}
          onCancel={containerSection.cancel}
          onSave={() => {
            const draft = containerSection.save();
            // Special handling: containerNumbers is stored as string[] but displayed as CSV
            const cnOld = booking.containerNumbers?.join(", ") || "";
            const cnNew = draft.containerNumbers
              ? (Array.isArray(draft.containerNumbers)
                  ? draft.containerNumbers.join(", ")
                  : String(draft.containerNumbers))
              : "";
            if (cnOld !== cnNew) {
              addActivity("Container Numbers", cnOld, cnNew);
            }
            // containerDeposit: convert "Yes"/"No" string back to boolean
            const depositVal = (draft as any)._containerDepositStr;
            if (depositVal !== undefined) {
              (draft as any).containerDeposit = depositVal === "Yes";
            }
            // Diff remaining fields normally
            const otherFields = CONTAINER_FIELDS.filter(f => f !== "containerNumbers" && f !== "containerDeposit");
            diffAndApply(booking, draft, otherFields, addActivity, setEditedBooking, onBookingUpdated);
            // Apply container-specific updates
            const updates: any = {};
            if (cnOld !== cnNew) {
              updates.containerNumbers = cnNew.split(",").map((c: string) => c.trim()).filter(Boolean);
            }
            if (depositVal !== undefined && (booking.containerDeposit ? "Yes" : "No") !== depositVal) {
              addActivity("Container Deposit", booking.containerDeposit ? "Yes" : "No", depositVal);
              updates.containerDeposit = depositVal === "Yes";
            }
            if (Object.keys(updates).length > 0) {
              setEditedBooking((prev: any) => ({ ...prev, ...updates }));
              onBookingUpdated();
            }
          }}
        >
          <div style={{ display: "grid", gap: "20px" }}>
            <EditableMultiInputField
              fieldName="containerNumbers"
              label="Container Numbers"
              value={containerSection.draft.containerNumbers && containerSection.draft.containerNumbers.length > 0
                ? containerSection.draft.containerNumbers.join(", ")
                : ""}
              status={booking.status}
              placeholder="Enter container number..."
              addButtonText="Add Container"
              mode={cMode}
              onChange={(v) => containerSection.updateField("containerNumbers", v.split(",").map((c: string) => c.trim()).filter(Boolean) as any)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <EditableField
                label="Det/Dem Validity"
                value={containerSection.draft.detDemValidity || ""}
                type="date"
                mode={cMode}
                placeholder="Select date..."
                onChange={(v) => containerSection.updateField("detDemValidity", v)}
              />
              <EditableField
                label="Storage Validity"
                value={containerSection.draft.storageValidity || ""}
                type="date"
                mode={cMode}
                placeholder="Select date..."
                onChange={(v) => containerSection.updateField("storageValidity", v)}
              />
              <EditableField
                label="CRO Availability"
                value={containerSection.draft.croAvailability || ""}
                type="date"
                mode={cMode}
                placeholder="Select date..."
                onChange={(v) => containerSection.updateField("croAvailability", v)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <EditableField
                label="Container Deposit"
                value={containerSection.draft.containerDeposit ? "Yes" : "No"}
                type="select"
                options={["Yes", "No"]}
                mode={cMode}
                onChange={(v) => {
                  containerSection.updateField("_containerDepositStr" as any, v as any);
                  containerSection.updateField("containerDeposit", (v === "Yes") as any);
                }}
              />
              <EditableField
                label="Empty Return"
                value={containerSection.draft.emptyReturn || ""}
                mode={cMode}
                placeholder="Enter empty return location..."
                onChange={(v) => containerSection.updateField("emptyReturn", v)}
              />
            </div>

            {/* Export FCL Specifics */}
            {booking.movement === "EXPORT" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <EditableField
                    label="Tare Weight"
                    value={containerSection.draft.tareWeight || ""}
                    mode={cMode}
                    placeholder="Enter tare weight..."
                    onChange={(v) => containerSection.updateField("tareWeight", v)}
                  />
                  <EditableField
                    label="VGM"
                    value={containerSection.draft.vgm || ""}
                    mode={cMode}
                    placeholder="Enter VGM..."
                    onChange={(v) => containerSection.updateField("vgm", v)}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
                  <EditableField
                    label="Trucking Name"
                    value={containerSection.draft.truckingName || ""}
                    mode={cMode}
                    placeholder="Enter trucking name..."
                    onChange={(v) => containerSection.updateField("truckingName", v)}
                  />
                  <EditableField
                    label="Plate Number"
                    value={containerSection.draft.plateNumber || ""}
                    mode={cMode}
                    placeholder="Enter plate number..."
                    onChange={(v) => containerSection.updateField("plateNumber", v)}
                  />
                  <EditableField
                    label="Pickup Location"
                    value={containerSection.draft.pickupLocation || ""}
                    mode={cMode}
                    placeholder="Enter pickup location..."
                    onChange={(v) => containerSection.updateField("pickupLocation", v)}
                  />
                </div>

                <EditableField
                  label="Warehouse Address"
                  value={containerSection.draft.warehouseAddress || ""}
                  mode={cMode}
                  placeholder="Enter warehouse address..."
                  onChange={(v) => containerSection.updateField("warehouseAddress", v)}
                />
              </>
            )}
          </div>
        </EditableSectionCard>
      )}

      {/* ── Warehouse Details (LCL/AIR only) ── */}
      {(booking.mode === "LCL" || booking.mode === "AIR") && (
        <EditableSectionCard
          title="Warehouse Details"
          isEditing={warehouseSection.isEditing}
          onEdit={warehouseSection.startEditing}
          onCancel={warehouseSection.cancel}
          onSave={() => {
            const draft = warehouseSection.save();
            diffAndApply(booking, draft, WAREHOUSE_FIELDS, addActivity, setEditedBooking, onBookingUpdated);
          }}
        >
          <EditableField
            label="Warehouse Location"
            value={warehouseSection.draft.warehouseLocation || ""}
            mode={wMode}
            placeholder="Enter warehouse location..."
            onChange={(v) => warehouseSection.updateField("warehouseLocation", v)}
          />
        </EditableSectionCard>
      )}
    </div>
  );
}
