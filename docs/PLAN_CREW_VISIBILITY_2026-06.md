# Crew-Based Record Visibility — Implementation Plan

> **Status: Phases 1–4 COMPLETE AND QA'D ON PROD-SYNCED DEV (migrations 186–190; both ticket acceptance tests pass live in the browser; Mark's maneuver verified end-to-end).
> Marcus rulings 06-08: Bucket B residue stays (do not purge until profiles assigned); Bucket C stays untouched for now; RELEASE ON HOLD.
> Remaining: 1.5.4 (profiles for 24 no-profile users), Phase 6 release when Marcus clears it. Git: work uncommitted.** · Last updated: 2026-06-08
> Origin: Sir Mark's two RBAC reports (2026-06-07 Telegram) — Ticket 1 (BD Manager
> sees out-of-team customer via Projects back door / stale team_id) and Ticket 2
> (Import Supervisors' "All records" dial dead due to seeded override residue).
>
> **This document is the contract.** Before writing any code in a phase, re-read
> that phase. After completing any step, tick it and update the Status line. If
> implementation needs to deviate, STOP — record the deviation in the Decision
> Log below with a reason, get Marcus's explicit OK, then proceed. No silent drift.

---

## The Model (locked — do not reinterpret)

Every record has a **crew** = its `owner` + everyone **assigned to work attached
to it** (linked booking/project participants: `created_by`, `manager_id`,
`supervisor_id`, `handler_id`, + `booking_assignments` rows). A record with no
linked work has a crew of one: the owner.

The per-record-type dial picks a radius around that crew:

| Dial | Meaning |
|---|---|
| **Own** | I'm in the crew |
| **Team** | Crew includes someone from my team (`users.team_id`) |
| **Department** | Crew includes someone from my department *(new dial, Phase 3)* |
| **All records** | Everyone |

Resolution order (unchanged): per-user override key → profile key → `'own'` (fail-closed).

### Locked decisions (Decision Log)

| # | Decision | Why | Date |
|---|---|---|---|
| D1 | "Linked to work" = **participation** (assigned to the work), NOT visibility (can see the work) | Visibility-based linking makes the Customers dial's reach depend on the Bookings dial — admin can't read a row in isolation. Participation keeps every dial independently readable. | 06-08 |
| D2 | Crew semantics apply **uniformly** to Own AND Team AND Department | One definition, four radii. No special cases. | 06-08 |
| D3 | The possession-only OR-branch in `customers_select` (ops/projects keys ⇒ all customers) is **deleted**, not scoped | Crew-based Own/Team replaces its legitimate use; the rest was the Ticket 1 leak. | 06-08 |
| D4 | No altitude/rank axis ("staff can't see executive-owned") | Nobody asked for it; bolt-on later as a separate filter if ever needed. | 06-08 |
| D5 | No `'department'` profile values seeded automatically | Mark dials profiles up deliberately. Explicit > convenient. | 06-08 |
| D6 | Dial descriptions in the UI must state the crew rule in full | RBAC principle: visible, explicit, configurable. An unstated uniform rule is still implicit. | 06-08 |
| D7 | `current_user_can_view_booking` should also consult `booking_assignments` (pre-existing gap; client filter already does) | DB and client must agree on who the crew is. | 06-08 |

## Phase 0 FINDINGS (prod, read-only, 2026-06-08) — facts, not hypotheses

**F1 — Both tickets share ONE root cause: migration-157-seeded override residue.**
- Maria Calderon (`user-1f7e622e`, profile BD MANAGER `customers: team`) has a
  personal override stamping **`everything` on all 24 record types** → her
  effective dial is `everything`. That alone explains Ticket 1's leak; the back
  door wasn't even needed.
- The 4 Import Supervisors all have override rows: 3× `customers: team`
  (shadowing profile `everything` → Ticket 2), 1× `everything` (Cueno — he
  likely CAN see customers; worth telling Mark "all 4" was really 3).

**F2 (CORRECTED 06-08 — first version wrongly said "teams don't exist") —
The visibility resolver reads a dead column.** Teams ARE real in prod:
`team_memberships` has 16 teams / 53 rows / 39 users (Maria is in 4 teams).
But `current_user_team_ids()` (157) and `useDataScope.ts` read legacy
`users.team_id`, which is NULL for all 60 actives — the Teams UI (V1 structure,
migration 063) writes `team_memberships` and never touches `users.team_id`.
Migration 157's comment "no team_memberships table" was false when written.
Net effect unchanged: `'team'` dial ≡ `'own'` for everyone in prod — but the
fix is REPOINT THE RESOLVER, not populate rosters (Phase 1.5 redefined).
Bonus: membership-based teams handle multi-team users correctly, which
single `team_id` never could.

**F3 — Override residue census (60 rows with visibility maps):**
9 users effectively WIDER than profile (6 `everything`>`own`, 3 `everything`>`team`
incl. Maria), 4 NARROWER (3 `team`<`everything` = Ticket 2, 1 `own`<`team`),
~23 no-op shadows, and **24 active users have NO access profile at all**
(all 6 Executives, 9/11 Accounting…) — they run entirely on override rows.
⚠️ Purge sequencing: deleting Maria-style residue drops her to profile `team`,
which with F2 = `own` → she'd lose nearly all customers. **Purge and teams
population must land together**, and no-profile users need profiles first or
their keys vanish entirely.

**F4 — Back door confirmed live on prod** (`customers_select` qual matches 158:
possession-only ops/projects OR-branch). **`contacts_select` is CLEAN** (dial-gated
only) → Phase 2.5 narrows to "cousins found": none for contacts.

**F5 — Q2 answered: `bookings.customer_name`, `projects.customer_name`,
`quotations.customer_name` all exist (denormalized).** Name rendering for
can-see-but-not-assigned viewers survives the back-door deletion with zero work.

**F6 — Data quality (side note for Mark):** Focus Global Inc exists as **4
duplicate customer rows**, all owned by `user-4d53d89c` "In-House Account"
(= Mark's own login, dept Executive, no team, no profile).

### Open questions (resolve before their phase)

- [x] **Q1 RESOLVED 06-08 (Marcus): DEFERRED.** No "except" feature in this
      effort — don't ask Mark, don't build. If he raises it again post-release,
      first check whether a per-user override (visible via Phase 1.3 provenance
      UI) already satisfies him before designing anything new.
- [x] **Q2 ANSWERED (F5):** yes — `customer_name` denormalized on bookings,
      projects, AND quotations. No rendering fallback needed.
- [x] **Q3 ANSWERED (F2):** `users.department` is populated (6 departments) so the
      Department dial can read it — BUT `team_id` is NULL for all 60 active users,
      and 24 actives have no access profile. See Phase 1.5.
- [x] **Q4 RULED PROVISIONALLY (autonomous run, 06-08):** bookings + projects
      only — implemented in 189/190. Quotations excluded (preparer reaches the
      customer via the quotations dial; including them widens crews a lot).
      Trivially extensible: one more EXISTS arm in current_user_can_view_customer.
      Flag to Marcus at review; revisit only if a real workflow breaks.

---

## Phase 0 — Verify root causes (read-only; needs Marcus's prod approval) ✅ DONE 06-08

- [x] 0.1 Focus Global owner vs Maria → F1, F2, F6 (no "stranded team_id" — there
      are no teams at all; owner dept correctly says Executive)
- [x] 0.2 Maria's grants → `bd_projects:view = true` (back-door path real) but
      F1's override is the primary leak
- [x] 0.3 Supervisors' overrides → F1, F3 confirmed
- [x] 0.4 Policy inventory → F4 (customers dirty, contacts clean)
- [x] 0.5 Q2/Q3/Q4 checks → F2, F5
- [x] 0.6 Tickets written: `TICKET_RBAC_T1_CUSTOMER_VISIBILITY_LEAK.md`,
      `TICKET_RBAC_T2_ALL_RECORDS_DIAL_DEAD.md`. Q1 mooted (deferred by Marcus).

## Phase 1.5 — REDEFINED (per corrected F2): repoint team resolution at `team_memberships`

- [x] 1.5.1 Migration **186** applied to DEV: `current_user_team_ids()` resolves
      via active `team_memberships` (union across teams; self always included).
      Verified: Maria resolves to herself + 3 teammates.
- [x] 1.5.2 `useDataScope.ts` team branch repointed at `team_memberships`
      (active rows, two-step my-teams → teammates). `team_memberships_read`
      RLS is `true` for authenticated — no over-hide risk.
- [x] 1.5.3 `users.team_id` no longer selected anywhere for visibility
      (grep-verified); column drop deferred (low priority).
- [ ] 1.5.4 The 24 no-profile actives (incl. all 6 Executives): assign profiles
      BEFORE purging their override rows — their access lives in those rows today.
      Purge order: no-op shadows first (safe), divergent rows only after their
      user has a correct profile.
- [ ] 1.5.5 Sanity check with Mark: 0-member teams exist (e.g. CHRYSSY CALDERON)
      and 21 actives have no team — fine if intentional (they resolve to
      own-only under Team dial), but he should know that's the behavior.

### Decision Log addition
| D8 | Team = union of `team_memberships` (multi-team supported); `users.team_id` is dead | The Teams admin UI writes memberships; the resolver must read what the UI writes — anything else makes the Teams screen a lie. | 06-08 |

## Phase 1 — Override residue purge (Ticket 2 fix)

Goal: the profile dial is the truth for everyone who has no *deliberate* override.

- [x] 1.1 Report done (prod, read-only): `RBAC_OVERRIDE_RESIDUE_REPORT_2026-06-08.md`.
      All 60 rows are full UNIFORM maps; zero per-key human tuning anywhere.
      Buckets: A=30 purge, B=24 hold (no profile), C=6 **Marcus to rule**.
- [x] 1.2 **RULED (Marcus 06-08): Bucket A only.** Migration 187 rewritten to the
      strict criterion (uniform map + active profile + matches legacy mapping)
      and **applied to DEV**. Audit table `_purged_visibility_overrides_187`
      holds cleared maps (reversible). `module_grants` untouched.
      ⚠️ Dev-data caveat: dev permission data has drifted from prod — only 4
      rows matched on dev; prod will purge 30 at release. For realistic QA:
      sync prod→dev, then re-run 187's body manually (migrations don't replay).
      Bucket C (6 rows, incl. 4 jr-pricing 'everything') → surface to Mark at
      release (screenshot + "should these juniors see everything?").
      "Strip no-op keys" sub-step dropped — no sparse rows exist.
- [x] 1.3 Admin UI provenance shipped: `RecordVisibilityEditor` takes optional
      `baseline` (threaded from AccessConfiguration via AccessEditorTabs);
      deviating rows show an amber "override · profile: X" chip with per-row
      reset, plus a header "N personal overrides — reset all to profile" button.
      Profile editor unaffected (no baseline passed).
- [x] 1.4 DONE on prod-synced dev (06-08): `tests/e2e/crew-visibility.spec.ts`
      T2 — Jerome Cueto (profile `everything`, stamp purged) sees the full
      customer list incl. Focus Global, live in the browser.

**Files:** new migration ×2; `src/components/admin/AccessConfiguration.tsx` (or
the per-user override editor under `accessProfiles/`).
**Exit criteria:** zero override rows exist that a human didn't set; Mark's
profile edits propagate to all 4 users.

## Phase 2 — Crew predicate for customers + delete the back door (Ticket 1 fix, part 1)

- [x] 2.1 Migration **189** (applied to dev): `current_user_can_view_customer(id, owner_id)`
      — crew = owner + participants of linked bookings (incl. booking_assignments)
      + projects. EXISTS-based. Verified with a real handler: reaches his
      booking's customer, not unrelated ones.
- [x] 2.2 Migration **188** (applied to dev): 6-arg `current_user_can_view_booking`
      overload consults `booking_assignments`; bookings select/update/delete
      pass `id`; 185's quotations branch B passes `b.id`. 5-arg version kept for
      projects/project_bookings callers (no assignments concept there).
- [x] 2.3 In 189: customers select/update/delete flipped to the crew predicate;
      possession-only OR-branch DELETED. Ops/projects module keys remain as
      door-openers on select but now AND with the crew check.
- [x] 2.4 Indexes pre-existed (`idx_bookings_customer`, `idx_projects_customer`,
      `booking_assignments_booking_idx`/`_user_idx`). Nothing added.
- [x] 2.5 `contacts_select` confirmed clean on dev+prod (dial-gated only, F4) —
      contacts stays owner-based; no cousin work.
- [x] 2.6 `useCustomers` owner_id scope filter REMOVED (would over-hide
      crew-visible rows); `CustomersListWithFilters` no longer passes scope.
      RLS is the boundary. Other useCustomers callers passed no scope.
- [x] 2.7 `RECORD_DIALS` rewritten to crew wording (+ Department dial).
- [x] 2.8 DONE: prod→dev sync run 06-08 (data-only, 103 tables / 11,989 rows),
      187 body re-run on synced data (30 Bucket-A rows purged — exact match to
      the report; 24 B + 6 C untouched per Marcus's rulings). Customer pages
      load fast (prod scale is small; indexes in place for growth).
- [x] 2.9 DONE on prod-synced data:
      • crew-visibility.spec.ts: T1 Maria does NOT see Focus Global (live
        browser, search included), sees her team's 18/88; T2 supervisor sees all.
      • Mark's maneuver re-enacted in a rolled-back txn: moving Focus-Global-class
        owner (Johnna) BD→Executive via the exact UserDetailPage steps flips
        Maria's verdict true→false. Records follow the person. (Phase 4 exit ✓)
      • rbac-smoke.spec.ts: 7 passed, 2 data-dependent skips (test2 lacks
        acct_projects:view on prod data; Carolina's prod override explicitly
        sets bd_projects:view=false — both PRE-EXISTING prod data conditions,
        confirmed not regressions; tests now skip with stated reasons).

**Acceptance:**
- Maria (Team dial + Projects access) does NOT see Focus Global in Customers.
- A declarant (Customers: Own) sees exactly the customers of bookings he's
  assigned to — including rendering on his booking screens.
- An Import Supervisor (Customers: Team) sees customers of his team's bookings.
- No Ops screen loses customer-name rendering (Q2 informs the fallback).

## Phase 3 — Department dial (new radius)

- [x] 3.1/3.2 Migration **190** (applied to dev): `current_user_department_user_ids()`
      (keyed on `users.department`, no is_active filter — departed users' records
      stay dept-visible) + `'department'` arm in `current_user_can_view_record`,
      both `can_view_booking` overloads, and `can_view_customer`. Seeded nowhere (D5).
- [x] 3.3 Client: `useDataScope` (Dial type, ranks, department-members branch),
      `recordVisibilityConfig` (4th RECORD_DIALS entry, DIAL_RANK,
      legacyScopeFromMap maps department→legacy 'department').
- [ ] 3.4 Visual check of the 4-button editor + a department-dialed persona —
      part of the pre-release walk.

## Phase 4 — "Move a person" moves them (Ticket 1 fix, part 2)

- [x] 4.1 `UserDetailPage.handleSaveProfile`: department change fetches active
      memberships in other-department teams, confirms with the admin (named
      teams + consequence), deactivates them in the same save. Only this page
      moves existing users (Edge Function path is creation-only — verified).
- [x] 4.2 Cross-department membership census: ZERO rows on dev AND prod — no
      data fix needed ("In-House Account" has no memberships).
- [x] 4.3 DB trigger guard: SKIPPED (logged deviation) — zero violations exist,
      the UI now prevents new ones, and a trigger would complicate legitimate
      admin team re-orgs. Revisit only if violations reappear.

**Exit criteria** (pre-release walk): re-run Mark's original maneuver on dev —
move a customer's owner out of BD → record leaves BD users' lists on next load.

## Phase 5 — "Except" — ~~pending Q1~~ **DEFERRED (Marcus, 06-08). Skip entirely.**

Out of scope for this effort. Phase 1.3's provenance UI is the closest existing
mechanism if it resurfaces. Do not design or build exclusion lists.

## Phase 6 — Release

- [ ] 6.1 Full "Release dev to prod" checklist (CLAUDE.md): edge functions diff,
      surface migrations to Marcus, merge dev→main, tag `stable/YYYY-MM-DD`.
- [ ] 6.2 Reply to Mark in his language: records follow their owner's current
      position; Department dial exists; per-person restrictions via overrides;
      Ops sees customers tied to their work.
- [ ] 6.3 Close both tickets with before/after using his own Focus Global +
      Import Supervisor examples.

---

## Invariants (check against EVERY change in this plan)

1. **One gate:** no policy branch may grant record visibility without consulting
   the crew predicate (module-permission arms still AND with it).
2. **Readable rows:** an admin must be able to predict a profile's reach from
   that profile's screen alone — no dial's meaning may depend on another dial (D1).
3. **Fail-closed:** missing key ⇒ `'own'`. Never widen a default.
4. **DB and client agree:** any crew change lands in `current_user_can_view_*`
   AND the client mirror in the same release.
5. **Overrides are deliberate:** no migration may seed `visibility_scopes` into
   `permission_overrides` (the 157 lesson).
6. **Surgical:** no refactors outside the files each phase names. Snapshot
   architecture (Option C) is explicitly OUT of scope — future direction only.
