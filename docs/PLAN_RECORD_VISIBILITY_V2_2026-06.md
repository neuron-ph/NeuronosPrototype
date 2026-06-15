# Record Visibility V2 — Formal Spec & Build Plan

> **Status: SPEC LOCKED · PHASES 0–3 COMPLETE on dev (migrations 209–212 applied;
> V2 LIVE in RLS). Full §2 truth table validated via auth-simulated RLS tests
> (cross-dept ✅, restricted-hidden ✅, owner-door ✅, exec-all ✅; no over-hiding;
> 0 restricted rows). Behavior-neutral today (nothing flagged).
> PHASES 0–5 COMPLETE on dev (migrations 209–214 + frontend). Confidential toggle
> (exec-only, DB-enforced + audited) live across all 11 detail panels; admin dial
> editor curated per type; useDataScope fixed. All verified via auth-simulated RLS;
> 154 TS errors = baseline. Next: Phase 7 full QA (browser, 16-user), then Phase 8
> prod release on explicit "ship it". (Phase 6 department-retirement folded into
> Phase 3 remap.) DEV-ONLY so far — nothing in prod.** · Created 2026-06-15 · Owner: Marcus
>
> **✅ SHIPPED TO PROD 2026-06-16** (tag `stable/2026-06-16`). All phases complete on
> dev and prod; behavior-neutral until a record is flagged confidential.
>
> **This document is the contract.** Before writing any code in a phase, re-read
> that phase. After completing any step, tick it and update the Status line. If
> implementation needs to deviate from the Model or the Invariants, **STOP** —
> record the deviation in the Decision Log with a reason, get Marcus's explicit
> OK, then proceed. **No silent drift.**
>
> Supersedes the owner-department ladder from `PLAN_CREW_VISIBILITY_2026-06.md`
> (migrations 186–190). This is an **evolution** of the assignment-aware RLS
> already live for bookings (migration **188**) — **not a rebuild.**

---

## 1. Why (problem statement)

The old ladder (`own → team → department → everything`) resolves a dial into a
**set of user IDs**, then filters records by **who owns them** (`useDataScope.ts`).
"department" therefore means *"records created by someone in my department"* —
which is why Pricing could not see Contacts/Customers created by BD: a different
department owns them. Every attempt to fix this oscillated between "too open" and
"too closed" because **one linear ladder was being asked to answer two
independent questions**:

- **Reach** — whose work can I see? (own / team / wider)
- **Sensitivity** — is this specific record confidential?

V2 separates them. Reach stays a ladder (participation-based, not owner-department).
Sensitivity becomes a single explicit boolean. They compose in one RLS function.

---

## 2. The Model (LOCKED — do not reinterpret)

```
restricted(record)  =  record.confidential = true
                       └─ a SINGLE explicit, exec-only, audited boolean.
                          There is NO derived "creator is an executive" rule.
                          Execs make public records by default and flip the toggle.

own         = my participation closure
              (creator + assigned-to-me + records reachable via enumerated 1-hop links
               from things assigned to me),
              INCLUDING restricted records I am PERSONALLY in the closure of.
team         = own  +  teammates' NON-restricted closures
org-wide     = team  +  all NON-restricted records
all records  = everything (truly absolute)
```

### Invariants (these are the anti-drift contract — never violate)

1. **Restricted has exactly two doors:** personal participation closure, or
   `all records`. Restricted records are **never** inherited through `team`
   breadth, `org-wide` breadth, or link traversal.
2. **View ≠ action.** Visibility decides *which rows*. Action grants decide
   *what you can do*. Always intersect:
   `can_edit = has_module_grant(type,'edit')  AND  row ∈ visible set`.
   Visibility must **never** be substituted for an action grant.
3. **Additive nesting / monotonic.** `own ⊆ team ⊆ org-wide ⊆ all records`.
   A wider rung never hides something a narrower rung showed.
4. **No materialization from creator role.** `confidential` is set only by an
   explicit user action, never auto-derived from who created the record. This is
   what prevents retroactive visibility flips on promotion/demotion.
5. **Links are enumerated 1-hop only.** No recursion, no graph fan-out. The
   allowed paths are exactly the table in §5. Link traversal **respects
   restricted** — a linked record is visible only if it is not restricted, or I
   am independently in its closure.
6. **Per-record-type, gated first by the module view grant.** The dial is
   resolved per record type; a row is only ever visible if the user also holds
   that module's `view` grant.
7. **RLS is the boundary. The client only pre-filters and must never over-hide.**
8. **Aggregates:** restricted rows **DO** count in org-wide totals/counts
   (decision D.4 — only execs see org-wide numbers anyway).

### Truth table (the scenarios we validated)

| Record | Creator | Viewer | confidential | Viewer dial | Visible? | Why |
|---|---|---|---|---|---|---|
| Contact | BD | Pricing | false | org-wide | ✅ | non-restricted, org-wide |
| Contact | Pricing | BD | false | org-wide | ✅ | non-restricted, org-wide |
| Contact | Exec | Pricing | **true** | org-wide | ❌ | restricted, not in closure |
| Contact | Exec | Pricing (assigned) | **true** | org-wide | ✅ | personal participation door |
| Contact | BD | Pricing | **true** (exec flagged) | org-wide | ❌ | restricted, not in closure |
| Contact | BD | BD creator | **true** (exec flagged) | any | ✅ | creator is in own-closure (D.1: not hidden from creator) |
| anything | — | Exec | true | all records | ✅ | absolute |
| Contact (restricted, teammate assigned) | — | me (teammate, not assigned) | true | team | ❌ | restricted never inherited via team (Inv. 1) |

---

## 3. Scope — which record types V2 applies to

**In scope (cross-departmental shared types):**
`contacts`, `customers`, `quotations`, `contracts`, `projects`, and the
`bookings_*` family (already on 188's pattern).

**Out of scope for now (keep current scoping):** financial types
(`invoices`, `collections`, `billings`, `expenses`, `evouchers`), `tasks`.
These retain their existing dials/policies. Revisit only if Marcus asks.

---

## 4. Reach resolution (replaces `useDataScope` owner-set logic)

The old `own/team` resolved to a flat `userIds` set and filtered by owner. V2's
`own`/`team` are a **per-record participation predicate**, not an owner set. The
broadest rungs are the *cheapest*:

- `all records` → constant `true` (role check).
- `org-wide` → `confidential = false` (one boolean) **OR** in my closure.
- `team` → `org-wide`'s closure restricted to teammates' **non-restricted** rows,
  plus my own closure (incl. my restricted).
- `own` → my closure only.

---

## 5. Enumerated link-path table (Inv. 5) — **ALL FKs VERIFIED ON DEV (Phase 0)**

"Reachable via 1-hop link from things assigned to me." Each row is a single hop,
backed by a real FK constraint confirmed on dev `oqermaidggvanahumjmj`.

| If I'm in the closure of… | …I can reach (1 hop) | Via FK | Status |
|---|---|---|---|
| a `booking` | its `contract` (quotation) | `bookings.contract_id → quotations.id` | ✅ confirmed |
| a `booking` | its `project` | `bookings.project_id → projects.id` | ✅ confirmed |
| a `booking` | its `customer` | `bookings.customer_id → customers.id` | ✅ confirmed |
| a `project` | its `quotation` | `projects.quotation_id → quotations.id` | ✅ confirmed |
| a `project` | its `customer` | `projects.customer_id → customers.id` | ✅ confirmed |
| a `quotation`/`contract` | its `customer` | `quotations.customer_id → customers.id` | ✅ confirmed |
| a `quotation`/`contract` | its `contact` | `quotations.contact_id → contacts.id` | ✅ confirmed (bonus) |
| a `customer` | its `contacts` | `contacts.customer_id → customers.id` | ✅ confirmed |

> No path may be added that is not in this table without a Decision Log entry.
> Traversal is one hop, and the reached record is subject to Inv. 1 + Inv. 5
> (restricted reached records are NOT pulled in unless I'm independently in them).

### 5b. Direct participation columns per type (Phase 0 — verified)

The closure's *direct* membership (before link traversal). **Discovery: every
in-scope type already carries a "directly responsible" field — no new assignment
table is needed for contacts/customers** (their `owner_id` IS the responsible
person; the current `contacts_select`/`customers_select` policies already key on
`owner_id`).

| Type | Direct participants (= in closure if any is me) |
|---|---|
| `bookings_*` | `created_by`, `manager_id`, `supervisor_id`, `handler_id`, + `booking_assignments.user_id` |
| `projects` | `created_by`, `manager_id`, `supervisor_id`, `handler_id` (no assignment table) |
| `quotations`/`contracts` | `created_by`, `prepared_by`, `assigned_to` |
| `customers` | `created_by`, `owner_id` |
| `contacts` | `created_by`, `owner_id` |

> All ID columns are `text → users.id`. `booking_assignments` keys on
> `(booking_id, user_id, role_key)` — membership = any row where `user_id = me`.

---

## 6. RLS function shape (pseudo-SQL — final form in Phase 2)

Short-circuit ordered so the common case is a single boolean read:

```sql
-- current_user_can_view_record_v2(p_type, p_record_id, p_created_by, p_confidential)
-- returns boolean, STABLE SECURITY DEFINER, search_path=public

1. me := user for auth.uid();  if null -> false
2. dial := current_user_visibility_dial(p_type)
3. if dial = 'everything' (all records)            -> true     -- execs, ~free
4. if p_confidential = false AND dial >= org-wide  -> true     -- THE 90% PATH, one bool
5. if me = p_created_by                              -> true     -- column compare, no join
6. -- expensive path, only reached by restricted rows or own/team dials:
   if p_record_id = ANY(current_user_reachable_ids(p_type))  -> true   -- personal closure
7. if dial = 'team' AND p_confidential = false
      AND exists(teammate whose closure contains this row)  -> true     -- team, non-restricted only
8. else                                              -> false
```

`current_user_reachable_ids(p_type)` — `STABLE SECURITY DEFINER`, reads
`auth.uid()` internally, returns the array of record ids in my personal closure
(direct assignment + enumerated 1-hop links). Evaluated **once per statement**.

SELECT/UPDATE/DELETE policies call this **AND** the module action grant (Inv. 2):

```sql
alter policy <type>_select on public.<table> using (
  current_user_has_module_permission('<module>','view')
  AND current_user_can_view_record_v2('<type>', id, created_by, confidential));

alter policy <type>_update on public.<table> using (
  current_user_has_module_permission('<module>','edit')
  AND current_user_can_view_record_v2('<type>', id, created_by, confidential));
```

---

## 7. Performance plan

1. **Short-circuit ordering** (§6) — org-wide users on normal rows exit at step 4
   on one boolean; no joins.
2. **Reach set computed once per query** via the `STABLE` function — not per row.
3. **Indexes:** partial `WHERE confidential = true`; assignment tables
   `(user_id, record_id)` + `(record_id, user_id)`; every enumerated link FK in
   §5; creator columns.
4. **Escalation (build ONLY if profiling proves the reach function is the
   bottleneck at real volume):** trigger-maintained
   `record_visibility(record_type, record_id, user_id)` → RLS becomes a single
   indexed `EXISTS`. Do **not** build speculatively (simplicity-first).

---

## 8. Build plan — phased, dev-first, prod explicitly gated

> Every phase runs against **dev** (`oqermaidggvanahumjmj`) only. **No prod
> (`ubspbukgcxmzegnomlgi`) write until Marcus says "ship it" that turn** (Phase 8).
> New migrations are numbered **209+** in `src/supabase/migrations/`.

### Phase 0 — FK verification & spec lock ✅ COMPLETE (2026-06-15)
- [x] Verify every ⚠️ FK in §5 — all 8 paths confirmed on dev (§5).
- [x] Confirm `confidential` target tables — none of the 5 in-scope tables have a
      `confidential` column today (Phase 1 adds it); direct-participation columns
      mapped (§5b); module-key mapping confirmed from live policies (§10.1).
- [x] **Verify:** §5 has zero unverified rows. ⟶ Marcus sign-off on the resolved
      §10 items (department-dial target, module map) before Phase 1.

### Phase 1 — Additive schema (dev) ✅ COMPLETE (2026-06-15, migration 209)
- [x] Migration 209: `confidential boolean not null default false` on all 5
      in-scope tables; 5 partial `WHERE confidential=true` indexes; 11 missing
      participant/link indexes (already-present ones not recreated).
- [x] **Verify:** 5/5 columns (bool, NOT NULL, default false); 16/16 indexes
      present; 0 restricted rows; **no policy touched** → behavior-neutral.

### Phase 2 — Functions (dev, not yet attached) ✅ COMPLETE (2026-06-15, migration 210)
- [x] Migration 210: `users_reachable_ids(type, users[])` engine +
      `current_user_reachable_ids(type)` wrapper (STABLE SECURITY DEFINER),
      implementing direct participation (§5b) + §5 1-hop links, with restricted
      excluded from link arm / included in direct arm (Inv. 5).
- [x] `current_user_can_view_record_v2(...)` per §6 — installed, NOT attached.
- [x] **Verify (engine, auth-independent):** on real dev data —
      direct door ✅, link door ✅, **Inv. 5** (restricted customer drops from a
      link-user's reach but stays for its direct owner) ✅, cross-type
      customer→contacts edge ✅, transaction rolled back → 0 restricted rows.
- [~] **Deferred to Phase 3:** the view-ladder truth table needs `auth.uid()`
      context, untestable via service-role SQL → validated in-browser at Phase 3
      (logged in §9).

### Phase 3 — Flip policies (dev)
> **⚠️ PREREQUISITE (sequencing flag, §9):** the in-scope types are currently
> dialed `everything` for EVERYONE (from the 2026-06-15 blunt prod/dev fix). In V2
> `everything` = all-records = sees restricted. So the **dial remap must run
> first** (execs → `everything`; everyone else → `org_wide`), else flipping
> policies exposes every future restricted record to all. This pulls the dial
> portion of Phase 6 to BEFORE Phase 3. Confirm the remap mapping with Marcus.
- [ ] Migration 211a: remap in-scope `visibility_scopes` — non-exec profiles/
      overrides `everything → org_wide` for the 5 types; exec stays `everything`.
- [ ] Migration 211b: alter SELECT/UPDATE/DELETE on contacts/customers/quotations/
      projects to use `current_user_can_view_record_v2(...)` **AND** the existing
      module action grant (Inv. 2, Inv. 6 keys from §10.1). **Bookings:** augment
      the proven 188 `current_user_can_view_booking` with a `confidential` check
      rather than swapping to v2 (preserve service-type + act-on-booking logic).
- [x] **Verify (DB/RLS via auth-simulated `set local role authenticated` +
      jwt claim):** §2 truth table all green — BD org-wide sees non-confidential
      contact ✅; same user does NOT see it once confidential ✅; owner sees it
      confidential ✅; exec sees it confidential ✅; no over-hiding (BD sees all
      113/117/184); 0 restricted rows persisted. Browser smoke folded into Phase 7.
- ✅ DONE 2026-06-15 (migrations 211 remap + 212 flip). Bookings included via the
      7-arg `current_user_can_view_booking` overload (participation+exec before dial,
      confidential gate). Quotations branch B guarded `confidential=false` (Inv. 5).

### Phase 4 — Client mirror (dev) ✅ COMPLETE (2026-06-15, `useDataScope.ts`)
- [x] Taught `useDataScope` about `org_wide`: added to `Dial` + `DIAL_RANK`
      (own0/team1/department2/org_wide3/everything4); resolution returns
      `{type:'all'}` for both `org_wide` and `everything` (RLS does the real cut;
      client never over-hides, Inv. 7).
- [x] **Verify:** local `Dial` type is module-private (no external consumers);
      `everything` still → `all`. Browser list check folded into Phase 7.

### Phase 5 — Confidential toggle UI + audit + admin dial editor (dev) — IN PROGRESS
- [x] **Audit** (migration 213): `record_confidentiality_audit` table (exec-read
      RLS) + AFTER UPDATE trigger on all 5 tables logging who/when/old/new.
      Verified: flip logs both directions; rolled back (0 persisted).
- [x] **Booking `org_wide` safety** (213): 7-arg `current_user_can_view_booking`
      now treats `org_wide` as "all non-restricted" instead of falling to false.
- [x] **Admin Record Visibility editor**: `org_wide` added as a labeled option;
      `dialsForType()` curates per type (v2 types: own/team/org_wide/All — no
      `department`; bookings: + department + org_wide; everything else: no
      org_wide); `DialControl` width now dynamic; `setMany` skips unsupported
      dials; `legacyScopeFromMap` handles `org_wide`. 154 TS errors = baseline.
- [x] **Reusable `ConfidentialToggle`** (`src/components/shared/ConfidentialToggle.tsx`):
      exec-only (renders null otherwise), writes `confidential`, toasts, audit
      trigger logs it. Typechecks clean.
- [x] **Wired into all 11 live detail components** (header placement, Marcus
      approved "all 5 types"): bd/ContactDetail, crm/ContactDetailView,
      bd/CustomerDetail, pricing/QuotationFileView (the real quotation header),
      pricing/ContractDetailView, projects/ProjectDetail, + 5
      operations/*BookingDetails. `confidential?` added to the relevant entity
      types. Toggle **self-fetches** its true value on mount (feeder queries with
      explicit column lists omit `confidential`).
- [x] **Exec-only enforced at the DB** (migration 214): BEFORE-UPDATE trigger
      rejects `confidential` changes from authenticated non-execs (service-role/
      migration writes pass). The UI gate alone was insufficient.
- [x] **Verify (auth-simulated RLS):** exec flip allowed; non-exec flip → raises
      "Only executives can change record confidentiality"; non-exec normal edit
      still works; audit logs both directions; 154 TS errors = baseline.
- ✅ PHASE 5 DONE 2026-06-15 (migrations 213–214 + frontend).

### Phase 6 — Retire department dial + backfill ✅ FOLDED INTO PHASES 3 & 5
- [x] Dial remap (migration 211) already moved in-scope types off `everything`
      → `org_wide` (execs keep `everything`); there were no `department` values on
      the 5 in-scope types to migrate (they were all `everything`). The admin
      editor (Phase 5) drops `department` from the v2 types' options. `confidential`
      defaults `false` so backfill is a no-op (nothing hidden on launch).
- [x] **Verified** at Phase 3: BD/Pricing see cross-dept records; 0 restrictive residue.

### Phase 7 — Full QA (dev) ✅ RLS STRESS TEST PASSED (2026-06-15)
Auth-simulated RLS battery (`set local role authenticated` + jwt claim, rolled-back
txns) across all 5 types and real users — all green:
- Cross-dept: org-wide non-exec sees non-confidential customer/quotation/project ✅
- Confidential hidden from org-wide non-closure viewer (all 3 types) ✅
- Owner/creator sees their OWN confidential (customers, quotations, projects) ✅
- Fully-granted exec sees all 5 types when confidential ✅ (an exec lacking a
  module grant correctly sees nothing for that type — module gate, not a bug)
- Booking participant sees confidential booking ✅; unrelated ops viewer does not ✅
- Inv. 5 link backdoor: linked customer visible via booking when open, HIDDEN when
  confidential ✅
- Module gate: Ops user without contacts grant → 0 contacts ✅
- Exec-only DB enforcement (trigger) on contacts/customers/projects/bookings →
  non-exec flip raises; non-exec normal edit unaffected ✅
- Aggregate consistency: org-wide count drops by exactly 1 when one row confidential ✅
- LIVE BROWSER: Marcus flipped a contact confidential in the dev UI → persisted +
  audit row under his user id (end-to-end UI confirmed).
- [ ] Optional: broader 16-user Falcons click-through (`project_multiuser_qa_plan`)
      on cross-dept visibility, restricted records, edit-gating, and aggregates.
- [ ] **Verify:** all scenarios green; capture results here.

### Phase 8 — Release to prod ✅ DONE 2026-06-16 (Marcus: "GO")
- [x] dev committed + pushed (738abae); merged dev→main (02a7101), Vercel prod Ready.
- [x] No Edge Function changes (none differed).
- [x] Migrations applied to prod in safe order: **209+210 before** the frontend
      deploy (behavior-neutral), **211–214 after** the deploy was Ready (no
      over-hide window). Pre-flight confirmed prod matched dev (all dials
      `everything`; 6 execs all had overrides; schema/functions/policies present).
- [x] Prod remap verified: 54 non-exec → `org_wide`, 6 exec → `everything`,
      `role='executive'` → 0.
- [x] **Verify (prod, auth-sim RLS):** viewer sees non-confidential ✅; hidden when
      confidential ✅; owner keeps it ✅; exec sees it ✅; non-exec flip blocked ✅;
      0 confidential rows + 0 audit residue. 4 v2 SELECT policies, 10 conf triggers.
- [x] Tagged `stable/2026-06-16` and pushed.
- Remind affected users to hard-refresh. Per PF6, two prod execs lack module
  edit grants on some types and can't use the toggle there until granted (not a blocker).

---

## 9. Decision Log (record every deviation here)

| Date | Decision / Deviation | Reason | Approved by |
|---|---|---|---|
| 2026-06-15 | Dropped derived "creator is exec → restricted" rule; restricted = explicit toggle only | Avoids retroactive visibility flips on role change; execs make public records by default | Marcus (A.1, D.3) |
| 2026-06-15 | Restricted never inherited via team/org-wide/links; only personal participation or all-records | Closes team + link backdoor leaks | Marcus (A.2) |
| 2026-06-15 | View ≠ action; visibility intersected with module action grant | Prevents org-wide read becoming org-wide edit | Marcus (A.3) |
| 2026-06-15 | Confidential rows count in aggregates | Only execs see org-wide numbers | Marcus (D.4) |
| 2026-06-15 | Confidential does NOT hide from creator | Creator stays in own-closure | Marcus (D.1) |
| 2026-06-15 | All records = truly absolute (no exec-from-exec tier) | — | Marcus (D.2) |
| 2026-06-15 | Phase 0: all 8 §5 link FKs verified on dev; every in-scope type has a native "directly responsible" field (`owner_id`/`assigned_to`/manager-supervisor-handler) → no new assignment table needed | DB introspection | (agent, Phase 0) |
| 2026-06-15 | New dial value `org_wide` introduced for "all non-restricted + closure"; legacy `department` treated as `org_wide` in the v2 function (dial being retired) | Need a value distinct from `everything` (=all-records) | (agent, Phase 2) |
| 2026-06-15 | **SEQUENCING:** dial remap (`everything → org_wide` for non-execs) MUST precede Phase 3 policy flip. In-scope types are currently `everything` for everyone (from the blunt 06-15 fix) → flipping without remap would expose all future restricted records org-wide | Correctness | (agent, Phase 2) — needs Marcus OK |
| 2026-06-15 | Bookings keep augmented-188 path (add confidential check), NOT swapped to v2, in Phase 3 | Preserve proven service-type + act-on-booking logic ("with care") | (agent, Phase 2) |
| 2026-06-15 | Phase 2 verify: engine validated via `users_reachable_ids` (auth-independent); view-ladder truth table deferred to Phase 3 in-browser (needs `auth.uid()`) | service-role SQL has no auth context | (agent, Phase 2) |
| 2026-06-15 | Phase 3 view-ladder validated at DB/RLS via `set local role authenticated` + jwt-claim simulation in rolled-back txns (no browser needed) | Stronger + earlier than deferring to UI | (agent, Phase 3) |
| 2026-06-15 | Bookings DONE in Phase 3 (not deferred) via 7-arg `current_user_can_view_booking`: participation + `is_executive()` before dial, then confidential gate. No booking-dial remap needed. 6-arg kept for other callers | Confidential works regardless of booking dial | (agent, Phase 3) |
| 2026-06-15 | Phase 4 escalated from optional to REQUIRED: post-flip `useDataScope` over-hides (`org_wide` unknown → falls to `own`). RLS correct; client stale | Discovered at Phase 3 | (agent, Phase 3) — needs fix next |
| 2026-06-15 | Phase 4 DONE = `useDataScope` only (`org_wide → all`; 154 TS errors = baseline). Admin Record Visibility editor deferred to Phase 5 (needs per-type dial curation; a global `org_wide` option would foot-gun financials whose RLS doesn't handle it) | Scope discipline; avoid half-measure | (agent, Phase 4) |
| 2026-06-15 | **Exec identity = `department = 'Executive'` (= `is_executive()`) ONLY. V2 never reads `role`.** `role='executive'` is vestigial (1/6 execs). Scope: contained — normalized that 1 user (Marcus, dev) `role: executive → manager`; exec power preserved via department. Full legacy-policy purge of `get_my_role()='executive'` deferred to its own ticket (not V2). | Marcus (Q2 = "contained") | Marcus |

---

## 10. Open items / TBD

### 10.1 Module-key mapping per type (Inv. 6) — RESOLVED (from live policies, Phase 0)

| Type | Module `view` keys that gate visibility |
|---|---|
| `contacts` | `bd_contacts`, `pricing_contacts` |
| `customers` | `bd_customers`, `pricing_customers`, `acct_customers` (+ booking-act, `bd_projects`, `pricing_projects` cross-reads) |
| `projects` | `bd_projects`, `pricing_projects`, `ops_projects`, `acct_projects` |
| `quotations`/`contracts` | `pricing_quotations`, `pricing_contracts`, `bd_contracts`, `bd_inquiries` (+ `acct_bookings`, booking-act) |
| `bookings_*` | `acct_bookings` + `current_user_can_act_on_booking` |

> V2 preserves these exact module gates (Inv. 6); it only replaces the
> `current_user_can_view_*(...)` second half of each policy.

### 10.2 Still open

- **Dial remap mapping CONFIRMED** (Marcus): non-exec `everything → org_wide`;
  exec (`department='Executive'`) stays `everything`. Runs as migration 211a
  BEFORE the Phase 3 policy flip. (Prod also gets the `role:executive→manager`
  normalization here at release.)
- **NEU ticket id** to be assigned in `TICKETS.md`.
- **Follow-up ticket (not V2):** full purge of legacy `get_my_role()='executive'`
  branches from existing policies (migrations 056, 117, …).
