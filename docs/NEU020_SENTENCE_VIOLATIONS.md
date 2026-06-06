# NEU-020 — Core-Sentence Violation Census (2026-06-07)

**The sentence (the spec):** every write/action affordance must be governed by EXACTLY
the permission key of the grid row it visually belongs to, and the action column it
represents. `can(KEY, ACTION)` must use that row's own moduleId. A violation = the
affordance rides a coarser/wrong key, so the grid cell above it is dead ("the grid lies").

Found via a 6-agent read-only audit (Projects, Contracts, Contacts/Customers, Bookings,
Quotations/Inquiries/EV, Accounting+misc). Triggered by Marcus spotting the project
Quotation tab amend riding `bd_projects:edit` while "Quotation → Edit" was dashed.

## The recurring pattern
A container's **core document/record is editable via the container's ROOT edit key**, so
the document tab's own Edit cell is dead. Recurs wherever a document lives in a container.

## TIER 1 — P0 (write bypasses its own dashed cell)
| # | File:Line | Affordance | Wrong gate | Correct gate |
|---|---|---|---|---|
| 1 | ProjectDetail.tsx:671 + handleSaveQuotation ~207-213 | Amend project Quotation (+ PDF Studio save path) | `ids.root:edit` (`*_projects:edit`) | `ids.quotation:edit` (`*_projects_quotation_tab:edit`) |
| 2 | ContractDetailView.tsx:1205 + handleSaveContractQuotation ~359 | Amend contract Quotation (also covers rate-card version mints) | `ids.root:edit` (`*_contracts:edit`) | `ids.quotation:edit` (`*_contracts_quotation_tab:edit`) |
| 3 | BookingInfoTab.tsx:36,124-167 (shared by all 5 booking detail pages) | Booking **Info** tab Edit/Save (top-level + details fields) | per-service root `ops_<svc>:edit` (via `opsModuleForService`) | `ops_<svc>_info_tab:edit` |

## TIER 2 — P1 (door-blind / wrong-action)
| # | File:Line | Issue | Correct gate |
|---|---|---|---|
| 4 | BookingInfoTab.tsx:36 (Others via Pricing door) | key re-derived from `serviceType`, ignores `door` → pricing-door Info edit gated by `ops_others` (wrong door) | `pricing_others_info_tab:edit` when door=pricing |
| 5 | ProjectBookingsTab.tsx:34 (+ ProjectServiceCard.tsx:36) | "Create Booking" hardcoded `ops_projects_bookings_tab:create` regardless of door → bd/pricing/acct Bookings→Create cells dead | door's `ids.bookings:create` |
| 6 | quotationAccess.ts:9-21; BusinessDevelopment.tsx:889; Pricing.tsx:60,594 | quotation-file **lens** picks key by USER department, not ROUTE (the quotation half of the 2.5 lens death) | route-derived door (bd_inquiries on /inquiries, pricing_quotations on /quotations) |
| 7 | QuotationFileView.tsx:108,1286,1318 | Export PDF / Quick Download ride `:export` but `bd_inquiries`/`pricing_quotations` have NO export column → no valid live cell | add export column to the quotation door OR fold into view per DD-21 |
| 8 | JournalEntryDetailPanel.tsx:155-158,790 | "Edit Entry" + "Reverse Entry" gated by `acct_journal:create OR :edit` → create-only user can edit/reverse posted JEs | Edit→`acct_journal:edit`; Reverse→`:edit` (no delete column exists) |

## TIER 3 — P2 (review / by-design / latent — confirm or defer)
- ProjectDetail Delete-Project menu gated by root:edit not root:delete (currently an `alert()` stub).
- ProjectServiceCard.tsx:36 Create-Booking OR-gate + door-blind (legacy; uses deprecated `linkedBookings`; verify still mounted).
- ContractDetailView Bookings-tab create gated by ops service key (defensible — created entity is ops-owned); Rate-Card tab `ids.rateCard:edit` is dead (edits only via root paths).
- StatusChangeButton.tsx:183-399 quotation Approve/Disapprove/Cancel ride `:edit` — BY DESIGN (DD-13 retired the quotation `:approve` column).
- EVoucherWorkflowPanel.tsx Disburse/Verify&Post/Unlock ride `acct_evouchers:approve` (no edit column); Unlock is destructive yet rides `:approve` not delete. Manager approve rides `my_evouchers:approve` (NEU-012 DB dept-match).
- CustomerLedgerDetail.tsx:300 "Edit customer" button ungated but inert (no onClick, "coming soon").
- JournalEntryDetailPanel Post-to-GL create-class riding the conflated `canAct`.
- RateCalculationSheet.tsx / RateCardGeneratorPopover.tsx billing writes have NO `can()` gate — but neither component is currently rendered (dead code).

## Signed exceptions (NOT violations — confirmed)
- Billing/Collection detail-sheet Post-to-GL + reversal = DD-22 record-mirroring.
- Contact/Customer task-proof attachment upload rides `ids.tasks:edit` (task-intrinsic, not the entity Attachments tab).
- Contract Billings tab hard read-only (rollup); contract Invoices/Collections on transitional OR-fallback pending door-thread.

## Fix playbook (uniform, zero-loss)
For each root→tab fix: (1) add the tab's missing action cell to `actionApplicability.ts`;
(2) re-key the affordance `ids.root` → `ids.<tab>`; (3) seed `tab:action ⇐ root:action` so
nobody loses today's ability; (4) guard + tsc baseline + DB zero-loss probe; commit.

## WAVE 2 (no-knob class + uncovered surfaces) — added 2026-06-07

Second sweep (4 agents): shared participation surfaces, admin/exec/profiling, pricing
builders, and an app-wide no-knob (dept/role/hardcoded) hunt incl. Calendar/Reports/
Dashboard/Activity Log.

### New violations
| # | File:Line | Issue | Correct gate | Sev |
|---|---|---|---|---|
| 9 | OperationsTeamsSection.tsx:114 | Service-Manager edit + assignment-role CRUD gated by `admin_teams_tab:edit`, but the backing RLS (migration 166) requires `exec_profiling:edit`. UI shows the buttons to `admin_teams_tab` holders but the DB denies (and vice-versa) — UI⇄DB key desync. Sibling `ServicesAndRolesPage`/`DepartmentTeamsSection` correctly use `exec_profiling:edit`. | `exec_profiling:edit` | **P1** |
| 10 | FinancialStatementsPage.tsx:1419; GeneralJournal.tsx:503; BookingCashFlowReport.tsx:424; FinancialHealthPage.tsx:316; ChargeExpenseMatrix.tsx:388; aggregate/GroupedDataTable.tsx:408 | **Export CSV** buttons with NO `can()` gate. `export` is a real grid action and is gated elsewhere (ActivityLog, InvoiceBuilder, QuotationFileView) — these 6 were missed. | `<host module>:export` | P2 |
| 11 | calendar/EventSheet.tsx:531 (edit save); CalendarModule.tsx:158 (drag-reschedule) | Editing/rescheduling your OWN event gated by ownership only, not `calendar:edit` (which exists). Create + delete ARE knob-gated. | `calendar:edit` | P2 |
| 12 | inbox/AssignModal.tsx:36 (handler); ComposeBox/ComposePanel Send `disabled` | Defense-in-depth only: write handler / button-enable lack an in-handler `can()` backstop, though the entry trigger is correctly gated. Not exploitable. | (backstop) | P2 |

### Confirmed CLEAN by wave 2 (important negative results)
- **Shared CommentsTab + EntityAttachmentsTab fail CLOSED** (`canPost`/`canUpload`/`canDelete` default `false`); every caller passes the surface's own `*_comments_tab`/`*_attachments_tab` key+action. NEU-018's "view = participate" fear is already remediated.
- **`src/utils/permissions.ts` does NOT exist** — the legacy `canPerform*`/`canAccessModule`/`canDeleteEVoucher` helpers have **zero runtime callers** (docs only). The NEU-012 "legacy hardcoded gates" axis is already gone. No `department===`/`role===` check gates any live write affordance app-wide. `roleDefaultVisibilityScope` is data-scoping only.
- **Admin/Exec/Access-Config** clean except #9: AccessConfiguration, UserManagement, CreateUserPage, UserDetailPage, profiling CRUD, AccessProfiles — all on correct keys. `isExec` in ServicesAndRolesPage IS `can('exec_profiling','edit')` (correct, just misnamed). Settings auto-caps + "Save as company default" gated (exec_profiling / company_settings).
- **Pricing builders** (QuotationBuilderV3, ContractRateCardV2, line items, catalog combobox, PartnerSheet) clean — host-gated; catalog writes → `acct_catalog`, vendor → `pricing_network_partners`. The only smell is the quotation-file lens (#6, already listed).
- **Inbox** compose/reply/retract/assign/approve fully gated. **Executive Dashboard, Activity Log, Reports module** clean (read-only / gated).

### Dead code noted (delete, don't gate — DD-17 doctrine)
AccessOverridesTab + PermissionsMatrix (ungated writes, unrendered), VendorsList "Add Vendor" (orphan), StatusChangeButton vestigial `userRole` prop, RateCalculationSheet/RateCardGeneratorPopover (ungated, unmounted).

### Coverage caveat
This audits the **UI affordance layer** only. RLS still ORs legacy keys until the separate
Phase-4 DB pass — UI⇄RLS desyncs (like #9) are exactly what that pass must reconcile.

## Proposed batching
- **2.10a** — Tier 1 (#1 project quotation, #2 contract quotation, #3 booking Info ×5) + #4 Others-door + #5 ProjectBookings create. One batch; shared registry+seed.
- **2.8** — already slated: #6 quotation lens death + #7 export column.
- **journal fix** — #8 (split `canAct` into per-action gates).
- Tier 3 — await Marcus's ruling per item.
