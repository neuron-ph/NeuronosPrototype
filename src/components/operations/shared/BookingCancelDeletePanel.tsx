import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import {
  assessBookingFinancialState,
  canHardDeleteBooking,
  canTransitionBookingToCancelled,
  CANCELLABLE_STATUSES,
  DELETABLE_STATUS,
  type BookingFinancialState,
} from "../../../utils/bookingCancellation";
import { logStatusChange, logDeletion } from "../../../utils/activityLog";
import { appendBookingActivity } from "../../../utils/bookingActivityLog";
import type { ExecutionStatus } from "../../../types/operations";

// Z-index must exceed SidePanel's zIndexBase + 10 (default: 1110)
const MODAL_Z = 1200;

interface BookingCancelDeletePanelProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  bookingLabel: string;
  currentStatus: ExecutionStatus;
  currentUser?: { id?: string; name: string; email: string; department: string } | null;
  onSuccess: (action: "cancelled" | "deleted") => void;
}

export function BookingCancelDeletePanel({
  isOpen,
  onClose,
  bookingId,
  bookingLabel,
  currentStatus,
  currentUser,
  onSuccess,
}: BookingCancelDeletePanelProps) {
  const [isAssessing, setIsAssessing] = useState(false);
  const [financialState, setFinancialState] = useState<BookingFinancialState | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const statusAllowsCancel = CANCELLABLE_STATUSES.includes(currentStatus);
  const statusAllowsDelete = currentStatus === DELETABLE_STATUS;

  useEffect(() => {
    if (!isOpen) {
      setFinancialState(null);
      return;
    }
    if (!statusAllowsCancel && !statusAllowsDelete) return;

    setIsAssessing(true);
    assessBookingFinancialState(bookingId)
      .then(setFinancialState)
      .catch(() => setFinancialState(null))
      .finally(() => setIsAssessing(false));
  }, [isOpen, bookingId, currentStatus]);

  const actor = {
    id: currentUser?.id ?? "",
    name: currentUser?.name ?? "Unknown",
    department: currentUser?.department ?? "",
  };

  const canCancel = !!financialState && canTransitionBookingToCancelled(currentStatus, financialState);
  const canDelete = !!financialState && canHardDeleteBooking(currentStatus, financialState);
  const isBusy = isCancelling || isDeleting || isAssessing;

  const handleCancel = async () => {
    if (!canCancel) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "Cancelled", updated_at: new Date().toISOString() })
        .eq("id", bookingId);
      if (error) throw error;

      logStatusChange("booking", bookingId, bookingLabel, currentStatus, "Cancelled", actor);
      appendBookingActivity(
        bookingId,
        { action: "status_changed", statusFrom: currentStatus, statusTo: "Cancelled", user: actor.name },
        { name: actor.name, department: actor.department }
      );

      toast.success("Booking cancelled.");
      onSuccess("cancelled");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to cancel booking.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;

      logDeletion("booking", bookingId, bookingLabel, actor);
      toast.success("Booking deleted.");
      onSuccess("deleted");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete booking.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Derive body copy based on state
  const isBlocked = !!financialState?.hasFinancialRecords;
  const noActionsAllowed = !statusAllowsCancel && !statusAllowsDelete;

  let bodyCopy: string;
  if (isAssessing) {
    bodyCopy = "Checking financial records…";
  } else if (noActionsAllowed) {
    bodyCopy = `"${bookingLabel}" is ${currentStatus.toLowerCase()} and cannot be cancelled or deleted.`;
  } else if (isBlocked) {
    bodyCopy = `"${bookingLabel}" has financial records attached and cannot be cancelled or deleted.`;
  } else if (canDelete) {
    bodyCopy = `"${bookingLabel}" has no financial records. You can cancel it or permanently delete it.`;
  } else {
    bodyCopy = `"${bookingLabel}" has no financial records. You can cancel this booking.`;
  }

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--theme-overlay-backdrop)",
          zIndex: MODAL_Z,
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: MODAL_Z + 1,
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "10px",
          padding: "24px",
          boxShadow: "var(--elevation-3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--theme-text-primary)", margin: "0 0 8px" }}>
          Cancel or Delete Booking
        </p>

        {/* Body copy */}
        <p style={{ fontSize: "13px", color: "var(--theme-text-secondary)", margin: "0 0 20px", lineHeight: 1.55 }}>
          {isAssessing
            ? <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <Loader2 size={13} className="animate-spin" style={{ color: "var(--theme-text-muted)" }} />
                {bodyCopy}
              </span>
            : bodyCopy
          }
        </p>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={onClose}
            disabled={isBusy}
            style={{
              padding: "7px 14px",
              borderRadius: "6px",
              border: "1px solid var(--theme-border-default)",
              backgroundColor: "transparent",
              color: "var(--theme-text-secondary)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: isBusy ? "not-allowed" : "pointer",
              opacity: isBusy ? 0.5 : 1,
            }}
          >
            Keep Booking
          </button>

          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={isBusy}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "6px",
                border: "1px solid var(--theme-status-warning-border)",
                backgroundColor: "var(--theme-status-warning-bg)",
                color: "var(--theme-status-warning-fg)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              {isCancelling && <Loader2 size={13} className="animate-spin" />}
              {isCancelling ? "Cancelling…" : "Cancel Booking"}
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isBusy}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "var(--theme-status-danger-fg)",
                color: "var(--theme-action-primary-text)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
