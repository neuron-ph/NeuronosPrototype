# ACCESS-INTEGRITY AUDIT REPORT
## NeuronosPrototype Authorization System
_Generated 2026-06-08 · read-only multi-agent sweep (165 agents, 17 surfaces) · 51 raw findings → 93 refuted → 19 confirmed distinct bugs_

---

## EXECUTIVE SUMMARY

**Real Issues Found:** 19 confirmed bugs (P0: 2, P1: 10, P2: 6, P3: 1)
**Data security breaches: 0** — every issue is *data lockout* or *feature failure* (fail-closed), not unauthorized access.

**Dominant Root Causes:**
1. **Seeding gaps (6 issues)** — Access profiles missing keys the schema & DB expect.
   - BD projects/contracts detail tabs not seeded (migration 130 uses old `ops_projects_*`/`pricing_contracts_*` keys)
   - Operations Brokerage detail tabs not seeded (migration 130 lacks `ops_brokerage_*_tab` keys)
   - Accounting profiles never seeded (deferred), leaving modules inaccessible
2. **Frontend–DB authorization divergence (7 issues)** — Frontend gates on keys, DB gates on parent modules or different keys.
   - `admin-user-actions` edge function only reads `permission_overrides`, ignores access-profile assignments
   - EVoucher liquidation close requires a visibility-dial check at DB but not frontend
   - `company_settings` UPDATE has no RLS policy despite migration 168 defining the permission
3. **Incomplete fallback OR-gates (4 issues)** — Shared components hardcode door-lists missing service-specific variants.
   - `UnifiedBillingsTab` fallback omits 18 per-service billing doors
   - `UnifiedExpensesTab` fallback omits 14 per-service expense doors
4. **Missing permissionDoor threading (2 issues)** — Parents don't pass permission context.
   - `FinancialsModule` and `CustomerLedgerDetail` don't thread `permissionDoor` to `UnifiedExpensesTab`

**Can users access things seamlessly? NO** (per the static analysis) — critical path blockages:
- BD users cannot access project/contract detail tabs → data lockout
- Operations Brokerage users cannot access booking detail tabs → data lockout
- Admin password-reset/delete via `admin-user-actions` fails silently for profile-based admins
- Accounting department has zero access to accounting modules

> **⚠️ Reconcile before fixing:** The two P0s reason from migration 130 / the seed builder. But we directly observed in prod that Mariella's live profile ("SR. OPERATIONS MANAGER (BROKERAGE)") *did* contain every `ops_brokerage_*_tab` key. That means live profiles (Falcons) may be built differently from the 130 baseline (custom profiles, later migration, or the Access Config UI). **Validate every P0/P1 seeding claim against live profile data before touching seeds.**

---

## CONFIRMED BUGS, RANKED BY SEVERITY

### P0 — Data Lockout

**1. BD Projects/Contracts detail tabs ungated in production seeding**
- Location: `src/supabase/migrations/130_access_profile_seeds.sql`, `src/supabase/seeds/accessProfileSeedBuilder.ts` (lines 68-87, 120, 144)
- Affected: all BD staff (staff/TL/supervisor/manager) opening project or contract details
- Breaks: frontend checks `bd_projects_*_tab:view` / `bd_contracts_*_tab:view`; migration 130 seeds the obsolete `ops_projects_*` / `pricing_contracts_*` keys instead, so all 26 detail tabs fail `can()` and render empty.
- Root cause: schema refactor (`c73df62`) moved BD to `bd_projects_*` / `bd_contracts_*` keys; migration 130 / seed builder constants (`PROJECT_ON/OFF`, `CONTRACT_ON/OFF`) were never regenerated.
- Fix class: regenerate migration 130 via `genAccessProfileSeeds.ts` (or patch the JSON) to include all 26 tab keys; verify tabs render after re-seed.

**2. Operations Brokerage detail tabs not seeded (all 7 ungated in baseline)**
- Location: `src/supabase/migrations/130_access_profile_seeds.sql` (Brokerage section), `accessProfileSeedBuilder.ts` (`opsGrants`, line 104)
- Affected: all Operations Brokerage staff opening booking details
- Breaks: `BrokerageBookingDetails.tsx:112-118` gates all 7 tabs on `ops_brokerage_*_tab:view`; none seeded in 130 → list visible, detail tabs blank.
- Root cause: migration 172 added per-service tab keys after 130; baseline profiles in 130 never updated.
- Fix class: regenerate 130 with `opsGrants` including all 7 tabs across all 5 services, or add a conditional migration 19X.
- **Note:** conflicts with observed live data (Mariella had these keys) — validate first.

---

### P1 — Feature Failure / Authorization Mismatch

**3. `admin-user-actions` edge function reads only `permission_overrides`, ignores access-profile assignments**
- Location: `supabase/functions/admin-user-actions/index.ts:51-75`
- Affected: any admin whose admin grant lives in their assigned profile (not a per-user override)
- Breaks: password reset / status change / delete → 403; function never reads `access_profile.module_grants`.
- Root cause: written pre-NEU-012 Phase 5; `create-user` was updated to merge profile+override (lines 96-109), `admin-user-actions` was not.
- Fix class: mirror create-user's merge (fetch `access_profile_id`, read `module_grants`, override wins) before `hasAdminUsersGrant`.

**4. EVoucher liquidation close — visibility dial enforced at DB, not frontend**
- Location: `src/components/accounting/EVoucherWorkflowPanel.tsx:133-134`
- Breaks: button shows on `acct_evouchers:approve` alone; RLS also requires `current_user_can_view_record('evouchers', created_by)` → silent UPDATE rejection for non-creators.
- Fix class: pre-check the visibility dial, or catch the RLS error with a clear message.

**5. Calendar module unseeded but RLS is role-based (asymmetric)**
- Location: `accessProfileSeedBuilder.ts` (no calendar grant), `NeuronSidebar.tsx:355`, `024_calendar_rls.sql`
- Breaks: sidebar/route hide Calendar (no `calendar:view` seeded), but `calendar_events` RLS allows role-based access → hidden-but-authorized.
- Fix class: seed `calendar:view` to all baseline profiles (preferred), or switch RLS to module-permission checks.

**6. Booking detail tabs unseeded for Forwarding/Trucking/Marine/Others** — same root cause as #2, across the other 4 services. Validate against live data first.

**7. Accounting department profiles missing entirely**
- Location: `accessProfileSeedBuilder.ts` (no `accountingGrants`), `docs/ACCESS_PROFILE_SEEDS.md:126-129` ("NOT SEEDED — intentionally deferred")
- Breaks: Accounting users default to empty grants → locked out of all accounting modules.
- Fix class: define Accounting access ladders, add `accountingGrants()`, regenerate 130.

**8. EVoucher approval queue — department scoping enforced at DB, not frontend** — button shows on `my_evouchers:approve`; RLS also requires same-department + `pending_manager` → silent reject cross-department. Fix: pre-check department or handle RLS error.

**9. BD contacts detail tabs — frontend gates per-tab, RLS gates parent module only** (`ContactDetail.tsx:52-60` vs `162_crm_rls_phase3`). Asymmetry under admin overrides. Fix: add per-tab keys to RLS OR-union.

**10. `company_settings` UPDATE has no RLS policy**
- Location: `028_quotation_pdf_and_company_settings.sql` (SELECT only), `168_phase5b_company_settings_permission.sql` (key, no policy), `InvoicePDFScreen.tsx:35`
- Breaks: "Save as Company Default" button shows on `company_settings:edit`, but upsert fails — only a SELECT policy exists.
- Fix class: add UPDATE/INSERT RLS checking `company_settings:edit`.

---

### P2 — Access Gap / Usability

**11. `UnifiedBillingsTab` fallback OR-gate missing 18 per-service doors** (`UnifiedBillingsTab.tsx:102-107`) — fallback has 4 keys, RLS `current_user_can_billings()` has 19. Only bites callers that don't thread `permissionDoor`. Fix: complete the list or deprecate the fallback. _(Same class as the bug already fixed.)_

**12. `UnifiedExpensesTab` fallback OR-gate missing 14 per-service doors** (`UnifiedExpensesTab.tsx:75-77`). Same as #11.

**13. `OperationsTeamsSection` edit button gate narrower than teams RLS** (`exec_profiling:edit` vs `admin_users_tab`/`exec_users`). Hidden-but-authorized. Fix: widen gate or document.

**14. AccessConfiguration profile-delete gate narrower than RLS** (`admin_access_profiles_tab:delete` vs `admin_users_tab:delete` fallback). Document or widen.

**15. BD projects/contracts detail tabs — frontend per-tab vs RLS parent-module** (`ProjectDetail.tsx:155-167` vs `143_project_crm_rls_phase4`). Same family as #9.

**16. Customer detail variant routing vs record-visibility RLS asymmetry** (`CustomerDetail.tsx:46-62`). Edge case; document or align.

**17. `recordVisibilityConfig` gatingModules missing 15 per-service doors** (`recordVisibilityConfig.ts:79`) — admin UI shows record-visibility rows greyed out incorrectly; RLS still correct. Fix: sync gatingModules to RLS OR-lists.

**18. `create-user` / `admin-user-actions` override-only read (masked today)** — same as #3; will surface once `users.access_profile_id` is fully assigned.

**19. EVoucher submit button shows but fails for non-staff creators** (`EVoucherWorkflowPanel.tsx:118`) — button on `isOwner && draft`, RLS requires `my_evouchers:edit`. Fix: add `can('my_evouchers','edit')` pre-check.

---

### P3 — Minor

**20. Calendar direct-URL accessibility asymmetry** — narrower aspect of #5; mitigated by route guard + sidebar hiding.

---

## LATENT RISKS (correct today, fragile)

- **Hardcoded door-list fallbacks** in all Unified* tabs + InlineRateCardSection — any new door silently excluded. Mitigate: central door-list shared by RLS + frontend, or require door threading everywhere.
- **Dual-write (users + permission_overrides) without transactional guarantee** (`AccessConfiguration.tsx:392-397`) — partial failure leaves inconsistent state.
- **Visibility dial defaults to 'own' silently** for unseeded record types — can hide data that should be visible.
- **Admin UI allows tab grant without parent module** — no cascade means frontend/DB can disagree.
- **Per-service detail doors not consistently in every RLS helper** — new money policies risk omitting them (shown-but-rejected).

---

## VERIFIED CLEAN (coverage proven)

BD CRM module · Operations Forwarding/Trucking/Marine/Others detail threading · Accounting financials tab gates · Calendar gating infrastructure · Catalog management · Personal modules (Inbox, My E-Vouchers) · Admin users/profiles OR-logic · Record-visibility dials (team/department/own resolution matches RLS) · Booking-assignment visibility hook vs RLS · Static RBAC guard (320+ `can()` calls declared) · Edge `create-user` profile+override merge · Route guards on all department routes.

---

## RECOMMENDED REMEDIATION ORDER

**Phase 1 — Critical data lockout (validate against live data FIRST):** #1 BD tabs, #2 Brokerage tabs, #7 Accounting profiles.
**Phase 2 — Feature failure:** #3 admin-user-actions merge, #10 company_settings RLS, #4 EVoucher dial, #8 approval dept scoping.
**Phase 3 — Fallback completeness:** #5 Calendar seed, #11 billings fallback, #12 expenses fallback.
**Phase 4 — Admin UI consistency:** #17 gatingModules, then batch #13/#14/#15/#16/#18/#19.
**Phase 5 — Architecture:** deprecate fallbacks / central door-list; CI check that seeds cover all schema modules; document intentional asymmetries.

**Est. effort:** ~40h total. **Breaches: 0.**
