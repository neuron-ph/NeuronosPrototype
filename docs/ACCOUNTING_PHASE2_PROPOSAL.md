# Phase 2 — Terminal States Proposal

**Status:** Proposal. Nothing implemented. Needs Marcus's decisions before Phase 2 runs.
**Parent:** [`ACCOUNTING_REMOVAL_PLAN.md`](./ACCOUNTING_REMOVAL_PLAN.md) · **Blocks:** Phase 1b, Phase 6

---

## The principle

Every money flow currently ends by writing a journal entry. Remove the journal and each flow needs a terminal state that names **the business fact**, not the bookkeeping act.

That is the whole design rule. Everything below follows from it.

---

## The vocabulary problem

`posted` is not a status. It is a GL verb, and it has leaked into the state machine of all three record types:

```
types/evoucher.ts:12    "posted"  // GL entries written — expense is on the books
InvoiceGLPostingSheet:415        status: "posted"
CollectionGLPostingSheet:541     status: "posted"
```

For an e-voucher, `posted` is the **terminal** state of the entire lifecycle — reached after liquidation is verified. So "root out the vocabulary" is not only about deleting `debit`/`credit`; it means these three state machines get honest end states.

Renaming a status is a data migration, not just a string change. Each rename below needs a `UPDATE … SET status = …` for existing rows, folded into Phase 6.

---

## Flow 1 — Invoice issued

**Today:** an accountant opens `InvoiceGLPostingSheet`, picks AR and Revenue accounts, confirms. The sheet writes the JE, then sets `invoices.status = "posted"` and stores `journal_entry_id`.

**Proposed:** `issued`.

The invoice's own status is the terminal state. The sheet is deleted.

**Decision needed — does the human gate survive?**
Today an accountant must actively confirm before an invoice becomes `posted`. That is a real control point: *accounting has seen this and accepts it.* Two ways to go:

- **(a) Keep a gate, drop the accounting.** A simple "Issue Invoice" confirm — same control, no account pickers. One button, no sheet.
- **(b) Auto-issue.** Invoice becomes `issued` the moment it's created and approved. Simpler; loses the checkpoint.

I recommend **(a)**. The gate wasn't there because of the GL — it was there because someone should look before an invoice goes out. That reason survives.

---

## Flow 2 — Collection received

**Today:** `CollectionGLPostingSheet` writes Dr Cash / Cr AR, sets `collections.status = "posted"`, and reconciles against linked invoices.

**Proposed:** `received`.

The collection row — amount, date, method, linked invoices — *is* the record. Nothing else needs to happen. Delete the sheet outright; no replacement gate.

Note the sheet also touches `invoices` (line 279) to settle the linked invoice. **That logic must be preserved** — it's business reconciliation, not accounting. It moves to the collection save path.

---

## Flow 3 — E-Voucher disbursed

**Today:** `DisburseEVoucherPage.handleConfirm` builds `JE-DISB` and moves the voucher to `disbursed`.

**Proposed:** `disbursed` — unchanged. This one already has an honest status.

But the disbursement form carries operational data that is **not** bookkeeping and must survive:

| Field | Keep? |
|---|---|
| `disbursementDate` | yes |
| `paymentMethod` | yes |
| `reference` (+ `refRequired`) | yes |
| `receiverId` / receiver name (NEU-045) | yes — liquidation depends on who took the cash |
| `sourceAccountId` | **decision needed** |
| realized FX gain/loss | **decision needed** |

### ⚠ Decision A — source of funds

`canConfirm` currently requires `!!sourceAccountId`, and that id is a **COA account**. Treasury picks which account the cash left from.

You ruled out a cash-accounts table ("bank balance is the bookkeeper's job") — correct for *balances*. But this isn't a balance, it's a fact about a disbursement: *where did this money come from.* Options:

- **(a) Drop the field.** Simplest. You lose the ability to answer "which account paid this voucher."
- **(b) Free text.** Zero schema. Gets inconsistent immediately.
- **(c) A short fixed list** — `Cash on Hand · BPI · BDO · GCash · Other` as an enum or tiny lookup. Not a chart of accounts: no types, no balances, no parents, no statements. Just a label on a disbursement.

I recommend **(c)**. It's one column and it keeps a question answerable that Treasury will absolutely ask.

### ⚠ Decision B — realized FX

A foreign voucher is approved at one rate and disbursed at another. Today the delta posts to an FX gain/loss account. With no GL, either:

- **(a) Drop it.** The delta silently vanishes.
- **(b) Record it on the voucher** — `fx_gain_loss` numeric, visible on the detail view, no account involved.

I recommend **(b)** if you deal in USD with any regularity — it's a number worth seeing per voucher. **(a)** if foreign vouchers are rare enough not to care.

---

## Flow 4 — E-Voucher liquidated

**Today:** `LiquidationForm` inserts a liquidation record, sets `pending_verification`, writes `evoucher_history`, and on verification calls `buildLiquidationClosingEntry` and stores `closing_journal_entry_id`. Overspend auto-creates a reimbursement voucher (`status: "draft"`).

**Proposed:** verification takes the voucher to **`closed`** (replacing `posted`).

Everything that matters already exists as real data: the liquidation record, the actuals, the variance against the advance, and the reimbursement voucher on overspend. Only `buildLiquidationClosingEntry` and `closing_journal_entry_id` go.

`closed` is the honest name for "this advance is fully accounted for and the voucher is done."

---

## Flow 5 — Expense approved

**Today:** on arrival at `pending_accounting`, `ensureExpensePayableEntry` recognises Dr Expense / Cr AP so approved-but-unpaid shows as a real AP balance "instead of only a status" (its own comment).

**Proposed:** delete it. `pending_accounting` **is** the status, and it was always sufficient.

This is the cleanest deletion in the set — the helper exists purely to mirror a status into the ledger. AP is now derived: *vouchers at `pending_accounting` = what we owe.* Same number, no ledger.

---

## Flow 6 — Transfer processed

Dies entirely with Phase 3. Already decided.

---

## The two orphaned tickets

`utils/workflowTickets.ts:226,230`:

```ts
case "mark_invoice_gl_posted":
  // Resolution handled inside InvoiceGLPostingSheet — ticket closes after GL post
  break;
case "mark_collection_gl_posted":
  // Resolution handled inside CollectionGLPostingSheet — ticket closes after GL post
  break;
```

Both are empty cases whose real resolution lives in the sheets being deleted. Delete the sheets and these tickets **never close** — they accumulate in the Accounting queue forever.

**Proposed:** rename and implement them properly, in the same place as the other actions:

```ts
case "mark_invoice_issued":
  await supabase.from("invoices").update({ status: "issued" }).eq("id", linkedRecordId);
  break;
case "mark_collection_received":
  await supabase.from("collections").update({ status: "received" }).eq("id", linkedRecordId);
  break;
```

This actually *improves* on today — the resolution moves from a hidden side effect inside a sheet into the one switch where every other resolution action lives.

Existing open tickets carrying the old action strings need a data migration, or they'll hit the `default:` warn branch and never resolve.

---

## Flagged, not yet specified

**Invoice reversal / voiding.** `utils/invoiceReversal.ts` implements a two-step reversal that per prior QA notes "handles it with manual GL posting." Same for `collectionResolution.ts` on bounced collections. Both currently assume a GL exists. Neither is in the Phase 2 file list — **this is a gap in the plan**, and it needs its own pass. Flagging now rather than discovering it mid-Phase-2.

---

## Summary of proposed status changes

| Record | Terminal today | Proposed | Migration needed |
|---|---|---|---|
| Invoice | `posted` | `issued` | yes — existing rows |
| Collection | `posted` | `received` | yes — existing rows |
| E-Voucher | `posted` | `closed` | yes — existing rows + the legacy `liquidation_closed` alias |

---

## What I need from you

1. **Invoice gate** — keep a simple "Issue" confirm (a), or auto-issue (b)? *I recommend (a).*
2. **Source of funds on disbursement** — drop (a), free text (b), or a short fixed list (c)? *I recommend (c).*
3. **Realized FX** — drop (a), or record `fx_gain_loss` on the voucher (b)? *I recommend (b) if USD is common.*
4. **Status renames** — happy with `issued` / `received` / `closed`?
5. **Invoice reversal + collection bounce** — separate pass after Phase 2, or fold in?
