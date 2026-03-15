import React, { useState } from "react";
import { ArrowLeft, MoreVertical, Lock, Clock, ChevronRight } from "lucide-react";
import type { OthersBooking, ExecutionStatus } from "../../types/operations";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { BookingRateCardButton } from "../contracts/BookingRateCardButton";
import { ExpensesTab } from "./shared/ExpensesTab";
import { BookingCommentsTab } from "../shared/BookingCommentsTab";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import { apiFetch } from "../../utils/api";
import { toast } from "../ui/toast-utils";
import { EditableSectionCard, useSectionEdit } from "../shared/EditableSectionCard";
import { EditableField } from "../shared/EditableField";

interface OthersBookingDetailsProps {
  booking: OthersBooking;
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
  serviceDescription: "Service Description",
  deliveryAddress: "Delivery Address",
  specialRequirements: "Special Requirements",
  requestedDate: "Requested Date",
  completionDate: "Completion Date",
  notes: "Notes",
};

function diffAndApply(
  original: OthersBooking,
  draft: OthersBooking,
  fields: string[],
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void,
  setEditedBooking: (fn: (prev: OthersBooking) => OthersBooking) => void,
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
    setEditedBooking((prev: OthersBooking) => ({ ...prev, ...updates }));
    onBookingUpdated();
    toast.success("Changes saved");
  }
}

function LockedField({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-base)", marginBottom: "8px" }}>
        {label}
        <Lock size={12} color="#9CA3AF" title={tooltip} style={{ cursor: "help" }} />
      </label>
      <div style={{ padding: "10px 14px", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "14px", color: "#6B7280", cursor: "not-allowed" }}>
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
              <div style={{ backgroundColor: "white", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", padding: "12px 16px" }}>
                <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>{activity.timestamp.toLocaleString()}</div>
                {activity.action === "field_updated" && (
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--neuron-ink-base)", marginBottom: "4px" }}><span style={{ fontWeight: 600 }}>{activity.fieldName}</span> updated</div>
                    {activity.oldValue && activity.newValue && (
                      <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                        <span style={{ padding: "2px 8px", backgroundColor: "#FEE2E2", borderRadius: "4px", textDecoration: "line-through", color: "#EF4444" }}>{activity.oldValue}</span>
                        <ChevronRight size={12} />
                        <span style={{ padding: "2px 8px", backgroundColor: "#D1FAE5", borderRadius: "4px", color: "#10B981" }}>{activity.newValue}</span>
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

export function OthersBookingDetails({ booking, onBack, onUpdate, currentUser, initialTab, highlightId }: OthersBookingDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>(
    (initialTab as DetailTab) || "booking-info"
  );
  const [showTimeline, setShowTimeline] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(initialActivityLog);
  const [editedBooking, setEditedBooking] = useState<OthersBooking>(booking);

  const addActivity = (fieldName: string, oldValue: string, newValue: string) => {
    setActivityLog(prev => [{ id: `activity-${Date.now()}-${Math.random()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "field_updated", fieldName, oldValue, newValue }, ...prev]);
  };

  const handleStatusUpdate = async (newStatus: ExecutionStatus) => {
    const oldStatus = editedBooking.status;
    if (oldStatus === newStatus) return;
    setEditedBooking(prev => ({ ...prev, status: newStatus }));
    setActivityLog(prev => [{ id: `activity-${Date.now()}`, timestamp: new Date(), user: currentUser?.name || "Current User", action: "status_changed", statusFrom: oldStatus, statusTo: newStatus }, ...prev]);
    try {
      const response = await apiFetch(`/others-bookings/${booking.bookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error('Failed to update status');
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

  const tabStyle = (tab: DetailTab) => ({
    padding: "0 4px", fontSize: "14px", fontWeight: 500,
    color: activeTab === tab ? "#0F766E" : "var(--neuron-ink-muted)",
    background: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
    borderBottom: activeTab === tab ? "2px solid #0F766E" : "2px solid transparent",
    cursor: "pointer" as const, transition: "all 0.2s", height: "100%"
  });

  return (
    <div style={{ backgroundColor: "white", display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "20px 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--neuron-ink-secondary)", cursor: "pointer", fontSize: "13px", marginBottom: "12px", padding: "0" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-brand-green)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neuron-ink-secondary)"; }}>
            <ArrowLeft size={16} /> Back to Others Bookings
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>{booking.customerName}</h1>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>{booking.bookingId}</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <StatusSelector status={editedBooking.status} onUpdateStatus={handleStatusUpdate} />
        </div>
      </div>

      <div style={{ padding: "0 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "white", display: "flex", justifyContent: "space-between", alignItems: "center", height: "56px" }}>
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
          <button style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", backgroundColor: "white", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer" }}>
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: showTimeline ? "0 0 65%" : "1", overflow: "auto", transition: "flex 0.3s ease" }}>
          {activeTab === "booking-info" && <BookingInformationTab booking={editedBooking} onBookingUpdated={onUpdate} addActivity={addActivity} setEditedBooking={setEditedBooking} />}
          {activeTab === "billings" && <div className="flex flex-col bg-white p-12 min-h-[600px]"><UnifiedBillingsTab items={bookingBillingItems} projectId={booking.projectNumber || ""} bookingId={booking.bookingId} onRefresh={financials.refresh} isLoading={financials.isLoading} extraActions={<BookingRateCardButton booking={booking} serviceType="Others" existingBillingItems={bookingBillingItems} onRefresh={financials.refresh} />} /></div>}
          {activeTab === "expenses" && <ExpensesTab bookingId={booking.bookingId} bookingType="others" currentUser={currentUser} highlightId={activeTab === "expenses" ? highlightId : undefined} />}
          {activeTab === "comments" && <BookingCommentsTab bookingId={booking.bookingId} currentUserId={currentUser?.email || "unknown"} currentUserName={currentUser?.name || "Unknown User"} currentUserDepartment={currentUser?.department || "Operations"} />}
        </div>
        {showTimeline && <div style={{ flex: "0 0 35%", borderLeft: "1px solid var(--neuron-ui-border)", backgroundColor: "#FAFBFC", overflow: "auto" }}><ActivityTimeline activities={activityLog} /></div>}
      </div>
    </div>
  );
}

function BookingInformationTab({ booking, onBookingUpdated, addActivity, setEditedBooking }: {
  booking: OthersBooking; onBookingUpdated: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void; setEditedBooking: any;
}) {
  const generalSection = useSectionEdit(booking);
  const serviceSection = useSectionEdit(booking);
  const notesSection = useSectionEdit(booking);

  const GENERAL_FIELDS = ["accountHandler"];
  const SERVICE_FIELDS = ["serviceDescription", "deliveryAddress", "specialRequirements", "requestedDate", "completionDate"];
  const NOTES_FIELDS = ["notes"];

  const gMode = generalSection.isEditing ? "edit" : "view";
  const sMode = serviceSection.isEditing ? "edit" : "view";
  const nMode = notesSection.isEditing ? "edit" : "view";

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
            <LockedField label="Quotation Reference" value={booking.quotationReferenceNumber || ""} />
          </div>
        </div>
      </EditableSectionCard>

      {/* ── Service Details ── */}
      <EditableSectionCard
        title="Service Details"
        isEditing={serviceSection.isEditing}
        onEdit={serviceSection.startEditing}
        onCancel={serviceSection.cancel}
        onSave={() => { const draft = serviceSection.save(); diffAndApply(booking, draft, SERVICE_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <EditableField label="Service Description" value={serviceSection.draft.serviceDescription || ""} type="textarea" mode={sMode} placeholder="Describe the service being provided..." onChange={(v) => serviceSection.updateField("serviceDescription", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField label="Delivery Address" value={serviceSection.draft.deliveryAddress || ""} type="textarea" mode={sMode} placeholder="Enter delivery address..." onChange={(v) => serviceSection.updateField("deliveryAddress", v)} />
            <EditableField label="Special Requirements" value={serviceSection.draft.specialRequirements || ""} type="textarea" mode={sMode} placeholder="Enter any special requirements..." onChange={(v) => serviceSection.updateField("specialRequirements", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField label="Requested Date" value={serviceSection.draft.requestedDate || ""} type="date" mode={sMode} onChange={(v) => serviceSection.updateField("requestedDate", v)} />
            <EditableField label="Completion Date" value={serviceSection.draft.completionDate || ""} type="date" mode={sMode} onChange={(v) => serviceSection.updateField("completionDate", v)} />
          </div>
        </div>
      </EditableSectionCard>

      {/* ── Additional Notes ── */}
      {booking.notes && (
        <EditableSectionCard
          title="Additional Notes"
          isEditing={notesSection.isEditing}
          onEdit={notesSection.startEditing}
          onCancel={notesSection.cancel}
          onSave={() => { const draft = notesSection.save(); diffAndApply(booking, draft, NOTES_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
        >
          <EditableField label="Notes" value={notesSection.draft.notes || ""} type="textarea" mode={nMode} placeholder="Enter additional notes..." onChange={(v) => notesSection.updateField("notes", v)} />
        </EditableSectionCard>
      )}
    </div>
  );
}