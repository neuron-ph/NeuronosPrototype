# Neuron OS Without Accounting — How It Works Now

**Status:** Spec for review. Drawn from the code as it stands after the removal (commit `82293fd`), not from intent.
**Purpose:** agree the operating model and the scenario list, then drive it in the browser.

---

## The model in one line

**The booking is the unit of financial truth.** Every peso in the system attaches to a booking, and a booking's profit is the sum of what it billed minus what it cost. There is no layer beneath that.

Four objects carry money. Each answers exactly one question:

| Object | Answers |
|---|---|
| **E-Voucher** | What did we spend, and have we paid it? |
| **Billing line item** | What can we charge the customer for? |
| **Invoice** | What have we asked the customer to pay? |
| **Collection** | What have they actually paid? |

Nothing else. No account, no entry, no balance.

---

## Workflow A — Cost: the E-Voucher

Five types, one lifecycle, one branch. The branch is the only thing that matters:

- **Advances** (`cash_advance`, `budget_request`) — cash goes out *before* receipts exist, so they must come back and liquidate.
- **Direct-settle** (`expense`, `reimbursement`, `direct_expense`) — cash goes out *against* a known cost. One step, done.

### A1. Raise and route

Requestor fills the voucher (`AddRequestForPaymentPanel`), picks a type, adds line items from the **Expense Catalog** (free text is not possible), attaches a booking per line, submits.

Routing on submit (`resolveSubmitTarget`):

```
requestor is Executive        → pending_accounting   (skips the chain)
type is direct_expense        → pending_ceo          (CEO-only approval)
everything else               → pending_manager
```

### A2. Approve

| From | Actor needs | Goes to |
|---|---|---|
| `pending_manager` | `my_evouchers:approve` | `pending_ceo`, **or** `pending_accounting` if the approver holds `ev_approval_authority` |
| `pending_ceo` | `acct_evouchers:approve` | `pending_accounting` |

Rejection at either gate → `rejected`, back to the requestor.
The requestor can **cancel** at `draft`, `rejected`, or anywhere in the approval chain — i.e. any time before cash moves.

> **What changed:** arriving at `pending_accounting` used to also write a Dr Expense / Cr Accounts Payable entry. It doesn't any more. **Accounts payable is now derived: everything sitting at `pending_accounting` is what we owe.** Same number, no ledger.

### A3. Disburse (Treasury)

Needs `acct_evouchers:disburse`. The form is now four fields:

```
Disbursement Date · Payment Method · Reference Number · Cash Receiver (advances only)
                                     ↑ required for Check / Bank Transfer
```

Then it branches:

```
direct-settle  → posted      (finished — no liquidation)
advance        → disbursed   (the receiver now owes receipts)
```

> **What changed:** no source-account picker, no second FX rate, no realized gain/loss, no journal-entry preview. A foreign voucher now carries **one** rate — its own. What the booking cost is what actually left the bank.

### A4. Liquidate (advances only)

1. **Receiver confirms receipt** — "yes, I got the cash." Recorded on the voucher as `receipt_confirmed_at/_by`, notifies Treasury. This gates liquidation.
2. **Receiver submits liquidation** — actual spend per line, with receipts attached. Voucher → `pending_verification`.
3. **Overspend** auto-creates a reimbursement voucher (draft) for the difference.
4. **Underspend** leaves unused cash to return; Treasury confirms the return.
5. **Treasury verifies** (`acct_evouchers:disburse`) → voucher → `posted`. Advance cleared.

> **What changed:** verification used to post a pre-built closing entry, and *that entry's side effect* set the status. The status flip is now direct. The variance itself — advance vs actual — was always real data and is untouched.

### A5. Correct a finished voucher

`acct_evouchers:approve` can **unlock** a `posted` voucher back to `pending_accounting`. Previously this also mirrored the closing entry into a reversal; now it just reopens it.

### Full A-path

```
draft ─submit─► pending_manager ─► pending_ceo ─► pending_accounting
                                                        │
                                          ┌─────────────┴──────────────┐
                                   direct-settle                   advance
                                          │                            │
                                       posted                      disbursed
                                                                       │
                                                         confirm receipt│
                                                                       ▼
                                                            pending_liquidation
                                                                       │
                                                                       ▼
                                                            pending_verification
                                                                       │
                                                                       ▼
                                                                    posted
```

---

## Workflow B — Revenue: Billing → Invoice → Collection

### B1. Billing line items accrue

A booking accumulates chargeable items — from the quotation/contract rate card, or from a **billable expense** (see Workflow C). Each carries `status: 'unbilled'` and a `catalog_item_id` from the **Billing Catalog**.

### B2. Invoice built

`InvoiceBuilder` selects unbilled items for a booking → creates the invoice → marks those items `invoiced`. An item cannot be double-billed; re-invoicing is blocked at selection.

### B3. Invoice approved

NEU-103 routes every invoice to a named approver (`approval_status: pending_approval` → `approved`). Migration 249 exists solely so that approver can see the row. **It cannot be finalized until approved.**

### B4. Invoice finalized → issued

Finalize sets the invoice to `posted` and fires a **collections follow-up ticket** to Accounting — "chase this customer."

> **What changed:** finalize used to also build a Dr AR / Cr Revenue entry, and a separate accountant then opened a GL posting sheet to confirm it. Both gone. **Approved is issued** — the approver already looked, a second gate was ceremony. The follow-up ticket used to fire from inside the GL sheet; it now fires here, which is the honest trigger.

### B5. Collection recorded

Payment arrives → a collection is created against one or more invoices (`linked_billings`), with amount, date, method, reference. It is born settled — no posting step.

**Accounts receivable is now derived: issued invoices minus linked collections.**

### B6. EWT / partial payment

`calculateInvoiceBalance` computes the live balance from `collections.linked_billings`, netting EWT. Partial payments and multi-invoice collections both work off that; nothing is cached.

---

## Workflow C — The bridge: a cost becomes a charge

When an expense voucher is marked **billable** and is booking-linked, approval fires `ensure_billable_expense_billing_item` (RPC), which creates a `billing_line_item` on that booking.

That is the single seam where the cost side crosses into the revenue side. It is how a disbursement you made on the customer's behalf ends up on their invoice. Untouched by the removal.

---

## Workflow D — Where truth now lives

`useContainerFinancials` builds a booking's (or project's) financial picture from five reads:

```
invoices · billing_line_items · evouchers(expenses) · collections · quotations
```

Revenue, cost, margin, invoiced, collected, outstanding — all derived, live, from the documents themselves. **This never read the ledger, which is why no number moved when the ledger was deleted.**

Surviving reports: Sales, Collections, Receivables Aging, Unbilled Revenue, Booking Cash Flow, Financial Health, and the Finance Overview dashboard.

---

## Exception scenarios

| Scenario | Behaviour now |
|---|---|
| **Void an invoice** | Blocked if collections exist. Otherwise billing items are released back to `unbilled` and the invoice is voided. No reversing entry. |
| **Reverse an invoice** | `invoiceReversal.ts` creates a negative reversal draft. Was never GL-coupled; only the `revenue_account_id` copy was removed. |
| **Bounced collection** | `collectionResolution.ts` marks it `credited` or `refunded` with a note. Zero GL involvement, then or now. |
| **Overspent advance** | Auto-creates a reimbursement voucher for the excess. |
| **Underspent advance** | Unused cash returned; Treasury confirms before verification closes. |
| **Cancel a voucher** | Requestor, any time before disbursement. |
| **Correct a finished voucher** | Accounting unlocks `posted` → `pending_accounting`. |
| **Delete a draft invoice** | Billing items released back to `unbilled`. |

---

## Roles — and the dev cast that plays them

Grants are stored flat as `"module:action": true` in `permission_overrides.module_grants`.

| Capability | What it unlocks |
|---|---|
| `my_evouchers:edit` | raise + submit own vouchers |
| `my_evouchers:approve` | manager gate at `pending_manager` (DB also enforces a requestor-department match) |
| `acct_evouchers:approve` | CEO gate at `pending_ceo`; unlock a posted voucher |
| `acct_evouchers:disburse` | **Treasury** — release cash, verify liquidation, confirm cash return |
| `ops_bookings_invoices_tab:approve` | approve an invoice before finalize (NEU-103) |
| `accounting_financials_invoices_tab:create` / `..._collections_tab:create` | raise invoices / record collections |

### The cast (all `devpassword123`)

Each account does the job it actually holds. **No god-account.**

| Plays | Person | Login |
|---|---|---|
| **Requestor / cash receiver** | Bambi C. Badajos · Operations staff | `jr.cusdec13@falconslogistics-ph.com` |
| **Dept manager approval** | Mariella R. Soriano · Operations manager | `jr.manager02@falconslogistics-ph.com` |
| **Executive / CEO approval** | Mark D. Javier · Executive manager | `inquiry@falconslogistics-ph.com` |
| **Treasury** — disburse, verify, confirm return | Janice D. De Villa · Accounting manager | `treasury@falconslogistics-ph.com` |
| **AR** — build invoices, record collections | Marycris P. Magcalas · Accounting staff | `accountreceivables@falconslogistics-ph.com` |
| **Invoice approver** | Jerome A. Cueto · Operations team leader | `jr.supervisor02@falconslogistics-ph.com` |

Mariella holds `my_evouchers:approve` with `ev_approval_authority = false`, so manager approval routes onward to `pending_ceo` — which exercises the **full** three-gate chain rather than the shortcut.

> **Correction:** an earlier draft of this spec claimed no dev account held `acct_evouchers:disburse`. That was a bad query on my part — it probed the wrong JSONB shape. Two accounts hold it: `treasury@` (Janice, Treasury) and `wenchemaes@`. **No permission changes are needed to run any scenario below.**

---

## What no longer exists

| Gone | The question it answered is now answered by |
|---|---|
| Chart of Accounts | — (nothing needed it operationally) |
| General Journal / Transaction Journal | the documents themselves + `evoucher_history` |
| Financial Statements (P&L, BS, Cash Flow) | the bookkeeper's own system, from an export |
| Account balances | — |
| Fund transfer voucher | — (moved money sideways; changed no booking) |
| FX gain/loss | one rate per document: the actual one |
| Source-of-funds on disbursement | — (add back if Treasury asks) |

### Known wart, deliberately left

The terminal status is still the string **`posted`** on vouchers, invoices and collections — a GL verb with no ledger behind it. Renaming to `closed`/`issued`/`received` is a live data migration touching every filter, badge and tab, for a cosmetic gain. Left alone on purpose; polish later if it grates.

---

## Scenario list for the browser drive

Run as the company, not as an admin. Each scenario names **who is signed in**, and the
handoffs between them are the point — a voucher that a manager can approve but a
requestor cannot, an invoice that cannot be finalized by the person who raised it.
Sign out and back in at each handoff; that is the test.

| Step | Signed in as |
|---|---|
| 1, 5, 6, 7, 9, 19 | **Bambi** (Operations requestor / cash receiver) |
| 2 | **Mariella** (Operations manager) |
| 3 | **Mark** (Executive) |
| 4, 8, 20 | **Janice** (Treasury) |
| 10–18, 21–22 | **Marycris** (AR), with **Jerome** for the approval step |
| 23 | any |

**Cost path**
1. Raise a **Project Expense** with catalog line items + booking → submit → verify it lands at `pending_manager`.
2. Approve as manager → verify routing to `pending_ceo` or `pending_accounting`.
3. Approve as CEO → `pending_accounting`. **Confirm no journal row is created** (table's gone — confirm no error either).
4. Disburse it → verify the 4-field form, and that it goes straight to `posted` (direct-settle).
5. Raise a **Cash Advance** → approve → disburse → verify it goes to `disbursed` and names a cash receiver.
6. As the receiver, **confirm receipt** → verify it's recorded and liquidation unlocks.
7. Submit **liquidation** with an underspend → verify variance + cash-return prompt.
8. Treasury **verifies** → voucher reaches `posted` *(this is the one that would have stranded if the status flip hadn't been made direct)*.
9. Submit a liquidation with an **overspend** → verify the reimbursement voucher is auto-created.

**Revenue path**
10. Confirm **billable expense** created a billing line item on its booking.
11. Build an **invoice** from unbilled items → verify items flip to `invoiced` and can't be re-selected.
12. **Approve** the invoice → verify finalize is blocked until then.
13. **Finalize** → verify status, the AR follow-up ticket fires, and **no GL posting sheet appears**.
14. Record a **partial collection** → verify the invoice balance recalculates and AR is right.
15. Record the **balance** → verify it settles fully.

**Exceptions**
16. **Void** an invoice with no collections → verify billing items return to `unbilled`.
17. Try to **void** an invoice that has collections → verify it's blocked.
18. **Credit/refund** a bounced collection.
19. **Cancel** a voucher mid-approval.
20. **Unlock** a posted voucher for correction.

**Integrity**
21. Open the **booking financials** tab → verify revenue/cost/margin/collected/outstanding are consistent with everything above.
22. Open **Finance Overview** and the surviving reports → verify they render and reconcile.
23. Confirm the sidebar has **no** Chart of Accounts, General Journal or Financial Statements, and that direct URLs to them 404.

---

## Two things to confirm before driving

1. **Grant `acct_evouchers:disburse`** to a dev account, or scenarios 4–9 can't run.
2. **Is the run order right,** and is anything missing that you'd want proven?
