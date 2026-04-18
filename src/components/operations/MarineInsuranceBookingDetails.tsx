import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Lock, Clock, ChevronRight } from "lucide-react";
import { ExpensesTab } from "./shared/ExpensesTab";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import { EditableSectionCard, useSectionEdit } from "../shared/EditableSectionCard";
import { EditableField } from "../shared/EditableField";
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
import { BookingTeamSection } from "./shared/BookingTeamSection";
import { useUser } from "../../hooks/useUser";
import { usePermission } from "../../context/PermissionProvider";
import { fireBillingTicketOnCompletion } from "../../utils/workflowTickets";
import { logStatusChange } from "../../utils/activityLog";


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

const FIELD_LABELS: Record<string, string> = {
  accountHandler: "Account Handler",
  policyNumber: "Policy Number",
  insuranceCompany: "Insurance Company",
  coverageType: "Coverage Type",
  insuredValue: "Insured Value",
  currency: "Currency",
  effectiveDate: "Effective Date",
  expiryDate: "Expiry Date",
  commodityDescription: "Commodity Description",
  hsCode: "HS Code",
  invoiceNumber: "Invoice Number",
  invoiceValue: "Invoice Value",
  packagingType: "Packaging Type",
  numberOfPackages: "Number of Packages",
  grossWeight: "Gross Weight",
  aol: "AOL",
  pol: "POL",
  mode: "Mode",
  aod: "AOD",
  pod: "POD",
  vesselVoyage: "Vessel/Voyage",
  specialConditions: "Special Conditions",
  remarks: "Remarks",
  assigned_manager_name: "Assigned Manager",
  assigned_supervisor_name: "Assigned Supervisor",
  assigned_handler_name: "Assigned Handler",
};

async function diffAndApply(
  original: MarineInsuranceBooking,
  draft: MarineInsuranceBooking,
  fields: string[],
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void,
  setEditedBooking: (fn: (prev: MarineInsuranceBooking) => MarineInsuranceBooking) => void,
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
      .eq('id', original.bookingId || (original as any).id);
    if (error) {
      toast.error("Failed to save changes");
      return;
    }
    setEditedBooking((prev: MarineInsuranceBooking) => ({ ...prev, ...updates }));
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
      <div style={{ padding: "20px 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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

      <div style={{ padding: "0 48px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", display: "flex", justifyContent: "space-between", alignItems: "center", height: "56px" }}>
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


      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: showTimeline ? "0 0 65%" : "1", overflow: "auto", transition: "flex 0.3s ease" }}>
          {activeTab === "booking-info" && <BookingInformationTab booking={editedBooking} onBookingUpdated={onUpdate} addActivity={addActivity} setEditedBooking={setEditedBooking} currentUser={currentUser} />}
          {activeTab === "billings" && canViewBillings && <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]"><UnifiedBillingsTab items={bookingBillingItems} projectId={booking.projectNumber || ""} bookingId={booking.bookingId} onRefresh={financials.refresh} isLoading={financials.isLoading} pendingBillableCount={pendingBillableCount} extraActions={<BookingRateCardButton booking={booking} serviceType="Marine Insurance" existingBillingItems={bookingBillingItems} onRefresh={financials.refresh} />} /></div>}
          {activeTab === "expenses" && <ExpensesTab bookingId={booking.bookingId} bookingNumber={(booking as any).booking_number || booking.bookingId} bookingType="marine-insurance" currentUser={currentUser} highlightId={activeTab === "expenses" ? highlightId : undefined} existingBillingItems={bookingBillingItems} onPendingCountChange={setPendingBillableCount} />}
          {activeTab === "comments" && <BookingCommentsTab bookingId={booking.bookingId} />}
        </div>
        {showTimeline && <div style={{ flex: "0 0 35%", borderLeft: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-pill-inactive-bg)", overflow: "auto" }}><ActivityTimeline activities={activityLog} /></div>}
      </div>
    </div>
  );
}

function BookingInformationTab({ booking, onBookingUpdated, addActivity, setEditedBooking, currentUser }: {
  booking: MarineInsuranceBooking; onBookingUpdated: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void; setEditedBooking: any;
  currentUser?: { name: string; email: string; department: string } | null;
}) {
  const generalSection = useSectionEdit(booking);
  const policySection = useSectionEdit(booking);
  const shipmentSection = useSectionEdit(booking);
  const routeSection = useSectionEdit(booking);
  const additionalSection = useSectionEdit(booking);

  const GENERAL_FIELDS = ["accountHandler"];
  const POLICY_FIELDS = ["policyNumber", "insuranceCompany", "coverageType", "insuredValue", "currency", "effectiveDate", "expiryDate"];
  const SHIPMENT_FIELDS = ["commodityDescription", "hsCode", "invoiceNumber", "invoiceValue", "packagingType", "numberOfPackages", "grossWeight"];
  const ROUTE_FIELDS = ["aol", "pol", "mode", "aod", "pod", "vesselVoyage"];
  const ADDITIONAL_FIELDS = ["specialConditions", "remarks"];

  const gMode = generalSection.isEditing ? "edit" : "view";
  const pMode = policySection.isEditing ? "edit" : "view";
  const sMode = shipmentSection.isEditing ? "edit" : "view";
  const rMode = routeSection.isEditing ? "edit" : "view";
  const aMode = additionalSection.isEditing ? "edit" : "view";

  return (
    <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto" }}>

      {/* ── Team Assignment ── */}
      <BookingTeamSection
        bookingId={(booking as any).id || booking.bookingId}
        bookingNumber={(booking as any).booking_number || booking.bookingId}
        serviceType="Marine Insurance"
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

      {/* ── Policy Information ── */}
      <EditableSectionCard
        title="Policy Information"
        isEditing={policySection.isEditing}
        onEdit={policySection.startEditing}
        onCancel={policySection.cancel}
        onSave={() => { const draft = policySection.save(); diffAndApply(booking, draft, POLICY_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="Policy Number" value={policySection.draft.policyNumber || ""} mode={pMode} placeholder="Enter policy number..." onChange={(v) => policySection.updateField("policyNumber", v)} />
            <EditableField label="Insurance Company" value={policySection.draft.insuranceCompany || ""} mode={pMode} placeholder="Enter insurer..." onChange={(v) => policySection.updateField("insuranceCompany", v)} />
            <EditableField label="Coverage Type" value={policySection.draft.coverageType || ""} mode={pMode} placeholder="Enter coverage type..." onChange={(v) => policySection.updateField("coverageType", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="Insured Value" value={policySection.draft.insuredValue || ""} mode={pMode} placeholder="Enter amount..." onChange={(v) => policySection.updateField("insuredValue", v)} />
            <EditableField label="Currency" value={policySection.draft.currency || ""} mode={pMode} placeholder="e.g., PHP, USD..." onChange={(v) => policySection.updateField("currency", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <EditableField label="Effective Date" value={policySection.draft.effectiveDate || ""} type="date" mode={pMode} onChange={(v) => policySection.updateField("effectiveDate", v)} />
            <EditableField label="Expiry Date" value={policySection.draft.expiryDate || ""} type="date" mode={pMode} onChange={(v) => policySection.updateField("expiryDate", v)} />
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
          <EditableField label="Commodity Description" value={shipmentSection.draft.commodityDescription || ""} type="textarea" mode={sMode} placeholder="Describe the goods..." onChange={(v) => shipmentSection.updateField("commodityDescription", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="HS Code" value={shipmentSection.draft.hsCode || ""} mode={sMode} placeholder="Enter HS code..." onChange={(v) => shipmentSection.updateField("hsCode", v)} />
            <EditableField label="Invoice Number" value={shipmentSection.draft.invoiceNumber || ""} mode={sMode} placeholder="Enter invoice number..." onChange={(v) => shipmentSection.updateField("invoiceNumber", v)} />
            <EditableField label="Invoice Value" value={shipmentSection.draft.invoiceValue || ""} mode={sMode} placeholder="Enter invoice value..." onChange={(v) => shipmentSection.updateField("invoiceValue", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="Packaging Type" value={shipmentSection.draft.packagingType || ""} mode={sMode} placeholder="e.g., Pallets, Cartons..." onChange={(v) => shipmentSection.updateField("packagingType", v)} />
            <EditableField label="Number of Packages" value={shipmentSection.draft.numberOfPackages || ""} mode={sMode} placeholder="Enter quantity..." onChange={(v) => shipmentSection.updateField("numberOfPackages", v)} />
            <EditableField label="Gross Weight" value={shipmentSection.draft.grossWeight || ""} mode={sMode} placeholder="Enter weight..." onChange={(v) => shipmentSection.updateField("grossWeight", v)} />
          </div>
        </div>
      </EditableSectionCard>

      {/* ── Route Information ── */}
      <EditableSectionCard
        title="Route Information"
        isEditing={routeSection.isEditing}
        onEdit={routeSection.startEditing}
        onCancel={routeSection.cancel}
        onSave={() => { const draft = routeSection.save(); diffAndApply(booking, draft, ROUTE_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="AOL (Airport of Loading)" value={routeSection.draft.aol || ""} mode={rMode} placeholder="Enter AOL..." onChange={(v) => routeSection.updateField("aol", v)} />
            <EditableField label="POL (Port of Loading)" value={routeSection.draft.pol || ""} mode={rMode} placeholder="Enter POL..." onChange={(v) => routeSection.updateField("pol", v)} />
            <EditableField label="Mode" value={routeSection.draft.mode || ""} mode={rMode} placeholder="e.g., FCL, AIR..." onChange={(v) => routeSection.updateField("mode", v)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <EditableField label="AOD (Airport of Discharge)" value={routeSection.draft.aod || ""} mode={rMode} placeholder="Enter AOD..." onChange={(v) => routeSection.updateField("aod", v)} />
            <EditableField label="POD (Port of Discharge)" value={routeSection.draft.pod || ""} mode={rMode} placeholder="Enter POD..." onChange={(v) => routeSection.updateField("pod", v)} />
            <EditableField label="Vessel/Voyage" value={routeSection.draft.vesselVoyage || ""} mode={rMode} placeholder="Enter vessel/voyage..." onChange={(v) => routeSection.updateField("vesselVoyage", v)} />
          </div>
        </div>
      </EditableSectionCard>

      {/* ── Additional Information ── */}
      {(booking.specialConditions || booking.remarks) && (
        <EditableSectionCard
          title="Additional Information"
          isEditing={additionalSection.isEditing}
          onEdit={additionalSection.startEditing}
          onCancel={additionalSection.cancel}
          onSave={() => { const draft = additionalSection.save(); diffAndApply(booking, draft, ADDITIONAL_FIELDS, addActivity, setEditedBooking, onBookingUpdated); }}
        >
          <div style={{ display: "grid", gap: "20px" }}>
            {booking.specialConditions && <EditableField label="Special Conditions" value={additionalSection.draft.specialConditions || ""} type="textarea" mode={aMode} placeholder="Enter special conditions..." onChange={(v) => additionalSection.updateField("specialConditions", v)} />}
            {booking.remarks && <EditableField label="Remarks" value={additionalSection.draft.remarks || ""} type="textarea" mode={aMode} placeholder="Enter remarks..." onChange={(v) => additionalSection.updateField("remarks", v)} />}
          </div>
        </EditableSectionCard>
      )}
    </div>
  );
}
