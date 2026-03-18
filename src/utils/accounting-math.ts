import { Invoice, Collection } from "../types/accounting";
import { isCollectionAppliedToInvoice } from "./collectionResolution";

export interface InvoiceFinancialState {
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: 'paid' | 'partial' | 'open' | 'overdue';
}

/**
 * Calculates the real-time financial state of an invoice based on its linked collections.
 * This ensures the UI reflects payment status immediately without waiting for DB updates.
 */
export function calculateInvoiceBalance(
  invoice: Invoice, 
  allCollections: Collection[]
): InvoiceFinancialState {
  const totalAmount = invoice.total_amount || invoice.amount || 0;

  // 1. Calculate total paid from linked collections
  const paidAmount = allCollections.reduce((sum, collection) => {
    if (!isCollectionAppliedToInvoice(collection)) return sum;

    // Find if this collection pays off this specific invoice
    const link = collection.linked_billings?.find(
      (billing) => billing.id === invoice.id
    );

    if (link) {
      return sum + (link.amount || 0);
    }

    const directInvoiceId =
      (collection as any).invoice_id ||
      (collection as any).invoiceId ||
      null;

    if (directInvoiceId === invoice.id) {
      return sum + (collection.amount || 0);
    }

    return sum;
  }, 0);

  // 2. Calculate Balance
  // Round to 2 decimals to avoid floating point errors
  const balance = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);

  // 3. Determine Status
  let status: 'paid' | 'partial' | 'open' | 'overdue' = 'open';
  
  // Logic for Overdue
  const isOverdue = (() => {
    if (balance <= 0) return false;
    const dueDate = new Date(invoice.due_date || invoice.created_at);
    if (!invoice.due_date) dueDate.setDate(dueDate.getDate() + 30);
    // Set to end of day for fair comparison
    dueDate.setHours(23, 59, 59, 999);
    return new Date() > dueDate;
  })();

  if (balance <= 0.01) { // Tolerance for tiny rounding errors
    status = 'paid';
  } else if (paidAmount > 0) {
    status = 'partial';
  } else if (isOverdue) {
    status = 'overdue';
  } else {
    status = 'open';
  }

  return {
    totalAmount,
    paidAmount,
    balance,
    status
  };
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}
