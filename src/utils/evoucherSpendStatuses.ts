// What counts as money spent (finding P6).
//
// Seven call sites each carried their own copy of
// `['approved','posted','paid','partial']`, and on production that list matches
// NOTHING:
//
//   * `paid` and `partial` are invoice vocabulary. No e-voucher has ever
//     carried either.
//   * `posted` is a legal terminal status in the 270 state machine but no live
//     row has reached it yet.
//   * the two rows that ARE approved carry `Approved` with a capital A, and the
//     comparisons were case-sensitive — including a PostgREST `.in()`, which
//     cannot be made case-insensitive.
//
// So cost of sales drew from an empty set while ₱535,150.25 sat at `disbursed`
// — cash actually out of the door — because `disbursed` was in nobody's list.
//
// The statuses below are the ones from migration 270's transition matrix where
// the money has left or is irrevocably committed. Approval steps are deliberately
// NOT here: a voucher at `pending_accounting` is a request, not a cost, and
// counting it is what made the Expenses tab overstate spend 5× (finding P5).
// NOTE this EXTENDS the old list rather than replacing it. `paid` and `partial`
// match no e-voucher row, but downstream code keys `payment_status` off them and
// tests pin that behaviour — pruning them would be a purity change with real
// consequences and no benefit. The bug was what was ABSENT, not what was present.
export const SPENT_EVOUCHER_STATUSES = [
  "disbursed",             // Treasury released the cash — was missing, ₱535,150.25
  "pending_liquidation",   // an advance is out, awaiting receipts
  "pending_verification",  // receipts in, Treasury checking
  "posted",                // settled and closed
  "approved",              // legacy rows, before the state machine
  "paid",                  // carried over: invoice vocabulary, no e-voucher has it
  "partial",               // carried over, same
] as const;

/** Case-insensitive, because production carries `Approved` and `disbursed`. */
export function isEvoucherSpent(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return (SPENT_EVOUCHER_STATUSES as readonly string[]).includes(s);
}

/**
 * For PostgREST `.in()`, which is case-SENSITIVE and cannot be told otherwise.
 * Every casing seen in the data has to be listed explicitly; prefer filtering
 * with `isEvoucherSpent` in TypeScript where you have the choice.
 */
export const SPENT_EVOUCHER_STATUSES_FOR_QUERY: string[] = [
  ...SPENT_EVOUCHER_STATUSES,
  ...SPENT_EVOUCHER_STATUSES.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
];
