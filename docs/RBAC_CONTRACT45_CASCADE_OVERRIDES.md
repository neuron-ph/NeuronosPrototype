# Contracts #4 + #5 — Cascade → UX-only & Eliminate overrides (NEU-012, STRICT, Phase 2)

Merged because both are achieved by one operation: **snapshot each user's effective grants into one explicit profile.** Path **C (hybrid)**: snapshot verbatim now (no real-access change), consolidate profiles later.

## Critical finding (2026-06-05)
**The client cascades grants at read; the DB resolver does not.** `PermissionProvider` runs `resolveCascadedGrants(mergeGrantLayers(profile, override), PERM_MODULES)` then `deriveHiddenModuleGrants`. `current_user_effective_module_grant` (DB) does a plain key lookup (override → assigned → baseline), **no cascade**. So the app UI and the DB already disagree on cascaded child grants — a pre-existing divergence. The fix MATERIALIZES cascade into explicit stored grants (exactly Marcus's "cascade fills + STORES explicit children" rule), so app and DB then read the identical explicit set.

## Landscape (dev discovery)
60 users, all have an override row. 26 empty overrides (already clean). 34 non-empty, 24 distinct shapes. Big overrides (51+ keys): 19 are override-only "shadow profiles" (no assigned profile), 3 layered on top. Profile catalog: 25 baseline + 9 job-role custom (CUSTOMS DECLARANT ×11, IMPORT SUPERVISOR ×8, PRICING OFFICER ×4, BD MANAGER ×4, …). A real structure exists; overrides are the mess.

## The operation
For each user, **effective = deriveHiddenModuleGrants(resolveCascadedGrants(mergeGrantLayers(baselineOrAssignedProfile.grants, override.grants), PERM_MODULES))** — the EXACT `PermissionProvider` computation (reused from `src/`, not reimplemented). That explicit set becomes the user's single profile.

## Slices
1. ✅ **Dry run (writes nothing)** — `src/rbacSnapshot.test.ts` (guarded vitest tool; `RBAC_SNAPSHOT=report`). Reused the real app logic. Result: 60 users → 28 grant-shapes, 0 would-be-empty.
2. ✅ **Materialize + assign** — migration 151 added `users.access_profile_id`; the tool (`RBAC_SNAPSHOT=apply`) created **30 snapshot profiles** (grants + scope + departments per distinct shape, marker description `NEU-012 verbatim snapshot (Phase 2)`) and assigned all 60 users. Idempotent + reversible (clears prior snapshot profiles first). **Verified: 0 unassigned, 0 mismatches** (assigned profile == computed effective). Override+cascade still LIVE; enforcement unchanged. NOTE: the data migration is performed by the tool (not a SQL file) — prod release of Phase 2 = run the tool against prod, alongside the schema/code migrations.
3. **Flip enforcement to explicit-only** — DB resolver reads `users.access_profile_id` → profile (exact key, no merge/cascade); `current_user_visibility_scope/departments` read the profile (no override, no role fallback); `PermissionProvider` reads the assigned profile's explicit grants (no cascade). **Verify per user: new effective == old effective** (grants + scope), app == DB. Smoke test.
4. **Editor cascade = UX-only** — tick-parent fills + WRITES explicit children; borrowed/contained tabs render as real visible rows.
5. **Drop the override layer** — remove `permission_overrides` reads from resolver + provider; drop the per-user matrix editor (Users → assign a profile); drop the table last.

## Safety
Dry run before any write. Per-user pre/post equivalence gate. Old mechanism (override + cascade) stays live until the explicit path is proven. Rollback commit per slice. Prod only after the whole phase passes on dev. **Path C consequence:** after this, profiles may be many (~24 shapes); consolidating toward the job-role catalog is a follow-on with Marcus, not a blocker.

## Definition of done
One profile per user = their explicit access; `permission_overrides` gone; no cascade at read/enforcement; editor cascade writes explicit; app == DB; dev-verified pre/post equivalence.
