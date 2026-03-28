import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import {
  calculateFinancialTotals,
  convertQuotationToVirtualItems,
  mergeBillableExpenses,
  mergeVirtualItemsWithRealItems,
} from "../utils/financialCalculations";
import {
  collectLinkedBookingIds,
  filterBillingItemsForScope,
  filterCollectionsForScope,
  filterInvoicesForScope,
  mapEvoucherExpensesForScope,
  mapExpenseRowsForScope,
} from "../utils/financialSelectors";
import type { FinancialData } from "./financialData";

interface UseContainerFinancialsOptions {
  containerType: "project" | "contract" | "booking";
  containerReference?: string;
  linkedBookings?: Array<string | { bookingId?: string; id?: string }>;
  quotationId?: string;
  includeQuotationVirtualItems?: boolean;
  expenseSource?: "expenses" | "evouchers";
}

export function useContainerFinancials({
  containerType,
  containerReference,
  linkedBookings = [],
  quotationId,
  includeQuotationVirtualItems = false,
  expenseSource = "expenses",
}: UseContainerFinancialsOptions): FinancialData {
  const queryClient = useQueryClient();

  const linkedBookingIds = useMemo(
    () => collectLinkedBookingIds(linkedBookings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(linkedBookings)],
  );

  const hasScope = !!containerReference || linkedBookingIds.length > 0;

  const qKey = queryKeys.financials.container(
    containerType,
    containerReference ?? "",
    linkedBookingIds,
  );

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const expenseTable = expenseSource === "evouchers" ? "evouchers" : "expenses";
      const scopeFilter = buildScopeFilter(linkedBookingIds, containerReference);

      const [
        { data: invoiceRows, error: invoiceErr },
        { data: billingItemRows, error: billingErr },
        { data: expenseRows, error: expenseErr },
        { data: collectionRows, error: collectionErr },
        quotationResult,
      ] = await Promise.all([
        supabase.from("invoices").select("*").or(scopeFilter),
        supabase.from("billing_line_items").select("*").or(scopeFilter),
        supabase.from(expenseTable).select("*").or(scopeFilter),
        supabase.from("collections").select("*"),
        includeQuotationVirtualItems && quotationId
          ? supabase.from("quotations").select("*").eq("id", quotationId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (invoiceErr) console.error("invoices fetch error:", invoiceErr);
      if (billingErr) console.error("billing_line_items fetch error:", billingErr);
      if (expenseErr) console.error(`${expenseTable} fetch error:`, expenseErr);

      const filteredInvoices =
        !invoiceErr && invoiceRows
          ? filterInvoicesForScope(invoiceRows, linkedBookingIds, containerReference)
          : [];

      const mappedExpenses =
        !expenseErr && expenseRows
          ? expenseSource === "evouchers"
            ? mapEvoucherExpensesForScope(expenseRows, linkedBookingIds, containerReference)
            : mapExpenseRowsForScope(expenseRows, linkedBookingIds, containerReference)
          : [];

      let filteredBillingItems =
        !billingErr && billingItemRows
          ? filterBillingItemsForScope(billingItemRows, linkedBookingIds, containerReference)
          : [];

      if (includeQuotationVirtualItems && quotationResult.data) {
        const virtualItems = convertQuotationToVirtualItems(
          quotationResult.data,
          containerReference || "",
        );
        filteredBillingItems = mergeVirtualItemsWithRealItems(filteredBillingItems, virtualItems);
      }

      const mergedBillingItems = mergeBillableExpenses(filteredBillingItems, mappedExpenses);
      const filteredCollections =
        !collectionErr && collectionRows
          ? filterCollectionsForScope(
              collectionRows,
              filteredInvoices.map((invoice: any) => invoice.id).filter(Boolean),
              containerReference,
            )
          : [];

      return { filteredInvoices, mergedBillingItems, mappedExpenses, filteredCollections };
    },
    enabled: hasScope,
    staleTime: 30_000,
  });

  const totals = useMemo(
    () =>
      calculateFinancialTotals(
        data?.filteredInvoices ?? [],
        data?.mergedBillingItems ?? [],
        data?.mappedExpenses ?? [],
        data?.filteredCollections ?? [],
      ),
    [data],
  );

  return {
    invoices: data?.filteredInvoices ?? [],
    billingItems: data?.mergedBillingItems ?? [],
    expenses: data?.mappedExpenses ?? [],
    collections: data?.filteredCollections ?? [],
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: qKey }),
    totals,
  };
}

/**
 * Builds a Supabase .or() filter string to scope queries by booking IDs
 * and container reference — reduces rows fetched vs. full-table scans.
 */
function buildScopeFilter(bookingIds: string[], containerRef?: string): string {
  const parts: string[] = [];

  if (bookingIds.length > 0) {
    bookingIds.forEach((id) => parts.push(`booking_id.eq.${id}`));
    bookingIds.forEach((id) => parts.push(`source_booking_id.eq.${id}`));
  }

  if (containerRef) {
    parts.push(`project_number.eq.${containerRef}`);
    parts.push(`contract_number.eq.${containerRef}`);
    parts.push(`quotation_number.eq.${containerRef}`);
  }

  return parts.length > 0 ? parts.join(",") : "id.is.null";
}
