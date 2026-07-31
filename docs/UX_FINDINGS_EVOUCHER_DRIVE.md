# UX Findings — E-Voucher Cost Path

**From:** driving scenarios 1–7 in the browser across four real accounts (Bambi → Mariella → Mark → Janice), not from reading code.
**Date:** 2026-07-31
**Status:** findings + recommendations. **No UI changed yet** — these are design calls.

Everything here is measured, not impression. Where I say "N px" I measured it in the live DOM at a 1536×674 viewport.

---

## F1 — The liquidation action is buried under four screens of read-only content · **MAJOR**

**Who hits this:** every Operations person who takes a cash advance. It is their single most common task in the app.

**What happens.** Bambi has an advance to liquidate. She opens the voucher and sees the payment voucher header. To reach the thing she came to do she must scroll past:

```
PAYMENT VOUCHER header + date + ref
TRANSACTION DETAILS  (type, category, sub-category, booking ref, vendor)
LINE ITEMS + totals
PAYMENT & TERMS
WORKFLOW HISTORY     ← 5 read-only entries, one per approval step
─────────────────────
ACTIONS              ← finally
CASH ADVANCE / liquidation form  ← and this continues below the fold again
```

**Measured:** panel content **2,280px** in a **590px** window — **~3.9 screens**. "Submit Liquidation" sits **985px below the fold** on open.

**Root cause is structural, not styling.** `EVoucherDetailView.tsx`:

```
:599   <EVoucherHistoryTimeline … />   ← read-only audit log
:610   <EVoucherWorkflowPanel … />     ← every action the user can take
```

The audit log is rendered *before* the actions. It grows with every approval step, so **the more a voucher has been worked on, the further its actions sink.**

**Recommendation — pick one:**
- **(a) Reorder.** Move `EVoucherWorkflowPanel` above `EVoucherHistoryTimeline`. Two lines. Actions land near the top; history becomes the reference material it is.
- **(b) Auto-scroll on open** to the actions block when the voucher has one pending for this user.
- **(c) Pin the primary action** to the panel footer, the way the create form already pins Submit.

I'd do **(a)** — smallest change, and the ordering is simply wrong today. **(c)** is the nicer end state and matches the pattern the New Request panel already uses.

---

## F2 — Clicking "Liquidate" gives no visible response · **MAJOR**

Clicking the panel's **Liquidate** button produced **no visible change whatsoever** — no scroll, no highlight, no expansion in view. Measured: `scrollTop` stayed at `0` before and after.

The form *does* render — 617px further down, off-screen (panel content grew 1,663 → 2,280px). The user cannot tell the click worked.

A worker will click it again, then conclude it's broken.

**Recommendation:** on toggling the form open, scroll it into view (`scrollIntoView({behavior:'smooth', block:'center'})`). One line, and it fixes the symptom even if F1 is deferred.

---

## F3 — Two buttons named "Liquidate" on screen at once, one unreachable · **MODERATE**

The e-voucher list row has a **Liquidate** action. Opening the detail panel overlays the list — but the row's button is still in the DOM and still visually present behind the modal scrim.

I clicked it by accident during the drive; nothing happened, because it was behind the overlay. A user aiming for the wrong one gets a dead click with no explanation.

**Recommendation:** the row action should either open the panel *scrolled to the liquidation form*, or the panel should be the only place the action exists. Two entry points with the same label and different behaviour is the actual problem.

---

## F4 — Cash Receiver reads "Select who receives the cash…" when a receiver IS set · **MODERATE**

On the advance disbursement form, the Cash Receiver field showed its **placeholder** while `receiverId` was already defaulted to the requestor. Evidence it was set: the Confirm button was enabled (`canConfirm` requires `!!receiverId`), and the saved voucher recorded `cash_receiver_name: "Bambi C. Badajos"`. The id (`user-e18e830b`) matches a real row in `users`.

So Treasury sees a **required field that looks empty**, next to a button that works. Either they pick someone redundantly, or they don't notice and the receiver is silently whoever defaulted.

**Cause to confirm:** `CustomDropdown` renders the placeholder when `value` has no matching entry in `options`. Options come from `useUsers()`; likely the value is set before that list resolves and the label never recomputes.

**Recommendation:** confirm the timing, then either wait for options before defaulting, or have the dropdown fall back to a known label. Worth a direct check — I observed this once and did not reproduce it deliberately.

---

## F5 — "Purpose" repeats the auto-title, and Project/Booking Ref shows "—" · **MINOR**

On the detail panel:

```
DESCRIPTION / PURPOSE   Cash Advances – Project and Office Expense · BR202606-127 · 2026-07-31
TRANSACTION TYPE        Cash Advances – Project and Office Expense
PROJECT / BOOKING REF   —
```

The purpose is the NEU-088 auto-title, so it restates the transaction type verbatim and carries the booking — while the dedicated **Project / Booking Ref** field right below it shows "—". The information is present but in the wrong box, and the type is said twice.

**Recommendation:** populate Project / Booking Ref from the line items' booking, and let Purpose show only what the auto-title adds beyond the other fields.

---

## What is working well

Worth recording, since the drive was looking for problems:

- **The approval chain is legible.** Each approver sees only their queue; the gate label changes appropriately ("Approve" for the manager, "Approve (CEO)" for the executive).
- **The history timeline is genuinely good** — it names the human act and both statuses per step. It is a better audit artefact than a journal was. Its only sin is *where* it sits (F1).
- **Adaptive forms.** The disbursement form grows a Cash Receiver field for advances and drops it for direct-settle; the reference label flips from "(optional)" to a red `*` when Check/Bank Transfer is chosen, and gates the button. That is careful work.
- **D1 is enforced visibly** — a line without a booking shows "needs a booking" inline, not on submit.
- **Receipt confirmation reads well** — inline "Not yet / Yes, I received it" rather than a modal, and the toast that follows tells you what you unlocked: *"Receipt confirmed — you can now submit your liquidation."*

---

## Severity summary

| | Finding | Severity | Fix size |
|---|---|---|---|
| F1 | Liquidation action buried under ~4 screens | **Major** | 2 lines (reorder) |
| F2 | Action click gives no visible feedback | **Major** | 1 line (scrollIntoView) |
| F3 | Duplicate "Liquidate" buttons, one unreachable | Moderate | small |
| F4 | Cash Receiver looks empty when set | Moderate | needs diagnosis |
| F5 | Purpose duplicates type; booking ref empty | Minor | small |

**None of these were caused by the accounting removal.** F1–F5 are pre-existing. The removal made the panel *shorter* (the GL posting sheet and journal preview are gone), so this was worse before.

---

## F6 — A liquidation submitted without a receipt attachment DEADLOCKS · **CRITICAL**

Found by running scenario 8. Confirmed from both sides of the workflow.

**The trap.** Bambi final-submits her liquidation for the ₱20,000 advance and forgets to attach a receipt image to a line. The voucher moves to `pending_verification`. Then:

- **Treasury** opens it. `Verify & Post` is **disabled**, with a clear and correct message:
  > *"1 receipt missing an attachment — the handler must attach it before this can be verified."*
- **The handler** opens it. She has **no actions at all** — no attach, no reopen, nothing.

The app tells Treasury to wait for the handler, and gives the handler no way to act. **Nobody can move it.** The advance is stuck, and so is the ₱5,000 return reconciliation attached to it.

**Root cause** — `EVoucherWorkflowPanel.tsx`:

```
canOpenLiquidation = isLiquidator && isAdvanceType &&
  ((currentStatus === "disbursed" && receiptConfirmedAt) || currentStatus === "pending_liquidation")

canVerifyAndPost   = holdsDisburseGate && currentStatus === "pending_verification"
                     … further gated on liqReview.receiptsComplete
```

There is no gate for the handler at `pending_verification`. Final submission is a one-way door, and the receipts check sits on the *other* side of it. `canSendBack` exists but only fires at `pending_accounting`, so it cannot rescue this either.

**Why it isn't caught earlier:** the liquidation form does not require an attachment to submit — it validates catalog item, amount and booking (`LiquidationForm.tsx:175,180`) but not `receipt_url`. So the app cheerfully accepts the thing it will later refuse to verify.

**Recommendations, cheapest first:**
1. **Validate at submission.** If `Final submission` is ticked, require every line to have an attachment — refuse it at the point the user can still fix it. One check, mirrors the existing two.
2. **Give Treasury a send-back.** Extend `canSendBack` to `pending_verification`, returning the voucher to `pending_liquidation`. This is the general escape hatch and is worth having regardless.
3. **Let the handler attach at `pending_verification`.** Narrower: allow attachment-only edits without reopening the whole form.

I'd do **1 and 2** — 1 prevents it, 2 rescues the ones already stuck. Note there may be vouchers in this state on prod already.

**Not caused by the accounting removal.** These gates are NEU-050/051 work and predate it.

---

## F7 — "Verify & Post" and the native confirm dialog · **MINOR**

Two smaller things spotted in the same flow:

- Treasury's button still reads **"Verify & Post"**. There is nothing to post any more. Suggest **"Verify & Close"**.
- Final liquidation submission goes through a native browser `confirm()` (`LiquidationForm.tsx:186`). Every other confirmation in this workflow is a styled inline one ("Not yet / Yes, I received it", "Not yet / Yes, received"). The native dialog is jarring and inconsistent, and it is the only one that cannot be styled or tested consistently.

---

## What else worked well in scenarios 5–8

- **The variance panel is excellent.** Cash advance ₱20,000 / Total spent this session ₱15,000 / Balance remaining ₱5,000, live as you type.
- **The submit button relabels itself** from "Save receipts" to "Submit & close advance" when Final submission is ticked. Small, and exactly right.
- **Treasury's cash-return action carries the amount** — "Confirm Cash Return (₱5,000)" — so the reviewer never has to go looking for the number.
- **The disabled-with-a-reason pattern on Verify & Post is the best interaction in the module.** It names the blocker, the actor and the fix. F2's Liquidate button should copy it.
