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

- [ ] All 4 supervisors see the full customer list under profile `everything`.
- [ ] Editing the profile dial changes behavior for all profile users with no
      personal override, immediately (staleTime aside).
- [ ] Admin UI on any user shows where each effective dial comes from
      (profile vs personal override), with a clear-override action.
- [ ] Zero override `visibility_scopes` keys remain that match the migration-157
      seed pattern; a human-set override demonstrably survives the purge.
