# Ticket 2 — "All records" dial has no effect for Import Supervisors (Brokerage)

> Reported by Sir Mark, 2026-06-07 (Telegram). Plan: `PLAN_CREW_VISIBILITY_2026-06.md`.
> Status: **root-caused (prod-verified 2026-06-08), not fixed**.

## Report

Profile **IMPORT SUPERVISOR (BROKERAGE)** (Operations / Team Leader, applied to
4 people) has Customers = **All records** in Record Visibility and Customers
enabled in Feature Access — yet the users see no customers. Mark confirmed it
applies to users on the profile generally, not one account.

## Confirmed cause

**Machine-seeded override residue + dead team column.** All 4 users carry
`permission_overrides.visibility_scopes` rows seeded by migration 157:

| User | Override `customers` | Profile says | Effective |
|---|---|---|---|
| Jerome A. Cueto | `team` | `everything` | team → **own-only** |
| Jobert R. Retuerma | `team` | `everything` | team → **own-only** |
| Procopio M. Nogaliza Jr. | `team` | `everything` | team → **own-only** |
| Marc Rasheed S. Cueno | `everything` | `everything` | works (tell Mark: "all 4" is really 3) |

Override beats profile per key → the profile's `everything` is never read.
Their `team` stamp then degrades to **own** because `current_user_team_ids()`
reads the dead `users.team_id` column (see Ticket 1, cause 3). They own no
customer records → empty list. The profile's Feature Access (`bd_customers:view`)
is fine; this is purely the visibility dial being shadowed.

## Fix (per plan phases)

- Phase 1.5: repoint team resolution at `team_memberships`.
- Phase 1: purge machine-seeded override residue (their `team` stamps die;
  the profile's dial becomes the truth) + admin UI shows override provenance
  ("Own — personal override [clear]") so this class of bug is visible, not
  archaeological.
- Phase 1.5.4 guard: 24 active users (incl. all 6 Executives) have NO profile and
  live entirely on override rows — assign profiles before purging theirs.

## Acceptance

- [x] Supervisors see the full customer list under profile `everything` —
      verified live on prod-synced dev (crew-visibility.spec.ts T2,
      jr.supervisor02). NB: Cueno's stamp was already `everything`, so "all 4"
      was really 3 broken.
- [x] Editing the profile dial governs all profile users with no personal
      override (override-first resolution, stamps purged).
- [x] Admin UI shows dial provenance per record type — amber
      "override · profile: X" chip + per-row reset + "reset all to profile".
- [~] Bucket A (30 provable seed stamps, users WITH profiles) purged on dev;
      see deferred items below for Buckets B/C. A human-set override survives
      by construction (purge criterion = uniform full map, which the UI cannot
      produce — it writes sparse deltas only).

## Deferred & dropped (rulings 2026-06-08, Marcus)

**Deferred — parked, with reasons:**
- **Bucket B purge — 24 no-profile users (incl. all 6 Executives).** Their
  seeded override is their ONLY access; purging now would lock them out.
  Prerequisite: assign each an access profile (plan Phase 1.5.4 — needs
  Mark/Marcus to decide who gets what). Purge their residue after.
- **Bucket C — 6 uniform-but-mismatched stamps**, incl. 4 junior Pricing
  officers (Baylon, Flores, Borcelas, Sison) effectively seeing EVERYTHING.
  Marcus: leave untouched for now; the "should these juniors see everything?"
  question to Mark was NOT sent. Revisit at/after release.
- **Carolina misassignment smell** — accountingoffice@ carries the BD MANAGER
  profile with an override hand-patching BD grants off (bd_projects:view=false).
  Likely a missed case of the migration-156 cleanup. Noted, untouched.
- **Release to prod ON HOLD** — the purge (and migrations 186–190) reach prod
  only when Marcus clears the release; until then this bug is still live there.

**Dropped:**
- **Purge "no-op key stripping" sub-step** — no sparse override rows exist in
  the data; full uniform maps were the only residue shape.
