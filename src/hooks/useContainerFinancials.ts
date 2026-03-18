import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "../components/ui/toast-utils";
import { supabase } from "../utils/supabase/client";
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
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const linkedBookingIds = useMemo(
    () => collectLinkedBookingIds(linkedBookings),
    [linkedBookings],
  );

  const fetchFinancials = useCallback(async () => {
    if (!containerReference && linkedBookingIds.length === 0) {
      setInvoices([]);
      setBillingItems([]);
      setCollections([]);
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const expenseTable = expenseSource === "evouchers" ? "evouchers" : "expenses";

      const [
        { data: invoiceRows, error: invoiceErr },
        { data: billingItemRows, error: billingErr },
        { data: expenseRows, error: expenseErr },
        { data: collectionRows, error: collectionErr },
        quotationResult,
      ] = await Promise.all([
        supabase.from("invoices").select("*"),
        supabase.from("billing_line_items").select("*"),
        supabase.from(expenseTable).select("*"),
        supabase.from("collections").select("*"),
        includeQuotationVirtualItems && quotationId
          ? supabase.from("quotations").select("*").eq("id", quotationId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

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

      setInvoices(filteredInvoices);
      setBillingItems(mergedBillingItems);
      setExpenses(mappedExpenses);
      setCollections(filteredCollections);
    } catch (error) {
      console.error(`Error fetching ${containerType} financials:`, error);
      toast.error(`Failed to load ${containerType} financial data`);
    } finally {
      setIsLoading(false);
    }
  }, [
    containerReference,
    containerType,
    expenseSource,
    includeQuotationVirtualItems,
    linkedBookingIds,
    quotationId,
  ]);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  const totals = calculateFinancialTotals(invoices, billingItems, expenses, collections);

  return {
    invoices,
    billingItems,
    expenses,
    collections,
    isLoading,
    refresh: fetchFinancials,
    totals,
  };
}
