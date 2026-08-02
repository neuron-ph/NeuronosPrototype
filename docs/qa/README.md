# Neuron OS — System QA: where we are, where we're going

The tether. Read this first. If any other document in `docs/qa/` disagrees with
this one about *intent*, this one wins; if they disagree about *fact*, the
generated artifacts win.

Last updated: 2026-08-03

---

## The goal

Be able to say, with evidence, whether Neuron OS currently works.

Not "the build passes." Not "the pages load." Whether a real person in a real
role can complete a real piece of work end to end, and whether the person after
them in the chain sees what they should.

The end state is an automated Playwright suite we can run against dev on demand,
plus a map of exactly what that suite does and does not cover — so the gaps are
known rather than assumed.

---

## The framing decision that shapes everything

The original ask was "map every workflow permutation."

That is not achievable and pursuing it would produce a document that *looks*
exhaustive and quietly isn't. One e-voucher alone has a status machine, a routing
rule, three linkage types, N line items, and an RBAC layer where the same screen
behaves differently per grant. Multiply across six departments and the number is
not enumerable.

**So we map the capability surface, not the permutations.**

The surface is finite and derivable from source: every route, every door, every
action, every state transition. Permutations are then *sampled* against it
deliberately, not enumerated.

Everything below follows from that choice.

---

## Where we are now

### Done

**Static inventory** — `scripts/inventory-capabilities.mjs` → `inventory.json`

Derives the surface from source. Re-runnable, never hand-maintained.

```
8 departments · 41 modules · 283 tabs · 689 door×action pairs
63 routes (54 directly visitable) · 306 write sites · 60 tables · 29 RPCs
```

**Grant map** — `scripts/inventory-personas.mjs` → `personas.json`

Joins `permission_overrides` against the door list. Reads dev only; refuses to
run against the prod URL. Produces 13 test personas (widest active grant set per
department/role) and, per persona, the exact routes they can load.

**Workflow chains** — `workflow-chains.md`

Five chains hand-verified by reading every status write site: e-voucher,
quotation, booking, revenue (billing→invoice→collection), inbox tickets. Budget
requests investigated and closed — they are e-vouchers with
`transaction_type = 'budget_request'`; the `budget_requests` table is vestigial.

**State vocabulary** — `status-vocabulary.sql`

Re-runnable. There are no Postgres enums; 24 status columns, 6 constrained. The
real vocabulary lives in the data, so it must be read, not assumed.

**Findings resolved** — all ten, see the table in `workflow-chains.md`

Seven fixed in code, two closed as intentional/vestigial, one corrected (it was
wrong) then closed. The pattern across them: a vocabulary drifting away from the
code that reads it. Booking statuses vs tab filters. Quotation statuses vs the
normalizer. Three copies of the service status list. Dead grant keys vs the
access schema. None would have been caught by a smoke test — every page loaded
fine throughout.

### Not done

- Playwright suite — none of it yet
- Actions-to-buttons mapping (we know `bd_contacts` supports `create`; we don't
  know which button does it)
- Edge Function write sites (the inventory sweeps `src/` only)
- **Migration 268 not applied anywhere.** Drops `ev_approval_authority`. Blocked
  on deploying the code first — the old bundle names that column in an explicit
  select, so dropping it underneath a running preview breaks the admin user page.
- **The grant prune has not been run on prod.** Dev only so far. Same script,
  same archive table (migration 269 must be applied there first).

---

## The route we're taking

Ordered by cost, and each step makes the next one cheaper.

1. **Static inventory** — done
2. **Grant map** — done
3. **Chains** — done, all five, and every finding they produced is resolved
4. **Tier 1: smoke** — visit every route each persona can load, assert it renders
   and the console is clean. Generated from `personas.json`, not hand-written.
5. **Tier 2: read integrity** — lists return rows, tabs open, no infinite spinner
6. **Tier 3: write spines** — the chains above, driven as multi-context tests.
   Hand-authored. This is where the real bugs are.
7. **Tier 4: RBAC assertions** — sampled, not exhaustive. Both directions: the
   role that should see it does, the role that shouldn't doesn't.

**We are at the start of 4.** Steps 1-3 are complete and the code fixes they
produced are on `dev`, unpushed. Nothing has been released.

---

## Ground rules

- **Generated, not maintained.** Anything derivable from source or the database
  is produced by a script. Hand-written docs go stale and then lie.
- **Dev is the target.** Tests may write to dev (authorised 2026-08-03). Prod is
  read-only, always, and only for verification.
- **Findings are verified before they're reported.** The first pass of the
  e-voucher chain had five errors, caught only by reading every write site. A
  wrong diagram is worse than no diagram.
- **Grep for literals misses variable writes.** Finding #6 claimed five ticket
  statuses were unreachable. Three of them are written by `ThreadDetailPanel`
  through `nextStatus` / `targetStatus`, driven by a `STATUS_STEPS` array — a
  search for `status: "acknowledged"` found nothing. When a finding is "nothing
  writes X", check for indirect writes before believing it.
- **Confidence is stated.** Every finding carries whether it is confirmed by
  read, confirmed against data, or unconfirmed.
- **Severity is stated honestly.** "92% of bookings match no status tab" is true
  and sounds like an outage; it isn't, because every user holds All or My. Say
  both parts.

---

## Open decisions

| Decision | Needed for | Status |
|---|---|---|
| Booking tab bucketing — where do `Paid` and `Delivered` belong? | the booking tab fix | **resolved 2026-08-03** — both to Completed; fix shipped to `dev` |
| Enable `ev_approval_authority` on one TL persona? | testing the EV delegation branch | **resolved 2026-08-03** — dropped instead; migration 268 pending deploy |
| Are budget requests just e-vouchers? | closing chain 6 | **resolved** — yes; `BudgetRequestList` reads `evouchers`. Table vestigial |
| Push `dev` and apply migration 268? | releasing the ev_approval_authority drop | **waiting on Marcus** — code must go first |
| Clean up dead grant keys in `permission_overrides`? | grant-map accuracy | **done 2026-08-03 (dev)** — 8,849 keys pruned across 56 users, archived first. Prod not touched |
| Should `TicketStatus` mirror the constraint (9) or the writers (7)? | nothing blocking | **resolved** — 9, mirroring the constraint |

---

## What we've found so far

Ten findings, nine confirmed, one fixed (booking tabs). Full detail and evidence
in `workflow-chains.md`.

The pattern worth noticing: four of them are the same bug class — **a vocabulary
drifting away from the code that reads it**. Booking statuses vs tab filters.
Quotation statuses vs the normalizer. Ticket statuses vs the CHECK constraint vs
the TS type. Grant keys vs the access schema.

None would be caught by a smoke test. Every page still loads.

That is the argument for tiers 3 and 4 existing at all, and the reason tier 1 —
while worth having — should not be mistaken for coverage.

---

## Files

| File | What it is | Regenerate with |
|---|---|---|
| `README.md` | this document | by hand, deliberately |
| `inventory.json` / `.md` | the capability surface | `node scripts/inventory-capabilities.mjs --md` |
| `personas.json` | who holds which door in dev | `node scripts/inventory-personas.mjs` |
| `workflow-chains.md` | the five verified chains + findings | by hand, re-verified on change |
| `status-vocabulary.sql` | observed state values | run against dev |
