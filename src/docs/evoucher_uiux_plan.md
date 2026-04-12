# E-Voucher System — UI/UX Plan
**Started: 2026-04-11 | Status: Implemented (2026-04-12)**

---

## Entry Points

| Entry Point | EV Types Created Here | Who |
|---|---|---|
| Operations → Booking → E-Vouchers tab | `expense`, `cash_advance` | Operations reps |
| BD → Budget Requests module | `budget_request` | BD reps (anyone) |
| My E-Vouchers (sidebar, personal) | `reimbursement`, `direct_expense` | Anyone |
| Accounting → E-Vouchers module | No creation — manage/action only | Accounting |

---

## Module Layouts

### My E-Vouchers (Sidebar — all users)
- Shows **all E-Vouchers the user has ever created**, regardless of type or entry point
- Creation from this page is limited to `reimbursement` and `direct_expense`
- Serves as the personal tracker: status, amounts, pending actions

### Accounting → E-Voucher Module (4 tabs)
| Tab | EVs Shown | Accounting's Action |
|---|---|---|
| **Pending Disburse** | `pending_accounting` | Release cash → click Disburse |
| **Waiting on Rep** | `pending_liquidation` | Monitor only — rep hasn't submitted receipts |
| **Pending Verification** | `pending_verification` | Review receipts, assign GL → click Verify & Post |
| **Archive** | `posted` + completed reimbursements | Read-only history |

### Manager → Department Module → E-Vouchers tab
- Shows EVs from own department at `pending_manager` only
- Approve / Reject (with reason) from here
- Inbox notification draws them here; action happens in this tab

### CEO → Executive Module → Approvals (or top-level sidebar)
- Shows all EVs at `pending_ceo` across all departments
- Approve / Reject (with reason) from here
- Inbox notification draws them here; action happens in this view

### Operations → Booking → E-Vouchers tab
- Lists all EVs tied to this specific booking
- Create new `expense` or `cash_advance` from here
- One EV per booking (strict) — enforce in UI (disable "Create" once one exists per booking)

### BD → Budget Requests module
- Existing module, keep as-is with its own identity
- Lists `budget_request` EVs
- Create new budget request from here

---

## Approval Flow (Inbox + Module)

1. Creator submits EV → status moves to `pending_manager` (or `pending_ceo` for direct_expense, or `pending_accounting` for Executive creators)
2. Inbox sends notification to the approver
3. Approver opens their module queue (not inbox) to act
4. Approve → status advances; Reject → status cascades back with reason

---

## Creation Form

**Pattern:** One "Create" button per entry point → opens `AddRequestForPaymentPanel` side panel with type selector scoped to context. Retire `CreateEVoucherModal` (centered modal violates SidePanel rule).

| Entry Point | Button Label | Type Selector Options |
|---|---|---|
| Booking → E-Vouchers tab | "New E-Voucher" | `expense` \| `cash_advance` |
| My E-Vouchers | "New Request" | `reimbursement` \| `direct_expense` |
| BD → Budget Requests | "New Budget Request" | Pre-set to `budget_request` (no selector) |

**Existing components:**
- `AddRequestForPaymentPanel` — primary side panel, already supports all 4 types. Add `direct_expense`.
- `CreateEVoucherForm` — thin wrapper, keep as context initializer.
- `CreateEVoucherModal` — **retire/delete** (centered dialog, redundant with side panel).

**Field variations by type:**

| Field | `expense` | `cash_advance` | `budget_request` | `reimbursement` | `direct_expense` |
|---|---|---|---|---|---|
| Booking ref | Required | Required | Optional | Optional | Hidden |
| Vendor (header default) | Yes | Yes | Yes | Yes | Yes |
| Receipt upload at creation | No | No | No | **Yes (required)** | No |
| Line items | Multiple | Multiple | Multiple | Multiple | Multiple |

---

## Liquidation Submission

**Pattern:** Available from both My E-Vouchers (shortcut "Liquidate" button on `disbursed` EVs) and from the EV detail page. Both open the same form.

**Liquidation form (sub-panel or section on detail page):**
- Add line items: description, vendor name, amount actually paid, receipt upload (photo/scan)
- Multiple line items per submission
- Running total vs. disbursed amount shown (variance calculation)
- "Submit Liquidation" button → moves EV to `pending_verification`

---

## EV Detail View (Two-Tier)

**Tier 1 — Side Panel (quick view + simple actions)**
- Reuse panel in read-only mode when viewing existing EVs
- Shows: header info, status badge, line items summary, total amount
- Actions available based on role + status:
  - Creator: Edit (draft only), Withdraw (before CEO), Delete (draft only)
  - Manager: Approve / Reject with reason
  - CEO: Approve / Reject with reason
- "View Full Details" link → opens Tier 2

**Tier 2 — Full Detail Page (workspace)**
- Richer layout with dedicated sections:
  - Header: type, status, ref number, dates, creator, booking link
  - Line items table (original request)
  - Approval timeline / history (who approved when, rejection reasons)
  - Liquidation section (submit receipts, view submitted items)
  - GL posting info (Accounting only — category assignment, posting status)
  - Attachments / receipts gallery
- Actions in top bar:
  - Accounting: Disburse / Verify & Post
  - Creator: Submit Liquidation (when `disbursed`)
  - Status-appropriate actions for all roles

---

## Status Badge Labels (Role-Aware)

| Internal Status | Creator Sees | Manager Sees | CEO Sees | Accounting Sees |
|---|---|---|---|---|
| `draft` | Draft | — | — | — |
| `pending_manager` | Pending Approval | **Needs Your Approval** | — | — |
| `pending_ceo` | Pending Approval | Approved ✓ | **Needs Your Approval** | — |
| `pending_accounting` | Approved | Approved ✓ | Approved ✓ | **Pending Disburse** |
| `disbursed` | Disbursed | Disbursed | Disbursed | Disbursed |
| `pending_liquidation` | **Submit Receipts** | — | — | Waiting on Rep |
| `pending_verification` | Under Review | — | — | **Verify & Post** |
| `posted` | Complete | Complete | Complete | Posted |

---

## Routing

**Single global route:** `/evouchers/:id?from=accounting|operations|bd|my`

- One detail page, one component to maintain
- `from` query param preserves navigation context (back button + breadcrumbs)
- Each module links to the same route with its own `from` value

---

## Inbox Notifications

| Event | Who Gets Notified |
|---|---|
| EV submitted | Manager (or CEO for `direct_expense`, or Accounting for Executive) |
| Manager approves | CEO |
| CEO approves | Accounting |
| Any rejection | Creator (with reason) |
| EV disbursed | Creator ("Cash ready / funds released") |
| Liquidation submitted | Accounting |
| EV posted (complete) | Creator |

Each notification links directly to `/evouchers/:id`.

---

## Open Questions (still to decide)

- [ ] Empty states — first-time views with no EVs
