# NEU-020 Door Map — Phase 0 output (2026-06-06)

> Produced by five read-only census agents walking the SURFACES (affordances first,
> per the NEU-019 method). This file is the binding work-list for Phases 2–4.
> Full per-cell tables live in the agent transcripts; this document records every
> non-TRUE cell, every escalation, and the per-door TRUE-ALREADY counts.
> Sentences follow §1 of RBAC_DOOR_SCOPED_GRID_PLAN.md. Labels are quoted as
> rendered (e.g. the sixth status tab is "Archived" — sentences use the on-screen word).

## 0. Headline

- The bulk of the grid is **TRUE-ALREADY** — NEU-019's gating means most cells'
  sentences already hold (all BD/Pricing contact+customer tabs, e-voucher approve
  chain, catalog, COA CRUD, calendar, memos, teams/profiles admin, etc.).
- The work clusters into seven families: **(A)** DD-1/DD-2 key splits,
  **(B)** door-identity REWIREs (dept-derived lens → route-derived door),
  **(C)** DD-3 export NEW-CELLs (PDF/print/CSV affordances, all currently riding View),
  **(D)** DD-6 demotions (live cells with RLS-only/zero consumers → dash),
  **(E)** the OR-gate purity question (E-OR below — biggest single ruling),
  **(F)** the DD-5 inbox re-homing (proposal below), and
  **(G)** one failed security verification (DD-7 — fix immediately).

## 1. DD-7 — RE-RULED by Marcus, 2026-06-06: manager self-approval is BY DESIGN

Verification found a manager holding `my_evouchers:approve` can approve their own voucher
at the `pending_manager` step (no owner exclusion in UI/queue/RLS). Marcus ruled this is
intended: "a manager SHOULD be allowed to approve their own e-vouchers as they get sent to
CEO for final approval anyway." The dual-control lives at the CEO gate (`acct_evouchers:approve`),
which remains mandatory after manager approval. No code change. Signed accepted reading;
the WG-30 accounting auto-approve carve-out is moot under this ruling.

## 2. The key splits (DD-1 / DD-2 — ruled; this is the inventory)

| Split | New keys | Seeded from |
|---|---|---|
| Booking-detail children per service (DD-1) | `ops_{forwarding,brokerage,trucking,marine_insurance,others}_{info,billings,invoices,collections,expenses,comments,chrono}_tab` — 35 keys, actions per today's applicability (+ new export cells) | shared `ops_bookings_*_tab` holders |
| "Others" Pricing appearance (DD-2) | `pricing_others` + 6 status tabs + 7 detail children | `ops_others*` holders |
| BD Projects tab family (DD-2 — `ops_projects_*` rendered under BD + Pricing + hidden ops) | `bd_projects_*_tab` (~13) | shared `ops_projects_*_tab` holders |
| Pricing Projects tab family (DD-2) | `pricing_projects_*_tab` (~13) | same |
| BD Contracts tab family (DD-2 — `pricing_contracts_*` rendered under BD + Pricing) | `bd_contracts_*_tab` (~14) | shared `pricing_contracts_*_tab` holders |
| Inquiry-file tabs through the BD door | `bd_inquiries_comments_tab`, `bd_inquiries_attachments_tab` | `pricing_quotations_{comments,attachments}_tab` holders |
| Marine Insurance | NO split — renders under Pricing only (one row). Key keeps its `ops_` prefix (internal id, no rename). | — |

Routing prerequisite: the Others split needs a Pricing-door route (`/pricing/others` →
same component, `door="pricing"`), since both sidebar items currently share one URL.

## 3. Door-identity REWIREs (the lens problem)

Door identity is currently computed from the **user's department**, not the door, in:
`Pricing.tsx:60` + `quotationAccess.ts:9-21` (quotation lens), `ContractsModule.tsx:381`
(contractDept), `ProjectsList.tsx:39`/`ProjectDetail.tsx:152` (projectDept). A BD user on
/pricing/quotations is checked against `bd_inquiries:*`. Phase 3 threads the variant from
the route/entry point (the `*_MODULE_IDS[variant]` machinery is ready; only the source changes).

OR-pair leaks to collapse to the door's own key: `bd_projects:edit || pricing_projects:edit`
(ProjectDetail:237), `pricing_contracts:edit || bd_contracts:edit` (ContractDetailView:133),
`bd_projects:create || pricing_projects:create` (QuotationFileView:107), `exec_users:* OR
admin_users_tab:*` across the whole Users family (adminUsersPermissions.ts:32-57),
`acct_evouchers:create OR my_evouchers:create` (EVouchersContent:85), accounting view keys
ORed into ops booking tabs (`accounting_bookings_{invoices,collections}_tab:view` in all five
detail pages), `acct_journal:create||edit` action-mix (GeneralJournal:256), `acct_catalog`
edit/delete/create action-mixes (CatalogManagementPage:147,518,901,943,1400),
`exec_profiling:edit` leaking into Users→Teams dept-role config (UserManagement:1122 →
rewire to `admin_teams_tab:edit`).

## 4. DD-3 export NEW-CELLs (download/print affordances riding View today)

- `pricing_quotations:export` (PDF studio + quick download; gate exists, cell dashed) — DD-3 verbatim
- `bd_inquiries:export` (same surface through the BD door)
- `ops_{svc}_invoices_tab:export` ×5 (InvoiceBuilder PDF + Print, ungated, IB:1674-1691)
- `accounting_financials_{billings,invoices,collections,expenses}_tab:export` (ungated CSV exports)
- `acct_journal:export`, `acct_statements:export` (CSV/Print, ungated), `acct_reports:export` (Print)
- `pricing_contracts_quotation_tab:export` / project quotation-tab export (Print PDF rides tab view)
- Customers/Contacts inquiry-tab export cells where the file opens in-door (with §6 ruling)
- Seeding: all export cells ⇐ current View holders of the same door (D5)
- DD-3 scope ruling needed (E-EXP below): attachment **file downloads** (EntityAttachmentsTab) —
  export-class or part of View? Recommendation: stays View; signed line.

## 5. DD-6 demotions (live cells → dash; RLS stays underneath)

`exec_activity_log:{edit,delete}` · `inbox:delete`(*unless DD-5 re-homing consumes it — see §6*) ·
`acct_evouchers:edit` · `acct_projects:create` · `pricing_contracts:{create,delete}` ·
`pricing_contacts_activities_tab:{edit,delete}` · `pricing_contacts_tasks_tab:delete` ·
`bd_contacts_activities_tab:{edit,delete}` · `bd_contacts_tasks_tab:delete` ·
`bd_budget_requests:{edit,delete}` (RLS-only) · `bd_budget_requests:approve` (consumer
unreachable — `showAccountingControls` never passed; wire or dash, E-BR below) ·
`acct_financials:{create,edit,delete}` + `accounting_financials_{billings,invoices}_tab:{edit,delete…}`
master-key cells (pending E-OR ruling).
Doctrine refinement needed (E-RLS below): **select-shaping RLS** (memos view, my-EV edit)
genuinely shapes what renders — treat as legitimate consumer (recommended) or dash too?

## 6. DD-5 re-homing proposal (inbox:edit five-way split) — NEEDS MARCUS'S APPROVAL

| Power (today all on `inbox:edit`) | Proposed home | Sentence |
|---|---|---|
| Edit/retract your own message | `inbox:edit` (the ruling) | "While in the Inbox, they can edit their messages" |
| Close / archive / dismiss tickets | `inbox:delete` (gains a visible consumer — resolves its DD-6 dash) | "…they can delete tickets" (close = take it down) |
| Assign / reassign dept tickets | `inbox_queue_tab:edit` (NEW-CELL; needs door threading — Assign appears only via the Queue door) | "While in the Queue, they can edit queue tickets" |
| Status advance / Mark Done / reopen | `inbox_inbox_tab:edit` (NEW-CELL; identity stays AND'd) | "While in the Inbox tab, they can edit inbox tickets" |
| Approval Accept/Decline | `inbox:approve` (NEW-CELL — the Approve column finally says what it does; identity AND'd; WG-03 record gates unchanged) | "While in the Inbox, they can approve tickets" |

Seeding: every current `inbox:edit` holder ⇐ all five keys (L3, zero loss). RLS (165:49-55)
must learn the new keys in Phase 4 or UI grants fail at the DB.

## 7. ESCALATIONS — new decisions for Marcus (DD-11+)

| ID | Question | Recommendation |
|---|---|---|
| **E-OR (DD-11)** | THE cross-cutting ruling: financial writes inside booking/project/contract doors consult NEU-017 OR-gates (`acct_financials`, `accounting_financials_*`, legacy keys, ops/project keys interchangeably). Door purity says: inside a Trucking booking, consult `ops_trucking_billings_tab` alone. Consequences: the accounting keys stop working through non-accounting doors; every current OR-holder is seeded into the per-door keys (large seed, zero day-one loss); `acct_financials` create/edit/delete dissolve into dashes (master-key retired); the "read-only window" rows (acct_projects/contracts/bookings, contract money tabs) become honest — write affordances behind view-only doors get suppressed or get their own cells. UI-purity first; RLS keeps the OR until the separate DB pass. | **Strict purity (option a)** — only reading consistent with the contract and walkthroughs #6/#7. |
| **E-WIN (DD-12)** | The window rows specifically: acct_projects/acct_contracts money+booking tab writes, and acct_bookings (a verbatim pass-through to the five ops modules). Make windows fully read-only (suppress writes through them), or give the acct tab rows their own write cells seeded from current usage? | Give acct tab rows their own write cells where accounting genuinely works (billings/invoices/collections/expenses inside projects/bookings), suppress the rest (booking edit/cancel through acct door). |
| **E-APP (DD-13)** | After DD-10, `pricing_quotations:approve` has zero consumers. Re-key the Approve/Disapprove status transitions (today riding edit in StatusChangeButton) to `approve`, or dash the column? | Re-key Approve/Disapprove to `approve` — the column then says exactly what it does. |
| **E-XDC (DD-14)** | Cross-door creations (add-customer-from-contact, create-project-from-quotation, activate-contract-from-quotation, create-booking-from-contract/project, vendor-edit-from-builder): convention says they consult the TARGET row's key. Sign as standing convention, or give hosting doors their own cells? | Sign the convention: "creating another row's noun consults that row's Create/Edit, wherever the button lives." Collapse the OR-pairs to the navigation door's dept twin. |
| **E-INQ (DD-15)** | Walkthrough #1 scope: Contacts→Inquiries can't OPEN an inquiry today (no click-through); Customers→Inquiries opens it but exits the door (navigates to the module route). To make tab-row Edit cells true: add in-door click-through + door-threaded file (BD and Pricing rows). Build it, or re-scope walkthrough #1 to module doors only? | Build it — it is the exact case that started NEU-020. |
| **E-RLS (DD-16)** | DD-6 refinement: keys whose RLS genuinely shapes the visible surface (memos view, my-EV edit) — legitimate consumer or dash? | Legitimate consumer; guard learns three classes: UI-consumed / select-shaping-RLS / write-RLS-only (only the last dashes). |
| **E-DEAD (DD-17)** | Dead buttons found: CoA Export ×2 (no onClick), task/activity attachment Download ×3 (no onClick). Wire under export keys, or delete? | Delete (dead code is deleted, never gated); rebuild later as gated export cells if wanted. |
| **E-RTE (DD-18)** | `/inbox`, `/calendar`, `/my-evouchers` routes are unguarded (sidebar-only view gating); direct URL renders the shell. Add route guards so View OFF = no page? | Add the guards (Phase 3). |
| **E-SET (DD-19)** | The Settings page's workspace auto-caps toggle consults `exec_profiling:edit` but Settings has no grid row. | Signed exception: workspace config on the Settings page reads Profiling's Edit (one line in §6 of the plan). |
| **E-BR (DD-20)** | `bd_budget_requests:approve` consumer is unreachable (panel's `showAccountingControls` never passed). Wire the approve flow where intended, or dash? | Wire it — approval of budget requests is a real workflow with a real dial; unreachable consumer is a bug, not a dead concept. |
| **E-EXP (DD-21)** | Are attachment FILE downloads export-class (new cells on every attachments tab) or part of View? | View (DD-3 was about document PDFs/CSV exports); signed line. |
| **E-FIN (DD-22)** | Financials tabs host cross-record writes (reversal invoices + Post-to-GL from Billing/Collection sheets, gated by invoice/journal keys). Door noun says billings; record-mirroring says invoice/journal. | Keep record-mirroring (NEU-019's WG-08 logic) as a signed convention under DD-14's umbrella. |

## 8. Misc fixes folded into Phase 3 batches (no ruling needed)

- `ops_{svc}_info_tab:view` + `ops_{svc}_expenses_tab:view`: gate the (currently unconditional)
  Info/Expenses tab buttons on the new per-service keys (live cells get real consumers).
- Invoices-tab "Create Invoice" + Collections-tab "Add Collection" buttons in FinancialsModule:
  ungated today → gate on their tab keys (REWIRE).
- BookingCommentsTab / BookingChronologicalTab / Unified money tabs receive door-identity props.
- HR grid row hidden in prod (DD-8); Company Settings stays under Profiling (D4 quirk recorded:
  ProfilingModule has no such tab surface — consumers are the PDF screens; no rename allowed).
- DD-4 recorded on every service Edit sentence ("update & cancel"); DD-9 void→delete-class
  rewire in InvoiceBuilder (IB:835,1627 → canDeleteInvoices keys).
- Compose-rollback hard delete (ComposePanel:151) runs under inbox:delete RLS — pre-existing
  quirk recorded for the Phase 4 RLS follow-up list.
