import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "../utils/api";
import type { Project, QuotationNew, SellingPriceLineItem } from "../types/pricing";
import { calculateFinancialTotals, mergeBillableExpenses, FinancialTotals, convertQuotationToVirtualItems, mergeVirtualItemsWithRealItems } from "../utils/financialCalculations";
import { useCachedFetch } from "./useNeuronCache";

export interface ProjectFinancials extends FinancialTotals {
  // Alias for backward compatibility if needed, or we just use FinancialTotals properties directly
  income: number; // productionValue
  costs: number; // cost
  // grossProfit and margin are already in FinancialTotals (as profitMargin)
}

export function useProjectsFinancialsMap(projects: Project[]) {
  const [financialsMap, setFinancialsMap] = useState<Record<string, ProjectFinancials>>({});

  // Create a mapping of Booking ID -> Project Number for efficient lookup
  const bookingToProjectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => {
      if (p.linkedBookings && Array.isArray(p.linkedBookings)) {
        p.linkedBookings.forEach((b: any) => {
          if (b.bookingId) {
            map.set(b.bookingId, p.project_number);
          }
        });
      }
    });
    return map;
  }, [projects]);

  // ── Cached data sources (shared across modules) ───────────
  const apiFetcher = useCallback((endpoint: string) => async () => {
    const response = await apiFetch(endpoint);
    if (!response.ok) throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
    const json = await response.json();
    return json.success ? (json.data || []) : [];
  }, []);

  const skip = projects.length === 0;

  const { data: invoicesData, isLoading: l1 } = useCachedFetch<any[]>(
    "accounting-invoices", apiFetcher("/accounting/invoices"), [], { skip }
  );
  const { data: expensesData, isLoading: l2 } = useCachedFetch<any[]>(
    "accounting-expenses", apiFetcher("/accounting/expenses"), [], { skip }
  );
  const { data: billingItemsData, isLoading: l3 } = useCachedFetch<any[]>(
    "accounting-billing-items", apiFetcher("/accounting/billing-items"), [], { skip }
  );
  const { data: quotationsData, isLoading: l4 } = useCachedFetch<any[]>(
    "quotations", apiFetcher("/quotations"), [], { skip }
  );

  const isLoading = l1 || l2 || l3 || l4;

  // ── Compute financial map from cached data ────────────────
  useEffect(() => {
    if (isLoading || projects.length === 0) return;

    // Create Quotation Map for fast lookup
    const quotationsMap = new Map<string, QuotationNew>();
    if (Array.isArray(quotationsData)) {
      quotationsData.forEach((q: QuotationNew) => quotationsMap.set(q.id, q));
    }

    const finalMap: Record<string, ProjectFinancials> = {};

    // Process per project to ensure strictly isolated financials
    projects.forEach(p => {
       // 1. Identify Linked IDs
       const linkedIds = new Set<string>([p.project_number]);
       if (p.linkedBookings && Array.isArray(p.linkedBookings)) {
         p.linkedBookings.forEach((b: any) => linkedIds.add(b.bookingId));
       }

       // 2. Filter Invoices
       const projectInvoices = invoicesData.filter((b: any) => {
          // Must match project
          if (b.project_number !== p.project_number) return false;

          // Must have valid status
          const status = (b.status || "").toLowerCase();
          const paymentStatus = (b.payment_status || "").toLowerCase();
          return ["posted", "approved", "paid", "open", "partial"].includes(status) || 
                 ["paid", "partial"].includes(paymentStatus);
       });

       // 3. Filter Expenses
       const projectExpenses = expensesData.filter((e: any) => {
          // Must match project or linked booking
          const isRelevant = linkedIds.has(e.project_number) || linkedIds.has(e.booking_id);
          if (!isRelevant) return false;

          // Must have valid status
          const status = (e.status || "").toLowerCase();
          return ["approved", "posted", "paid", "partial"].includes(status);
       });

       // 4. Filter Real Billing Items (Saved in DB)
       let projectBillingItems = billingItemsData.filter((item: any) => {
           let pNum = item.project_number;
           if (!pNum && item.booking_id) {
              pNum = bookingToProjectMap.get(item.booking_id);
           }
           return pNum === p.project_number;
       });

       // 5. MERGE: Add Virtual Items from Quotation (Potential Revenue)
       const linkedQuotation = quotationsMap.get(p.quotation_id);
       if (linkedQuotation) {
           // Use Shared Logic
           const virtualItems = convertQuotationToVirtualItems(linkedQuotation, p.project_number);
           projectBillingItems = mergeVirtualItemsWithRealItems(projectBillingItems, virtualItems);
       }

       // MERGE: Add billable expenses as Unbilled Revenue (Critical for Income consistency)
       projectBillingItems = mergeBillableExpenses(projectBillingItems, projectExpenses);

       // 6. Calculate Totals
       const totals = calculateFinancialTotals(projectInvoices, projectBillingItems, projectExpenses, []);
       
       finalMap[p.project_number] = {
         ...totals,
         income: totals.productionValue, // Map productionValue to income for compatibility
         costs: totals.cost,
         // grossProfit and margin are already in totals (as grossProfit and profitMargin)
         // We need to ensure 'margin' property exists if consumers look for it
         margin: totals.profitMargin
       };
    });

    setFinancialsMap(finalMap);
  }, [projects, bookingToProjectMap, invoicesData, expensesData, billingItemsData, quotationsData, isLoading]);

  return { financialsMap, isLoading };
}
