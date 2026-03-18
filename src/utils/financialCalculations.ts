import type { FinancialTotalsV2 } from "../types/financials";
import { isCollectionAppliedToInvoice } from "./collectionResolution";
import { isInvoiceFinanciallyActive } from "./invoiceReversal";

export type FinancialTotals = FinancialTotalsV2;

export const calculateFinancialTotals = (
  invoices: any[],
  billingItems: any[],
  expenses: any[],
  collections: any[]
): FinancialTotals => {
  const activeInvoices = invoices.filter((invoice) => isInvoiceFinanciallyActive(invoice));
  
  const invoicedAmount = activeInvoices.reduce((sum, item) => sum + (Number(item.amount) || Number(item.total_amount) || 0), 0);
  
  const unbilledCharges = billingItems
    .filter(item => (item.status || "").toLowerCase() === 'unbilled')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
  const bookedCharges = invoicedAmount + unbilledCharges;

  const directCost = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const collectedAmount = collections
    .filter((item) => isCollectionAppliedToInvoice(item))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  
  const paidDirectCost = expenses
    .filter(item => ["paid", "cleared"].includes((item.status || "").toLowerCase()) || ["paid", "cleared"].includes((item.payment_status || "").toLowerCase()))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const netCashFlow = collectedAmount - paidDirectCost;

  const grossProfit = bookedCharges - directCost;
  const grossMargin = bookedCharges > 0 ? (grossProfit / bookedCharges) * 100 : 0;

  // Helper to check overdue
  const checkOverdue = (item: any) => {
    if (["paid", "cleared"].includes((item.payment_status || "").toLowerCase())) return false;
    
    const balance = item.remaining_balance ?? item.amount ?? item.total_amount ?? 0;
    if (balance <= 0.01) return false;

    const dueDateStr = item.due_date || item.created_at;
    if (!dueDateStr) return false;
    
    const dueDate = new Date(dueDateStr);
    if (!item.due_date) dueDate.setDate(dueDate.getDate() + 30);
    
    return new Date() > dueDate;
  };

  const outstandingAmount = activeInvoices
    .reduce((sum, item) => {
      const isPaid = ["paid", "cleared"].includes((item.payment_status || "").toLowerCase());
      if (isPaid) return sum;
      
      const balance = item.remaining_balance !== undefined ? Number(item.remaining_balance) : (Number(item.amount) || Number(item.total_amount) || 0);
      return sum + balance;
    }, 0);
  
  const overdueAmount = activeInvoices
    .filter(b => checkOverdue(b))
    .reduce((sum, item) => {
      const balance = item.remaining_balance !== undefined ? Number(item.remaining_balance) : (Number(item.amount) || Number(item.total_amount) || 0);
      return sum + balance;
    }, 0);

  return {
    bookedCharges,
    unbilledCharges,
    invoicedAmount,
    collectedAmount,
    directCost,
    paidDirectCost,
    netCashFlow,
    grossProfit,
    grossMargin,
    outstandingAmount,
    overdueAmount,
  };
};

/**
 * Merges billable expenses into billing items list if they haven't been invoiced yet.
 * This ensures "pass-through" costs are counted as potential (unbilled) revenue.
 */
export const mergeBillableExpenses = (
  existingBillingItems: any[],
  expenses: any[]
): any[] => {
  // Deduplication: Create a Set of existing source_ids from real billing items
  const existingSourceIds = new Set(existingBillingItems.map((b: any) => b.source_id));

  // Merge Billable Expenses into Billing Items
  const billableExpenses = expenses
    .filter((e: any) => 
      e.is_billable && 
      ["approved", "posted", "paid", "partial"].includes((e.status || "").toLowerCase()) &&
      !existingSourceIds.has(e.evoucher_id || e.id) // Exclude if already exists as a billing item
    )
    .map((e: any) => ({
      id: e.id,
      created_at: e.created_at || e.request_date,
      service_type: "Reimbursable Expense",
      description: e.description || e.purpose,
      amount: e.amount || e.total_amount,
      currency: e.currency || "PHP",
      status: 'unbilled', // Default for virtual items
      quotation_category: e.expense_category || "Billable Expenses",
      booking_id: e.booking_id || null,
      source_id: e.evoucher_id || e.id,
      source_type: 'billable_expense',
      vendor: e.vendor_name,
      project_number: e.project_number
    }));

  return [...existingBillingItems, ...billableExpenses];
};

/**
 * Helper to convert Quotation Selling Price Items to Virtual Billing Items
 */
export const convertQuotationToVirtualItems = (quotation: any, projectNumber: string): any[] => {
  if (!quotation?.selling_price) return [];

  const virtualItems: any[] = [];

  quotation.selling_price.forEach((cat: any) => {
    if (!cat.line_items) return;
    
    cat.line_items.forEach((item: any) => {
      virtualItems.push({
        id: `virtual-${item.id}`,
        source_id: item.id, // Generic source ID for tracking
        source_quotation_item_id: item.id, // Specific ID for backend matching
        source_type: 'quotation_item',
        is_virtual: true,
        created_at: quotation.created_at || new Date().toISOString(),
        service_type: item.service || "General",
        description: item.description,
        amount: item.amount, // This is final_price (unit * qty * forex)
        currency: item.currency,
        status: 'unbilled', // Virtual items are always unbilled
        quotation_category: cat.category_name,
        booking_id: null,
        project_number: projectNumber,
        // Extended fields
        quantity: item.quantity,
        forex_rate: item.forex_rate,
        is_taxed: item.is_taxed
      });
    });
  });

  return virtualItems;
};

/**
 * Merges Real Billing Items with Virtual Quotation Items
 * Prevents double-counting by excluding virtual items that have been "realized" (saved)
 */
export const mergeVirtualItemsWithRealItems = (
  realItems: any[], 
  virtualItems: any[]
): any[] => {
  // Identify which Quotation Items are already saved as Real Billing Items
  const existingSourceIds = new Set<string>();
  
  realItems.forEach((item: any) => {
    if (item.source_quotation_item_id) existingSourceIds.add(item.source_quotation_item_id);
    if (item.source_id && item.source_type === 'quotation_item') existingSourceIds.add(item.source_id);
  });

  // Only add Virtual Items that don't have a Real counterpart yet
  const newVirtualItems = virtualItems.filter(v => 
      !existingSourceIds.has(v.source_quotation_item_id) && 
      !existingSourceIds.has(v.source_id)
  );

  return [...realItems, ...newVirtualItems];
};
