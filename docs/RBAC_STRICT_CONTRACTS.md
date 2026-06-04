# Strict conversion — the system-wide contract sequence (NEU-012)

**Strict is SYSTEM-WIDE.** Every place the system enforces access must use **real, visible, configurable grants** — nothing hidden, nothing implied, identity never decides RBAC. (See `RBAC_PRINCIPLE_IMPLEMENTATION_PLAN.md` for the principle, `RBAC_COMPLIANCE_LEDGER.md` for the full burn-down inventory.)

### The principle, sharpened (Marcus, 2026-06-04)
1. **Access Profiles are the SINGLE source of truth.** Whatever is in the Access Profile a user is on IS their access — definitively. There is no second layer.
2. **Per-user overrides are NOT a concept.** The entire `permission_overrides` layer is removed. A user who needs different access is moved to / given a different profile — never patched personally. (Today overrides outrank profiles and grow into invisible 200+-key shadow-profiles — the thing that made it feel like "a second truth imposing itself.")
3. **Every grant is EXPLICIT and VISIBLE.** Each thing a user can do is a real, toggleable row in the profile matrix. No hidden modules, no derived umbrellas, no implied-from-parent grants in storage or enforcement.
4. **Cascade is a UX convenience ONLY.** Ticking a parent in the editor *bulk-fills the visible child checkboxes* — and what gets stored is each child grant, explicitly. Enforcement (DB + app) reads only the explicit stored grants. There is no parent→child implication at read/enforcement time.
5. **DB and app read the same explicit profile grants, identically.** One rule, two readers, never divergent.

**Scope = whole system. Execution = bounded contracts, one at a time.** Slicing is the *safety method* (anti-drift / anti-context-rot), not a narrowing of scope. Each contract is a small, exhaustively-inventoried, independently-verified unit with the same strict guardrail, the same "old mechanism stays alive until proven unused," and a rollback point. We finish and verify one before starting the next.

There are **five kinds** of strict violation across the system, all governed by the same principle:
- **H — Hidden/implied umbrellas** (derived pseudo-modules used in enforcement) → eliminate; enforce real visible grants.
- **C — Implied cascade/contains** (a child grant inferred from a parent via a hidden containment map, at read/enforcement time) → make cascade UX-only; store every grant explicitly.
- **U — Per-user overrides** (a second grant layer that outranks profiles) → eliminate the concept; Access Profile is the sole truth.
- **O — Wide-open / no enforcement** (tables anyone can touch) → add real-grant enforcement.
- **I — Identity gates** (`department ===` / `permissions.ts` deciding access) → replace with `can()`.

---

## The ordered contracts

| # | Contract | Kind | Status | Doc |
|---|----------|------|--------|-----|
| 1 | **`ops_bookings` umbrella** (bookings + customers/quotations cross-reads + 4 buttons + 2 routes) | H | ✅ Steps 1–5 + drift fix done (dev); Marcus visual smoke pending; prod pending | `RBAC_PATHA_BOOKINGS.md` |
| 2 | **`ops_projects` umbrella** (project list/detail via `PROJECT_MODULE_IDS.ops.root`; `customers_select`) | H | Inventory pending | _todo_ |
| 3 | **`inbox_entity_picker` umbrella** (inbox entity tabs) | H | Not started | _todo_ |
| 4 | **Cascade → UX-only; every grant explicit & visible** — stop resolving `containsModuleIds`/parent→child at read/enforcement; cascade becomes an editor bulk-fill that writes explicit child grants; borrowed/contained tabs become real visible rows; DB resolver + `PermissionProvider` read explicit grants only | C | Not started | _todo_ |
| 5 | **Eliminate per-user overrides** — remove the `permission_overrides` layer from the DB resolver + `PermissionProvider`; remove the per-user matrix editor (Users → assign a profile, not edit a grid); migrate every existing override into a named profile (or assign a clean one); drop the table last | U | Not started | _todo_ |
| 6 | **Wide-open tables** — `projects`, `project_bookings`, `transactions`, `accounts`, `catalog_items`, `catalog_categories`, `contract_rate_versions` | O | Not started | _todo_ |
| 7 | **RLS-OFF tables** — `ticket_*` (5), `memos`, `feedback`, `exchange_rates` (+ drop `__backup_quotations_pre_107`) | O | Not started | _todo_ |
| 8 | **Legacy identity tables** (~27) — `contract_bookings`, `contract_activity/attachments`, `comments`, `consignees`, `budget_requests`, `journal_entries`, `calendar_events`, `tickets`, `users`, `crm_activities`, team/assignment/service-config, profile lookups… | I/O | Not started | _todo_ |
| 9 | **App identity gates** — E-Voucher cluster (~20), quotation `StatusChangeButton` (3 flags), admin-config (3), owner/assign (folded into edit), sidebar exec bypass, list role-scope | I | Not started | _todo_ |
| 10 | **Retire `permissions.ts`** — once clusters in #9 land, delete the dead functions | I | Not started | _todo_ |
| 11 | **Regression guard** — build fails on: a new hidden/derived module, an implied parent→child grant read at enforcement, any read of `permission_overrides`, an identity gate, or an ungated table | — | Not started | _todo_ |

> Order rationale: **umbrellas first** (#1–3 — the live bug + clearest strict win, and they unblock "everything visible"); then **clean the grant layer** (#4 make cascade UX-only so every grant is explicit, #5 remove the override second-truth — these two deliver Marcus's "Access Profile = definitive truth"); then close the **wide-open holes** (#6–7, highest real exposure); then **legacy + app gates** (#8–10); then **lock it in** (#11). Dependency: #4 needs #1–3 done (tabs need visible homes before they can be explicit rows); #5 needs #4 (profiles must be able to express everything before overrides can be retired). Each row becomes its own per-contract doc (like #1) when we reach it.

### Notes on #4 and #5 (the two added this round)
- **#4 is mostly a back-end/enforcement change + an editor reframing.** The cascade *math* (`resolveCascadedGrants`) stops being an enforcement input; the editor keeps a "tick parent → fill visible children" affordance but persists explicit grants. The hard part is the **contained/borrowed tabs** (booking-detail tabs reused under each service; ops_project tabs borrowed under bd/pricing projects): each must become a real, visible, independently-toggleable row rather than an implied borrow.
- **#5 is mostly a data migration + UI removal.** Real risk lives in the data: every user currently carrying an override (e.g. Carolina's 230-key blob, the duplicate-profile landmine) must be mapped to a profile that equals their *intended* access before the override layer is switched off — otherwise access changes silently. Plan: snapshot each user's current effective grants, turn distinct shapes into named profiles, assign, verify per user, then remove the override read-path, then drop the table.
- **Consequence Marcus has accepted:** no per-user tailoring. Unique access = a (possibly new) profile. More profiles, but one legible truth each.

## The same rules apply to every contract
1. **Exhaustive inventory** from fresh grep + live `pg_policies` — never memory.
2. **Strict guardrail** (3 checks) on every change: nothing hidden/implied · no identity gate · button == DB == same real grant.
3. **Old mechanism stays alive** until a fresh grep proves zero references, then removed last.
4. **Verify granted + non-granted users**, app + DB agree, per slice. Rollback commit per slice.
5. **Prod after all of a contract's dev slices pass**, released as one surfaced batch.
6. **Cortex checkpoint** per contract so state survives context compaction.

## Done = the whole system
The conversion is complete when: every contract above is checked off; a system-wide grep shows zero hidden-umbrella / implied-cascade / identity enforcement; **`permission_overrides` is gone and nothing reads it**; **every grant a user has is an explicit, visible row in the one Access Profile they're on**; every product table enforces via real grants; and the regression guard is green. One source of truth — the Access Profile — read identically by app and DB. Strict, everywhere.
