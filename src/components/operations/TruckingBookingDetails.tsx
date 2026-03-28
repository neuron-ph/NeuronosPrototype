import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Lock, Clock, ChevronRight } from "lucide-react";
import type { TruckingBooking, ExecutionStatus } from "../../types/operations";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { BookingRateCardButton } from "../contracts/BookingRateCardButton";
import { ExpensesTab } from "./shared/ExpensesTab";
import { BookingCommentsTab } from "../shared/BookingCommentsTab";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import { toast } from "../ui/toast-utils";
import { EditableMultiInputField } from "../shared/EditableMultiInputField";
import { EditableSectionCard, useSectionEdit } from "../shared/EditableSectionCard";
import { EditableField } from "../shared/EditableField";
import { ConsigneeInfoBadge } from "../shared/ConsigneeInfoBadge";
import { normalizeTruckingLineItems } from "../../utils/contractQuantityExtractor";
import { Truck as TruckIcon } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { assessBookingFinancialState, canTransitionBookingToCancelled, getBookingCancellationStatusMessage, voidBookingUnbilledCharges, canHardDeleteBooking, getBookingCancellationMessage } from "../../utils/bookingCancellation";
import { LinkedTicketBadge } from "../common/LinkedTicketBadge";
import { RequestBillingButton } from "../common/RequestBillingButton";
import { loadBookingActivityLog, appendBookingActivity } from "../../utils/bookingActivityLog";

interface TruckingBookingDetailsProps {
  booking: TruckingBooking;
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

const FIELD_LABELS: Record<string, string> = {
  accountHandler: "Account Handler",
  preferredDeliveryDate: "Preferred Delivery Date",
  consignee: "Consignee",
  driver: "Driver",
  helper: "Helper",
  vehicleReferenceNumber: "Vehicle Reference Number",
  pullOut: "Pull Out Location",
  deliveryAddress: "Delivery Address",
  warehouseAddress: "Warehouse Address",
  withGps: "With GPS",
  deliveryInstructions: "Delivery Instructions",
  dateDelivered: "Date Delivered",
  tabsBooking: "TABS Booking",
  emptyReturn: "Empty Return",
  cyFee: "CY Fee",
  eirAvailability: "EIR Availability",
  earlyGateIn: "Early Gate In",
  gateIn: "Gate In",
  detDemValidity: "Det/Dem Validity",
  storageValidity: "Storage Validity",
  shippingLine: "Shipping Line",
};

function diffAndApply(
  original: TruckingBooking,
  draft: TruckingBooking,
  fields: string[],
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void,
  setEditedBooking: (fn: (prev: TruckingBooking) => TruckingBooking) => void,
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
    setEditedBooking((prev: TruckingBooking) => ({ ...prev, ...updates }));
    onBookingUpdated();
    toast.success("Changes saved");
  }
}

function LockedField({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-base)", marginBottom: "8px" }}>
        {label}
        <Lock size={12} color="var(--theme-text-muted)" style={{ cursor: "help" }} />
      </label>
      <div style={{ padding: "10px 14px", backgroundColor: "var(--theme-bg-page)", border: "1px solid var(--theme-border-default)", borderRadius: "6px", fontSize: "14px", color: "var(--theme-text-muted)", cursor: "not-allowed" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  return (
    <div style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-brand-green)", marginBottom: "20px" }}>Activity Timeline</h3>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "2px", backgroundColor: "#E5E7EB" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {activities.map((activity) => (
            <div key={activity.id} style={{ position: "relative", paddingLeft: "40px" }}>
              <div style={{ position: "absolute", left: "8px", top: "4px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: activity.action === "status_changed" ? "#0F766E" : activity.action === "created" ? "#6B7280" : "#3B82F6", border: "3px solid #FAFBFC" }} />
              <div style={{ backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>{activity.timestamp.toLocaleString()}</div>
                {activity.action === "field_updated" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)", marginBottom: "4px" }}><span style={{ fontWeight: 600 }}>{activity.fieldName}</span> updated</div>
                    {activity.oldValue && activity.newValue && (
                      <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-danger-bg)", borderRadius: "4px", textDecoration: "line-through", color: "var(--theme-status-danger-fg)" }}>{activity.oldValue}</span>
                        <ChevronRight size={12} />
                        <span style={{ padding: "2px 8px", backgroundColor: "var(--theme-status-success-bg)", borderRadius: "4px", color: "#10B981" }}>{activity.newValue}</span>
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

export function TruckingBookingDetails({ booking, onBack, onUpdate, currentUser, initialTab, highlightId }: TruckingBookingDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(
    (initialTab as DetailTab) || "booking-info"
  );
  const [showTimeline, setShowTimeline] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog);
  const [editedBooking, setEditedBooking] = useState<TruckingBooking>(booking);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { data: fetchedActivityLog } = useQuery({
    queryKey: ["trucking_booking_activity", booking.bookingId],
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
      const { error } = await supabase.from('trucking_bookings').update({ status: newStatus }).eq('bookingId', booking.bookingId);
      if (error) throw error;
      toast.success(`Status updated to ${newStatus}`);
      onUpdate();
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
    color: activeTab === tab ? "#0F766E" : "var(--neuron-ink-muted)",
    background: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
    borderBottom: activeTab === tab ? "2px solid #0F766E" : "2px solid transparent",
    cursor: "pointer" as const, transition: "all 0.2s", height: "100%"
  });

  return (
    <div style={{ backgroundColor: "var(--theme-bg-surface)", display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "20px 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--neuron-ink-secondary)", cursor: "pointer", fontSize: "13px", marginBottom: "12px", padding: "0" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-brand-green)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neuron-ink-secondary)"; }}>
            <ArrowLeft size={16} /> Back to Trucking Bookings
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>{booking.customerName}</h1>
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

      <div style={{ padding: "0 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "56px" }}>
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button onClick={() => setActiveTab("booking-info")} style={tabStyle("booking-info")}>Booking Information</button>
          <button onClick={() => setActiveTab("billings")} style={tabStyle("billings")}>Billings</button>
          <button onClick={() => setActiveTab("expenses")} style={tabStyle("expenses")}>Expenses</button>
          <button onClick={() => setActiveTab("comments")} style={tabStyle("comments")}>Comments</button>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={() => setShowTimeline(!showTimeline)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: showTimeline ? "#E8F2EE" : "white", border: `1px solid ${showTimeline ? "#0F766E" : "var(--neuron-ui-border)"}`, borderRadius: "6px", fontSize: "13px", fontWeight: 500, color: showTimeline ? "#0F766E" : "var(--neuron-ink-secondary)", cursor: "pointer" }}>
            <Clock size={16} /> Activity
          </button>
          <div style={{ padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, backgroundColor: booking.movement === "EXPORT" ? "#FFF7ED" : "#E6FFFA", color: booking.movement === "EXPORT" ? "#C2410C" : "#0F766E", border: `1px solid ${booking.movement === "EXPORT" ? "#FED7AA" : "#99F6E4"}` }}>
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
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#FEF2F2")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  Delete Booking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: showTimeline ? "0 0 65%" : "1", overflow: "auto", transition: "flex 0.3s ease" }}>
          {activeTab === "booking-info" && <BookingInformationTab booking={editedBooking} onBookingUpdated={onUpdate} addActivity={addActivity} setEditedBooking={setEditedBooking} />}
          {activeTab === "billings" && <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]"><UnifiedBillingsTab items={bookingBillingItems} projectId={booking.projectNumber || ""} bookingId={booking.bookingId} onRefresh={financials.refresh} isLoading={financials.isLoading} extraActions={<BookingRateCardButton booking={booking} serviceType="Trucking" existingBillingItems={bookingBillingItems} onRefresh={financials.refresh} />} pendingBillableCount={pendingBillableCount} /></div>}
          {activeTab === "expenses" && <ExpensesTab bookingId={booking.bookingId} bookingType="trucking" currentUser={currentUser} highlightId={activeTab === "expenses" ? highlightId : undefined} existingBillingItems={bookingBillingItems} onPendingCountChange={setPendingBillableCount} />}
          {activeTab === "comments" && <BookingCommentsTab bookingId={booking.bookingId} currentUserId={currentUser?.email || "unknown"} currentUserName={currentUser?.name || "Unknown User"} currentUserDepartment={currentUser?.department || "Operations"} />}
        </div>
        {showTimeline && <div style={{ flex: "0 0 35%", borderLeft: "1px solid var(--neuron-ui-border)", backgroundColor: "#FAFBFC", overflow: "auto" }}><ActivityTimeline activities={activityLog} /></div>}
      </div>
    </div>
  );
}

function BookingInformationTab({ booking, onBookingUpdated, addActivity, setEditedBooking }: {
  booking: TruckingBooking; onBookingUpdated: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void; setEditedBooking: any;
}) {
  const generalSection = useSectionEdit(booking);
  const shipmentSection = useSectionEdit(booking);
  const fclSection = useSectionEdit(booking);

  // ✨ Multi-line trucking: normalize line items for view-mode display
  const lineItems = normalizeTruckingLineItems(booking);
  const hasMultiLineItems = lineItems.length > 1;
  // @deprecated: truckType LockedField shows comma-joined types from line items when multi-line
  const truckTypeDisplay = hasMultiLineItems
    ? [...new Set(lineItems.map(li => li.truckType).filter(Boolean))].join(", ") || "—"
    : (booking.truckType || "");

  const GENERAL_FIELDS = ["accountHandler", "preferredDeliveryDate"];
  const SHIPMENT_FIELDS = ["consignee", "driver", "helper", "vehicleReferenceNumber", "pullOut", "deliveryAddress", "warehouseAddress", "withGps", "deliveryInstructions", "dateDelivered"];
  const FCL_FIELDS = ["tabsBooking", "emptyReturn", "cyFee", "eirAvailability", "earlyGateIn", "gateIn", "detDemValidity", "storageValidity", "shippingLine"];

  const gMode = generalSection.isEditing ? "edit" : "view";
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
            <LockedField label="Service/s" value={booking.service || ""} />
            <LockedField label="Truck Type" value={truckTypeDisplay} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <LockedField label="Mode" value={booking.mode || ""} />
            <EditableField label="Preferred Delivery Date" value={generalSection.draft.preferredDeliveryDate || ""} type="date" mode={gMode} onChange={(v) => generalSection.updateField("preferredDeliveryDate", v)} />
            <LockedField label="Quotation Reference" value={booking.quotationReferenceNumber || ""} />
          </div>
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
            <EditableField label="Driver" value={shipmentSection.draft.driver || ""} mode={sMode} placeholder="Assign driver..." onChange={(v) => shipmentSection.updateField("driver", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="Helper" value={shipmentSection.draft.helper || ""} mode={sMode} placeholder="Assign helper..." onChange={(v) => shipmentSection.updateField("helper", v)} />
            <EditableMultiInputField fieldName="vehicleReferenceNumber" label="Vehicle Reference Number" value={shipmentSection.draft.vehicleReferenceNumber || ""} status={booking.status} placeholder="Enter vehicle ref..." addButtonText="Add Vehicle Ref." mode={sMode} onChange={(v) => shipmentSection.updateField("vehicleReferenceNumber", v)} />
            <EditableField label="Pull Out Location" value={shipmentSection.draft.pullOut || ""} mode={sMode} placeholder="Enter pull out location..." onChange={(v) => shipmentSection.updateField("pullOut", v)} />
          </div>
          {/* ✨ Multi-line trucking: Destinations read-only display */}
          {hasMultiLineItems && (
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-base)", marginBottom: "8px" }}>
                Destinations ({lineItems.length})
              </label>
              <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px", backgroundColor: "var(--theme-bg-page)", borderBottom: "1px solid var(--theme-border-default)", padding: "6px 12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Destination</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Truck Type</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>Qty</span>
                </div>
                {/* Rows */}
                {lineItems.map((li) => (
                  <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px", padding: "8px 12px", borderBottom: "1px solid var(--theme-border-subtle)", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>{li.destination || "—"}</span>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}>{li.truckType || "—"}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "center" }}>{li.quantity}</span>
                  </div>
                ))}
                {/* Total */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px", padding: "8px 12px", backgroundColor: "var(--theme-bg-page)" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)" }}>Total</span>
                  <span />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--theme-text-primary)", textAlign: "center" }}>{lineItems.reduce((s, li) => s + li.quantity, 0)}</span>
                </div>
              </div>
            </div>
          )}
          {/* @deprecated — Delivery Address shown for backward compat / single-line bookings */}
          <EditableField label="Delivery Address" value={shipmentSection.draft.deliveryAddress || ""} type="textarea" mode={sMode} placeholder="Enter delivery address..." onChange={(v) => shipmentSection.updateField("deliveryAddress", v)} />
          {booking.movement === "EXPORT" && (
            <>
              <EditableField label="Warehouse Address" value={shipmentSection.draft.warehouseAddress || ""} type="textarea" mode={sMode} placeholder="Enter warehouse address..." onChange={(v) => shipmentSection.updateField("warehouseAddress", v)} />
              <EditableField label="With GPS?" value={shipmentSection.draft.withGps ? "Yes" : "No"} type="select" options={["Yes", "No"]} mode={sMode} onChange={(v) => shipmentSection.updateField("withGps", (v === "Yes") as any)} />
            </>
          )}
          <EditableField label="Delivery Instructions" value={shipmentSection.draft.deliveryInstructions || ""} type="textarea" mode={sMode} placeholder="Enter special instructions..." onChange={(v) => shipmentSection.updateField("deliveryInstructions", v)} />
          {booking.dateDelivered && (
            <EditableField label="Date Delivered" value={shipmentSection.draft.dateDelivered || ""} type="date" mode={sMode} onChange={(v) => shipmentSection.updateField("dateDelivered", v)} />
          )}
        </div>
      </EditableSectionCard>

      {/* ── FCL Information ── */}
      {(booking.tabsBooking || booking.emptyReturn || booking.cyFee || booking.eirAvailability ||
        booking.earlyGateIn || booking.detDemValidity || booking.storageValidity || booking.shippingLine) && (
        <EditableSectionCard
          title="FCL Information"
          isEditing={fclSection.isEditing}
          onEdit={fclSection.startEditing}
          onCancel={fclSection.cancel}
          onSave={() => { const draft = fclSection.save(); diffAndApply(booking, draft, FCL_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
        >
          <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              {booking.tabsBooking && <EditableField label="TABS Booking" value={fclSection.draft.tabsBooking || ""} mode={fMode} onChange={(v) => fclSection.updateField("tabsBooking", v)} />}
              {booking.emptyReturn && <EditableField label="Empty Return" value={fclSection.draft.emptyReturn || ""} mode={fMode} onChange={(v) => fclSection.updateField("emptyReturn", v)} />}
              {booking.cyFee && <EditableField label="CY Fee" value={fclSection.draft.cyFee || ""} mode={fMode} onChange={(v) => fclSection.updateField("cyFee", v)} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              {booking.eirAvailability && <EditableField label="EIR Availability" value={fclSection.draft.eirAvailability || ""} type="date" mode={fMode} onChange={(v) => fclSection.updateField("eirAvailability", v)} />}
              {booking.earlyGateIn && <EditableField label="Early Gate In" value={fclSection.draft.earlyGateIn || ""} type="date" mode={fMode} onChange={(v) => fclSection.updateField("earlyGateIn", v)} />}
              {booking.movement === "EXPORT" && <EditableField label="Gate In" value={fclSection.draft.gateIn || ""} type="date" mode={fMode} onChange={(v) => fclSection.updateField("gateIn", v)} />}
              {booking.detDemValidity && <EditableField label="Det/Dem Validity" value={fclSection.draft.detDemValidity || ""} type="date" mode={fMode} onChange={(v) => fclSection.updateField("detDemValidity", v)} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              {booking.storageValidity && <EditableField label="Storage Validity" value={fclSection.draft.storageValidity || ""} type="date" mode={fMode} onChange={(v) => fclSection.updateField("storageValidity", v)} />}
              {booking.shippingLine && <EditableField label="Shipping Line" value={fclSection.draft.shippingLine || ""} mode={fMode} onChange={(v) => fclSection.updateField("shippingLine", v)} />}
            </div>
          </div>
        </EditableSectionCard>
      )}
    </div>
  );
}
