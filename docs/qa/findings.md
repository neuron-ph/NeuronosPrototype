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

### B3 — The app cannot tell "no permissions" from "couldn't read permissions" · OPEN
Both arrive at `PermissionProvider` as `{}`. B2 was invisible because of this.

**Action.** Consider surfacing a distinct error state when the
`permission_overrides` read returns no row at all, versus a row with no grants.
Not urgent — B2's data cause is fixed — but it is why B2 was silent.
**Needs Marcus.**

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

### C7 — `activity_log` FK violation for `hq@neuron.com.ph` · OPEN
`activity_log_user_id_fkey` violated on `/accounting/billings`. Seen once, not
chased.

**Action.** Reproduce and diagnose. Low priority — logging only, no user-facing
effect observed.

---

## D. Outstanding environment work

### D1 — Migration 268 not applied anywhere · OPEN
Drops `ev_approval_authority`. **Deploy order matters:** the code must ship
first, because the previous bundle names that column in an explicit select.

**Action.** Code is now on `origin/dev`. Apply 268 to dev once the preview has
rebuilt; prod on Marcus's word only. **Needs Marcus for prod.**

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

### E2 — Four workflow states share one label · OPEN
`getDisplayStatus` collapses `Draft`, `Pending Pricing`, `Priced` and
`Needs Revision` all to **"Ongoing"**. An officer marks something Priced and the
chip is identical before and after — no feedback that the action landed, and a
manager scanning a list cannot tell waiting-to-be-priced from priced.

**Action.** Decide whether this is deliberate simplification or an oversight. If
the latter, `Priced` at minimum deserves its own label. **Needs Marcus.**
Workaround in the spine test: assert on available actions, which do change.

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

### E8 — BD cannot convert an accepted quote to a project · OPEN
"Create Project" is gated on `bd_projects:create || pricing_projects:create`
(`QuotationFileView.tsx:1304`). **No Business Development user holds either**
except `marcus@neuron.com.ph`; the entire Pricing department does. So the person
who wins the client and records the acceptance cannot convert it — Pricing must.

**Action.** Confirm this is intended, the same way the triage question was. If BD
is meant to own conversion, they need `bd_projects:create`. **Needs Marcus.**

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
