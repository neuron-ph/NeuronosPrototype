# The adversarial pass — phase 1 recon

Six read-only mappers, run in parallel against dev, feeding the generated probe
matrices in phase 2. The full machine-readable output is `phase1-spec.json`
(227KB); this file is the part a human needs.

Nothing here was inferred from the app code alone. Every mapper was told to ask
the database first and to report where the app and the database disagree — which
turned out to matter, repeatedly.

---

## What the recon found before a single probe ran

Three of these are new holes. Two of them are in code I changed the same day,
which is the useful part: the fixes were real, and both were narrower than the
problem they addressed.

### J1 — `send_billing_items_to_booking` still carries the H2 shape, one line down · BUG
Migration 271 fixed the authorization guard at the top of this function. Six
lines below it sits the cross-customer guard:

```sql
IF v_booking_project_id IS NOT NULL AND v_booking_project_id <> v_project_id THEN
  RAISE EXCEPTION 'Booking % is not linked to project %', ...
```

**230 of 239 dev bookings have `project_id` NULL.** The `AND` short-circuits and
the tenant check never fires. So a legitimately-granted Accounting/Pricing/BD
user can post revenue onto customer A's booking while naming customer B's
project — through a SECURITY DEFINER function, with RLS switched off.

Same NULL-swallows-the-guard shape as H2, in the same function, surviving the
migration that hardened it. H2 was `NULL NOT IN (...)`; this is
`NULL IS NOT NULL AND ...`. Both read as a check and neither fires.

**Action.** Fix the guard (require the booking to resolve to a project, or
compare on `project_number` which is actually populated), and re-probe. The
positive control is one of the 9 bookings that does carry `project_id` — it
should raise today.

### J2 — Migration 270 froze `status` and left the fields that decide its route · BUG
The recon's sentence, which is better than mine: *closing `status` without
freezing the fields that decide `status`'s route is a lock on the door beside an
open window.*

`evoucher_transition` compares
`COALESCE(pending_approver_department, details->>'requestor_department')` to the
caller's department. Both of those inputs are plain columns on the voucher, and
the `evouchers_update` owner branch places **no column restriction** — only
`status` carries a guard trigger.

So the requestor can, on her own pending voucher: null out
`pending_approver_department`, set `details.requestor_department` to
`'Operations'`, and the arm's-length routing rule (Forwarding expenses → Pricing
Manager, which exists precisely so her own boss doesn't approve her spend) is
defeated. Her own manager then satisfies the manager edge legitimately.

Two more fields on the same row are equally free:

- `details.cash_receiver_id` — a **skeleton key**. Whoever is named gets read
  visibility, UPDATE on every column except `status`, and the right to walk the
  liquidation edge (i.e. declare how the cash was spent). It appears in both
  `USING` and `WITH CHECK`, so it is self-perpetuating. The requestor can appoint
  herself both requestor and liquidator, or appoint an accomplice who edits
  amount/vendor/bank details *after* disbursement.
- `details.is_billable` — flipping it fires
  `ensure_billable_expense_billing_item()`, a SECURITY DEFINER writer that
  inserts a customer-facing revenue line on the linked booking, bypassing the
  billings policies entirely and writing `catalog_item_id` NULL. A user with **no
  billings grant at all** can plant a billable charge on a customer's booking
  through the expense side.

**Action.** Extend the 270 guard from one column to the set that decides
routing and authority: `pending_approver_department`, `pending_approver_role`,
and the `details` keys `requestor_department`, `cash_receiver_id`, `is_billable`.
Owner-writable is fine for the descriptive parts of `details`; these five are not
descriptive.

### J3 — Tenancy is a convention, not a boundary · BUG (structural)
Not one RLS policy on `billing_line_items`, `evouchers`, `evoucher_line_items`,
`invoices` or `collections` mentions a customer, a project or a booking. **15 of
22 foreign-key edges have nothing at all enforcing that child and parent belong
to the same customer.**

The consequences are already visible in live dev data: 13 billing rows have a
`customer_name` that disagrees with their booking. That is not a hypothetical —
it is drift that happened through ordinary use.

The nastiest variant propagates by itself: a billable e-voucher pointed at
another customer's booking auto-mints a receivable there via the trigger above.
**That trigger wrote 97 of the 172 billing rows on dev** — it is the dominant
writer of revenue, not an edge case.

**Action.** Decide whether tenancy is meant to be enforced at all. If yes it
belongs in constraints/triggers, not in forms. Ranked probe list is in
`phase1-spec.json` → `fks.probes`.

---

## The maps themselves (feeding phase 2)

| mapper | what it produced |
|---|---|
| `grants` | 93 tables, 372 action cells, 21 helper functions expanded to their full grant-key lists. **227 of 372 cells are predictable from grants alone**; the other 145 carry extra conditions (visibility dials, department matches, status conditions, owner comparisons) and must be marked "grant-necessary, not sufficient". Confirms E15's NULL-owner pattern is still exactly 3 policies, all on `billing_line_items`. |
| `states` | `evouchers` is the **only** status-bearing table in the schema with a transition guard. 15 other status columns across 12 tables are plain text any grant-holder can write. Also: live values, TypeScript constants and CHECK constraints disagree on nearly every table — `evouchers` has 9 live values against 26 in code. The 24 declared edges of `evoucher_transition` are transcribed for the generator to compare against. |
| `fks` | 22 edges, 15 unenforced, ranked probe list. |
| `jsonb` | 6 decision-bearing JSONB fields, 4 tamper probes. |
| `fixtures` | Minimal valid insert payload for 15 tables. Only **six** NOT NULL columns without defaults across all of them — the schema is permissive, which is good news for the harness and bad news generally. |
| `actors` | 12-user roster covering every department, both live AP keys, and all four visibility dials in use. |

## Corrections the recon made to our own assumptions

Worth reading before writing probes against any of these:

- **Role tiers don't exist as documented.** `users.role` has exactly three values
  on dev: `staff`, `team_leader`, `manager`. There is no `supervisor` and no
  `executive` role. "Executive" is a *department* whose members are all
  `manager`. `jr.supervisor07` is a `team_leader`. Any probe keyed on
  `role = 'supervisor'` matches zero rows. (This contradicts
  `project_role_hierarchy` in the working notes.)
- **The `department` visibility dial is never used.** The branch exists in
  `current_user_can_view_record()`, but across 60 users and 1,003 dial entries
  the only values present are `own`, `everything`, `org_wide` and `team`.
- **`permission_overrides.scope` is dead for RLS.** Populated, and read by
  `current_user_visibility_scope()`, but no policy on any table calls that
  function.
- **`team` has two contradictory sources.** `users.team_id` is NULL for all 60
  users, but `team_memberships` holds 53 rows across 39 users — and
  `current_user_team_ids()` reads the latter. The dial is live even though the
  users table says nobody has a team.
- **`acct_evouchers:disburse` has exactly two holders on dev**, both on the
  roster, so that coverage is complete. **No user holds any `acct_invoices:*`
  key** — that module doesn't exist in `module_grants`; invoice authority runs
  through `current_user_can_invoices()`'s 17-key OR-chain instead.
- **Three roster accounts have not signed in recently** (`hrmanager@` never,
  `wenchemaes@` and `jr.cusdec01@` before the August batch). Smoke-test their
  logins before the matrix run — a failed sign-in would read as "blocked
  everywhere" and manufacture a whole row of false findings.
