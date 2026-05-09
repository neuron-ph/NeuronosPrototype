# Access Configuration Source-Of-Truth Migration Handoff

## 2026-05-09 Session Update — Slices 2 + 3 (dev only)

Migrations `097_business_record_rls_slice_2.sql` and `098_business_record_rls_slice_3.sql` written and applied to **dev only**.

**097 — quotations + bookings**
- New helper: `current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)` — returns true if the current user is assigned to the booking (any of the four IDs match) OR `current_user_can_view_owner(created_by)` passes.
- `quotations`: SELECT requires any of `pricing_quotations:view`, `pricing_contracts:view`, `bd_contracts:view`, `bd_inquiries:view`, `ops_bookings:view`, `acct_bookings:view`, scoped by `coalesce(prepared_by, created_by)`. INSERT requires `pricing_quotations:create | pricing_contracts:create | bd_inquiries:create`. UPDATE/DELETE require `pricing_quotations:edit/delete | pricing_contracts:edit/delete` plus scope.
- `bookings`: replaces the legacy "Authenticated full access" policy. SELECT requires `ops_bookings:view | acct_bookings:view` and assignment-or-scope. INSERT/UPDATE/DELETE on `ops_bookings:create/edit/delete`.

**098 — approvals + finance** (evouchers, evoucher_line_items, billing_line_items, invoices, collections, expenses)
- `evouchers`: SELECT visible to `acct_evouchers:view` OR (own + `my_evouchers:view`) OR (transaction_type=budget_request + `bd_budget_requests:view`). INSERT/UPDATE/DELETE follow the same three-way pattern.
- `evoucher_line_items`: cascades off parent evoucher visibility (the parent SELECT policy already enforces grants).
- `billing_line_items`: gated on any of `acct_financials`, `accounting_financials_billings_tab`, `acct_billings`, `acct_bookings` (view), or the booking/project/contract billing tabs.
- `invoices` / `collections` / `expenses`: gated on `acct_financials` plus the corresponding finance/booking/project sub-tab grants.

Verified end-to-end via JWT impersonation:
- Mia (no relevant grants) → 0 visible rows across all 8 tables.
- Mia after granting view perms (`pricing_quotations:view`, `ops_bookings:view`, `acct_financials:view`, `my_evouchers:view`, `acct_evouchers:view`) and `scope='all'` → sees 18 quotations, 11 bookings, 24 evouchers, 5 invoices, 4 collections, 27 billing_line_items. (`expenses` table is empty in dev — no policy issue.)

Mia's overrides have been restored to the original test set (`exec_profiling:view+create`, scope `own`) for the carrier UI test.

**Open items still pending user action:**
- Apply `096`, `097`, `098` to **prod**. Same prod-safety concerns as before — flipping these RLS sets requires a per-user grant audit first to confirm nobody loses visibility silently.
- Seed an "Executive Default" full-access role profile (still blocked from previous session — needs explicit user authorization).
- Once the Executive profile is seeded, remove the transitional executive bypass in `create-user/index.ts`.

---

## 2026-05-09 Session Update — Continuation (autonomous run)

Migration `095` applied to **prod** (`ubspbukgcxmzegnomlgi`) — verified scope conversion (`department_wide → department`), helper functions, and 27 grant-aware Profiling RLS policies.

`create-user` edge function redeployed to both dev (v8) and prod (v13). Note: it still includes a **transitional executive bypass** for caller authorization because no Executive role-default access profile exists yet on either project; without the bypass, executives could not create users since they have no overrides and no role-default profile to inherit grants from. Removing this bypass is blocked on seeding an Executive profile (a high-impact change explicitly deferred to user authorization).

Migration `096_business_record_rls_slice_1.sql` written and applied to **dev only** (NOT prod). Adds canonical scope helpers and grant-driven RLS for the first business-record slice:
- `current_user_visibility_scope()` — resolves override → applied profile → role default
- `current_user_visibility_departments()` — resolves selected_departments scope
- `current_user_can_view_owner(text)` — given an owner_id, returns whether current scope permits viewing
- New grant + scope policies for `contacts`, `customers`, `tasks` (replaces `is_executive() / can_access_record()` legacy gates)

RLS slice 1 verified end-to-end on dev via JWT impersonation:
- Mia (BD staff, `bd_contacts:create`, scope=own) can insert and see her own contacts
- A row owned by another user is invisible to Mia (own-scope blocks SELECT)
- A user without `bd_contacts:view` sees zero contacts regardless of scope

Phase 7 cleanup completed:
- `RouteGuard.tsx` — removed unused `allowedDepartments` and `requireMinRole` parameters and the legacy fallback branch. Route gating is now exclusively `requiredPermission`-based.
- `App.tsx` `GuardedLayout` — removed pass-through props
- `permissionsConfig.ts` — deleted `getInheritedPermission` and `getEffectivePermission` (and supporting role-action arrays / `INBOX_DEPT` / `PERSONAL_DEPT` / `MODULE_ACTIONS` constants). Replaced with a comment pointing future readers to `usePermission().can()` and `current_user_has_module_permission()`.
- `accessSchema.ts` — deleted `MODULE_DEPT_LABEL` (only consumer was the now-deleted `getInheritedPermission`)

Display-variant cleanup (partial):
- `GeneralJournal.tsx` — `isAccounting` dept gate replaced with `can("acct_journal","view") && (manual_tab.view || all_sources_tab.view)`
- `OperationsTeamsSection.tsx` — `canEditServiceConfig` exec gate replaced with `can("admin_teams_tab","edit")`

The remaining 9 display-variant files (`ContactDetail`, `CustomerDetail`, `ContractsList`, `ContractsModule`, `Pricing`, `ProjectsList`, `ProjectsModule`, `Settings`, `AssignmentProfileEditor`) gate display variants / dropdown filters / tab routing / label formatting only — they don't enforce access, and per the source-of-truth charter "workflow may still use department/team/role context" → left in place.

**Open items still pending user action:**
- Apply migration `096` to prod (deliberately deferred — needs a maintenance window and prior validation that no live user's grants would be invalidated)
- Seed an "Executive Default" full-access role profile on dev and prod (denied earlier this session — needs explicit user authorization given its blast radius)
- Once the Executive profile is seeded, remove the transitional executive bypass in `create-user` index.ts (lines marked `// Transitional`)
- Remaining business-record RLS slices: quotations/bookings, then approvals/finance

Zero new TypeScript errors introduced across all conversions in this session.

---

## 2026-05-09 Session Update

Applied migration `095` to dev (`oqermaidggvanahumjmj`) after correcting an ordering bug (UPDATE ran before old check constraint dropped — fixed in source). End-to-end RLS verified via JWT impersonation:

- ✅ Grant works: BD staff with `exec_profiling:create` → carrier insert succeeded.
- ✅ No grant: BD team_leader without grant → RLS rejected.
- ✅ Explicit deny (`false` in `module_grants`) overrode allow → RLS rejected.

Test override left intact on `user-7403b0ab` (Mia Dela Cruz, BD staff) granting `exec_profiling:view + create` for UI verification.

Component conversions completed in this session:
- `ProjectBookingsTabBD.tsx` and `ProjectServiceCard.tsx` — booking gate now `can("ops_bookings","create")`
- `BudgetRequestDetailPanel.tsx` — approve via `can("bd_budget_requests","approve")`, post via `can("acct_evouchers","approve") || can("acct_journal","create")`
- `ExecutiveDashboard.tsx` — removed hardcoded `role: "director"` and empty `id: ""`; sources from `useUser()`
- `QuotationFileView.tsx` — all 6 dept gates converted (`canAssign`, `canEditPricing`, `canCreateProject`, `canActivateContract`, `canCreateBookings`, `showPricing`); dropped `effectiveRole`/`useUser` import
- `ProjectDetail.tsx` — `showActions` via `can("bd_projects","edit") || can("pricing_projects","edit")`
- `ProjectBookingReadOnlyView.tsx` — `Cancel/Delete` button via `can("ops_bookings","delete")`
- `RecordBrowser.tsx` — section visibility now driven by `useDataScope().scope.type === 'all'` (replaces `isExecutive`)
- `MyHomepage.tsx` — memo write via `can("exec_memos","create")`
- `permissionsConfig.ts` and `accessSchema.ts` — added `exec_memos` module key

Phase status after this session:
- Phase 1 (canonical access engine): mostly done
- Phase 2 (visibility model): app-side done; live record-level validation still pending
- Phase 3 (Profiling pilot): **DB and RLS proven** — original carrier failure fixed
- Phase 4 (route guard cleanup): no live legacy callers remain; legacy props kept defensively
- Phase 5 (screen-level cleanup): high-impact gates converted; remaining items are display-variant only (low impact)
- Phase 6 (SQL/RLS migration): **applied to dev**; prod still pending. Migration 095 validated.
- Phase 7 (legacy decommissioning): not started — defer until next business-record RLS slice

Still pending (explicitly out of scope this session):
- Apply migration 095 to **prod** (`ubspbukgcxmzegnomlgi`) — needs Marcus confirmation
- Business-record RLS slice (contacts/customers/tasks → quotations/bookings → finance)
- Retire `permissionsConfig.ts` inherited helpers (`getInheritedPermission`, `getEffectivePermission`)
- Display-variant dept checks remain in: `GeneralJournal.tsx`, `OperationsTeamsSection.tsx`, `ContactDetail.tsx`, `CustomerDetail.tsx`, `ContractsList.tsx`, `ContractsModule.tsx`, `Pricing.tsx`, `ProjectsList.tsx`, `ProjectsModule.tsx`, `Settings.tsx`, `AssignmentProfileEditor.tsx` — these gate display variants/filters/labels, not authorization, so leave alone unless an explicit policy applies

---

## Purpose

This document is the full engineering handoff for the ongoing migration to make **Access Configuration** the source of truth for system access in Neuron OS.

This is intended for Claude or any other engineer taking over the work.

It covers:

- the business goal
- the decisions already made with Marcus
- the target authorization model
- what has already been implemented
- what has not been implemented yet
- what must be validated next
- the recommended execution order from here
- the key risks and non-negotiable constraints

This is deliberately detailed so the next engineer does not have to reconstruct the context from chat history.

---

## Executive Summary

The system is being migrated away from split RBAC behavior where access was decided by a mixture of:

- Access Configuration `module_grants`
- department gates
- role/rank gates
- route-level hardcoded checks
- screen-level hardcoded checks
- Supabase RLS based on `department` and `role`

The new contract is:

- **Access Configuration decides access**
- department and rank must **not veto** configured access
- department and rank may still be used for **workflow orchestration**, **labels**, **org context**, and **scope resolution inputs**
- record visibility is now an explicit configuration concept, not something inferred from role

The first implementation slice is already underway and is materially complete on the frontend/runtime side:

- canonical access resolver implemented
- explicit deny support added
- explicit visibility scope model added
- admin editors updated to understand the new access model
- Profiling UI moved onto permission-driven actions
- quick-create profiling gates moved onto permission-driven actions
- Inbox queue access moved off manager/director shortcuts
- Activity Log moved off manager/director shortcuts
- several route-level legacy blockers removed for migrated routes
- a SQL migration scaffold exists for scope conversion and grant-aware Profiling/admin policies

The biggest remaining gap is:

- the SQL migration has not yet been applied and validated against a real database
- several legacy access callers still exist outside the first slice
- broader business-record RLS is not yet migrated

---

## Original Problem

Marcus reported a live bug: non-executive users were unable to add Profiling inputs such as carriers even when they appeared to have access to the screen.

The diagnosis was:

- the screen could be reached through Access Configuration
- the create path still hit old executive-only RLS
- the UI therefore allowed entry but save failed

That bug was a symptom of a wider architectural problem:

- Access Configuration was not actually the sole authority for access
- old departmental and role-based RBAC still existed in multiple layers

The business directive was clear:

- **Access Configuration must be the source of truth for access**

---

## Business Decisions Already Confirmed

These are the decisions already made with Marcus and should be treated as settled unless he explicitly changes them.

### Authority

- Access Configuration should be authoritative for access.
- If Access Configuration says a user can do something, department and rank must not block it.
- Department and role may still exist for workflow orchestration and business-process logic, but not for access authorization.

### Scope of control

Access Configuration should control:

- what pages a user can open
- what actions a user can do
- what records a user can see
- approval rights
- cross-functional access

### Visibility scope

The system should support these explicit visibility levels:

- `own`
- `team`
- `department`
- `selected_departments`
- `all`

Meaning agreed with Marcus:

- `own`: only the user's own records
- `team`: people in my team
- `department`: if I am a manager, this means everyone in the department
- `selected_departments`: explicitly selected departments
- `all`: everything in the company

Additional business constraints:

- `team` only makes sense when the user is effectively set up as a team-based role
- visibility should be configurable explicitly in Access Configuration
- visibility is global per user for now, not per module

### Role/default model

- one default profile per role
- every user must have exactly one profile
- user-level overrides may add or remove access
- executives default to full access
- executive default access must still be overrideable
- explicit deny is allowed

### Workflow

- workflow behavior stays for now
- access and workflow are separate concerns
- Access Configuration decides whether a user may participate
- workflow decides what happens once they are inside

### Profiling

- anyone granted access in Access Configuration should be able to add/edit Profiling inputs
- Profiling permissions should be split by action, not one broad boolean

### Inbox

- Access Configuration decides access to tabs, including Queue
- workflow still decides what messages appear and how the process flows

### Operations / cross-functional work

- users outside the traditional department should be able to access other modules if granted
- if granted `add` / `edit`, they should be able to work there

### Migration preference

- Marcus preferred **correcting access behavior immediately**
- do not preserve hidden blockers just for compatibility
- if Access Configuration says yes, the old hidden rule should not still say no

---

## Target State

When the migration is complete:

1. Every access decision is traceable to Access Configuration.
2. Department and rank no longer silently block access.
3. Executives receive full access through a default profile, not through hardcoded bypass.
4. Executive access can be explicitly reduced.
5. Visibility scope is explicit and configurable.
6. Workflow still works, but is not mistaken for access control.
7. Cross-functional grants work end-to-end.
8. Page-open/save-fail mismatches disappear.
9. Legacy access code paths are removed or neutered.

---

## Canonical Access Contract

### Access evaluation order

All access decisions should resolve in this order:

1. Load the user's assigned role-default profile.
2. Apply user-level explicit allow overrides.
3. Apply user-level explicit deny overrides.
4. Deny beats allow.
5. Resolve record visibility from explicit configured scope.
6. Use workflow rules only for business-process behavior after access is already granted.

### Standard action set

For this migration, the standardized action set remains:

- `view`
- `create`
- `edit`
- `approve`
- `delete`
- `export`

Note:

- the admin/editor language sometimes says `add`
- the runtime permission keys in code use `create`
- this is acceptable for now, but the difference should be remembered during future cleanup

### What is access versus workflow

Access:

- page open
- tab open
- visibility of records
- ability to mutate
- approval rights
- export rights

Workflow:

- who receives a queue item
- what stage a ticket/e-voucher is in
- routing steps
- business-process sequencing

Workflow may still use department/team/role context, but must not override explicit access grants.

---

## Data Model Direction

### Profiles

Profiles are the base access layer.

They should now carry:

- `module_grants`
- `visibility_scope`
- `visibility_departments`

They are role-default baselines, not one-off snapshots.

### Per-user overrides

Overrides are the delta layer on top of an assigned baseline profile.

They should now carry:

- `module_grants`
- `scope`
- `departments`
- `applied_profile_id`

Semantically:

- profile = baseline
- override = explicit differences

### Visibility vocabulary

Canonical values:

- `own`
- `team`
- `department`
- `selected_departments`
- `all`

Legacy values still exist in some compatibility types/helpers only for migration:

- `department_wide`
- `cross_department`
- `full`

These should continue to disappear over time.

---

## Implementation Status Summary

### Broad status

The migration is **not complete**, but the first major slice is implemented.

Approximate status:

- canonical app-side access model: mostly implemented
- visibility model in UI/runtime: mostly implemented
- Profiling frontend slice: implemented
- route/component drift cleanup: started
- SQL helper/policy migration: drafted, not yet applied
- business-record RLS migration: not yet complete
- full legacy RBAC removal: not yet complete

### Practical progress estimate

- around **45-55% of the total migration**
- around **75-80% of the first implementation slice**

---

## The Plan

This is the active implementation plan for the migration.

The plan is split into phases because the system cannot be safely converted in one change without increasing drift or breaking access in inconsistent ways.

### Phase 0: Lock The Contract

Goal:

- define the final authorization contract before broad implementation

Scope:

- source-of-truth decision
- scope vocabulary
- executive behavior
- profile/override model
- workflow versus access separation

Status:

- **done**

What is complete:

- Marcus confirmed the source-of-truth model
- Marcus confirmed the visibility model
- Marcus confirmed the role-default + per-user-override model
- Marcus confirmed that access should override department/rank
- Marcus confirmed that workflow may remain separate

Remaining:

- none for this phase unless business decisions change

### Phase 1: Canonical Access Engine

Goal:

- make the runtime permission resolver use profiles + overrides instead of inherited role/department logic

Scope:

- frontend access resolver
- grant merge semantics
- deny semantics
- role-default profile resolution

Status:

- **mostly done**

What is complete:

- profile and override types extended
- canonical grant utility layer added
- `PermissionProvider` moved onto baseline profile + override logic
- `PermissionsMatrix` moved off inherited permission resolution
- `CreateUserPage` preview moved off inherited permission resolution

What is still incomplete:

- old helper file `permissionsConfig.ts` still exists
- some non-migrated surfaces still indirectly rely on legacy concepts
- SQL-side canonical helper validation is still pending

### Phase 2: Explicit Visibility Model

Goal:

- make record visibility explicit instead of inferred from rank/department

Scope:

- visibility types
- profile visibility
- user override visibility
- scope resolver
- admin editing UI

Status:

- **mostly done in app/runtime**

What is complete:

- canonical visibility vocabulary introduced
- profile types extended with visibility
- override types extended with visibility
- `useDataScope` moved to explicit scope resolution
- `AccessConfiguration` supports visibility editing
- `AccessProfiles` supports visibility editing
- `UserManagement` override screen migrated to canonical scope values

What is still incomplete:

- this visibility model has not yet been fully validated on real DB-backed business records after migration
- broader module-by-module ownership semantics still need testing once more RLS slices are migrated

### Phase 3: Profiling Pilot

Goal:

- fix the originally reported bug and make Profiling the first fully migrated vertical slice

Scope:

- route access
- page access
- create/edit/delete UI
- quick-create comboboxes
- DB write policies
- RLS behavior

Status:

- **partially complete**

What is complete:

- Profiling UI actions now use grants
- quick-create comboboxes now use grants
- canonical SQL migration file contains grant-aware Profiling policies

What is still incomplete:

- SQL migration has not yet been applied
- the original carrier bug has not yet been retested against live migrated RLS
- deny behavior has not yet been validated live

### Phase 4: Route Guard Cleanup

Goal:

- remove route-level hidden blockers from migrated routes

Scope:

- `RouteGuard`
- route declarations in `App.tsx`

Status:

- **started**

What is complete:

- `RouteGuard` now treats explicit `requiredPermission` as authoritative
- Operations create/detail routes migrated
- Finance Overview route migrated

What is still incomplete:

- legacy route fallback still exists for non-migrated routes
- more routes still need to be moved to explicit permission-based guards

### Phase 5: Screen-Level Hidden Blocker Cleanup

Goal:

- remove direct role/department vetoes inside components

Scope:

- Profiling
- Inbox
- Activity Log
- other admin/operational screens

Status:

- **started**

What is complete:

- Profiling page actions migrated
- Profiling quick-create gates migrated
- Inbox queue tab migrated
- Inbox thread assignment gate migrated
- Activity Log migrated

What is still incomplete:

- isolated legacy gates still exist elsewhere in the repo
- not every live access surface has been audited and converted yet

### Phase 6: SQL / RLS Migration

Goal:

- make the database enforce the same model as the frontend

Scope:

- canonical grant-aware SQL helpers
- scope vocabulary migration
- admin/config policies
- Profiling write policies
- later business-record policies

Status:

- **started but not activated**

What is complete:

- migration file `095_access_configuration_source_of_truth.sql` has been written
- scope conversion logic has been defined
- helper functions have been defined
- Profiling/admin grant-aware policies have been drafted

What is still incomplete:

- migration not yet applied
- migration not yet syntax- and behavior-validated against a real DB
- broader business-record policies not yet migrated

### Phase 7: Legacy RBAC Decommissioning

Goal:

- remove or neutralize the old authorization paths once replacement coverage is broad enough

Scope:

- old inherited permission helper
- old route fallback
- old direct role/department checks
- stale role vocabulary in live authorization code

Status:

- **not complete**

What is complete:

- some direct blockers have been replaced in migrated slices

What is still incomplete:

- legacy helper file still exists
- fallback route logic still exists
- some isolated old role logic still exists
- broad DB-side legacy RLS still exists outside migrated areas

---

## Where We Are Right Now

This is the explicit current-state summary.

### What is already true now

- Access Configuration is the effective runtime authority for the migrated app-side slice.
- Profiles and per-user overrides now carry visibility semantics.
- Per-user access editing now supports profile baseline + override behavior.
- Profiling page actions are permission-driven in the frontend.
- Profiling quick-create actions are permission-driven in the frontend.
- Inbox Queue access is permission-driven in the frontend.
- Activity Log access is permission-driven in the frontend.
- Some major routes have already been moved off department/rank gates.
- New users can now be assigned default access profiles and explicit visibility at creation time.

### What is not yet true now

- The SQL migration is not yet active in the database.
- The original carrier failure is not yet proven fixed end-to-end against live migrated RLS.
- Access Configuration is not yet the only access mechanism everywhere in the codebase.
- Business-record RLS is not yet fully migrated.
- Legacy route fallback still exists for non-migrated routes.
- Some isolated legacy role gates still exist outside the migrated slice.

### Current bottom line

The migration has moved from planning into real implementation.

The system is currently in a **controlled transitional state**:

- new model is implemented for the first slice
- old model still exists elsewhere
- DB activation and validation are the next critical step

---

## Explicit Next Steps

This section is intentionally concrete. These are the exact next actions that should happen after this handoff.

### Next Step 1: Apply the SQL migration in dev or staging

Target:

- [095_access_configuration_source_of_truth.sql](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/supabase/migrations/095_access_configuration_source_of_truth.sql)

Required outcome:

- canonical scope values active in DB
- access profile visibility fields active in DB
- grant-aware admin/config helper functions available
- Profiling write policies no longer executive-only

Blocking note:

- until this is done, the frontend/runtime migration is not fully realized

### Next Step 2: Retest the original Profiling carrier bug

Test user setup:

- non-executive user
- grant:
  - `exec_profiling:view`
  - `exec_profiling:create`

Action:

- open Profiling
- add a carrier

Expected result:

- success
- no generic add failure toast

If it fails:

- inspect the migrated RLS helper/policy behavior first

### Next Step 3: Validate deny behavior live

Test user setup:

- executive user
- explicit deny-like override removing Profiling mutation ability

Action:

- open Profiling
- attempt create/edit/delete

Expected result:

- denied behavior respected

### Next Step 4: Validate visibility scope live

Minimum scenarios:

- own
- team
- department
- selected_departments
- all

Recommended first target module after SQL activation:

- one business-record area with clear ownership semantics

### Next Step 5: Audit and migrate remaining live route blockers

Priority:

- any route still depending on `allowedDepartments`
- any route still depending on `requireMinRole`

Goal:

- reduce the fallback path footprint

### Next Step 6: Audit and migrate remaining live screen blockers

Priority:

- direct role/department gates in active components
- isolated executive/manager-only UI conditions not yet replaced

Goal:

- prevent hidden contradictions between Access Configuration and UI behavior

### Next Step 7: Start the next business-record RLS slice

Recommended order:

1. contacts / customers / tasks
2. quotations / bookings
3. approvals / finance

Goal:

- carry the same explicit permission + explicit scope model into business data

### Next Step 8: Remove legacy fallback only when enough coverage exists

Do not remove too early.

Remove when:

- most important routes are migrated
- most important component gates are migrated
- at least one major business-record RLS slice beyond Profiling is proven

---

## Exact Deliverables Still Needed

These are the concrete outputs that still need to exist before the migration can be called successful.

### Deliverable A: Applied and verified SQL migration

Not just written.

Need:

- applied in dev/staging
- validated
- any defects corrected

### Deliverable B: Confirmed fix for original carrier bug

Need:

- reproduced before
- verified fixed after

### Deliverable C: Confirmed executive-deny behavior

Need:

- proof that executive default access is overrideable

### Deliverable D: Validated visibility behavior on real business records

Need:

- evidence for each scope level

### Deliverable E: Further route/component legacy blocker reduction

Need:

- fewer live role/department blockers outside the migrated slice

### Deliverable F: Next business-record migration slice

Need:

- at least one major non-Profiling business domain converted

---

## If Claude Takes Over: Immediate Work Order

This is the recommended exact handoff work order for Claude.

1. Read this document fully.
2. Inspect the SQL migration file.
3. Apply the migration in dev/staging.
4. Test the original carrier case.
5. Fix any SQL/RLS defects revealed by that test.
6. Test executive explicit deny on Profiling.
7. Audit remaining route fallback usage.
8. Audit remaining component-level access blockers.
9. Start the next RLS migration slice with contacts/customers/tasks.
10. Keep this document updated with phase status as work continues.

---

## What Has Already Been Implemented

This section lists the concrete work already completed in the repo.

### 1. Access profile and override types extended

File:

- [accessProfileTypes.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessProfileTypes.ts)

Implemented:

- added canonical `VisibilityScope`
- extended access profile types with:
  - `visibility_scope`
  - `visibility_departments`
- extended override summary types to include scope/departments
- preserved temporary legacy scope unions for compatibility while migrating

Why it matters:

- the app now has a typed concept of explicit visibility

---

### 2. Canonical grant utilities added

File:

- [accessGrantUtils.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessGrantUtils.ts)

Implemented:

- `mergeGrantLayers`
- `deriveGrantOverrides`
- `roleDefaultVisibilityScope`
- `normalizeLegacyVisibilityScope`
- `resolveProfileVisibilityScope`
- `chooseRoleDefaultProfile`

Why it matters:

- this is the shared utility layer that normalizes profile + override behavior
- it removes several old assumptions around profile application being a one-time snapshot

---

### 3. Grant utility tests added

File:

- [accessGrantUtils.test.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessGrantUtils.test.ts)

Implemented:

- tests for:
  - grant merge behavior
  - override derivation
  - role-default visibility
  - legacy scope normalization
  - role-default profile selection

Why it matters:

- this is the first regression protection for the new model

Validation run:

- `npm run test -- src/components/admin/accessProfiles/accessGrantUtils.test.ts`
- passed

---

### 4. PermissionProvider no longer relies on inherited department/role baseline

File:

- [PermissionProvider.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/context/PermissionProvider.tsx)

Implemented:

- removed old inherited permission fallback as the active runtime authority
- now loads:
  - active access profiles
  - current user's `permission_overrides`
  - related applied profile
- chooses a baseline profile via:
  - explicit assigned profile
  - or role default profile
- merges baseline grants with explicit overrides
- `can(...)` now resolves against the merged result

Why it matters:

- the runtime `can()` helper is now anchored in Access Configuration rather than old inherited role/department behavior

Limitations:

- this is app-side only until SQL policies are fully migrated

---

### 5. Permission editor behavior updated for explicit deny

File:

- [PermissionGrantEditor.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/PermissionGrantEditor.tsx)

Implemented:

- profile-mode editing now preserves explicit `false` values
- user and profile editors can now store negative overrides instead of assuming deletion means reset

Why it matters:

- explicit deny is part of the agreed contract

---

### 6. Access Configuration refactored to baseline-plus-delta semantics

File:

- [AccessConfiguration.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/AccessConfiguration.tsx)

Implemented:

- loads active profiles with visibility metadata
- resolves a baseline profile from assigned profile or role default
- stores user-level `module_grants` as deltas instead of snapshot replacement
- preserves `applied_profile_id`
- tracks:
  - applied profile
  - resolved scope
  - resolved departments
- save path now writes:
  - `module_grants`
  - `applied_profile_id`
  - `scope`
  - `departments`
- dirty-state now accounts for:
  - grants
  - applied profile changes
  - visibility scope changes
  - selected departments changes
- added inline visibility editor UI
- added validation for selected-department scope
- `Save as Profile` now stores visibility as well as grants

Why it matters:

- this is the main per-user Access Configuration screen
- it now matches the target model much more closely

Important nuance:

- this screen now treats the assigned profile as the baseline and stores only the user-specific delta

---

### 7. Access Profiles editor updated to support visibility

File:

- [AccessProfiles.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/AccessProfiles.tsx)

Implemented:

- profile query now includes visibility fields
- profile application writes visibility into user overrides
- profile editor now supports:
  - `visibility_scope`
  - `visibility_departments`
- profile dirty-state includes visibility changes
- profile save path now persists visibility
- profile editor baseline preview now resolves using role-default profile lookup

Why it matters:

- role-default profiles are now real carriers of visibility, not just grants

---

### 8. Create User flow updated to assign default profile and preview against the new model

Files:

- [CreateUserPage.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/CreateUserPage.tsx)
- [create-user/index.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/supabase/functions/create-user/index.ts)

Implemented in UI:

- profile queries now include visibility
- access preview now resolves from role-default profile + selected profile grants instead of old inherited permission helper

Implemented in edge function:

- removed hardcoded executive bypass for user creation authorization
- authorization now checks admin-user grant logic
- auto-selects default role profile when explicit profile is not provided
- upserts `permission_overrides` for new users with:
  - `scope`
  - `departments`
  - `module_grants`
  - `applied_profile_id`

Why it matters:

- new users now start inside the new profile-based access model instead of relying on accidental legacy fallbacks

---

### 9. User Management override editor migrated to canonical scope vocabulary

File:

- [UserManagement.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/UserManagement.tsx)

Implemented:

- override scope type changed from:
  - `department_wide`
  - `cross_department`
  - `full`
- to:
  - `own`
  - `team`
  - `department`
  - `selected_departments`
  - `all`
- UI labels updated
- save logic updated
- selected-department conditional updated

Why it matters:

- without this, the old admin override screen would still write invalid scope values after the DB constraint change

---

### 10. Permissions Matrix migrated to new baseline model

File:

- [PermissionsMatrix.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/PermissionsMatrix.tsx)

Implemented:

- no longer resolves cells using `getEffectivePermission(...)`
- now loads:
  - active profiles
  - current override row
- resolves baseline profile
- merges baseline grants with explicit override grants
- toggles now generate delta overrides using `deriveGrantOverrides(...)`

Why it matters:

- this old matrix screen no longer depends on the legacy inherited permission engine

Residual note:

- it still writes only `module_grants`, which is fine because it is a grant matrix screen rather than a full scope editor

---

### 11. Profiling page actions moved to Access Configuration

File:

- [ProfileSection.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/profiling/ProfileSection.tsx)

Implemented:

- uses `usePermission()`
- computes:
  - create permission
  - edit permission
  - delete permission
- blocks action handlers when the user lacks the required grant
- hides or disables action controls accordingly

Why it matters:

- the Profiling UI no longer assumes that anyone who can open the page can also mutate records

---

### 12. Profiling quick-create comboboxes moved off stale manager/director logic

Files:

- [ProfileLookupCombobox.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/shared/profiles/ProfileLookupCombobox.tsx)
- [ProfileMultiLookupCombobox.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/shared/profiles/ProfileMultiLookupCombobox.tsx)

Implemented:

- removed stale privilege helper using old role vocabulary
- quick-create now depends on:
  - combobox support
  - registry support
  - `can("exec_profiling", "create")`

Why it matters:

- the Profiling quick-create path now follows Access Configuration on the frontend

---

### 13. RouteGuard semantics changed for migrated routes

File:

- [RouteGuard.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/RouteGuard.tsx)

Implemented:

- if a route declares `requiredPermission`, that permission is now authoritative
- old `allowedDepartments` / `requireMinRole` are only used for non-migrated routes

Why it matters:

- migrated routes are no longer silently vetoed by department/rank

Important caveat:

- the fallback legacy route behavior still exists for routes that have not yet been migrated

---

### 14. Operations create/detail and Finance Overview routes moved to permission-only guards

File:

- [App.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/App.tsx)

Implemented:

- `/operations/create` now uses `ops_bookings:create`
- `/operations/:bookingId` now uses `ops_bookings:view`
- `/accounting/financials` no longer has the extra manager gate and now relies on `acct_financials:view`

Why it matters:

- these routes now align with the source-of-truth model

---

### 15. Visibility engine refactored away from role/department authorization inference

File:

- [useDataScope.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/hooks/useDataScope.ts)

Implemented:

- loads the current override row plus related profile
- resolves explicit scope from:
  - override
  - else applied profile
  - else role default scope
- supports:
  - `own`
  - `team`
  - `department`
  - `selected_departments`
  - `all`
- team and department are now inputs to scope resolution, not direct access authorities
- removed hardcoded department-wide/functional visibility tables as the main access source

Why it matters:

- record visibility is now explicit instead of inferred from old privilege ladders

Important note:

- a compatibility check for `BLOCK_HIGHER_RANK_VISIBILITY_GRANT` still exists and is intentional

---

### 16. Inbox queue gating moved to Access Configuration

Files:

- [useInbox.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/hooks/useInbox.ts)
- [ThreadListPanel.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/inbox/ThreadListPanel.tsx)
- [ThreadDetailPanel.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/inbox/ThreadDetailPanel.tsx)

Implemented:

- queue access now uses `can("inbox_queue_tab", "view")`
- removed manager/director shortcut logic in queue visibility
- thread assignment gate now uses the queue permission instead of role shortcuts
- fallback RPC role input changed away from stale `rep`

Why it matters:

- Inbox queue is now aligned with Access Configuration for access
- workflow still governs what messages appear

---

### 17. Activity Log moved to Access Configuration

File:

- [ActivityLogPage.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/ActivityLogPage.tsx)

Implemented:

- access now uses `can("exec_activity_log", "view")`
- export button now uses `can("exec_activity_log", "export")`
- removed manager/director and executive hardcoded gate behavior
- department filter is now a normal filter rather than an executive-only concept in the screen

Why it matters:

- this removes another high-visibility hidden blocker from the UI layer

---

### 18. SQL migration scaffold added

File:

- [095_access_configuration_source_of_truth.sql](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/supabase/migrations/095_access_configuration_source_of_truth.sql)

Implemented in the migration file:

- adds `visibility_scope` and `visibility_departments` to `access_profiles`
- converts existing `permission_overrides.scope` values:
  - `department_wide -> department`
  - `cross_department -> selected_departments`
  - `full -> all`
- replaces scope check constraints
- adds security-definer helper functions for:
  - current user's effective grant by key
  - current user's permission by module/action
  - admin-management permission checks
- replaces executive-only admin/config table policies with grant-based policies
- adds grant-aware Profiling write policies for Profiling-related tables

Why it matters:

- this is the database-side foundation required to eliminate page-open/save-fail mismatches

Critical status note:

- **this migration has been written but not yet applied and validated against a live database in this work session**

This is the single most important next step.

---

## Validation Already Performed

The following validation was executed locally:

### Tests

Command:

```bash
npm run test -- src/components/admin/accessProfiles/accessGrantUtils.test.ts
```

Result:

- passed

### Build

Command:

```bash
npm run build
```

Result:

- passed

Known existing build warning unrelated to this migration:

- `src/components/Pricing.tsx` contains a `??` expression that always returns the left operand

Known existing bundle warnings:

- large chunk warnings from Vite

These are not blockers for this migration.

---

## What Has Not Been Done Yet

This is the most important section for the next engineer.

### 1. SQL migration not yet applied

Status:

- drafted
- not executed against dev/staging DB from this session
- not yet verified with live RLS behavior

Impact:

- frontend/runtime changes alone do not complete the source-of-truth transition
- the original carrier bug is only fully resolved once the DB policies are confirmed

---

### 2. Profiling end-to-end not yet validated against real RLS

Still required:

- test non-executive with Profiling create/edit permissions
- verify carrier creation succeeds
- verify deny behavior works
- verify view-only users cannot mutate

---

### 3. Legacy route fallback still exists

File:

- [RouteGuard.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/RouteGuard.tsx)

Status:

- migrated routes using `requiredPermission` are good
- non-migrated routes still use legacy department/rank fallback

Meaning:

- the app is in a transitional mixed state by design
- more routes still need migration before the fallback can be removed

---

### 4. Legacy access helper still exists

File:

- [permissionsConfig.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/permissionsConfig.ts)

Status:

- no longer the primary runtime authority in the migrated slice
- still exists in the repo
- still contains inherited permission logic

Meaning:

- this file is still a legacy dependency surface
- it should eventually become either:
  - a thin type/metadata file only
  - or be fully retired

---

### 5. Remaining isolated live legacy checks still exist

Examples already identified:

- [QuotationFileView.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/pricing/QuotationFileView.tsx)
- [ExecutiveDashboard.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/ExecutiveDashboard.tsx)

Status:

- not part of the first migration slice
- still need review and conversion

---

### 6. Business-record RLS is not fully migrated

Still outstanding:

- contacts
- customers
- tasks
- quotations
- bookings
- finance / approvals
- other business tables still using old department/role authorization in SQL

Meaning:

- the current work is a foundation and first slice, not the full RBAC replacement

---

### 7. Access Configuration is not yet the only thing left in the codebase

There is still a mixed model.

Current true state:

- Access Configuration is now primary in the migrated runtime slice
- old logic still exists elsewhere in the system

Do not misinterpret the current implementation as fully finished.

---

## Immediate Next Steps

These are the recommended next actions, in order.

### Step 1: Apply the SQL migration in dev/staging

Target file:

- [095_access_configuration_source_of_truth.sql](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/supabase/migrations/095_access_configuration_source_of_truth.sql)

Goal:

- activate the DB-side contract for:
  - scope conversion
  - access profile visibility fields
  - grant-aware helper functions
  - grant-aware Profiling/admin RLS

Required caution:

- verify the migration path carefully before production
- pay special attention to existing `permission_overrides.scope` values

---

### Step 2: Validate the original carrier bug end-to-end

Manual QA scenario:

1. Use a non-executive test account.
2. Assign a profile or override granting:
   - `exec_profiling:view`
   - `exec_profiling:create`
3. Open `/admin/profiling`.
4. Add a carrier.
5. Confirm save succeeds.
6. Repeat for another Profiling entity if needed.

Expected result:

- no generic "Couldn't add the carrier" failure

---

### Step 3: Validate deny behavior

Manual QA scenario:

1. Use an executive test account.
2. Apply explicit deny-style overrides removing Profiling mutation ability.
3. Open Profiling.
4. Confirm create/edit/delete are not available or fail cleanly under the new model.

Expected result:

- executive default access can be reduced

---

### Step 4: Validate visibility behavior

Manual QA scenarios:

- `own` scope user sees only own records
- `team` scope user sees team records
- `department` scope user sees department records
- `selected_departments` scope user sees records from chosen departments
- `all` scope user sees company-wide records

This should be tested on at least one real business-record module after the next RLS slice begins.

---

### Step 5: Finish the next route/component cleanup tranche

Recommended targets:

- remaining live route fallbacks
- remaining direct role/department access gates
- remaining inbox-related live auth shortcuts
- isolated admin or executive shortcuts

Goal:

- reduce the number of places where the old model can still contradict the new one

---

### Step 6: Migrate the next business-record vertical slice

Recommended next domain:

- contacts / customers / tasks

Why:

- high visibility
- broad ownership/scope behavior
- good testbed for explicit record visibility

After that:

- quotations / bookings
- approvals / finance

---

## Recommended Execution Order From Here

Recommended sequence:

1. Apply SQL migration in dev/staging
2. Validate Profiling end-to-end
3. Fix any SQL/RLS issues revealed by testing
4. Finish remaining obvious route/component blockers
5. Migrate contacts/customers/tasks
6. Migrate quotations/bookings
7. Migrate approvals/finance
8. Remove legacy fallback code when coverage is broad enough

This order is recommended because:

- it proves the architecture with the original reported bug first
- it avoids broadening the migration before the DB side is proven
- it keeps the highest-visibility business problem in focus

---

## Manual QA Checklist

This is the minimum recommended QA matrix.

### Access Configuration core

- create/edit a role-default profile
- set visibility scope on a profile
- assign profile to a user
- add explicit user override grants
- add explicit user deny-style overrides
- save and reload
- confirm state persists

### Create User flow

- create a new user without manually selecting a profile
- verify role-default profile resolution
- verify `permission_overrides` row is created with scope/applied profile

### Profiling

- non-executive with view only
- non-executive with view + create
- non-executive with view + edit
- non-executive with view + delete
- executive with explicit deny

### Inbox

- user with `inbox:view` but without queue grant
- user with `inbox_queue_tab:view`
- verify queue tab access and assignment UI behavior
- verify workflow contents still populate normally

### Activity Log

- user with `exec_activity_log:view`
- user without it
- user with `view` but without `export`
- user with `view` and `export`

### Operations routes

- user outside Operations with `ops_bookings:view`
- user outside Operations with `ops_bookings:create`

### Visibility

- own
- team
- department
- selected_departments
- all

---

## Risks

### 1. SQL not matching UI/runtime

If SQL lags behind the frontend:

- users can still get page-open/save-fail behavior

This is the highest current risk.

### 2. Partial migration drift

If new slices are added without removing old blockers in that same slice:

- hidden contradictions remain

Rule:

- each migrated slice should be internally coherent

### 3. Legacy helper reuse

If engineers continue to reach for `permissionsConfig.ts` inherited logic:

- the old model will continue to leak back in

Rule:

- prefer the canonical profile/override resolver and `can(...)`

### 4. Visibility semantics across modules

Different modules have different ownership models.

Examples:

- created by
- assigned to
- record owner
- department-assigned

This means:

- scope migration for each business domain must be deliberate

---

## Non-Negotiable Constraints

These should be preserved during all future work.

1. Access Configuration must be the access authority.
2. Department/rank must not veto configured access.
3. Workflow logic may remain, but as workflow logic.
4. Executives get full access through profiles, not magic hardcoded bypass.
5. Executive access must remain overrideable.
6. Visibility must stay explicit.
7. One user, one profile, plus overrides.
8. Profiling is not done until the DB side is proven.

---

## Remaining Legacy Signals Still Expected In The Repo

Seeing these does not automatically mean a bug, but each one should be treated as suspicious until confirmed:

- `getInheritedPermission`
- `getEffectivePermission`
- `allowedDepartments`
- `requireMinRole`
- old scope values:
  - `department_wide`
  - `cross_department`
  - `full`
- stale role strings:
  - `director`
  - `rep`
  - legacy executive promotion logic

Some of these still exist intentionally during transition. The important question is whether they are still live in access decisions for the slice being migrated.

---

## Modified Files In This Work Session

Tracked modified files:

- [App.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/App.tsx)
- [ActivityLogPage.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/ActivityLogPage.tsx)
- [RouteGuard.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/RouteGuard.tsx)
- [AccessConfiguration.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/AccessConfiguration.tsx)
- [CreateUserPage.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/CreateUserPage.tsx)
- [PermissionsMatrix.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/PermissionsMatrix.tsx)
- [UserManagement.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/UserManagement.tsx)
- [AccessProfiles.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/AccessProfiles.tsx)
- [PermissionGrantEditor.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/PermissionGrantEditor.tsx)
- [accessGrantUtils.test.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessGrantUtils.test.ts)
- [accessGrantUtils.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessGrantUtils.ts)
- [accessProfileTypes.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/accessProfiles/accessProfileTypes.ts)
- [ProfileSection.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/admin/profiling/ProfileSection.tsx)
- [ThreadDetailPanel.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/inbox/ThreadDetailPanel.tsx)
- [ThreadListPanel.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/inbox/ThreadListPanel.tsx)
- [ProfileLookupCombobox.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/shared/profiles/ProfileLookupCombobox.tsx)
- [ProfileMultiLookupCombobox.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/components/shared/profiles/ProfileMultiLookupCombobox.tsx)
- [PermissionProvider.tsx](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/context/PermissionProvider.tsx)
- [useDataScope.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/hooks/useDataScope.ts)
- [useInbox.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/hooks/useInbox.ts)
- [create-user/index.ts](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/supabase/functions/create-user/index.ts)

Untracked migration file:

- [095_access_configuration_source_of_truth.sql](/C:/Users/Marcus/Documents/Neuron%20Development/NeuronosPrototype/src/supabase/migrations/095_access_configuration_source_of_truth.sql)

Untracked logs currently in repo root and safe to ignore for this migration:

- `build-serve.err.log`
- `build-serve.out.log`
- `debug-dev.err.log`
- `debug-dev.out.log`
- `vite-audit.err.log`
- `vite-audit.out.log`
- `vite-inquiry-flow.err.log`
- `vite-inquiry-flow.out.log`
- `vite-qa.err.log`
- `vite-qa.out.log`

---

## Suggested Short Handoff To Claude

If someone needs a concise verbal handoff, use this:

> We are migrating Neuron OS so Access Configuration becomes the only source of truth for access. The app-side resolver, visibility model, admin profile/override editors, Profiling UI gates, Inbox queue gates, Activity Log gates, and several route guards have already been moved onto the new model. A SQL migration exists but has not yet been applied or validated. The immediate next step is to apply the migration in dev/staging and test the original Profiling carrier bug end-to-end with a non-executive granted Profiling create access. After that, continue removing remaining legacy route/component blockers and migrate the next business-record RLS slice.

---

## Definition Of Done

This migration is done only when all of the following are true:

- every access decision is traceable to Access Configuration
- department and rank no longer silently veto access
- executives can be restricted explicitly
- non-executives can be granted cross-functional access and succeed end-to-end
- visibility follows explicit configured scope
- workflow still functions without acting as access control
- no page-open/save-fail permission mismatches remain
- old hidden access blockers are removed from active authorization logic

---

## Final Note

Do not treat the current state as "cleanup only."

The architecture has been materially changed, but the migration is still active. The next engineer should assume:

- the contract is decided
- the direction is correct
- the first implementation slice is real
- the database validation step is now critical
- the remaining work should proceed module-by-module with the same discipline
