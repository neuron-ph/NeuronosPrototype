// useReceivablesAgingReport — Outstanding AR by aging bucket.
// Aging is measured from invoice due_date → invoice_date → created_at (first available).
// Only financially-active invoices in the selected scope with outstanding > 0 are included.

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { isInScope } from "../components/accounting/aggregate/types";
import type { DateScope } from "../components/accounting/aggregate/types";
import { isInvoiceFinanciallyActive } from "../utils/invoiceReversal";
import { isCollectionAppliedToInvoice } from "../utils/collectionResolution";
import { pickReportingAmount } from "../utils/accountingCurrency";
import { queryKeys } from "../lib/queryKeys";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgingBucket = "current" | "31-60" | "61-90" | "91+";

export const BUCKET_LABELS: Record<AgingBucket, string> = {
  "current": "0 – 30 days",
  "31-60":   "31 – 60 days",
  "61-90":   "61 – 90 days",
  "91+":     "91+ days",
};

export interface AgingRow {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  bookingRef: string;
  issueDate: string;
  totalAmount: number;
  collected: number;
  outstanding: number;
  daysOld: number;
  bucket: AgingBucket;
}

export interface AgingSummary {
  totalOutstanding: number;
  current: number;
  days31_60: number;
  days61_90: number;
  days91plus: number;
  invoiceCount: number;
  customerCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAgingBucket(daysOld: number): AgingBucket {
  if (daysOld <= 30) return "current";
  if (daysOld <= 60) return "31-60";
  if (daysOld <= 90) return "61-90";
  return "91+";
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useReceivablesAgingReport(scope: DateScope) {
  const queryClient = useQueryClient();
  const filters = { scope } as Record<string, unknown>;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.financials.receivablesAging(filters),
    queryFn: async () => {
      // Skip fully paid invoices at the DB level; limit to 2 years
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 2);
      const cutoffISO = cutoff.toISOString();

      const [
        { data: invoiceRows },
        { data: collectionRows },
        { data: bookingRows },
      ] = await Promise.all([
        supabase.from("invoices").select("*").neq("status", "paid").gte("created_at", cutoffISO),
        supabase.from("collections").select("*").gte("created_at", cutoffISO),
        supabase.from("bookings").select("id, booking_number, customer_name").gte("created_at", cutoffISO),
      ]);

      return {
        invoices: invoiceRows || [],
        collections: collectionRows || [],
        bookings: bookingRows || [],
      };
    },
    staleTime: 30_000,
  });

  const { rows, summary } = useMemo(() => {
    const invoices = data?.invoices ?? [];
    const collections = data?.collections ?? [];
    const bookings = data?.bookings ?? [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Booking lookup
    const bookingMap = new Map<string, any>();
    bookings.forEach((b: any) => bookingMap.set(b.id as string, b));

    // Invoice rate lookup so cross-currency collections can be normalized to PHP base.
    const invoiceRateById = new Map<string, number>();
    invoices.forEach((inv: any) => {
      const r = Number(inv.exchange_rate);
      invoiceRateById.set(inv.id as string, Number.isFinite(r) && r > 0 ? r : 1);
    });

    // Collected-per-invoice map in PHP base. Direct hits use the collection's
    // own base_amount; linked_billings entries are in invoice currency, so we
    // multiply by the invoice's locked rate to normalize.
    const collectedByInvoice = new Map<string, number>();
    collections.filter(isCollectionAppliedToInvoice).forEach((c: any) => {
      const directId = c.invoice_id || c.invoiceId;
      const directBase = pickReportingAmount(c);
      if (directId) {
        collectedByInvoice.set(directId, (collectedByInvoice.get(directId) || 0) + directBase);
      }
      (Array.isArray(c.linked_billings) ? c.linked_billings : []).forEach((entry: any) => {
        const id = entry?.id || entry?.invoice_id || entry?.invoiceId;
        if (!id || id === directId) return;
        const rate = invoiceRateById.get(id) ?? 1;
        const entryAmtInvoiceCcy = Number(entry?.amount) || 0;
        collectedByInvoice.set(id, (collectedByInvoice.get(id) || 0) + entryAmtInvoiceCcy * rate);
      });
    });

    const computedRows: AgingRow[] = invoices
      .filter(isInvoiceFinanciallyActive)
      .filter((inv: any) => isInScope(inv.created_at, scope))
      .map((inv: any): AgingRow | null => {
        const invoiceId = inv.id as string;
        // Aging aggregates in PHP base across the whole AR portfolio. Per-invoice
        // figures here are PHP-normalized; per-row source-currency display is
        // the consumer's responsibility.
        const totalAmount = pickReportingAmount(inv) || Number(inv.subtotal) || 0;
        const collected   = collectedByInvoice.get(invoiceId) || 0;
        const outstanding = Math.max(0, totalAmount - collected);
        if (outstanding <= 0) return null;

        const agingRef  = inv.due_date || inv.invoice_date || inv.created_at || "";
        const agingDate = agingRef ? new Date(agingRef) : today;
        const daysOld   = Math.max(0, Math.floor((today.getTime() - agingDate.getTime()) / 86_400_000));

        const booking      = inv.booking_id ? bookingMap.get(inv.booking_id as string) : null;
        const customerName = (inv.customer_name as string) || booking?.customer_name || "—";
        const bookingRef   = booking?.booking_number || (inv.booking_id as string) || "—";

        return {
          invoiceId,
          invoiceNumber: (inv.invoice_number as string) || invoiceId,
          customerName,
          bookingRef,
          issueDate:   inv.invoice_date || inv.created_at || "",
          totalAmount,
          collected,
          outstanding,
          daysOld,
          bucket: getAgingBucket(daysOld),
        };
      })
      .filter((r): r is AgingRow => r !== null)
      .sort((a, b) => b.daysOld - a.daysOld);

    const totalOutstanding = computedRows.reduce((s, r) => s + r.outstanding, 0);
    const current   = computedRows.filter(r => r.bucket === "current").reduce((s, r) => s + r.outstanding, 0);
    const d31_60    = computedRows.filter(r => r.bucket === "31-60").reduce((s, r) => s + r.outstanding, 0);
    const d61_90    = computedRows.filter(r => r.bucket === "61-90").reduce((s, r) => s + r.outstanding, 0);
    const d91plus   = computedRows.filter(r => r.bucket === "91+").reduce((s, r) => s + r.outstanding, 0);

    return {
      rows: computedRows,
      summary: {
        totalOutstanding,
        current,
        days31_60: d31_60,
        days61_90: d61_90,
        days91plus: d91plus,
        invoiceCount:  computedRows.length,
        customerCount: new Set(computedRows.map(r => r.customerName)).size,
      } as AgingSummary,
    };
  }, [data, scope]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.financials.reportsData() });

  return { rows, summary, isLoading, refresh };
}
