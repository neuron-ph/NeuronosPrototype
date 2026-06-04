# Contract #2 — Eliminate the `ops_projects` umbrella (NEU-012, STRICT)

Authoritative inventory taken 2026-06-05 from fresh grep + live `pg_policies`.

## Inventory — the umbrella has only 3 consumers (smaller than #1)
`ops_projects` is a hidden module (visibleInAccessMatrix:false) hosting the real `ops_projects_*_tab` tabs (borrowed into `bd_projects`/`pricing_projects` via containsModuleIds). The umbrella *action keys* (`ops_projects:<action>`) are consumed by:
1. **DB resolver** — `current_user_effective_module_grant` derivation branch: `ops_projects:x = bd_projects:x OR pricing_projects:x`.
2. **`customers_select`** — one disjunct `ops_projects:view`.
3. **`CreateUserPage.tsx:63`** — quick-grant list entry.

**Not consumed:** `PROJECT_MODULE_IDS.ops.root = "ops_projects"` is **defined but never read** (only `ContactDetail` reads `.root`, and that's the contact module). `ProjectsList`/`ProjectDetail` gate on the **tab** ids (`ids.all/info/bookings/…`), which are real configurable grants — not the umbrella. No app buttons, no routes. KEEP: the module node + tabs + `ModuleId` type union + hidden-status tests.

## Replacement
"Has the project surface" = `bd_projects` OR `pricing_projects` (exactly what the resolver derives). Only one DB consumer, so inline the OR (no single-use helper, per Karpathy).

## Slices
### Slice A — `customers_select` (migration 148)
- [ ] Replace `ops_projects:view` disjunct with `(bd_projects:view OR pricing_projects:view)`. Keep everything else (incl. the Contract #1 `current_user_can_act_on_booking('view')` disjunct) verbatim.
- **Verify:** old-vs-new diff across all users — zero losses; differences only where a user had `ops_projects:view` derived (= bd/pricing projects) which the new disjunct reproduces exactly → expect **zero** diffs.

### Slice B — retire the umbrella (migration 149 + code)
- [ ] Remove the `ops_projects` branch from `current_user_effective_module_grant`.
- [ ] Strip stored `ops_projects:<action>` keys from `access_profiles` + `permission_overrides`.
- [ ] `accessSchema.ts`: add `ops_projects` to `RETIRED_UMBRELLA_DERIVATIONS` (stops client derive/store).
- [ ] `CreateUserPage.tsx`: remove the `ops_projects` quick-grant entry.
- [ ] (Leave `PROJECT_MODULE_IDS.ops.root` — dead but type-required; harmless. Cleaned in Contract #4 when the lens model is revisited.)
- **Verify:** zero `'ops_projects'` enforcement refs (policies + functions); 0 stored umbrella keys; `accessSchema.test.ts` still green (node stays hidden); project list/detail still work for a BD/Pricing user.

## Definition of done
Zero `ops_projects` enforcement refs; not derived; node + tabs remain; app == DB; dev-verified; prod batched with the phase.
