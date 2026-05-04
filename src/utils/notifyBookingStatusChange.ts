/**
 * Emits a "booking status changed" notification to everyone currently
 * assigned to the booking. Best-effort — never throws.
 */
import { supabase } from "./supabase/client";
import { recordNotificationEvent, operationsSubSectionFor } from "./notifications";

export async function notifyBookingStatusChange(params: {
  bookingId: string;
  bookingNumber?: string | null;
  serviceType?: string | null;
  fromStatus: string;
  toStatus: string;
  actorUserId: string | null;
}): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("booking_assignments")
      .select("user_id")
      .eq("booking_id", params.bookingId);
    if (error) {
      console.warn("[notifications] booking assignees fetch failed", error.message);
      return;
    }
    const recipientIds = (data || []).map((r: { user_id: string }) => r.user_id);
    if (recipientIds.length === 0) return;

    void recordNotificationEvent({
      actorUserId: params.actorUserId,
      module: "operations",
      subSection: operationsSubSectionFor(params.serviceType),
      entityType: "booking",
      entityId: params.bookingId,
      kind: "status_changed",
      summary: {
        label: `Booking ${params.bookingNumber || params.bookingId} → ${params.toStatus}`,
        reference: params.bookingNumber || undefined,
        from_status: params.fromStatus,
        to_status: params.toStatus,
      },
      recipientIds,
    });
  } catch (e) {
    console.warn("[notifications] notifyBookingStatusChange failed", e);
  }
}
