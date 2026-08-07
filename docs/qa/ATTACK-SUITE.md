# The Neuron Attack Suite

**Nineteen attacks. Run them at a system; whatever falls out is that system's
problem list.**

This is the executable companion to `PLAYBOOK.md`. The playbook is *how to
think*; this is *what to do*.

---

## Read this before you use it

**The findings are not the test.** The Neuron OS campaign produced 124 findings
across these nineteen rounds. Those findings are provenance — they tell you an
attack has teeth — **they are not a checklist.** A suite built from findings asks
"does this system have bug #47?", gets told no, and hands back false confidence.

Every attack below is written as a **procedure with a pass/fail**, not as a
symptom to look for. Main will break in its own ways. So will the next system.
Run the attack; record whatever it surfaces.

> Proof this matters: running A14 against Neuron Main surfaced a manager
> approving their own expense claim. Nobody predicted it. No checklist contained
> it. The attack found it.

**The regression list is separate.** If you want to confirm a *specific* known
bug did not travel between systems, keep that as its own clearly-labelled pass.
Do not let it become the suite.

### Rules of engagement — full text in `SAFETY-TETHER.md`

**Check the authority level for this target before running anything.** The
default is OBSERVE: read, probe with cleanup, change nothing. Finding a defect
does not grant permission to fix it.

The evidence rules in short:

1. A mechanism says something **can** happen. It never says how often it **has**.
   Report both, separately.
2. Empty rows are not a broken feature. Read the code before concluding.
3. Recompute from base rows. Never re-run the app's own query.
4. Prove fixes both ways — hole closed *and* legitimate path still working.
5. Probes clean up after themselves, in the same command.
6. **Prove your harness can go red before you trust it green.** (A9 exists
   because we got this wrong.)
7. Record what you did **not** check.

### Notation

Each attack carries a **stack translation** where the mechanics differ:
**[PG]** = Postgres/RLS/PostgREST (Neuron OS shape) · **[API]** = server-side
guards, raw SQL, ORM (Neuron Main shape). The *attack* is the same; the door
differs.

---

# PHASE 0 — Reconnaissance

*No writes. Builds the map every later phase aims with.*

## A1 · Trace the workflow chains by hand

**Question.** Where does a record hand off between departments, and what is
supposed to be true at each handoff?

**Procedure.**
1. Pick every cross-department handoff (sales→pricing, ops→accounting, …).
2. For each, write down: what triggers it, who acts, what state must change,
   what notification should fire.
3. Read the code for that transition. Note every claim the code makes that you
   have not verified.

**Pass/fail.** No pass/fail — this is the map. Output is a numbered chain list
and a set of unverified claims that become targets for A15–A19.

**Do it first.** It costs a day and aims everything else.

## A2 · Census the permission data

**Question.** Who can actually do what — from the data, not the design doc?

**Procedure.**
1. Dump every distinct grant key held by at least one user.
2. Diff against the keys the code declares. Both directions:
   - granted but not declared → orphan grants
   - declared but granted to nobody → **dead features** (a shipped tab nobody can open)
3. Count holders per key. Anything held by 0–3 people out of N is either
   deliberately tight or unfinished — find out which.

**Pass/fail.** Fail = any orphan grant, or any declared capability with zero
holders that is not deliberately restricted.

## A3 · Inventory the surface and **count the traffic**

**Question.** What exists, and which paths carry the volume?

**Procedure.**
1. List every module, route, table, with a row count beside it.
2. Compute the distribution across the product's main axis (service line,
   tenant, document type).
3. **Identify the majority path and the path your tests actually walk.**

**Pass/fail.** Fail = your test coverage concentrates on a minority path.

> Origin: Neuron OS. Every test walked a Forwarding booking. Forwarding was
> **20 of 243 bookings — 8%**. Discovered in round 15 of 19; it retroactively
> reframed everything before it. **Run it first.**

---

# PHASE 1 — Drive it as intended

*Establish that the happy path works before attacking it. If you cannot make it
work, you cannot tell a bug from your own mistake.*

## A4 · Route smoke

**Question.** Does every page load at all?

**Procedure.** Visit every route as a user with rights to it. Record HTTP status,
console errors, and whether the primary content region rendered anything.

**Pass/fail.** Fail = any blank page, any unhandled error, any route that renders
an empty state where data exists.

## A5 · The Spine — one job, many people, end to end

**The single highest-yield attack in the suite.**

**Question.** Does a real job survive the whole organisation?

**Procedure.**
1. Choose one complete business lifecycle (enquiry → quote → acceptance →
   project → booking → operations → expense → invoice → collection).
2. **Open one browser session per role — not one session switching roles.** Seven
   simultaneous contexts in the OS run.
3. Each persona performs *only* their own step, in sequence, through the real UI.
4. After each step, assert against the **database**, not the screen.
5. Never skip a step and never use an admin shortcut.

**Pass/fail.** Fail = any handoff that requires a privilege the next persona
shouldn't need, any state that doesn't change, any notification that doesn't
arrive, any figure that disagrees with the source rows.

**[PG]/[API]** identical — this is pure UI driving.

> Origin: 16 findings, the largest single haul. It is the first time the system
> is used as a *company* rather than as a feature.

---

# PHASE 2 — Attack the doors

## A6 · The unauthenticated stranger

**Question.** What can someone with no account reach?

**Procedure.**
- **[PG]** Enumerate RLS state for every table. Any table with RLS off is a
  finding until proven otherwise. Then probe with the anonymous key: read, then
  *attempt a write*, then delete the probe row.
- **[API]** Enumerate every route and resolve its **effective** guard set
  (class-level + method-level + any global guard). Any route not covered by an
  auth guard and not explicitly public is a finding. Then call it with no token.
- Both: check `EXECUTE`/access grants against **PUBLIC**, not just the anon role.

**Pass/fail.** Fail = any read or write succeeds without authentication that
isn't deliberately public.

**Trap.** Attribute decorators/policies to the right owner. Parsing by character
window instead of by declaration block over-counted guarded routes by 20 and
missed a dead route entirely on the first Main run.

> Origin: this attack found the worst issue of the OS campaign — a two-column
> lookup table with RLS off and anonymous INSERT/UPDATE/DELETE/TRUNCATE, feeding
> a trigger that materialises permission grants. Live on production.

## A7 · Audit every privileged function

**Question.** What runs with elevated rights, and does it re-check the caller?

**Procedure.**
1. List every function/endpoint that escalates privilege
   (**[PG]** `SECURITY DEFINER`; **[API]** anything using a service key, admin
   client, or raw SQL outside the guard layer).
2. For each ask: what does it gate on, and does it scope the **row** or only the
   **action**?
3. Specifically hunt: a by-id fetch that authenticates and then returns the whole
   record.

**Pass/fail.** Fail = any privileged function that checks *whether you may act*
but not *which rows you may act on*.

## A8 · The permission matrix — generated, never hand-written

**Question.** For every (actor × table/route × verb), what actually happens?

**Procedure.**
1. Read actors and their grants **from the live system**.
2. Read the surface list from the code.
3. Generate the full cross product and attempt each cell.
4. Classify every cell: `BLOCKED_LOUD` · `BLOCKED_SILENT` · `BREACH` ·
   `UNANSWERABLE`.
5. `UNANSWERABLE` is mandatory: a read against an empty table proves nothing,
   because the actor and a service-role account both see nothing.

**Pass/fail.** Fail = any `BREACH`, or any cell you counted as a pass that is
actually `UNANSWERABLE`.

**Trap.** **[PG]** a denied SELECT returns **HTTP 200 and an empty set** — "no
error" is not "allowed". Measure against what a service-role account sees. A
policy-filtered UPDATE affects 0 rows without throwing; check row counts.

> Scale reference: 3,684 cells generated from a spec plus live grants, in ~365
> lines. Never write these by hand.

## A9 · Turn the harness on itself

**Question.** Can your test report red?

**Procedure.**
1. Before trusting any green suite, **inject a known failure** and confirm it is
   detected.
2. Verify every tool against ground truth on one hand-checked sample.
3. Re-run after a fix and confirm the number moves in the direction and by the
   amount you expect. If it moves by the wrong amount, **stop and audit the
   tool**.

**Pass/fail.** Fail = any check that cannot be made to fail.

> Origin: our matrix reported 3,684 passing cells while measuring nothing. Later,
> the Main guard sweep over-counted by 20 — caught only because guarded routes
> rose by 6 when we had fixed 3. **This attack exists because we failed it twice.**

---

# PHASE 3 — Abuse the flows

*Everything above assumes competence and good faith. This phase assumes neither.*

## A10 · Delete underneath

**Question.** What happens to the children when the parent disappears?

**Procedure.**
1. Census every money/relationship edge and its delete behaviour
   (cascade / set-null / restrict / nothing).
2. Take a parent carrying a full downstream trail. Census children **before**.
3. Delete it through the real UI.
4. Census **after**. Count orphans — rows that survived with a dangling or
   nulled parent.
5. Repeat for records in every lifecycle state: draft, in-flight, posted,
   disbursed, void.

**Pass/fail.** Fail = any orphan, or any delete permitted on a record that is
already a financial fact.

> Origin: one click orphaned nine money rows. Nothing was deleted, nothing was
> raised.

## A11 · Two people, one record

**Question.** What happens under concurrency?

**Procedure.**
1. **Double-submit**: fire the same create twice within ~200ms. Expect one record.
2. **Simultaneous edit**: two sessions load the same record, both save.
3. **Stale action**: session A loads a record; session B advances its state;
   A then acts on what it still believes.
4. **Approve-the-deleted**: B deletes while A's approval is in flight.
5. For each, check for locking (`FOR UPDATE`), and whether the guard is at the
   **data layer** or only the route.

**Pass/fail.** Fail = duplicate records, lost updates, or a state transition that
succeeds against a record that has moved on.

## A12 · Abuse the storage

**Question.** Who can read, write and enumerate the files?

**Procedure.**
1. Enumerate buckets/prefixes and their access rules.
2. Try to list another tenant's/user's files.
3. Try to fetch a document by guessing or reusing a URL without a session.
4. Upload where you shouldn't; overwrite someone else's object.
5. Check whether URLs handed to the browser are **public and permanent** or
   signed and expiring.

**Pass/fail.** Fail = any cross-tenant read, any unauthenticated fetch of a
business document, any permanent public URL to private content.

## A13 · Drive it as every real persona

**Question.** Does each real role's actual day work?

**Procedure.**
1. Enumerate the real roles from the live user data — not from the org chart.
2. For each, script their genuine daily loop end to end.
3. Assert both directions: **can they do their job**, and **can they do more than
   their job**.

**Pass/fail.** Fail = blocked legitimate work, or any capability beyond the role.

**Trap.** A role that cannot complete its own loop is as serious as one that can
do too much. Watch for capabilities that only *appear* to work because the
tester happened to be an admin.

## A14 · The misuse pass — the careless user

**Question.** What happens when someone uses it wrong, without malice?

**Procedure.** Four families, run deliberately:

**Bad values** — negative amounts, zero quantities, absurd magnitudes, text in
number fields, dates in the far past/future, empty required fields, 10k-character
notes, emoji and RTL text, currency mismatches, leading/trailing whitespace on
keys.

**Confused model** — put the customer name in the vendor field; assign a booking
to the wrong service line; pick a category from a different side of the catalog
(revenue item on an expense form); link a record to a different tenant's parent.

**Abused flow** — submit twice; hit Back and resubmit; deep-link to a step you
skipped; approve your own request; act on a record someone else already
advanced; resolve a task whose action has no handler; edit a posted document.

**Hostile environment** — refresh mid-save; kill the network mid-transaction;
open the same record in three tabs; let the session expire mid-flow; act while
the record is being deleted elsewhere.

**Pass/fail.** Fail = any of these producing a *silent* wrong result. A loud
refusal is a pass. **Silence is the failure mode you are hunting.**

> Origin: 29 findings from this pass alone in OS, **16 of them silent
> corruption**. This is the highest-yield abuse attack in the suite.

---

# PHASE 4 — Measure the truth

*The system now works and resists attack. Is what it tells you true?*

## A15 · Recompute every number

**Question.** Does each reported figure match the same figure derived from base
rows?

**Procedure.**
1. List every figure a human would make a decision on — dashboard tiles, KPIs,
   report totals, rates, percentages.
2. For each, **independently derive it from base rows**. Do not reuse the app's
   query.
3. Diff. Record agreement, disagreement, and **unanswerable** separately.
4. For every disagreement, find the cause — do not stop at the delta.
5. Explicitly test the **zero case**: what does this figure render when the
   answer set is empty?

**Pass/fail.** Fail = any disagreement, or any figure that renders an empty set
as a confident value.

**Specific hunts, all of which have landed:**
- a hardcoded status allow-list missing a live value
- a filter naming statuses nothing ever writes
- a join on a column whose meaning changed
- a scope filter on a column the table doesn't have
- an empty result scored as success (or as failure)
- a rate whose numerator and denominator are filtered differently
- **derived/cached aggregates**: does anything reconcile them, ever?
- timezone: local business day vs UTC on the same figure

## A16 · The documents that leave the building

**Question.** When a number becomes a PDF and reaches a customer, is it still
right — and still what the record holds?

**Procedure.**
1. For each document type, render one and compare **every** field against the
   source record.
2. Check the **totals-vs-lines invariant**: can the document print a total its
   own lines do not support? Try to make it.
3. Where a snapshot exists alongside a live source, change the source and see
   which the document follows.
4. Toggle every display option and confirm each actually changes the output.
5. Check what runs **after** the document is assembled — anything overwriting a
   normalised result is where the bugs are.
6. Compare on-screen preview against the downloaded file, field by field.
7. Check the fallback: what renders when a settings row is **absent**?

**Pass/fail.** Fail = any divergence between document, preview and record; any
total unsupported by its lines; any toggle that does nothing.

## A17 · Automatic or manual?

**Question.** Is every "automatic" behaviour actually automatic?

**Procedure.**
1. List every state that is supposed to change by itself — expiry, escalation,
   status transitions, scheduled recalculation, reminders.
2. For each, find the code that performs it: a trigger, a cron, a queue — or a
   human.
3. Check the **gate** each consumer reads: a stored label, or the underlying
   fact? (An expiry that tests a status column rather than a date is not expiry.)
4. Check declared-vs-used vocabularies: how many declared statuses has the system
   ever actually written?

**Pass/fail.** Fail = any behaviour the UI implies is automatic that requires a
human, or any gate reading a label where a fact exists.

## A18 · Follow every wire to its far end

**Question.** Does the message reach someone who can act, and does acting change
anything?

**Procedure.**
1. For each notification/approval/assignment: who receives it, can they act, and
   does acting change a **record** — or only its own row?
2. For each action dispatcher, enumerate the action strings **in the data** and
   diff against the handlers **in the code**.
3. Check the unknown-action branch: does an unrecognised action **skip the
   permission check** and then do nothing?
4. For each denormalised counter/cache: what recomputes it when it drifts? If
   nothing, it is permanently wrong the moment it drifts once.

**Pass/fail.** Fail = any notification nobody can act on, any action with no
handler, any approval that moves no record, any aggregate with no reconciler.

## A19 · What has never been exercised?

**Question.** Where has nobody ever walked?

**Procedure.**
1. Row-count every table; list every feature shipping UI or routes with **zero
   rows**.
2. Separate *never used* from *not carried by your test data* — read the code
   before concluding (rule 2).
3. For each unexercised feature, ask specifically: **did it get the same
   protection the exercised ones got?**
4. Look hardest at **infrastructure** tables — lookup, config, mapping, cascade —
   the ones nobody thinks of as data.

**Pass/fail.** Fail = any unexercised surface with weaker protection than its
exercised siblings.

> Origin: the quiet leftover round found the campaign's only unauthenticated
> production write. It survived precisely *because* nothing had ever walked there.

---

# Running the suite

**Order matters.** A3 first — it tells you which paths deserve the effort.
Then phases in order; each aims the next. **Do not parallelise phases.**

**Per attack, record:** what you ran, what you measured, the verdict, and what
you did **not** cover.

**Severity by cost, not by cleverness:** `silent_corruption` outranks everything,
then `data_loss`, `duplicate_money`, `blocked_work`, `cosmetic`.

**Record the good news.** An attack that finds nothing is a result — it is what
makes the rest credible, and it stops someone "fixing" what was right.

**Rough yield from the OS run**, as a sanity check on effort:

| phase | attacks | findings |
|---|---|---|
| 0 Reconnaissance | A1–A3 | 15 |
| 1 Drive as intended | A4–A5 | 23 |
| 2 Attack the doors | A6–A9 | 23 |
| 3 Abuse the flows | A10–A14 | 23 |
| 4 Measure the truth | A15–A19 | 40 |

Phase 4 yields most, and needs phases 0–3 done first to be trustworthy.

---

*Companion: `PLAYBOOK.md` (why and how to think). Live board for the current
target: `ThetaAPI-Core/docs/qa/TETHER.md`.*
