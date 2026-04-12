# E-Voucher / Expense System — Full Architecture
**Finalized: 2026-04-11 | Implemented: 2026-04-12**

---

## 1. Overview

The E-Voucher system is the **single AP (Accounts Payable) source of truth** for all company expenses in Neuron OS. There is no separate "expense" document — the E-Voucher IS the expense record. It evolves through lifecycle stages:

```
Request → Approval → Disbursement → Receipt Submission → GL Posting
```

**Key principle:** One document, one lifecycle. No child records, no sync issues.

The legacy `expenses` table, `CreateExpenseModal`, and `CreateEVoucherModal` have been **retired and deleted**.

---

## 2. Transaction Types

| Type | Tied to Booking | Who Creates | Receipt Timing | Needs Liquidation | Approval Chain |
|---|---|---|---|---|---|
| `expense` | Yes | Operations reps | After disbursement | Yes | Manager → CEO → Accounting |
| `cash_advance` | Yes | Operations reps | After disbursement | Yes (multiple) | Manager → CEO → Accounting |
| `reimbursement` | Optional | Anyone | **Upfront at creation** | No | Manager → CEO → Accounting |
| `budget_request` | No | BD reps, anyone | After disbursement | Yes (multiple) | Manager → CEO → Accounting |
| `direct_expense` | No | Anyone | After disbursement | Yes | **CEO → Accounting** (skips Manager) |

### Type Definitions

**`expense`** — A specific, known-amount payment to a vendor for a booking. Rep knows exactly what they'll pay. Treasury gives them the cash, they pay the vendor, they return with a receipt.

**`cash_advance`** — A budget pool for a booking. Rep estimates the total cost of a job ("I might need PHP 100,000 for this booking") and receives that amount. They make multiple payments during the job, then liquidate by listing every payment with receipts. Excess cash is returned to Treasury.

**`reimbursement`** — Someone paid out of pocket and is requesting to be paid back. Receipt is attached at creation before the approval chain begins. No liquidation step — proof exists upfront.

**`budget_request`** — Same mechanics as `cash_advance` but not tied to a booking. Used primarily by BD reps for client-facing expenses (meals, transportation, entertainment). Full approval chain.

**`direct_expense`** — A direct purchase request not tied to a booking. Used when anyone needs something bought (office supplies, equipment, etc.). No receipt at creation. Skips Manager approval — goes straight to CEO. Receipts must be submitted after disbursement before the EV can be closed.

---

## 3. Business Rules

- **One E-Voucher per booking** — 3 bookings in one trip = 3 EVs
- **Vendor lives at line item level** — header `vendor_name` is a convenience default; each line item can specify its own payee
- **Accounting categorizes** — reps capture description, amount, vendor, receipt; Accounting assigns GL categories during verification
- **Amount variances** — excess returned to Treasury + Accounting manually creates adjusting GL entry. Posted entries are never edited.
- **CEO-approved EVs cannot be rejected by Accounting** — Accounting executes CEO decisions. Issues escalated via inbox/ticket.
- **No amount thresholds yet** — full approval chain for all EVs regardless of amount. Designed for threshold configuration in a future phase.

---

## 4. Actors

| Actor | Responsibilities |
|---|---|
| **Creator** (any dept) | Creates EV, attaches receipts (reimbursement), submits liquidation, can withdraw before CEO stage |
| **Department Manager** | First approval gate for their department's EVs |
| **CEO / Executive** | Final approval gate before disbursement |
| **Accounting / Treasury** | Disburses cash, verifies receipts, posts GL entries, creates adjusting entries |

---

## 5. Approval Routing Rules

| Creator Context | Routing |
|---|---|
| Any non-Executive dept (standard types) | `pending_manager` (own dept) → `pending_ceo` → `pending_accounting` |
| `direct_expense` (any dept) | Skips Manager → `pending_ceo` → `pending_accounting` |
| Executive dept (any type) | Skips Manager + CEO → `pending_accounting` directly |

### Rejection Cascade
- **CEO rejects** → returns to `pending_manager` (Manager sees reason, decides to resubmit or reject down)
- **Manager rejects** → returns to `draft` (Creator sees reason, can edit and resubmit)
- **Accounting cannot reject** — they flag/note/send inbox ticket

### Creator Withdrawal
- Creator can withdraw **only before it reaches `pending_ceo`**
- Once CEO is reviewing, creator's control is locked
- Withdrawal returns EV to `draft`
- Creator can delete a `draft` EV

---

## 6. Status Machine

### Canonical Statuses

| Status | Meaning |
|---|---|
| `draft` | Created, not yet submitted |
| `pending_manager` | Awaiting Department Manager approval |
| `pending_ceo` | Awaiting CEO / Executive approval |
| `pending_accounting` | Approved — ready for Accounting to disburse |
| `disbursed` | Cash released to rep |
| `pending_liquidation` | Rep must submit receipts + actuals |
| `pending_verification` | Receipts submitted — Accounting reviewing |
| `posted` | GL entry created — transaction complete |
| `rejected` | Rejected at Manager or CEO gate |
| `cancelled` | Terminal — from draft or rejected only |

### Standard Flow — `expense`, `cash_advance`, `budget_request`

```
draft
  └─► pending_manager       Creator submits
        ├─► pending_ceo      Manager approves
        │     ├─► pending_accounting   CEO approves
        │     │     └─► disbursed      Accounting clicks "Disburse"
        │     │           └─► pending_liquidation   Rep submits receipts
        │     │                 └─► pending_verification   Accounting reviews
        │     │                       └─► posted           Accounting clicks "Verify & Post"
        │     └─► pending_manager      (CEO rejects, with reason)
        └─► draft                      (Manager rejects, with reason)
```

### Reimbursement Flow

```
draft (receipt attached at creation)
  └─► pending_manager
        └─► pending_ceo
              └─► pending_accounting
                    └─► disbursed      Rep gets paid back
                          └─► posted   GL posted (no liquidation needed)
```

### Direct Expense Flow

```
draft
  └─► pending_ceo            (skips Manager)
        ├─► pending_accounting
        │     └─► disbursed
        │           └─► pending_liquidation
        │                 └─► pending_verification
        │                       └─► posted
        └─► draft              (CEO rejects, with reason)
```

### Executive Creator Flow (any type)

```
draft
  └─► pending_accounting     (skips Manager + CEO)
        └─► [continues as standard from disbursed onward]
```

---

## 7. Two Accounting Actions

These are **separate, explicit actions** that happen days or weeks apart:

| # | Action | Trigger Status | Result Status | What Happens |
|---|---|---|---|---|
| 1 | **Disburse** | `pending_accounting` | `disbursed` | Cash released to rep. Inbox notifies creator. |
| 2 | **Verify & Post** | `pending_verification` | `posted` | Receipts reviewed, GL categories assigned, journal entry created. Inbox notifies creator. |

---

## 8. Liquidation

Applies to: `expense`, `cash_advance`, `budget_request`, `direct_expense`
Does NOT apply to: `reimbursement` (receipt exists at creation)

### Submission Fields (per line item)

| Field | Who Fills |
|---|---|
| Description | Rep |
| Vendor name | Rep |
| Amount actually paid | Rep |
| Receipt upload (photo/scan) | Rep |
| GL category | Accounting (during verification) |

### Rules
- Multiple line items per submission
- Receipts don't need strict 1:1 mapping to line items
- Total actual spend vs. disbursed amount drives variance calculation
- Excess cash → returned to Treasury + Accounting creates adjusting GL entry
- Shortfall → Accounting creates reimbursement adjusting entry
- Incremental submissions supported (rep can save receipts progressively, then mark as final)

---

## 9. GL Posting

| Type | Journal Entry on Disbursement |
|---|---|
| `expense` | DR Expense / CR Cash |
| `cash_advance` | DR Advances to Employees / CR Cash |
| `reimbursement` | DR Expense / CR Cash |
| `budget_request` | DR Advances to Employees / CR Cash |
| `direct_expense` | DR Expense / CR Cash |

- Manual always — Accounting triggers via "Verify & Post"
- Posted GL entries are never edited — only offset with new entries
- Accounting Managers can unlock posted EVs — system auto-creates reversal entry

---

## 10. UI/UX Architecture

### Entry Points

| Entry Point | EV Types | Button Label | Who |
|---|---|---|---|
| Operations → Booking → E-Vouchers tab | `expense`, `cash_advance` | "New E-Voucher" | Operations reps |
| BD → Budget Requests module | `budget_request` | "New Budget Request" | BD reps |
| My E-Vouchers (sidebar) | `reimbursement`, `direct_expense` | "New Request" | Anyone |
| Accounting → E-Vouchers module | — (manage/action only) | — | Accounting |

### Creation Form

Single side panel (`AddRequestForPaymentPanel`) with **type selector scoped to entry point context**:

| Context | Type Selector Options |
|---|---|
| `operations` | Regular Expense, Billable Expense, Cash Advance |
| `personal` (My E-Vouchers) | Reimbursement, Direct Expense |
| `bd` | Pre-set to Budget Request (no selector) |
| `accounting` | All 5 types |

### Module Layouts

**My E-Vouchers** (sidebar, all users) — personal tracker showing all EVs the user created across all types. Summary cards (Drafts, Pending, In Progress, Completed), filter tabs, DataTable.

**Accounting → E-Vouchers** (4 action-oriented tabs):

| Tab | EVs Shown | Accounting's Job |
|---|---|---|
| Pending Disburse | `pending_accounting` | Release cash |
| Waiting on Rep | `disbursed` + `pending_liquidation` | Monitor — rep hasn't returned receipts |
| Pending Verification | `pending_verification` | Review receipts → Verify & Post |
| Archive | `posted` | Read-only history |

**Manager** — approval queue on department module showing `pending_manager` EVs from own department.

**CEO** — approval queue on Executive dashboard showing all `pending_ceo` EVs across departments.

### Detail View (Two-Tier)

**Tier 1 — Side Panel** (quick view): read-only summary, status badge, role-appropriate Approve/Reject buttons. Opens from any list.

**Tier 2 — Full Page** (`/evouchers/:id?from=accounting|operations|bd|my`): details grid, line items table, approval timeline with history, liquidation submission form, GL posting info, key dates. Actions in right column.

### Status Badges (Role-Aware)

| Internal Status | Creator Sees | Manager Sees | CEO Sees | Accounting Sees |
|---|---|---|---|---|
| `draft` | Draft | — | — | — |
| `pending_manager` | Pending Approval | **Needs Your Approval** | — | — |
| `pending_ceo` | Pending Approval | Approved | **Needs Your Approval** | — |
| `pending_accounting` | Approved | Approved | Approved | **Pending Disburse** |
| `disbursed` | Disbursed | Disbursed | Disbursed | Disbursed |
| `pending_liquidation` | **Submit Receipts** | — | — | Waiting on Rep |
| `pending_verification` | Under Review | — | — | **Verify & Post** |
| `posted` | Complete | Complete | Complete | Posted |

---

## 11. Inbox Notifications

| Event | Who Gets Notified | Type |
|---|---|---|
| EV submitted | Next approver (Manager, CEO, or Accounting) | `approval` |
| Manager approves | CEO | `approval` |
| CEO approves | Accounting | `request` |
| Any rejection | Creator (with reason) | `fyi` (urgent) |
| EV disbursed | Creator ("Cash released") | `fyi` |
| Liquidation submitted | Accounting | `request` |
| EV posted (complete) | Creator ("Transaction complete") | `fyi` |

All notifications link directly to `/evouchers/:id`.

---

## 12. Database Schema

### evouchers table (key columns)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `evoucher_number` | TEXT | e.g., EVRN20260411-221 |
| `transaction_type` | TEXT | expense, cash_advance, reimbursement, budget_request, direct_expense |
| `source_module` | TEXT | bd, operations, accounting, personal |
| `status` | TEXT | See status machine above |
| `amount` | NUMERIC(15,2) | Total requested amount |
| `requestor_id` / `requestor_name` | TEXT | Creator |
| `vendor_name` | TEXT | Header-level convenience default |
| `booking_id` | TEXT FK | For booking-tied EVs |
| `project_number` | TEXT | Project reference |
| `expense_category` / `gl_sub_category` | TEXT | Categorization |
| `line_items` | JSONB | Line items (to be migrated to relational table) |
| `approvers` | JSONB | Approval chain records |
| `disbursed_at` | TIMESTAMPTZ | When cash was released |
| `liquidated_at` | TIMESTAMPTZ | When rep submitted receipts |
| `verified_at` | TIMESTAMPTZ | When Accounting verified & posted |

### liquidation_submissions table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `evoucher_id` | TEXT FK | Parent EV |
| `submitted_by` | TEXT FK | Rep who submitted |
| `line_items` | JSONB | `[{id, description, vendor_name, amount, receipt_url, gl_category}]` |
| `total_spend` | NUMERIC(15,2) | Sum of all line items |
| `unused_return` | NUMERIC(15,2) | Cash returned (final submission only) |
| `is_final` | BOOLEAN | Marks advance ready for Accounting review |
| `status` | TEXT | pending, approved, revision_requested |

### evoucher_history table

Audit trail of all status transitions with actor, timestamps, and notes.

---

## 13. Key Components

| Component | Path | Purpose |
|---|---|---|
| `AddRequestForPaymentPanel` | `src/components/accounting/` | Main creation side panel — all 5 types |
| `CreateEVoucherForm` | `src/components/accounting/evouchers/` | Thin wrapper for context initialization |
| `EVoucherWorkflowPanel` | `src/components/accounting/evouchers/` | All status transitions, approval/reject, disburse, verify & post |
| `EVoucherStatusBadge` | `src/components/accounting/evouchers/` | Status badge with role-aware labels |
| `EVoucherDetailView` | `src/components/accounting/` | Tier 1 side panel quick view |
| `EVoucherDetailPage` | `src/components/accounting/evouchers/` | Tier 2 full page at `/evouchers/:id` |
| `EVoucherApprovalQueue` | `src/components/accounting/evouchers/` | Reusable approval queue (Manager/CEO) |
| `LiquidationForm` | `src/components/accounting/evouchers/` | Receipt submission side panel |
| `EVouchersContent` | `src/components/accounting/` | Accounting module with 4-tab layout |
| `MyEVouchersPage` | `src/components/` | Personal EV tracker (sidebar) |
| `useEVouchers` | `src/hooks/` | Data hook with 9 view modes |
| `useEVoucherSubmit` | `src/hooks/` | Create/submit/auto-approve hook |

---

## 14. Legacy Cleanup (Completed)

| Item | Action | Status |
|---|---|---|
| `expenses` table | Retired — no new writes, historical data kept | Done |
| `CreateExpenseModal` | Deleted | Done |
| `CreateEVoucherModal` | Deleted (centered modal, replaced by side panel) | Done |
| `EVouchersList` | Deleted (dead code) | Done |
| `pending_tl` status | Renamed to `pending_manager` (DB + all code) | Done |
| `liquidation_open` | Renamed to `pending_liquidation` | Done |
| `liquidation_pending` | Renamed to `pending_verification` | Done |
| `liquidation_closed` | Mapped to `posted` | Done |

---

## 15. Future Phases (Not in Scope)

- **Amount-based approval thresholds** — Manager can approve under PHP X without CEO. Config designed, UI deferred.
- **Catalog linkage** — `evoucher_line_items.catalog_item_id` FK (requires JSONB → relational migration)
- **Relational line items** — migrate `evouchers.line_items` JSONB to `evoucher_line_items` table
- **Expense analytics** — cost per booking, margin analysis, spend by vendor/category
- **Treasury sub-role** — separate Accounting role with disbursement-only permissions
- **Receipt upload in creation form** — for `reimbursement` type (architecture decided, UI pending)

---

## 16. Decision Log

| # | Decision | Why |
|---|---|---|
| 1 | E-Voucher IS the expense record | One document, one lifecycle, no sync issues |
| 2 | Five types with distinct behaviors | Each has different receipt timing, liquidation, GL treatment, and routing |
| 3 | One E-Voucher per booking | Clean cost tracking; profitability calculations stay simple |
| 4 | Vendor at line item level | BD and Operations sometimes pay multiple vendors in one job |
| 5 | Reimbursement skips liquidation | Receipt exists upfront — no post-disbursement uncertainty |
| 6 | Accounting cannot reject CEO-approved EVs | CEO is final authority; Accounting executes |
| 7 | Creator can withdraw only before CEO stage | Once CEO is involved, document is no longer just the creator's |
| 8 | Legacy expense system retired | Consolidating to one system eliminates dual-system mess |
| 9 | Full approval chain regardless of amount | Company is small; CEO wants visibility. Thresholds designed for later. |
| 10 | Two explicit Accounting actions | Disburse and Verify & Post happen days/weeks apart; must be separate |
| 11 | Adjusting entries created manually | Accounting owns GL integrity; no automated entries without human review |
| 12 | Direct expense skips Manager | Not tied to a department's operations; CEO approves directly |
