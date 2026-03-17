import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
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
        const { data, error } = await supabase.from('billing_line_items').select('*');
        if (!error && data) {
          setBillingItems(data);
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
      
      // Parallel fetch from Supabase tables
      const [
        { data: invoiceRows, error: invoiceErr },
        { data: billingItemRows, error: billingErr },
        { data: evoucherRows, error: evoucherErr },
        { data: collectionRows, error: collectionErr },
        { data: expenseRows, error: expenseErr },
      ] = await Promise.all([
        supabase.from('invoices').select('*').eq('project_number', projectNumber),
        supabase.from('billing_line_items').select('*'),
        supabase.from('evouchers').select('*'),
        supabase.from('collections').select('*').eq('project_number', projectNumber),
        supabase.from('expenses').select('*').eq('project_number', projectNumber),
      ]);

      // 5. Fetch Quotation (Optional)
      let quotationData = null;
      if (quotationId) {
        const { data: qData } = await supabase
          .from('quotations')
          .select('*')
          .eq('id', quotationId)
          .maybeSingle();
        quotationData = qData;
      }
      
      // Process Invoices
      if (!invoiceErr && invoiceRows) {
        setInvoices(invoiceRows.filter((b: any) => {
          const status = (b.status || "").toLowerCase();
          const paymentStatus = (b.payment_status || "").toLowerCase();
          return ["draft", "posted", "approved", "paid", "open", "partial"].includes(status) || 
                 ["paid", "partial"].includes(paymentStatus);
        }));
      }

      // Process Expenses — from the dedicated expenses table
      let relevantExpenses: any[] = [];
      if (!expenseErr && expenseRows) {
        relevantExpenses = expenseRows;
        const mapped = expenseRows
          .filter((exp: any) =>
            ["approved", "posted", "paid", "partial"].includes((exp.status || "").toLowerCase())
          )
          .map((exp: any) => ({
            id: exp.id,
            expenseName: exp.receipt_number || exp.id,
            expenseCategory: exp.category || "General",
            vendorName: exp.vendor_name || "—",
            description: exp.description || "",
            bookingId: exp.booking_id || exp.project_number || "",
            expenseDate: exp.created_at,
            createdAt: exp.created_at,
            status: exp.status || "draft",
            amount: exp.amount || 0,
            currency: exp.currency || "PHP",
            isBillable: exp.is_billable || false,
            serviceType: exp.service_type,
            projectNumber: exp.project_number,
          }));
        setExpenses(mapped);
      }
      
      // Process Billing Items (Client-side filtering for robustness)
      if (!billingErr && billingItemRows) {
          const allItems = billingItemRows;
          const validIds = new Set([
               projectNumber,
               ...(linkedBookings.map(b => b.bookingId))
          ]);
          
          let relevantBillingItems = allItems.filter((item: any) => {
              if (item.project_number === projectNumber) return true;
              if (item.booking_id && validIds.has(item.booking_id)) return true;
              return false;
          });
          
          // MERGE: Add Virtual Items from Quotation (Potential Revenue)
          if (quotationData) {
             const virtualItems = convertQuotationToVirtualItems(quotationData, projectNumber);
             relevantBillingItems = mergeVirtualItemsWithRealItems(relevantBillingItems, virtualItems);
          }

          // MERGE: Add billable expenses as Unbilled Revenue
          const allBillingItems = mergeBillableExpenses(relevantBillingItems, relevantExpenses);
          setBillingItems(allBillingItems);
      }
      
      if (!collectionErr && collectionRows) {
        setCollections(collectionRows);
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