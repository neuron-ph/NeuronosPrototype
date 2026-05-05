import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { getDateScopeQueryRange } from "../components/accounting/aggregate/types";
import type { DateScope } from "../components/accounting/aggregate/types";

export interface ReportsData {
  bookings: any[];
  projects: any[];
  billingItems: any[];
  invoices: any[];
  collections: any[];
  expenses: any[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface ReportsPayload {
  bookings: any[];
  projects: any[];
  billingItems: any[];
  invoices: any[];
  collections: any[];
  expenses: any[];
}

const EMPTY_PAYLOAD: ReportsPayload = {
  bookings: [],
  projects: [],
  billingItems: [],
  invoices: [],
  collections: [],
  expenses: [],
};

function mergeRowsById<T extends { id?: string }>(...groups: T[][]): T[] {
  const byId = new Map<string, T>();

  groups.flat().forEach((row) => {
    if (!row?.id) return;
    byId.set(row.id, row);
  });

  return Array.from(byId.values());
}

export function useReportsData(scope: DateScope): ReportsData {
  const queryClient = useQueryClient();
  const scopeKey = [scope.preset, scope.from.toISOString(), scope.to.toISOString()];

  const queryFn = useCallback(async (): Promise<ReportsPayload> => {
    const { fromIso, toIso } = getDateScopeQueryRange(scope);

    const { data: bookingRows, error: bookingError } = await supabase
      .from("bookings")
      .select("id, booking_number, service_type, customer_name, project_id, status, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false });

    if (bookingError) throw bookingError;

    const bookings = bookingRows ?? [];
    const bookingIds = bookings.map((booking: any) => booking.id).filter(Boolean);
    if (bookingIds.length === 0) {
      return EMPTY_PAYLOAD;
    }

    const [
      { data: billingRows, error: billingError },
      { data: evoucherRows, error: evoucherError },
      { data: invoiceRows, error: invoiceError },
      { data: collectionsByBooking, error: collectionsByBookingError },
      { data: collectionsByRecentDate, error: collectionsByDateError },
    ] = await Promise.all([
      supabase
        .from("billing_line_items")
        .select("*")
        .in("booking_id", bookingIds),
      supabase
        .from("evouchers")
        .select("*")
        .in("booking_id", bookingIds)
        .in("transaction_type", ["expense", "budget_request"])
        .in("status", ["approved", "posted", "paid", "partial"]),
      supabase
        .from("invoices")
        .select("*")
        .in("booking_id", bookingIds),
      supabase
        .from("collections")
        .select("*")
        .in("booking_id", bookingIds),
      supabase
        .from("collections")
        .select("*")
        .gte("created_at", fromIso),
    ]);

    if (billingError) throw billingError;
    if (evoucherError) throw evoucherError;
    if (invoiceError) throw invoiceError;
    if (collectionsByBookingError) throw collectionsByBookingError;
    if (collectionsByDateError) throw collectionsByDateError;

    return {
      bookings,
      projects: [],
      billingItems: billingRows ?? [],
      invoices: invoiceRows ?? [],
      collections: mergeRowsById(
        (collectionsByBooking ?? []) as Array<{ id?: string }>,
        (collectionsByRecentDate ?? []) as Array<{ id?: string }>
      ),
      expenses: evoucherRows ?? [],
    };
  }, [scope]);

  const { data = EMPTY_PAYLOAD, isLoading } = useQuery({
    queryKey: [...queryKeys.financials.reportsData(), ...scopeKey],
    queryFn,
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...queryKeys.financials.reportsData(), ...scopeKey] });
  }, [queryClient, scopeKey]);

  return {
    bookings: data.bookings,
    projects: data.projects,
    billingItems: data.billingItems,
    invoices: data.invoices,
    collections: data.collections,
    expenses: data.expenses,
    isLoading,
    error: null,
    refresh,
  };
}
