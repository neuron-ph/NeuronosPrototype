# Neuron OS — Findings Register

Every finding from the QA effort, with an action step for each. One row per
finding, newest section last. Status values:

- **FIXED** — code changed, verified, on `dev`
- **DONE (dev)** — data/environment change applied to dev only
- **BY DESIGN** — investigated, working as intended, do not "fix"
- **OPEN** — needs a decision or work
- **WATCH** — not urgent, but should not be forgotten

Evidence for each is in `workflow-chains.md` (chains) or the commit named.
Started 2026-08-03.

---

## A. Found by reading the workflow chains

### A1 — Booking status tabs matched almost nothing · FIXED
92% of bookings appeared in no status tab (dev 218/237, prod 315/338). Tabs
filtered on `"Draft"`, `"In Progress"`, `"Completed"` while submitted bookings
are written as `"Created"`, and `"In Progress"` exists in neither database.
Masked because `Created` renders identically to `Draft`.

**Action — done.** `BOOKING_STATUS_BUCKETS` colocated with the status
vocabulary; In Progress filters by exclusion so unknown statuses surface;
`bookingStatusBuckets.test.ts` fails the build on an unbucketed status. `99bc5bb`

### A2 — Booking transition map was dead code · FIXED
`BOOKING_STATUS_TRANSITIONS` read like a transition guard but never ran — every
caller passes `serviceType`, which returns earlier.

**Action — done.** Deleted, with a comment stating bookings have no
allowed-transition rules so nobody re-derives the wrong mental model. `99bc5bb`

### A3 — Quotation Disapprove/Cancel had no permission check · FIXED
The only status action in `StatusChangeButton` rendered on status alone. RLS
*did* block the write, so it was an unusable button rather than a hole.

**Action — done.** Gated on `bd_inquiries:edit || pricing_quotations:edit`,
matching what the server enforces. `c0726cc`

### A4 — Resolving an assignment ticket walked the quote back to Draft · FIXED
`set_quotation_pricing_in_progress` wrote a non-canonical status that
`normalizeQuotationStatus` mapped to `Draft`, silently losing Pending Pricing.
**155 open dev tickets carried it**, armed but not yet fired.

**Action — done.** Resolution action removed; assignment no longer touches
status. Historical tickets no-op. `c0726cc`

### A5 — Invoice approval is identity-gated, not permission-gated · BY DESIGN
Compares `user.department`/`role` against columns on the row, or lets any
Executive through. Deliberate: the routed approver lacks invoice-edit and record
visibility, so migration 249 + a SECURITY DEFINER RPC keep the privileged
transition in one auditable place.

**Action.** None to the code. **RBAC tests must never assert on invoice
approval** — an Executive will always pass. Noted in `workflow-chains.md`.

### A6 — Ticket statuses: type, constraint and writers disagreed · FIXED
Originally reported as "5 of 9 unreachable". That was **wrong** — the first pass
grepped for string literals and missed `ThreadDetailPanel` writing status through
variables. Seven of nine are written; only `pending` and `resolved` are not.

**Action — done.** `TicketStatus` now mirrors the CHECK constraint (it is a read
type) and `useThread` imports it instead of keeping a second copy. `61394ae`

### A7 — Three copies of the per-service status list · FIXED
Static `SERVICE_STATUS_OPTIONS`, `ENUM_SEEDS` in `useEnumOptions`, and the
DB-backed `profile_service_statuses`. All agreed; nothing kept them agreeing.

**Action — done.** The seed imports the canonical list; `StatusSelector` reads
the DB table like the booking form does. `99bc5bb`

### A8 — Dashboard tiles queried statuses that don't exist · FIXED
BD, Pricing and Executive tiles filtered on `New`, `Pending`, `Submitted`,
`Assigned to Pricing`, `Pricing in Progress` — none present in either database.

**Action — done.** Repointed at canonical statuses. `c0726cc`
**See C4** — this fix was incomplete and needed a second pass.

### A9 — `ev_approval_authority` was an unenforced authority flag · FIXED
Let a delegated TL skip the CEO gate. Client-side only — no RLS policy or DB
function read it — and false for all 60 users in **both** dev and prod since
migration 025.

**Action — done.** Branch, plumbing and admin toggle removed; the manager step
always routes to `pending_ceo`. Migration 268 drops the column. `a85aa73`
**Blocked:** see D1.

### A10 — Budget requests are vestigial · BY DESIGN
`budget_requests` table is empty with no writers. `BudgetRequestList` reads
`evouchers` with `transaction_type = 'budget_request'`.

**Action.** Leave the table — the inbox entity picker still references it.
Chain 6 closes as "see the e-voucher chain".

---

## B. Found in the permission data

### B1 — 8,849 dead grant keys in `permission_overrides` · DONE (dev)
880 stale (door absent from `ACCESS_SCHEMA` — 14 from the accounting removal, 19
predating it) and 7,969 inert (real door, action not applicable — mostly
create/edit/delete on view-only tabs). The inert ones were **latent, not dead**:
enforcement reads the blob directly, so `can("inbox","export")` returned true for
40 users.

**Action — done on dev.** Archived to `permission_grant_archive` (migration 269)
plus a JSON snapshot, then pruned. Re-runnable via
`scripts/prune-dead-grants.mjs` (dry-run by default). `51fd870`
**Action — outstanding:** see D2 for prod.

### B2 — One user had zero permissions and no way to know · FIXED
`bd@neuron.com.ph`'s `users.auth_id` pointed at prod's auth id, not dev's. That
column resolves login → profile, so it returned NULL, RLS denied the permissions
read, and every `can()` returned false. They could sign in, saw a dashboard, and
were blocked from all 7 granted routes **with no error**. Prod clean, 60/60.

**Action — done.** Dev row repaired. `relinkAuthIds()` added to
`clone-prod-to-dev.mjs` so the sync can't recreate it, and it warns loudly about
anything unmatchable. `3869bae`

### B3 — The app cannot tell "no permissions" from "couldn't read permissions" · FIXED
Both arrived at `PermissionProvider` as `{}`. B2 was invisible because of this.

**Action — done.** A signed-in user always has an overrides row (applying a
profile materialises one), so *no row* means unreadable, not empty.
`PermissionProvider` now returns `grantsUnreadable` alongside the grants and
logs the account id. `RouteGuard` uses it to tell the two apart: a real missing
grant still logs quietly, but unreadable permissions raise an explicit toast —
"Your permissions could not be loaded" — instead of bouncing the user out of
every page with no explanation.

---

## C. Found by the tier-1 route smoke

### C1 — Booking dates never reached the calendar · FIXED
`fetchBookingEvents` selected `department` from `bookings`; no such column, so
PostgREST rejected the request and the fetcher returned `[]`. **No booking ETD or
ETA has ever appeared on the calendar, for any user.** 115 dev bookings carry one.

**Action — done.** Column removed, department hardcoded like every sibling
fetcher, error check added. `96626c3`
**WATCH:** the other four fetchers in that file still discard their errors.

### C2 — Calendar's booking deep link pointed at a non-route · FIXED
`/operations/bookings?booking=<number>` matched `/operations/:bookingId` with the
literal `"bookings"` and rendered "Booking Not Found".

**Action — done.** Now `/operations/<id>`, which resolves the service line and
redirects. `96626c3`

### C3 — Budget request filter dropdowns were always empty · FIXED
Selected `requestor_name` from `evouchers`; it lives in the `details` JSONB.

**Action — done.** Reads `details->requestor_name`. `96626c3`

### C4 — The BD dashboard tile was still broken after A8 · FIXED
A8 repointed the tile's *statuses* and left `.eq("quotation_type","spot")` in
place, which guarantees zero rows regardless. **It was reported as fixed when it
was not.**

**Action — done.** See C5. **Process action:** when a query has several filters
and the symptom is "returns nothing", verify *every* predicate against real data
before declaring it fixed.

### C5 — `quotation_type = "spot"` is dead and five paths queried it · FIXED
Prod holds **zero** spot quotations (live values: `project` 360, `contract` 38).
Five paths returned empty sets — including the inbox entity picker, so **no
quotation could be attached to a ticket at all**.

**Action — done.** All five accept `["project","spot"]`; `RecordBrowser` and
`FileCabinet` now use `.in()` when handed an array. Verified against prod: 0 rows
→ 360, BD tile 0 → 93. `345e925`

### C6 — The test harness lied three times · FIXED
Playwright matches accessible names by **substring**, so `/admin/users`' "Search
name or email…" box satisfied a probe for an "Email" textbox and read as a
logout. `login()` returned before Supabase persisted the session, so the first
navigation landed unauthenticated. A fixed 1.2s wait sampled during boot.

**Action — done.** Keyed on the Sign In button with `exact:true`; waits for the
`sb-*` token; polls instead of sampling. Console-only faults get one retry.
`3869bae`
**Process action:** a generated suite fails in ways indistinguishable from
product bugs. Chase every fault to a root cause **before** reporting it.

### C7 — `activity_log` FK violation discards the audit entry · FIXED
`activity_log.user_id` references `users(id)`. An actor id that is not a live
profile — a stale cached session, an id from another environment — made the whole
insert fail, so **the audit record was lost entirely** and only a console error
remained. Could not reproduce the original caller (no orphan rows exist; the FK
prevents them), but the failure mode is the real defect.

**Action — done.** All six log helpers funnel through one insert. On `23503` it
now names the rejected id and re-inserts with `user_id: null` — a legitimate row,
since the column is `ON DELETE SET NULL` — so the entry survives, attributed by
name. An audit trail that silently drops entries is worse than one with a gap
it tells you about.

---

## D. Outstanding environment work

### D1 — Migration 268 · DONE (dev), OPEN for prod
Drops `ev_approval_authority`. Deploy order mattered — the previous bundle named
that column in an explicit select, so the code had to ship first.

**Applied to dev 2026-08-03**, after confirming `src/` holds no live reference.
Verified: column gone, `guard_user_privileged_columns` rebuilt without the
clause, `trg_guard_user_privileged_columns` intact, and the Executive persona's
39 routes still load — including `/admin/users`, the only page that named it.

**Action — outstanding.** Prod on Marcus's word only, and code must ship there
first for the same reason. **Needs Marcus.**

### D2 — Grant prune not run on prod · OPEN
Dev only so far. Prod carries the same dead keys.

**Action.** Apply migration 269 (archive table) to prod, then run
`scripts/prune-dead-grants.mjs` against it — the script currently refuses the
prod ref by design and would need that guard lifted deliberately.
**Needs Marcus.**

---

## E. Found by the spine (multi-person workflow)

### E1 — Quotation visibility is assignment-driven · BY DESIGN
Pricing Officers sit on the `own` dial and cannot see a BD-created quotation
until they are `created_by`, `prepared_by` or `assigned_to`. In prod 13 of 50
"Pending Pricing" quotations are unassigned and visible only to the manager/TL.

**Action.** None. Marcus confirmed the manager triages the queue; assignment is
both the business act and the permission grant. **Do not "fix" this.**

### E2 — Four workflow states share one label · FIXED
`getDisplayStatus` collapses `Draft`, `Pending Pricing`, `Priced` and
`Needs Revision` all to **"Ongoing"**. An officer marks something Priced and the
chip is identical before and after — no feedback that the action landed, and a
manager scanning a list cannot tell waiting-to-be-priced from priced.

**It is deliberate** — `statusMapping.ts` calls it "the client's 4-status system",
so collapsing is a requirement, not an oversight. The problem is only that the
people doing the work are blinded by a client-facing simplification.

**Action — done.** The chip keeps the four-status label and appends the internal
state as a quiet suffix, but only where the label actually hides a distinction
(`Ongoing · Priced`, `Ongoing · Pending Pricing`). Clients still see four
statuses; operators can see where the quote really is.

### E3 — Assign is a two-step interaction · WATCH
Picking a reviewer only reveals a "Price by" date and a **Confirm Assign**
button. Without the confirm, `assigned_to` stays null silently.

**Action.** No code change — the confirm step is reasonable. Flagged because
skipping it looks exactly like a broken permission three steps later, which cost
a debugging cycle. Worth knowing if users report "I assigned it and nothing
happened".

### E4 — Lifecycle moves records between tabs · WATCH (informational)
Once Priced, a quotation leaves BD's Inquiries tab and appears under Quotations.
Good design; recorded so future tests don't read it as a disappearance.

### E5 — Lists are slow to populate · WATCH
Tabs and rows take 5–9 seconds, longer with several sessions open. Two apparent
"selector bugs" were really this.

**Action.** For tests: assert visibility before interacting, never rely on
click's auto-wait. For the product: worth a look if users perceive the lists as
sluggish.

### E7 — "Create Project" can land under the sticky tab bar · WATCH
On the quotation detail at Accepted by Client, scrolling to the Create Project
button leaves it beneath the sticky tab bar: `elementFromPoint` at its centre
returns a bare `DIV`, not the button, so a click at that scroll position is
swallowed. A user who scrolls further can click it normally — it is a scroll
-position artifact, not a permanently dead control.

**Action.** Low priority. Worth a look if anyone reports "Create Project does
nothing". The spine dispatches the click on the element to get past it.

### E8 — Only Pricing converts an accepted quote · BY DESIGN
"Create Project" is gated on `bd_projects:create || pricing_projects:create`
(`QuotationFileView.tsx:1304`). **No Business Development user holds either**
except `marcus@neuron.com.ph`; the entire Pricing department does. So the person
who wins the client and records the acceptance cannot convert it — Pricing must.

**Marcus: only Pricing can.** Intended — BD owns the client relationship, Pricing
owns turning an accepted quote into a job. **Action:** none.

### E9 — Booking-create buttons in a project file · BY DESIGN
**Originally reported as an ungated affordance. That was wrong** — the second
mis-report of this session, and from the same mistake as the first: checking the
wrong key and concluding from its absence.

Inside a project file, Operations → Bookings offers "Create Forwarding Booking".
It renders for `jr.pricing01`, who holds no `ops_forwarding` grants — which
looked ungated. It is not. `ProjectBookingsTab` gates on
`can(permissionDoor, "create")` where `permissionDoor` is the door the user
entered through (NEU-020 2.10b) — for Pricing that is
`pricing_projects_bookings_tab`, which she holds with `create`.

And the database agrees: `current_user_can_act_on_booking` ORs across the five
`ops_*` service doors **and** the project/contract bookings-tab doors, including
`pricing_projects_bookings_tab`. UI gate and RLS check the same key set.

This is one of the better-built parts of the system — creating a booking from a
project obeys the cell of the door you came in through, on both sides.

**Action.** None. **Lesson:** "user lacks grant X so this must be ungated" is not
a finding until you have checked which grant the code actually reads.

### E10 — Ops cannot see project files · BY DESIGN (with a residue)
**Marcus: the project file is a Pricing/BD artifact. Operations is not supposed
to see it unless specifically granted.** So Ops sitting on `projects: "own"` and
seeing nothing is correct behaviour, not a lockout. Nothing to fix.

The residue, recorded so it isn't rediscovered as a bug:

- **Prod: 22 projects, 0 with `manager_id`, 0 with `supervisor_id`, 0 with
  `handler_id`.** Dev: same, 0 of 15.
- `buildProjectInsertFromQuotation` (`projectHydration.ts:230`) sets only
  `created_by`. It never populates the three assignment columns.
- The project file exposes no assignment control — tabs are Dashboard /
  Operations / Accounting / Collaboration, and none of them, nor the kebab,
  offers one.

Consequence, since `users_reachable_ids('projects')` matches only
`created_by`/`manager_id`/`supervisor_id`/`handler_id` (or a booking the user is
on): **anyone on the `projects: "own"` dial can see only projects they personally
created.** In prod that is 14 active users — 10 of them in Operations (2 managers,
2 staff, 6 team leaders) — against 22 projects created by just 6 people.

`projects.manager_id`, `supervisor_id` and `handler_id` are therefore **vestigial
columns** — never written, no UI, and not needed now that Ops is not meant to
reach work this way. `users_reachable_ids('projects')` still matches on them.

**Action.** None required. Consider dropping the three columns, or leave them —
they cost nothing. Ops reaches work through the Operations booking lists, where
the visibility dials are much wider, and that is the path spine stage 6 drives.

### E11 — Booking Name "discarded" · NOT A BUG (my error)
Reported as: the form requires Booking Name, pre-fills it, then throws it away
because `details->>'booking_name'` is null after save.

**Wrong.** The name is persisted to the `bookings.name` COLUMN. The field carries
a `storageKey` that maps `booking_name → name` (`useBookingFormState.ts:62`), and
both spine-created bookings hold their name there correctly.

I checked `details.booking_name` because that is where I assumed it went.

**Action.** None. **Lesson — the third instance of one mistake this session:**

| # | Reported | Reality |
|---|---|---|
| A6 | 5 ticket statuses unreachable | grepped string literals; `ThreadDetailPanel` writes via variables |
| E9 | booking buttons ungated | gated on `permissionDoor`, not the `ops_forwarding` key I checked |
| E11 | booking name discarded | stored in `bookings.name` via a `storageKey`, not in `details` |

Every one: concluding "X is missing" from the absence of X *where I looked*,
instead of finding where the code actually puts it. **Before filing an absence,
find the write.**

### E12 — The AP approver is routed, not derived · BY DESIGN
Stage 7 groundwork assumed the first e-voucher approval always goes to the
requestor's own department manager, because the RLS "enforces that the approver's
department matches the requestor's". It does not.

`evouchers_select` / `evouchers_update` compare
`COALESCE(pending_approver_department, details->>'requestor_department')` to the
approver's department. The **materialized** approver wins; the requestor's
department is only the fallback when no routing rule matched. And one rule is
live in dev:

| label | trigger | authority | priority |
|---|---|---|---|
| Forwarding-job expenses -> Pricing Manager | `booking_service_type: "Forwarding"` | `Pricing / manager` | 10 |

So an Operations supervisor raising an expense against a **Forwarding** booking
sends it to the **Pricing** Manager. The Ops manager — who holds
`my_evouchers:approve` and to whom the requestor actually reports — never sees it.
That is the routing engine working as designed (`project_routing_engine`): the
approver is declared in data, not derived from the org chart.

**Action.** None. Stage 7 now asserts both halves — it arrives with Pricing, and
it does NOT arrive with Operations — so the rule can never be silently dropped.

### E13 — DataTable renders every row twice · WATCH
`DataTable` renders a desktop `<table className="hidden md:table">` AND a mobile
card list (`md:hidden`) from the same data. At the test viewport the cards are
hidden, so `getByText(x).first()` resolves to a copy that can never be clicked
and never reads as visible — it fails as "element is hidden", which looks like a
missing record rather than a duplicate one.

**Action.** None in the app; the duplication is deliberate. Spine list assertions
go through `getByRole("cell")` so they address the real table. Worth knowing
before writing any new test against a `DataTable`.

### E15 — Nobody outside Accounting can touch a billing line · BUG
Every policy on `billing_line_items` calls
`current_user_can_view_record('billings', NULL)` — a **literal NULL owner**:

```
billing_line_items_select  USING  current_user_can_view_record('billings', NULL)
billing_line_items_update  USING  can_billings('edit')   AND current_user_can_view_record('billings', NULL)
billing_line_items_delete  USING  can_billings('delete') AND current_user_can_view_record('billings', NULL)
```

`current_user_can_view_record` returns `true` for `everything`/`org_wide`, then
`if p_owner_id is null then return false`. So **every dial below org_wide reads
as deny** — own, team and department can never match a NULL owner.

Effect in dev, by `billings` dial:

| dial | users | departments |
|---|---|---|
| everything / org_wide | 17 | Accounting, Executive |
| own / team / null | 41 | BD, Pricing, Operations |

The Ops supervisor in the spine holds `ops_forwarding_billings_tab`
create + edit + delete, sees the Billings tab on her own booking, can add a row
and fill it — and the save dies with *"new row violates row-level security
policy for table billing_line_items"*. (The INSERT check passes; the row cannot
be read back, and nothing she saves is ever visible to her.)

The tab grants promise a capability the database will not honour. Either the
policies should pass a real owner column (`created_by`) so the dials mean
something, or the billings tabs should not be grantable outside Accounting.

**Action.** Decide which. Until then stage 8a is performed by Accounting on the
project file, with a comment to move it back to the booking once this is fixed.

### E14 — Both billing tables can hide the row you just added · BUG (minor)
Same component, two surfaces, two different failure modes:

- **Booking view** (groups by category): the header's **Add Billing** files the
  new row under `"Uncategorized"`, which is not in `activeCategories` on an empty
  booking — so the row is added to state and never rendered. The only way in is
  **Add Item** inside a category, which is what the empty state tells you.
- **Project view** (groups by service): there are no category headers, so
  **Add Billing** is the only way in — and then setting the row's Service moves it
  into a service group that did not exist when the table decided what to expand,
  so the row **collapses out of view mid-edit**.

Neither loses data (the row is still in `localItems` and saves correctly), but
both read as "the button did nothing".

**Action.** Add the new row's category to `activeCategories`, and expand a group
the moment a row moves into it.

### E16 — Stages 1–4 flake under load · WATCH
Two consecutive runs failed in the quotation stages — once the submitted inquiry
had not appeared in BD's list within 25s, once "Send to Client" did not take
(the chip stayed on `Ongoing`). Both passed on re-run, and both are the same
shape as E5: the list/menu is driven before the data has landed.

**Action.** None yet. If it recurs, replace the fixed `waitForTimeout` before
each status-menu interaction with a wait on the menu item itself.

### E6 — `quotations` has `project_id` but no `project_number` · WATCH
A query assuming the latter errored 42703. Minor; noted so it isn't rediscovered.

---

## F. Pre-existing, untouched

### F1 — 6 test files / 12 tests failing before any of this work · WATCH
`themeBootstrap`, `workspaceTheme`, `contractQuantityExtractor`,
`evoucherApproval`, `bookingScreenSchema`, `quotationDocumentResolver`. Verified
pre-existing by stashing all changes and re-running.

**Action.** Triage separately. Not caused by, and not blocking, this work.

### F2 — ~782 TypeScript errors · WATCH
Long-standing typecheck debt (`project_qa_phase5`). `UserDetailPage` alone had 26
before this work and 25 after.

**Action.** None here. Every change in this effort was verified not to add to it.

---

## G. Found by the adversary (tests/e2e/adversary.spec.ts)

Eighteen probes, run as real signed-in people against PostgREST rather than
through the UI, because "the button isn't rendered" and "the action is
impossible" are different claims. Each lands in one of three buckets:
**BLOCKED_LOUD** (the write raised), **BLOCKED_SILENT** (no error, nothing
changed — safe, but a caller that doesn't check the affected count will tell the
user "Saved"), **BREACH** (the write landed).

Six breaches. Every one of them is a rule that exists in a form and nowhere else.

**What held, and is now pinned:** routed-approver matching (A3), the disburse
grant (A5), approval replay (A6), `approve_invoice`'s server-side approver check
(C1), the approver's read-but-not-write sight-line (C3/C4), and the one
line-item rule written as a CHECK constraint (A9). Those probes are the
regression net around the parts that work.

### G1 — The requestor can walk her own e-voucher to `disbursed` · BUG
`evouchers_update` has a branch for `created_by = me AND my_evouchers:edit`, and
that branch does not care WHICH column is being written. `status` is a column.

So the person who raised the voucher can set it to `pending_ceo`,
`pending_accounting` or `disbursed` from the console — no approver, no Treasury.
The UI never offers it (the panel gates on `my_evouchers:approve`), which is the
only reason this hasn't happened.

There **is** a guard — `evoucher_enforce_disburse` raises when someone without
`acct_evouchers:disburse` moves a voucher to `disbursed`/`posted`. Read its
condition:

```sql
if old.status = 'pending_accounting' and new.status in ('disbursed','posted') ...
```

It defends exactly one doorway. Probe A2 walks from `pending_ceo` straight to
`disbursed` and is never inspected; probe A7 runs the identical write from
`pending_accounting` and is refused loudly. Same actor, same column, same target.

**Action.** Not "add another `old.status`" — a per-transition trigger only ever
covers the transitions someone remembered. Either make `status` un-writable by
the owner branch (split the edit grant from the status column), or replace the
status flips with SECURITY DEFINER functions the way `approve_invoice` already
does.

### G2 — Nothing enforces the ORDER of the approval chain · BUG
Treasury moved a voucher sitting at `pending_ceo` straight to `disbursed` (A4).
The policies ask *who you are*, never *where the record is*. The chain
draft → pending_manager → pending_ceo → pending_accounting → disbursed is a
sequence of buttons, not a state machine.

**Action.** Same fix as G1 — a transition function that validates
`(old_status, new_status, actor)` as a triple.

### G3 — Operations can WRITE billing rows it can never read · BUG
The sharp end of E15. `billing_line_items_insert` checks only
`can_billings('create')`, which the Ops TL passes; the NULL-owner bug is in the
SELECT policy. So her insert **lands** (B2). The UI reported failure only because
it asks for the row back — `.insert().select()` — and the RETURNING read is what
RLS refuses.

Net effect: a charge exists on the booking that nobody in her department can
read, edit, void or invoice, and the person who created it was told it failed.

**Action.** Fold into the E15 fix; the SELECT/UPDATE/DELETE policies and the
INSERT check must agree.

### G4 — An unapproved invoice can be issued · BUG
`handleFinalize` refuses when `approval_status !== 'approved'` — in the client.
`invoices_update` has no such condition, so Accounting posted an invoice straight
past the approver the routing engine chose (C2).

Note the contrast one probe over: **approval** is an RPC that re-checks
server-side and raises (C1). **Issuing** is a raw status flip. The right pattern
is already in the codebase; it just wasn't used for the second half.

**Action.** Move finalize behind a `finalize_invoice` SECURITY DEFINER function
that asserts `approval_status = 'approved'`.

### G5 — Catalog doctrine is a form convention, not a constraint · BUG
CLAUDE.md is absolute: no `billing_line_items` insert may omit
`catalog_item_id`, no `evoucher_line_items` insert may omit it. Both columns are
nullable, neither has a CHECK, and both probes wrote free-text lines (D1, A8).

Any caller that isn't the combobox — an import, a script, a future Edge
Function, a stale tab — silently escapes the catalog.

**Action.** `ALTER TABLE ... ADD CONSTRAINT ... CHECK (catalog_item_id IS NOT
NULL)`, after backfilling. Note the legacy `EV-… - PORT CHARGES` billing rows
already carry NULL, so the backfill is real work, not a formality.

### G6 — A collection can exceed the invoice it settles · BUG
`CollectionCreatorPanel` allocates against the open balance and won't over-apply.
`collections` has no balance check, so a payment of ten times the invoice total
posted happily (C5) and the customer ledger goes negative.

**Action.** Validate the applied total against the open balance in a transition
function, or add a constraint keyed on the invoice.

### G7 — E15 is confined to one table · GOOD NEWS
Swept every policy in the database for the NULL-owner pattern:

```sql
select c.relname, p.polname from pg_policy p join pg_class c on c.oid = p.polrelid
where pg_get_expr(p.polqual, p.polrelid) like '%current_user_can_view_record%NULL::text%';
```

Three hits, all on `billing_line_items` (select, update, delete). Nothing else in
the schema passes a NULL owner. The E15/G3 fix is one migration, not a sweep.

