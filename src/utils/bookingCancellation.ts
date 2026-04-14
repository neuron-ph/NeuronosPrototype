import type { ExecutionStatus } from "../types/operations";

import { supabase } from "./supabase/client";

export const CANCELLABLE_STATUSES: ExecutionStatus[] = ["Draft", "Pending", "Confirmed", "In Progress", "On Hold"];
export const DELETABLE_STATUS: ExecutionStatus = "Draft";

const hasBookingArrayMatch = (value: unknown, bookingId: string): boolean => (
  Array.isArray(value) &&
  value.some((entry) => typeof entry === "string" && entry.trim() === bookingId)
);

const countFinancialTypes = (state: BookingFinancialState) => (
  [
    state.invoiceCount ? `${state.invoiceCount} invoice${state.invoiceCount === 1 ? "" : "s"}` : null,
    state.collectionCount ? `${state.collectionCount} collection${state.collectionCount === 1 ? "" : "s"}` : null,
    state.expenseCount ? `${state.expenseCount} expense${state.expenseCount === 1 ? "" : "s"}` : null,
    state.evoucherCount ? `${state.evoucherCount} e-voucher${state.evoucherCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(", ")
);

const getStatusBlockMessage = (status: ExecutionStatus, actionLabel: "cancelled" | "deleted"): string => {
  switch (status) {
    case "Delivered":
      return `Booking is already delivered and can no longer be ${actionLabel}.`;
    case "Completed":
      return `Booking is already completed and can no longer be ${actionLabel}.`;
    case "Cancelled":
      return `Booking is already cancelled.`;
    case "Closed":
      return `Booking is already closed and cannot be changed.`;
    default:
      return `Booking status ${status} does not allow this action.`;
  }
};

export interface BookingFinancialState {
  bookingId: string;
  invoiceCount: number;
  collectionCount: number;
  expenseCount: number;
  evoucherCount: number;
  hasFinancialRecords: boolean;
}

export async function assessBookingFinancialState(bookingId: string): Promise<BookingFinancialState> {
  const invoiceFilter = `booking_id.eq.${bookingId},booking_ids.cs.{${bookingId}}`;
  const collectionFilter = `booking_id.eq.${bookingId},booking_ids.cs.{${bookingId}}`;

  const [
    { data: invoiceRows, error: invoiceError },
    { data: collectionRows, error: collectionError },
    { data: expenseRows, error: expenseError },
    { data: evoucherRows, error: evoucherError },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id,booking_id,booking_ids")
      .or(invoiceFilter),
    supabase
      .from("collections")
      .select("id,booking_id,booking_ids")
      .or(collectionFilter),
    supabase
      .from("expenses")
      .select("id")
      .eq("booking_id", bookingId),
    supabase
      .from("evouchers")
      .select("id")
      .eq("booking_id", bookingId),
  ]);

  if (invoiceError) throw invoiceError;
  if (collectionError) throw collectionError;
  if (expenseError) throw expenseError;
  if (evoucherError) throw evoucherError;

  const invoiceCount = (invoiceRows || []).filter((row: any) => (
    row.booking_id === bookingId || hasBookingArrayMatch(row.booking_ids, bookingId)
  )).length;

  const collectionCount = (collectionRows || []).filter((row: any) => (
    row.booking_id === bookingId || hasBookingArrayMatch(row.booking_ids, bookingId)
  )).length;

  const expenseCount = (expenseRows || []).length;
  const evoucherCount = (evoucherRows || []).length;
  const hasFinancialRecords = invoiceCount + collectionCount + expenseCount + evoucherCount > 0;

  return {
    bookingId,
    invoiceCount,
    collectionCount,
    expenseCount,
    evoucherCount,
    hasFinancialRecords,
  };
}

export const canHardDeleteBooking = (
  currentStatus: ExecutionStatus,
  state: BookingFinancialState,
): boolean => currentStatus === DELETABLE_STATUS && !state.hasFinancialRecords;

export const canTransitionBookingToCancelled = (
  currentStatus: ExecutionStatus,
  state: BookingFinancialState,
): boolean => CANCELLABLE_STATUSES.includes(currentStatus) && !state.hasFinancialRecords;

export const getBookingCancellationMessage = (
  currentStatus: ExecutionStatus,
  state: BookingFinancialState,
): string => {
  if (state.hasFinancialRecords) {
    return `Booking ${state.bookingId} already has linked financial records (${countFinancialTypes(state)}) and can no longer be deleted.`;
  }

  if (currentStatus !== DELETABLE_STATUS) {
    return `Only Draft bookings can be permanently deleted. Current status is ${currentStatus}.`;
  }

  return `Booking ${state.bookingId} has no linked financial records and can be deleted safely.`;
};

export const getBookingCancellationStatusMessage = (
  currentStatus: ExecutionStatus,
  state: BookingFinancialState,
): string => {
  if (state.hasFinancialRecords) {
    return `Booking ${state.bookingId} already has linked financial records (${countFinancialTypes(state)}) and can no longer be cancelled or deleted.`;
  }

  if (!CANCELLABLE_STATUSES.includes(currentStatus)) {
    return getStatusBlockMessage(currentStatus, "cancelled");
  }

  return `Booking ${state.bookingId} has no linked financial records and can be cancelled.`;
};
