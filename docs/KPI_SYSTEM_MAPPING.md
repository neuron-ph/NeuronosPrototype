# KPI System Mapping — Falcons Scorecards → Neuron OS

Source: `KPIs/Falcons_KPI-*.pdf` (Guide + 5 department scorecards).
Verified against the **dev** database (`oqermaidggvanahumjmj`) on 2026-07-31.

Superseded drafts in the same folder — `brokerage kpi.pdf`, `KPI 2026 PRICING DEPARTMENT.pdf`,
`KPI FORWARDING.pdf` — are **not** mapped here. Two ideas from them are worth reclaiming and are
noted at the end.

---

## 1. The engine

```
Weighted Score = Weight% × Rating ÷ 5
Final Score    = Σ Weighted Scores          (max 100)
```

Rating is 1–5, assigned per KPI by the evaluator:

| Rating | Descriptor | vs. Target |
|---|---|---|
| 5 | Outstanding | Above target |
| 4 | Very Satisfactory | At target |
| 3 | Satisfactory | 90–99% |
| 2 | Needs Improvement | 70–89% |
| 1 | Poor | Below 70% |

Result bands: **90–100** Outstanding · **80–89** Very Satisfactory · **70–79** Satisfactory ·
**60–69** Needs Improvement · **<60** Performance coaching.

Guide constraint that governs every charge-based KPI:

> Charges, penalties and lapses are counted only when attributable to the employee's own
> delay, error or negligence.

Weights verified to sum to 100% in all five departments.

---

## 2. Classification legend

| Tag | Meaning |
|---|---|
| **A** | Computable today from existing tables/fields. No new capture. |
| **B** | Computable *in principle*, but the field or the adoption doesn't exist yet. |
| **C** | Requires human judgment. Will always be manual entry. |

---

## 3. Whose score is it? — the attribution spine

Before any KPI can be computed, the row has to resolve to one employee.

| Record | Owner field(s) | Notes |
|---|---|---|
| `bookings` | `handler_id`, `supervisor_id`, `manager_id` | plus `booking_assignments` (`role_key`, `user_id`, `service_type`) for the V1 team model |
| `quotations` | `created_by`, `assigned_to` | Pricing owner = `assigned_to`; BDD originator = `created_by` |
| `invoices` | `created_by` | who issued the billing |
| `customers` | `owner_id`, `created_by` | BDD account ownership |
| `evouchers` | `created_by` | not the fault-owner — see §6 |

**Rule:** the KPI owner of a booking-derived metric is `booking_assignments.user_id` for the
role that owns the milestone, falling back to `bookings.handler_id`. Not `created_by` —
whoever typed the booking in is often not who performs the work.

### Department vs. service line — a real mismatch

`users.department` holds: `Operations` (27), `Accounting` (11), `Pricing` (8), `Executive` (6),
`Business Development` (6), `HR` (2).

But the scorecards are **Brokerage / Forwarding / Trucking / Pricing / BDD**.

Brokerage, Forwarding and Trucking are all `Operations`. The discriminator is
`users.service_type` (exists on the table) and `bookings.service_type`
(`Brokerage` 140 / `Trucking` 80 / `Forwarding` 13).

**Scorecard selection = `users.service_type` when department is Operations, else
`users.department`.** This needs to be explicit, not inferred at render time.

---

## 4. BROKERAGE — 9 KPIs

| # | KPI | Wt | Tag | Source / Gap |
|---|---|---|---|---|
| 1 | Lodgment within 24 hrs | 15% | **B** | **No field.** Needs `details.lodgment_date` + `details.final_docs_complete_date` and `details.manifest_date`. Reckoning point is *the later of* complete-docs or manifest. |
| 2 | Final Assessment Notice within 48 hrs | 15% | **B** | **No field.** Needs `details.final_assessment_notice_date`, measured from lodgment. |
| 3 | Demurrage (internal fault) | 10% | **B** | Amounts exist (`evoucher_line_items` → `catalog_items`, e.g. `DLC (DEMURRAGE)` `ci-1779683651652`). Missing: fault flag. See §6. |
| 4 | Detention (internal fault) | 10% | **B** | Same. `DLC (DETENTION)` `ci-1779683632907`. |
| 5 | Storage (internal fault) | 10% | **B** | Same. `PC (STORAGE FEE)` `ci-1779683818303`, `WC (STORAGE & OTHER FEES)`. **Blended items exist** — `PC (ARRASTRE, WHARFAGE DUE & STORAGE FEE)` bundles storage with non-KPI charges and cannot be isolated. See §6. |
| 6 | Penalties / Lapses (BOC etc.) | 10% | **C** | `CC (PENALTY)`, `TC (OTHER PENALTY)` give monetary amounts, but "documented lapses" is a count a supervisor logs. Needs an incident record. |
| 7 | Punctuality | 10% | **C** | **No attendance table anywhere in the schema.** |
| 8 | Behavior | 10% | **C** | Supervisor judgment. Permanent manual. |
| 9 | Billing within 24 hrs of delivery | 10% | **A** | `invoices.invoice_date` − `bookings.details.date_delivered` ≤ 24h, over bookings where `date_delivered` is set. Owner = `invoices.created_by`. |

**Auto-coverage today: 10%. After the milestone-date fields land: 40%. After fault tagging: 70%.**

---

## 5. FORWARDING — 8 KPIs

| # | KPI | Wt | Tag | Source / Gap |
|---|---|---|---|---|
| 1 | Late Manifest | 20% | **B** | **No field.** Needs `details.manifest_submitted_at` + the carrier cut-off to compare against. Cut-off is not stored either — nearest existing anchor is `details.etd` / `details.etb`. |
| 2 | Penalties / Lapses | 15% | **C** | Same shape as Brokerage #6. |
| 3 | Demurrage | 10% | **B** | Same as Brokerage #3. |
| 4 | Detention | 10% | **B** | Same as Brokerage #4. |
| 5 | Storage | 10% | **B** | Same as Brokerage #5. |
| 6 | Punctuality | 10% | **C** | No attendance data. |
| 7 | Behavior | 10% | **C** | Manual. |
| 8 | Billing within 24 hrs | 15% | **A** | Same query as Brokerage #9. |

**Auto-coverage today: 15%. After manifest field: 35%. After fault tagging: 65%.**

---

## 6. PRICING — 6 KPIs

| # | KPI | Wt | Tag | Source / Gap |
|---|---|---|---|---|
| 1 | Quotation TAT (all types, one item) | 35% | **A** | `activity_log` status transition `Pending Pricing` → `Priced` (37 events already recorded). **Not** `submitted_at` — see correction below. |
| 2 | Misquote / Lapses | 15% | **C** | No misquote record exists. `quotations.status = 'Disapproved'` (9 rows) is the closest proxy but conflates approval rejection with actual pricing error. Needs an explicit flag. |
| 3 | Billing within 24 hrs | 15% | **A** | Same query as above. |
| 4 | Sales Quota | 15% | **B** | Numerator exists (`quotations.total_selling` where status ∈ won states). **Denominator does not** — there is no per-user quota field anywhere. |
| 5 | Punctuality | 12% | **C** | No attendance data. |
| 6 | Behavior | 8% | **C** | Manual. |

### KPI #1 turnaround thresholds (from the Pricing PDF)

| Quotation type | TAT | Maps to |
|---|---|---|
| Freight — Intra-Asia | 24 hrs | `services` contains `Forwarding` + origin/dest inside Asia |
| Freight — Outside Asia | 48 hrs | `services` contains `Forwarding` + outside Asia |
| Brokerage — All-In | 24 hrs | `services` contains `Brokerage`, all-in variant |
| Brokerage — Regular / Non-Regular | 12 hrs | `services` contains `Brokerage`, regular variant |
| Trucking | 12 hrs | `services` contains `Trucking` |
| Marine Insurance | 24 hrs | `services` contains `Marine Insurance` |
| Miscellaneous | 24 hrs | `services` contains `Others` |

### Correction: `submitted_at` and `converted_at` are dead columns

Both exist on `quotations` and are **NULL on all 290 rows**. Nothing writes them. Any KPI built
on them returns nothing.

The working clock is in `activity_log`, which records quotation status transitions with
timestamps and `user_id`:

| Transition | Count | Meaning |
|---|---:|---|
| `Draft` → `Pending Pricing` | 44 | BDD hands off — **TAT clock starts** |
| `Pending Pricing` → `Priced` | 37 | Pricing completes — **TAT clock stops** |
| `Priced` → `Sent to Client` | 49 | release to client |
| `Sent to Client` → `Accepted by Client` | 46 | won |
| `Priced` → `Needs Revision` | 2 | rework signal — feeds Misquote (#2) |

This is strictly better than a `submitted_at` column would have been. It's already populated,
it's already attributed to a user, and it works **retroactively on historical data**. Pricing #1
is computable today with zero new capture.

`Priced → Needs Revision` (2 events) is also a usable objective signal for **Misquote (#2)** —
it downgrades that KPI from pure judgment to system-proposed.

**Multi-service quotes:** `services` is an array; multi-service is normal (Forwarding 179 /
Brokerage 133 / Trucking 63 / Marine Insurance 3 / Others 1 across 290 quotes). **Decision:
strictest (shortest) applicable TAT wins.** A quote isn't finished until every leg is priced,
so the tightest deadline governs. Store the resolved threshold on the score row so the number
is auditable after the fact.

**Intra-Asia vs Outside Asia — solved.** `bookings.details.country_of_origin` holds clean country
names (China, Indonesia, Malaysia, France, Tunisia…) on 145 bookings, and `profile_countries` has
164 rows with `iso_code`. Add `profile_countries.region` and the split is a join. Quotations need
the same `country_of_origin` capture that bookings already have.

*(Do not use `pol_aol`/`pod_aod` for this — the values are inconsistent free text:
`PORT OF SHANGHAI (CNSHA)`, `Port of Shanghai (CNSHA)`, `CHINA`, `PASIR GUDANG, MALAYSIA` all
appear. `profile_locations.country_id` exists but is NULL on every row.)*

**Reckoning point:** use the `Draft → Pending Pricing` transition, not `created_at`. That is the
moment the inquiry actually lands on Pricing's desk, which is exactly what the PDF means by
"receipt of complete inquiry." No new `inquiry_received_at` field needed.

**Auto-coverage today: 50%. After quota values + region column: 77%.**

---

## 7. TRUCKING — 11 KPIs

(The source PDF numbers these 1, 3–12 — there is no #2. Numbering artifact in their sheet;
weights still sum to 100%.)

| # | KPI | Wt | Tag | Source / Gap |
|---|---|---|---|---|
| 1 | On-Time Delivery / Container Pull-Out | 25% | **A** | `details.date_delivered` vs `details.preferred_delivery_date`; `details.pull_out_date` vs the agreed schedule. Both fields exist and are populated (76 / 80 bookings). |
| 3 | Demurrage | 8% | **B** | Fault flag missing. |
| 4 | Detention | 8% | **B** | Fault flag missing. `details.empty_return_date` + `details.det_dem_validity` exist and could *derive* whether return was late — a better signal than the charge amount. |
| 5 | Storage | 8% | **B** | Fault flag missing. `details.storage_validity` exists (20 bookings). |
| 6 | Penalties / Lapses (LTO/LTFRB/traffic) | 10% | **C** | No violation record. |
| 7 | Damage-Free Delivery / Cargo Safety | 10% | **C** | No incident record. |
| 8 | Vehicle Maintenance & Roadworthiness | 8% | **B** | `vehicles` table exists (9 rows: `plate_number`, `vehicle_type`, `capacity`, `is_active`) but has **no PMS schedule, no service history, no breakdown log**. |
| 9 | Trip Documentation Accuracy | 5% | **C** | `booking_attachments` exists but there is no completeness checklist to score against. |
| 10 | Punctuality | 8% | **C** | No attendance data. |
| 11 | Behavior | 5% | **C** | Manual. |
| 12 | Billing within 24 hrs | 5% | **A** | Same query. |

Trucking has richer per-trip data than the other lines — `driver`, `helper`,
`vehicle_reference_number`, `truck_type`, `pull_out_location` all live in `details`. Driver-level
attribution is more natural here than anywhere else.

**Auto-coverage today: 30%. After fault tagging + PMS: 54%.**

---

## 8. BUSINESS DEVELOPMENT — 8 KPIs

| # | KPI | Wt | Tag | Source / Gap |
|---|---|---|---|---|
| 1 | Calls — 40/week | 12% | **B** | `crm_activities` has exactly the right shape (`type`, `date`, `user_id`, `customer_id`) — and **0 rows**. The table is unused. This is an adoption problem, not a schema problem. |
| 2 | Emails — 40/week | 12% | **B** | Same table, same problem. Also: is a logged email self-reported or captured? Self-reported activity counts are gameable by design. |
| 3 | Meetings — 3/week | 13% | **B** | Either `crm_activities` (unused) or `calendar_events` (36 rows, has `event_type`, `created_by`, `start_at`). Calendar is the better source — it's a byproduct of real work rather than a logging chore. |
| 4 | New Customer — ≥1/month | 20% | **A** | `count(customers) where created_at in period and owner_id = user`. 147 customers exist. Needs a definition call: "onboarded" = customer row created, or = first booking secured? The PDF says both. |
| 5 | Set Targeted Quota | 20% | **B** | Same missing denominator as Pricing #4 — no per-user quota field. |
| 6 | Punctuality | 8% | **C** | No attendance data. |
| 7 | Behavior | 7% | **C** | Manual. |
| 8 | Penalties / Lapses | 8% | **C** | Manual. |

**Auto-coverage today: 20%. After CRM adoption + quota field: 77%** — the highest ceiling of any
department, because BDD work is inherently loggable.

---

## 9. Coverage summary

Revised after the `activity_log` finding and with **HR confirmed as an upcoming module**
(which resolves Punctuality — 8–12% in every department).

Four honest tiers, not two:

| Tier | What it means | Human effort |
|---|---|---|
| **Automatic** | System computes it. Nobody touches it. | none |
| **Proposed** | System computes the amount *and* proposes the verdict; a human confirms or overrides with a reason. | one click |
| **Logged** | Human records an event; system counts and scores it. | structured entry |
| **Judgment** | Irreducibly a person's opinion. | full manual |

| Department | Automatic | Proposed | Logged | Judgment |
|---|---:|---:|---:|---:|
| Brokerage | 50% | 30% | 10% | 10% |
| Forwarding | 45% | 30% | 15% | 10% |
| Pricing | 77% | 15% | 0% | 8% |
| Trucking | 46% | 24% | 25% | 5% |
| BDD | 61% | 0% | 32%\* | 7% |
| **Average** | **56%** | **20%** | **16%** | **8%** |

\* BDD's 32% includes Calls (12%) + Emails (12%) as self-reported activity — see Q7.

**The number that matters: ~8% of the entire company-wide scorecard is irreducibly human.**
That's Behavior, and Behavior *should* be human. Everything else is either computed, or a
one-click confirmation of something the system already worked out.

Earlier draft of this doc said "~32% permanently manual." That was wrong — it counted the
Proposed and Logged tiers as manual, and it predated both the `activity_log` finding and the
HR module.

---

## 10. What has to be built — four things, in dependency order

### 10.1 Fault attribution on charge lines — *unblocks 11 KPIs across 4 departments*

This is the single highest-leverage change and it is not optional. The Guide's "own delay,
error or negligence" clause means a demurrage amount without a fault verdict is not a KPI input.
It's just a number.

Add to `evoucher_line_items` (and mirror on `billing_line_items` for pass-through charges):

- `fault_class` — `internal` | `external` | `untagged` (default `untagged`)
- `fault_owner_user_id` — who it's charged against
- `fault_tagged_by`, `fault_tagged_at`, `fault_reason`

Untagged charges are excluded from KPI computation and surfaced as a supervisor work queue.
**Untagged must never silently count as zero** — that would make every scorecard look clean by
default and quietly destroy trust in the number.

### 10.2 A charge classification on the catalog — *makes 10.1 queryable*

Do **not** match charge types by `LIKE '%DEMURRAGE%'`. The catalog proves why:

- `DLC (DEMURRAGE)` and `DLC (DETENTION)` are distinct items — fine
- `PC (ARRASTRE, WHARFAGE DUE & STORAGE FEE)` **blends** storage with two non-KPI charges in
  one line item. There is no way to extract the storage portion.
- `WC (STORAGE & OTHER FEES)` — same problem
- `DETENTION/DEMURRAGE CHARGES` (`ci-1781693494990`) blends the two KPIs together
- Penalties live under three unrelated categories: `(EXP) MISCELLANEOUS`, `(EXP) TRUCKING`

Add `catalog_items.kpi_charge_class` — `demurrage` | `detention` | `storage` | `penalty` | `null`.
Per catalog doctrine this is a data attribute, set once by whoever owns the catalog, not a
hardcoded name list.

The blended items need a decision from Falcons: either split them into separate catalog items,
or accept that shipments using them can't be scored on that KPI. **Splitting is the right answer** —
a blended item also can't be reconciled against a shipping line invoice.

### 10.3 Operational milestone timestamps — *unblocks the two biggest single KPIs*

Brokerage Lodgment (15%) + FAN (15%) + Forwarding Late Manifest (20%). Nothing else in the
schema comes close to that weight.

New keys on `bookings.details` (or a proper `booking_milestones` table — see the note below):

| Key | Feeds | Reckoning |
|---|---|---|
| `final_docs_complete_date` | Brokerage #1 | start of the 24h clock (whichever is later) |
| `manifest_date` | Brokerage #1 | start of the 24h clock (whichever is later) |
| `lodgment_date` | Brokerage #1 end, #2 start | |
| `final_assessment_notice_date` | Brokerage #2 | end of the 48h clock |
| `manifest_submitted_at` | Forwarding #1 | vs. carrier cut-off |
| `manifest_cutoff_at` | Forwarding #1 | the deadline to beat |
| `inquiry_received_at` | Pricing #1 | on `quotations`, not bookings |

**`booking_chronological_logs` cannot substitute for this.** It has `subject` / `note` as free
text with an `event_at` — good for a human reading a history, useless for computing a turnaround.

### But `activity_log` already captures the milestones as a byproduct

`activity_log` is **field-granular**. Real rows from the booking history:

```
action_type='updated'  old_value=''  new_value='T-49969'
metadata={"description": "Updated entry_number"}     2026-06-30 03:02:32

action_type='updated'  old_value=''  new_value='Orange'
metadata={"description": "Updated selectivity_color"} 2026-06-30 03:02:32
```

Every `details` field transition is already timestamped and attributed to a `user_id`
(698 booking-update events, 276 booking status changes on dev).

Which means the milestones are **derivable retroactively, today, with no new capture**:

| Milestone | Existing proxy | First-set event |
|---|---|---|
| Lodgment | `details.entry_number` populated (83 bookings) | you can't lodge without an entry number |
| Assessment / FAN | `details.selectivity_color` populated (56) | selectivity is issued at assessment |
| Duties settled | `details.customs_duties_taxes_paid` (36) | |
| Delivery | `details.date_delivered` (76) | |
| Empty return | `details.empty_return_date` (53) | |

**This changes the answer to "who stamps it."** Nobody stamps anything new. The handler already
fills these fields as part of normal work; the system already timestamps the moment they do.
The only thing missing is a **declaration of which field transition means which milestone** —
which is config, not a workflow change.

**The one real caveat:** `activity_log` records when the value was *entered*, not when the event
*happened*. A declarant who lodges Monday and types it Thursday gives you Thursday.

So keep both:

- **`occurred_at`** — the date the user enters (real-world event date). Needs the explicit
  date fields above.
- **`recorded_at`** — from `activity_log` / the milestone row (when it hit the system).

The gap between them is itself a data-hygiene metric worth watching. And until the explicit
date fields exist, `recorded_at` alone is a usable proxy that lets you **backfill KPI history
from day one instead of starting from zero.**

*Table vs. JSONB:* `details` is the existing convention and the cheapest path. But milestones
want `(booking_id, milestone_key, occurred_at, recorded_by, recorded_at)` — who stamped it and
when they stamped it, which JSONB doesn't give you. A stamped-late milestone is itself a signal.
Recommend a real `booking_milestones` table; it also makes the whole KPI query set trivial.

### 10.4 Per-user targets — *unblocks 2 KPIs at 20% and 15%*

Sales quota (BDD #5, Pricing #4) has a numerator and no denominator. There is no quota field
in the schema.

Needs `user_targets` — `user_id`, `period`, `metric_key`, `target_value`. Same table serves
BDD's calls/emails/meetings weekly targets, so their 40/40/3 stop being hardcoded.

### Deferred (real, but lower leverage)

- **Attendance** — 8–12% of *every* department (≈41 points of weight across the five scorecards,
  more than any single KPI). **HR is an upcoming module**, so this resolves itself — but the KPI
  layer should define the `attendance_punctuality` metric key now so HR has a contract to satisfy
  when it lands, rather than KPIs being retrofitted onto whatever HR happens to build.
- **Incident log** — penalties, lapses, misquotes, cargo damage, trip-doc errors. One generic
  `incidents` table (`type`, `user_id`, `booking_id?`, `occurred_at`, `severity`, `notes`,
  `logged_by`) would serve ~8 KPIs across all departments. Cheap, high coverage, but every entry
  is a human judgment — it makes manual entry *structured*, it does not make it automatic.
- **Vehicle PMS** — Trucking #8 only. Needs a maintenance schedule + service history on `vehicles`.

---

## 11. KPI definitions must be data, not code

Falcons will change a weight. The next client will have a different scorecard entirely.

```
kpi_definitions
  id, department | service_line, sort_order
  name, definition_text, target_text, measurement_text     -- verbatim from the PDF
  weight_pct
  source: 'auto' | 'manual'
  metric_key      -- e.g. 'billing_tat_24h', null when manual
  target_value, target_unit, direction ('higher_better'|'lower_better'|'zero_target')
  effective_from, effective_to                              -- weights change; history must survive
```

`direction` is what makes the rating suggestion possible. `zero_target` KPIs (all the
demurrage/penalty ones) cannot use the Guide's percentage-of-target scale — 90% of zero is
meaningless. They need their own rule, e.g.:

```
zero_target:  0 incidents/₱0 → 5 · 1 → 3 · 2 → 2 · 3+ → 1
```

That threshold set is a Falcons decision, and it should live in `kpi_definitions` as data
too — not baked into a function.

Same reasoning as `routing_rules`: declare, don't derive. Add rows, not code.

---

## 12. Scoring records

```
kpi_periods        id, label ('2026-07'), start_date, end_date, status (open|locked)

kpi_scores         id, period_id, user_id, kpi_definition_id
                   actual_value          -- auto-filled where source='auto'
                   actual_source         -- 'computed' | 'manual'
                   suggested_rating      -- from actual + direction + thresholds
                   rating                -- what the evaluator actually chose
                   override_reason       -- required when rating != suggested_rating
                   weighted_score        -- generated: weight × rating / 5
                   evaluated_by, evaluated_at
```

The **suggest-then-override** pattern is the whole point. The system proposes a rating from
real data; the supervisor can disagree, but the disagreement is recorded and visible. That is
what converts a scorecard from an opinion into an audited number — without pretending a query
can grade someone's professionalism.

`weighted_score` should be a generated column so the arithmetic can't drift.

---

## 13. Two ideas from the superseded drafts worth reclaiming

- **Client Response Time** (old `KPI FORWARDING.pdf`: email, 30 min – 1 hr, 30% weight) — dropped
  from the Falcons version. It's the only customer-facing KPI in the entire set. Everything else
  measures internal compliance. If Neuron ever gets email/ticket timestamps, this is worth
  bringing back — `tickets` / `ticket_messages` already exist and could carry it.
- **Departmental profitability** (old `KPI 2026 PRICING DEPARTMENT.pdf`: gross sales, expense,
  profit, overall margin) — dropped, and weights were never assigned. But `bookings.total_revenue`
  and `total_cost` are already there, so margin per handler is computable today. Not currently
  any department's KPI, though it's arguably the most important number in the company.

---

## 14. The ten questions — answered

An earlier draft listed these as "open questions for Falcons." Most of them weren't Falcons'
to answer. Decisions below; only Q8 needs input, and it doesn't block the build.

**Q1 — Who stamps lodgment / FAN / manifest?** *Resolved: nobody stamps anything new.*
`activity_log` already timestamps every `details` field transition with a `user_id`. Declare
which field transition means which milestone (config), derive history retroactively from
`entry_number` / `selectivity_color`, and add explicit date fields going forward so `occurred_at`
is separable from `recorded_at`. See §10.3.

**Q2 — Who tags fault on a charge?** *Decision: the system proposes, the handler's supervisor
confirms, at liquidation review.*
Not the handler — self-assessment of own fault at 30% of your own scorecard is not a control.
Not accounting — they see the amount, not the cause.
Critically, the system can **propose the verdict** rather than asking cold: if lodgment
breached 24h *and* demurrage exists on the same booking, internal fault is the high-confidence
default. Late empty return (`empty_return_date` past `det_dem_validity`) + detention charge —
same. That turns a blank judgment call into a one-click confirmation with evidence attached.

**Q3 — Split the blended catalog items?** *Decision: yes, split them. This is not theoretical.*
Actual usage in dev:

| Item | Line items | Scoreable? |
|---|---:|---|
| `PC (ARRASTRE, WHARFAGE DUE & STORAGE FEE)` | 13 | no |
| `WC (STORAGE & OTHER FEES)` | 9 | no |
| `PC (ARRASTRE, WHARFAGE DUE, REEFER & STORAGE FEE)` | 1 | no |
| `PC (STORAGE FEE)` | 6 | yes |
| `DLC (DETENTION)` | 1 | yes |

**23 of 30 storage-bearing line items are blended and cannot be scored.** The Storage KPI would
be computed off 20% of the data and silently look clean. Splitting is also required for
reconciliation against shipping-line invoices, so it pays for itself twice.

**Q4 — Multi-service quotation TAT?** *Decision: strictest applicable wins.* A quote isn't
finished until every leg is priced. Store the resolved threshold on the score row for audit.

**Q5 — Intra-Asia vs Outside Asia?** *Resolved: derive it.* `details.country_of_origin` is clean
(145 bookings), `profile_countries` has 164 rows with `iso_code`. Add
`profile_countries.region` and join. Do not use `pol_aol`/`pod_aod` — inconsistent free text.

**Q6 — "New customer onboarded"?** *Decision: `status` transition `Prospect` → `Active`, credited
to `owner_id`.*
`lifecycle_stage` is NULL on all 147 customers — dead column, ignore it. `status` is live and
meaningful (Active 101 / Prospect 43 / Inactive 3), and `activity_log` has 229 `customer updated`
events, so the transition date is recoverable. This beats both alternatives: "record created"
rewards typing a name into the CRM, "first booking" is the ops team's outcome, not BDD's.

**Q7 — BDD calls/emails: self-reported or captured?** *Decision: split the three.*
- **Meetings (13%)** → `calendar_events` (36 rows, has `event_type`, `created_by`, `start_at`).
  A meeting with a client on the calendar is a real artifact, not a claim. **Automatic.**
- **Calls + Emails (24%)** → stay self-reported via `crm_activities` until there's a mail/telephony
  integration. Be honest that this is an activity *log*, not a measurement.

Mitigation without integration: require a `customer_id` on every logged activity, and surface
logged-activity-to-outcome ratios on the BDD dashboard. A rep logging 40 calls a week against
three accounts with zero new quotes is visible without accusing anyone of anything.

**Q8 — Where do sales quotas come from?** *Needs Falcons — but does not block anything.*
Build `user_targets` now with the mechanism; the numbers get entered when Falcons sets them.
A KPI with a null target renders as "target not set" and is excluded from the weighted total,
with the remaining weights renormalised. Missing config must never silently score as zero.

**Q9 — Zero-target rating thresholds?** *Decision: ship a default, make it tunable.*

```
zero_target (incidents):   0 → 5 · 1 → 3 · 2 → 2 · 3+ → 1
zero_target (peso value):  ₱0 → 5 · then banded against the booking's own revenue,
                           so a ₱5k demurrage on a ₱40k booking is not scored
                           the same as ₱5k on a ₱2M booking
```

The peso variant matters — a flat peso band punishes whoever handles small shipments.
Both live in `kpi_definitions` as data, so Falcons tunes rows, not code.

**Q10 — Attendance?** *Resolved: HR is an upcoming module.* Punctuality (8–12% in every
department, ~41 weight points company-wide) becomes automatic when HR ships. Until then it is a
manual field, and it is the single largest block of temporarily-manual weight in the system.

### Still genuinely unresolved

Only one, and it is a data-quality question rather than a design one:

**Does `activity_log` write reliably enough to be a KPI source of record?** It is currently an
audit trail — nothing depends on it. The moment KPIs read from it, a missed write becomes a
missed KPI. Before wiring it in, confirm every `details` mutation path writes an entry
(bulk edits, imports, and Edge Function writes are the likely gaps).

The safe pattern: derive milestones into a real `booking_milestones` table at write time, and
treat `activity_log` as the backfill source for history — not as the live query surface.
