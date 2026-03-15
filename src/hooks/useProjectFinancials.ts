import { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";
import { toast } from "../components/ui/toast-utils";

export interface FinancialData {
  invoices: any[];
  billingItems: any[];
  expenses: any[];
  collections: any[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  totals: FinancialTotals;
}

export function useProjectFinancials(
  projectNumber: string, 
  linkedBookings: any[] = [],
  quotationId?: string
): FinancialData {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFinancials = async () => {
    if (!projectNumber) {
      // No project number — can't fetch project-level data, but we still need
      // to fetch billing items (filtered by booking_id client-side).
      try {
        setIsLoading(true);
        const billingItemsResponse = await apiFetch("/accounting/billing-items");
        if (billingItemsResponse.ok) {
          const billingItemsData = await billingItemsResponse.json();
          if (billingItemsData.success) {
            // No projectNumber to filter by — rely on caller's .filter(item => item.booking_id === ...)
            setBillingItems(billingItemsData.data || []);
          }
        }
      } catch (error) {
        console.error("Error fetching billing items (no projectNumber):", error);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 1. Fetch Invoices (Documents)
      const invoicesResponse = await apiFetch(`/accounting/invoices?projectNumber=${projectNumber}`);
      
      // 2. Fetch Billing Items (Atoms) - FETCH ALL to allow client-side filtering by Booking ID
      const billingItemsResponse = await apiFetch("/accounting/billing-items");
      
      // 3. Fetch Expenses (Broad fetch via /evouchers to capture linked bookings)
      const expensesResponse = await apiFetch("/evouchers");

      // 4. Fetch Collections
      const collectionsResponse = await apiFetch(`/accounting/collections?project_number=${projectNumber}`);

      // 5. Fetch Quotation (Optional)
      let quotationData = null;
      if (quotationId) {
        const quotationResponse = await apiFetch(`/quotations/${quotationId}`);
        if (quotationResponse.ok) {
           const result = await quotationResponse.json();
           quotationData = result.success ? result.data : null;
        }
      }
      
      if (invoicesResponse.ok && expensesResponse.ok && billingItemsResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        const expensesResult = await expensesResponse.json();
        const billingItemsData = await billingItemsResponse.json();
        const collectionsData = collectionsResponse.ok ? await collectionsResponse.json() : { success: false, data: [] };
        
        if (invoicesData.success) {
           setInvoices(invoicesData.data.filter((b: any) => {
             const status = (b.status || "").toLowerCase();
             const paymentStatus = (b.payment_status || "").toLowerCase();
             return ["draft", "posted", "approved", "paid", "open", "partial"].includes(status) || 
                    ["paid", "partial"].includes(paymentStatus);
           }));
        }

        // Process Expenses
        let relevantExpenses: any[] = [];
        if (expensesResult.success && expensesResult.data) {
           const allEVouchers = expensesResult.data;
           
           // Create a Set of valid IDs (Project Number + All Linked Booking IDs)
           const validIds = new Set([
             projectNumber,
             ...(linkedBookings.map(b => b.bookingId))
           ]);

           // Filter for relevant expenses
           relevantExpenses = allEVouchers.filter((ev: any) => {
             // 1. Must be relevant to this project or its bookings
             const isRelevant = validIds.has(ev.project_number) || validIds.has(ev.booking_id);
             if (!isRelevant) return false;

             // 2. Must be an Expense or Budget Request
             const type = (ev.transaction_type || "").toLowerCase();
             return type === "expense" || type === "budget_request";
           }).map((ev: any) => ({
             // Map to the format expected by the rest of the hook and UI
             id: ev.id,
             evoucher_id: ev.id,
             created_at: ev.created_at || ev.request_date,
             description: ev.purpose || ev.description,
             amount: ev.total_amount || ev.amount || 0,
             total_amount: ev.total_amount || ev.amount || 0,
             currency: ev.currency || "PHP",
             status: ev.status,
             expense_category: ev.expense_category,
             is_billable: ev.is_billable,
             project_number: ev.project_number,
             booking_id: ev.booking_id,
             vendor_name: ev.vendor_name,
             payment_status: (ev.status || "").toLowerCase() === 'paid' ? 'paid' : 'unpaid'
           }));

           // Filter for valid status (Accrual basis: Approved/Posted/Paid)
           setExpenses(relevantExpenses.filter((e: any) => 
             ["approved", "posted", "paid", "partial"].includes((e.status || "").toLowerCase())
           ));
        }
        
        // Process Billing Items (Client-side filtering for robustness)
        if (billingItemsData.success) {
            const allItems = billingItemsData.data;
            const validIds = new Set([
                 projectNumber,
                 ...(linkedBookings.map(b => b.bookingId))
            ]);
            
            let relevantBillingItems = allItems.filter((item: any) => {
                // Direct match on project number
                if (item.project_number === projectNumber) return true;
                
                // Match via booking ID
                if (item.booking_id && validIds.has(item.booking_id)) return true;
                
                return false;
            });
            
            // MERGE: Add Virtual Items from Quotation (Potential Revenue)
            if (quotationData) {
               const virtualItems = convertQuotationToVirtualItems(quotationData, projectNumber);
               relevantBillingItems = mergeVirtualItemsWithRealItems(relevantBillingItems, virtualItems);
            }

            // MERGE: Add billable expenses as Unbilled Revenue (Critical for Income consistency)
            const allBillingItems = mergeBillableExpenses(relevantBillingItems, relevantExpenses);
            setBillingItems(allBillingItems);
        }
        
        if (collectionsData.success) {
          setCollections(collectionsData.data);
        }
      }
    } catch (error) {
      console.error("Error fetching financials:", error);
      toast.error("Failed to load financial data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancials();
  }, [projectNumber, JSON.stringify(linkedBookings), quotationId]);

  // -- Calculations --
  const totals = calculateFinancialTotals(invoices, billingItems, expenses, collections);

  return {
    invoices,
    billingItems,
    expenses,
    collections,
    isLoading,
    refresh: fetchFinancials,
    totals
  };
}