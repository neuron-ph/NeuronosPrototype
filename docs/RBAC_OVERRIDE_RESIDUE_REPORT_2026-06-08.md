# Override Residue Report — prod, 2026-06-08 (Phase 1.1)

> Input to the purge decision (PLAN_CREW_VISIBILITY_2026-06.md Phase 1).
> All 60 override rows with non-empty `visibility_scopes` are full uniform
> 24-key maps. ZERO rows show per-key human tuning (the admin UI writes sparse
> maps via `deriveVisibilityOverride`, so uniform full maps are machine-shaped).

## Buckets

| Bucket | Users | Stamp | Action proposed |
|---|---|---|---|
| A. Uniform = legacy `scope`, HAS profile | 30 (9 `everything`, 14 `own`, 7 `team`) | provable 157/161 seed | **PURGE** (clear `visibility_scopes` only; `module_grants` untouched) |
| B. Uniform = legacy `scope`, NO profile | 24 (22 `everything`, 2 `own`) | provable seed, but it's their ONLY access | **HOLD** until profiles assigned (Phase 1.5.4) |
| C. Uniform ≠ legacy `scope`, HAS profile | 6 (see below) | machine-shaped, provenance unclear | **MARCUS TO RULE** — recommend purge (see below) |

## Bucket C detail

| User | Legacy `scope` | Whole map says | Note |
|---|---|---|---|
| Sarah May B. Baylon (jr.pricing01) | own | `everything` | Jr Pricing seeing everything — looks unintended |
| Nevan Mordred V. Flores (jr.pricing02) | own | `everything` | same |
| Zairah Joice R. Borcelas (jr.pricing04) | own | `everything` | same |
| Reuben James S. Sison (jr.pricing05) | own | `everything` | same |
| Santi T. Morales (09santimorales@) | department | `own` | narrower than legacy |
| Leonel Agustin (freight@) | team | `own` | narrower than legacy |

Recommendation: include Bucket C in the purge. Rationale: full uniform maps are
not produceable by the admin UI; the `scope` column was likely edited after
seeding (or vice versa). If any of the 6 genuinely needs a personal dial, set it
deliberately post-purge via the provenance UI (Phase 1.3) — sparse and visible.

Counter-consideration: the 4 Pricing juniors will lose `everything` and drop to
their profile's dials — if Falcons' pricing workflow relied on that width,
they'll notice. Check their profile's dials before purging, or warn Mark.

## Effect on the open tickets

- Ticket 1 (Maria): she is in Bucket A (`everything` stamp) → purged → profile
  `team` governs; with migration 186 (team_memberships resolver) her team set is
  real (3 teammates). Back door remains until Phase 2.
- Ticket 2 (supervisors): Cueto/Retuerma/Nogaliza are in Bucket A (`team`
  stamps) → purged → profile `everything` governs → fixed outright.

## Draft purge migration

`src/supabase/migrations/187_purge_seeded_visibility_overrides.sql` — written,
NOT applied anywhere (not even dev) pending the Bucket C ruling.
