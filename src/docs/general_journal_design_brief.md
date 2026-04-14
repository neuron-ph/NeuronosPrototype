# Design Brief: General Journal Module
**Created: 2026-04-14 | Status: Finalized — Ready for Implementation**

---

## 1. Feature Summary

The General Journal is the chronological master record of every financial event posted to the books — E-Voucher GL entries, invoice postings, collection postings, and manual adjustments. It serves Accounting as a working audit and reconciliation surface, and the CEO as a read-only view into the financial pulse of the company. It is the only place in Neuron where all journal entries can be browsed as a unified set, acted on directly, and added to manually.

---

## 2. Primary User Action

**Review and verify what has been posted to the books for a given period** — whether that's hunting a specific entry, scanning a full month before close, or tracing an anomaly back to its source.

Manual posting is a secondary but equally supported action.

---

## 3. Design Direction

**QuickBooks structure. Linear surface. Neuron authority.**

- **From QuickBooks**: the register metaphor. A date-ordered columnar list of entries with period grouping and running totals. Accountants recognize this pattern instinctively. Don't reinvent it.
- **From Linear**: the surface treatment. Typography-forward, minimal chrome, tight row density, instant hover feedback, a filter bar that feels like a command bar rather than a form. The data IS the UI — no card wrappers, no decorative panels.
- **From Neuron**: the identity. `#12332B` ink, `#0F766E` teal for action and active states, `#E5E9F0` borders, the precision-instrument authority. Status chips styled to the existing system. No rounding doing emotional labor.

The result should feel like a Bloomberg terminal that was rebuilt with Linear's discipline and Neuron's palette — dense, immediate, and completely in control.

---

## 4. Layout Strategy

**Three horizontal zones, top to bottom:**

**Zone 1 — Command Bar** (fixed, ~52px)
Left cluster: Page title "General Journal" in `text-[13px]` caps label weight + entry count for current filter. Right cluster: date range picker | source type filter | account filter | search input | Export button (ghost) | "New Entry" button (teal, primary). The filter controls should feel like a Linear-style toolbar — compact, borderless or ghost-bordered, not a traditional filter form.

**Zone 2 — Register Table** (scrollable, fills remaining height, paginated at 50 rows)
Full-width columnar register. Rows grouped by date with a subtle sticky date-separator row (like Linear's date headers — muted, lightweight, not a heavy section break). Columns:

| DATE | ENTRY # | SOURCE | DESCRIPTION | LINES | DEBIT | CREDIT | STATUS |
|---|---|---|---|---|---|---|---|

- **DATE**: `text-[12px]` muted, collapses into the date group header after the first row of each group
- **ENTRY #**: monospace-style, teal on hover
- **SOURCE**: linked chip (e.g., "E-Voucher · EV-2026-042", "Invoice · INV-0089", "Manual") — teal text for linked types, muted for manual
- **DESCRIPTION**: truncated with ellipsis, full text on hover tooltip
- **LINES**: e.g., "4 lines" — muted
- **DEBIT / CREDIT**: right-aligned, `font-variant-numeric: tabular-nums`, monospace weight
- **STATUS**: chip — `posted` (teal), `void` (muted/strikethrough), `draft` (amber)

Row hover: a 2px teal left border appears instantly (no transition delay) + very subtle `#F7FAF8` background tint.

Pagination: 50 rows per page. Pagination controls sit between the table and the summary bar — prev/next + page indicator. Simple, not elaborate.

**Zone 3 — Summary Bar** (fixed footer, ~44px)
Pinned to bottom: "Showing X entries" | "Total Debits: ₱X" | "Total Credits: ₱X" | balance indicator (green checkmark if DR = CR for the visible set, amber warning if not). Totals reflect the full filtered set, not just the current page.

**Side panel** (slides in from right, 520px wide, main table narrows — does NOT overlay)
Opens on row click. Contains full JE detail. Main table stays live — user can click through entries without closing the panel.

---

## 5. Key States

| State | What the user sees |
|---|---|
| **Default (with data)** | Grouped register, summary bar populated, filters at default (current month), page 1 of N |
| **Filtered** | Active filters shown as removable chips in the command bar. Entry count and totals update live. Pagination resets to page 1. |
| **Empty (no results)** | Clean empty state in the table body: a muted ledger-book icon + "No entries match your filters" + "Clear filters" link. Never a full-page takeover. |
| **Loading** | Skeleton rows — same column widths, animated pulse. Command bar is live while rows load. |
| **Side panel open** | Panel slides in, main table width compresses (not overlaid). Selected row gets a persistent teal left border + slightly elevated background. |
| **Draft entry** | Row shows amber `draft` chip. Side panel shows "Post Entry" button. Clicking triggers the post confirmation modal. |
| **Post confirmation modal** | Compact centered modal. Shows balanced entry summary, DR = CR explicitly confirmed. Warning copy. Two buttons: Cancel + Post Entry (teal). |
| **Void confirmation modal** | Compact centered modal. Entry number, amount, permanent warning. Two buttons: Cancel + Void Entry (destructive red). |
| **Voided row** | Status chip changes to `void`, description gets strikethrough, row muted. Stays in the list — never hidden. |
| **New Entry** | Opens `ManualJournalEntryPanel` (already built). On submit → post confirmation modal fires before any write. |

---

## 6. Interaction Model

**Browsing:**
- Default view opens to current calendar month
- Date range picker changes the visible set; summary bar updates immediately; pagination resets
- Source type chips filter by origin: All / E-Voucher / Invoice / Collection / Manual
- Account filter is a searchable dropdown — shows entries that touch that account; within each matching entry, the relevant account line is visually highlighted in the side panel detail view
- Search matches entry #, description, source reference
- Pagination: 50 rows/page with prev/next controls; page resets when any filter changes

**Row interaction:**
- Click anywhere on a row → side panel opens with full detail
- Side panel shows:
  - Entry number + status + date at top
  - Source document link (clickable — navigates to the EV/invoice/collection detail)
  - Full double-entry line table: Account Code | Account Name | DR | CR — with the filtered account line highlighted if account filter is active
  - Created by + timestamp
  - Action buttons at bottom (Post Entry for drafts, Void for posted — Accounting only; CEO sees no action buttons)
- Side panel stays open as user clicks different rows

**Manual entry (New Entry flow):**
1. Click "New Entry" → `ManualJournalEntryPanel` opens
2. User builds the entry (existing component handles this)
3. Two options in the panel footer: "Save as Draft" + "Post Entry"
4. "Post Entry" → post confirmation modal fires
5. On confirm → entry posted, panel closes, table refreshes, new row appears with a brief teal left-border highlight that fades to the hover state after 1.5s

**Void flow:**
1. Void button visible on `posted` entries, Accounting role only
2. Click → void confirmation modal
3. On confirm → entry marked `void`, a system reversal entry is auto-created and immediately visible in the register, row styling updates

**Export:**
- "Export" button (ghost, command bar) → dropdown: CSV / PDF
- Exports the full filtered set (not just current page)
- PDF matches the ReportTemplate pattern already established in the system

---

## 7. Content Requirements

**Column labels:** DATE · ENTRY # · SOURCE · DESCRIPTION · LINES · DEBIT · CREDIT · STATUS

**Date group headers:** "Today — April 14, 2026" / "April 13, 2026" — lightweight separator rows, not section dividers

**Source chips:**
- `E-Voucher · EV-2026-042` (linked, teal)
- `Invoice · INV-0089` (linked, teal)
- `Collection · COL-0012` (linked, teal)
- `Manual` (muted, no link)

**Summary bar:** `{n} entries · Debits: ₱{x} · Credits: ₱{y}` + balance indicator

**Empty state:** "No journal entries found for this period." + "Clear filters" or "Adjust your date range."

**Post confirmation modal:**
> **Post to General Ledger?**
> This entry is balanced — Debits equal Credits (₱{amount}).
> Once posted, this entry is permanent and cannot be edited or deleted.
> [Cancel] [Post Entry]

**Void confirmation modal:**
> **Void Journal Entry {ENTRY #}?**
> This will permanently void this entry and record an automatic reversal. This cannot be undone.
> [Cancel] [Void Entry]

**Draft save toast:** "Draft saved — entry not yet posted to the ledger."

**Post success toast:** "Journal entry posted to the general ledger."

**Void success toast:** "Entry voided — reversal recorded."

**Realistic data ranges:**
- Entry numbers: auto-incremented, prefixed `JE-` for system entries, `JE-MAN-` for manual
- Description: max ~120 chars, truncated in table
- Lines per entry: 2 minimum, typically 2–6, rarely >12
- Monthly volume: ~200 entries → ~4 pages at 50 rows/page

---

## 8. Recommended References for Implementation

- `spatial-design.md` — column hierarchy, zone spacing, sticky header/footer, pagination placement
- `interaction-design.md` — side panel behavior, filter chip patterns, row hover states, modal patterns
- `motion-design.md` — new-row highlight animation, panel slide-in timing

**Existing components to reuse:**
- `ManualJournalEntryPanel` — already built, wire directly
- `SidePanel` — standard side panel container
- `ReportTemplate` — for PDF export
- Status chip pattern from EVouchers/Bookings

---

## 9. Resolved Decisions

| Question | Decision |
|---|---|
| Pagination vs. infinite scroll | Paginate at 50 rows/page |
| Export needed? | Yes — CSV and PDF, full filtered set |
| Draft entries? | Yes — "Save as Draft" option in ManualJournalEntryPanel; post confirmation modal gates final posting |
| Account filter behavior | Show all entries touching that account; highlight the matching line within the side panel detail view |
| CEO access level | Identical to Accounting view — same filters, same data — minus action buttons (no Post, no Void) |
