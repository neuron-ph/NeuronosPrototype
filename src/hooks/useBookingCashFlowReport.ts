import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import {
  filterBillingItemsForScope,
  filterInvoicesForScope,
  filterCollectionsForScope,
  mapEvoucherExpensesForScope,
} from "../utils/financialSelectors";
import { calculateFinancialTotals } from "../utils/financialCalculations";
import { isInScope, getDateScopeQueryRange } from "../components/accounting/aggregate/types";
import type { DateScope } from "../components/accounting/aggregate/types";
import { queryKeys } from "../lib/queryKeys";

export interface BookingCashFlowRow {
  bookingId: string;
  bookingReference: string;
  serviceType: string;
  customerName: string;
  projectNumber: string | null;
  status: string;
  bookingDate: string;
  bookedCharges: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  directCost: number;
  grossProfit: number;
  grossMargin: number;
  collectionRate: number;
}

export interface BookingCashFlowSummary {
  totalBookedCharges: number;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  totalDirectCost: number;
  totalGrossProfit: number;
  avgGrossMargin: number;
  bookingCount: number;
}

function mergeRowsById<T extends { id?: string }>(...groups: T[][]): T[] {
  const byId = new Map<string, T>();

  groups.flat().forEach((row) => {
    if (!row?.id) return;
    byId.set(row.id, row);
  });

  return Array.from(byId.values());
}

export function useBookingCashFlowReport(scope: DateScope) {
  const queryClient = useQueryClient();
  const filters = { scope } as Record<string, unknown>;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.financials.bookingCashFlow(filters),
    queryFn: async () => {
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
        return {
          bookings: [],
          billingItems: [],
          evouchers: [],
          invoices: [],
          collections: [],
        };
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
        billingItems: billingRows ?? [],
        evouchers: evoucherRows ?? [],
        invoices: invoiceRows ?? [],
        collections: mergeRowsById(
          (collectionsByBooking ?? []) as Array<{ id?: string }>,
          (collectionsByRecentDate ?? []) as Array<{ id?: string }>
        ),
      };
    },
    staleTime: 30_000,
  });

  const { rows, summary } = useMemo(() => {
    const bookings = data?.bookings ?? [];
    const billingItems = data?.billingItems ?? [];
    const evouchers = data?.evouchers ?? [];
    const invoices = data?.invoices ?? [];
    const collections = data?.collections ?? [];

    const computedRows = bookings
      .filter((booking) => isInScope(booking.created_at, scope))
      .map((booking): BookingCashFlowRow | null => {
        const bookingId = booking.id as string;
        if (!bookingId) return null;

        const scopedBillingItems = filterBillingItemsForScope(
          billingItems,
          [bookingId],
          bookingId
        );

        const scopedInvoices = filterInvoicesForScope(
          invoices,
          [bookingId],
          bookingId
        );

        const scopedInvoiceIds = scopedInvoices
          .map((inv: any) => inv.id as string)
          .filter(Boolean);

        const scopedCollections = filterCollectionsForScope(
          collections,
          scopedInvoiceIds,
          bookingId
        );

        const scopedExpenses = mapEvoucherExpensesForScope(
          evouchers,
          [bookingId],
          bookingId
        );

        const totals = calculateFinancialTotals(
          scopedInvoices,
          scopedBillingItems,
          scopedExpenses,
          scopedCollections
        );

        const collectionRate =
          totals.invoicedAmount > 0
            ? (totals.collectedAmount / totals.invoicedAmount) * 100
            : 0;

        return {
          bookingId,
          bookingReference: booking.booking_number || bookingId,
          serviceType: booking.service_type || "—",
          customerName: booking.customer_name || "—",
          projectNumber: booking.project_id || null,
          status: booking.status || "—",
          bookingDate: booking.created_at || "",
          bookedCharges: totals.bookedCharges,
          invoicedAmount: totals.invoicedAmount,
          collectedAmount: totals.collectedAmount,
          outstandingAmount: totals.outstandingAmount,
          directCost: totals.directCost,
          grossProfit: totals.grossProfit,
          grossMargin: totals.grossMargin,
          collectionRate,
        };
      })
      .filter((row): row is BookingCashFlowRow => row !== null)
      .sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());

    const totalBookedCharges = computedRows.reduce((s, r) => s + r.bookedCharges, 0);
    const totalInvoiced = computedRows.reduce((s, r) => s + r.invoicedAmount, 0);
    const totalCollected = computedRows.reduce((s, r) => s + r.collectedAmount, 0);
    const totalOutstanding = computedRows.reduce((s, r) => s + r.outstandingAmount, 0);
    const totalDirectCost = computedRows.reduce((s, r) => s + r.directCost, 0);
    const totalGrossProfit = computedRows.reduce((s, r) => s + r.grossProfit, 0);
    const avgGrossMargin =
      totalBookedCharges > 0 ? (totalGrossProfit / totalBookedCharges) * 100 : 0;

    const nextSummary: BookingCashFlowSummary = {
      totalBookedCharges,
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      totalDirectCost,
      totalGrossProfit,
      avgGrossMargin,
      bookingCount: computedRows.length,
    };

    return { rows: computedRows, summary: nextSummary };
  }, [data, scope]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.financials.bookingCashFlow(filters) });

  return { rows, summary, isLoading, refresh };
}
