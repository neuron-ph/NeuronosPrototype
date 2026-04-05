import { supabase } from "./supabase/client";
import { NON_APPLIED_COLLECTION_STATUSES } from "./collectionResolution";
import { isInvoiceFinanciallyActive } from "./invoiceReversal";
import { logActivity, type ActivityActor } from "./activityLog";

export type BookingCancellationAction =
  | "safe-delete"
  | "cancel-and-void-unbilled"
  | "cancel-preserve-costs"
  | "reversal-required"
  | "credit-review-required";

export interface BookingFinancialState {
  bookingId: string;
  unbilledChargeCount: number;
  billedChargeCount: number;
  expenseCount: number;
  invoiceCount: number;
  collectionCount: number;
  recommendedAction: BookingCancellationAction;
}

export interface VoidBookingChargesResult {
  billingLineItemsVoided: number;
  evoucherBillingsVoided: number;
}

const BILLING_FINAL_STATUSES = new Set(["invoiced", "paid"]);
const EXPENSE_IGNORED_STATUSES = new Set(["cancelled", "rejected", "voided", "void"]);
const hasBookingArrayMatch = (value: unknown, bookingId: string): boolean => (
  Array.isArray(value) &&
  value.some((entry) => typeof entry === "string" && entry.trim() === bookingId)
);

export async function assessBookingFinancialState(bookingId: string): Promise<BookingFinancialState> {
  const [
    { data: billingRows, error: billingError },
    { data: evoucherRows, error: evoucherError },
    { data: invoiceRows, error: invoiceError },
    { data: collectionRows, error: collectionError },
    { data: expenseRows, error: expenseError },
  ] = await Promise.all([
    supabase
      .from("billing_line_items")
      .select("id,status,invoice_id,booking_id")
      .eq("booking_id", bookingId),
    supabase
      .from("evouchers")
      .select("id,status,transaction_type,invoice_id,booking_id")
      .eq("booking_id", bookingId),
    supabase
      .from("invoices")
      .select("id,status,payment_status,metadata,booking_id,booking_ids"),
    supabase
      .from("collections")
      .select("id,invoice_id,linked_billings,status"),
    supabase
      .from("expenses")
      .select("id,status,booking_id")
      .eq("booking_id", bookingId),
  ]);

  if (billingError) throw billingError;
  if (evoucherError) throw evoucherError;
  if (invoiceError) throw invoiceError;
  if (collectionError) throw collectionError;
  if (expenseError) throw expenseError;

  const bookingBillings = (billingRows || []).map((row: any) => ({
    status: String(row.status || "").toLowerCase(),
    invoiceId: row.invoice_id || null,
  }));

  const bookingEvouchers = (evoucherRows || []).filter((row: any) => row.booking_id === bookingId);
  const bookingBillingEvouchers = bookingEvouchers
    .filter((row: any) => String(row.transaction_type || "").toLowerCase() === "billing")
    .map((row: any) => ({
      status: String(row.status || "").toLowerCase(),
      invoiceId: row.invoice_id || null,
    }));

  const allChargeRows = [...bookingBillings, ...bookingBillingEvouchers];

  const bookingExpensesFromEvouchers = bookingEvouchers.filter((row: any) => {
    const transactionType = String(row.transaction_type || "").toLowerCase();
    const status = String(row.status || "").toLowerCase();
    if (!["expense", "budget_request"].includes(transactionType)) return false;
    return !EXPENSE_IGNORED_STATUSES.has(status);
  });

  const bookingExpensesFromLegacyTable = (expenseRows || []).filter((row: any) => {
    const status = String(row.status || "").toLowerCase();
    return !EXPENSE_IGNORED_STATUSES.has(status);
  });

  const expenseCount = bookingExpensesFromEvouchers.length + bookingExpensesFromLegacyTable.length;

  const linkedInvoices = (invoiceRows || []).filter((row: any) => (
    row.booking_id === bookingId || hasBookingArrayMatch(row.booking_ids, bookingId)
  ));
  const activeLinkedInvoices = linkedInvoices.filter((row: any) => isInvoiceFinanciallyActive(row));
  const activeInvoiceIds = new Set(activeLinkedInvoices.map((row: any) => row.id).filter(Boolean));
  const inactiveInvoiceIds = new Set(
    linkedInvoices
      .filter((row: any) => !isInvoiceFinanciallyActive(row))
      .map((row: any) => row.id)
      .filter(Boolean),
  );
  const invoiceCount = activeInvoiceIds.size;

  const unbilledChargeCount = allChargeRows.filter((row) => !BILLING_FINAL_STATUSES.has(row.status) && !row.invoiceId).length;
  const billedChargeCount = allChargeRows.filter((row) => {
    if (!BILLING_FINAL_STATUSES.has(row.status) && !row.invoiceId) return false;
    if (!row.invoiceId) return true;
    if (activeInvoiceIds.has(row.invoiceId)) return true;
    if (inactiveInvoiceIds.has(row.invoiceId)) return false;
    return true;
  }).length;

  const collectionCount = (collectionRows || []).filter((row: any) => {
    const status = String(row.status || "").toLowerCase();
    if (NON_APPLIED_COLLECTION_STATUSES.has(status)) return false;

    if (row.invoice_id && activeInvoiceIds.has(row.invoice_id)) return true;

    const linkedBillings = Array.isArray(row.linked_billings) ? row.linked_billings : [];
    return linkedBillings.some((entry: any) => {
      const invoiceId = entry?.id || entry?.invoice_id || entry?.invoiceId;
      return typeof invoiceId === "string" && activeInvoiceIds.has(invoiceId);
    });
  }).length;

  let recommendedAction: BookingCancellationAction = "safe-delete";
  if (collectionCount > 0) {
    recommendedAction = "credit-review-required";
  } else if (invoiceCount > 0 || billedChargeCount > 0) {
    recommendedAction = "reversal-required";
  } else if (expenseCount > 0) {
    recommendedAction = "cancel-preserve-costs";
  } else if (unbilledChargeCount > 0) {
    recommendedAction = "cancel-and-void-unbilled";
  }

  return {
    bookingId,
    unbilledChargeCount,
    billedChargeCount,
    expenseCount,
    invoiceCount,
    collectionCount,
    recommendedAction,
  };
}

export const canHardDeleteBooking = (state: BookingFinancialState): boolean => (
  state.recommendedAction === "safe-delete"
);

export const getBookingCancellationMessage = (state: BookingFinancialState): string => {
  switch (state.recommendedAction) {
    case "cancel-and-void-unbilled":
      return `Booking ${state.bookingId} has ${state.unbilledChargeCount} unbilled charge line(s). Cancel the booking and void those lines instead of deleting it.`;
    case "cancel-preserve-costs":
      return `Booking ${state.bookingId} has recorded cost entries. Cancel it and preserve the costs; do not hard-delete the booking.`;
    case "reversal-required":
      return `Booking ${state.bookingId} already has billed or invoiced financial history. Use a cancellation with reversal or credit handling instead of deletion.`;
    case "credit-review-required":
      return `Booking ${state.bookingId} already has collected cash. Preserve the cash history and handle cancellation through credit or refund review instead of deletion.`;
    default:
      return `Booking ${state.bookingId} has no linked financial history and can be deleted safely.`;
  }
};

export const canTransitionBookingToCancelled = (state: BookingFinancialState): boolean => (
  state.recommendedAction === "safe-delete" ||
  state.recommendedAction === "cancel-preserve-costs"
);

export const getBookingCancellationStatusMessage = (state: BookingFinancialState): string => {
  switch (state.recommendedAction) {
    case "cancel-and-void-unbilled":
      return `Booking ${state.bookingId} still has ${state.unbilledChargeCount} unbilled charge line(s). Void those charges before setting the booking to Cancelled.`;
    case "cancel-preserve-costs":
      return `Booking ${state.bookingId} can be cancelled. Recorded costs will remain for profitability tracking.`;
    case "reversal-required":
      return `Booking ${state.bookingId} already has billed or invoiced financial history. Create the reversal or credit handling first, then cancel the booking.`;
    case "credit-review-required":
      return `Booking ${state.bookingId} already has collected cash. Resolve the customer credit or refund handling before cancelling the booking.`;
    default:
      return `Booking ${state.bookingId} has no blocking financial history and can be cancelled.`;
  }
};

export async function voidBookingUnbilledCharges(bookingId: string, actor?: ActivityActor): Promise<VoidBookingChargesResult> {
  const [
    { data: billingRows, error: billingFetchError },
    { data: evoucherRows, error: evoucherFetchError },
  ] = await Promise.all([
    supabase
      .from("billing_line_items")
      .select("id,status")
      .eq("booking_id", bookingId),
    supabase
      .from("evouchers")
      .select("id,status,transaction_type")
      .eq("booking_id", bookingId),
  ]);

  if (billingFetchError) throw billingFetchError;
  if (evoucherFetchError) throw evoucherFetchError;

  const billingIdsToVoid = (billingRows || [])
    .filter((row: any) => String(row.status || "").toLowerCase() === "unbilled")
    .map((row: any) => row.id);

  const evoucherIdsToVoid = (evoucherRows || [])
    .filter((row: any) => {
      const status = String(row.status || "").toLowerCase();
      const transactionType = String(row.transaction_type || "").toLowerCase();
      return transactionType === "billing" && status === "unbilled";
    })
    .map((row: any) => row.id);

  if (billingIdsToVoid.length > 0) {
    const { error } = await supabase
      .from("billing_line_items")
      .update({ status: "voided" })
      .in("id", billingIdsToVoid);
    if (error) throw error;
  }

  if (evoucherIdsToVoid.length > 0) {
    const { error } = await supabase
      .from("evouchers")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .in("id", evoucherIdsToVoid);
    if (error) throw error;
  }

  if (actor) {
    logActivity("booking", bookingId, bookingId, "cancelled", actor);
  }

  return {
    billingLineItemsVoided: billingIdsToVoid.length,
    evoucherBillingsVoided: evoucherIdsToVoid.length,
  };
}
