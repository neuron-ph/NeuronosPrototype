# NEU-020 — The Door-Scoped Grid ("the wiring matches the prediction")

> **Status:** PLANNED — Phase 0 may start on "Go Ahead"; later phases gated on the Decision Register
> **Depends on:** NEU-019 (complete through Phase 6; Phase 5 deletions + Phase 7 ratchet still pending)
> **Owner of every judgment call:** Marcus. This document exists so the implementation cannot drift from what he confirmed.

---

## 1. The Contract (confirmed by Marcus, 2026-06-06 — verbatim intent)

Every cell in the Access Configuration grid (row × action column) carries exactly one sentence a
non-technical owner ("Sir Mark") forms from nothing but the on-screen words:

> **"While in [the place this row is named after], they can [column verb] [row noun]."**

**That sentence is the spec.** The wiring bends toward the sentence — never the reverse.

### The Scoping Rule (the heart of this initiative — confirmed "YES. Exactly that.")

- **The row tells you WHERE. The column tells you WHAT. The switch is the AND of both.**
- Every door-row cell is a **real, independent switch** for that action *through that door*.
- **PURE door semantics: the module key does NOT leak into the doors.** A user with
  `Inquiries → Edit` ON but `Customers → Inquiries → Edit` OFF can edit on the Inquiries page,
  and the *same inquiry* is read-only when opened from the customer page. This asymmetry is
  not a bug; it is the product. It was confirmed explicitly.
- **No mirroring.** No switch ever visibly flips another switch. (Mirroring was proposed and
  rejected: "I can already see him messaging me… please fix that.")
- **No renames.** Labels are untouchable in this initiative (Marcus, verbatim: "do not rename
  anything"). Where a label's natural reading conflicts with needed behavior, the conflict goes
  to the Decision Register — it is never resolved by quietly changing words OR by quietly
  fudging wiring.
- **Dashes survive only where the door truly does not offer the action.** A dash must mean
  "this does not exist here," never "this exists but lives elsewhere."

### The Five Anti-Drift Laws

| # | Law | Meaning |
|---|---|---|
| L1 | **Sentence is the spec** | Phase 0 writes the Sir Mark sentence for every live cell BEFORE any code. A cell is DONE only when its sentence is true with the switch ON and false with it OFF, verified by walking the actual surface. Never "the key exists now." |
| L2 | **Door purity** | Effective permission inside a door = that door's key, alone. No OR with the module key, no fallback, no cascade at read. Any exception requires a Decision Register entry signed by Marcus. |
| L3 | **Day-one equivalence** | Every newly-live door key is seeded from the holders of the key that governs that surface TODAY (D5 doctrine). After the migration, every user can do exactly what they could the day before — the change is revocability and truthful display, not power loss. Blast-radius SQL proves it before each commit. |
| L4 | **Registry symmetry** | Every newly-true cell gets its applicability flip; every flip gets a consumer; guard stays green after every batch. A cell rendered live with no consumer is a lie (NEU-012 doctrine, unchanged). |
| L5 | **Verify or it didn't happen** | Per batch: rbac:guard clean, tsc baseline-diff zero new errors, tests pass, AND the batch's sentences spot-walked in code (trigger → gate → key). One batch = one commit = Marcus review. No batch starts while the previous is unreviewed unless he says pipeline. |

Anti-shortcut clauses (carried from NEU-019, still binding): wiring-only surgical changes; dead
code is deleted never gated; exceptions are written and signed, never assumed; the census/door-map
is ground truth, not my memory of it.

---

## 2. Definition of Done

1. The Door Map (§4 output) has zero OPEN rows — every cell is TRUE (sentence verified),
   DASH (honestly absent), or ESCALATED (Decision Register, resolved by Marcus).
2. The Sir Mark sentence test (Phase 5) passes: persona agents re-walk every section's tasks
   and the original failure cases (Inquiries-from-contact, petty-cash E-Vouchers, "no-delete Bong",
   auditor mode, PDF-leak) succeed without explanation.
3. Seeding proven: post-migration SQL shows zero users lost any capability they exercised
   through any door the day before (L3).
4. Guard ratchet extended (Phase 6) so a future door surface cannot ship a live cell without
   a consumer or a consumer without a cell.

---

## 3. Phase Plan

| Phase | Scope | Read-only? | Gate |
|---|---|---|---|
| **0. Door census + sentence book** | For EVERY visible grid row (module + tab), enumerate the affordances actually reachable through that door surface; write the sentence per cell; classify each cell. Output: the Door Map. | YES | Marcus reviews the Door Map before Phase 1 |
| **1. Decisions** | Marcus rules on the Decision Register (§5) — items where the sentence cannot be satisfied by wiring alone. | YES | All D-items resolved |
| **2. Registry** | Applicability flips for newly-true cells; new ModuleIds only if a door has no key family at all; schema nodes; guard coverage. | no | guard green |
| **3. Door threading** | The architecture batch: surfaces opened through multiple doors (inquiry file, task/activity detail, attachments, comments, booking detail tabs…) receive their door identity explicitly (the existing `*_MODULE_IDS[variant]` pattern, extended) and consult ONLY their door's key. One batch per department section: BD → Pricing → Operations → Accounting → Exec/Personal/Inbox. | no | L5 per batch |
| **4. Seeding migration** | One migration: for each newly-live door key, grant where the currently-governing key is granted (per-key mapping table inside the migration, derived from the Door Map's "current key" column). Applied to dev; blast-radius verified (L3). | no | zero-loss proof |
| **5. Sentence test** | Sir-Mark persona agents re-run the §6 acceptance walkthroughs against the finished grid + code. Any failed sentence reopens its cell. | YES | all sentences pass |
| **6. Ratchet extension** | rbac:guard learns the Door Map: every live cell in applicability must have ≥1 traced consumer file annotation; every `can()` consumer must map to a live cell. | no | guard enforces |

**Batch protocol (Phases 2–4):** read the Door Map rows → blast-radius SQL → implement → applicability
→ L5 verification → commit (`feat/fix(rbac): NEU-020 <phase>.<n> — <section>`) → review.

---

## 4. Phase 0 — the Door Map (format, binding)

One row per grid cell that is live today or proposed-live. Columns:

| Door (grid row) | Action | Sir Mark sentence | Affordance behind the door (file:line) | Key consulted TODAY | Target door key | Classification |
|---|---|---|---|---|---|---|

Classifications:
- **TRUE-ALREADY** — sentence already holds (door key exists and is consulted). No work.
- **REWIRE** — affordance exists but consults the wrong key (module/lens leaks into the door). Re-point to the door key.
- **NEW-CELL** — affordance exists through this door but the cell is dashed today. Make the cell live + wire it.
- **DASH-STAYS** — the door truly lacks the affordance. Cell stays dashed. (Honest dash.)
- **ESCALATE** — sentence cannot be made true by wiring alone (label conflict, product gap, shared-key purity violation). Goes to §5 with a recommendation; Marcus rules.

The Door Map is produced by read-only agents walking the actual surfaces (NOT the permission
checks — the affordances; NEU-019's methodological lesson is binding here), one per department
section, merged and committed as `docs/NEU020_DOOR_MAP.md` before any wiring changes.

---

## 5. Decision Register (standing items already known; Phase 0 may add more)

| ID | Conflict | Why wiring alone can't fix it | Recommendation |
|---|---|---|---|
| DD-1 | **Shared booking-detail keys** (`ops_bookings_billings/invoices/collections/expenses/comments/chrono/info_tab`) render under all five service rows but are ONE key — flipping "Billings" under Trucking flips it under Forwarding. Direct violation of door purity. | Fixing requires splitting into per-service keys (~30+ new keys) and rewiring every booking-detail surface to resolve per service; alternatively accept the shared key and visibly signal it. | **Split per-service** — it is the only outcome consistent with the confirmed scoping rule; the key count is the cost of the granularity Marcus said "we HAVE to have." Seeding mirrors the shared key so day one is identical. |
| DD-2 | **"Others" module** rendered under both Pricing and Operations as one key (`ops_others`) — a cross-DEPARTMENT mirror, which Marcus rejected as a pattern. | Same as DD-1: split (`pricing_others`?) or keep single-homed. | Show it in ONE department only (Operations); Pricing group drops the row. No rename involved — it's a placement removal. |
| DD-3 | **Quotations × Export** — Sir Mark reads the dash as "can't download the PDF"; in reality View carries the PDF. | Needs a real product gate: Export key wired to the PDF/print/download affordances on quotation surfaces. | Wire it. Export becomes a true knob (per-door where PDF buttons exist). Seed from View holders. |
| DD-4 | **Cancel rides inside Edit on bookings** — "only the TL deletes" is defeated by Edit-holders cancelling. | Cancel is a distinct human concept with no column of its own; no renames allowed, and there is no "Cancel" column. | Gate cancel under **Delete** (Sir Mark's own folk-model: "Delete is how Jayson cancels bad bookings"). Wiring change only: `allowCancel` ← per-service `:delete` instead of `:edit`. Blast-radius checked. |
| DD-5 | **Inbox · Edit** — his sentence is "fix your own messages"; the wiring is "close/reassign anyone's ticket." Renames banned. | The sentence and the capability genuinely diverge; no wiring makes "Edit" mean ticket-management without abandoning the close/assign gate. | Keep `inbox:edit` as-is for now; register as the ONE standing sentence-violation, revisit when renames are allowed. (Explicit, signed deviation — better than a silent one.) |
| DD-6 | **Activity Log Edit/Delete + Inbox Delete dials** — live dials with RLS consumers but no buttons. Sir Mark reads "someone can edit history." | Applicability doctrine currently counts ANY consumer (incl. RLS). His test demands a visible button. | Narrow the doctrine for the GRID: cells render live only with a UI consumer; RLS-only keys remain enforced but display as dashes. Guard layer distinguishes the two. |
| DD-7 | **`my_evouchers:approve`** reads as self-approval (it's the manager gate). | Label fix banned. | Verify enforcement forbids self-approval (approver ≠ owner) in code/RLS; if it doesn't, add the check. The dial stays; the danger goes. |
| DD-8 | **HR dial dead in prod** (`!import.meta.env.PROD` sidebar gate). | A live dial whose building doesn't exist in prod. | Hide the HR row in prod builds until the module ships (placement, not rename). |
| DD-9 | **Invoice finalize/void verbs** — he maps void→delete, finalize→edit; neither mapping is true. | New columns are renames-adjacent (new words). | Wire to his folk-model instead: finalize = `edit`-class (already true post-WG-06), void = `delete`-class (currently edit-class). Re-home void under the invoices delete key. |
| DD-10 | **"Assign who prices what"** has no row (rides on `pricing_quotations:approve`). | Approve-as-assign is a sentence stretch but Approve IS where he found it and succeeded in the walkthrough. | Leave as-is; record as accepted reading. |

---

## 6. Acceptance walkthroughs (Phase 5 must pass ALL, no explanations allowed)

1. Contacts → Inquiries → Edit ON, Inquiries (module) Edit OFF → user edits an inquiry opened
   from a contact's page; cannot edit on the Inquiries page. And the inverse.
2. "Take away ALL of Bong's delete powers in BD" via the six visible Delete dials + parent sweep
   → Bong cannot delete anything through any BD door.
3. "Petty cash girl files and liquidates her own e-vouchers, nothing else" → achievable from the
   Personal row alone; granting it exposes nothing of the AP queue.
4. "New girl views quotations, cannot download PDFs" → Export OFF actually blocks the PDF (DD-3).
5. "Only the TL deletes forwarding bookings" → Edit-holders cannot cancel (DD-4).
6. "Auditor: eyes on everything, hands on nothing" → view-everything profile produces zero write
   affordances anywhere (re-uses the NEU-019 re-census tooling).
7. Booking detail: Billings tab OFF under Trucking only → Trucking billings hidden, Forwarding
   billings unaffected (DD-1).

---

## 7. Explicitly OUT of scope (do not drift into)

- Any label, caption, helper text, or tooltip change (Marcus: "do not rename anything", and
  "no explainers"). If implementation ever seems to need one, that is an ESCALATE, not a fix.
- The NEU-019 leftovers (Phase 5 deletions, Phase 7 mutation-registry ratchet) — separate track,
  sequenced after or alongside by Marcus's call, never silently folded in.
- RLS alignment for the new door keys (UI-truth first; DB pass is its own follow-up, as in NEU-019 §8).
- Record-visibility dials, profile curation, or any grid feature work beyond the cells themselves.
