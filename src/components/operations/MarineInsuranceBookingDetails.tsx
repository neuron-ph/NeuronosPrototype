import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Clock, ChevronRight } from "lucide-react";
import { ExpensesTab } from "./shared/ExpensesTab";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import type { MarineInsuranceBooking, ExecutionStatus } from "../../types/operations";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { BookingRateCardButton } from "../contracts/BookingRateCardButton";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { BookingCommentsTab } from "../shared/BookingCommentsTab";
import { assessBookingFinancialState, canTransitionBookingToCancelled, getBookingCancellationStatusMessage } from "../../utils/bookingCancellation";
import { BookingCancelDeletePanel } from "./shared/BookingCancelDeletePanel";
import { RequestBillingButton } from "../common/RequestBillingButton";
import { loadBookingActivityLog, appendBookingActivity } from "../../utils/bookingActivityLog";
import { BookingInfoTab } from "./shared/BookingInfoTab";
import { useUser } from "../../hooks/useUser";
import { usePermission } from "../../context/PermissionProvider";
import { fireBillingTicketOnCompletion } from "../../utils/workflowTickets";
import { logStatusChange } from "../../utils/activityLog";
import { notifyBookingStatusChange } from "../../utils/notifyBookingStatusChange";


interface MarineInsuranceBookingDetailsProps {
  booking: MarineInsuranceBooking;
  onBack: () => void;
  onUpdate: () => void;
  currentUser?: { name: string; email: string; department: string } | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

type DetailTab = "booking-info" | "billings" | "expenses" | "comments";

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
}

const initialActivityLog: ActivityLogEntry[] = [
  { id: "init-1", timestamp: new Date(), user: "System", action: "created" },
];

function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  return (
    <div style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-brand-green)", marginBottom: "20px" }}>Activity Timeline</h3>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "2px", backgroundColor: "var(--theme-border-default)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activities.map((activity) => (
            <div key={activity.id} style={{ position: "relative", paddingLeft: "40px" }}>
              <div style={{ position: "absolute", left: "8px", top: "4px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: activity.action === "status_changed" ? "var(--theme-action-primary-bg)" : activity.action === "created" ? "var(--theme-text-muted)" : "var(--neuron-semantic-info)", border: "3px solid var(--neuron-pill-inactive-bg)" }} />
              <div style={{ backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>{activity.timestamp.toLocaleString()}</div>
                {activity.action === "field_updated" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)", marginBottom: "4px" }}><span style={{ fontWeight: 600 }}>{activity.fieldName}</span> updated</div>
                    {activity.oldValue && activity.newValue && (
                      <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-danger-bg)", borderRadius: "4px", textDecoration: "line-through", color: "var(--theme-status-danger-fg)" }}>{activity.oldValue}</span>
                        <ChevronRight size={12} />
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-success-bg)", borderRadius: "4px", color: "var(--theme-status-success-fg)" }}>{activity.newValue}</span>
                      </div>
                    )}
                  </div>
                )}
                {activity.action === "created" && <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)" }}>Booking created</div>}
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginTop: "8px" }}>by {activity.user}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarineInsuranceBookingDetails({ booking, onBack, onUpdate, currentUser, initialTab, highlightId }: MarineInsuranceBookingDetailsProps) {
  const { can } = usePermission();
  const canViewBillings = can("ops_bookings_billings_tab", "view");
  const [activeTab, setActiveTab] = useState<DetailTab>(
    initialTab === "billings" && !canViewBillings
      ? "booking-info"
      : (initialTab as DetailTab) || "booking-info"
  );
  const [showTimeline, setShowTimeline] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog);
  const { user } = useUser();
  const [editedBooking, setEditedBooking] = useState<MarineInsuranceBooking>(booking);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCancelDeletePanel, setShowCancelDeletePanel] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { data: fetchedActivityLog } = useQuery({
    queryKey: ["marine_booking_activity", booking.bookingId],
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

  const addActivity = (fieldName: string, oldValue: string, newValue: string) => {
    setActivityLog(prev => [{ id: `activity-${Date.now()}-${Math.random()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "field_updated", fieldName, oldValue, newValue }, ...prev]);
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

    setEditedBooking(prev => ({ ...prev, status: newStatus }));
    setActivityLog(prev => [{ id: `activity-${Date.now()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "status_changed", statusFrom: oldStatus, statusTo: newStatus }, ...prev]);
    appendBookingActivity(booking.bookingId, { action: "status_changed", statusFrom: oldStatus, statusTo: newStatus, user: currentUser?.name || "Current User" }, { name: currentUser?.name || "Current User", department: currentUser?.department || "Operations" });
    try {
      const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', booking.bookingId);
      if (error) throw error;
      logStatusChange("booking", booking.bookingId, (booking as any).booking_number ?? booking.bookingId, oldStatus, newStatus, { id: user?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      void notifyBookingStatusChange({
        bookingId: booking.bookingId,
        bookingNumber: (booking as any).booking_number ?? booking.bookingId,
        serviceType: "Marine Insurance",
        fromStatus: oldStatus,
        toStatus: newStatus,
        actorUserId: user?.id ?? null,
      });
      toast.success(`Status updated to ${newStatus}`);
      onUpdate();
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
      setEditedBooking(prev => ({ ...prev, status: oldStatus }));
    }
  };

  const financials = useProjectFinancials(booking.projectNumber || "", [{ bookingId: booking.bookingId }]);
  const bookingBillingItems = financials.billingItems.filter(item => item.booking_id === booking.bookingId);
  const [pendingBillableCount, setPendingBillableCount] = useState(0);

  const tabStyle = (tab: DetailTab) => ({
    padding: "0 4px", fontSize: "14px", fontWeight: 500,
    color: activeTab === tab ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
    background: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
    borderBottom: activeTab === tab ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
    cursor: "pointer" as const, transition: "all 0.2s", height: "100%"
  });

  return (
    <div style={{ backgroundColor: "var(--theme-bg-surface)", display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "20px 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 30 }}>
        <div>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--neuron-ink-secondary)", cursor: "pointer", fontSize: "13px", marginBottom: "12px", padding: "0" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-brand-green)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neuron-ink-secondary)"; }}>
            <ArrowLeft size={16} /> Back to Marine Insurance Bookings
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>
            {(booking as any).name || booking.customerName}
          </h1>
          {(booking as any).name && (
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", marginBottom: "2px", fontWeight: 500 }}>
              {booking.customerName}
            </p>
          )}
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>{(booking as any).booking_number || booking.bookingId}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(editedBooking.status === "Completed" || (editedBooking.status === "Cancelled" && bookingBillingItems.some(item => item.status === "unbilled"))) && (
            <RequestBillingButton
              bookingId={booking.bookingId}
              bookingNumber={(booking as any).booking_number || booking.bookingId}
              currentUser={currentUser}
            />
          )}
          <StatusSelector status={editedBooking.status} onUpdateStatus={handleStatusUpdate} />
        </div>
      </div>

      <div style={{ padding: "0 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "56px", position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button onClick={() => setActiveTab("booking-info")} style={tabStyle("booking-info")}>Booking Information</button>
          {canViewBillings && <button onClick={() => setActiveTab("billings")} style={tabStyle("billings")}>Billings</button>}
          <button onClick={() => setActiveTab("expenses")} style={tabStyle("expenses")}>Expenses</button>
          <button onClick={() => setActiveTab("comments")} style={tabStyle("comments")}>Comments</button>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={() => setShowTimeline(!showTimeline)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: showTimeline ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)", border: `1px solid ${showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`, borderRadius: "6px", fontSize: "13px", fontWeight: 500, color: showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-secondary)", cursor: "pointer" }}>
            <Clock size={16} /> Activity
          </button>
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
            onUpdate();
          }
        }}
      />


      <div style={{ flex: 1, overflow: "hidden", display: "flex", position: "relative", zIndex: 0 }}>
        <div style={{ flex: showTimeline ? "0 0 65%" : "1", overflow: "auto", transition: "flex 0.3s ease" }}>
          {activeTab === "booking-info" && (
            <BookingInfoTab
              booking={editedBooking as Record<string, unknown>}
              serviceType="Marine Insurance"
              bookingId={String((editedBooking as any).id || booking.bookingId)}
              onUpdate={onUpdate}
              currentUser={currentUser}
            />
          )}
          {activeTab === "billings" && canViewBillings && <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]"><UnifiedBillingsTab items={bookingBillingItems} projectId={booking.projectNumber || ""} bookingId={booking.bookingId} onRefresh={financials.refresh} isLoading={financials.isLoading} pendingBillableCount={pendingBillableCount} extraActions={<BookingRateCardButton booking={booking} serviceType="Marine Insurance" existingBillingItems={bookingBillingItems} onRefresh={financials.refresh} />} /></div>}
          {activeTab === "expenses" && <ExpensesTab bookingId={booking.bookingId} bookingNumber={(booking as any).booking_number || booking.bookingId} bookingType="marine-insurance" currentUser={currentUser} highlightId={activeTab === "expenses" ? highlightId : undefined} existingBillingItems={bookingBillingItems} onPendingCountChange={setPendingBillableCount} />}
          {activeTab === "comments" && <BookingCommentsTab bookingId={booking.bookingId} />}
        </div>
        {showTimeline && <div style={{ flex: "0 0 35%", borderLeft: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-pill-inactive-bg)", overflow: "auto" }}><ActivityTimeline activities={activityLog} /></div>}
      </div>
    </div>
  );
}

