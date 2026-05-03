// useCollectionsReport — Payment receipts for reconciliation.
// Fetches all applied collections within the selected scope.
// Groups by payment method for summary breakdown.

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { isInScope } from "../components/accounting/aggregate/types";
import type { DateScope } from "../components/accounting/aggregate/types";
import { isCollectionAppliedToInvoice } from "../utils/collectionResolution";
import { pickReportingAmount } from "../utils/accountingCurrency";
import { queryKeys } from "../lib/queryKeys";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CollectionRow {
  collectionId: string;
  collectionNumber: string;
  receiptDate: string;
  customerName: string;
  invoiceRef: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: number;
}

export interface CollectionsByMethod {
  method: string;
  count: number;
  total: number;
}

export interface CollectionSummary {
  totalCollected: number;
  receiptCount: number;
  customerCount: number;
  largestPayment: number;
  averagePayment: number;
  byMethod: CollectionsByMethod[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCollectionsReport(scope: DateScope) {
  const queryClient = useQueryClient();
  const filters = { scope } as Record<string, unknown>;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.financials.collectionsReport(filters),
    queryFn: async () => {
      // Limit data to last 2 years
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 2);
      const cutoffISO = cutoff.toISOString();

      const [
        { data: collectionRows },
        { data: invoiceRows },
        { data: bookingRows },
      ] = await Promise.all([
        supabase.from("collections").select("*").gte("created_at", cutoffISO),
        supabase.from("invoices").select("id, invoice_number, booking_id, customer_name").gte("created_at", cutoffISO),
        supabase.from("bookings").select("id, booking_number, customer_name").gte("created_at", cutoffISO),
      ]);

      return {
        collections: collectionRows || [],
        invoices: invoiceRows || [],
        bookings: bookingRows || [],
      };
    },
    staleTime: 30_000,
  });

  const { rows, summary } = useMemo(() => {
    const collections = data?.collections ?? [];
    const invoices = data?.invoices ?? [];
    const bookings = data?.bookings ?? [];

    // Lookup maps
    const invoiceMap = new Map<string, any>();
    invoices.forEach((inv: any) => invoiceMap.set(inv.id as string, inv));

    const bookingMap = new Map<string, any>();
    bookings.forEach((b: any) => bookingMap.set(b.id as string, b));

    const computedRows: CollectionRow[] = collections
      .filter(isCollectionAppliedToInvoice)
      .filter((c: any) => isInScope(c.collection_date || c.created_at, scope))
      .map((c: any): CollectionRow => {
        const collectionId = c.id as string;

        // Resolve customer name — collection → linked invoice → booking
        const linkedInvoiceId = c.invoice_id || c.invoiceId;
        const linkedInvoice = linkedInvoiceId ? invoiceMap.get(linkedInvoiceId as string) : null;
        const linkedBooking = linkedInvoice?.booking_id
          ? bookingMap.get(linkedInvoice.booking_id as string)
          : null;

        const customerName =
          (c.customer_name as string) ||
          (linkedInvoice?.customer_name as string) ||
          linkedBooking?.customer_name ||
          "—";

        // Invoice reference — from direct invoice_id or first linked_billing
        const firstLinkedId =
          linkedInvoiceId ||
          (Array.isArray(c.linked_billings) && c.linked_billings[0]?.id) ||
          null;
        const refInvoice = firstLinkedId ? invoiceMap.get(firstLinkedId as string) : null;
        const invoiceRef = refInvoice?.invoice_number || firstLinkedId || "—";

        return {
          collectionId,
          collectionNumber: (c.collection_number as string) || (c.or_number as string) || collectionId,
          receiptDate: (c.collection_date as string) || (c.created_at as string) || "",
          customerName,
          invoiceRef,
          paymentMethod: (c.payment_method as string) || "—",
          referenceNumber: (c.reference_number as string) || (c.check_number as string) || "—",
          amount: pickReportingAmount(c),
        };
      })
      .sort((a, b) => {
        if (!a.receiptDate && !b.receiptDate) return 0;
        if (!a.receiptDate) return 1;
        if (!b.receiptDate) return -1;
        return new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime();
      });

    // By-method breakdown
    const methodMap = new Map<string, { count: number; total: number }>();
    computedRows.forEach((r) => {
      const existing = methodMap.get(r.paymentMethod) || { count: 0, total: 0 };
      methodMap.set(r.paymentMethod, {
        count: existing.count + 1,
        total: existing.total + r.amount,
      });
    });
    const byMethod: CollectionsByMethod[] = Array.from(methodMap.entries())
      .map(([method, { count, total }]) => ({ method, count, total }))
      .sort((a, b) => b.total - a.total);

    const totalCollected = computedRows.reduce((s, r) => s + r.amount, 0);
    const amounts = computedRows.map((r) => r.amount);

    return {
      rows: computedRows,
      summary: {
        totalCollected,
        receiptCount: computedRows.length,
        customerCount: new Set(computedRows.map((r) => r.customerName)).size,
        largestPayment: amounts.length > 0 ? Math.max(...amounts) : 0,
        averagePayment: computedRows.length > 0 ? totalCollected / computedRows.length : 0,
        byMethod,
      } as CollectionSummary,
    };
  }, [data, scope]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.financials.reportsData() });

  return { rows, summary, isLoading, refresh };
}
