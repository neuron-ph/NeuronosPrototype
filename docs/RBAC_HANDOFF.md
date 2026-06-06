# RBAC Conversion — Session Handoff (NEU-012)

**Read this first, then `docs/RBAC_STRICT_CONTRACTS.md` (the master plan).** This is a live, sliced refactor of the whole permission system. All work is on **dev** (`oqermaidggvanahumjmj`); **prod (`ubspbukgcxmzegnomlgi`) is untouched.** Cortex has the full event history (search "NEU-012").

---

## 1. The principle (locked by Marcus — corrected 2026-06-05)

Access is decided by exactly **two layers**:
- **Layer 1 — Feature access:** which modules/actions a user can see & do.
- **Layer 2 — Record visibility:** which rows within those (own / team / department / selected / all).

**The governing rule is VISIBILITY, not "no per-user settings":**
- ✅ **KEEP** per-user customization that is **visible and clickable.** Flow: a user is on a **shared** Access Profile (gets ~80–90%); an admin (e.g. CEO) may then **customize that one person** by ticking visible boxes on top.
- ❌ **KILL** anything **hidden or self-enforcing**: stored grants with no checkbox (the umbrella keys), and implied cascade that left boxes stuck/uneditable. Marcus's exact words: the bad overrides were *"a hidden setting that enforces itself in a way I can't even click the box."*

**Invariants:** every grant a user has = a real, visible, clickable module/tab box; what you see == what's stored == what app & DB enforce; **no cascade at read** (cascade is an editor convenience that writes explicit children); role/department may *seed* defaults but **never decide enforcement**.

**Desired end-state model:**
- `users.access_profile_id` → a **shared** profile (the base).
- Per-user **visible customization** layered on top (stored in `permission_overrides.module_grants`, edited in the per-user grid).
- `effective(key) = override[key] if present else profile[key] else false` — explicit, no cascade, no role fallback. App == DB.

---

## 2. ⚠️ COURSE CORRECTION needed right now (start here)

I over-rotated. Early on Marcus said "overrides should not be a concept"; I wrongly read that as **"no per-user layer at all"** and built toward profile-ONLY enforcement. He clarified (2026-06-05): per-user customization **must stay** — it just has to be visible/clickable. So **Phase 2 took a wrong turn that must be corrected:**

**What's wrong now (on dev):**
- **Slice 3 (migration 152)** flipped the resolver + visibility funcs + `PermissionProvider` to read `users.access_profile_id` **profile-ONLY** — it ignores per-user customization. ← must become **override-overlay-on-profile**.
- The **snapshot (Slice 2)** collapsed each user into their **own** merged profile (30 "Snapshot …" profiles) instead of keeping them on **shared** job-role profiles + a personal delta.

**The correction (confirmed by Marcus, NOT yet executed):**
1. **Resolver + `PermissionProvider`: re-add the per-user overlay.** `effective(key) = override.module_grants[key] (if present) else assignedProfile.module_grants[key] else false`. Explicit, no cascade, no role fallback. (New migration; revise `PermissionProvider.tsx`.)
2. **Re-assign `users.access_profile_id` to the original SHARED profiles.** Source = each user's original `permission_overrides.applied_profile_id` (still intact). Keep their `permission_overrides.module_grants` as the visible delta.
   - **Shadow-profile users** (Accounting/HR/Executive had NO `applied_profile_id`, only a big override): OPEN ITEM — either create proper shared profiles for them (clean) or interim-assign them their snapshot profile as a personal base. Decide with Marcus.
3. **Keep** the per-user grid editor (`AccessConfiguration.tsx`) and the `permission_overrides` table — this IS the visible customization layer. Ensure cascade-UX-only so every box is freely clickable and enforces what it shows.
4. **Delete the 30 snapshot profiles** (description = `NEU-012 verbatim snapshot (Phase 2)`) for any user re-pointed to a shared profile.
5. New-user creation (`CreateUserPage.tsx`) must set `users.access_profile_id` (it currently writes `permission_overrides` only).

**What was RIGHT and stays:** Phase 1 (umbrellas gone = the real fix for "hidden"), Phase 0 (creator stamping), the drift fix, and cascade-UX-only on save (Slice 4 = the fix for "can't click the box"). Those are the genuine value; only the "profile-only + snapshot" direction is being corrected.

---

## 3. Status by contract (master list in `RBAC_STRICT_CONTRACTS.md`)

| # | Contract | State |
|---|----------|-------|
| 0 (Phase 0) | Stamp record creators | ✅ done dev (migrations 146,147). Fixed "staff can't create bookings/expenses". |
| 1 | `ops_bookings` umbrella | ✅ done dev (142–145). Helper `current_user_can_act_on_booking` / `canActOnBooking`. |
| 2 | `ops_projects` umbrella | ✅ done dev (148–149). |
| 3 | `inbox_entity_picker` umbrella | ✅ done dev (150). All 3 umbrellas gone; resolver has zero umbrella derivation. |
| 4 | Cascade → UX-only | ✅ profile-editor save persists explicit (`resolveCascadedGrants`). Per-user grid clickability to re-verify after correction. |
| 5 | "Eliminate overrides" | ❌ **REFRAMED** — do NOT drop overrides. Instead: correction in §2 (overlay + shared profiles + keep grid). |
| 6 | Record visibility (Layer 2) | 🚧 Slice 1 done (creator stamping). Slices 2–4 pending: scope must be visible/configurable per profile + per-user (currently `current_user_visibility_scope` reads the profile after Slice 3; `useDataScope.ts` + DB `get_my_override_scope` still read overrides — align under the overlay model). Remove hardcoded dept allow-lists in `current_user_can_view_record`. |
| 7–8 | Wide-open tables / RLS-off tables | not started |
| 9–10 | Legacy identity tables / app identity gates (`permissions.ts`, `department ===`) | not started |
| 11 | Drop `permissions.ts` | not started |
| 12 | Regression guard | not started |

---

## 4. Key files & artifacts

- **Plan/contract docs:** `docs/RBAC_STRICT_CONTRACTS.md` (master, 12 contracts + phases + who-does-what), `RBAC_PRINCIPLE_IMPLEMENTATION_PLAN.md`, `RBAC_COMPLIANCE_LEDGER.md`, `RBAC_PATHA_BOOKINGS.md` (#1), `RBAC_CONTRACT2_OPS_PROJECTS.md` (#2), `RBAC_CONTRACT45_CASCADE_OVERRIDES.md` (#4/#5 — update for the correction).
- **DB resolver:** `current_user_effective_module_grant(p_key)` — currently profile-ONLY (migration 152); MUST become override-overlay. Visibility: `current_user_visibility_scope()`, `current_user_visibility_departments()` (also profile-only now). RLS calls `current_user_has_module_permission(module,action)` → the resolver.
- **Client resolver:** `src/context/PermissionProvider.tsx` — currently reads `users.access_profile_id` profile-only; MUST overlay override. Exposes `can()` / `hasExplicitGrant()`.
- **Grant utils:** `src/components/admin/accessProfiles/accessGrantUtils.ts` — `resolveCascadedGrants`, `mergeGrantLayers`, `chooseRoleDefaultProfile` (drift-fixed to mirror DB), `roleDefaultVisibilityScope`.
- **Schema:** `src/config/access/accessSchema.ts` — `RETIRED_UMBRELLA_DERIVATIONS = {ops_bookings, ops_projects, inbox_entity_picker}`; `deriveHiddenModuleGrants` now a no-op (remove entirely at Contract #4 cleanup). `PERM_MODULES` graph in `src/components/admin/permissionsConfig.ts`.
- **Per-user grid editor (KEEP):** `src/components/admin/AccessConfiguration.tsx` (the screen Marcus showed); also `UserManagement.tsx`, `PermissionsMatrix.tsx` touch `permission_overrides`.
- **Profile editor (KEEP):** `src/components/admin/accessProfiles/AccessProfiles.tsx`.
- **Snapshot/migration tool:** `src/rbacSnapshot.test.ts` — guarded vitest tool (skipped by `npm test`). Run: `RBAC_SNAPSHOT=report|apply npx vitest run src/rbacSnapshot.test.ts --disable-console-intercept`. Reads dev URL + `DEV_SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. Reuses the app's exact resolution logic. Idempotent (clears prior snapshot profiles by description marker). **Will be repurposed for the correction** (re-assign shared profiles).
- **Booking helpers:** `src/utils/bookingPermissions.ts` (`canActOnBooking`); creator-stamp trigger fn `set_created_by_from_auth()` on bookings/collections/evouchers/expenses/invoices/quotations.

### Migrations this work added (dev only)
142 booking_act_helper · 143 bookings_policies_use_act_helper · 144 cross_reads_use_act_helper · 145 retire_ops_bookings_umbrella · 146 stamp_booking_creator · 147 stamp_creator_financial_tables · 148 customers_select_off_ops_projects · 149 retire_ops_projects_umbrella · 150 retire_inbox_entity_picker_umbrella · 151 users_access_profile_id · **152 resolve_from_assigned_profile (the wrong-turn — supersede in the correction)**. (Prior-session 137,139,140,141 committed in 77ff9f6; 136 is NEU-013, not RBAC.)

---

## 5. Gotchas / facts
- **`access_profiles.name` is UNIQUE** — snapshot names use an index suffix.
- **vitest `include` is `src/**` only** — that's why the tool lives in `src/`, guarded by the `RBAC_SNAPSHOT` env var.
- **`access_profiles_select` policy = `using(true)`** — any authenticated user can read profiles (so the client can read its own).
- **Entangled files — do NOT sweep into RBAC commits:** `ProjectBookingsTab.tsx`, `CreateBookingFromProjectPanel.tsx`, `CreateForwardingBookingPanel.tsx`, `ProjectBillings.tsx`, `projectAutofill.ts` mix **NEU-013** (booking↔project data layer) work. Also `package.json`, `TICKETS.md`, `CLAUDE.md`, `scripts/clone-*` are pre-existing WIP.
- **`TICKETS.md` is uncommitted** (Marcus's WIP + new **NEU-015** project-booking contract-field, **NEU-016** consignee-picker-disabled — both pre-existing app bugs in the project-booking panel, NOT RBAC, confirmed by RLS checks).
- **Test users (password `devpassword123`):** Cecil P. Francisco (Brokerage staff, `jr.cusdec10@…`), Jayson P. Nabos (Pricing mgr, `c1fbae71…`), Amor S. Deang (HR mgr — no HR profile exists), Carolina Infante (Accounting, on mis-assigned "BD MANAGER"). 60 users total, all currently assigned to snapshot profiles.
- **Per-user simulation in SQL:** `select set_config('request.jwt.claims', json_build_object('sub', <auth_id>,'role','authenticated')::text, true); set local role authenticated; <query>; reset role;` inside a transaction.
- **Prod release** = the `CLAUDE.md` "Release dev to prod" checklist **+ run the snapshot/assignment tool against prod** (the Phase 2 data migration is performed by the tool, not a SQL file). Nothing released yet.

---

## 6. Working agreements (Marcus)
- **One slice at a time:** change → automated verify (SQL probes / old-vs-new diffs / `npx vitest run`) → commit (rollback point) → continue. Hand Marcus a **short smoke-list** only when UI behavior changes; he tests, you do the deep verification.
- **Distinguish regression (we broke something that worked — stop & fix) from discovery (pre-existing latent bug — log a ticket, continue).** Most finds so far were discovery.
- **Plain-English first** (non-technical founder; steers by product). Bring him the decision that's genuinely his; investigate technical questions yourself.
- **Capture to Cortex** silently at milestones (`cortex.capture_event`, `cwd` set). Don't double-capture per commit.
- **Dev only**; surface SQL migrations before any prod apply; commit messages end with the Co-Authored-By line.
- Commit only RBAC files (avoid the entangled NEU-013 / WIP files).

## 7. Immediate next step
Execute the §2 correction, smallest safe slice first: **(1) re-add the override-overlay to the resolver + `PermissionProvider`** (new migration superseding 152's profile-only logic), verify per-user effective is preserved, commit. Then **(2) re-assign users to shared profiles** (decide shadow-user handling with Marcus first), then clean up. After the correction lands and smoke-tests green, resume Contract #6 (Layer-2 visibility), then #7+.
