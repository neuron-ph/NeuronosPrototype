# Design Brief — Performance Scorecard Surfaces

Produced by `$impeccable shape`. Confirmed 2026-07-31.
Register: **product** (PRODUCT.md). Companion to `KPI_FEATURE_PLAN.md`.

This brief plans UX/UI. It is not an implementation. Hand it to `$impeccable craft`
or use it to guide a build.

---

## 1. Feature summary

Two performance surfaces over the KPI engine shipped in migrations 253–258.

**My Scorecard** answers "where do I stand" for one employee, against the Falcons
bands and against their own past. **Performance (exec)** answers the same question
at company altitude: against peers and across departments.

Both read the same numbers. They ask different questions of them, so they get
different forms.

## 2. Primary user action

**Employee:** locate yourself on the scale, and see which direction you are moving.

**Executive:** determine whether a low number is a person or a process.

Everything else on each surface is subordinate to its one action.

## 3. Design direction

**Color strategy: Restrained.** Product register floor, and PRODUCT.md is explicit
that color is reserved for status and action.

Concretely:

- The band ladder is **neutral** — five steps of one tinted-grey ramp, light to
  dark. Not five colors. A five-colour band scale is the first-reflex answer and
  turns the whole surface into a traffic light.
- The **only saturated mark on the page is the position marker**. One mark, status
  coloured, well under 10% of surface. That is the entire colour budget.
- KPI bars are **one hue at one step**. They encode magnitude, not identity. There
  are no categories, so categorical hues would be the wrong job.
- Status colours (good / warning / serious / critical) stay reserved for position
  markers and the systemic flag. Never borrowed for "series 4".

**Theme scene sentence:** *A pricing officer at a desk in a bright Manila office at
4pm, checking mid-month whether they are still on track, mildly anxious.*

That forces **light as default**. Dark mode is supported and must be **selected,
not flipped**: its own steps from the same ramps, validated against the dark
surface.

**Anchor references:** Linear (density and restraint), Stripe (bullet-style
comparison rows), Bloomberg terminal (lets position carry meaning without
decoration).

**Visual probes:** skipped. This harness has no native image generation.

### Conflict resolved

PRODUCT.md's anti-references ban "hero-metric cards", and the shared design laws
ban the hero-metric template outright. The shipped Phase 1 card is exactly that:
a 56px number with a band label beside it.

This brief replaces it. The number stops being big and starts being **positioned**.

## 4. Scope

| | |
|---|---|
| Fidelity | Sketch, confirmed. Production-ready is a separate pass. |
| Breadth | Both surfaces. |
| Interactivity | Static thinking; hover/expand behaviour specified, not built. |
| Time intent | Design direction locked, build not yet authorised. |

## 5. Layout strategy

### My Scorecard

**Hero — the band ladder.** A single horizontal 0–100 scale with the five Falcons
thresholds marked, the score as a marker, last period as a ghost marker, and the
distance to the next band called out.

```
POOR              NEEDS IMPROVEMENT      SATISFACTORY   VERY SAT.  OUTSTANDING
0                          60                 70            80        90    100
├────────────────────────────┼──────────────────┼─────────────┼────────┼─────┤
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓██████████████
                                  ◆
                                 61.2
                            ○ 58.4 last month        ┤ 8.8 to Satisfactory
```

**Body — weighted KPI rows.** Track length equals weight. Fill equals points
earned. One shared axis (0 to the largest weight) so rows are comparable.

```
                                                          earned / weight
Quotation (All Types)  ██████████░░░░░░░░░░░░░░░░░░░░░░░    14.0 / 35   ▼
Misquote / Lapses      █████████░░░░░░                       9.0 / 15   —
Billing                ████████████░░░                      12.0 / 15   ▲
Sales Quota            ███████████████                      15.0 / 15   ▲
Punctuality            ████░░░░░░░░                          4.8 / 12   ▼
Behavior               ██████░░                              6.4 / 8    —
```

This is the load-bearing idea: **weight becomes space.** You see that Quotation TAT
is a third of your working life, and that Punctuality can never matter as much no
matter how hard you try. A per-KPI 0–100% bar destroys exactly that, because Sales
Quota at 100% and Quotation at 40% would render as comparable bars.

The unfilled remainder is forfeited points. Same information as the current
"What's costing you" list, encoded as space instead of a second list.

**Tail — trend sparkline** against recessive dashed band thresholds. Only the
current point gets a dot and a label. Never a number on every point.

### Performance (exec)

**Hero — strip plot, one dot per person, one row per department**, with the
department median as a tick.

```
                 0         60    70    80    90   100
Pricing    (8)   ├──────────┼─────┼─────┼─────┼────┤
                                        ·· ·│· ··       med 89
Brokerage (21)   ├──────────┼─────┼─────┼─────┼────┤
                      ·  ·····│·······  ··  ·          med 76
```

This is the one mark that separates a person problem from a process problem
visually. A tight low cluster means the department is constrained (look upstream).
A wide spread with one straggler means an individual (go talk to them). A ranked
list of 58 names cannot express that distinction.

**Beneath — band composition**, one stacked bar per department, 2px surface gaps
between segments. Answers "how many are in trouble" without averaging it away.

**Then — systemic flags**, in the same bar language. No new vocabulary.

**Last — names.** The roster stays searchable and sortable, but it is not the
opening read.

## 6. Key states

| State | What the user needs to see and feel |
|---|---|
| Default | Position, direction, and the gap to the next band. |
| Provisional (<50% coverage) | Marker rendered **hollow**, no band claimed, coverage stated. Already shipped in Phase 1; carry it forward. |
| No data at all | Ladder present but empty, with what would fill it. Not a blank page. |
| Single period, no trend | Sparkline replaced by "First period measured", not an empty chart frame. |
| Live vs locked period | Live shows the marker as still moving; locked reads as final. |
| No scorecard for department | Accounting / Executive / HR have no Falcons scorecard. Say so plainly. |
| Exec, department of one | Strip plot degenerates to a single dot. Suppress the median tick. |

## 7. Interaction model

- **Hover on every mark.** Dataviz default, not an enhancement. Dot to name; KPI
  bar to earned/weight/rating; ladder marker to exact score and coverage.
- **Click a KPI row** to expand the evidence table that already exists in Phase 1.
- **Click a dot** on the exec strip plot to open that person's card.
- **Filters in one row above the charts**, never interleaved.
- Motion: 150–250ms, state changes only. No entrance choreography.

## 8. Content requirements

Interface copy. No em dashes.

| Slot | Copy |
|---|---|
| Gap to next band | `8.8 to Satisfactory` |
| Ghost marker | `58.4 last month` |
| Provisional | `Too little measured yet for a meaningful score.` |
| Coverage | `Scored on 15% of your scorecard.` |
| Exclusion | `No quota set` / `Awaiting evaluation` |
| No trend | `First period measured` |
| No scorecard | `No scorecard applies to your department yet.` |
| Systemic flag | `When most of a department misses the same KPI, the constraint is upstream.` |

Realistic ranges: 6 KPIs per employee (Trucking has 11), 0 to 100 score, 2 to 21
people per department, up to 58 dots on the exec strip plot, 6 periods of trend,
evidence tables from 0 to ~40 rows.

## 9. Implementation notes

- Run `scripts/validate_palette.js` on **both** light and dark steps before writing
  any chart code. Do not eyeball CVD separation.
- Marks: 2px lines, 4px rounded data-ends anchored to the baseline, ≥8px markers,
  2px surface gap between adjacent fills.
- Text wears text tokens, never the mark colour.
- Recessive grid and axes.
- A table view must exist for every chart (Phase 1 evidence tables already serve
  this for the KPI rows).
- Reuse `DataTable`, `CustomDropdown`, `RouteGuard`. No new primitives.

## 10. Open questions

**Does the employee card show the department median on the ladder?**
Decision: **no.** It is one tick away from a leaderboard, and the employee surface
was deliberately scoped to "me against the bands and my own past". Peer comparison
is the executive surface's job. Overturnable, but it should be a deliberate choice
rather than a default.

**Does the exec strip plot label dots at rest?** Leaning no: 58 labels is noise,
and hover plus search covers retrieval. Revisit if it tests badly.

**Trucking has 11 KPIs, not 6.** The weighted-row body needs to stay readable at 11
rows. Check before the Trucking scorecard ships in Phase 4.
