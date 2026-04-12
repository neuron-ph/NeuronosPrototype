import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, MoreVertical, Lock, Clock, ChevronRight, Package } from "lucide-react";
import type { BrokerageBooking, ExecutionStatus } from "../../types/operations";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { BookingRateCardButton } from "../contracts/BookingRateCardButton";
import { ExpensesTab } from "./shared/ExpensesTab";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import { toast } from "../ui/toast-utils";
import { EditableMultiInputField } from "../shared/EditableMultiInputField";
import { EditableSectionCard, useSectionEdit } from "../shared/EditableSectionCard";
import { EditableField } from "../shared/EditableField";
import { ConsigneeInfoBadge } from "../shared/ConsigneeInfoBadge";
import { supabase } from "../../utils/supabase/client";
import { BookingPendingEVStrip } from "./shared/BookingPendingEVStrip";
import { assessBookingFinancialState, canTransitionBookingToCancelled, getBookingCancellationStatusMessage, voidBookingUnbilledCharges, canHardDeleteBooking, getBookingCancellationMessage } from "../../utils/bookingCancellation";
import { LinkedTicketBadge } from "../common/LinkedTicketBadge";
import { RequestBillingButton } from "../common/RequestBillingButton";
import { loadBookingActivityLog, appendBookingActivity } from "../../utils/bookingActivityLog";
import { useUser } from "../../hooks/useUser";
import { fireBillingTicketOnCompletion } from "../../utils/workflowTickets";
import { logStatusChange, logDeletion } from "../../utils/activityLog";
import { BookingCommentsTab } from "../shared/BookingCommentsTab";
import { useQuery } from "@tanstack/react-query";

interface BrokerageBookingDetailsProps {
  booking: BrokerageBooking;
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
  note?: string;
}

const initialActivityLog: ActivityLogEntry[] = [
  { id: "init-1", timestamp: new Date(), user: "System", action: "created" },
];

// ── Field labels for activity log ──
const FIELD_LABELS: Record<string, string> = {
  accountHandler: "Account Handler",
  cargoType: "Cargo Type",
  examination_type: "Examination Type",
  consignee: "Consignee",
  shipper: "Shipper",
  mblMawb: "MBL/MAWB",
  hblHawb: "HBL/HAWB",
  bookingConfirmationNumber: "Booking Confirmation No.",
  registryNumber: "Registry Number",
  carrier: "Carrier",
  forwarder: "Forwarder",
  pod: "POD",
  commodityDescription: "Commodity Description",
  grossWeight: "Gross Weight",
  dimensions: "Dimensions",
  etd: "ETD",
  etb: "ETB",
  eta: "ETA",
  lct: "LCT",
  containerNumbers: "Container Numbers",
  containerDeposit: "Container Deposit",
  detDem: "Det/Dem",
  tareWeight: "Tare Weight",
  vgm: "VGM",
  truckingName: "Trucking Name",
  plateNumber: "Plate Number",
  pickupLocation: "Pickup Location",
};

function diffAndApply(
  original: BrokerageBooking,
  draft: BrokerageBooking,
  fields: string[],
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void,
  setEditedBooking: (fn: (prev: BrokerageBooking) => BrokerageBooking) => void,
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
    setEditedBooking((prev: BrokerageBooking) => ({ ...prev, ...updates }));
    onBookingUpdated();
    toast.success("Changes saved");
  }
}

// ── Locked Field ──
function LockedField({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div>
      <label style={{
        display: "flex", alignItems: "center", gap: "6px",
        fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-base)", marginBottom: "8px"
      }}>
        {label}
        <Lock size={12} color="var(--theme-text-muted)" style={{ cursor: "help" }} />
      </label>
      <div style={{
        padding: "10px 14px", backgroundColor: "var(--theme-bg-page)", border: "1px solid var(--theme-border-default)",
        borderRadius: "6px", fontSize: "14px", color: "var(--theme-text-muted)", cursor: "not-allowed"
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ── Activity Timeline ──
function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  return (
    <div style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-brand-green)", marginBottom: "20px" }}>
        Activity Timeline
      </h3>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "2px", backgroundColor: "var(--theme-border-default)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activities.map((activity) => (
            <div key={activity.id} style={{ position: "relative", paddingLeft: "40px" }}>
              <div style={{
                position: "absolute", left: "8px", top: "4px", width: "16px", height: "16px", borderRadius: "50%",
                backgroundColor: activity.action === "status_changed" ? "var(--theme-action-primary-bg)" : activity.action === "created" ? "var(--theme-text-muted)" : activity.action === "field_updated" ? "var(--neuron-semantic-info)" : "var(--theme-status-warning-fg)",
                border: "3px solid var(--neuron-pill-inactive-bg)"
              }} />
              <div style={{ backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>
                  {activity.timestamp.toLocaleString()}
                </div>
                {activity.action === "field_updated" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600 }}>{activity.fieldName}</span> updated
                    </div>
                    {activity.oldValue && activity.newValue && (
                      <div style={{ fontSize: "12px", color: "var(--neuron-ink-secondary)", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-danger-bg)", borderRadius: "4px", textDecoration: "line-through", color: "var(--theme-status-danger-fg)" }}>
                          {activity.oldValue || "(empty)"}
                        </span>
                        <ChevronRight size={12} />
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-success-bg)", borderRadius: "4px", color: "var(--theme-status-success-fg)" }}>
                          {activity.newValue}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {activity.action === "created" && (
                  <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)" }}>Booking created</div>
                )}
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginTop: "8px" }}>by {activity.user}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export function BrokerageBookingDetails({ booking, onBack, onUpdate, currentUser, initialTab, highlightId }: BrokerageBookingDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(
    (initialTab as DetailTab) || "booking-info"
  );
  const [showTimeline, setShowTimeline] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog);
  const { user } = useUser();
  const [editedBooking, setEditedBooking] = useState<BrokerageBooking>(booking);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { data: fetchedActivityLog } = useQuery({
    queryKey: ["brokerage_booking_activity", booking.bookingId],
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

  const handleDeleteFromDetail = async () => {
    setShowMoreMenu(false);
    try {
      const financialState = await assessBookingFinancialState(booking.bookingId);
      if (!canHardDeleteBooking(financialState)) {
        toast.error(getBookingCancellationMessage(financialState));
        return;
      }
      if (!window.confirm(`Delete booking ${booking.bookingId}? This cannot be undone.`)) return;
      const { error } = await supabase.from('bookings').delete().eq('id', booking.bookingId);
      if (error) throw error;
      logDeletion("booking", booking.bookingId, (booking as any).booking_number ?? booking.bookingId, { id: user?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      toast.success('Booking deleted');
      onBack();
    } catch (err) {
      toast.error('Unable to delete booking');
    }
  };

  const addActivity = (fieldName: string, oldValue: string, newValue: string) => {
    setActivityLog(prev => [{ id: `activity-${Date.now()}-${Math.random()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "field_updated", fieldName, oldValue, newValue }, ...prev]);
    appendBookingActivity(booking.bookingId, { action: "field_updated", fieldName, oldValue, newValue, user: currentUser?.name || "Current User" }, { name: currentUser?.name || "Current User", department: currentUser?.department || "Operations" });
  };

  const handleStatusUpdate = async (newStatus: ExecutionStatus) => {
    const oldStatus = editedBooking.status;
    if (oldStatus === newStatus) return;

    if (newStatus === "Cancelled") {
      let financialState = await assessBookingFinancialState(booking.bookingId);
      if (financialState.recommendedAction === "cancel-and-void-unbilled") {
        const shouldProceed = window.confirm(
          `Cancel booking ${booking.bookingId} and void ${financialState.unbilledChargeCount} unbilled charge line(s)?`
        );
        if (!shouldProceed) return;

        await voidBookingUnbilledCharges(booking.bookingId);
        toast.info("Unbilled booking charges were voided before cancellation.");
        financialState = await assessBookingFinancialState(booking.bookingId);
      }
      if (!canTransitionBookingToCancelled(financialState)) {
        toast.error(getBookingCancellationStatusMessage(financialState));
        return;
      }
      if (financialState.recommendedAction === "cancel-preserve-costs") {
        toast.info(getBookingCancellationStatusMessage(financialState));
      }
    }

    setEditedBooking(prev => ({ ...prev, status: newStatus }));
    setActivityLog(prev => [{ id: `activity-${Date.now()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "status_changed", statusFrom: oldStatus, statusTo: newStatus }, ...prev]);
    appendBookingActivity(booking.bookingId, { action: "status_changed", statusFrom: oldStatus, statusTo: newStatus, user: currentUser?.name || "Current User" }, { name: currentUser?.name || "Current User", department: currentUser?.department || "Operations" });
    try {
      const { error } = await supabase.from('brokerage_bookings').update({ status: newStatus }).eq('bookingId', booking.bookingId);
      if (error) throw error;
      logStatusChange("booking", booking.bookingId, (booking as any).booking_number ?? booking.bookingId, oldStatus, newStatus, { id: user?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
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

  const financials = useProjectFinancials(booking.projectNumber || "");
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
      {/* Header */}
      <div style={{ padding: "20px 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--neuron-ink-secondary)", cursor: "pointer", fontSize: "13px", marginBottom: "12px", padding: "0" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-brand-green)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neuron-ink-secondary)"; }}>
            <ArrowLeft size={16} /> Back to Brokerage Bookings
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>
            {(booking as any).name || booking.customerName}
          </h1>
          {(booking as any).name && (
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", marginBottom: "2px", fontWeight: 500 }}>
              {booking.customerName}
            </p>
          )}
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>{booking.bookingId}</p>
          <div style={{ marginTop: 8 }}>
            <LinkedTicketBadge recordType="booking" recordId={booking.bookingId} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(editedBooking.status === "Completed" || (editedBooking.status === "Cancelled" && bookingBillingItems.some(item => item.status === "unbilled"))) && (
            <RequestBillingButton
              bookingId={booking.bookingId}
              bookingNumber={booking.bookingId}
              currentUser={currentUser}
            />
          )}
          <StatusSelector status={editedBooking.status} onUpdateStatus={handleStatusUpdate} />
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: "0 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "56px" }}>
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button onClick={() => setActiveTab("booking-info")} style={tabStyle("booking-info")}>Booking Information</button>
          <button onClick={() => setActiveTab("billings")} style={tabStyle("billings")}>Billings</button>
          <button onClick={() => setActiveTab("expenses")} style={tabStyle("expenses")}>Expenses</button>
          <button onClick={() => setActiveTab("comments")} style={tabStyle("comments")}>Comments</button>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={() => setShowTimeline(!showTimeline)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: showTimeline ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)", border: `1px solid ${showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`, borderRadius: "6px", fontSize: "13px", fontWeight: 500, color: showTimeline ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-secondary)", cursor: "pointer", transition: "all 0.2s ease" }}>
            <Clock size={16} /> Activity
          </button>
          <div style={{ padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, backgroundColor: booking.movement === "EXPORT" ? "var(--theme-status-warning-bg)" : "var(--theme-status-success-bg)", color: booking.movement === "EXPORT" ? "#C2410C" : "var(--theme-action-primary-bg)", border: `1px solid ${booking.movement === "EXPORT" ? "var(--theme-status-warning-border)" : "var(--theme-status-success-border)"}` }}>
            {booking.movement || "IMPORT"}
          </div>
          <div style={{ position: "relative" }} ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer" }}
            >
              <MoreVertical size={18} />
            </button>
            {showMoreMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", width: "180px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--theme-border-default)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 100, overflow: "hidden" }}>
                <button
                  onClick={() => { setShowMoreMenu(false); handleStatusUpdate("Cancelled"); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Cancel Booking
                </button>
                <div style={{ height: "1px", backgroundColor: "var(--theme-bg-surface-subtle)" }} />
                <button
                  onClick={handleDeleteFromDetail}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--theme-status-danger-fg)", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Delete Booking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <BookingPendingEVStrip bookingId={booking.bookingId} />

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: showTimeline ? "0 0 65%" : "1", overflow: "auto", transition: "flex 0.3s ease" }}>
          {activeTab === "booking-info" && <BookingInformationTab booking={editedBooking} onBookingUpdated={onUpdate} addActivity={addActivity} setEditedBooking={setEditedBooking} />}
          {activeTab === "billings" && <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]"><UnifiedBillingsTab items={bookingBillingItems} projectId={booking.projectNumber || ""} bookingId={booking.bookingId} onRefresh={financials.refresh} isLoading={financials.isLoading} pendingBillableCount={pendingBillableCount} extraActions={<BookingRateCardButton booking={editedBooking} serviceType="Brokerage" existingBillingItems={bookingBillingItems} onRefresh={financials.refresh} />} /></div>}
          {activeTab === "expenses" && <ExpensesTab bookingId={booking.bookingId} bookingType="brokerage" currentUser={currentUser} highlightId={activeTab === "expenses" ? highlightId : undefined} existingBillingItems={bookingBillingItems} onPendingCountChange={setPendingBillableCount} />}
          {activeTab === "comments" && <BookingCommentsTab bookingId={booking.bookingId} currentUserId={currentUser?.email || "unknown"} currentUserName={currentUser?.name || "Unknown User"} currentUserDepartment={currentUser?.department || "Operations"} />}
        </div>
        {showTimeline && <div style={{ flex: "0 0 35%", borderLeft: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-pill-inactive-bg)", overflow: "auto" }}><ActivityTimeline activities={activityLog} /></div>}
      </div>
    </div>
  );
}

// ── Booking Information Tab (Section-level edit mode) ──
function BookingInformationTab({
  booking, onBookingUpdated, addActivity, setEditedBooking,
}: {
  booking: BrokerageBooking;
  onBookingUpdated: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void;
  setEditedBooking: any;
}) {
  const generalSection = useSectionEdit(booking);
  const examSection = useSectionEdit(booking);
  const shipmentSection = useSectionEdit(booking);
  const fclSection = useSectionEdit(booking);

  const GENERAL_FIELDS = ["accountHandler", "cargoType"];
  const EXAM_FIELDS = ["examination_type"];
  const SHIPMENT_FIELDS = ["consignee", "shipper", "mblMawb", "hblHawb", "bookingConfirmationNumber", "registryNumber", "carrier", "forwarder", "pod", "commodityDescription", "grossWeight", "dimensions", "etd", "etb", "eta", "lct", "containerNumbers"];
  const FCL_FIELDS = ["containerDeposit", "detDem", "tareWeight", "vgm", "truckingName", "plateNumber", "pickupLocation"];

  const gMode = generalSection.isEditing ? "edit" : "view";
  const eMode = examSection.isEditing ? "edit" : "view";
  const sMode = shipmentSection.isEditing ? "edit" : "view";
  const fMode = fclSection.isEditing ? "edit" : "view";

  return (
    <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto" }}>

      {/* ── General Information ── */}
      <EditableSectionCard
        title="General Information"
        subtitle={`Last updated by ${booking.accountHandler || "System"}, ${new Date(booking.updatedAt).toLocaleString()}`}
        isEditing={generalSection.isEditing}
        onEdit={generalSection.startEditing}
        onCancel={generalSection.cancel}
        onSave={() => { const draft = generalSection.save(); diffAndApply(booking, draft, GENERAL_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <LockedField label="Customer Name" value={booking.customerName} />
            <LockedField label="Account Owner" value={booking.accountOwner || ""} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="Account Handler" value={generalSection.draft.accountHandler || ""} mode={gMode} placeholder="Assign handler..." onChange={(v) => generalSection.updateField("accountHandler", v)} />
            <LockedField label="Mode" value={booking.mode || ""} />
            <LockedField label="Service/s" value={booking.service || ""} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <LockedField label="Incoterms" value={booking.incoterms || ""} />
            <EditableField label="Cargo Type" value={generalSection.draft.cargoType || ""} mode={gMode} placeholder="Enter cargo type..." onChange={(v) => generalSection.updateField("cargoType", v)} />
            <LockedField label="Quotation Reference" value={booking.quotationReferenceNumber || ""} />
          </div>
          {booking.cargoNature && <LockedField label="Cargo Nature" value={booking.cargoNature} />}
        </div>
      </EditableSectionCard>

      {/* ── Examination & Flags ── */}
      <EditableSectionCard
        title="Examination & Flags"
        isEditing={examSection.isEditing}
        onEdit={examSection.startEditing}
        onCancel={examSection.cancel}
        onSave={() => { const draft = examSection.save(); diffAndApply(booking, draft, EXAM_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <EditableField label="Examination Type" value={examSection.draft.examination_type || "None"} type="select" options={["None", "DEA", "Physical", "X-Ray"]} mode={eMode} onChange={(v) => examSection.updateField("examination_type", v as any)} />
        </div>
      </EditableSectionCard>

      {/* ── Shipment Information ── */}
      <EditableSectionCard
        title="Shipment Information"
        isEditing={shipmentSection.isEditing}
        onEdit={shipmentSection.startEditing}
        onCancel={shipmentSection.cancel}
        onSave={() => { const draft = shipmentSection.save(); diffAndApply(booking, draft, SHIPMENT_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <EditableField label="Consignee" value={shipmentSection.draft.consignee || ""} mode={sMode} placeholder="Enter consignee..." onChange={(v) => shipmentSection.updateField("consignee", v)} />
              {!shipmentSection.isEditing && <ConsigneeInfoBadge consigneeId={(booking as any).consignee_id} />}
            </div>
            <EditableField label="Shipper" value={shipmentSection.draft.shipper || ""} mode={sMode} placeholder="Enter shipper..." onChange={(v) => shipmentSection.updateField("shipper", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            {booking.movement === "EXPORT" ? (
              <EditableMultiInputField fieldName="bookingConfirmationNumber" label="Booking Confirmation No." value={shipmentSection.draft.bookingConfirmationNumber || ""} status={booking.status as ExecutionStatus} placeholder="Enter booking confirmation..." addButtonText="Add Confirmation No." mode={sMode} onChange={(v) => shipmentSection.updateField("bookingConfirmationNumber", v)} />
            ) : (
              <EditableMultiInputField fieldName="mblMawb" label="MBL/MAWB" value={shipmentSection.draft.mblMawb || ""} status={booking.status as ExecutionStatus} placeholder="Enter MBL/MAWB..." addButtonText="Add MBL/MAWB" mode={sMode} onChange={(v) => shipmentSection.updateField("mblMawb", v)} />
            )}
            <EditableMultiInputField fieldName="hblHawb" label="HBL/HAWB" value={shipmentSection.draft.hblHawb || ""} status={booking.status as ExecutionStatus} placeholder="Enter HBL/HAWB..." addButtonText="Add HBL/HAWB" mode={sMode} onChange={(v) => shipmentSection.updateField("hblHawb", v)} />
            <EditableMultiInputField fieldName="registryNumber" label="Registry Number" value={shipmentSection.draft.registryNumber || ""} status={booking.status as ExecutionStatus} placeholder="Enter registry..." addButtonText="Add Registry" mode={sMode} onChange={(v) => shipmentSection.updateField("registryNumber", v)} />
          </div>
          <EditableMultiInputField fieldName="containerNumbers" label="Container Number/s" value={shipmentSection.draft.containerNumbers || ""} status={booking.status as ExecutionStatus} placeholder="Enter container number..." addButtonText="Add Container" mode={sMode} onChange={(v) => shipmentSection.updateField("containerNumbers", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField label="Carrier" value={shipmentSection.draft.carrier || ""} mode={sMode} placeholder="Enter carrier..." onChange={(v) => shipmentSection.updateField("carrier", v)} />
            <EditableField label="Forwarder" value={shipmentSection.draft.forwarder || ""} mode={sMode} placeholder="Enter forwarder..." onChange={(v) => shipmentSection.updateField("forwarder", v)} />
          </div>
          {booking.pod && (
            <EditableField label="POD (Port of Discharge)" value={shipmentSection.draft.pod || ""} mode={sMode} placeholder="Enter POD..." onChange={(v) => shipmentSection.updateField("pod", v)} />
          )}
          <EditableField label="Commodity Description" value={shipmentSection.draft.commodityDescription || ""} type="textarea" mode={sMode} placeholder="Enter commodity description..." onChange={(v) => shipmentSection.updateField("commodityDescription", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField label="Gross Weight" value={shipmentSection.draft.grossWeight || ""} mode={sMode} placeholder="Enter weight..." onChange={(v) => shipmentSection.updateField("grossWeight", v)} />
            <EditableField label="Dimensions" value={shipmentSection.draft.dimensions || ""} mode={sMode} placeholder="Enter dimensions..." onChange={(v) => shipmentSection.updateField("dimensions", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
            <EditableField label="ETD" value={shipmentSection.draft.etd || ""} type="date" mode={sMode} onChange={(v) => shipmentSection.updateField("etd", v)} />
            <EditableField label="ETB" value={shipmentSection.draft.etb || ""} type="date" mode={sMode} onChange={(v) => shipmentSection.updateField("etb", v)} />
            <EditableField label="ETA" value={shipmentSection.draft.eta || ""} type="date" mode={sMode} onChange={(v) => shipmentSection.updateField("eta", v)} />
            {booking.movement === "EXPORT" && (
              <EditableField label="LCT (Last Cargo Time)" value={shipmentSection.draft.lct || ""} type="date" mode={sMode} onChange={(v) => shipmentSection.updateField("lct", v)} />
            )}
          </div>
        </div>
      </EditableSectionCard>

      {/* ── FCL Information ── */}
      {(booking.containerDeposit || booking.detDem || booking.movement === "EXPORT") && (
        <EditableSectionCard
          title={booking.movement === "EXPORT" ? "Export FCL Requirements" : "FCL Information"}
          isEditing={fclSection.isEditing}
          onEdit={fclSection.startEditing}
          onCancel={fclSection.cancel}
          onSave={() => { const draft = fclSection.save(); diffAndApply(booking, draft, FCL_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
        >
          <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <EditableField label="Container Deposit" value={fclSection.draft.containerDeposit || ""} mode={fMode} placeholder="Enter deposit..." onChange={(v) => fclSection.updateField("containerDeposit", v)} />
              <EditableField label="Det/Dem" value={fclSection.draft.detDem || ""} mode={fMode} placeholder="Enter Det/Dem..." onChange={(v) => fclSection.updateField("detDem", v)} />
            </div>
            {booking.movement === "EXPORT" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <EditableField label="Tare Weight" value={fclSection.draft.tareWeight || ""} mode={fMode} placeholder="Enter tare weight..." onChange={(v) => fclSection.updateField("tareWeight", v)} />
                  <EditableField label="VGM" value={fclSection.draft.vgm || ""} mode={fMode} placeholder="Enter VGM..." onChange={(v) => fclSection.updateField("vgm", v)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
                  <EditableField label="Trucking Name" value={fclSection.draft.truckingName || ""} mode={fMode} placeholder="Enter trucking name..." onChange={(v) => fclSection.updateField("truckingName", v)} />
                  <EditableField label="Plate Number" value={fclSection.draft.plateNumber || ""} mode={fMode} placeholder="Enter plate number..." onChange={(v) => fclSection.updateField("plateNumber", v)} />
                  <EditableField label="Pickup Location" value={fclSection.draft.pickupLocation || ""} mode={fMode} placeholder="Enter pickup location..." onChange={(v) => fclSection.updateField("pickupLocation", v)} />
                </div>
              </>
            )}
          </div>
        </EditableSectionCard>
      )}
    </div>
  );
}
