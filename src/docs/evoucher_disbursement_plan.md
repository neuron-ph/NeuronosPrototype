# E-Voucher Disbursement Gap — Build Plan
**Created: 2026-04-14 | Status: Pending Implementation**

---

## The Problem

The current "Disburse" action is a one-click status flip. It does not:
- Record which bank account the money came from
- Capture the payment method or reference number
- Create a journal entry (the bank balance is never decremented)
- Create a Transaction record in the Transactions module

This means the company's cash position in the system is **overstated** by the sum of every disbursed E-Voucher. Every ₱100,000 cash advance paid out to a rep exists in no ledger until the liquidation closes weeks later. That is an accounting gap, not a UX gap.

---

## The Two Accounting Events (What Should Exist)

### Event 1 — At Disbursement
Money leaves the company's control and moves to the employee's custody.

```
Dr. Employee Cash Advances Receivable    ₱100,000
  Cr. [Source Bank Account / Petty Cash]            ₱100,000
```

This entry must be posted **immediately when Accounting clicks Disburse**, before the status transitions.

### Event 2 — At Verify & Post (already partially exists)
Receipts are confirmed. The advance receivable is retired and replaced with actual expense accounts.

```
Dr. Trucking Expenses                      ₱85,000
Dr. Cash / Bank (overage returned)         ₱15,000
  Cr. Employee Cash Advances Receivable              ₱100,000
```

This is what the `GLConfirmationSheet` currently handles — but it needs to be updated to reference the receivable account from Event 1 as the offsetting credit, not generate an entry from scratch.

### Reimbursement Type — Different Flow
No advance receivable is created. The rep paid out of pocket; the company is paying them back.

```
Dr. [Expense Account]                      ₱X
  Cr. [Source Bank Account / Petty Cash]             ₱X
```

A single entry at disbursement, no liquidation required.

---

## What Needs to Be Built

---

### 1. DisbursementSheet Component
**File:** `src/components/accounting/evouchers/DisbursementSheet.tsx`

A confirmation sheet (same pattern as `GLConfirmationSheet`) that opens when Accounting clicks "Disburse". It must NOT be a one-click action.

**Fields to collect:**

| Field | Type | Notes |
|---|---|---|
| Source Account | Select | Populated from `chart_of_accounts` filtered to asset/bank/cash accounts |
| Payment Method | Select | Cash / Check / Bank Transfer / Petty Cash |
| Reference Number | Text | Check #, transfer ref, petty cash voucher # — required for Check and Bank Transfer |
| Disbursement Date | Date | Defaults to today, editable (physical disbursement may differ from approval date) |
| Released By | Display | The current logged-in Accounting user (read-only, for audit trail) |
| Remarks | Textarea | Optional notes |

**On Confirm:**
1. Create journal entry (Event 1 above) — Dr. Employee Advances Receivable / Cr. Source Account
2. Create a Transaction record in the `transactions` table
3. Store disbursement metadata on the evoucher record
4. Transition status to `disbursed`
5. Write to `evoucher_history`
6. Send inbox notification to requestor

---

### 2. Schema Changes

#### 2a. Add disbursement metadata columns to `evouchers`

```sql
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_method     TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_reference  TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_date       TIMESTAMPTZ;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_source_account_id TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_journal_entry_id  TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursed_by_user_id    TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursed_by_name       TEXT;
```

Note: The existing `journal_entry_id` column on `evouchers` currently points to the *closing* GL entry (posted at Verify & Post). We now need a second FK for the *disbursement* entry. Rename for clarity:

```sql
-- Rename existing column to clarify it belongs to the closing entry
ALTER TABLE evouchers RENAME COLUMN journal_entry_id TO closing_journal_entry_id;
-- The new column above, disbursement_journal_entry_id, covers Event 1
```

**Important:** The `handleUnlockForCorrection` function in `EVoucherWorkflowPanel` currently reads `journal_entry_id` to find the entry to reverse. This reference must be updated to `closing_journal_entry_id` after the rename.

#### 2b. Add `Employee Cash Advances Receivable` to Chart of Accounts
This is a Balance Sheet asset account. It must exist in `chart_of_accounts` before any disbursement journal entries can be created. If it does not exist yet, it must be seeded:

```sql
INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, is_system_account)
VALUES ('COA-ADVANCES', '1150', 'Employee Cash Advances Receivable', 'asset', true)
ON CONFLICT DO NOTHING;
```

Mark it `is_system_account = true` so it cannot be accidentally deleted from the UI.

---

### 3. Transaction Record at Disbursement

When Accounting disburses, a record must be written to the `transactions` table (the same table feeding the Transactions module) so the cash outflow appears in the company's transaction history.

Fields to write:

| Field | Value |
|---|---|
| `type` | `'disbursement'` |
| `amount` | evoucher amount (negative — outflow) |
| `reference_number` | disbursement reference # |
| `account_id` | source bank/cash account |
| `evoucher_id` | FK to the evoucher |
| `description` | `"Cash Advance Disbursed — [EV#] — [Requestor Name]"` |
| `transaction_date` | disbursement date |
| `created_by` | accounting user id |

---

### 4. Update GLConfirmationSheet (Closing Entry)

The `GLConfirmationSheet` currently builds the GL entry for Verify & Post from scratch. After this change, for `cash_advance`, `expense`, `budget_request`, and `direct_expense` types:

- The **credit side** of the closing entry must reference `Employee Cash Advances Receivable` (the same account debited at disbursement), not a cash/bank account
- The sheet should **display the disbursement entry alongside the closing entry** so the Accounting manager can see both sides of the lifecycle before posting
- For `reimbursement` type, the logic is unchanged — the closing entry credits a bank account directly since there was no advance receivable created

---

### 5. Update EVoucherWorkflowPanel

- Replace the one-click `handleDisburse` button with a button that opens `DisbursementSheet`
- Update the `canDisburse` guard — same conditions apply
- After `closing_journal_entry_id` rename, update the `handleUnlockForCorrection` function to read `closing_journal_entry_id` instead of `journal_entry_id`

---

### 6. Update EVoucherHistoryTimeline

The history timeline should display disbursement metadata when the `"Cash Disbursed by Accounting"` action appears in the log:

- Payment method
- Source account name
- Reference number
- Disbursement date (if different from log timestamp)
- Released by (name)

This data is already stored on the evoucher record after step 2a; the timeline component just needs to surface it when rendering that history entry.

---

### 7. Update EVoucherDetailPage / DetailView

The detail view should show a **"Disbursement Details"** section (visible once status ≥ `disbursed`) containing:

- Date
- Payment method
- Source account
- Reference number
- Released by

This is primarily for audit trail visibility — requestors and managers reviewing a past EV should be able to see exactly how and when cash was released.

---

### 8. Accounting Module — "Waiting on Rep" Tab Context

Once a voucher is disbursed, the Accounting team may want to follow up with reps who are slow to submit their liquidation. The "Waiting on Rep" tab should surface the number of days since disbursement so stale advances are easy to identify. This is a display-only change — add a "Days Outstanding" column computed from `disbursement_date`.

---

## Type-Specific Behavior Summary

| EV Type | Event 1 (Disbursement JE) | Event 2 (Closing JE) |
|---|---|---|
| `cash_advance` | Dr. Advances Receivable / Cr. Bank | Dr. Expense Accounts + Dr. Bank (overage) / Cr. Advances Receivable |
| `expense` | Dr. Advances Receivable / Cr. Bank | Dr. Expense Account / Cr. Advances Receivable |
| `budget_request` | Dr. Advances Receivable / Cr. Bank | Dr. Expense Accounts + Dr. Bank (overage) / Cr. Advances Receivable |
| `direct_expense` | Dr. Advances Receivable / Cr. Bank | Dr. Expense Accounts / Cr. Advances Receivable |
| `reimbursement` | Dr. Expense Account / Cr. Bank (single entry, no receivable) | *(none — disbursement IS the close)* |

Note: For `reimbursement`, there is no liquidation step and therefore no Event 2. The `GLConfirmationSheet` at Verify & Post is skipped. The disbursement step posts the only GL entry and the status should jump directly to `posted` after disbursement.

---

## Build Order

These steps have dependencies — do them in sequence.

1. **Schema migration** — add columns to `evouchers`, rename `journal_entry_id` → `closing_journal_entry_id`, seed the Advances Receivable COA account
2. **Update `handleUnlockForCorrection`** in `EVoucherWorkflowPanel` to use `closing_journal_entry_id`
3. **Build `DisbursementSheet` component** — source account selector, payment method, reference, date fields; creates JE + Transaction record on confirm
4. **Wire `DisbursementSheet` into `EVoucherWorkflowPanel`** — replace the one-click `handleDisburse`
5. **Update `GLConfirmationSheet`** — credit side must reference Advances Receivable for non-reimbursement types; show disbursement JE for context
6. **Handle reimbursement single-entry flow** — disbursement posts final JE and transitions to `posted` directly
7. **Update `EVoucherHistoryTimeline`** — show disbursement metadata in the history entry
8. **Update `EVoucherDetailPage`** — add Disbursement Details section
9. **Update Accounting E-Vouchers table (Waiting on Rep tab)** — add Days Outstanding column

---

## Out of Scope for This Plan

- **Petty cash fund reconciliation** — petty cash is a valid source account but reconciling the petty cash fund balance against vouchers is a separate accounting feature
- **Amount threshold routing** — configured approval chains based on EV amount (a future phase per the architecture doc)
- **Multi-currency disbursement** — all EVs are PHP for now
- **Batch disbursement** — disbursing multiple EVs in one bank run (future)
