# Path A — Eliminate the `ops_bookings` umbrella (NEU-012, STRICT)

**This file is the contract. Re-read the relevant section before every slice. The file overrides memory.**
Authoritative inventory taken 2026-06-04 from a fresh grep + live dev `pg_policies` (not memory).

---

## The strict guardrail — run on EVERY slice (all three must pass)
1. **Nothing hidden / implied?** The change must not add a hidden or derived *grant*. (A SQL/TS *expression* that ORs real, visible grants is allowed — it is enforcement logic, not a grant, not in the matrix.)
2. **No identity gate?** No `department ===` / `role ===` deciding access.
3. **Button == DB == same real grant?** The UI gate and the DB rule read the **same real, visible** grant(s).

If any answer is wrong, the slice fails — fix the design, don't paper over.

## Safety rules
- **One slice at a time.** Change → verify → check the box → stop. Never batch.
- **The umbrella stays alive until the END.** Migration 140 keeps `ops_bookings` resolving (derived) so every not-yet-migrated consumer keeps working. We remove the derivation **last**, only after a fresh grep proves zero enforcement references remain.
- **Rollback point per slice** (git commit, Marcus-reviewed). **Prod untouched** until all dev slices pass; then release as one surfaced batch.
- **Cortex checkpoint** after each slice so state survives context compaction.

## The replacement mechanism (the "after")
"Can do X with a booking" = OR of the **real, visible** grants that legitimately touch bookings:
`ops_forwarding:X` · `ops_brokerage:X` · `ops_trucking:X` · `ops_marine_insurance:X` · `ops_others:X` · `ops_projects_bookings_tab:X`

- **DB:** new helper `public.current_user_can_act_on_booking(p_action text)` = OR of `current_user_has_module_permission(<each real module>, p_action)`. *Not a grant — an expression over visible grants.*
- **App:** new helper `canActOnBooking(can, action)` in a util = the same OR via `can(...)`. Components call it.
- **Routes:** `RouteGuard` gains an OR/predicate form (or uses the client helper) — no single hidden module.

> **Important:** the `ops_bookings` *module node* also hosts the real booking-detail tabs (`ops_bookings_info_tab`, …) which we KEEP. "Eliminate the umbrella" means: **no enforcement references `ops_bookings:<action>` and it is no longer derived.** The module node stays (hidden host for its tabs). Same applies to `ops_projects` (Phase A2).

---

## Phase A1 — `ops_bookings` (do now)

### Step 0 — helpers  ✅ done (migration 142, dev)
- [x] Add DB helper `current_user_can_act_on_booking(action)` (expression over the 6 real grants).
- [x] Add client helper `canActOnBooking(can, action)` (`src/utils/bookingPermissions.ts`, same OR).
- **Verify:** Jayson → `create`/`view` true; HR (Amor) → false. ✓ Passed on dev.

### Step 1 — `bookings` table policies (replace `ops_bookings` → helper)  ✅ done (migration 143, dev)
- [x] `bookings_insert`  → `current_user_can_act_on_booking('create')`
- [x] `bookings_select`  → `(can_act_on_booking('view') OR acct_bookings:view) AND current_user_can_view_booking(...)` (acct disjunct preserved; scope preserved)
- [x] `bookings_update`  → `can_act_on_booking('edit')` (using + check); scope preserved on using
- [x] `bookings_delete`  → `can_act_on_booking('delete')`; scope preserved
- **Verify (dev, all 60 users, OLD-vs-NEW expression diff):** zero `ops_bookings` refs left in policies. `create` identical for all. `view`/`edit`/`delete` differ ONLY for `ops_projects_bookings_tab` holders (8/9/1, all explained, 0 unexplained) — the intended, documented widening; no user lost access. Brokerage user full ✓, Accounting ✗ (no acct_bookings:view grant), Jayson ✓, HR ✗.

### Step 2 — cross-read policies (remove the `ops_bookings` disjunct, swap to helper-view)  ✅ done (migration 144, dev)
- [x] `quotations_select` — both groups: `ops_bookings:view` → `current_user_can_act_on_booking('view')`; all other disjuncts + record-scope preserved verbatim.
- [x] `customers_select` — `ops_bookings:view` → helper; **`ops_projects:view` disjunct left untouched** (Contract #2).
- **Verify (dev, all 60 users):** zero `ops_bookings` refs left in both policies. Each changed module-gate group: 0 losses, 0 unexplained — only the `ops_projects_bookings_tab:view` holder gains. No visibility regression.

### Step 3 — app booking buttons (`can("ops_bookings", …)` → `canActOnBooking(can, …)`)
- [ ] `ProjectServiceCard.tsx:34`  (`create`)
- [ ] `ProjectBookingsTabBD.tsx:34` (`create`)
- [ ] `ProjectBookingReadOnlyView.tsx:42` (`delete`)
- [ ] `QuotationFileView.tsx:108` (`create`)
- *(already done: `ProjectBookingsTab.tsx` → `ops_projects_bookings_tab:create`)*
- **Verify:** each button shows for a granted user, hidden for non-granted; matches its table policy.

### Step 4 — route guards (`App.tsx`)
- [ ] `App.tsx:1155` `ops_bookings:create` route → real-grant predicate.
- [ ] `App.tsx:1158` `ops_bookings:view` route → real-grant predicate.
- **Verify:** a granted user reaches the route; a non-granted user is redirected.

### Step 5 — prove unused, then remove the umbrella
- [ ] Fresh grep + `pg_policies` query: **zero** `'ops_bookings'` enforcement references (DB policies, routes, components).
- [ ] Remove the `ops_bookings` derivation branch from `current_user_effective_module_grant` (migration 140) — it auto-drops from `HIDDEN_MODULE_MAPPINGS`/client once nothing reads it.
- [ ] `accessSchema.test.ts` — update assertions (134/142/163) to reflect `ops_bookings` no longer derived/enforced (module node + tabs remain).
- [ ] `CreateUserPage.tsx:62` — remove the `ops_bookings` quick-grant entry (or repoint).
- **Verify:** full app smoke (booking create/view/edit/delete across a service user, Pricing, project flow) + the harness, all green; nothing references the umbrella.

---

## Phase A2 — `ops_projects` (NEXT, inventory to be completed)
`ops_projects` is woven differently — it is the **root module-id** of the ops project lens (`PROJECT_MODULE_IDS.ops.root`, `accessSchema.ts:880`), so `ProjectsList`/`ProjectDetail` check `can(ids.root, …)` = `can('ops_projects', …)` indirectly (won't show in a literal grep). Live policy consumer: `customers_select` (the `ops_projects` disjunct).
- [ ] Deeper grep of `PROJECT_MODULE_IDS` / `ids.root` usages → complete the A2 inventory before touching it.
- [ ] Then same pattern: real-grant helper, migrate consumers, remove derivation last.

---

## Definition of done (objective)
1. Every Phase A1 box checked; A2 inventory drafted.
2. Fresh grep + `pg_policies`: **zero** `'ops_bookings'` enforcement references.
3. `ops_bookings:<action>` no longer derived (resolver branch gone); module node + tabs still resolve.
4. Strict guardrail passes on every changed file/policy.
5. Verified on dev for granted **and** non-granted users (harness); then released to prod as one surfaced batch.

## Verification harness (reused every slice)
Per-user simulation on dev:
```sql
select public.current_user_can_act_on_booking('create')   -- or the policy/helper under test
from (select set_config('request.jwt.claims',
       json_build_object('sub', (select auth_id from public.users where <pick user>))::text, true)) _s;
```
Always test **a granted user AND a non-granted user**, and confirm the matching **app gate agrees**.

## State at start (dev)
- Applied: `137` (triggers dropped by 140), `139` (service-aware default — keep), `140` (derive-at-read umbrella = the **safety net**, removed in Step 5), `141` (insert OR — superseded by Step 1).
- `ProjectBookingsTab.tsx` button already on `ops_projects_bookings_tab:create`; `PermissionProvider` derives hidden grants at read (narrows to inbox once umbrella removed).
- Prod: untouched.
