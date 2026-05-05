// useUnbilledRevenueReport â€” Work completed but not yet invoiced.
// A booking is "unbilled" when it has billing line items but no active invoice
// covering those items (or the invoice total is less than the billed charges).
// At-risk: bookings open 60+ days with unbilled balance.

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { isInScope, getDateScopeQueryRange } from "../components/accounting/aggregate/types";
import type { DateScope } from "../components/accounting/aggregate/types";
import { isInvoiceFinanciallyActive } from "../utils/invoiceReversal";
import { queryKeys } from "../lib/queryKeys";

export interface UnbilledRow {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  serviceType: string;
  bookingDate: string;
  daysOpen: number;
  bookedCharges: number;
  invoicedAmount: number;
  unbilledAmount: number;
  isAtRisk: boolean;
}

export interface UnbilledSummary {
  totalUnbilled: number;
  bookingCount: number;
  atRiskCount: number;
  atRiskAmount: number;
  totalBookedCharges: number;
  byServiceType: { serviceType: string; count: number; unbilled: number }[];
}

export function useUnbilledRevenueReport(scope: DateScope) {
  const queryClient = useQueryClient();
  const filters = { scope } as Record<string, unknown>;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.financials.unbilledRevenue(filters),
    queryFn: async () => {
      const { fromIso, toIso } = getDateScopeQueryRange(scope);

      const { data: bookingRows, error: bookingError } = await supabase
        .from("bookings")
        .select("id, booking_number, customer_name, service_type, created_at")
        .neq("status", "Cancelled")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);

      if (bookingError) throw bookingError;

      const bookings = bookingRows ?? [];
      const bookingIds = bookings.map((booking: any) => booking.id).filter(Boolean);
      if (bookingIds.length === 0) {
        return {
          bookings: [],
          billingItems: [],
          invoices: [],
        };
      }

      const [
        { data: billingRows, error: billingError },
        { data: invoiceRows, error: invoiceError },
      ] = await Promise.all([
        supabase
          .from("billing_line_items")
          .select("id, booking_id, amount, total_amount, status")
          .in("booking_id", bookingIds),
        supabase
          .from("invoices")
          .select("id, booking_id, total_amount, subtotal, status, invoice_type, reversal_for")
          .in("booking_id", bookingIds),
      ]);

      if (billingError) throw billingError;
      if (invoiceError) throw invoiceError;

      return {
        bookings,
        billingItems: billingRows ?? [],
        invoices: invoiceRows ?? [],
      };
    },
    staleTime: 30_000,
  });

  const { rows, summary } = useMemo(() => {
    const bookings = data?.bookings ?? [];
    const billingItems = data?.billingItems ?? [];
    const invoices = data?.invoices ?? [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const billingsByBooking = new Map<string, any[]>();
    billingItems.forEach((b: any) => {
      const bid = b.booking_id as string;
      if (!bid) return;
      if (!billingsByBooking.has(bid)) billingsByBooking.set(bid, []);
      billingsByBooking.get(bid)!.push(b);
    });

    const invoicesByBooking = new Map<string, any[]>();
    invoices.filter(isInvoiceFinanciallyActive).forEach((inv: any) => {
      const bid = inv.booking_id as string;
      if (!bid) return;
      if (!invoicesByBooking.has(bid)) invoicesByBooking.set(bid, []);
      invoicesByBooking.get(bid)!.push(inv);
    });

    const computedRows: UnbilledRow[] = bookings
      .filter((b: any) => isInScope(b.created_at, scope))
      .map((b: any): UnbilledRow | null => {
        const bookingId = b.id as string;
        const bookingBillings = billingsByBooking.get(bookingId) || [];
        const bookingInvoices = invoicesByBooking.get(bookingId) || [];

        const bookedCharges = bookingBillings
          .filter((bl: any) => {
            const s = (bl.status as string || "").toLowerCase();
            return s !== "cancelled" && s !== "rejected";
          })
          .reduce((sum: number, bl: any) => sum + (Number(bl.total_amount) || Number(bl.amount) || 0), 0);

        if (bookedCharges <= 0) return null;

        const invoicedAmount = bookingInvoices.reduce(
          (sum: number, inv: any) => sum + (Number(inv.total_amount) || Number(inv.subtotal) || 0),
          0
        );

        const unbilledAmount = Math.max(0, bookedCharges - invoicedAmount);
        if (unbilledAmount <= 0) return null;

        const bookingDate = b.created_at as string || "";
        const agingDate = bookingDate ? new Date(bookingDate) : today;
        const daysOpen = Math.max(0, Math.floor((today.getTime() - agingDate.getTime()) / 86_400_000));

        return {
          bookingId,
          bookingNumber: (b.booking_number as string) || bookingId,
          customerName: (b.customer_name as string) || "—",
          serviceType: (b.service_type as string) || "—",
          bookingDate,
          daysOpen,
          bookedCharges,
          invoicedAmount,
          unbilledAmount,
          isAtRisk: daysOpen >= 60,
        };
      })
      .filter((r): r is UnbilledRow => r !== null)
      .sort((a, b) => b.unbilledAmount - a.unbilledAmount);

    const stMap = new Map<string, { count: number; unbilled: number }>();
    computedRows.forEach((r) => {
      const existing = stMap.get(r.serviceType) || { count: 0, unbilled: 0 };
      stMap.set(r.serviceType, {
        count: existing.count + 1,
        unbilled: existing.unbilled + r.unbilledAmount,
      });
    });
    const byServiceType = Array.from(stMap.entries())
      .map(([serviceType, { count, unbilled }]) => ({ serviceType, count, unbilled }))
      .sort((a, b) => b.unbilled - a.unbilled);

    const atRisk = computedRows.filter((r) => r.isAtRisk);

    return {
      rows: computedRows,
      summary: {
        totalUnbilled: computedRows.reduce((s, r) => s + r.unbilledAmount, 0),
        bookingCount: computedRows.length,
        atRiskCount: atRisk.length,
        atRiskAmount: atRisk.reduce((s, r) => s + r.unbilledAmount, 0),
        totalBookedCharges: computedRows.reduce((s, r) => s + r.bookedCharges, 0),
        byServiceType,
      } as UnbilledSummary,
    };
  }, [data, scope]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.financials.unbilledRevenue(filters) });

  return { rows, summary, isLoading, refresh };
}
