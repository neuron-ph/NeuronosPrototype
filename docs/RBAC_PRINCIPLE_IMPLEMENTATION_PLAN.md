# RBAC Principle — Implementation Plan

**Ticket:** NEU-012 · **Status:** Plan (awaiting Go Ahead) · **Authored:** 2026-06-04
**Companion docs:** [`RBAC_ARCHITECTURE.md`](./RBAC_ARCHITECTURE.md) (target design) · Cortex `neuron-os-rbac-auth`

---

## 1. The principle (the thing that must become true)

> **What a user can do is decided by what their Access Profile *grants* — never by who they *are*. Every gate asks that same grant and gets the same answer. The only modifier on a grant is *data scope* (which rows), never identity.**

Two halves, both required:

1. **Grant, not identity.** Access comes from resolved `module:action` grants. Department/role only pick *defaults*; they are never a wall. Any code that asks "is this user in department X?" to decide *permission* is a violation. (Picking *which screen/lens* to show by department is fine.)
2. **One truth, agreeing everywhere.** The button, the route, the tab, **and the database** all read the same grant and return the same answer. When they disagree you get "button shows, save fails."

**Acid test:** *If a user can click something, they get a meaningful result. If they shouldn't see the result, they shouldn't see the click target.*

This principle was confirmed with Marcus on 2026-06-04 and is the yardstick every change below is measured against.

---

## 2. Current state (measured, not assumed)

Live read-only audit of **prod** (`ubspbukgcxmzegnomlgi`), 2026-06-04. ~90 public tables fall into **three worlds**, plus a resolver flaw and an app-side split.

### Front A — Tables that obey the principle (grant model) ✅
~20 core tables route through `current_user_has_module_permission(...)`: `bookings`, `quotations`, `customers`, `contacts`, `invoices`, `collections`, `expenses`, `billing_line_items`, `tasks`, `evouchers`, and most `profile_*` lookups. (Their `using(true)` policies are **service-role only** — server-side, harmless.)

### Front B — Tables still on the OLD model (decide by executive/manager/department) ❌
~28 tables decide by identity, violating half 1: `contract_bookings`, `contract_activity`, `contract_attachments`, `budget_requests`, `comments`, `consignees`, `crm_activities`, `journal_entries`, `calendar_events`, `tickets`, `users`, `operational_services`, `team_memberships`, `team_role_eligibilities`, `booking_assignments`, `assignment_profiles`, `assignment_profile_items`, `evoucher_history`, `department_assignment_roles`, `service_assignment_roles`, `booking_service_catalog`, `booking_subservice_catalog`, `profile_insurers`, `profile_permits`, `profile_consolidators`, `profile_trucking_companies`, and others.

### Front C — Tables with NO enforcement at all (wide open to authenticated/public) ⚠️
The grant migration never reached these. Genuinely open to any logged-in user:

| Table | Open to | Stakes |
|---|---|---|
| `projects` | authenticated, full | **central object — ungated** |
| `project_bookings` | authenticated, full | project↔booking links |
| `transactions` | authenticated, full | financial ledger |
| `accounts` | authenticated, full | chart of accounts |
| `catalog_items` / `catalog_categories` | authenticated, full | "non-negotiable" catalog |
| `contract_rate_versions` | **`public`**, full | rate cards (broader than authenticated) |
| `category_templates`, `saved_reports`, `settings`, `counters` | authenticated | lower stakes |
| `*_attachments` (project/contract/customer/contact/quotation) | mixed | document access |

### The resolver flaw (affects even Front A)
`current_user_effective_module_grant(p_key)` does a **pure literal key lookup** (override → applied profile → role-default profile, newest wins). It does **NOT derive** hidden/umbrella modules. Meanwhile the **browser** (`deriveHiddenModuleGrants`) *does* derive umbrella keys (`ops_bookings:create = OR(per-service creates)`). **Same question, two methods → they can disagree.** This is the root of NEU-006: `bookings_insert` checks only the umbrella `ops_bookings:create`, which is never persisted, so the DB denies a create the UI allowed. Migration `117` widened SELECT/UPDATE/DELETE to accept per-service keys but **omitted INSERT.**

### The app-side split
- `src/utils/permissions.ts` — hardcoded department allow-lists (`canPerformBookingAction`, `canPerformEVAction`, `canDeleteEVoucher`, etc.). **Real call sites: 5** — `ProjectBookingsTab` (booking-create button) + 4 E-Voucher files. The quotation/project functions are already dead.
- **~120 raw `department ===` / `role ===` matches across 39 files** (includes docs/seeds/`permissions.ts` itself). The real violation count is lower — most are legitimate *lens-routing*. Exact count comes from the Phase 0 triage.

### Two important caveats
- This map is **prod**. Dev (`oqermaidggvanahumjmj`) led migrations 095–098 and may be further along; **prod↔dev table-by-table diff is not yet done** (the resolver + bookings/evouchers policies were verified identical).
- "Wide open at the DB" does **not** mean currently exploited — the UI still hides these via `can()`/`RouteGuard`. But that *is* the principle's failure mode: the gate exists only in the browser. Anyone hitting the API directly bypasses it.

---

## 3. What compliance requires — STRICT (binding, do not stray)

**Locked by Marcus 2026-06-04.** Access is decided by exactly TWO layers, and nothing else:

> - **Layer 1 — Feature access:** which modules/actions a user can see and work in. *Every* such permission is a **visible, toggleable row** in the Access Profile matrix.
> - **Layer 2 — Record visibility:** which rows within those (data scope: own / team / department / all).
>
> **NOTHING hidden. NOTHING implied.** Every permission the system enforces must be **visible and configurable**, and the database must check that **same** real permission. Role/department drive **workflows** and may seed an **overridable default** — never enforcement.

The four invariants:

1. **No hidden or derived enforcement.** No permission may gate anything unless it is a visible, configurable grant. Hidden pseudo-modules (`ops_bookings`, `ops_projects`, `inbox_entity_picker`) and runtime-derived "umbrellas" are **eliminated**; enforcement uses only real, visible grants. **Cascade**, if kept, is a transparent **edit-time** convenience that writes visible explicit grants — never a hidden runtime rule.
2. **One rule, app and DB read identically** — both read the stored, visible grants by literal lookup. No "browser derives, DB looks up."
3. **Every product table enforces via real grants in the DB** (Front B legacy + Front C wide-open move onto real grants).
4. **No identity gate + a regression guard.** `permissions.ts` + inline dept permission checks retired; the build fails if new code introduces a hidden/implied/identity-based gate.

---

## 4. Execution model — how we go slow without sprawl

The anti-rush mechanism is **not** parallelism. It is:

- **A complete map first** (the *ledger*) — every table + every app gate, its current state, its gap, its proposed fix. Nothing missed, never guessing.
- **Small vertical slices** — one target at a time: fix its DB rule **and** its app gate, **verify the two agree**, check it off. Each slice leaves the system more compliant, never less.
- **A gate between slices** — Marcus sees each change before it lands. Nothing auto-applies. SQL migrations are surfaced before prod (dev apply is fine per `CLAUDE.md`).

**Workflows (multi-agent) are used exactly once, read-only, in Phase 0** to build the ledger — specifically the fan-out-heavy triage of the ~120 inline checks and per-table fix proposals. **Workflows never make changes.** The resolver fix and every table migration are manual, sequential, and reviewed.

---

## 5. Phases

### Phase 0 — Build the compliance ledger (read-only)
**Output:** one living artifact (`docs/RBAC_COMPLIANCE_LEDGER.md`) — the burn-down list.
- **DB map:** every public table → current model (grant / legacy / open), per-command (SELECT/INSERT/UPDATE/DELETE) gap, proposed grant policy, applicable `module:action` keys, data-scope need. *(Mostly assembled already from SQL; finish + diff prod↔dev.)*
- **App-gate triage:** every `department ===` / `role ===` / `permissions.ts` call site → classified **lens-routing (keep)** vs **permission-gate (convert)**, with the target `can(module, action)`. *(This is the read-only workflow fan-out.)*
- **Data-layer checks:** duplicate active profiles per `(role, department)` (they silently shadow — see Cortex gotcha); profiles missing keys their RLS branch needs (the "CUSTOMS DECLARANT" class).
- **Gate:** Marcus reviews the ledger. Scope/priority confirmed before any change.

### Phase 1 — STRICT foundation: real grants only (bookings/projects)
**Goal:** booking/project access runs entirely on **visible, configurable** grants — no hidden umbrella, no runtime derivation — proven on NEU-006 (Pricing creates a booking).

**FINDING (2026-06-04): the hidden umbrellas are LOAD-BEARING.** `ops_bookings` / `ops_projects` are used in:
- **Route guards** — `App.tsx` (`ops_bookings:create` / `:view`).
- **~6 RLS migrations** — `097`, `101`, `103`, `117`, `134`, + the bookings policies (`ops_bookings:view/create/edit/delete`, `ops_projects:view`).
- **Components** — `QuotationFileView`, `ProjectBookingsTabBD`, `ProjectServiceCard`, `ProjectBookingReadOnlyView` (`can("ops_bookings", …)`).

So making them strict is a **real staged sub-project**, not a one-liner. Two strict paths (DECIDE before building):

- **Path A — ELIMINATE.** Remove `ops_bookings`/`ops_projects` entirely; rewrite every route/policy/component to check the **real visible grants** (the 5 service modules + the project tabs) explicitly. *Purest; largest sweep + risk (touches ~6 migrations, routes, 4+ components).*
- **Path B — UN-HIDE + stop deriving (recommended).** Make `ops_bookings`/`ops_projects` **visible, directly-granted** modules; one-time backfill so existing access is preserved; henceforth they are normal explicit grants (no derivation). *Strict (visible + not implied), keeps existing keys/policies/routes working → far lower risk. Cost: extra matrix rows; granting a service no longer auto-grants bookings unless **cascade-at-edit** ticks it visibly.*

**Recommended: Path B + cascade-at-edit** (granting a service/project visibly also ticks the booking/project module; everything stored + visible).

**Strict Phase-1 slices:**
1. Decide Path A vs B.
2. **Stop runtime derivation** (remove the `ops_bookings`/`ops_projects` derive branches from the resolver + `deriveHiddenModuleGrants` from the client).
3. Make the umbrella values **real stored visible grants** (un-hide + backfill, Path B) **or** rewrite all consumers to real grants (Path A).
4. **Cascade → edit-time + visible** (granting a parent writes explicit child grants; runtime is pure literal lookup).
5. Keep **service-aware baseline default** (migration 139 — an overridable default, allowed).
6. **NEU-006 proof:** Pricing creates a booking via a real, visible grant; app + DB agree; dev → prod.

**Already on dev (to reconcile under strict):** `137` (resolve-at-write triggers — superseded), `139` (service-aware default — keep), `140` (derive-at-read umbrella — the derivation part is **removed** under strict; the "strip stored hidden keys" part is reconsidered per Path A/B), `141` (explicit insert OR — keep/extend), button → `ops_projects_bookings_tab:create` (keep; make that grant visible), `PermissionProvider` derive (remove under strict). These were the *pragmatic* attempt; strict supersedes the hidden-derivation pieces.

- **Gate:** Pricing user creates a booking on dev **and** prod; every gate involved is a visible toggle; app + DB agree for granted **and** non-granted users.

### Phase 2 — Burn down the DB gaps (slice-by-slice)
Work the ledger, highest-exposure first: **`projects` → `project_bookings` → catalog (`catalog_items`/`catalog_categories`) → `transactions` → `accounts` → `contract_rate_versions`**, then Front B legacy tables, then the rest. Each slice = grant-based RLS policy (SELECT/INSERT/UPDATE/DELETE) + `current_user_can_view_*` scope where rows must be filtered + verify UI↔DB agree + check off. Each surfaced before prod.

### Phase 3 — Retire identity gates (app cleanup)
From the ledger's "convert" list: point each permission-gate at `can()`; delete the dead `permissions.ts` functions (rip-and-replace — only 5 live call sites). The genuinely hard one is the **E-Voucher workflow** (a state machine, not a simple grant) — see Decisions.

### Phase 4 — Regression guard
A test/lint that fails on (a) a new `public` table without a grant-based policy, and (b) new code introducing a hardcoded department/role *permission* check. Locks the principle in.

---

## 6. What one slice looks like (the repeatable unit)

```
PICK     one table (or one app gate) from the ledger
DB       write grant-based policy: <module>:<action> via current_user_has_module_permission,
         + current_user_can_view_* for row scope (data scope, not identity)
APP      point the matching gate at can(module, action); remove the identity check
VERIFY   simulate a granted user AND a non-granted user → UI and DB give the SAME answer
         (per-user RLS check via set_config('request.jwt.claims', ...))
GATE     show Marcus the diff + migration; apply dev; surface for prod
CHECK    tick it off the ledger
```

A slice is only "done" when **UI and DB agree** for both a granted and a non-granted user. That equality check is the definition of compliant.

---

## 7. Risks & caveats

- **Prod ≠ dev is not fully characterized.** Phase 0 must diff all ~90 tables across both before trusting any "dev passed → prod is fine."
- **Wide-open → enforced can lock people out.** Turning on RLS for `projects`/catalog/etc. will deny anyone whose profile lacks the key. Each such slice needs a grant-coverage check first (do current users' profiles actually grant it?) — fail-loud in staging, not silently in prod.
- **Catalog is architecturally non-negotiable** (`CLAUDE.md`) — its *data* rules (catalog_item_id, snapshots) are untouched; we only add the *access* layer.
- **Executive bypass** stays (`is_executive()` short-circuit) — that's intended, not a violation.
- **Data-layer landmines** (duplicate profiles shadowing, profiles missing keys) can make a perfect policy still deny — caught in Phase 0.
- **Don't convert lens-routing.** Over-zealous "fixing" of legitimate `department ===` routing is its own bug. Triage gates every conversion.

---

## 8. Decisions — RESOLVED 2026-06-04

**Business decisions (Marcus):**
1. **E-Voucher modeling → MIDDLE PATH.** The approval *order* stays hardcoded (manager → CEO → accounting → posting; no skipping). *Who* may act at each step becomes an Access-Profile grant. Likely new `acct_evouchers` action keys.
2. **Operations defaults → SERVICE-AWARE.** Role-default profiles key on `(department, role, service)` so a Forwarding user gets the Forwarding default, etc. Fixes the duplicate-profile landmine without forcing explicit setup for every user.
3. **`assign` → FOLDED INTO `edit`.** No separate assign permission; owner-reassignment / task-assign gate on the module's `edit` grant. (Can split out later if ever needed.)
4. **Pricing baseline booking-create → GRANT IT** in the seed/profile (make it real, not hardcoded).

**Technical decisions (mine, no business impact):**
5. **Resolver design → resolve-at-write** (expand umbrella + cascade at save; both app and DB read the resolved set by literal key).
6. **`permissions.ts` → rip-and-replace** once Clusters 1–3 land (no shim).

## 8a. Out of scope (deliberately NOT a workstream)

**Making workflow *order* configurable/data-driven.** Hardcoded step-by-step flows (e-voucher chain, quotation status flow, booking/project lifecycle) are *business process*, not permissions — a hardcoded order does NOT violate the principle. The principle governs **who may act at a step** (a grant), never **what the steps are**. We make the *who* a grant (Decision 1); we do **not** build a workflow engine to edit the *order* without code. Parked as a someday-maybe only if a real need appears (e.g. a client requiring a different approval chain).

---

## 9. Non-goals

- Not a redesign of the access model — the grant model exists and works; this *finishes* it.
- Not hand-configuring every user — defaults + inheritance + explicit denies handle the normal case (per architecture doc).
- Not a big-bang cutover — every change is an independently shippable, reviewed slice.
- Not touching catalog data rules, Executive bypass, or legitimate department-based lens routing.

---

## 10. Definition of done

The principle is true when:
1. One resolution rule; app and DB provably agree for granted **and** non-granted users, on every product table.
2. No `public` table is wide-open to `authenticated`/`public` for business data.
3. No app gate decides permission by identity; `permissions.ts` permission functions are gone.
4. The regression guard is in place and green.
5. The ledger is fully burned down — every row checked off, on dev **and** prod.
