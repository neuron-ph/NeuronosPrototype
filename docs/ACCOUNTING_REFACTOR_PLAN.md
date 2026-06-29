# Accounting System Refactor — Model & Plan

**Status:** Model LOCKED. Build started (Phase 0).
**Tickets:** NEU-038 (cash flow), NEU-039 (classification).
**Scope:** Refactor the financial-statements engine so accounts are classified by stored labels, not guessed from account numbers — and so the Cash Flow Statement builds dynamically and reconciles itself.

---

## The two problems we're solving

1. **NEU-039 — classification by guessing.** Statements derive each account's type from its *account number* (`classifyByCode` in `FinancialStatementsPage.tsx`), ignoring the account's actual stored type. A mis-numbered or blank-code account silently lands in the wrong place. No error.
2. **NEU-038 — cash flow is hardcoded + never reconciles.** Built on fixed lists of account codes (`AR_ACCOUNTS`, `AP_ACCOUNTS`), with a dead `CASH_ACCOUNT_PREFIXES` constant. Anything outside the lists silently drops out, and it never checks its result against actual cash movement.

Both share one root cause → fixed by the same foundation: **label the accounts, read the labels.**

---

## The model

### Two labels on every account

- **Account Type** — the broad 5: **Asset, Liability, Equity, Income, Expense**.
  → decides **which statement** the account appears on (Balance Sheet or P&L).
  → already exists as `accounts.type`.

- **Detail Type** — the finer label (e.g. Cash and Cash Equivalents, Accounts Receivable, Fixed Assets, Loans, Dividends, Depreciation).
  → decides **which Cash-Flow activity** the account feeds (Operating / Investing / Financing), plus marks the cash target and the non-cash add-backs.
  → **new field to add.**

> Naming note: this is **our** model, not literal QuickBooks. Real QuickBooks puts the load-bearing classifier on its "Account Type" and treats "Detail Type" as descriptive. We deliberately use Account Type = broad 5, Detail Type = the finer driver. Same two-layer design; our word assignment.

### Detail Type vocabulary (grouped by Cash-Flow activity)

| Detail Type | Valid Account Type | Cash-Flow activity |
|---|---|---|
| Cash and Cash Equivalents | Asset | **Cash** (reconciliation target — not an activity) |
| Accounts Receivable | Asset | Operating (working capital) |
| Inventory | Asset | Operating (working capital) |
| Prepaid Expenses | Asset | Operating (working capital) |
| Accounts Payable | Liability | Operating (working capital) |
| Accrued Expenses | Liability | Operating (working capital) |
| Taxes Payable | Liability | Operating (working capital) |
| Deferred Revenue | Liability | Operating (working capital) |
| Revenue | Income | Operating (feeds net profit) |
| Other Income | Income | Operating (feeds net profit) |
| Cost of Services | Expense | Operating (feeds net profit) |
| Operating Expense | Expense | Operating (feeds net profit) |
| Tax Expense | Expense | Operating (feeds net profit) |
| Depreciation & Amortization | Expense | Operating — **non-cash add-back** |
| Loss / Gain on Disposal | Expense | Operating — **non-cash add-back** |
| Fixed Assets | Asset | **Investing** |
| Long-term Investments | Asset | **Investing** |
| Loans / Long-term Debt | Liability | **Financing** |
| Capital / Contributions | Equity | **Financing** |
| Dividends / Drawings | Equity | **Financing** |
| Retained Earnings | Equity | carry-over (not a cash flow) |
| Interest | Expense | Operating **or** Financing — single policy toggle |

### Account creation UX

1. Pick **Account Type** (broad 5).
2. **Detail Type** list filters to what's valid for that Account Type.
3. Detail Types are shown **grouped by Cash-Flow activity** — Cash · Operating · Operating (non-cash adjustments) · Investing · Financing.
4. Picking one Detail Type sets *what the account is* **and** *which activity it feeds* — and the activity is visible at the moment of choosing. The grouping headers ARE the mapping; nothing hidden.

---

## Data flow

```
Transaction (sale, payment, expense)
  → Journal Entry (two-sided, balanced)
  → General Ledger (every entry, forever — single source of truth)
  → each line points to an Account, which carries Account Type + Detail Type
  → Statements READ the labels (never the account number)
```

---

## Statement generation

### Income Statement
Sum accounts with Account Type **Income** − sum accounts with Account Type **Expense**.

### Balance Sheet
Account Type **Asset** vs **Liability + Equity**. Must tie out (tie-out warning if not).

### Cash Flow Statement (indirect for Operating; direct read for Investing/Financing)

**Step 1 — establish the target.** Opening vs closing balance of all Cash and Cash Equivalents accounts → the net change in cash the whole statement must explain (and reconcile to).

**Operating** (built from balances):
1. Net Profit = Income − Expense.
2. Add back non-cash items (Detail Types Depreciation, Loss/Gain on Disposal). *Added back because they were already subtracted inside profit but never cost cash.*
3. Working-capital changes: for each Operating-activity Detail Type (Receivable, Payable, Inventory, etc.), `this period balance − last period balance`, signed (asset ↑ → subtract; liability ↑ → add).

**Investing + Financing** (built from cash transactions, NOT balances — balance-differencing breaks here, e.g. the furniture/disposal case):
1. Scan every journal entry that touches a Cash and Cash Equivalents account.
2. Read the **other side's** Detail Type → its activity.
3. Keep the ones whose activity is Investing or Financing; take the **actual cash amount**, signed (cash ↑ = +, cash ↓ = −).
4. **Group by Detail Type** and sum → readable line items: `[label derived from the non-cash side's Detail Type] : [summed cash change]`.

**Reconciliation:** Operating + Investing + Financing must equal the Step-1 cash change. Match → green. Mismatch → red flag pointing at the gap.

---

## Principles

- Classify by **label**, never by account number. The account number does nothing — it's just a name.
- Every statement can **prove itself** (Balance Sheet tie-out; Cash Flow reconciliation).
- The type→activity mapping is **seeded data**, not hardcoded in code and not a user-facing editor. Only the 1–2 genuine policy choices (interest/dividends placement) are a simple setting.
- **Transparency is layered:** clean statement face on top; every line expands to show its working (balance change, contributing entries); every number drills down → journal entries → source document; reconciliation shown on the face.

---

## Phased plan

- **Phase 0 — Labeling foundation.** Add the Detail Type field + vocabulary. Confirm/normalize Account Type (`accounts.type`). Backfill existing accounts. Add creation-time validation + the grouped Detail Type picker.
- **Phase 1 — Repoint statements.** Delete `classifyByCode`. Income Statement + Balance Sheet read Account Type. Keep the tie-out. *Closes NEU-039.*
- **Phase 2 — Rebuild Cash Flow.** Operating (indirect) + Investing/Financing (read the cash side) + reconciliation + interest/dividends toggle. *Closes NEU-038.*
- **Phase 3 — Transparency layer.** Expandable workings, drill-down to source, reconciliation on the face.
- **Phase 4 — Robustness/scale.** Queryable ledger (relational lines / unnest view), materialized balances, period close + opening-balance snapshots.

Value order: 0→1→2 = correct & trustworthy (priority). 3 = transparent. 4 = robust at scale.

---

## Test case — "Tumble" (from the Accounting Stuff video)

Loading Tumble's accounts + transactions must reproduce:

- Operating: net profit **9,650** + non-cash **855** (850 depreciation + 5 loss) − **5,200** (receivables ↑) − **450** (payables ↓) = **4,855**
- Investing: −910 (equipment bought) + 10 (furniture sold) = **(900)**
- Financing: +100 (debt) + 50 (stock) − 1,000 (dividends) = **(850)**
- Net change = **3,105**
- Reconciliation: Cash 13,895 → 17,000 = +3,105 ✓

The furniture is the key stress test: sold for 10 cash but book value dropped 15 — so differencing the Fixed Asset balance gives the wrong cash number. Investing/Financing must read the actual 10 cash transaction.

---

## Key files

- `src/components/accounting/FinancialStatementsPage.tsx` — statement engine (`classifyByCode` ~123, `fetchBalances` ~159, `CashFlowStatement` ~1069, hardcoded `AR_ACCOUNTS`/`AP_ACCOUNTS` ~71, dead `CASH_ACCOUNT_PREFIXES` ~70, Balance Sheet tie-out ~1032).
- `src/components/accounting/coa/AccountSidePanel.tsx` — account create/edit form.
- `src/types/accounting-core.ts` — `Account` type (`type`, `subtype`/`sub_type`).
- `src/utils/accounting-api.ts` — `saveAccount` / DB mapping (`mapUiAccountToDb`, `mapDbAccountToUi`).
- `accounts` table — already has `type`, `sub_type`; needs a controlled `detail_type`.
- `journal_entries` table — JSONB `lines[]`, double-entry, dual-currency.

Dev Supabase: `oqermaidggvanahumjmj`. **Never touch prod (`ubspbukgcxmzegnomlgi`) without explicit per-turn permission.**
