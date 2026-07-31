# Phase 2 — Sever the GL Writes

**Status:** Agreed 2026-07-30. Ready to run.
**Parent:** [`ACCOUNTING_REMOVAL_PLAN.md`](./ACCOUNTING_REMOVAL_PLAN.md) · **Blocks:** Phase 1b, Phase 6

---

## The rule

Keep what answers an **operational** question. Delete what only ever existed to feed the ledger.

Not "what could we keep" — *"what breaks if this is gone."* If nothing breaks, it goes.

---

## Two things are load-bearing. Everything else is deletion.

**1. The disbursement event.** *"Have we paid this vendor?"* Real consequences: paying twice, not paying at all, a vendor on the phone. Four fields survive — `disbursementDate`, `paymentMethod`, `reference`, `receiverId`. The reference is the check number or transfer ref; it's how payment gets proven in a dispute.

**2. Liquidation variance.** Hand someone ₱50,000, they spend ₱43,000 — the ₱7,000 is real money owed back. Cut it and cash advances become a hole.

Everything else in this phase is removal.

---

## Flow by flow

| Flow | Action |
|---|---|
| **Expense payable** | Delete `ensureExpensePayableEntry` + its call site. `pending_accounting` was always the status; AP is now derived — vouchers at `pending_accounting` = what we owe. |
| **Collection** | Delete `CollectionGLPostingSheet`. **Preserve the linked-invoice settlement** (`:279`) — that's business reconciliation, not accounting. |
| **Liquidation** | Delete `buildLiquidationClosingEntry` + `closing_journal_entry_id`. Keep the liquidation record, the actuals, the variance, and the overspend reimbursement voucher. |
| **Invoice** | Delete `InvoiceGLPostingSheet`. **No replacement gate** — see below. |
| **Disbursement** | Keep the step, gut the form. |
| **Reversal** | Drop `revenue_account_id` from `invoiceReversal.ts:159`. `collectionResolution.ts` needs nothing — it has zero GL. |
| **Tickets** | Delete both types outright. |
| **Statuses** | Leave alone. |

---

## Reversals of the first draft

This document previously recommended four things that were wrong. Recorded so they don't get re-proposed.

### ❌ An "Issue Invoice" confirm — dropped

Argued for on the grounds that "someone should look before an invoice goes out." **Someone already does.** NEU-103 routes every invoice to a named approver: `approval_status: 'pending_approval'`, `canApproveInvoice`, and migration `249` exists specifically so that approver can see the row. Its comment: *"can't be finalized until approved."*

A second gate after an existing one is ceremony. The GL post was a separate act only because posting was a separate act. **Approved is issued.**

### ❌ Reimplementing the two tickets — dropped

`mark_invoice_gl_posted` has **no caller at all** — already dead code. `mark_collection_gl_posted` is wired (`workflowTickets.ts:303`) but exists solely to tell someone *"go post this to the GL."* No GL, no reason to exist.

Renaming them to `mark_invoice_issued` / `mark_collection_received` was preserving machinery for its own sake. **Delete both cases, the creation site, and any open tickets carrying them.**

### ❌ Status renames (`posted` → `issued`/`received`/`closed`) — dropped

Cosmetic. Costs a data migration on live rows plus every filter, badge and tab keying off the string — adding work in the name of removing work. `posted` becomes an ugly legacy word meaning "done." Rename later as polish if it grates; it is not part of this removal.

### ❌ `fx_gain_loss` and `disbursed_from` — dropped

**Realized FX:** storing the gain/loss means keeping *two* rates (locked at approval, actual at disbursement) plus the delta math — most of the FX complexity, for a number nobody can act on without a ledger. **Keep one rate: the actual rate at disbursement.** That's what really left the bank, and it's what the booking cost.

**Source of funds:** a field nobody asked for. Add it if Treasury asks.

---

## Disbursement: what goes

`DisburseEVoucherPage.tsx` is 1,070 lines. Ledger-only state to remove:

```
accounts · advancesReceivable · fxGainAccount · fxLossAccount · loadingAccounts
sourceAccountId · sourceAccountName · sourceAccountCode
disbursementRateInput  (the second rate)
```

Plus carrying-account selection (AP vs Employee Cash Advances Receivable), the JE line construction, `apBase`/`cashBase`, and the FX gain/loss branch in `canConfirm`.

What remains: pick a date, a method, a reference, a receiver, confirm. Status goes to `disbursed`.

---

## Deleted in this phase

```
src/utils/accounting/postTransactionJournal.ts
src/utils/accounting/buildExpensePayableEntry.ts
src/utils/accounting/buildLiquidationClosingEntry.ts
src/utils/accounting/buildTransferEntry.ts          (also Phase 3)
src/components/accounting/invoices/InvoiceGLPostingSheet.tsx      899 LOC
src/components/accounting/collections/CollectionGLPostingSheet.tsx 1,063 LOC
```

Call sites to unwire: `BillingDetailsSheet:586`, `CollectionDetailsSheet:506`, `DisburseEVoucherPage.handleConfirm`, `LiquidationForm:239`, `EVoucherWorkflowPanel:286-294`, `workflowTickets.ts:225,229,303`.

---

## Net effect

No new columns. No new UI. No data migration. One form rewrite; everything else deleted.

**Check before shipping:** whatever reads `invoices.status === "posted"` today needs to keep working when nothing sets it any more.
