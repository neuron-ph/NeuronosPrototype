import { Invoice, Collection } from "../types/accounting";
import { isCollectionAppliedToInvoice } from "./collectionResolution";
import { pickReportingAmount, roundMoney } from "./accountingCurrency";

export interface InvoiceFinancialState {
  // Legacy fields — denominated in the invoice's own currency
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: 'paid' | 'partial' | 'open' | 'overdue';
  // Multi-currency fields — denominated in PHP base
  totalAmountBase: number;
  paidAmountBase: number;
  balanceBase: number;
  invoiceCurrency: string;
}

function invoiceRate(invoice: Invoice): number {
  const r = Number((invoice as any).exchange_rate);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

function collectionRate(collection: Collection): number {
  const r = Number((collection as any).exchange_rate);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/**
 * Calculates the real-time financial state of an invoice based on its linked collections.
 *
 * Returns both invoice-currency totals (legacy `balance`/`paidAmount`) and PHP-base
 * totals (`*Base`). Status is driven by `balanceBase` so cross-currency settlements
 * close the invoice correctly even when payment currency differs from invoice currency.
 */
export function calculateInvoiceBalance(
  invoice: Invoice,
  allCollections: Collection[]
): InvoiceFinancialState {
  const invoiceCurrency = ((invoice as any).original_currency || (invoice as any).currency || "PHP") as string;
  const invRate = invoiceRate(invoice);
  const totalAmount = invoice.total_amount || invoice.amount || 0;
  const totalAmountBase = pickReportingAmount(invoice as any) || roundMoney(totalAmount * invRate);

  // Walk collections once, accumulating in BOTH invoice currency (legacy) and PHP base.
  let paidAmount = 0;
  let paidAmountBase = 0;

  allCollections.forEach((collection) => {
    if (!isCollectionAppliedToInvoice(collection)) return;

    const directInvoiceId =
      (collection as any).invoice_id ||
      (collection as any).invoiceId ||
      null;
    const link = collection.linked_billings?.find((billing) => billing.id === invoice.id);

    if (link) {
      // linked_billings.amount is denominated in invoice currency (per DB convention).
      const amtInvoiceCcy = Number(link.amount) || 0;
      paidAmount += amtInvoiceCcy;
      paidAmountBase += roundMoney(amtInvoiceCcy * invRate);
      return;
    }

    if (directInvoiceId === invoice.id) {
      // Direct collection: collection.amount is in collection's own currency.
      // Translate to invoice currency for the legacy field; use base_amount for PHP.
      const collCcy = ((collection as any).original_currency || (collection as any).currency || "PHP") as string;
      const collAmt = Number(collection.amount) || 0;
      const collBase = pickReportingAmount(collection as any) || roundMoney(collAmt * collectionRate(collection));

      if (collCcy === invoiceCurrency) {
        paidAmount += collAmt;
      } else {
        // Convert PHP base back to invoice currency for the legacy field.
        paidAmount += invRate > 0 ? roundMoney(collBase / invRate) : 0;
      }
      paidAmountBase += collBase;
    }
  });

  const balance = Math.max(0, roundMoney(totalAmount - paidAmount));
  const balanceBase = Math.max(0, roundMoney(totalAmountBase - paidAmountBase));

  // Status is driven by PHP base so cross-currency settlements close cleanly.
  let status: 'paid' | 'partial' | 'open' | 'overdue' = 'open';
  const isOverdue = (() => {
    if (balanceBase <= 0) return false;
    const dueDate = new Date((invoice.due_date || invoice.created_at) as string);
    if (!invoice.due_date) dueDate.setDate(dueDate.getDate() + 30);
    dueDate.setHours(23, 59, 59, 999);
    return new Date() > dueDate;
  })();

  if (balanceBase <= 0.01) {
    status = 'paid';
  } else if (paidAmountBase > 0) {
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
    status,
    totalAmountBase,
    paidAmountBase,
    balanceBase,
    invoiceCurrency,
  };
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}
