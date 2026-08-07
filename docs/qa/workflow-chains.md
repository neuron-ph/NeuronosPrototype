# Neuron OS — Workflow Chains

Hand-verified from source, one entity at a time. For each chain: every state,
every transition, the permission gate, and the actor. Where the actor changes,
a Playwright test needs a second browser context.

Method: find every write site for the entity's status column, read each one,
then draw the chain. Not inferred from docs or naming.

Companion artifacts:
- `inventory.json` — routes, doors, write sites (generated)
- `personas.json` — who holds which gate in dev (generated)
- `status-vocabulary.sql` — observed state values (re-runnable)

Verified against `dev` (`oqermaidggvanahumjmj`) on 2026-08-03.

---

## 1. E-Voucher

Table `evouchers`. Gates are permission keys, not roles.

```
draft
 ├ submit ─┬ actor dept = Executive, or raised from Accounting → pending_accounting
 │         └ otherwise                                          → pending_manager
 │           gate: isOwner + my_evouchers:edit
 └ cancel → cancelled                                            gate: isOwner

pending_manager
 ├ approve   → pending_ceo                        gate: my_evouchers:approve
 └ send back → draft

pending_ceo
 ├ approve   → pending_accounting                 gate: acct_evouchers:approve
 └ send back → draft

pending_accounting
 ├ disburse ─┬ settles directly → posted
 │           └ otherwise        → disbursed       gate: acct_evouchers:disburse
 └ send back → draft

disbursed                       — advances only (cash_advance | budget_request)
 ├ confirm receipt → disbursed   flag in details.receipt_confirmed_at, NOT a status
 │                               gate: tagged cash receiver
 └ add receipts    → pending_liquidation

pending_liquidation
 └ submit final → pending_verification
                  + auto-creates a draft Reimbursement EV if overspent
                  gate: cash_receiver_id, falling back to owner if none tagged

pending_verification
 ├ return        → pending_liquidation            gate: acct_evouchers:disburse
 └ verify & post → posted                         gate: acct_evouchers:disburse
                   blocked unless every receipt line has an attachment
                   and any unused cash return is confirmed

posted
 └ unlock for correction → pending_accounting     gate: acct_evouchers:approve
```

Cancel is available to the owner at `draft`, `pending_manager`, `pending_ceo`,
`pending_accounting`. Once cash has moved it needs unlock/reversal instead.

Send-back always returns to `draft` — a full re-traverse from any stage, never a
partial hop back one step (NEU-098).

Non-advance voucher types never enter the liquidation arm; they end at `posted`.

**Actor changes:** submit → approve → disburse → liquidate → verify. Five
contexts worst case.

**Testing constraint:** `acct_evouchers:disburse` is held by only 2 active dev
users (`treasury@falconslogistics-ph.com`, `wenchemaes@gmail.com`). Everything
from disbursement onward runs through one of them.

**Removed 2026-08-03:** `ev_approval_authority` let a delegated TL skip the CEO
gate. It was client-side only — no RLS policy or DB function ever read it — and
was never enabled for a single user in dev or prod. Branch, plumbing and admin
toggle are gone; migration 268 drops the column. The manager step now always
routes to `pending_ceo`.

**Residue, not live paths:** one dev row has status `Approved` (capitalized,
not in the machine). `canCancel` references a `rejected` status nothing writes.

---

## 2. Quotation

Table `quotations`. This is **not** a guarded state machine — `handleStatusChange`
accepts any status and normalizes it. The real constraint is which buttons
`StatusChangeButton` renders for the current status.

Two gates, and almost every action accepts either:
- `canActAsBD` = `bd_inquiries:edit`
- `canActAsPricing` = `pricing_quotations:edit`

```
Draft
 └ Submit for Pricing → Pending Pricing           gate: BD or Pricing
                        + workflow ticket to Pricing dept
                          (resolutionAction: set_quotation_priced)

Pending Pricing
 ├ Mark as Priced     → Priced                    gate: Pricing ONLY
 └ Request Revision   → Needs Revision            gate: Pricing ONLY

Priced
 ├ Send to Client     → Sent to Client            gate: BD or Pricing
 └ Mark as Ongoing    → Needs Revision            gate: BD or Pricing

Needs Revision
 ├ Send to Client     → Sent to Client            gate: BD or Pricing
 └ Recall for Edits   → Draft                     gate: BD or Pricing

Sent to Client
 ├ Mark as Approved   → Accepted by Client        gate: BD or Pricing
 ├ Mark as Ongoing    → Needs Revision            gate: BD or Pricing
 └ Recall for Edits   → Draft                     gate: BD or Pricing

Accepted by Client
 ├ convert to project  → Converted to Project     (QuotationFileView)
 └ activate contract   → Converted to Contract    (QuotationFileView /
                                                   ContractDetailView)

Converted to Contract
 └ Mark as Expired → contract_status = Expired    gate: BD or Pricing
                     only when contract_status is Active or Expiring
                     NOTE: changes contract_status, NOT status

any state except Converted to Project / Converted to Contract / Disapproved / Cancelled
 └ Disapprove or Cancel → Rejected by Client | Disapproved | Cancelled
                          requires a reason from a fixed list
                          gate: NONE — see finding below
```

`isQuotationLocked()` makes `Converted to Project` and `Converted to Contract`
terminal — also triggered by the presence of `project_id` / `project_number`.

**Actor changes:** BD submits → Pricing prices → BD sends and closes. Two
contexts minimum, three if a Pricing-only revision is exercised.

### Finding — Disapprove/Cancel has no permission check

Every other action in `StatusChangeButton` is gated on `canActAsBD ||
canActAsPricing`. The Disapprove/Cancel entry is rendered on status alone
(`StatusChangeButton.tsx:352`). A user with neither edit grant who can open a
quotation sees the option and can click it.

An in-file comment at line 84 claims Mark as Expired "was the only status action
with no can() check" — that is no longer accurate; this one has none either.

Not confirmed whether RLS on `quotations` blocks the write. Worth checking before
treating it as exploitable — the affordance is definitely ungated.

### Finding — "Pricing in Progress" silently reads as Draft

`QuotationFileView.tsx:193` — assigning a pricing reviewer creates a workflow
ticket with `resolutionAction: "set_quotation_pricing_in_progress"`. Resolving
that ticket writes `status = "Pricing in Progress"`
(`workflowTickets.ts:214`).

`"Pricing in Progress"` is not in `CANONICAL_QUOTATION_STATUSES`, so
`normalizeQuotationStatus` falls through to its `default` and returns **`Draft`**
(`quotationStatus.ts:116`).

So resolving that ticket appears to send the quotation backwards to Draft,
losing `Pending Pricing`. No dev rows currently hold the value, so either the
path is rarely taken or the reversion has gone unnoticed.

`dashboardFetchers.ts` also queries several non-canonical statuses — `New`,
`Pending`, `Submitted`, `Assigned to Pricing`, `Pricing in Progress` — none of
which exist in dev data. Those dashboard tiles are matching nothing.

---

## 3. Booking

Table `bookings`. Status vocabulary is **per service type**, from
`SERVICE_STATUS_OPTIONS` (`config/booking/bookingFieldOptions.ts`):

| Service | States offered in the dropdown |
|---|---|
| Brokerage | Draft, Waiting for Arrival, Ongoing, Delivered, Billed, Paid, Audited, Cancelled |
| Forwarding | Draft, Ongoing, In Transit, Delivered, Completed, Billed, Paid, Cancelled |
| Trucking | Draft, Ongoing, Delivered, Empty Return, Liquidated, Billed, Paid, Cancelled |
| Marine Insurance | Draft, Ongoing, Issued, Billed, Paid, Cancelled |
| Others | Draft, Ongoing, Completed, Billed, Paid, Cancelled |

```
(no booking)
 ├ save draft  → Draft                            saveBookingDraft.ts
 └ submit      → Created                          all five Create*Panel components

Draft | Created | …
 └ change status → any value in that service's dropdown
                   free selection, no transition guard

any status in CANCELLABLE_STATUSES
 └ cancel → Cancelled                             BookingCancelDeletePanel
            CANCELLABLE_STATUSES = Created, Draft, Pending,
                                   Confirmed, In Progress, On Hold
            blocked once Delivered / Completed / Cancelled / Closed
            also blocked by attached financials (invoices, collections,
            expenses, e-vouchers — counted and named in the error)

Draft only
 └ delete → row removed                           DELETABLE_STATUS = "Draft"

billing_status (separate column, CHECK-constrained: unbilled | billed | partial)
 └ set_booking_billed → billed                    via workflow ticket resolution
                                                   (RequestBillingButton)
```

Like quotations, status is operator-chosen — there is no allowed-transition
table. The dropdown contents are the only constraint.

**Actor changes:** Ops creates and drives status; Accounting flips
`billing_status`. Two contexts.

### Finding — 92% of bookings appear in no status tab — **FIXED 2026-08-03**

Fixed on `dev` branch, not yet released. `BOOKING_STATUS_BUCKETS` in
`config/booking/bookingFieldOptions.ts` is now the single source of truth,
colocated with `SERVICE_STATUS_OPTIONS` so the vocabulary and its buckets can't
drift apart. `useBookingsPaginated.ts` reads it for both the list query and the
counts query. `bookingStatusBuckets.test.ts` fails the build if a status is
added without being bucketed.

After the fix, every booking buckets — zero orphaned in either environment:

```
                dev              prod
Draft            13               17
In Progress     188              248
Completed        33               70
Archived          3                3
orphaned          0                0
total           237              338
```

The original finding, kept for the record:

The list tabs filter on exact status values (`useBookingsPaginated.ts:121-128`):

```
draft       → status = "Draft"
in-progress → status = "In Progress"
completed   → status = "Completed"
cancelled   → status in ("Cancelled", "Closed", "Paid")
```

But `"In Progress"` is a legacy value that appears in **no** service's dropdown,
and submitted bookings are written as `"Created"` — which also appears in no
service's dropdown, and matches no tab.

Counted in both environments:

```
                    dev          prod
Draft tab            13            17
In Progress tab       0             0    ← can never be non-zero via the UI
Completed tab         3             3
Archived tab          3             3
in NO status tab    218  (92%)    315  (93%)
total               237           338
```

Live, not legacy: prod holds 115 bookings created in the last 60 days sitting at
`Created` (newest 2026-07-17), plus 49 `Ongoing` and 44 `Empty Return` in the
same window. `"In Progress"` exists in neither database.

**Severity — read this before acting on the number.** The 218/315 are *not
hidden*. The default tab is the first the user can view (All → My → …), and
every active persona with booking-page access holds `all_tab` or `my_tab` on all
five services — checked against `personas.json`. Nobody falls through to a broken
default.

The accurate statement is: bookings are always findable, but three of six tabs
are decorative. In Progress is permanently empty, Completed catches 3 of 338, and
the real pipeline is reachable only by scrolling All.

Verified four ways: no read-side normalization exists for booking status (unlike
`normalizeQuotationStatus`); the tab strings match between component and hook;
the counts query uses the same filters as the list query, so both are wrong
identically; and the data confirms it in dev and prod.

This is masked in the UI because `getBookingStatusStyles` renders `Created` with
exactly the same grey/FileText treatment as `Draft` — the two are visually
indistinguishable in a list.

Note the vocabularies are disjoint in both directions: `CANCELLABLE_STATUSES`
lists Created, Pending, Confirmed, In Progress, On Hold — of which only `Draft`
also appears in a service dropdown.

### Finding — the booking transition map is dead code

`StatusSelector.tsx:18` defines `BOOKING_STATUS_TRANSITIONS`, a complete and
carefully-written allowed-transition table (Created → Draft/Ongoing/Cancelled,
Billed → Paid/Cancelled, and so on), plus a `REVERSIBLE_BOOKING_STATUSES` set
for walking Completed/Cancelled backwards.

`getAvailableBookingStatuses` never reaches it when a service type is supplied:

```ts
const serviceStatuses = serviceType ? getStatusOptions(serviceType) : [];
if (serviceStatuses.length > 0) {
  return Array.from(new Set(serviceStatuses));   // ← always returns here
}
// transition map only used below this point
```

All five booking-detail views pass `serviceType`, so the flat per-service list
is always what's returned. Any status can be selected from any status.

Separately: `hooks/useEnumOptions.ts:120` holds a **second copy** of the
per-service status lists, and `BookingFieldRenderer` reads its options from
there rather than from `bookingFieldOptions.ts`. The two copies agree today.
Nothing keeps them in sync.

---

## 4. Revenue — billing line → invoice → collection

Three tables in sequence: `billing_line_items` → `invoices` → `collections`.

```
booking / project
 └ add billing line → billing_line_items: unbilled
                      UnifiedBillingsTab, UnifiedExpensesTab, useBillingMerge

unbilled lines
 └ build invoice → invoices: draft
                   + lines flip to invoiced, stamped with invoice_id
                   InvoiceBuilder.tsx:545

invoices: draft
 ├ approve  → approval_status: approved           via approve_invoice RPC
 │            gate: identity, NOT a permission key —
 │              user.department = pending_approver_department
 │              AND (no pending_approver_role OR user.role matches)
 │              OR user.department = "Executive"
 │            (SECURITY DEFINER, because the designated approver usually
 │             lacks invoice-edit and record visibility)
 ├ finalize → status: posted                      gate: canWriteInvoices
 │            HARD BLOCK unless approval_status = approved
 │            + raises the collections follow-up
 ├ void     → status: void                        gate: canDeleteInvoices
 │            HARD BLOCK if any collection references the invoice
 │            + releases its lines back to unbilled
 └ delete draft → row removed                     + releases lines to unbilled

invoices: posted
 └ reverse → reversal_draft → reversal_posted → invoice: reversed
             utils/invoiceReversal.ts

collections
 └ posted | credited | refunded
    NON_APPLIED_COLLECTION_STATUSES excludes some from balance math
```

Legacy invoices with no `approval_status` read as `approved`
(`InvoiceBuilder.tsx:967`) — so the approval gate applies only to invoices
raised after NEU-103.

`pending_approver_department` / `pending_approver_role` are populated from
`routing_rules` — the one active invoice rule routes every invoice to an
**Operations manager**.

**Actor changes:** whoever bills → the routed approver (Ops manager) → whoever
finalizes (Accounting). Three contexts. This is the one chain where the approver
is chosen by data rather than by permission grant, so it is the chain most
sensitive to `routing_rules` content.

### Finding — invoice approval is identity-gated, not permission-gated

Every other approval in the system asks `can(module, action)`. This one compares
`user.department` and `user.role` against columns on the row. A user holding
every invoice permission still cannot approve if their department doesn't match,
and an Executive can always approve regardless of grants.

Not necessarily wrong — the RPC comment explains the reasoning — but it means
the RBAC matrix does not describe who can approve an invoice. Any RBAC test
asserting "this persona cannot approve" will be wrong for Executives.

### Anomaly — 4 invoices with status `Issued`

Dev holds `Issued` (4), `posted` (3), `draft` (2), `void` (1). Nothing in the
codebase writes `Issued` to `invoices` — the only `Issued` writer is the Marine
Insurance **booking** status. Those four rows predate the current writer set.

---

## 5. Inbox tickets

Table `tickets`. The only status column in the system with a CHECK constraint
covering its full vocabulary:

```
draft, open, acknowledged, in_progress, pending, done, resolved, returned, archived
```

```
(compose)
 ├ send       → open                               ComposePanel
 └ save draft → draft

open
 ├ advance  → acknowledged → in_progress → done    ThreadDetailPanel stepper
 │            STATUS_STEPS; advanceStatus() walks one step,
 │            setStatus() jumps directly. gate: canAdvanceStatus
 │            reaching `done` fires runResolutionAction on the linked
 │            record (set_quotation_priced, set_booking_billed) —
 │            itself gated by canExecuteResolutionAction
 ├ return   → returned                             ThreadDetailPanel:317
 └ archive  → archived                             useInbox.ts:371

returned | archived
 └ reopen → open                                   useInbox.ts:391

never written: pending, resolved
```

Tickets are the connective tissue between departments — the BD→Pricing and
Ops→Accounting handoffs both create one. `resolutionAction` is what makes a
ticket write back to the entity that spawned it.

### Finding — two of nine ticket statuses are unreachable

**Corrected 2026-08-03.** The original version of this finding claimed five were
unreachable and that the TS type had drifted. Both were wrong. The first pass
grepped for `status: "acknowledged"`-style literals, but `ThreadDetailPanel`
writes status through variables (`nextStatus`, `targetStatus`) driven by
`STATUS_STEPS`, so those writes were invisible to the search.

The real picture — the constraint permits nine, and **seven are written**:

```
draft, open          ComposePanel
acknowledged         ThreadDetailPanel stepper (advanceStatus / setStatus)
in_progress          "
done                 "  — reaching `done` is what fires runResolutionAction
returned             ThreadDetailPanel send-back
archived             useInbox archive
```

Only `pending` and `resolved` are written by nothing. The seven-value TS type was
therefore *accurate about the writers*, not drifted.

Resolution: `TicketStatus` now mirrors the constraint (nine values) because it is
a read type describing what a row can hold, and `useThread.ts` imports it instead
of re-declaring its own copy. The unused pair stays — an over-permissive CHECK
costs nothing, and a read type that can't represent a value the database may
return is worse.

Dev holds only `open` (1345) and `archived` (38), so the stepper path exists in
code but is not visible in current data.

---

## 6. Budget requests — NOT MAPPED

Table `budget_requests` exists with a `status` column and is **empty in dev**.
No `from("budget_requests")` insert or update site was found in `src/`.

Working hypothesis: budget requests are modelled as e-vouchers with
`transaction_type = "budget_request"` — that value appears in the EV chain's
`isAdvanceType` check alongside `cash_advance`. If so, the `budget_requests`
table is vestigial and the real chain is chain 1.

Not confirmed. Flagged rather than guessed.

---

## Summary of findings

| # | Chain | Finding | Status |
|---|---|---|---|
| 1 | Booking | 218/237 bookings (92%) appear in no status tab; In Progress tab can never be non-zero | **fixed** — `BOOKING_STATUS_BUCKETS`, In Progress now filters by exclusion so unknown statuses surface |
| 2 | Booking | `BOOKING_STATUS_TRANSITIONS` is unreachable — every caller passes serviceType | **fixed** — deleted |
| 3 | Quotation | Disapprove/Cancel is the only status action with no `can()` check | **fixed** — gated. RLS *did* block the write (`current_user_can_quotation('edit')`), so this was a UX bug, not a hole |
| 4 | Quotation | `set_quotation_pricing_in_progress` writes a non-canonical status that normalizes back to `Draft` | **fixed** — resolutionAction removed. 155 open dev tickets were armed with it |
| 5 | Invoice | Approval is identity-gated (dept/role/Executive), not permission-gated | **by design** — commit `b1af8ba` / migration 249. RBAC tests must not assert on it |
| 6 | Ticket | ~~5 of 9~~ **2 of 9** statuses never written (`pending`, `resolved`) | **corrected + closed** — original finding was wrong; stepper writes were missed by a literal-only grep. `TicketStatus` now mirrors the constraint and `useThread` imports it |
| 7 | E-Voucher | TL-delegation branch unreachable — `ev_approval_authority` false for all users | **removed** — branch, plumbing and admin toggle deleted; migration 268 drops the column. Manager step now always routes to `pending_ceo` |
| 8 | Booking | ~~Two~~ **three** independent copies of the per-service status lists | **fixed** — seed now imports the canonical list; `StatusSelector` reads the DB table |
| 9 | Quotation | Dashboard tiles query 5 statuses that exist nowhere in the data | **fixed** — repointed at canonical statuses |
| 10 | Budget request | Table empty, no writers found — likely vestigial | **confirmed vestigial** — `BudgetRequestList` reads `evouchers`; see chain 1 |
