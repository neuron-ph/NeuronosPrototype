# Accounting Removal — Build Plan

**Status:** Plan drafted. Not started. Awaiting Go Ahead.
**Goal:** Root the double-entry accounting concept out of Neuron OS — Chart of Accounts, General Journal, Financial Statements, the Transaction Journal, and the debit/credit vocabulary itself.
**Not a feature flag.** Not a hidden module. The tables, columns, types, and words leave the running system.

**But preserved for reactivation** — via an `archive/accounting-v1` git tag and a generated schema-restore script, not via dead code left in the tree and not via a new branch. Zero deployment surface. See Phase −1.

---

## Thesis

> "The whole point of the system now is to track the bookings and just how much money is involved with them."

The **booking** is the unit of financial truth. Neuron does not do treasury and does not do statutory accounting — that stays with the bookkeeper, outside the system.

Financial tracking survives in full, at the transactional level:
**E-Vouchers · Expenses · Billings · Invoices · Collections.**

What leaves is the layer *underneath* them that translated every movement into a debit and a credit.

---

## Why now

Not product-fit — **maintenance weight**. Two compounding costs:

1. **The coupling tax.** Every money feature currently owes an answer to "and what does this post?" That question, not the line count, is the bog.
2. **It was never finished.** `docs/ACCOUNTING_REFACTOR_PLAN.md` still reads *"Build started (Phase 0)."* `FinancialStatementsPage` classifies accounts by guessing from account numbers (`classifyByCode`). The statements were structurally untrustworthy the whole time they shipped.

Prod data is non-final. Journal entries there are disposable. No migration of historical GL data is required.

---

## Scope

### Dies

| Concept | Where |
|---|---|
| Chart of Accounts | `accounting/coa/` (4 files, 1,413 LOC) |
| General Journal | `accounting/journal/` (4 files, 3,267 LOC) |
| Financial Statements | `FinancialStatementsPage.tsx` (1,604 LOC) |
| Transaction Journal | table + trigger + RLS + UI (migrations 243, 244) |
| The posting seam | `utils/accounting/` (4 files, 369 LOC) + 2 GL posting sheets (1,962 LOC) |
| Period close / FX revaluation | `period-close/`, `useFxRevaluation`, `utils/fxRevaluation.ts` |
| Fund-transfer voucher type | `fund_transfer` — see rationale below |
| Catalog→COA link | `catalog_items.account_id`, `catalog_categories.parent_account_id` |
| Dead prototype layers | `accounting/shared/` (10 files), `components/transactions/` (9 files), `accounting-store.ts` — **3,541 LOC, zero importers** |

### Lives

E-Vouchers, Expenses, Billings, Invoices, Collections — and every report except the statements.

**Confirmed during investigation:** `FinancialDashboard`, `PLTrendCard`, `CashFlowWaterfall`, and `IncomeVsCostBreakdown` are **booking-derived, not GL-derived**. They import formatters and types only — no `.from("accounts")`, no balance RPC. `FinancialDashboard:349` builds from a `bookingMap`.

The only GL-balance readers in the app are `FinancialStatementsPage` and `coa/AccountLedger`, both of which are being deleted. **`SalesReport`, `CollectionsReport`, `ReceivablesAgingReport`, `UnbilledRevenueReport`, `BookingCashFlowReport`, and `FinancialHealthPage` all survive untouched.**

### Explicitly NOT touched — false positives

A blind grep for `credit` hits **credit terms** (30-day payment terms). Different concept, same letters. These stay:

```
utils/creditTerms.ts            utils/creditTerms.test.ts
hooks/useCreditTerms.ts         admin/profiling/CreditTermsTab.tsx
```
Plus the `credit_terms` field on `Invoice`, and the "credit" matches in `BusinessDevelopment.tsx`, `ContactsModuleWithBackend.tsx`, `QuotationBuilderV3.tsx`, `Pricing.tsx`.

Also staying: **`utils/accounting-math.ts`** — despite the name it is `calculateInvoiceBalance` / `InvoiceFinancialState` / `formatCurrency`. Pure invoice math, no GL. And **`utils/accountingCurrency.ts`** (`formatMoney`), used across the keepers.

---

## Why the fund-transfer type dies

A bank-to-bank transfer is the **only** voucher type that is neither booking-linked nor a direct/office expense. It moves money sideways; no booking's position changes.

`buildTransferEntry` resolves `details.from_account_id` / `to_account_id` against the `accounts` table. The "accounts" a transfer moves between *are* Chart of Accounts rows. The type only ever made sense because a GL existed.

It leaves with the thing that created it. No replacement cash-accounts table — bank balance is the bookkeeper's job.

---

## The blocker that reorders everything

**The Catalog is welded to the COA at NOT NULL.**

- Migration **241** added `catalog_categories.parent_account_id` and `catalog_items.account_id` as FKs to `accounts`.
- Migration **247** backfilled all 335 items + 31 categories and made both **NOT NULL** — deliberately, so the AP two-step would always have an account to debit.

`accounts` cannot be dropped while the Catalog references it. And the Catalog is non-negotiable architecture.

**Therefore the catalog unweld goes first**, before anything else touches the database.

---

## Phases

Each phase leaves the app working and independently verifiable. No phase depends on a later one to compile.

### Phase −1 — Archive first (nothing is deleted until this exists)

The accounting modules are preserved for future reactivation. **Not in the working tree** — `tsconfig.json` includes all of `src` with only `node_modules` and `build` excluded, so an in-tree `src/_archive/` would either break typecheck (its imports point at deleted files) or need an exclude rule and rot silently. Worse, those 74 files would still surface in every grep and file search, which is the exact friction this whole exercise removes.

Git is the archive. **Tag only — no branch.** Two artifacts, created at the last commit before Phase 0:

```
archive/accounting-v1                    annotated tag — own namespace, not stable/
docs/archive/ACCOUNTING_V1_MANIFEST.md   the index that makes the tag usable
```

**Why no branch, and why not `stable/`** — this is deliberate, do not "improve" it later:

- **Vercel deploys on branch pushes.** `vercel.json` sets no ignored-build-step, and the repo has exactly three remote branches (`dev`, `main`, `master`). A fourth would create a preview deployment and a permanent preview URL pointed at the dev Supabase project — which after Phase 6 has no accounting tables, so the archive preview would half-render. A tag creates no branch and therefore no deployment.
- **`stable/` is the release namespace.** 107 tags live there, all date-named, and the documented rollback is `git reset --hard stable/YYYY-MM-DD`. An archive pointer in that list pollutes the exact set someone scans during an incident. `archive/` keeps them separate.
- **GitHub Actions are unaffected either way.** `e2e.yml` fires only on `pull_request` to dev/main plus manual dispatch; `supabase-keepalive.yml` is cron-only. A tag push triggers neither.

The commit is already permanent in `dev` history — the tag is a bookmark, not new infrastructure. To *run* the old system later, create a branch from the tag at that moment and take the preview build deliberately.

The manifest is the real deliverable. It records the complete path list, the 22 migration numbers, the split point in `types/accounting.ts`, and the literal restore command:

```bash
git checkout archive/accounting-v1 -- \
  src/components/accounting/coa \
  src/components/accounting/journal \
  src/components/accounting/FinancialStatementsPage.tsx \
  src/utils/accounting/ ...
```

**Schema preservation is separate, and git does not cover it.** The `CREATE` statements technically survive in migrations 001 / 082 / 229 / 231 / 241 / 243 / 244, but reassembling the GL from seven scattered migrations later is a research project, not a restore. So before Phase 6 drops anything, introspect the **live dev schema** and generate:

```
docs/archive/accounting-v1-restore.sql
```

Verbatim, generated not hand-written — `accounts`, `account_detail_types`, `journal_entries`, `journal_lines`, `transaction_journal_entries`, `get_account_balances`, the TJ entry-number trigger, the RLS policies, and the two catalog columns. `clone_introspect` is already installed on dev for the sync script; use it.

**No Supabase branch is created to test it.** Dev data is disposable, so the inverse is proven on dev itself during Phase 6: `drop → restore → verify the tables and RLS come back → drop again`. Same proof, no paid infrastructure, no new resource to clean up.

**Verify:** tag pushed; manifest committed. The restore SQL is proven in Phase 6 by the drop→restore→drop cycle above. An untested inverse is not an inverse.

---

### Phase 0 — Free deletions (no behaviour change)

Pure dead code, verified zero external importers.

- `src/components/accounting/shared/` — all 10 files + `index.tsx`
- `src/components/transactions/` — all 9 files + `types.ts`
- `src/utils/accounting-store.ts` (a deliberate throw-stub)
- Remove `acct-transactions` from the `Page` unions (`NeuronSidebar.tsx:217`, `Layout.tsx:53`)

**Verify:** typecheck clean, app boots, no route regressions. ~3,541 LOC gone with zero risk.

---

### Phase 1 — Unweld the Catalog

The blocker. Must land before any DB drop.

- `CatalogManagementPage.tsx` — remove Query 4 (`accounts`, ~241), `parentAccountOptions` (~262), `itemAccountOptions` (~291), the `account_id` field on the add form (~162, ~207), the account column in the item select (~199), and the hard validation at **~380** (`"An account (COA) is required"`).
- Strip `parent_account_id` from the category create form (`addCategoryParentAccountId`, ~166).
- Migration: `ALTER TABLE catalog_items DROP COLUMN account_id;` and `ALTER TABLE catalog_categories DROP COLUMN parent_account_id;` plus their indexes.

**Verify (browser):** create a catalog item, edit one, create a category — all succeed with no account picker present. `buildCatalogSnapshot()` output unchanged. Catalog doctrine in `CLAUDE.md` still holds: `catalog_item_id` and `catalog_snapshot` are untouched, only the COA link goes.

---

### Phase 2 — Sever the writes

The real work. Each keeper gets its own terminal state instead of a journal entry.

Delete:
```
utils/accounting/postTransactionJournal.ts
utils/accounting/buildExpensePayableEntry.ts
utils/accounting/buildTransferEntry.ts
utils/accounting/buildLiquidationClosingEntry.ts
accounting/invoices/InvoiceGLPostingSheet.tsx      (899 LOC)
accounting/collections/CollectionGLPostingSheet.tsx (1,063 LOC)
```

Rewire the call sites:

| Flow | Was | Becomes |
|---|---|---|
| Invoice issued | `InvoiceGLPostingSheet` → Dr AR / Cr Revenue | invoice status `issued`; sheet + trigger removed from `BillingDetailsSheet:586` |
| Collection received | `CollectionGLPostingSheet` → Dr Cash / Cr AR | the collection row *is* the record; removed from `CollectionDetailsSheet:506` |
| EV disbursed | `JE-DISB` in `DisburseEVoucherPage.handleConfirm` | status `disbursed` + date / method / source |
| EV liquidated | closing entry at `LiquidationForm:239` | liquidation record + variance vs advance |
| Expense approved | `ensureExpensePayableEntry` at `EVoucherWorkflowPanel` | expense row status |
| Fund transfer | `JE-XFER` | type removed entirely (Phase 3) |

Also: `utils/workflowTickets.ts:226,230` — two tickets currently resolve *inside* the GL posting sheets. They need new resolution points or they will never close.

**Verify (browser, dev):** full E2E on each of the five keepers — raise an EV through approval → disburse → liquidate; issue an invoice; record a collection. Confirm no rows land in `journal_entries` or `transaction_journal_entries`. The GL pages still exist at this point and should show nothing new — that is the check.

---

### Phase 3 — Remove the fund-transfer type

- `types/evoucher.ts:40` — drop the enum member
- `utils/evoucherTransactionType.ts:16,30` — label + option
- `AddRequestForPaymentPanel.tsx` — 6 sites (~208, 780, 788, 1229, 1242–1243) incl. the From/To account fields
- `EVoucherWorkflowPanel.tsx:185`
- `useEVoucherSubmit.ts:63, 431, 494` — note 494 sets a **distinct submitted status** for transfers; that branch goes
- `ApprovalsPage.tsx:84` — the "Transfer of Funds" label
- Check `routing_rules` rows for transfer approvers

**Verify:** the voucher type picker no longer offers Transfer of Funds; Approvals renders cleanly; existing transfer rows in dev are deleted (disposable data).

---

### Phase 4 — Delete the surfaces

- `accounting/coa/`, `accounting/journal/`, `FinancialStatementsPage.tsx`, `accounting/period-close/`, TJ workspace UI
- Routes: `App.tsx:1218-1221` (coa + ledger), `1242-1247` (journal + statements)
- Page-id maps: `App.tsx:259-273`, `315-329`; `NeuronSidebar.tsx:513-521`; `Layout.tsx:53`
- Lazy imports / `RouteWrapper` blocks at `App.tsx:858-890`

Access schema — remove the module blocks:
- `accessSchema.ts:507-517` — `acct_journal` + 5 tabs
- `accessSchema.ts:518-526` — `acct_coa` + 3 tabs (incl. Balance Sheet, Income Statement)
- `accessSchema.ts:601-609` — `acct_statements` + 3 tabs
- `actionApplicability.ts:299` — `acct_journal`
- `accessSchema.test.ts:102,104,111` — expectations
- `admin/CreateUserPage.tsx:65,67` — the module list
- `admin/permissionsConfig.ts:78-80` — the union type

`recordVisibilityConfig.ts` — **rework, do not just delete.** Three record types are gated on dying modules:
```
:118  transactions        → ["acct_financials", "acct_journal"]
:119  journal_entries     → ["acct_journal", "acct_financials"]
:120  financial_filings   → ["acct_statements"]
```
All three record types disappear with their tables, so the rows go — but confirm nothing else reads those keys first, or visibility silently opens up.

**Verify:** Access Configuration matrix renders with the three modules absent; an existing user's profile still loads; `accessSchema.test.ts` passes; no dead sidebar entries; direct navigation to `/accounting/journal` 404s rather than white-screens.

---

### Phase 5 — Delete the layer (the vocabulary leaves)

- `types/accounting-core.ts` (89) — delete
- `utils/accounting-api.ts` (222), `utils/accountingDetailTypes.ts` (177), `utils/cashFlow.ts` (143), `utils/fxRevaluation.ts` (207), `utils/accounting-seed.ts` (123) — delete
- `hooks/useAccountDetailTypes.ts` (22), `hooks/useFxRevaluation.ts` (222) — delete
- `components/SupabaseDebug.tsx` — strip the accounts/journal probes

**`types/accounting.ts` splits — it is mixed, not disposable.**

| Lines | Content | Fate |
|---|---|---|
| 8 | `Currency` | **keep** — used app-wide |
| 15–21 | `FxFields` | **keep** — document FX metadata on Billing/Collection/Expense/Invoice; GL revaluation dies, per-document FX does not |
| 23–45 | `AccountType`, `Account` | delete |
| 47–64 | `Transaction` | delete |
| 67–69 | `AccountNode` | delete |
| 72–163 | `Billing`, `Collection`, `Expense`, `Invoice` | **keep** — consumed by the whole invoice document pipeline |
| 165–169 | `AccountingEntry` | delete (only the dead shared/ layer used it) |

Move the keepers to `types/financials.ts` — the file header already says that is where booking-first finance types belong. Then delete `types/accounting.ts`.

**Verify:** typecheck. The invoice document pipeline (`InvoiceDocument`, `InvoicePDFRenderer`, `invoiceDocumentResolver`, `useInvoiceDocumentState`) is the highest-risk consumer — render a PDF and diff it against a pre-change capture.

---

### Phase 6 — Drop the database (dev only)

Latest migration is **249**, so this is `250_drop_accounting.sql`. Nothing existing is edited — migrations are append-only, history stays intact by construction.

**Precondition:** `docs/archive/accounting-v1-restore.sql` has been generated from live dev schema (Phase −1). It is **proven here**, on dev, before the drop is committed: run the drop, immediately run the restore, confirm every table, RPC, trigger and RLS policy comes back, then drop again. No Supabase branch, no extra infrastructure. The drop does not ship without a proven inverse.

```sql
DROP TABLE IF EXISTS transaction_journal_entries CASCADE;
DROP TABLE IF EXISTS journal_lines  CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS account_detail_types CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP FUNCTION IF EXISTS get_account_balances CASCADE;
-- + the TJ entry-number trigger (243) and the multicurrency journal columns (082/083)
```

Superseded migrations, for the record — not edited, just no longer meaningful:
`001`, `003`, `005`, `044`, `082`, `083`, `091`, `161`, `162`, `164`, `167`, `194`, `215`, `228`, `229`, `230`, `231`, `241`, `243`, `244`, `247`, `248`.

**Dev only.** Prod drops in Release B — see below.

**Verify:** full app smoke; RLS advisors clean via `get_advisors`.

---

## Deployment & release

Branch flow is unchanged. All work on `dev` → Vercel preview. Merge to `main` only on explicit approval, per `CLAUDE.md`.

**Edge Functions: non-issue.** Verified — `admin-user-actions`, `create-user`, and `send-feedback-email` are the only three, and none reference accounts, journals, or debit/credit. Step 1 of the release checklist is a no-op for this work.

### The rule that matters: two releases, never one

**Never drop the prod tables in the same release as the code removal.**

The documented rollback is `git reset --hard stable/YYYY-MM-DD`. That restores code. It does **not** restore schema. Drop the tables and roll the code back, and prod runs GL code against tables that no longer exist — a worse outage than anything this work is fixing.

| | Ships | Rollback story |
|---|---|---|
| **Release A** | Code removal only (Phases −1 → 5). Prod tables orphaned but fully intact. | `git reset --hard` works completely — the tables are still there |
| **Release B** | `250_drop_accounting.sql` against prod. Only after A has soaked. | `accounting-v1-restore.sql`, tested in advance |

Release A is fully reversible with the procedure that already exists. Release B is the irreversible one, and by then the system has been running without accounting for as long as you want.

### The drift window

Between the dev drop and Release B, dev has no accounting tables and prod still does.

`npm run sync:dev` reads prod's live schema each run and skips tables missing in dev, so it degrades with drift warnings rather than failing. **Those warnings are expected during this window and are not a bug.**

### Looking at the old system later

Vercel builds any branch, so `archive/accounting-v1` can be spun up as a preview deployment whenever you want to see how the old accounting actually worked. Pair it with a Supabase branch running `accounting-v1-restore.sql` and you get a fully working snapshot on demand — without touching `dev` or `main`.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Code rollback restores code but not schema** — rolling back after a prod table drop leaves GL code hitting missing tables | Two releases. A = code only (tables intact, `git reset --hard` fully works). B = the drop, later. |
| Reactivation later finds no working restore path | Phase −1 `archive/accounting-v1` tag + manifest, plus a restore SQL **proven on dev via drop→restore→drop** before the drop is committed |
| Archiving itself disturbs the deployment setup | Tag only — no new branch, so no Vercel preview build; `archive/` namespace, so the 107 `stable/` release tags are untouched; CI fires on PRs only, so a tag push triggers nothing |
| Catalog breaks — non-negotiable architecture | Phase 1 in isolation, browser-verified before anything else moves |
| Invoice PDF regression from the `types/accounting.ts` split | Capture a rendered PDF before Phase 5, diff after |
| Two workflow tickets never close (`workflowTickets.ts:226,230`) | New resolution points designed in Phase 2, not deferred |
| Stale `permission_overrides` rows referencing dead modules | Audit after Phase 4 — materialized grants may point at removed module ids |
| Record visibility silently opens when config rows are removed | Phase 4 reworks `recordVisibilityConfig`, does not blind-delete |

---

## Out of scope

- **The mirror app.** `AccountingBookingsShell`, `AccountingCustomers`, `AccountingProjectsPage`, `AccountingContractsPage`, `CustomerLedgerDetail` — accounting's duplicate views of the rest of the product. Marcus has ruled this not a problem. Untouched.
- **Booking P&L as the front screen.** The affirmative half of the redesign — making booking-level revenue/cost/margin/collected/outstanding the thing you land on. This removal clears the ground for it; it is a separate pass.
- **Renaming `accounting-math.ts`.** Badly named, correctly scoped. Leave it.
- **The office-expense bucket.** D1 carves out direct/office expense as non-booking-linked, so total spend will never equal the sum of bookings. Expected. That bucket needs a visible home eventually — not in this pass.

---

## Expected result

~9,100 LOC of live accounting code removed, plus ~3,541 LOC of dead prototype layers already sitting in the tree. Five financial modules that no longer owe anyone a debit and a credit.
