// NEU-048 — company-wide E-Voucher transaction-type taxonomy (Accounting, 7/09).
// Single source of truth for how a transaction type is labeled across every
// E-Voucher surface (create dropdown, list, detail, approval queue, filters),
// so a voucher reads back with the same label it was created with.
//
// The 5 accounting labels map 1:1 onto the underlying transaction types. Note
// "billable" is NOT its own type — it's `expense` + is_billable — so the flag
// is needed to tell "Project Expense" from "Billable Project Expense".

const BASE_LABELS: Record<string, string> = {
  expense: "Project Expense",
  cash_advance: "Cash Advances – Project and Office Expense",
  reimbursement: "Reimbursement – Project and Office Expense",
  budget_request: "Budget Request",
  direct_expense: "Office Expense",
};

/** Human label for a transaction type. Pass `isBillable` to distinguish a
 *  Billable Project Expense from a plain Project Expense. */
export function evoucherTypeLabel(
  transactionType: string | null | undefined,
  isBillable?: boolean,
): string {
  const t = transactionType || "expense";
  if (t === "expense" && isBillable) return "Billable Project Expense";
  return BASE_LABELS[t] || BASE_LABELS.expense;
}

/** Convenience: derive the label straight from an e-voucher row, reading the
 *  billable flag from either the column or the `details` JSONB. */
export function evoucherTypeLabelFor(ev: {
  transaction_type?: string | null;
  is_billable?: boolean | null;
  details?: { is_billable?: boolean | null } | null;
}): string {
  const billable = ev?.is_billable === true || ev?.details?.is_billable === true;
  return evoucherTypeLabel(ev?.transaction_type, billable);
}
