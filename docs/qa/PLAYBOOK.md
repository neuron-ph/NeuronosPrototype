# The Neuron QA Playbook

How to find the bugs that don't announce themselves.

Distilled from the campaign that produced `findings.md` — 19 passes, 124
findings, one live production breach — and written to be run against a codebase
that is **not** this one. Neuron Main is the first intended target.

---

## What this is, and what it is not

**It is five questions and one discipline.**

> **To actually run this, use `ATTACK-SUITE.md`** — the same campaign expressed
> as nineteen executable attacks with procedures and pass/fail criteria. This
> file is why and how to think; that one is what to do.

It is deliberately *not* a checklist of the 124 things we found. A checklist
would be worth a fraction of this, for a reason worth stating up front:

> Every wave's findings told the next wave where to point.
> Wave 3 discovered that Forwarding — the service line every test had walked —
> was 8% of traffic, which reframed all four earlier passes.
> Wave 5 found the production breach *because* Wave 4 had taught us to look at
> the corners nothing exercises.

A checklist cannot do that. Questions can. Run the questions, let each answer
aim the next one.

**Roughly 80% of what follows is stack-neutral.** The parts that are not are
isolated in [§6 Stack adapters](#6-stack-adapters) so they can be swapped
without touching the method.

---

## 1. The evidence discipline

> The authoritative, consolidated rules — authority levels, anti-drift,
> evidence, probe safety, communication — now live in **`SAFETY-TETHER.md`**.
> This section is kept as the narrative explanation of the evidence half.

This comes first because it is what makes the findings trustworthy. Without it
you produce a list of things that are *probably* wrong, which nobody can act on
and everybody learns to ignore.

### Rule 1 — A mechanism tells you something CAN happen. It never tells you how often it HAS.

The most common failure mode, and the one that cost the most credibility during
this campaign. You read code, you see a hole, you write "this is losing money
right now."

Three times that claim was wrong:

| claimed | measured | what it actually was |
|---|---|---|
| "13 rows disagree with their booking" | 1 | a casing difference — `Garden Barn Inc.` vs `GARDEN BARN INC` |
| "we may be losing money right now" | 87/87 correct | exactly one NULL header, the oldest seed row |
| "21 orphan grant keys" | 0 | a regex missing a helper function |

**Always separate the mechanism from the incidence.** Report both. A finding
that says "this can happen, and it has happened 0 times" is still a real
finding — and it is honest, which means the next one gets believed.

### Rule 2 — Absence of data is not evidence of a broken path.

Wave 3: Trucking showed 81 bookings, 0 billing lines, 0 e-vouchers. That looks
damning. Reading the code showed the trucking accounting path is fully wired and
simply had never been walked.

**Missing coverage and missing feature look identical in a row count.** Only the
code distinguishes them, so read it before you conclude.

### Rule 3 — Recompute from source; never re-read the app's own query.

If you check a reported figure by running the same query the app runs, you have
verified nothing. Go to the base rows and derive the number independently, then
diff.

This single rule produced Wave 1: **73 figures recomputed, 31 disagreed.**

### Rule 4 — Prove fixes in both directions.

Every fix needs two tests: the hole is closed, **and** the legitimate path still
works. A fix that only proves the first half is how you ship an outage.

### Rule 5 — Characterization tests record current truth, not desired truth.

When you write a probe against existing behaviour, the expected value is *what
the system does today*. That means a later fix turns the probe red — correctly.
Say so in the probe, or someone will "fix" the test instead of reading it.

### Rule 6 — Prove breaches live, but leave nothing behind.

The production breach (T1) was proven with a real anonymous insert, then deleted
in the same command, then verified gone. That transcript is why it is credible.

Constraints that made it safe:
- probe **dev**, never prod — prod checks are read-only, always
- delete the probe row in the same breath as creating it
- if a live probe would leave visible debris (a forged message in someone's
  inbox), **don't run it** — say the schema is conclusive and say you didn't run it

### Rule 7 — Say what you did not check.

The register is only useful if its silence means something. Every pass ends with
what it did not cover.

---

## 2. The five questions

Each was one wave. Run them in this order — the sequencing is the point (§5).

### Q1 — Are the numbers right?
*Wave 1 · 73 figures · 31 wrong*

Take every headline figure the product reports — dashboard tiles, KPIs, report
totals, rates and percentages — and recompute each from source rows. Diff.

What this finds is not arithmetic errors. It is:
- **queries that reference columns which do not exist**, 400 silently, and render
  "no data" with total confidence *(₱2.8M of unbilled revenue reported as ₱0)*
- **hardcoded status allow-lists missing a live value** *(one missing string put
  ₱485,000 outside every report and turned a 21% collection rate into 94.68%)*
- **joins on a column that no longer holds what its name says** *(100% gross
  margin on every project, in green)*
- **scope filters on columns the table doesn't have** *(a module silently blank
  for 42 of 60 users — not restricted, just empty)*
- **empty result sets scored as success** *(33 of 39 people rated 100.0
  "Outstanding" for periods with no activity)*

> The reason to run this first: a wrong number produces no error, no toast and
> no failed request. **It is simply believed.** Everything else in a QA campaign
> describes what someone *could* do; this describes what the screens say today.

**Ask:** for each figure — what rows should this include, what does it include,
and what happens when the answer set is empty?

### Q2 — What happens after the well-tested core runs?
*Wave 2 · documents · 9 findings, none of them rendering bugs*

Find the subsystem that is genuinely well built — the one with a normalized
model, tests, and a clean separation. Then audit **everything that touches its
output afterwards.**

Every Wave 2 failure was at a seam:
- a post-processing step **overwriting the normalized result** *(hardcoded
  contact details replacing Company Settings and 96 saved overrides)*
- **an invariant nobody asserts** *(a printed invoice with a ₱0 subtotal, no
  line items, and a ₱120,000 TOTAL DUE)*
- **a snapshot nobody reconciles** *(a document billing for a line item deleted
  out from under it)*
- **a resolver reading names the table does not have**, surviving only via a
  metadata mirror

**Ask:** what runs after the thing that's tested? What writes to the object
after it's been validated? Where does a snapshot exist alongside its source, and
who compares them?

### Q3 — Is the thing that should be automatic actually automatic?
*Wave 3 · contracts · a contract expires when someone flips a dropdown*

Find every state that is supposed to change by itself — expiry, escalation,
status transitions, scheduled recalculation — and find the code that changes it.

Frequently there isn't any:
- five contract statuses declared, **two ever written**, no trigger and no cron
- the gate deciding whether a contract can back a booking reads the **label**,
  never the date — a contract three months expired, still Active, still bookable
- a doctrine declared non-negotiable in the project's own constitution and
  **enforced by no constraint** — 71% of rows violating it

**Ask:** for each automatic-sounding behaviour — what actually performs it? A
trigger? A job? A human? If a human, it is not automatic, and the UI implies it
is.

### Q4 — Does the message reach someone who can act, and does acting do anything?
*Wave 4 · notifications, inbox, routing · 7 findings*

Follow every wire to its **far end**. Notifications, approvals, assignments,
queues, resolution actions.

- a denormalized counter with **no reconciler** — 92% overstated and permanently
  so, because nothing can ever recompute it
- **79% of resolvable items name an action the executor does not handle** — they
  fall to a `default:` branch, warn to a console nobody reads, and do nothing
- an approval that **updates its own row and no linked record**
- and the compounding one:
  ```
  if (!grants) return true;   // unmapped action → permission check passes
  ```
  **Unknown meaning both "allowed" and "inert."**

**Ask:** for each notification — who receives it, can they act, and does acting
change a record? For each denormalized aggregate — what recomputes it when it
drifts?

### Q5 — What has never been exercised?
*Wave 5 · the leftovers · found the only live production breach*

Inventory every feature that ships UI, and count its rows.

| feature | UI that writes it | rows |
|---|---|---|
| CRM activities | 7 components | **0** |
| Calendar participants | invite UI, granted to all 60 users | **0** |
| Ticket assignments | an assign modal ships | **0** |
| Notification reads | fully wired, RPCs exist | **0 of 8,021** |

None of those is a bug. **The pattern is the finding** — and the reason to chase
it is that unexercised territory is where the serious defects survive.

The worst finding of the entire campaign lived there: a two-column lookup table
nobody thought of as data, with row-level security off and **anonymous
INSERT / UPDATE / DELETE / TRUNCATE**, feeding a trigger that materializes
permission grants. Open since the migration that created it, because nothing
anyone did would ever have surfaced it.

**Ask:** what ships but has no rows? What table is infrastructure rather than
business data — and did it get the same protection the business tables got?

---

## 3. The three questions that cut across all five

Run these continuously, not as a phase.

**"Who is the majority?"** — Every test walked a Forwarding booking. Forwarding
was 20 of 243 bookings. *Before* designing coverage, count which paths carry the
traffic. This one question reframed four completed waves.

**"What does this look like when it's empty?"** — Empty scored as perfect. Empty
rendered as "no unbilled bookings." Empty read as a 94% collection rate. The
zero case is where reporting code is least examined and most confidently wrong.

**"Two copies of the same fact — which one does the user see?"** — A snapshot and
its source. A column and its metadata mirror. A counter and its rows. Wherever a
fact is stored twice, find which copy the UI reads and what happens when they
diverge.

---

## 4. Output format

The register is the deliverable. It must stay usable at 100+ findings.

**One file, sections in pass order, newest last.** Each finding gets a stable id
(`P2`, `T1`), a severity, a one-line title, the cause, and **the measurement**.

**Status vocabulary:** `FIXED` · `MITIGATED` · `BY DESIGN` · `OPEN` · `WATCH` ·
`DIAGNOSTIC` · `GOOD NEWS` · `BREACH`

`GOOD NEWS` is not padding. Recording what is correct is what makes the rest
credible — and it stops someone "fixing" a thing that was right.

**Verdict taxonomy for probes:** `BLOCKED_LOUD` · `BLOCKED_SILENT` · `BREACH` ·
`UNANSWERABLE`

`UNANSWERABLE` matters more than it sounds. A read test against an empty table
proves nothing: the actor sees nothing, but so does the service role. Counting
those as passes is how a matrix reports 3,684 green cells while measuring
nothing — which happened here, and is finding K1.

**Cost taxonomy:** `silent_corruption` · `data_loss` · `duplicate_money` ·
`blocked_work` · `cosmetic`

Rank by cost, not by cleverness. Silent corruption outranks everything, because
nothing tells anyone it happened.

**A roll-up at the top** — counts by status, one row per pass, and the two or
three things that need a *decision* rather than work. Above about ten sections
the register becomes a log instead of a register without it.

**A machine-readable artifact per pass** alongside the prose, carrying the raw
measurements. Prose persuades; JSON is what you re-run against later.

---

## 5. Sequencing — why the order matters

Not arbitrary:

1. **Numbers first**, because wrong numbers are already affecting decisions
   today, and because recomputing them teaches you the data model faster than
   reading it.
2. **Documents second**, because Q1's wrong numbers become customer-facing the
   moment someone hits Print — and because the document layer is usually the
   best-built thing you'll audit, which calibrates what "good" looks like here.
3. **Contracts / the long-lived objects third**, once you know the money is
   wrong and the paper is wrong. This is where you discover which paths actually
   carry traffic — which retroactively reframes 1 and 2.
4. **Messaging fourth.** By now you know what *should* have notified someone,
   so you can check whether it did.
5. **The leftovers last**, when you've learned to recognise "wired but never
   run" — which is the only reason Q5 is productive rather than tedious.

**Do not parallelise 1–3.** Each genuinely aims the next.

---

## 6. Stack adapters

### The Supabase / Postgres-RLS adapter *(this codebase)*

- Enumerate RLS state per table. **Any table with RLS off is a finding until
  proven otherwise** — that is T1, and it was the last table anyone looked at.
- Audit `SECURITY DEFINER` functions: what do they gate on, and do they scope
  the row? A definer function that filters only on type and returns `to_jsonb(row)`
  bypasses every visibility rule you have.
- Check `EXECUTE` grants against **PUBLIC**, not just `anon` —
  `REVOKE ... FROM anon` leaves `=X/postgres` in place, and `CREATE OR REPLACE`
  resets the ACL, so revoke before *and* after.
- **A denied SELECT returns HTTP 200 and an empty set.** Never read "no error" as
  "allowed". Measure against service-role counts.
- A policy-filtered UPDATE affects 0 rows without throwing. Check row counts.
- SQL NULL semantics in policies: `NULL NOT IN (...)` is NULL, so the guard
  never fires.
- Probe as `anon` with the publishable key. That is one `curl` and it is how the
  worst finding here was proven.

### The NestJS / raw-SQL adapter *(Neuron Main)*

Same questions, different place to look. Authorization lives in guards and
services, not the database — so the database tells you much less and the code
must tell you more.

- **Enumerate every controller route and assert each has an auth guard.** This is
  the direct analogue of the RLS sweep, and it is where the T1-shaped bug lives:
  the route nobody remembered was a route.
- Check guards for **row scoping**, not just authentication. "Is this user logged
  in" and "may this user read *this row*" are different questions and the second
  is usually missing. T1's cousin: a by-id endpoint that authenticates and then
  returns the whole record.
- Raw SQL means **no schema-level safety net at all**. Q3's "the doctrine is
  enforced by convention only" will be *more* true, not less. Go straight to
  constraints: what is `NOT NULL`, what has a `CHECK`, what has a foreign key —
  and diff that against what the docs claim is non-negotiable.
- Redis/Garage introduce a **cache-coherence version of Q4's counter drift**:
  what invalidates this key, and what recomputes it when it's wrong? Same
  question, same answer shape — usually "nothing."
- Server-side JWT means the client can't be probed the way the anon key can.
  Substitute: call endpoints with a **valid token for a low-privilege user** and
  diff the response against what that user should see.
- Q1, Q2, Q3 and Q5 need **no adaptation at all.** Recomputing a figure from
  source rows is identical whether the rows arrive via PostgREST or a repository
  class.

---

## 7. Starting on a new codebase

Day one, in order:

1. **Count the traffic.** Rows per table, and the distribution across whatever
   the product's main axis is (here: service line). You are looking for the
   Forwarding trap — the path everything tests that carries almost nothing.
2. **Inventory the surfaces.** Every module, every route, every table, with a
   row count beside it. This is Q5's raw material and it takes an hour.
3. **List the headline figures.** Every number a human would make a decision on.
   That list is Q1's work queue.
4. **Find the well-built subsystem.** Ask the team which part they're proud of.
   Audit what happens after it. That is Q2, and it is usually productive
   precisely because the core is sound and nobody looked past it.
5. **Then run the five questions in order**, writing the register as you go —
   not at the end.

Expect the shape this campaign had: **the code is mostly good.** The findings
cluster at seams, at empty cases, at the far end of wires, and in the corners
nothing has ever walked through.

---

*Companion documents: `findings.md` (the register), `adversary/*.json` (the
per-pass measurements), `adversary/coverage-matrix.md` (what a derived coverage
matrix looks like, and how it lied the first time).*
