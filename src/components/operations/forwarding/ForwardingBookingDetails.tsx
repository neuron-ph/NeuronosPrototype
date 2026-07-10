import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Clock, ChevronRight, User } from "lucide-react";
import type { ForwardingBooking, ExecutionStatus } from "../../../types/operations";
import { UnifiedBillingsTab } from "../../shared/billings/UnifiedBillingsTab";
import { UnifiedInvoicesTab } from "../../shared/invoices/UnifiedInvoicesTab";
import { UnifiedCollectionsTab } from "../../shared/collections/UnifiedCollectionsTab";
import { ExpensesTab } from "../shared/ExpensesTab";
import { BookingFinancialsTab } from "../shared/BookingFinancialsTab";
import { filterCollectionsForScope } from "../../../utils/financialSelectors";
import { BookingCommentsTab } from "../../shared/BookingCommentsTab";
import { BookingChronologicalTab } from "../../shared/BookingChronologicalTab";
import { EntityAttachmentsTab } from "../../shared/EntityAttachmentsTab";
import { useProjectFinancials } from "../../../hooks/useProjectFinancials";
import { StatusSelector } from "../../StatusSelector";
import { useConfidentialAction } from "../../../hooks/useConfidentialAction";

import { assessBookingFinancialState, canTransitionBookingToCancelled, getBookingCancellationStatusMessage } from "../../../utils/bookingCancellation";
import { BookingCancelDeletePanel } from "../shared/BookingCancelDeletePanel";
import { RequestBillingButton } from "../../common/RequestBillingButton";
import { loadBookingActivityLog, appendBookingActivity } from "../../../utils/bookingActivityLog";
import { BookingInfoTab } from "../shared/BookingInfoTab";
import { useUser } from "../../../hooks/useUser";
import { usePermission } from "../../../context/PermissionProvider";
import { fireBillingTicketOnCompletion } from "../../../utils/workflowTickets";
import { logStatusChange } from "../../../utils/activityLog";
import { notifyBookingStatusChange } from "../../../utils/notifyBookingStatusChange";
import { useMarkEntityReadOnMount } from "../../../hooks/useNotifications";

interface ForwardingBookingDetailsProps {
  booking: ForwardingBooking;
  onBack: () => void;
  onBookingUpdated: () => void;
  currentUser?: { name: string; email: string; department: string } | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

type DetailTab = "financials" | "booking-info" | "billings" | "invoices" | "collections" | "expenses" | "comments" | "chrono" | "attachments";


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
  const { can } = usePermission();
  // NEU-020 DD-1: per-service door keys
  const canViewFinancials = can("ops_forwarding_financials_tab", "view"); // Accounting-only per-booking financial dashboard
  const canViewInfo = can("ops_forwarding_info_tab", "view");
  const canViewBillings = can("ops_forwarding_billings_tab", "view");
  const canViewInvoices = can("ops_forwarding_invoices_tab", "view");
  const canViewCollections = can("ops_forwarding_collections_tab", "view");
  const canViewExpenses = can("ops_forwarding_expenses_tab", "view");
  const canViewChrono = can("ops_forwarding_chrono_tab", "view");
  const canViewCommentsTab = can("ops_forwarding_comments_tab", "view"); // NEU-019 WG-15
  const canViewAttachments = can("ops_forwarding_attachments_tab", "view");
  const canUploadAttachments = can("ops_forwarding_attachments_tab", "create");
  const canDeleteAttachments = can("ops_forwarding_attachments_tab", "delete");
  const canEditBooking = can("ops_forwarding", "edit");
  const canCancelDeleteBooking = canEditBooking || can("ops_forwarding", "delete");
  const firstViewableTab: DetailTab = canViewFinancials
    ? "financials"
    : canViewInfo
    ? "booking-info"
    : canViewBillings
      ? "billings"
      : canViewInvoices
        ? "invoices"
        : canViewCollections
          ? "collections"
          : canViewExpenses
            ? "expenses"
            : canViewCommentsTab
              ? "comments"
              : canViewAttachments
                ? "attachments"
                : "chrono";
  const [activeTab, setActiveTab] = useState<DetailTab>(
    (initialTab === "financials" && !canViewFinancials) || (initialTab === "booking-info" && !canViewInfo) || (initialTab === "billings" && !canViewBillings) || (initialTab === "invoices" && !canViewInvoices) || (initialTab === "collections" && !canViewCollections) || (initialTab === "expenses" && !canViewExpenses)
      ? firstViewableTab
      : (initialTab as DetailTab) || firstViewableTab
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

  useMarkEntityReadOnMount("booking", booking.id || booking.bookingId);

  // Local state to track edited booking values
  const [editedBooking, setEditedBooking] = useState<ForwardingBooking>(booking);
  useEffect(() => { setEditedBooking(booking); }, [booking]);
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
      void notifyBookingStatusChange({
        bookingId: booking.id || booking.bookingId,
        bookingNumber: (booking as any).booking_number ?? booking.bookingId,
        serviceType: "Forwarding",
        fromStatus: oldStatus,
        toStatus: newStatus,
        actorUserId: user?.id ?? null,
      });
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

  const bookingContainer = useMemo(() => ({
    id: booking.bookingId,
    project_number: booking.projectNumber || "",
    customer_id: (booking as any).customer_id || "",
    customer_name: booking.customerName || "",
    linkedBookings: [{ bookingId: booking.bookingId }],
  }), [booking.bookingId, booking.projectNumber, booking.customerName, (booking as any).customer_id]);

  const bookingInvoices = useMemo(() =>
    financials.invoices.filter((inv: any) =>
      inv.booking_id === booking.bookingId ||
      (Array.isArray(inv.booking_ids) && inv.booking_ids.includes(booking.bookingId))
    ), [financials.invoices, booking.bookingId]);

  const bookingFinancials = useMemo(() => ({
    ...financials,
    billingItems: bookingBillingItems,
    invoices: bookingInvoices,
  }), [financials, bookingBillingItems, bookingInvoices]);

  // Booking-scoped collections (by the booking's invoice ids) + expenses — for the Financials dashboard.
  const bookingCollections = useMemo(() =>
    filterCollectionsForScope(
      financials.collections,
      bookingInvoices.map((inv: any) => inv.id).filter(Boolean),
    ), [financials.collections, bookingInvoices]);
  const bookingExpenses = useMemo(() =>
    financials.expenses.filter((e: any) => e.booking_id === booking.bookingId),
    [financials.expenses, booking.bookingId]);

  const confidentialAction = useConfidentialAction({
    table: "bookings",
    recordId: booking.id || booking.bookingId,
    confidential: booking.confidential ?? false,
    onChanged: () => onBookingUpdated(),
  });
  const showBookingActionsMenu = canCancelDeleteBooking || confidentialAction.isExecutive;

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
        alignItems: "center",
        position: "relative",
        zIndex: 30
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
            {(booking as any).booking_number || "—"}
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
            serviceType="Forwarding"
            onUpdateStatus={handleStatusUpdate}
            readOnly={!canEditBooking}
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
        height: "56px",
        position: "relative",
        zIndex: 20
      }}>
        {/* Tabs - Left Side */}
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          {canViewFinancials && (
            <button
              onClick={() => setActiveTab("financials")}
              style={{
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === "financials" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: activeTab === "financials" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "financials") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "financials") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Financials
            </button>
          )}
          {canViewInfo && (
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
              onMouseEnter={(e) => {
                if (activeTab !== "booking-info") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "booking-info") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Booking Information
            </button>
          )}
          {canViewBillings && (
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
              onMouseEnter={(e) => {
                if (activeTab !== "billings") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "billings") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Billings
            </button>
          )}
          {canViewInvoices && (
            <button
              onClick={() => setActiveTab("invoices")}
              style={{
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === "invoices" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: activeTab === "invoices" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "invoices") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "invoices") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Invoices
            </button>
          )}
          {canViewCollections && (
            <button
              onClick={() => setActiveTab("collections")}
              style={{
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === "collections" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: activeTab === "collections" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "collections") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "collections") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Collections
            </button>
          )}
          {canViewExpenses && (
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
              onMouseEnter={(e) => {
                if (activeTab !== "expenses") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "expenses") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Expenses
            </button>
          )}
          {canViewCommentsTab && (
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
              onMouseEnter={(e) => {
                if (activeTab !== "comments") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "comments") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Comments
            </button>
          )}
          {canViewChrono && (
            <button
              onClick={() => setActiveTab("chrono")}
              style={{
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === "chrono" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: activeTab === "chrono" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "chrono") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "chrono") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Chrono
            </button>
          )}
          {canViewAttachments && (
            <button
              onClick={() => setActiveTab("attachments")}
              style={{
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === "attachments" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: activeTab === "attachments" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "attachments") e.currentTarget.style.color = "var(--neuron-ink-secondary)";
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "attachments") e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Attachments
            </button>
          )}
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
          {showBookingActionsMenu && <div style={{ position: "relative" }} ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer" }}
            >
              <MoreVertical size={18} />
            </button>
            {showMoreMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", width: "200px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--theme-border-default)", borderRadius: "8px", boxShadow: "var(--elevation-2)", zIndex: 100, overflow: "hidden" }}>
                {canCancelDeleteBooking && (
                  <button
                    onClick={() => { setShowMoreMenu(false); setShowCancelDeletePanel(true); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", backgroundColor: "transparent", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-state-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    Cancel / Delete Booking
                  </button>
                )}
                {confidentialAction.isExecutive && (
                  <button
                    onClick={() => { setShowMoreMenu(false); confidentialAction.openDialog(); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", backgroundColor: "transparent", border: "none", borderTop: canCancelDeleteBooking ? "1px solid var(--theme-border-default)" : "none", cursor: "pointer", fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-state-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <confidentialAction.Icon size={15} />
                    {confidentialAction.label}
                  </button>
                )}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* Confidential — exec-only, full-width block below the header (self-hides for non-execs) */}
      {confidentialAction.dialog}

      <BookingCancelDeletePanel
        isOpen={showCancelDeletePanel}
        onClose={() => setShowCancelDeletePanel(false)}
        bookingId={booking.bookingId}
        bookingLabel={(booking as any).name || (booking as any).booking_number || "Unnamed Booking"}
        currentStatus={editedBooking.status}
        currentUser={currentUser}
        allowCancel={canEditBooking} // NEU-019 WG-21
        allowDelete={can("ops_forwarding", "delete")} // NEU-019 WG-21
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
        display: "flex",
        position: "relative",
        zIndex: 0
      }}>
        {/* Main Content */}
        <div style={{ 
          flex: showTimeline ? "0 0 65%" : "1",
          overflow: "auto",
          transition: "flex 0.3s ease"
        }}>
          {activeTab === "financials" && canViewFinancials && (
            <BookingFinancialsTab
              billingItems={bookingBillingItems}
              invoices={bookingInvoices}
              collections={bookingCollections}
              expenses={bookingExpenses}
              isLoading={financials.isLoading}
              onNavigateTab={setActiveTab}
            />
          )}
          {activeTab === "booking-info" && canViewInfo && (
            <BookingInfoTab
              permissionDoor="ops_forwarding_info_tab"
              booking={editedBooking as Record<string, unknown>}
              serviceType="Forwarding"
              bookingId={String((editedBooking as any).id || booking.bookingId)}
              onUpdate={onBookingUpdated}
              currentUser={currentUser}
            />
          )}
          {activeTab === "billings" && canViewBillings && (
            <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
              <UnifiedBillingsTab
                items={bookingBillingItems}
                projectId={booking.projectNumber || ""}
                bookingId={booking.bookingId}
                onRefresh={financials.refresh}
                isLoading={financials.isLoading}
                pendingBillableCount={pendingBillableCount}
                permissionDoor="ops_forwarding_billings_tab"
              />
            </div>
          )}
          {activeTab === "invoices" && canViewInvoices && (
            <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
              <UnifiedInvoicesTab
                financials={bookingFinancials}
                project={bookingContainer}
                currentUser={currentUser ? { ...currentUser, id: user?.id || "" } : null}
                onRefresh={financials.refresh}
                highlightId={activeTab === "invoices" ? highlightId : undefined}
                permissionDoor="ops_forwarding_invoices_tab"
              />
            </div>
          )}
          {activeTab === "collections" && canViewCollections && (
            <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
              <UnifiedCollectionsTab
                financials={bookingFinancials}
                project={bookingContainer}
                currentUser={currentUser ? { ...currentUser, id: user?.id || "" } : null}
                onRefresh={financials.refresh}
                highlightId={activeTab === "collections" ? highlightId : undefined}
                permissionDoor="ops_forwarding_collections_tab"
              />
            </div>
          )}
          {activeTab === "expenses" && canViewExpenses && (
            <ExpensesTab
              bookingId={booking.bookingId}
              bookingNumber={(booking as any).booking_number || booking.bookingId}
              bookingType="forwarding"
              currentUser={currentUser}
              highlightId={activeTab === "expenses" ? highlightId : undefined}
              existingBillingItems={bookingBillingItems}
              onPendingCountChange={setPendingBillableCount}
              permissionDoor="ops_forwarding_expenses_tab"
            />
          )}
          {activeTab === "comments" && canViewCommentsTab && (
            <BookingCommentsTab bookingId={booking.bookingId} permissionDoor="ops_forwarding_comments_tab" />
          )}
          {activeTab === "chrono" && canViewChrono && (
            <BookingChronologicalTab bookingId={booking.bookingId} permissionDoor="ops_forwarding_chrono_tab" />
          )}
          {activeTab === "attachments" && canViewAttachments && (
            <EntityAttachmentsTab
              entityId={booking.bookingId}
              entityType="bookings"
              currentUser={user ? { id: user.id, name: user.name || "", email: user.email || "", department: user.department || "" } : null}
              canUpload={canUploadAttachments}
              canDelete={canDeleteAttachments}
            />
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
                border: "3px solid var(--theme-bg-surface)"
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


