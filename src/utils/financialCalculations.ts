import type { FinancialTotalsV2 } from "../types/financials";
import { isCollectionAppliedToInvoice } from "./collectionResolution";
import { isInvoiceFinanciallyActive } from "./invoiceReversal";

export type FinancialTotals = FinancialTotalsV2;

/** Raw DB row — used as input type for functions accepting Supabase rows */
type RawRow = Record<string, unknown>;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Pull the PHP-base reporting amount off a row. Prefers `base_amount` (set by
 * the multi-currency migration), falls back to raw `amount` / `total_amount`
 * for legacy rows that predate it.
 */
const baseAmt = (row: RawRow): number => {
  if (row.base_amount != null) {
    const parsed = Number(row.base_amount);
    if (Number.isFinite(parsed)) return parsed;
  }
  return num(row.amount) || num(row.total_amount);
};

/**
 * PHP-base remaining balance for an invoice row. `remaining_balance` is
 * stored in the document's original currency, so for USD invoices we must
 * translate via `exchange_rate` before aggregating with PHP balances.
 *
 * Falls back to `base_amount` when no remaining_balance is set, and to the
 * raw amount for legacy rows with no FX metadata.
 */
const baseRemainingBalance = (row: RawRow): number => {
  if (row.remaining_balance == null) return baseAmt(row);
  const remainingOriginal = num(row.remaining_balance);
  const rate = Number(row.exchange_rate);
  if (Number.isFinite(rate) && rate > 0 && rate !== 1) {
    return remainingOriginal * rate;
  }
  return remainingOriginal;
};

const str = (value: unknown): string => {
  return typeof value === "string" ? value.toLowerCase() : "";
};

export const calculateFinancialTotals = (
  invoices: RawRow[],
  billingItems: RawRow[],
  expenses: RawRow[],
  collections: RawRow[]
): FinancialTotals => {
  const activeInvoices = invoices.filter((invoice) => isInvoiceFinanciallyActive(invoice));

  const invoicedAmount = activeInvoices.reduce(
    (sum, item) => sum + baseAmt(item), 0
  );

  const unbilledCharges = billingItems
    .filter(item => str(item.status) === "unbilled")
    .reduce((sum, item) => sum + baseAmt(item), 0);

  const bookedCharges = invoicedAmount + unbilledCharges;

  // Canonical expense status filter — matches mapEvoucherExpensesForScope in financialSelectors.ts
  const APPROVED_EXPENSE_STATUSES = ["approved", "posted", "paid", "partial"];

  const approvedExpenses = expenses.filter(item =>
    APPROVED_EXPENSE_STATUSES.includes(str(item.status))
  );

  const directCost = approvedExpenses.reduce((sum, item) => sum + baseAmt(item), 0);

  const collectedAmount = collections
    .filter((item) => isCollectionAppliedToInvoice(item))
    .reduce((sum, item) => sum + baseAmt(item), 0);

  // paidDirectCost = only expenses where cash has actually gone out
  const paidDirectCost = approvedExpenses
    .filter(item =>
      ["paid", "partial"].includes(str(item.status)) ||
      ["paid", "cleared"].includes(str(item.payment_status))
    )
    .reduce((sum, item) => sum + baseAmt(item), 0);

  const netCashFlow = collectedAmount - paidDirectCost;

  const grossProfit = bookedCharges - directCost;
  const grossMargin = bookedCharges > 0 ? (grossProfit / bookedCharges) * 100 : 0;

  // Helper to check overdue. Compare against the PHP-base balance so a near-
  // zero USD residual (e.g. 0.005 USD) does not trip on the 0.01 threshold.
  const checkOverdue = (item: RawRow): boolean => {
    if (["paid", "cleared"].includes(str(item.payment_status))) return false;

    const balance = baseRemainingBalance(item);
    if (balance <= 0.01) return false;

    const dueDateStr = (item.due_date || item.created_at) as string | undefined;
    if (!dueDateStr) return false;

    const dueDate = new Date(dueDateStr);
    if (!item.due_date) dueDate.setDate(dueDate.getDate() + 30);

    return new Date() > dueDate;
  };

  const outstandingAmount = activeInvoices.reduce((sum, item) => {
    if (["paid", "cleared"].includes(str(item.payment_status))) return sum;
    return sum + baseRemainingBalance(item);
  }, 0);

  const overdueAmount = activeInvoices
    .filter((b) => checkOverdue(b))
    .reduce((sum, item) => sum + baseRemainingBalance(item), 0);

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
  existingBillingItems: RawRow[],
  expenses: RawRow[]
): RawRow[] => {
  const existingSourceIds = new Set(
    existingBillingItems.map((b) => b.source_id as string | undefined).filter(Boolean)
  );

  const billableExpenses = expenses
    .filter((e) =>
      e.is_billable &&
      ["approved", "posted", "paid", "partial"].includes(str(e.status)) &&
      !existingSourceIds.has((e.evoucher_id || e.id) as string)
    )
    .map((e): RawRow => ({
      id: e.id,
      created_at: e.created_at || e.request_date,
      service_type: "Reimbursable Expense",
      description: e.description || e.purpose,
      amount: e.amount || e.total_amount,
      currency: e.currency || "PHP",
      status: "unbilled",
      quotation_category: e.expense_category || "Billable Expenses",
      booking_id: e.booking_id || null,
      source_id: e.evoucher_id || e.id,
      source_type: "billable_expense",
      vendor: e.vendor_name,
      project_number: e.project_number,
    }));

  return [...existingBillingItems, ...billableExpenses];
};

/**
 * Helper to convert Quotation Selling Price Items to Virtual Billing Items
 */
export const convertQuotationToVirtualItems = (quotation: RawRow, projectNumber: string): RawRow[] => {
  const sellingPrice = quotation?.selling_price;
  if (!Array.isArray(sellingPrice)) return [];

  const virtualItems: RawRow[] = [];

  sellingPrice.forEach((cat: Record<string, unknown>) => {
    const lineItems = cat.line_items;
    if (!Array.isArray(lineItems)) return;

    lineItems.forEach((item: Record<string, unknown>) => {
      virtualItems.push({
        id: `virtual-${item.id}`,
        source_id: item.id,
        source_quotation_item_id: item.id,
        source_type: "quotation_item",
        is_virtual: true,
        created_at: (quotation.created_at as string) || new Date().toISOString(),
        service_type: item.service || "General",
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        status: "unbilled",
        quotation_category: cat.category_name,
        booking_id: null,
        project_number: projectNumber,
        quantity: item.quantity,
        forex_rate: item.forex_rate,
        is_taxed: item.is_taxed,
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
  realItems: RawRow[],
  virtualItems: RawRow[]
): RawRow[] => {
  const existingSourceIds = new Set<string>();

  realItems.forEach((item) => {
    const sqid = item.source_quotation_item_id as string | undefined;
    const sid = item.source_id as string | undefined;
    const stype = item.source_type as string | undefined;
    if (sqid) existingSourceIds.add(sqid);
    if (sid && stype === "quotation_item") existingSourceIds.add(sid);
  });

  const newVirtualItems = virtualItems.filter(v => {
    const sqid = v.source_quotation_item_id as string | undefined;
    const sid = v.source_id as string | undefined;
    return (!sqid || !existingSourceIds.has(sqid)) && (!sid || !existingSourceIds.has(sid));
  });

  return [...realItems, ...newVirtualItems];
};
