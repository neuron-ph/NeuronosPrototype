// NEU-049 — payment-due-date urgency for E-Vouchers (Accounting, 7/09).
// A live countdown from TODAY to the payment due date, surfaced as a colored
// pill while a voucher is still awaiting payment (pre-disbursement). Once cash
// has gone out (disbursed / posted / terminal) the countdown is moot and hidden.

export type PaymentUrgencyLevel = "red" | "orange" | "yellow";

export interface PaymentUrgency {
  label: string;
  level: PaymentUrgencyLevel;
}

// Statuses where cash has NOT yet been released — the payment is still owed, so
// the countdown is meaningful. Anything from `disbursed` onward is done/terminal.
const AWAITING_PAYMENT = new Set<string>([
  "draft", "Draft",
  "pending_manager", "pending_tl", "pending_ceo", "pending_accounting",
  "pending", "Submitted", "Under Review", "Approved", "Processing",
]);

/** Whole calendar days from today (local midnight) to the due date. */
function daysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return NaN;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** The effective payment due date for a voucher. The `due_date` COLUMN is null
 *  on every row today — the value lives in the `details` JSONB — and the list's
 *  `{...details, ...row}` merge clobbers it back to null, so callers must resolve
 *  from both. Prefer the column when present (future-proof) then fall back. */
export function resolveEvoucherDueDate(ev: {
  due_date?: string | null;
  details?: { due_date?: string | null } | null;
}): string | null {
  return ev?.due_date || ev?.details?.due_date || null;
}

/** Convenience: urgency straight from an e-voucher row (resolves the due date
 *  from the column or `details`). */
export function getPaymentUrgencyFor(ev: {
  due_date?: string | null;
  status?: string | null;
  details?: { due_date?: string | null } | null;
}): PaymentUrgency | null {
  return getPaymentUrgency(resolveEvoucherDueDate(ev), ev?.status);
}

/** Urgency pill for a voucher's payment due date, or null when there is no due
 *  date, it is unparseable, or the voucher is already paid / terminal. */
export function getPaymentUrgency(
  dueDate: string | null | undefined,
  status: string | null | undefined,
): PaymentUrgency | null {
  if (!dueDate) return null;
  if (status && !AWAITING_PAYMENT.has(status)) return null;
  const d = daysUntilDue(dueDate);
  if (isNaN(d)) return null;
  if (d < 0) return { label: "Overdue", level: "red" };
  if (d === 0) return { label: "Due today", level: "red" };
  if (d === 1) return { label: "Due in 1d", level: "orange" };
  return { label: `Due in ${d}d`, level: "yellow" };
}

const LEVEL_STYLE: Record<PaymentUrgencyLevel, { background: string; color: string }> = {
  red: { background: "var(--theme-urgency-red-bg)", color: "var(--theme-urgency-red-fg)" },
  orange: { background: "var(--theme-urgency-orange-bg)", color: "var(--theme-urgency-orange-fg)" },
  yellow: { background: "var(--theme-urgency-yellow-bg)", color: "var(--theme-urgency-yellow-fg)" },
};

/** Inline background/color for a pill at the given urgency level. */
export function paymentUrgencyStyle(level: PaymentUrgencyLevel) {
  return LEVEL_STYLE[level];
}

/** Text color for an AMOUNT tinted by urgency: red when overdue/due today,
 *  amber when due soon (1 day), null (default color) otherwise — a yellow
 *  amount would be unreadable, and 2d+ isn't urgent enough to color the money. */
export function paymentUrgencyAmountColor(
  level: PaymentUrgencyLevel | null | undefined,
): string | null {
  if (level === "red") return "var(--theme-urgency-red-fg)";
  if (level === "orange") return "var(--theme-urgency-orange-fg)";
  return null;
}
