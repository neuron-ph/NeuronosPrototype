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
