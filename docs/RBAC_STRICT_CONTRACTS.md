# Strict conversion — the system-wide contract sequence (NEU-012)

**Strict is SYSTEM-WIDE.** Every place the system enforces access must use **real, visible, configurable grants** — nothing hidden, nothing implied, identity never decides RBAC. (See `RBAC_PRINCIPLE_IMPLEMENTATION_PLAN.md` for the principle, `RBAC_COMPLIANCE_LEDGER.md` for the full burn-down inventory.)

### The principle, sharpened (Marcus, 2026-06-04)
1. **Access Profiles are the SINGLE source of truth.** Whatever is in the Access Profile a user is on IS their access — definitively. There is no second layer.
2. **Per-user overrides are NOT a concept.** The entire `permission_overrides` layer is removed. A user who needs different access is moved to / given a different profile — never patched personally. (Today overrides outrank profiles and grow into invisible 200+-key shadow-profiles — the thing that made it feel like "a second truth imposing itself.")
3. **Every grant is EXPLICIT and VISIBLE.** Each thing a user can do is a real, toggleable row in the profile matrix. No hidden modules, no derived umbrellas, no implied-from-parent grants in storage or enforcement.
4. **Cascade is a UX convenience ONLY.** Ticking a parent in the editor *bulk-fills the visible child checkboxes* — and what gets stored is each child grant, explicitly. Enforcement (DB + app) reads only the explicit stored grants. There is no parent→child implication at read/enforcement time.
5. **DB and app read the same explicit profile grants, identically.** One rule, two readers, never divergent.

**Scope = whole system. Execution = bounded contracts, one at a time.** Slicing is the *safety method* (anti-drift / anti-context-rot), not a narrowing of scope. Each contract is a small, exhaustively-inventoried, independently-verified unit with the same strict guardrail, the same "old mechanism stays alive until proven unused," and a rollback point. We finish and verify one before starting the next.

The principle has **two layers** (Marcus's lock): **Layer 1 = feature access** (which modules/actions you can see and work in) and **Layer 2 = record visibility** (which rows within those you can see — own/team/department/all). Almost all the contracts below harden Layer 1; **Layer 2 has never been audited and is currently the least strict-compliant half** (see kind V).

There are **six kinds** of strict violation across the system, all governed by the same principle:
- **H — Hidden/implied umbrellas** (derived pseudo-modules used in enforcement) → eliminate; enforce real visible grants. *(Layer 1)*
- **C — Implied cascade/contains** (a child grant inferred from a parent via a hidden containment map, at read/enforcement time) → make cascade UX-only; store every grant explicitly. *(Layer 1)*
- **U — Per-user overrides** (a second grant layer that outranks profiles) → eliminate the concept; Access Profile is the sole truth. *(Layer 1)*
- **O — Wide-open / no enforcement** (tables anyone can touch) → add real-grant enforcement. *(Layer 1)*
- **I — Identity gates** (`department ===` / `permissions.ts` deciding access) → replace with `can()`. *(Layer 1)*
- **V — Record visibility decided by identity / broken by omission** (scope derived from *role* not configured; hardcoded department allow-lists inside the visibility functions; "own" silently broken because creators aren't stamped, so a staff user can't even read back the row they just created) → make record-visibility scope an explicit, visible, configurable Access-Profile setting; stamp creators; one coherent mechanism, app == DB. *(Layer 2)*

---

## The ordered contracts

| # | Contract | Kind | Status | Doc |
|---|----------|------|--------|-----|
| 1 | **`ops_bookings` umbrella** (bookings + customers/quotations cross-reads + 4 buttons + 2 routes) | H | ✅ Steps 1–5 + drift fix done (dev); Marcus visual smoke pending; prod pending | `RBAC_PATHA_BOOKINGS.md` |
| 2 | **`ops_projects` umbrella** (`customers_select` disjunct + resolver branch; `ids.root` was dead) | H | ✅ done (dev, migrations 148–149); resolver now has zero umbrella derivation; prod pending | `RBAC_CONTRACT2_OPS_PROJECTS.md` |
| 3 | **`inbox_entity_picker` umbrella** (inbox entity tabs) | H | ✅ done (dev, migration 150) — had zero enforcement consumers; stopped derivation + stripped 24 inert stored keys; prod pending | _todo_ |
| 4 | **Cascade → UX-only; every grant explicit & visible** — stop resolving `containsModuleIds`/parent→child at read/enforcement; cascade becomes an editor bulk-fill that writes explicit child grants; borrowed/contained tabs become real visible rows; DB resolver + `PermissionProvider` read explicit grants only | C | 🚧 Phase 2 (path C) in progress — merged with #5; dry-run done (60 users → 28 shapes, 0 empty) | `RBAC_CONTRACT45_CASCADE_OVERRIDES.md` |
| 5 | **Eliminate per-user overrides** — remove the `permission_overrides` layer from the DB resolver + `PermissionProvider`; remove the per-user matrix editor (Users → assign a profile, not edit a grid); migrate every existing override into a named profile (or assign a clean one); drop the table last | U | 🚧 Phase 2 (path C) in progress — merged with #4 via the snapshot operation | `RBAC_CONTRACT45_CASCADE_OVERRIDES.md` |
| 6 | **Record visibility (Layer 2) — explicit, configurable, honest** — stamp creators on every record insert so "own" works + create-then-read-back works; make the own/team/department/all scope an explicit, visible, configurable Access-Profile setting (stop deriving it from role); remove hardcoded department allow-lists from the visibility functions (`current_user_can_view_record`, `current_user_can_view_booking`, …); one coherent visibility mechanism, app == DB, across every record table | V | **HIGH** — ✅ slice 1 (stamp creators) done on dev: bookings + collections/evouchers/expenses/invoices/quotations triggers (migrations 146–147); slices 2–4 (configurable scope, remove dept allow-lists, coherence) pending | _todo_ |
| 7 | **Wide-open tables** — `projects`, `project_bookings`, `transactions`, `accounts`, `catalog_items`, `catalog_categories`, `contract_rate_versions` | O | Not started | _todo_ |
| 8 | **RLS-OFF tables** — `ticket_*` (5), `memos`, `feedback`, `exchange_rates` (+ drop `__backup_quotations_pre_107`) | O | Not started | _todo_ |
| 9 | **Legacy identity tables** (~27) — `contract_bookings`, `contract_activity/attachments`, `comments`, `consignees`, `budget_requests`, `journal_entries`, `calendar_events`, `tickets`, `users`, `crm_activities`, team/assignment/service-config, profile lookups… | I/O | Not started | _todo_ |
| 10 | **App identity gates** — E-Voucher cluster (~20), quotation `StatusChangeButton` (3 flags), admin-config (3), owner/assign (folded into edit), sidebar exec bypass, list role-scope | I | Not started | _todo_ |
| 11 | **Retire `permissions.ts`** — once clusters in #10 land, delete the dead functions | I | Not started | _todo_ |
| 12 | **Regression guard** — build fails on: a new hidden/derived module, an implied parent→child grant read at enforcement, any read of `permission_overrides`, an identity gate, role-derived record visibility, an unstamped-creator insert path, or an ungated table | — | Not started | _todo_ |

> Order rationale: **umbrellas first** (#1–3 — the live bug + clearest strict win, and they unblock "everything visible"); then **clean the grant layer** (#4 cascade UX-only, #5 remove the override second-truth — these deliver "Access Profile = definitive truth" for Layer 1); then **Layer 2 (#6)** — make record visibility explicit/configurable/honest (the other half of the principle, currently the weakest); then close the **wide-open holes** (#7–8); then **legacy + app gates** (#9–11); then **lock it in** (#12). Each row becomes its own per-contract doc (like #1) when we reach it.
>
> **Where #6 sits and why:** it's the Layer-2 counterpart to all the Layer-1 work, so it's a different axis — **independent of the umbrella contracts (#1–3).** It **comes after #5** (with overrides gone, visibility scope lives only on the profile — one place to configure). It **must come before the table-enforcement contracts (#7–8)**: those add RLS to currently-unguarded tables and MUST use the canonical visibility model + creator-stamping — define Layer 2 first or we'd enforce, then redo. It also **absorbs the Layer-2 slice of #9/#10** (the hardcoded department allow-lists inside visibility functions are identity gates). **Priority note:** Marcus flagged this HIGH — its first slice (stamp creators) also fixes the live "staff can't create a booking" failure, so that slice can be pulled forward immediately even before #2–5.

### Notes on #4 and #5 (the two added this round)
- **#4 is mostly a back-end/enforcement change + an editor reframing.** The cascade *math* (`resolveCascadedGrants`) stops being an enforcement input; the editor keeps a "tick parent → fill visible children" affordance but persists explicit grants. The hard part is the **contained/borrowed tabs** (booking-detail tabs reused under each service; ops_project tabs borrowed under bd/pricing projects): each must become a real, visible, independently-toggleable row rather than an implied borrow.
- **#5 is mostly a data migration + UI removal.** Real risk lives in the data: every user currently carrying an override (e.g. Carolina's 230-key blob, the duplicate-profile landmine) must be mapped to a profile that equals their *intended* access before the override layer is switched off — otherwise access changes silently. Plan: snapshot each user's current effective grants, turn distinct shapes into named profiles, assign, verify per user, then remove the override read-path, then drop the table.
- **Consequence Marcus has accepted:** no per-user tailoring. Unique access = a (possibly new) profile. More profiles, but one legible truth each.

### Notes on #6 — Record visibility (Layer 2), the high-priority addition
Discovered while testing Contract #1: staff user Cecil (Brokerage) couldn't create a booking — `42501 new row violates row-level security policy`. Root cause was NOT the create permission (that passed); it was that the app does `insert().select()` (write + read-back as one atomic move), the new row had **no `created_by` stamped**, and a staff user's "own"-scope visibility then forbade reading back the row they just made → the whole move rolled back → genuine failure (nothing saved). It was masked before (the umbrella failure stopped Cecil at the create check; managers' broader scope hid it). This is Layer 2 fighting the core principle, so it gets its own contract. Likely slices:
1. **Stamp creators on insert** (`created_by` / `owner_id`) across every record table — a DB `BEFORE INSERT` trigger that fills the creator from `auth.uid()` when null covers all paths (5 booking panels + project flow + future) in one place. Fixes "own" + create-then-read-back. **This slice unblocks Cecil now** and can ship ahead of the rest.
2. **Make scope explicit & visible** — record-visibility scope (own/team/department/all) becomes a configured, visible Access-Profile control; remove the `roleDefaultVisibilityScope(role)` identity fallback so role never silently decides what you can see.
3. **Remove hardcoded department allow-lists** from `current_user_can_view_record` / `current_user_can_view_booking` / siblings — replace with the configured scope.
4. **One coherent mechanism** across all record tables; app == DB; verify each scope (own/team/dept/all) for granted + non-granted users.
- **Bug class to sweep, not just bookings:** the create-then-read-back failure hits any table where staff (own-scope) insert a row whose creator isn't stamped — expenses, billings, invoices, collections, e-vouchers, projects, etc. Slice 1's trigger pattern is applied table-by-table.

## Execution phases & division of labor
Sequenced by impact + dependency, grouped so visual testing batches. Contracts keep their numbers; phases are the running order.

| Phase | Contracts | What gets better (what Marcus sees) | Size | Marcus's role |
|---|---|---|---|---|
| **0 — Stop the bleeding** | #6 slice 1 (stamp creators) | Staff can create records again (bookings, expenses, …) | Small | 5-min smoke: create a booking as a staff user |
| **1 — Remove hidden umbrellas** | #2, #3 | Less invisible machinery; unblocks "everything visible" | Medium | Short smoke per contract (granted vs non-granted) |
| **2 — Make config legible** (the Carolina fix) | #4 cascade→UX-only, #5 kill overrides | Editor shows every grant explicitly; no second invisible truth; "Access Profile = the truth" | **Large** | **Heavy** — define what each role/profile should have; approve per-user profile assignments |
| **3 — Honest record visibility** | #6 slices 2–4 | Who-sees-what is a visible setting, not role-magic | Medium | Decide scopes per profile (own/team/dept/all) |
| **4 — Close open holes** | #7, #8 | Every table actually enforces (security) | Medium | Light smoke |
| **5 — Convert legacy + app gates** | #9, #10 | Last `department ===` / `permissions.ts` gates gone | Large | Smoke affected flows (E-Voucher, quotations) |
| **6 — Lock it in** | #11, #12 | Dead code gone; build fails on any future violation | Small | None |

**Prod releases:** staged at coherent phase boundaries (not per-contract, not all-at-end), each via the CLAUDE.md "Release dev to prod" checklist, surfaced first. Natural checkpoints: after Phase 0 (the hotfix), after Phase 2 (config stable), after Phase 4, and at the end.

**Who does what, in general:** I do all code/SQL, deep per-slice verification (probes/diffs/tests), inventory, plan upkeep, Cortex checkpoints, and surface prod migrations. You run the short smoke-lists I hand you, make the domain calls (concentrated in Phases 2–3: what each role/profile gets, who sees what), approve assignments, and say "Release dev to prod" at checkpoints. The only phase needing real back-and-forth is **Phase 2** (turning today's messy overrides into clean, intentional profiles — I can't guess business intent).

## The same rules apply to every contract
1. **Exhaustive inventory** from fresh grep + live `pg_policies` — never memory.
2. **Strict guardrail** (3 checks) on every change: nothing hidden/implied · no identity gate · button == DB == same real grant.
3. **Old mechanism stays alive** until a fresh grep proves zero references, then removed last.
4. **Verify granted + non-granted users**, app + DB agree, per slice. Rollback commit per slice.
5. **Prod after all of a contract's dev slices pass**, released as one surfaced batch.
6. **Cortex checkpoint** per contract so state survives context compaction.

## Done = the whole system
The conversion is complete when: every contract above is checked off; a system-wide grep shows zero hidden-umbrella / implied-cascade / identity enforcement; **`permission_overrides` is gone and nothing reads it**; **every grant a user has is an explicit, visible row in the one Access Profile they're on**; **record visibility (Layer 2) is an explicit, configurable Access-Profile setting — never role-derived — and creators are stamped so "own" works everywhere**; every product table enforces via real grants; and the regression guard is green. Both layers — feature access and record visibility — are one source of truth (the Access Profile), read identically by app and DB. Strict, everywhere.
