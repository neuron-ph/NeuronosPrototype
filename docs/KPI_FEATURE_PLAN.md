# Performance / KPIs — Feature Plan

Companion to `docs/KPI_SYSTEM_MAPPING.md` (which maps all 42 Falcons KPIs to schema).
This document is the feature design: what gets built, where it lives, in what order.

Status: **plan only — no code written.**

---

## 1. The product decision

The Falcons scorecard was designed for a spreadsheet: filled once a month, looking backwards,
by a supervisor reconstructing what happened.

Neuron OS holds the underlying data continuously. So the feature is **not** a digital version of
that spreadsheet.

> **The scorecard is a live number. The evaluation is a snapshot taken when the period closes.**

A declarant on the 12th sees they're at 78 and that two late lodgments caused it — while there's
still time to fix it. Month-end sign-off still happens, still produces the signed PDF Falcons
needs, but it's a byproduct rather than the point.

This single decision drives everything below.

### What it must not become

- **A surveillance dashboard.** The default audience for a scorecard is its owner. Everyone else
  is a deliberate grant.
- **A black box.** Every computed number drills down to the rows behind it. See §7.
- **Falsely precise.** A KPI with no data doesn't score zero — it's excluded and the weights
  renormalise, visibly. See §6.

---

## 2. Where it lives

Three surfaces, mapping onto departments that already exist in `src/config/access/accessSchema.ts`.

### Personal → **My Scorecard** — `/my-scorecard`

Every employee. Own score only. Live.

- Current period score + band, big
- The KPI list: weight, target, actual, rating, contribution
- What's dragging the score, ranked
- Trend across the last 6 periods
- Every actual drills into its source rows

### HR → **Performance** — `/hr/performance`

The engine. `hr` is currently `{ id: "hr", moduleId: "hr", label: "HR", pageId: "hr", tabs: [] }`
— an empty module, so this is a clean place to add.

Tabs:

| Tab | Purpose |
|---|---|
| **Scorecards** | All employees the viewer is allowed to see, current period, sortable |
| **Review** | The evaluator's working surface — enter manual actuals, confirm/override ratings |
| **Queues** | Untagged fault charges, missing milestones, unrated KPIs — §5 |
| **Periods** | Open / close / lock evaluation periods, sign-off state |
| **Setup** | KPI definitions, weights, targets, thresholds — §4 |

### Executive → rollup

Department-level comparison, distribution across bands, outliers. A tab on Performance rather than
a separate module — same data, different grant.

### Employee Profile

`src/components/EmployeeProfile.tsx` already exists. Add a **Performance** tab showing that
person's scorecard history. Reuses the same components; no new data path.

---

## 3. Data model

Five tables. Names follow existing conventions.

```
kpi_definitions
  id
  scorecard_key            -- 'brokerage' | 'forwarding' | 'pricing' | 'trucking' | 'bdd'
  sort_order
  name
  definition_text          -- verbatim from the PDF, shown on hover
  target_text
  measurement_text
  weight_pct
  source                   -- 'auto' | 'proposed' | 'logged' | 'judgment'
  metric_key               -- resolver key, null when not auto
  target_value, target_unit
  direction                -- 'higher_better' | 'lower_better' | 'zero_target'
  rating_thresholds        -- jsonb; see §4
  effective_from, effective_to
```

```
kpi_periods
  id, label ('2026-07'), start_date, end_date
  status                   -- 'open' | 'in_review' | 'evaluated' | 'reviewed' | 'locked'
  opened_at, closed_at, locked_at
```

```
kpi_scores
  id, period_id, user_id, kpi_definition_id
  weight_pct_snapshot      -- weights change; a locked period must not move
  actual_value
  actual_source            -- 'computed' | 'manual'
  actual_computed_at
  evidence                 -- jsonb: the row ids behind the number (§7)
  suggested_rating
  rating
  override_reason          -- required when rating != suggested_rating
  excluded, excluded_reason -- §6
  weighted_score           -- generated: weight_pct_snapshot * rating / 5
  evaluated_by, evaluated_at
```

```
kpi_period_signoffs
  id, period_id, user_id (the employee being evaluated)
  step                     -- 'prepared' | 'reviewed' | 'noted'
  actor_user_id, acted_at, remarks
```

```
user_targets
  id, user_id, period_id, metric_key, target_value
```

Plus the enabling changes from the mapping doc:

- `booking_milestones` — `booking_id`, `milestone_key`, `occurred_at`, `recorded_by`, `recorded_at`
- `evoucher_line_items.fault_class` / `fault_owner_user_id` / `fault_tagged_by` / `fault_tagged_at` / `fault_reason`
- `catalog_items.kpi_charge_class`
- `profile_countries.region`

### Why `weight_pct_snapshot`

Falcons will change a weight mid-year. A locked period must render exactly as it was signed.
Same reasoning as `catalog_snapshot` and `applied_rates` — the pattern is already established
in this codebase.

---

## 4. Definitions are data (the `routing_rules` pattern)

Per project doctrine: **declare, don't derive.** `routing_rules` already proved this for approvals;
KPI definitions are the second consumer of the same idea.

Falcons changes a weight from 15% to 20% → row edit, `effective_from` set, no deploy.
Next client has a different scorecard entirely → rows, not a fork.

### Rating thresholds as data

The Guide's percentage-of-target scale only works for percentage KPIs. Zero-target KPIs
(all the demurrage/penalty ones) need their own rule, and it must be tunable:

```jsonc
// direction: 'higher_better'  — Guide default
{ "5": ">100", "4": "100", "3": "90-99", "2": "70-89", "1": "<70" }

// direction: 'zero_target', unit: incidents
{ "5": 0, "3": 1, "2": 2, "1": "3+" }

// direction: 'zero_target', unit: peso — banded against the booking's own revenue,
// so ₱5k demurrage on a ₱40k booking ≠ ₱5k on a ₱2M booking
{ "5": 0, "4": "<1%", "3": "1-3%", "2": "3-5%", "1": ">5%" }
```

The peso variant matters. A flat peso band punishes whoever handles small shipments, and the
people handling small shipments will notice within one period.

---

## 5. The three surfaces that make it live

Without these, the feature is a month-end spreadsheet with a nicer font.

### 5.1 Fault tagging queue

Charges land on bookings continuously. Each one needs a verdict before it can score.

The queue shows untagged demurrage/detention/storage charges with **the system's proposed verdict
already filled in and its reasoning shown**:

```
BK-0231 · ₱42,000 demurrage · Laliesca V. Paguinto

  Proposed: INTERNAL FAULT
  Lodgment recorded 2026-07-14 09:12
  Documents complete 2026-07-11 16:40  →  breached 24h by 40h 32m

  [ Confirm ]  [ External fault — reason… ]
```

Confirming is one click. Disagreeing requires a reason. Both are logged.

Owner: the handler's **supervisor**, at liquidation review. Not the handler — self-assessing
fault on 30% of your own scorecard is not a control. Not accounting — they see the amount,
not the cause.

### 5.2 Missing milestone queue

Bookings where a KPI-relevant date is absent. Surfaces data gaps as they happen rather than
discovering at month-end that a third of the shipments can't be scored.

### 5.3 Inbox integration

Per the workflow-engine doctrine, the inbox is the cross-department connective tissue. Both
queues emit inbox items:

- charge tagged internal-fault → notify the employee **at the time**, not at month-end
- period opened for review → notify evaluators
- sign-off step reached → notify the next approver

A KPI hit that arrives four weeks after the shipment is a performance review. A KPI hit that
arrives the same day is feedback.

---

## 6. Rules that protect trust

These are the details that decide whether anyone believes the number.

**Missing data never scores zero.** A KPI with no computable actual, or no target set, is
`excluded` with a reason. The final score renormalises over the remaining weights and the UI says
so explicitly: *"Scored on 85% of the scorecard — Sales Quota excluded, no target set."*
Silently scoring zero would make the system look precise while being wrong, which is worse
than being visibly incomplete.

**Untagged is not clean.** Untagged fault charges are excluded from scoring and counted in the
queue. They must never default to "no internal fault" — that would make every scorecard look
spotless by default.

**Overrides are cheap but visible.** An evaluator can set any rating. If it differs from the
suggestion, a reason is required, and the delta is visible to the reviewer at the next sign-off
step. The point is not to prevent overrides — it's to make a pattern of them legible.

**Locked periods are immutable.** After `locked`, `kpi_scores` rows are read-only. Corrections
create an amendment record, not an edit.

**The employee sees their score before it's signed.** Not after. A number someone first
encounters in a review meeting is an ambush; a number they've watched all month is a
conversation.

---

## 7. Drill-down is not optional

Every computed actual links to the rows that produced it.

```
Lodgment within 24 hrs        Target 100%   Actual 78.6%   Rating 2

  11 of 14 entries lodged within 24 hrs        [ view the 14 ]

  BK-0231   docs complete 07-11 16:40 → lodged 07-14 09:12   +40h 32m  ✕
  BK-0244   docs complete 07-15 08:00 → lodged 07-15 14:22   +6h 22m   ✓
  …
```

This is the difference between a scorecard someone argues with productively and one they
dismiss. It also makes the system self-auditing — if the metric resolver is wrong, the person
being scored will find it faster than QA will.

`kpi_scores.evidence` (jsonb) holds the row ids at compute time so the drill-down is stable
even after a locked period.

---

## 8. RBAC

Performance data is more sensitive than the financials. Per doctrine, the grant reads as a
sentence: *"While in Performance, they can [Action] [Scorecard]."*

New module ids to register in `accessSchema.ts` — and per the standing rule, **a new tab is
invisible until it is checked in the Access Configuration matrix. Do not backfill via SQL or
cascade.**

```
hr_performance                     (module, pageId: 'hr-performance')
  hr_performance_scorecards_tab
  hr_performance_review_tab
  hr_performance_queues_tab
  hr_performance_periods_tab
  hr_performance_setup_tab

my_scorecard                       (Personal module, pageId: 'my-scorecard')
```

Visibility dial on the scorecard row noun — own / team / department / all — is the sole lock
on reading someone else's score, consistent with the module-grant-gates-pages-only split from
migration 217.

Two things worth deciding explicitly rather than inheriting:

- **`my_scorecard` should be granted to everyone by default.** A scorecard nobody can see isn't
  feedback.
- **Executive rollup should show distributions before names.** Band distribution per department
  first, drill to individuals second. Small nudge, meaningfully different culture.

---

## 9. Build order

Ordered by *when it becomes useful*, not by dependency purity.

### Phase 1 — Vertical slice: Pricing only

**Why Pricing:** 77% automatic, the TAT data already exists in `activity_log` retroactively
(`Draft → Pending Pricing → Priced`), and there are 8 pricing users. The whole feature can be
proven on one department before touching the other four.

1. `kpi_definitions` / `kpi_periods` / `kpi_scores` / `user_targets` + seed the 6 Pricing KPIs
2. Metric resolver + 3 metrics: `quotation_tat`, `billing_tat_24h`, `sales_quota`
3. `profile_countries.region` + backfill (unblocks the intra-Asia/outside-Asia thresholds)
4. **My Scorecard** page, read-only, with drill-down
5. Backfill historical periods from `activity_log` — day one has history, not an empty page

**Exit test:** a pricer opens My Scorecard, sees a number for last month computed from real
historical data, clicks Quotation TAT, and finds the actual quotes behind it.

### Phase 2 — Evaluation lifecycle

6. Periods: open → in_review → evaluated → reviewed → locked
7. Review tab: manual actuals, suggest-then-override ratings
8. Sign-off chain via **`routing_rules`** — the PDF's Prepared / Reviewed / Noted is a
   three-step approval, and routing_rules already does exactly this for EV approval.
   Second consumer, no new machinery.
9. Signed PDF export matching the Falcons layout

### Phase 3 — Operations milestones (unlocks Brokerage + Forwarding)

10. `booking_milestones` table + write-time derivation
11. Backfill from `activity_log` field transitions (`entry_number`, `selectivity_color`)
    — **first verify every `details` mutation path writes to activity_log**; bulk edits,
    imports and Edge Function writes are the likely gaps
12. Explicit date fields on the brokerage/forwarding booking forms so `occurred_at` is
    separable from `recorded_at`
13. Seed Brokerage + Forwarding definitions

### Phase 4 — Charge attribution (unlocks 20% of company-wide weight)

14. `catalog_items.kpi_charge_class` + classify existing items
15. **Split the blended catalog items** — 23 of 30 storage-bearing line items are currently
    unscoreable
16. Fault fields on `evoucher_line_items` + the tagging queue with proposed verdicts
17. Seed Trucking definitions

### Phase 5 — BDD + Executive

18. `calendar_events` → meetings metric
19. `crm_activities` adoption for calls/emails (a UX problem, not a schema one — the table
    exists and has zero rows)
20. Executive rollup

### Phase 6 — HR handshake

21. `attendance_punctuality` metric contract — **define this in Phase 1**, so HR builds to
    satisfy it rather than KPIs being retrofitted onto whatever HR ships
22. Wire it when HR lands

---

## 10. Reuse — no new patterns

| Need | Use |
|---|---|
| Tables | `src/components/common/DataTable.tsx` |
| Score/stat tiles | `src/components/ui/NeuronKPICard.tsx` (already exists) |
| Dropdowns | `CustomDropdown` (`src/components/bd/`) — never reimplement |
| Route protection | `src/components/RouteGuard.tsx` |
| Approval chain | `routing_rules` |
| Notifications | existing inbox / `notification_events` |
| Sensitive-field pattern | follow `confidential` flag handling on bookings/customers |

Nothing here needs a new architectural primitive. That's deliberate.

---

## 11. Risks

**Wrong numbers destroy adoption permanently.** Metric resolvers must be tested against
hand-computed cases before anyone sees a score. One wrong lodgment count and the whole system
is "that broken thing HR tried."
→ Mitigation: Phase 1 ships to 8 pricers with drill-down, not to 60 people.

**`activity_log` becomes load-bearing.** It's an audit trail today; nothing depends on it. The
moment KPIs read from it, a missed write is a wrong score.
→ Mitigation: derive into `booking_milestones` at write time; use `activity_log` only to backfill.

**Self-reported BDD activity is gameable and everyone will know it.** 24% of the BDD scorecard.
→ Mitigation: require `customer_id` on every logged activity; surface activity-to-outcome ratios
so the pattern is visible without accusing anyone.

**Weights change mid-period.** → `weight_pct_snapshot` + `effective_from`.

**The feature drifts into surveillance.** The moment managers browse other departments' scores
casually, the culture cost exceeds the value.
→ Mitigation: default grant is own-scorecard; executive view leads with distributions.

---

## 12. Open decisions — need Marcus

1. **Is Performance an HR module or its own department?** Plan assumes HR (the `hr` node is
   empty and available, and evaluation is an HR process). Standing it up as its own top-level
   department is the alternative if KPIs are meant to be a headline Neuron capability rather
   than an HR function.
2. **Does the employee see their live score before sign-off?** Plan says yes, strongly. It's the
   whole argument for live-vs-month-end. But it is a culture decision, and Falcons may want
   supervisor-first.
3. **Phase 1 = Pricing only?** Recommended. The alternative — seed all 42 definitions up front —
   looks more complete but delays real feedback by months.
4. **Sales quota values** — who sets them, and are they per-period or annual? Blocks nothing;
   the field ships empty and the KPI excludes itself until filled.
