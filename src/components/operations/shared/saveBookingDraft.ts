import { supabase } from "../../../utils/supabase/client";
import { buildBookingPayload, toSupabaseRow } from "../../../utils/bookings/bookingPayload";
import { getSelectedCustomer } from "../../../utils/bookings/selectedCustomer";
import { logCreation } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";

export interface SaveBookingDraftOptions {
  bookingId?: string | null;
  currentUser?: { id?: string; name?: string; department?: string } | null;
  detectedContractId?: string | null;
  projectId?: string | null;
}

export interface SaveBookingDraftResult {
  id: string;
  isNew: boolean;
}

/**
 * Persists a booking with status='Draft' without running form validation
 * and without allocating a booking_number. Used by the Save-as-Draft button
 * on all Create*BookingPanel screens.
 *
 * Returns the row id so the caller can promote subsequent submits to UPDATE.
 * Throws on a failed write; returns null when the minimum guard fails (caller
 * has already been toasted).
 */
export async function saveBookingDraft(
  formState: Record<string, unknown>,
  serviceType: string,
  options: SaveBookingDraftOptions = {},
): Promise<SaveBookingDraftResult | null> {
  const { bookingId, currentUser, detectedContractId, projectId } = options;

  const selectedCustomer = getSelectedCustomer(formState);
  if (!selectedCustomer.customerName && !selectedCustomer.customerId) {
    toast.error("Select a customer to save draft");
    return null;
  }

  const { topLevel, details } = buildBookingPayload(formState, serviceType);

  // Strip booking_number so we don't burn a sequence number on a draft. The
  // form state may carry a *preview* value, which is non-allocating, but we
  // still don't want it persisted until the booking is actually submitted.
  if ("booking_number" in topLevel) delete topLevel.booking_number;

  const baseRow = toSupabaseRow(
    {
      ...topLevel,
      status: "Draft",
      service_type: serviceType,
      ...(detectedContractId ? { contract_id: detectedContractId } : {}),
      ...(projectId ? { project_id: projectId } : {}),
    },
    details,
  );

  if (bookingId) {
    const { error } = await supabase
      .from("bookings")
      .update(baseRow)
      .eq("id", bookingId);
    if (error) throw new Error(error.message);
    return { id: bookingId, isNew: false };
  }

  const newId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("bookings")
    .insert({ id: newId, ...baseRow })
    .select()
    .single();
  if (error) throw new Error(error.message);

  logCreation(
    "booking",
    data.id,
    `Draft ${serviceType} booking`,
    {
      id: currentUser?.id ?? "",
      name: currentUser?.name ?? "",
      department: currentUser?.department ?? "",
    },
  );

  return { id: data.id, isNew: true };
}
