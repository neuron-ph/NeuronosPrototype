# The Safety Tether

**The rules that keep a QA campaign on course.** Read at the start of every
session. One page of it matters more than any finding.

Companions: `ATTACK-SUITE.md` (what to run) · `PLAYBOOK.md` (how to think) ·
the target's own board (`TETHER.md`) for live state.

Every rule below is here because it was **broken at least once**, and §7 records
where. That is the point — a rule with no scar is a rule nobody follows.

---

## 1. Authority — what we may touch

**This is the first section because it is the one that turns a QA campaign into
an incident.**

### The default is OBSERVE ONLY

> **We are testing. We are not authorised to fix.**

Finding a defect does not grant permission to repair it. Proving it is real does
not either. Neither does the fix being small, obvious, or clearly correct.

**Record it and move on.** The owner decides what gets fixed and when.

### The three levels, declared per target

Every campaign names its level in the target's board before the first attack:

| level | may do | may not do |
|---|---|---|
| **OBSERVE** *(default)* | read code, read data, run probes that clean up after themselves | change any source file, change any schema, leave any row behind |
| **PROBE** | all of OBSERVE, plus writes to a **local/dev** database that are reverted in the same command | touch shared/staging data, change source |
| **REPAIR** | all of PROBE, plus source changes — **only for the specific findings named in that grant** | anything not named; anything beyond the named fix |

**REPAIR is granted per finding, in the turn, and expires.** "Fix M1 and M2" is
not standing permission to fix M5. Approval of a plan is never approval to apply
it.

### Production is a separate axis

Independent of level, and never assumed:

- **No write to production. Ever. Under any level.**
- A production **read** requires explicit permission **in that turn**, and runs
  inside an explicitly read-only transaction.
- Approval to read once is not approval to read again.
- Record every production access in the board's session log: what was read, when,
  and who authorised it.

### If a change was made and the level did not allow it

Do not quietly revert and do not quietly keep it. **Surface it**: what was
changed, whether it left the machine, and what the options are. The owner
decides.

---

## 2. Anti-drift — staying on course

**D1 · The board beats the conversation.** The target's `TETHER.md` is the source
of truth. Conversations get compacted and detail is lost. If the file and anyone's
memory disagree, **the file wins**.

**D2 · Write findings as they are found**, into the board, not at the end of a
pass. A finding held in your head is a finding that will be misremembered.

**D3 · Record and move.** Do not stop after each finding to ask whether to fix
it. Under OBSERVE there is nothing to ask. Every unnecessary decision point turns
a campaign into a negotiation.

**D4 · One pass at a time, in order.** Each pass aims the next. Parallelising
loses the sequencing, and the sequencing is where most of the value is.

**D5 · Environment work is not testing.** Setup — containers, versions, loaders,
credentials — is necessary and is *not progress*. Timebox it, name it as setup,
and say so out loud when you are three steps deep in a tool problem.

**D6 · Never renumber, never reuse.** Finding IDs are allocated in discovery
order and are permanent. A corrected finding keeps its number and gains a
correction note.

**D7 · A question for the owner is a finding, not a blocker.** Write it down,
mark it as needing an answer, and carry on with everything that does not depend
on it.

---

## 3. Evidence — making findings that survive scrutiny

**E1 · A mechanism says something CAN happen. It never says how often it HAS.**
Report both, separately. "This can happen and has happened zero times" is a
complete, honest finding.

**E2 · Absence of data is not evidence of a broken feature.** Read the code
before concluding. Missing coverage and missing functionality look identical in
a row count.

**E3 · Recompute from base rows. Never re-run the app's own query.** Checking a
figure with the query that produced it verifies nothing.

**E4 · Prove the tool before trusting the result.** Inject a known failure and
confirm it is detected. Verify against one hand-checked sample. **If a number
moves by the wrong amount after a change, stop and audit the tool** — do not
explain the number away.

**E5 · Separate what you measured from what you inferred.** Say which is which,
in the finding, every time.

**E6 · Contaminated data is unanswerable, not green.** If your dataset cannot
answer the question — empty table, partial migration, seeded fixtures — record
**UNANSWERABLE**. Counting it as a pass is how a suite reports success while
measuring nothing.

**E7 · Record what you did NOT check.** The register is only useful if its
silence means something.

**E8 · Record the good news.** An attack that finds nothing is a result. It makes
the rest credible and stops someone "fixing" what was right.

---

## 4. Probes — touching without leaving marks

**P1 · Create, assert, delete, verify — in the same command.** Not in a later
cleanup step that might not run.

**P2 · Restore exactly.** If a probe alters configuration or permissions,
snapshot first and restore byte-for-byte, then prove the restore.

**P3 · If a probe would leave visible debris a human might act on** — a forged
message in someone's inbox, a fake invoice, an email — **do not run it.** Say the
code is conclusive and say plainly that you did not run it.

**P4 · Dev only.** Probes never run against production. See §1.

**P5 · Back up before anything destructive**, including loaders that truncate.
Cheap, and the one time it matters it matters completely.

---

## 5. Communication — findings nobody can read do not exist

**C1 · Report in the reader's language.** Not tool output, not line counts, not
grep tables. If the person you are reporting to cannot act on it, it is not a
report.

**C2 · Lead with what it means, then how you know.** The mechanism is the
evidence, not the headline.

**C3 · State corrections plainly, once, and move on.** No ceremony, no
re-litigating. Fix the record and continue.

**C4 · Never inflate.** No "critical" without cost, no "proven" without a
transcript. Overstating once costs you every finding after it.

---

## 6. What the board must always show

At the top, before anything else:

- **Status** — where the campaign is
- **Authority level** for this target, and any live REPAIR grant
- **Current pass** and **next action**
- **Blocked on** — and whether it is blocked on a person or a thing
- **Last updated**

Then: the plan with per-pass status · the findings in discovery order · the
questions awaiting an owner's answer · a session log, one line per session.

---

## 7. The failure log — where each rule came from

Kept because a rule without its scar gets ignored.

| rule | what happened |
|---|---|
| **§1 Authority** | Source changes were made to a target we had no standing authority to modify. Authorised in the turn, but no level had been declared, so nothing distinguished "fix these two" from "fix things". |
| **§1 Production** | A production read was needed mid-campaign. It went well only because permission was asked for in the turn and the transaction was explicitly read-only. Nothing in the process required either. |
| **D1** | After a context compaction, 19 rounds of testing were described to the owner as "five rounds". The board had it right; memory did not. |
| **D3** | Repeatedly stopped to ask "fix this or continue?" until the owner said plainly: record it and move on. |
| **D5** | A long stretch disappeared into Docker, a Postgres major-version conflict and a stale loader — all necessary, none of it testing, none of it labelled as such. |
| **D6** | Finding M6 was issued twice in one pass. |
| **E1** | Three claims stated as fact and measured as wrong: "13 rows disagree" (was 1) · "we may be losing money right now" (was 0) · "21 orphan grant keys" (was 0). |
| **E2** | A service line with 81 bookings and no billing rows looked dead. The code showed it fully wired and simply never used. |
| **E4** | A permission matrix reported **3,684 passing cells while measuring nothing** — a denied read returns 200 with an empty set. Later, a route sweep over-counted guarded routes by 20; caught only because the count moved by 6 when 3 routes had been changed. |
| **E6** | An invoice/lines mismatch looked like a product defect. It was the loader — it had written 8 line rows for 15 invoices. |
| **C1** | Raw grep tables and line counts were reported to a non-technical owner, who said plainly he could not follow them. |

---

*If you read only one thing before a session: §1, then D1 and D3.*
