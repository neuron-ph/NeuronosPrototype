# NEU-019 — Write-Gate Completion Initiative

> **Status:** PHASE 0 COMPLETE (D1–D7 decided 2026-06-06) — awaiting "Go Ahead" for Phase 1
> **Supersedes:** NEU-018 (participation surfaces sweep — absorbed as Phase 3)
> **Prerequisite for:** NEU-012 step 11 (prod release). Prod does not ship while Tier 1 is open.

---

## 1. The Principle (one sentence, non-negotiable)

**Every user-triggerable database write is controlled by exactly one knob, the knob matches the action, and no write ships ungated — the census is the ground truth, not the permission grid.**

Expanded into the Five Laws. Every change in this initiative must satisfy all five; any violation is a defect, not a judgment call:

| # | Law | Meaning |
|---|---|---|
| L1 | **Census is truth** | The work item list comes from the mutation census (497 traced write sites), bottom-up from the writes themselves. A work item is DONE only when its census verdict flips to GATED, NON-USER (documented), or DELETED. Never "looks fine now." |
| L2 | **Action fidelity** | `delete` behind `:delete`, `edit` behind `:edit`, `create` behind `:create`, `approve` behind `:approve`. Never an adjacent knob (no deletes behind edit, no writes behind export, no record writes behind a different module's grant). |
| L3 | **Blast radius before gate** | Before any gate lands, run SQL on dev (1:1 prod mirror) over `access_profiles.module_grants` + overrides: who holds the target knob today, who loses the affordance. Surface the numbers in the work log BEFORE the commit. No silent lockouts. |
| L4 | **Knob ↔ effect symmetry** | Every new gate gets its `actionApplicability.ts` entry un-dashed; every new knob gets a consuming gate. New ModuleIds get: schema node + applicability entry + grant-seeding migration + guard coverage. No decorative knobs, no knobless gates. |
| L5 | **Verify or it didn't happen** | Each batch: `npm run rbac:guard` clean, affected tests pass, tsc on touched files shows no NEW errors (782 pre-existing debt baseline), and the census row is re-traced by reading the actual code path. Then commit — one batch, one commit, Marcus reviews. |

Anti-shortcut clauses:
- **No drive-by fixes.** Only census rows in the current batch may be touched (Karpathy §3).
- **Dead code is deleted, never gated.** Gating unreachable code launders risk; deleting removes it.
- **Exceptions are written, not assumed.** Anything left intentionally ungated (e.g. inbox compose) gets an entry in §6 with Marcus's explicit sign-off — otherwise it is OPEN.
- **No batch starts while the previous batch is unreviewed**, unless Marcus says pipeline them.

---

## 2. Definition of Done

1. The ledger (§5) has **zero OPEN rows** — every row GATED / NON-USER / EXCEPTION / DELETED.
2. Re-census (Phase 6) over `src/` finds **zero unaccounted write sites**.
3. `rbac:guard` enforces the ratchet (§7) so a future ungated write fails CI/static checks.
4. `RBAC_COMPLIANCE_LEDGER.md` updated; NEU-019 marked done in TICKETS.md (by Marcus's hand or with his sign-off).

---

## 3. Phase Plan

| Phase | Scope | Items | Gate count rationale |
|---|---|---|---|
| **0. Decisions** | Marcus decides the Decision Register (§4). Nothing in Phases 1–5 that depends on an undecided item may start. | D1–D7 | Decisions first so no batch stalls mid-flight |
| **1. Escalations** | Tier 1: WG-01…WG-05. Permission self-escalation, cross-module writes, bank-details overwrite, user suspension. | 5 | Highest risk; smallest diffs; existing knobs mostly suffice |
| **2. Lifecycles** | Tier 2: WG-06…WG-13. InvoiceBuilder, calendar, GL posting/reversal/resolution, booking list delete/create/draft, teams CRUD, acct customers, vendors, templates. | 8 | Whole ungated flows; some need new knobs (depends on D2–D4) |
| **3. Participation surfaces** | Tier 3: WG-14…WG-19. Comments ×11 surfaces, attachments ×5, TaskDetailInline, ActivityDetailInline, inbox per D1. New tab knobs + seeding migration. | 6 families | The original NEU-018; needs new ModuleIds + grant seeding (D5) |
| **4. Mismatches** | Tier 4: WG-20…WG-32. Wrong-knob/wrong-action fixes. | 13 | Mostly one-line gate corrections; L3 blast-radius critical here (these CAN lock people out) |
| **5. Dead code** | WG-D1…WG-D16 deletions (per D6). | 16 files | Remove ungated mutations entirely |
| **6. Re-census** | Re-run the 8-cluster mutation trace; diff against ledger; flip remaining verdicts or open new rows. | — | L1: done means re-verified, not remembered |
| **7. Ratchet + release** | Guard ratchet (§7); fold into NEU-012 step 11 runbook. | — | Keep it closed forever |

**Batch protocol (every batch in Phases 1–5):**
1. Read the census row(s) + current code path.
2. L3 blast-radius SQL on dev → record numbers.
3. Implement gate (or deletion). Match existing gate idioms (`can()`, `canKey` OR-gates, prop threading).
4. L4 applicability flip + schema/seeding if new knob.
5. L5 verification suite.
6. Commit `fix(rbac): NEU-019 <phase>.<n> — <surface>` with blast-radius note in body. Await review.

---

## 4. Decision Register — DECIDED by Marcus, 2026-06-06

| ID | Decision | Marcus's call |
|---|---|---|
| D1 | **Inbox "view = participate"** | **Gate behind inbox knobs.** Compose/reply/Cc → `inbox:create`; status changes/approvals → `inbox:edit`. No exception. WG-03 record writes additionally require the record-module edit grant. Blast-radius seeding: mirror current participation (every active inbox user gets `inbox:create`; current status-actors get `inbox:edit`) so day one changes nothing — but it's now revocable. |
| D2 | **Calendar knob** | **New `calendar` module + ownership.** view/create/edit/delete knobs; edit/delete additionally scoped to events you created. |
| D3 | **Accounting customers** | **Make the surface read-only.** Strip Add Customer + Delete from AccountingCustomers — customer management belongs to BD. |
| D4 | **Company settings knob** | **New `company_settings` knob** (Executive/Admin area): schema node + applicability + seeding. PDF "Save as company default" gates on its `edit`. |
| D5 | **Grant seeding for new write keys** | **Mirror current reality.** `create` keys → current tab-`view` holders (no one loses what they can do today); attachments `delete` → mirror legacy delete holders (10–11 users, the tighter original intent). |
| D6 | **Dead code** | **Delete, but show the list first.** Per-file zero-reference proof presented before each deletion batch lands. |
| D7 | **Personal-scope writes** | **Blanket exception** — writes scoped to the user's own rows need no knob. Signed into §6. |

---

## 5. The Ledger (work items — census-derived)

Status: `OPEN` → `GATED` / `EXCEPTION` / `DELETED` / `NON-USER`. Verdict flips only via batch protocol.

### Tier 1 — Escalations (Phase 1)

| ID | Surface & writes | Target | Status |
|---|---|---|---|
| WG-01 | `AccessConfiguration.tsx` — access_profiles insert/update/delete, permission_overrides insert/update, users.access_profile_id (5 user-facing sites) | save/apply behind `admin_users_tab:edit`; profile CRUD behind `admin_access_profiles_tab:create/edit/delete` | **GATED** (`7e22654`, blast: 14/14 keep save, delete 14→10) |
| WG-02 | `AccessProfiles.tsx` — profile CRUD + Apply-to-users (3 sites) | `admin_access_profiles_tab:create/edit/delete`; Apply behind `:edit` | **GATED** (`c310a98`, blast: 0 lockouts, delete −4) |
| WG-03 | Inbox resolution → `workflowTickets.ts` quotations.update / bookings.update | `RESOLUTION_ACTION_GRANTS` map + `canExecuteResolutionAction()` at all 3 ThreadDetailPanel sites; ticket completes, skipped write surfaced | **GATED** (`f8353fe`, blast: Pricing 8/8, Acct 8/11 graceful) |
| WG-04 | `useCompanySettings` upsert from QuotationPDFScreen + InvoicePDFScreen | NEW `company_settings` knob (tab under Executive→Profiling, edit-only); migration 168 seeds exec_profiling:edit holders | **GATED** (`e0e54d0`, 16 seeded, applied to dev) |
| WG-05 | `UserDetailPage` status pills → `admin-user-actions updateStatus` | `exec_users:edit \| admin_users_tab:edit`; read-only status display otherwise | **GATED** (`2f4dfd5`, blast: 14/14) |

### Tier 2 — Ungated lifecycles (Phase 2)

| ID | Surface & writes | Target | Status |
|---|---|---|---|
| WG-06 | `InvoiceBuilder.tsx` — 10 sites: draft create, lines→invoiced, finalize (+JE), delete draft, void (+reversing JE) | Invoice-write OR-gate in builder + UnifiedInvoicesTab; delete-class accounting-only; migration 169 seeded acct invoice-tab create/edit (8-user lockout caught by L3) | **GATED** (`39a17f1`, 2 ops-tab-only Acct viewers stay read-only — curation flag) |
| WG-07 | Calendar — `useCalendarEvents` insert/update/delete/drag; `isReadOnly` hardcoded false; no ownership filter | NEW `calendar` module; ownership enforced in the write queries (`.eq(created_by)`); sidebar Personal section view-gated; migration 170 seeds all profiles | **GATED** (`dc766ea`, 60/60 seeded) |
| WG-08 | GL posting / invoice reversal / collection resolution sheets | Post-to-GL: `acct_journal:create\|edit` (matches General Journal); reversal: invoice OR-gate; resolution: collections OR-gate; backstops ×4 | **GATED** (`ac31c58`) |
| WG-09 | Booking list pages ×5 — row-trash hard delete; empty-state create; draft-row resume | `ops_<svc>:delete` / `:create` / `:create\|edit`; delete keys already curated (10–22 holders/svc) | **GATED** (`4973e2d`) |
| WG-10 | Teams CRUD — `UserManagement` TeamsTab + `OperationsTeamsSection` | `admin_teams_tab:create/edit/delete` + backstops | **GATED** (`6795498`, 14/14 keep create/edit, delete →10) |
| WG-11 | `AccountingCustomers.tsx` — customers insert/delete | Read-only per D3 — affordances, handlers, kebab column removed (−136 lines) | **DONE** (`d04da0b`) |
| WG-12 | Vendors/network partners — `useNetworkPartners`, NetworkPartnersModule, VendorDetail, builder Save & Import | `pricing_network_partners:create/edit/delete` (knob existed); hook-level mutation gates | **GATED** (`406cbe7`, 17/17 writers keep, delete 8→2) |
| WG-13 | Category templates CRUD — Templates tab + builder SaveAsTemplateInline | `acct_catalog:create/edit/delete` | **GATED** (`56db974`) |

### Tier 3 — Participation surfaces (Phase 3, ex-NEU-018)

| ID | Surface & writes | Target | Status |
|---|---|---|---|
| WG-14 | `CommentsTab` post+attach — 5 surfaces | `canPost` prop (default false) threaded as `can(ids.comments,"create")` ×5; seeded view→create | **GATED** (Phase 3 commit) |
| WG-15 | `BookingCommentsTab` — 6 surfaces, not even view-gated | self-gated on `ops_bookings_comments_tab:create` (knob existed, unconsumed); tab buttons view-gated on all 6 parents | **GATED** (Phase 3 commit) |
| WG-16 | `EntityAttachmentsTab` upload+delete — 5 surfaces; quotations had no ModuleId | `canUpload`/`canDelete` props (default false) ×5; NEW `pricing_quotations_attachments_tab` (view/create seeded to both lens audiences, delete = nobody); legacy delete holders (10) untouched | **GATED** (Phase 3 commit) |
| WG-17 | `TaskDetailInline` — auto-save/upload/complete/delete, both paths | `canEdit`/`canDelete` props: `bd_tasks` (BD view), `ids.tasks` (CustomerDetail); seeded view→edit+delete | **GATED** (Phase 3 commit) |
| WG-18 | `ActivityDetailInline` — delete/upload, both paths | same pattern via `bd_activities` / `ids.activities` | **GATED** (Phase 3 commit) |
| WG-19 | Inbox compose/reply/Cc/status/approve (identity-only) | D1: compose/reply/Cc → `inbox:create` (button/empty-state/C-hotkey/send backstops); status/approve/reopen/close → `inbox:edit` AND identity; seeded to all 56 inbox:view holders | **GATED** (Phase 3 commit) |

### Tier 4 — Wrong-knob mismatches (Phase 4)

| ID | Surface | Fix | Status |
|---|---|---|---|
| WG-20 | `CustomersListWithFilters` delete behind `bd_customers:edit` | use `:delete` | OPEN |
| WG-21 | `BookingCancelDeletePanel` — edit grant can delete; delete grant can cancel | per-action checks inside panel | OPEN |
| WG-22 | `MemoPanel` delete behind `exec_memos:create` | use `:delete` | OPEN |
| WG-23 | `CollectionCreatorPanel` deletes invoices under collections grant | add invoice-write check | OPEN |
| WG-24 | PDF Studio save behind `export` knob | add edit-class gate for the write | OPEN |
| WG-25 | "Amend" button (GeneralDetailsSection) — view→full edit on quotations/projects/contracts | gate Amend behind the lens edit knob | OPEN |
| WG-26 | `ContractDetailView` Activate + ContractStatusSelector ungated | `pricing_contracts:edit` (mirror QuotationFileView twins); pass `readOnly` | OPEN |
| WG-27 | `ProjectDetail` ProjectStatusSelector ungated | pass `readOnly={!can(bd_projects\|pricing_projects, "edit")}` | OPEN |
| WG-28 | StatusChangeButton "Mark as Expired" no can() | same `canActAsBD/Pricing` as siblings | OPEN |
| WG-29 | Builder catalog backfills without `acct_catalog:create` (QuotationBuilderV3:1107, catalogSync via VendorsSection) | gate or degrade to select-only | OPEN |
| WG-30 | `EVouchersContent` "New E-Voucher" ungated; `autoApprove` skips approve knob | `acct_evouchers:create`; autoApprove requires approve grant | OPEN |
| WG-31 | EV submit/cancel/liquidation, RequestBillingButton, CustomerAssignmentProfilesSection edit/remove — ownership/status-only | add knob checks (assignment profiles: `*_teams_tab:edit` to match Add) | OPEN |
| WG-32 | Booking create panels: draft-edit checked vs `create`; cross-module OR (`/operations/create`, ProjectServiceCard) | draft resume → `:edit`; per-service check at service selection | OPEN |

### Dead code (Phase 5, per D6)

| ID | File(s) | Status |
|---|---|---|
| WG-D1…D16 | AccessOverridesTab + PermissionsMatrix editor mount, CreateUserPanel, ServicesAndRolesPage, quickCreateProfile.ts, ContactsModuleWithBackend (+ its Pricing.tsx import), CreateProjectModal (+ dead `handleConvertToProject`), cleanupDuplicates.ts, RateCalculationSheet, DisbursementSheet, useFxRevaluation + FxRevaluationPanel, exchangeRates.upsertExchangeRate, accounting-api resetChartOfAccounts + saveTransactionViewSettings + TransactionModal, ConsigneesTab, themeSettings.saveWorkspaceThemeSettings, projectAutofill.unlinkBookingFromProject | OPEN |

### Side findings (not RBAC — tracked, not in scope unless Marcus pulls them in)

- `InvoiceBuilder.tsx:554` inserts billing rows into the **`evouchers`** table (`transaction_type:'billing'`), omitting `catalog_item_id` — suspected wrong-table bug + catalog violation.
- `accounting-api.upsertSeedAccounts` auto-seeds full CoA on page load for any viewer.
- `useNetworkPartners` auto-seeds `service_providers` when empty.

---

## 6. Documented Exceptions

| Surface | Why ungated | Signed off |
|---|---|---|
| **Own-row writes** (own todos, own read-receipts/FYI dismiss, own feedback submissions, own profile/avatar/password in Settings) | Writes scoped to the authenticated user's own rows need no knob — the grid governs shared data, not personal state. | Marcus, 2026-06-06 (D7) |

---

## 7. The Ratchet (keep it closed)

After Phase 6, extend `scripts/rbac-guard.mjs` with a **mutation-registry layer**: a checked-in census snapshot (`src/config/access/mutationRegistry.ts` or JSON) listing every file allowed to contain `supabase.from(...).insert/update/delete/upsert` / `functions.invoke` / storage writes, each annotated `gated | non-user | exception`. Guard re-scans src/ with the same multiline regex; any write site in an unregistered file — or count drift in a registered one — fails the guard with "new mutation site: trace its gate and register it." That makes the census self-maintaining: nobody (including future me) can add an ungated write without the guard demanding its knob.

---

## 8. RLS note (defense in depth, second priority)

This initiative gates the UI layer to UI-parity with `current_user_has_module_permission`. Several MISSING rows are also writable at the DB layer by any authenticated session (e.g. calendar_events, comments, attachments, company_settings). After UI gates land, Phase 6 should emit a list of tables whose RLS lags the new knobs, for a follow-up migration pass — UI gates without RLS are honesty, not security.
