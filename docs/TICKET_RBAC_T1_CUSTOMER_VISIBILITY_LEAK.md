# Ticket 1 — BD Manager sees customers outside her team (Record Visibility leak)

> Reported by Sir Mark, 2026-06-07 (Telegram). Plan: `PLAN_CREW_VISIBILITY_2026-06.md`.
> Status: **root-caused (prod-verified 2026-06-08), not fixed**.

## Report

Maria Crisanta C. Calderon (`jr.manager01@falconslogistics-ph.com`, profile
**BD MANAGER**, Customers dial = **Team**) can open **FOCUS GLOBAL INC**, whose
account owner ("In-House Account") was moved from Business Development to
Executive. Mark expects: owner leaves the department → the old department loses
sight of the record.

## Confirmed causes (in order of impact)

1. **Seeded override residue (primary).** Maria carries a personal
   `permission_overrides.visibility_scopes` row stamping **`everything` on all
   24 record types** — machine-seeded by migration 157, not set by any human.
   Override beats profile per key, so her profile's `team` dial is never
   consulted. She effectively sees every record of every type.
2. **Back door in `customers_select` (secondary).** The live policy's second
   OR-branch grants ALL customers to anyone holding any ops/projects view key,
   with no dial check. Maria's profile has `bd_projects:view = true`, so even
   without the override she'd pass.
3. **Team dial resolves against a dead column (latent).** `current_user_team_ids()`
   reads `users.team_id` (NULL for all 60 active users); real membership lives in
   `team_memberships` (16 teams, 53 rows — Maria is in 4 teams). Once causes 1–2
   are fixed, her `team` dial would wrongly collapse to own-only without this fix.

## Fix (per plan phases)

- Phase 1.5: repoint team resolution at `team_memberships` (DB fn + `useDataScope`).
- Phase 1: purge machine-seeded override residue (Maria's `everything` stamp dies;
  human-set overrides survive; provenance shown in admin UI).
- Phase 2: delete the possession-only OR-branch; customers visibility becomes
  crew-based (`owner` + assigned participants of linked bookings/projects),
  uniformly across Own/Team/Department/All.
- Phase 4: admin "change department" flow must resolve team membership in the
  same save, so moving an owner actually moves their records' reach.

## Acceptance

- [ ] Maria (profile `team`, no override) does NOT see Focus Global Inc in
      Customers (owner is Executive, not her teammate, no linked work of hers).
- [ ] She still sees customers owned by / worked on by her actual teammates
      (per `team_memberships`, all 4 of her teams).
- [ ] Moving a customer's owner out of BD removes it from BD users' lists on
      next load (Mark's original maneuver, re-run on dev).
- [ ] Ops users still see customer names on their bookings (denormalized
      `customer_name` + crew-based Own).

## Side notes for Mark

- FOCUS GLOBAL INC exists as **4 duplicate customer rows** (CUST-1778054934773,
  CUST-1779437508818, CUST-1780539923140, CUST-1780638263187), all owned by
  "In-House Account" — which is Mark's own login (markjavier219@). Recommend
  merging/cleanup after the fix.
- His "except" request is tracked separately (Q1, awaiting his answer).
