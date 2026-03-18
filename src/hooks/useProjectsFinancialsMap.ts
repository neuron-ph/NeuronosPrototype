import { useState, useEffect, useCallback } from "react";
import { supabase } from "../utils/supabase/client";
import type { Project, QuotationNew } from "../types/pricing";
import {
  calculateFinancialTotals,
  mergeBillableExpenses,
  FinancialTotals,
  convertQuotationToVirtualItems,
  mergeVirtualItemsWithRealItems,
} from "../utils/financialCalculations";
import {
  collectLinkedBookingIds,
  filterBillingItemsForScope,
  filterCollectionsForScope,
  filterInvoicesForScope,
  mapEvoucherExpensesForScope,
} from "../utils/financialSelectors";
import { useCachedFetch } from "./useNeuronCache";

export interface ProjectFinancials extends FinancialTotals {
  income: number;
  costs: number;
}

export function useProjectsFinancialsMap(projects: Project[]) {
  const [financialsMap, setFinancialsMap] = useState<Record<string, ProjectFinancials>>({});

  const supabaseFetcher = useCallback((table: string) => async () => {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    return data || [];
  }, []);

  const skip = projects.length === 0;

  const { data: invoicesData, isLoading: l1 } = useCachedFetch<any[]>(
    "accounting-invoices",
    supabaseFetcher("invoices"),
    [],
    { skip },
  );
  const { data: expensesData, isLoading: l2 } = useCachedFetch<any[]>(
    "accounting-evouchers",
    supabaseFetcher("evouchers"),
    [],
    { skip },
  );
  const { data: billingItemsData, isLoading: l3 } = useCachedFetch<any[]>(
    "accounting-billing-items",
    supabaseFetcher("billing_line_items"),
    [],
    { skip },
  );
  const { data: collectionsData, isLoading: l4 } = useCachedFetch<any[]>(
    "accounting-collections",
    supabaseFetcher("collections"),
    [],
    { skip },
  );
  const { data: quotationsData, isLoading: l5 } = useCachedFetch<any[]>(
    "quotations",
    supabaseFetcher("quotations"),
    [],
    { skip },
  );

  const isLoading = l1 || l2 || l3 || l4 || l5;

  useEffect(() => {
    if (isLoading || projects.length === 0) return;

    const quotationsMap = new Map<string, QuotationNew>();
    if (Array.isArray(quotationsData)) {
      quotationsData.forEach((quotation: QuotationNew) => {
        quotationsMap.set(quotation.id, quotation);
      });
    }

    const nextMap: Record<string, ProjectFinancials> = {};

    projects.forEach((project) => {
      const linkedBookingIds = collectLinkedBookingIds(project.linkedBookings || []);
      const containerReference = project.project_number;

      const projectInvoices = filterInvoicesForScope(
        invoicesData,
        linkedBookingIds,
        containerReference,
      );

      const projectExpenses = mapEvoucherExpensesForScope(
        expensesData,
        linkedBookingIds,
        containerReference,
      );

      let projectBillingItems = filterBillingItemsForScope(
        billingItemsData,
        linkedBookingIds,
        containerReference,
      );

      const linkedQuotation = quotationsMap.get(project.quotation_id);
      if (linkedQuotation) {
        const virtualItems = convertQuotationToVirtualItems(linkedQuotation, containerReference);
        projectBillingItems = mergeVirtualItemsWithRealItems(projectBillingItems, virtualItems);
      }

      projectBillingItems = mergeBillableExpenses(projectBillingItems, projectExpenses);

      const projectCollections = filterCollectionsForScope(
        collectionsData,
        projectInvoices.map((invoice: any) => invoice.id).filter(Boolean),
        containerReference,
      );

      const totals = calculateFinancialTotals(
        projectInvoices,
        projectBillingItems,
        projectExpenses,
        projectCollections,
      );

      nextMap[project.project_number] = {
        ...totals,
        income: totals.bookedCharges,
        costs: totals.directCost,
        margin: totals.grossMargin,
      };
    });

    setFinancialsMap(nextMap);
  }, [projects, invoicesData, expensesData, billingItemsData, collectionsData, quotationsData, isLoading]);

  return { financialsMap, isLoading };
}
