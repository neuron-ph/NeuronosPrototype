# Accounting v1 — Archive Manifest

**Tag:** `archive/accounting-v1`
**Commit:** `d29b298` (`refactor(approvals): use the standard DataTable`)
**Archived:** 2026-07-30
**Removal plan:** [`docs/ACCOUNTING_REMOVAL_PLAN.md`](../ACCOUNTING_REMOVAL_PLAN.md)

This is the frozen state of Neuron OS's double-entry accounting layer immediately before it was removed. Chart of Accounts, General Journal, Financial Statements, the Transaction Journal, and the GL posting seam.

---

## Why a tag and not a branch

Deliberate. Do not "fix" this later by creating a branch.

- **Vercel builds every pushed branch.** `vercel.json` sets no ignored-build-step, and the repo carries exactly three remote branches (`dev`, `main`, `master`). A fourth would produce a preview deployment and a permanent preview URL wired to the **dev** Supabase project — which after removal has no accounting tables, so the preview would half-render.
- **`stable/` is the release namespace.** 107 tags live there, date-named, and the documented rollback is `git reset --hard stable/YYYY-MM-DD`. An archive pointer in that list pollutes the exact set someone scans during an incident.
- **CI is unaffected.** `e2e.yml` fires only on `pull_request` to dev/main plus manual dispatch; `supabase-keepalive.yml` is cron-only. A tag push triggers neither.

The commit is permanent in `dev` history regardless — the tag is a bookmark, not infrastructure.

To *run* the archived system, create a branch from the tag at that moment and take the preview build deliberately:
```bash
git switch -c spike/accounting-v1 archive/accounting-v1
```

---

## Restoring the code

```bash
git checkout archive/accounting-v1 -- \
  src/components/accounting/coa \
  src/components/accounting/journal \
  src/components/accounting/period-close \
  src/components/accounting/FinancialStatementsPage.tsx \
  src/components/accounting/invoices/InvoiceGLPostingSheet.tsx \
  src/components/accounting/collections/CollectionGLPostingSheet.tsx \
  src/utils/accounting \
  src/types/accounting.ts \
  src/types/accounting-core.ts \
  src/utils/accounting-api.ts \
  src/utils/accountingDetailTypes.ts \
  src/utils/cashFlow.ts \
  src/utils/fxRevaluation.ts \
  src/utils/accounting-seed.ts \
  src/hooks/useAccountDetailTypes.ts \
  src/hooks/useFxRevaluation.ts
```

Files restore cleanly. **Wiring does not** — see *Rewiring* below.

---

## What is archived

### Chart of Accounts — `src/components/accounting/coa/` (1,413 LOC)
```
AccountLedger.tsx        AccountSidePanel.tsx
ChartOfAccounts.tsx      DetailTypesTab.tsx
```

### General Journal — `src/components/accounting/journal/` (3,267 LOC)
```
GeneralJournal.tsx           JournalEntryDetailPanel.tsx
JournalLineEditor.tsx        NewJournalEntryScreen.tsx
```

### Financial Statements
```
src/components/accounting/FinancialStatementsPage.tsx        (1,604 LOC)
```
Note: classified accounts by guessing from account number (`classifyByCode`). Known-broken; see `docs/ACCOUNTING_REFACTOR_PLAN.md`, which never left Phase 0.

### Period close / FX revaluation
```
src/components/accounting/period-close/FxRevaluationPanel.tsx
src/utils/fxRevaluation.ts        src/hooks/useFxRevaluation.ts
```

### The posting seam — `src/utils/accounting/` (369 LOC)
```
postTransactionJournal.ts          buildExpensePayableEntry.ts
buildTransferEntry.ts              buildLiquidationClosingEntry.ts
```

### GL posting sheets (lived inside the *kept* modules)
```
src/components/accounting/invoices/InvoiceGLPostingSheet.tsx        (899 LOC)
src/components/accounting/collections/CollectionGLPostingSheet.tsx  (1,063 LOC)
```

### Type / util layer
```
src/types/accounting-core.ts          src/utils/accounting-api.ts
src/utils/accountingDetailTypes.ts    src/utils/cashFlow.ts
src/utils/accounting-seed.ts          src/hooks/useAccountDetailTypes.ts
```

### Dead prototype layers (zero importers even before removal — 3,541 LOC)
```
src/components/accounting/shared/    11 files
src/components/transactions/          9 files
src/utils/accounting-store.ts         throw-stub
```

---

## The `types/accounting.ts` split point

This file was **not** deleted wholesale — it was mixed. Restoring it verbatim will collide with `types/financials.ts`.

| Lines | Content | Fate at removal |
|---|---|---|
| 8 | `Currency` | **kept** |
| 15–21 | `FxFields` | **kept** — per-document FX, not GL revaluation |
| 23–45 | `AccountType`, `Account` | archived |
| 47–64 | `Transaction` | archived |
| 67–69 | `AccountNode` | archived |
| 72–163 | `Billing`, `Collection`, `Expense`, `Invoice` | **kept** — moved to `types/financials.ts` |
| 165–169 | `AccountingEntry` | archived |

---

## Database

Schema is **not** preserved by git in restorable form. See:
```
docs/archive/accounting-v1-restore.sql
```
generated from the live dev schema during Phase 6 and proven by a `drop → restore → verify → drop` cycle on dev.

Objects covered: `accounts`, `account_detail_types`, `journal_entries`, `journal_lines`, `transaction_journal_entries`, `get_account_balances()`, the TJ entry-number trigger, the associated RLS policies, and the two catalog columns (`catalog_items.account_id`, `catalog_categories.parent_account_id`).

Migrations that built the system — retained in the tree, append-only, never edited:
`001` `003` `005` `044` `082` `083` `091` `161` `162` `164` `167` `194` `215` `228` `229` `230` `231` `241` `243` `244` `247` `248`

The drop is `250_drop_accounting.sql`.

---

## Rewiring (what restoring files does NOT do)

A future reactivation must also re-add:

1. **Routes** — `App.tsx` ~1218-1221 (coa + ledger), ~1242-1247 (journal + statements), plus the lazy `RouteWrapper` blocks ~858-890
2. **Page-id maps** — `App.tsx` ~259-273 and ~315-329; `NeuronSidebar.tsx` ~513-521; the `Page` unions in `NeuronSidebar.tsx:217` and `Layout.tsx:53`
3. **Access schema** — the `acct_journal` (5 tabs), `acct_coa` (3 tabs), `acct_statements` (3 tabs) module blocks in `config/access/accessSchema.ts`, plus `actionApplicability.ts`, `accessSchema.test.ts`, `admin/CreateUserPage.tsx`, `admin/permissionsConfig.ts`
4. **Record visibility** — the `transactions`, `journal_entries`, `financial_filings` rows in `admin/accessProfiles/recordVisibilityConfig.ts`
5. **The catalog→COA weld** — `catalog_items.account_id` and `catalog_categories.parent_account_id`, plus the account pickers and the required-on-save validation in `CatalogManagementPage.tsx`
6. **The posting call sites** — `BillingDetailsSheet` (invoice sheet), `CollectionDetailsSheet` (collection sheet), `DisburseEVoucherPage.handleConfirm`, `LiquidationForm`, `EVoucherWorkflowPanel`, and the two ticket resolutions in `utils/workflowTickets.ts:226,230`
7. **The `fund_transfer` voucher type** — `types/evoucher.ts`, `utils/evoucherTransactionType.ts`, `AddRequestForPaymentPanel.tsx`, `useEVoucherSubmit.ts`, `ApprovalsPage.tsx`, and the `routing_rules` rows from migration `246`

---

## Why it was removed

Maintenance weight, not product fit. Every money feature owed an answer to *"and what does this post?"* — that coupling, more than the line count, is what slowed the project.

The replacement model: **the booking is the unit of financial truth.** Financial tracking continues through E-Vouchers, Expenses, Billings, Invoices and Collections. Statutory accounting is the bookkeeper's job, outside the system.
