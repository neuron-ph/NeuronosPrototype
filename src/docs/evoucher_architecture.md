# E-Voucher System Architecture
**Finalized: 2026-04-11 | Status: Approved for Implementation**

---

## Overview

The E-Voucher system is the **single AP source of truth** for all company expenses in Neuron OS. There is no separate "expense" document — the E-Voucher IS the expense record. It evolves through lifecycle stages from request → approval → disbursement → receipt submission → GL posting.

The legacy `expenses` table and `CreateExpenseModal` are **retired and deleted** as part of this redesign.

---

## Transaction Types

| Type | Tied to Booking | Who Creates It | Receipt Timing | Needs Liquidation | Approval Chain |
|---|---|---|---|---|---|
| `expense` | Yes | Operations reps | After disbursement | Yes | Manager → CEO → Accounting |
| `cash_advance` | Yes | Operations reps | After disbursement | Yes (multiple line items) | Manager → CEO → Accounting |
| `reimbursement` | Optional | Anyone | Upfront at creation | No | Manager → CEO → Accounting |
| `budget_request` | No | BD reps, anyone | After disbursement | Yes (multiple line items) | Manager → CEO → Accounting |
| `direct_expense` | No | Anyone | After disbursement | Yes (receipts before close) | CEO → Accounting (skips Manager) |

### Type Definitions

**`expense`** — A specific, known-amount payment to a vendor for a booking. Rep knows exactly what they'll pay. Treasury gives them the cash, they pay the vendor, they return with a receipt and exact amount paid.

**`cash_advance`** — A budget pool for a booking. Rep estimates the total cost of a job ("I might need PHP 100,000 for this booking") and receives that amount. They make multiple payments during the job, then liquidate by listing every payment with receipts. Excess cash is returned to Treasury.

**`reimbursement`** — Someone paid out of pocket and is requesting to be paid back. Receipt is attached at creation before the approval chain begins. No liquidation step — proof exists upfront.

**`budget_request`** — Same mechanics as `cash_advance` but not tied to a booking. Used primarily by BD reps for client-facing expenses (meals, transportation, entertainment). Goes through the full approval chain.

**`direct_expense`** — A direct purchase request not tied to a booking. Used when anyone (HR, Ops, BD) needs something bought that isn't a client entertainment expense or personal reimbursement (e.g., office supplies, equipment). No receipt at creation. Skips Manager approval — goes straight to CEO. After disbursement, receipts must be submitted before the EV can be closed.

---

## Business Rules

- **One E-Voucher per booking** — if a rep handles expenses for 3 bookings in one trip, that's 3 separate E-Vouchers
- **Vendor lives at the line item level** — header vendor_name is a convenience default; each line item can specify its own payee
- **Accounting categorizes** — reps capture description, amount, vendor, and receipt; Accounting assigns GL categories during verification
- **Amount variances** — if actual spend ≠ disbursed amount, excess is returned to Treasury and Accounting manually creates an adjusting GL entry. Posted entries are never edited.
- **CEO-approved EVs cannot be rejected by Accounting** — Accounting executes CEO decisions. Issues are escalated via inbox/ticket.
- **No amount thresholds yet** — full approval chain applies to all EVs regardless of amount. Designed for threshold configuration in a future phase.

---

## Actors

| Actor | Responsibilities |
|---|---|
| **Creator** (any dept) | Creates EV, attaches receipts (reimbursement), submits liquidation, can withdraw before CEO stage |
| **Department Manager** | First approval gate for their department's EVs |
| **CEO / Executive** | Final approval gate before disbursement |
| **Accounting / Treasury** | Disburses cash, verifies receipts, posts GL entries, creates adjusting entries |

---

## Approval Routing Rules

| Creator Department / EV Type | Routing |
|---|---|
| Any non-Executive dept (standard types) | `pending_manager` (own dept) → `pending_ceo` → `pending_accounting` |
| Executive dept (any type) | Skips Manager + CEO entirely → `pending_accounting` directly |
| `direct_expense` (any dept) | Skips Manager → `pending_ceo` → `pending_accounting` |

### Rejection Cascade
- **CEO rejects** → returns to `pending_manager` (Manager sees reason, decides to resubmit or reject down)
- **Manager rejects** → returns to `draft` (Creator sees reason, can edit and resubmit)
- **Accounting cannot reject** — they flag/note/send inbox ticket

### Creator Withdrawal
- Creator can withdraw their EV **only before it reaches `pending_ceo`**
- Once the CEO is reviewing, the creator's control is locked
- Withdrawal returns the EV to `draft`
- Creator can delete a `draft` EV

---

## Status Machine

### Standard Flow — `expense`, `cash_advance`, `budget_request`
```
draft
  └─► pending_manager       Creator submits; routes to own dept Manager
        ├─► pending_ceo      Manager approves; routes to CEO
        │     ├─► pending_accounting   CEO approves; routes to Accounting
        │     │     └─► disbursed      Accounting clicks "Disburse"; cash given to rep
        │     │               └─► pending_liquidation   Rep submits receipts + actual amounts
        │     │                         └─► pending_verification   Accounting reviews submission
        │     │                                   └─► posted        Accounting clicks "Verify & Post"; GL entry created
        │     └─► pending_manager (rejected by CEO, with reason)
        └─► draft (rejected by Manager, with reason)
```

### Reimbursement Flow
```
draft (receipt attached at creation)
  └─► pending_manager
        └─► pending_ceo
              └─► pending_accounting   Accounting verifies pre-attached receipt
                    └─► disbursed      Accounting clicks "Disburse"; rep gets paid back
                          └─► posted   GL posted (no variance, no separate verify step)
```

### Direct Expense Flow
```
draft
  └─► pending_ceo          (skips Manager entirely)
        ├─► pending_accounting   CEO approves
        │     └─► disbursed      Accounting disburses
        │               └─► pending_liquidation   Rep submits receipts
        │                         └─► pending_verification   Accounting reviews
        │                                   └─► posted
        └─► draft (rejected by CEO, with reason)
```

### Executive Creator Flow (any type)
```
draft
  └─► pending_accounting   (skips Manager and CEO entirely)
        └─► [continues as standard from disbursed onward]
```

---

## Liquidation

Applies to: `expense`, `cash_advance`, `budget_request`, `direct_expense`

After disbursement, the rep is responsible for submitting proof of payment. They do this digitally in the system.

### Liquidation Submission Fields (per line item)
| Field | Who Fills |
|---|---|
| Description | Rep |
| Vendor name | Rep |
| Amount actually paid | Rep |
| Receipt upload (photo/scan) | Rep |
| GL category | Accounting (during verification) |

### Liquidation Rules
- Multiple line items per submission (one receipt may cover multiple items, or each item has its own)
- Receipts do not need strict 1:1 mapping to line items — rep uploads what they have
- Total actual spend vs disbursed amount drives the variance calculation
- Excess cash → rep returns to Treasury + Accounting creates adjusting GL entry
- Shortfall → Accounting creates reimbursement adjusting entry

---

## GL Posting

- Manual always — Accounting triggers GL posting via "Verify & Post" action
- GL account selection pre-filled based on transaction type (from GL_CONTRACT)
- Adjusting entries created manually by Accounting for amount variances
- Posted GL entries are never edited — only offset with new entries
- Accounting Managers can unlock posted EVs (existing behavior) — system auto-creates reversal entry

### GL Contract by Type
| Type | On Disbursement |
|---|---|
| `expense` | DR Expense / CR Cash |
| `cash_advance` | DR Advances to Employees / CR Cash |
| `reimbursement` | DR Expense / CR Cash |
| `budget_request` | DR Advances to Employees / CR Cash |

---

## Scope & Relationship Rules

| Rule | Decision |
|---|---|
| Booking relationship | One E-Voucher per booking (strict) |
| Direct expenses (no booking) | Supported — `budget_request` and `reimbursement` commonly have no booking_id |
| Vendor scope | Line item level (header vendor is default convenience) |
| Multi-booking EVs | Not supported |
| Booking-spanning cash advances | Not supported |

---

## Cleanup from Legacy System

| Item | Action |
|---|---|
| `expenses` table | Retired — no new writes. Keep for historical data. |
| `CreateExpenseModal` | Deleted |
| `pending_tl` status | Renamed to `pending_manager` |
| `evouchers.catalog_item_id` (header) | Dead column — move to line item level in future phase |
| JSONB `line_items` on evouchers | Migrate to relational `evoucher_line_items` table (prerequisite for catalog linkage) |

---

## Future Phases (Not in Scope Now)

- **Amount-based approval thresholds** — Manager can approve EVs under PHP X without escalating to CEO. Config table designed and seeded, UI deferred.
- **Catalog linkage** — `evoucher_line_items.catalog_item_id` FK once relational migration is complete
- **Expense analytics** — cost per booking, margin analysis, spend by vendor/category
- **Treasury role** — separate Accounting sub-role with dedicated disbursement-only permissions

---

## Decision Log

| # | Decision | Alternatives Considered | Why |
|---|---|---|---|
| 1 | E-Voucher IS the expense record (no child document) | EV spawns an "expense" child on disbursement | Simpler — one document, one lifecycle, no sync issues |
| 2 | Four types: expense, cash_advance, reimbursement, budget_request | Collapse to fewer types | Each has distinct receipt timing, liquidation behavior, and GL treatment |
| 3 | One E-Voucher per booking | Allow multi-booking EVs | Keeps cost tracking clean per booking; profitability calculations stay simple |
| 4 | Vendor at line item level, header is convenience | Vendor only at header | BD and Operations sometimes pay multiple vendors in one job |
| 5 | Reimbursement skips liquidation | Uniform liquidation for all types | Receipt exists upfront — no post-disbursement uncertainty |
| 6 | Accounting cannot reject CEO-approved EVs | Accounting has a reject gate | CEO is final authority; Accounting executes. Issues go through inbox. |
| 7 | Creator can withdraw only before CEO stage | Creator can withdraw anytime | Once CEO is involved, the document is no longer just the creator's |
| 8 | expenses table retired, CreateExpenseModal deleted | Keep as "quick expense" path | Consolidating to one system eliminates the dual-system mess |
| 9 | Full approval chain for all types regardless of amount | Amount thresholds now | Company is small; CEO wants visibility on everything. Thresholds designed for later. |
| 10 | Two explicit Accounting actions: Disburse + Verify & Post | One combined Accounting action | These happen at different times (days/weeks apart); must be separate |
| 11 | Adjusting entries created manually by Accounting | Auto-create on variance detection | Accounting owns GL integrity; no automated entries without human review |
