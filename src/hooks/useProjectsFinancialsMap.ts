import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { queryKeys } from "../lib/queryKeys";

export interface ProjectFinancials extends FinancialTotals {
  income: number;
  costs: number;
  margin?: number;
}

interface FinancialsPayload {
  invoicesData: any[];
  expensesData: any[];
  billingItemsData: any[];
  collectionsData: any[];
  quotationsData: any[];
}

const EMPTY_PAYLOAD: FinancialsPayload = {
  invoicesData: [],
  expensesData: [],
  billingItemsData: [],
  collectionsData: [],
  quotationsData: [],
};

function mergeRowsById<T extends { id?: string }>(...groups: T[][]): T[] {
  const byId = new Map<string, T>();

  groups.flat().forEach((row) => {
    if (!row?.id) return;
    byId.set(row.id, row);
  });

  return Array.from(byId.values());
}

async function fetchFinancialsPayload(projects: Project[]): Promise<FinancialsPayload> {
  const bookingIds = Array.from(new Set(
    projects.flatMap((project) => collectLinkedBookingIds(project.linkedBookings || []))
  ));
  const projectNumbers = Array.from(new Set(
    projects.map((project) => project.project_number).filter(Boolean)
  ));
  const quotationIds = Array.from(new Set(
    projects.map((project) => project.quotation_id).filter(Boolean)
  ));

  if (bookingIds.length === 0 && projectNumbers.length === 0 && quotationIds.length === 0) {
    return EMPTY_PAYLOAD;
  }

  const [
    { data: invoicesByBooking, error: invoiceBookingError },
    { data: invoicesByProject, error: invoiceProjectError },
    { data: expensesByBooking, error: expenseBookingError },
    { data: expensesByProject, error: expenseProjectError },
    { data: billingByBooking, error: billingBookingError },
    { data: billingByProject, error: billingProjectError },
    { data: quotations, error: quotationError },
  ] = await Promise.all([
    bookingIds.length > 0
      ? supabase.from("invoices").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    projectNumbers.length > 0
      ? supabase.from("invoices").select("*").in("project_number", projectNumbers)
      : Promise.resolve({ data: [] as any[], error: null }),
    bookingIds.length > 0
      ? supabase.from("evouchers").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    projectNumbers.length > 0
      ? supabase.from("evouchers").select("*").in("project_number", projectNumbers)
      : Promise.resolve({ data: [] as any[], error: null }),
    bookingIds.length > 0
      ? supabase.from("billing_line_items").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    projectNumbers.length > 0
      ? supabase.from("billing_line_items").select("*").in("project_number", projectNumbers)
      : Promise.resolve({ data: [] as any[], error: null }),
    quotationIds.length > 0
      ? supabase.from("quotations").select("*").in("id", quotationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (invoiceBookingError || invoiceProjectError) {
    throw new Error(`Failed to fetch invoices: ${(invoiceBookingError || invoiceProjectError)?.message}`);
  }
  if (expenseBookingError || expenseProjectError) {
    throw new Error(`Failed to fetch evouchers: ${(expenseBookingError || expenseProjectError)?.message}`);
  }
  if (billingBookingError || billingProjectError) {
    throw new Error(`Failed to fetch billing_line_items: ${(billingBookingError || billingProjectError)?.message}`);
  }
  if (quotationError) {
    throw new Error(`Failed to fetch quotations: ${quotationError.message}`);
  }

  const invoices = mergeRowsById(
    (invoicesByBooking ?? []) as Array<{ id?: string }>,
    (invoicesByProject ?? []) as Array<{ id?: string }>
  );
  const expenses = mergeRowsById(
    (expensesByBooking ?? []) as Array<{ id?: string }>,
    (expensesByProject ?? []) as Array<{ id?: string }>
  );
  const billingItems = mergeRowsById(
    (billingByBooking ?? []) as Array<{ id?: string }>,
    (billingByProject ?? []) as Array<{ id?: string }>
  );

  const invoiceIds = invoices.map((invoice: any) => invoice.id).filter(Boolean);
  const [
    { data: collectionsByInvoice, error: collectionInvoiceError },
    { data: collectionsByBooking, error: collectionBookingError },
  ] = await Promise.all([
    invoiceIds.length > 0
      ? supabase.from("collections").select("*").in("invoice_id", invoiceIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    bookingIds.length > 0
      ? supabase.from("collections").select("*").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (collectionInvoiceError || collectionBookingError) {
    throw new Error(`Failed to fetch collections: ${(collectionInvoiceError || collectionBookingError)?.message}`);
  }

  const collections = mergeRowsById(
    (collectionsByInvoice ?? []) as Array<{ id?: string }>,
    (collectionsByBooking ?? []) as Array<{ id?: string }>
  );

  return {
    invoicesData: invoices,
    expensesData: expenses,
    billingItemsData: billingItems,
    collectionsData: collections,
    quotationsData: quotations || [],
  };
}

export function useProjectsFinancialsMap(projects: Project[]) {
  const [financialsMap, setFinancialsMap] = useState<Record<string, ProjectFinancials>>({});

  const { data = EMPTY_PAYLOAD, isLoading } = useQuery({
    queryKey: [
      ...queryKeys.financials.projectsMap(),
      projects.map((project) => `${project.id}:${project.project_number}:${project.quotation_id ?? ""}`).join("|"),
    ],
    queryFn: () => fetchFinancialsPayload(projects),
    staleTime: 30_000,
    enabled: projects.length > 0,
  });

  const { invoicesData, expensesData, billingItemsData, collectionsData, quotationsData } = data;

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
        const virtualItems = convertQuotationToVirtualItems(linkedQuotation as any, containerReference);
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
