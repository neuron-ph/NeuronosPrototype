# Essentials Financial Architecture V2 Blueprint

> Derived from `src/docs/specs/ESSENTIALS_FINANCIAL_ARCHITECTURE_V2.md`
> Status: proposed
> Last updated: 2026-03-18

---

## 1. Goal

Refactor the Essentials financial system from a **project-number-centered** model to a **booking-first** model.

Target outcome:

- `booking` becomes the atomic service-finance unit
- `project` and `contract` become rollup containers, not the recording basis
- `invoice` remains a single-customer packaging document over booking-owned charge lines
- `collection` remains invoice-linked
- project, contract, customer, and aggregate financial views become derived rollups over booking-based financial data

This blueprint is for **Essentials mode only**. It should leave a clean extension path for Full Suite without forcing non-booking accounting into Essentials.

---

## 2. Non-Goals

This refactor does **not** attempt to fully solve:

- customer credit / overpayment handling
- refunds
- office/admin expense accounting
- AP approval flows
- GL posting orchestration
- non-booking financial transactions
- Full Suite-only voucher workflows

Those must remain future layers on top of the booking-first Essentials core.

---

## 3. Current Problems to Eliminate

The current codebase has several architecture leaks that violate the V2 spec.

### 3.1 `project_number` is acting like a pseudo-primary key

Current examples:

- `src/hooks/useProjectFinancials.ts`
- `src/hooks/useContractFinancials.ts`
- `src/hooks/useProjectsFinancialsMap.ts`
- `src/hooks/useFinancialHealthReport.ts`
- `src/components/accounting/FinancialsModule.tsx`

Symptoms:

- invoices, collections, and expenses are fetched by `project_number`
- contract financials use the contract container reference as a pseudo project-number scope
- aggregate reporting groups by project by default even when contract-only bookings are valid

### 3.2 `booking_id` falls back to project identifiers

Current examples:

- `src/components/shared/billings/UnifiedBillingsTab.tsx`
- `src/utils/financialCalculations.ts`
- `src/components/accounting/UnifiedExpensesTab.tsx`
- `src/components/accounting/dashboard/ReceivablesAgingBar.tsx`

Symptoms:

- `booking_id` sometimes stores a project number fallback
- virtual billings are created with `booking_id = projectNumber`
- downstream code must defensively detect fake booking IDs

This is the most damaging data-shape problem in the current architecture.

### 3.3 Contract finance is modeled as a project exception

Historical examples:

- `src/hooks/useContractFinancials.ts`
- `src/hooks/useContractBillings.ts` (removed in Phase 9)
- `src/utils/contractAdapter.ts` (removed in Phase 9)

Symptoms:

- contract records are adapted into `project_number` flows
- contract-only bookings are not treated as first-class financial contexts

### 3.4 Shared totals still encode old semantics

Current examples:

- `src/utils/financialCalculations.ts`
- `src/components/accounting/reports/SalesReport.tsx`
- `src/hooks/useFinancialHealthReport.ts`

Symptoms:

- totals mix operational value, billing state, and cash state under ambiguous labels
- project-level grouping is baked into report computation

---

## 4. Target Architecture

### 4.1 Source-of-truth hierarchy

Essentials financial truth should follow this chain:

```text
Project / Contract (containers)
        ↓
Booking (one service)
        ↓
Billing Line Items / Expenses
        ↓
Invoice
        ↓
Collection
```

### 4.2 Rules to make structurally true

- every service billing line must reference a real `booking_id`
- every Essentials expense must reference a real `booking_id`
- a spot booking must belong to a project
- a contract booking must belong to a contract
- a contract booking may also belong to a project
- one billing line may belong to one invoice at most
- one invoice may package lines from many bookings/projects/contracts, but only for one customer
- project and contract profitability are derived booking aggregates

---

## 5. Refactor Strategy

Use a **strangler** approach:

1. Introduce booking-first domain types and shared selectors
2. Move hooks and calculations onto booking-first lineage
3. Refactor UI modules to consume the new lineage
4. Recompute aggregate and reporting views from bookings upward
5. Remove project-number fallbacks and compatibility shims only after the new flows are stable

This avoids rewriting the whole finance surface in one step.

---

## 6. Phase Plan

## Phase 0: Freeze Vocabulary and Mapping Rules

**Objective:** Align terminology in code and docs before touching behavior.

Tasks:

- codify the canonical Essentials definitions:
  - booking = one service
  - project = spot/grouped work umbrella
  - contract = pricing/work umbrella
  - billing line = booking-owned revenue atom
  - expense = booking-owned direct cost
  - invoice = packaging document
  - collection = cash receipt
- define canonical KPI labels:
  - booked charges
  - unbilled charges
  - invoiced amount
  - collected amount
  - direct cost
  - gross profit
- mark old terms as legacy:
  - project financial key
  - contract-as-project adaptation
  - pseudo-booking fallback IDs

Artifacts:

- keep `src/docs/specs/ESSENTIALS_FINANCIAL_ARCHITECTURE_V2.md` as the target-state doc
- use this blueprint as the implementation tracker

Exit criteria:

- all implementation phases below use the same vocabulary

Implementation notes:

- 2026-03-17: vocabulary frozen in the V2 spec and this blueprint. New implementation work will use:
  - booking-first financial truth
  - project/contract as containers
  - invoice as packaging document
  - collection as invoice-linked cash document
  - booked charges / unbilled charges / invoiced amount / collected amount / direct cost / gross profit as canonical KPI labels

---

## Phase 1: Introduce Booking-First Financial Domain Types

**Objective:** Stop spreading `any`-shaped finance records and define the target record contracts.

Primary files:

- `src/types/accounting.ts`
- new: `src/types/financials.ts`
- `src/utils/financialCalculations.ts`

Tasks:

- add booking-first domain types:
  - `BookingFinancialContext`
  - `BookingChargeLine`
  - `BookingExpense`
  - `BookingInvoiceLink`
  - `BookingCollectionAllocation`
  - `BookingProfitabilityRow`
- add explicit booking pricing basis type:
  - `pricing_basis: 'spot' | 'contract'`
- separate record identity from denormalized context:
  - required truth keys
  - optional display/filter keys
- define one normalization layer from Supabase rows to domain rows
- update financial totals interfaces to use V2 names where possible

Implementation guidance:

- do not immediately rename every old UI prop
- introduce adapters first, then migrate consumers phase by phase

Exit criteria:

- the main financial hooks and utilities can return typed booking-first rows
- fake booking IDs are no longer part of the type contract

Implementation notes:

- 2026-03-17: introduced `src/types/financials.ts` for booking-first domain models.
- 2026-03-17: introduced `src/utils/financialNormalization.ts` to normalize Supabase rows into booking-first types and explicitly classify legacy project-number booking fallbacks.
- 2026-03-17: extended `src/utils/financialCalculations.ts` with V2 total aliases while preserving legacy fields used by existing UI surfaces.

---

## Phase 2: Build Shared Booking-First Selectors and Fetch Layer

**Objective:** Replace project-number-centric fetch logic with a reusable booking-first financial loader.

Primary files:

- `src/hooks/useProjectFinancials.ts`
- `src/hooks/useContractFinancials.ts`
- `src/hooks/useProjectsFinancialsMap.ts`
- new: `src/hooks/useBookingFinancials.ts`
- new: `src/hooks/useContainerFinancials.ts`

Tasks:

- create a shared booking-first fetch layer that:
  - loads raw finance tables once
  - resolves booking lineage
  - groups records by `booking_id`
- create container resolvers:
  - project -> linked booking IDs
  - contract -> linked booking IDs
  - project+contract -> linked booking IDs
- refactor `useProjectFinancials` to:
  - stop treating `project_number` as the primary filter
  - derive financials from the project’s linked bookings
- refactor `useContractFinancials` to:
  - stop using the contract container reference as fake `project_number`
  - derive contract financials from linked booking IDs and contract context
- refactor `useProjectsFinancialsMap` to:
  - compute project financials from booking rollups
  - keep `project_number` as a rollup key only

Required behavior changes:

- `invoice` lookup must be line-driven where possible:
  - invoice contains billing lines
  - billing lines point to bookings
- `collection` attribution stays invoice-based
- booking, project, and contract rollups should all use the same underlying selectors

Exit criteria:

- project and contract financial hooks share one booking-first lineage engine
- no hook uses contract quote number as a fake project number

Implementation notes:

- 2026-03-17: introduced `src/hooks/financialData.ts` to decouple the shared financial result contract from `useProjectFinancials.ts`.
- 2026-03-17: introduced `src/utils/financialSelectors.ts` to centralize booking ID collection, invoice/billing/collection scope filtering, and compatibility-aware expense mapping.
- 2026-03-17: introduced `src/hooks/useContainerFinancials.ts` as the shared booking-first container pipeline for project, contract, and booking scopes.
- 2026-03-17: introduced `src/hooks/useBookingFinancials.ts` as a booking-scope entry point for future consumers.
- 2026-03-17: refactored `src/hooks/useProjectFinancials.ts` and `src/hooks/useContractFinancials.ts` to consume the shared container hook instead of encoding separate lineage rules.
- 2026-03-17: contract/project hooks now share one selector pipeline driven by linked booking IDs.
- 2026-03-18: `src/hooks/useContractFinancials.ts` now uses neutral `contractReference` naming; contract financial loading still uses the contract container reference as a read-side scope key, but no longer frames that as a fake project-number flow.

---

## Phase 3: Remove Pseudo-Booking Fallbacks from Billing Creation and Merge Logic

**Objective:** Ensure every service charge line points to a real booking.

Primary files:

- `src/components/shared/billings/UnifiedBillingsTab.tsx`
- `src/hooks/useBillingMerge.ts`
- `src/utils/financialCalculations.ts`
- `src/components/shared/billings/AddChargeModal.tsx`
- `src/components/shared/billings/BillingCategorySection.tsx`
- `src/components/contracts/RateCalculationSheet.tsx`
- `src/utils/rateCardToBilling.ts`

Tasks:

- remove logic that sets `booking_id = projectId` or `booking_id = projectNumber`
- require real booking resolution for:
  - quotation-derived virtual items
  - manually added billing rows
  - rate-card-generated billing rows
  - billable-expense promotion
- when a project has multiple bookings:
  - resolve booking by service type
  - if ambiguous, require explicit selection instead of fallback
- update virtual billing generation so it never emits fake booking references
- update merge logic to dedupe and merge by true booking-linked identity

Important decision:

- if a project has no booking yet for a would-be charge line, that line should remain unsaved/virtual or blocked until a booking exists
- do not silently attach it to the project as a fake booking

Exit criteria:

- no new billing line can be persisted without a real `booking_id`
- no virtual billing line uses a project number as booking ID

Implementation notes:

- 2026-03-17: started Phase 3 by tightening the shared billing write path in:
  - `src/components/shared/billings/UnifiedBillingsTab.tsx`
  - `src/hooks/useBillingMerge.ts`
  - `src/components/shared/billings/AddChargeModal.tsx`
  - `src/components/shared/billings/BillingCategorySection.tsx`
- 2026-03-17: project-level billing creation no longer defaults new rows to `booking_id = projectId`.
- 2026-03-17: billing save now blocks persistence when a row still cannot resolve to a real booking.
- 2026-03-17: manual charge creation from booking-less contexts is now blocked instead of silently creating project-scoped pseudo-booking records.
- 2026-03-17: audited the remaining rate-card billing path in:
  - `src/components/contracts/RateCalculationSheet.tsx`
  - `src/utils/rateCardToBilling.ts`
- 2026-03-17: the rate-card generator already emits real `booking_id` values from the booking context and does not require a project-number fallback patch.
- 2026-03-18: the remaining runtime `useContractBillings.ts` compatibility hook was removed in Phase 9; shared contract billing surfaces now flow through the booking-first financial hooks and neutral container contract.

---

## Phase 4: Normalize Expense Semantics to Booking-First Essentials Rules

**Objective:** Make Essentials expenses purely booking-linked direct costs.

Primary files:

- `src/components/accounting/UnifiedExpensesTab.tsx`
- `src/components/projects/ProjectExpensesTab.tsx`
- `src/components/operations/shared/ExpensesTab.tsx`
- `src/components/accounting/FinancialsModule.tsx`
- `src/utils/financialCalculations.ts`

Tasks:

- remove implicit “project number as booking ID” behavior from expense flows
- make all Essentials expense UIs require real booking linkage
- normalize expense mapping so costs are represented consistently across:
  - project detail
  - contract detail
  - booking detail
  - aggregate financial views
- redefine billable-expense promotion as:
  - expense remains the cost record
  - generated billing line becomes the revenue-side reimbursement line

Important constraints:

- Essentials expense records are final-on-record
- approval/posting states may remain in schema, but Essentials calculations should not depend on Full Suite approval semantics

Exit criteria:

- all Essentials direct costs are booking-linked
- expense totals no longer rely on project fallback lineage

Implementation notes:

- 2026-03-17: started Phase 4 by separating booking linkage from project container context in the expense creation path:
  - `src/components/accounting/UnifiedExpensesTab.tsx`
  - `src/components/accounting/evouchers/CreateEVoucherForm.tsx`
  - `src/components/accounting/AddRequestForPaymentPanel.tsx`
  - `src/hooks/useEVoucherSubmit.ts`
- 2026-03-17: project-level expense creation no longer passes `project_number` as a fake booking ID; it now requires a resolved booking selection before opening the Operations expense form.
- 2026-03-17: Operations expense submission now rejects create/save attempts that do not carry a real `bookingId`.
- 2026-03-17: booking expense reads in `src/components/operations/shared/ExpensesTab.tsx` now filter by `evouchers.booking_id` only.
- 2026-03-17: project expense reads in `src/components/projects/ProjectExpensesTab.tsx` now roll up from linked booking IDs instead of `project.id` / `project.project_number` fallbacks.
- 2026-03-17: `src/components/accounting/FinancialsModule.tsx` expense search/grouping now treats `bookingId` as the booking truth key and surfaces missing booking linkage as an explicit unlinked state instead of silently falling back to `projectNumber`.
- 2026-03-17: `src/hooks/useProjectFinancials.ts` now uses the evoucher-backed expense path so project financial totals align with the booking-linked Essentials expense model.
- 2026-03-17: `src/hooks/useProjectsFinancialsMap.ts` now computes project list rollups from linked booking IDs through shared selectors for invoices, billing items, evoucher expenses, and collections instead of direct `project_number` expense matching.
- 2026-03-17: `src/components/projects/ProjectFinancialsTab.tsx` now consumes `useProjectFinancials(...)` instead of issuing direct `project_number` queries against billing/expense evouchers.

---

## Phase 5: Refactor Invoice Packaging Around Booking-Owned Lines

**Objective:** Make invoices clearly line-packaging documents rather than pseudo-container records.

Primary files:

- `src/components/projects/invoices/InvoiceBuilder.tsx`
- `src/components/shared/invoices/UnifiedInvoicesTab.tsx`
- `src/components/accounting/FinancialsModule.tsx`
- `src/components/accounting/reports/SalesReport.tsx`
- related invoice detail sheets/components

Tasks:

- enforce invoice creation from selected booking-owned billing lines
- preserve the rule:
  - one line -> one invoice at most
- support invoice packaging across:
  - multiple bookings
  - multiple projects
  - multiple contracts
  - single customer only
- demote invoice-header `project_number` to convenience-only if it cannot represent all linked lines
- derive invoice project/contract lineage from invoice lines for drill-down and reporting
- update invoice tables and detail sheets to show:
  - customer
  - booking count
  - booking/project/contract references as derived metadata

Important recommendation:

- if multi-container invoices are common, invoice header should not be treated as belonging to exactly one project

Exit criteria:

- invoice behavior is line-packaging-first
- booking/project/contract attribution is derived from line contents, not assumed from one header field

Implementation notes:

- 2026-03-17: started Phase 5 read-side cleanup in `src/components/accounting/FinancialsModule.tsx` by removing `project_number` fallback from booking-grouped billing and invoice aggregates.
- 2026-03-17: booking-grouped billings/invoices in the aggregate module now surface explicit `Unlinked ...` buckets instead of silently treating project-level refs as booking ownership.
- 2026-03-17: `src/components/projects/invoices/InvoiceBuilder.tsx` now derives invoice booking/project/contract lineage from the selected billing lines and persists `booking_ids`, `project_refs`, and `contract_refs` on invoice creation.
- 2026-03-17: `src/components/shared/invoices/UnifiedInvoicesTab.tsx` now displays line-derived invoice lineage metadata instead of relying only on invoice-header `project_number`.

---

## Phase 6: Rebuild Collection Attribution as Invoice-First, Booking-Derived Cash Reporting

**Objective:** Keep collections invoice-linked while making booking/project/contract cash rollups accurate.

Primary files:

- `src/components/shared/collections/UnifiedCollectionsTab.tsx`
- `src/components/projects/collections/CollectionCreatorPanel.tsx`
- `src/components/accounting/FinancialsModule.tsx`
- `src/components/accounting/reports/SalesReport.tsx`
- new shared allocation utility if needed

Tasks:

- keep `collection.invoice_id` as the canonical settlement link
- add derived booking attribution for reporting by tracing:
  - collection -> invoice -> billing lines -> booking
- define allocation rule for multi-booking invoices:
  - simplest target: proportional allocation by invoiced booking line amount
- expose customer-level cash truth separately from booking/project rollups

Important note:

- collection records should not be rewritten to fake booking ownership
- booking-level collected cash must remain a derived metric

Exit criteria:

- collections stay invoice-first
- booking/project/contract cash rollups are explicit and reproducible

Implementation notes:

- 2026-03-17: started Phase 6 read-side cleanup in `src/components/accounting/FinancialsModule.tsx` by removing `project_number` fallback from booking-grouped collection aggregates.
- 2026-03-17: booking-grouped collections in the aggregate module now surface explicit `Unlinked Collection` buckets until derived booking allocation is implemented.
- 2026-03-17: `src/components/shared/collections/UnifiedCollectionsTab.tsx` now derives the “Applied To” summary from the linked invoice and its `booking_ids`, instead of treating collections as project-scoped documents.
- 2026-03-17: `src/utils/financialSelectors.ts` collection scope filtering now matches invoice-linked cash through `linked_billings` as well as direct `invoice_id`, so multi-invoice collections stay visible in booking/container rollups.
- 2026-03-17: `src/utils/accounting-math.ts` invoice balance math now falls back to direct `collection.invoice_id` when legacy records do not carry `linked_billings`, keeping invoice status and balance views consistent during the transition.
- 2026-03-17: `src/components/projects/collections/CollectionCreatorPanel.tsx` now computes open invoice balances from `calculateInvoiceBalance(...)`, receives the current collections list from the parent, and persists `invoice_id` for single-invoice collections while keeping multi-invoice applications in `linked_billings`.
- 2026-03-17: `src/components/shared/collections/UnifiedCollectionsTab.tsx` now summarizes application lineage from `linked_billings` first and only falls back to direct `invoice_id`, so multi-invoice collections no longer appear as unallocated in the shared table.
- 2026-03-18: verification review confirmed the live collection path matches the Phase 6 target:
  - `collection.invoice_id` remains canonical for single-invoice settlement
  - `linked_billings` carries multi-invoice applications
  - booking/project/contract cash rollups are derived through invoice linkage and `calculateInvoiceBalance(...)`, not by writing fake booking ownership onto collection rows

---

## Phase 7: Recompute Aggregate and Report Surfaces from Booking Rollups

**Objective:** Remove project-first assumptions from dashboard, aggregates, and reports.

Primary files:

- `src/components/accounting/FinancialsModule.tsx`
- `src/hooks/useFinancialHealthReport.ts`
- `src/components/accounting/reports/FinancialHealthPage.tsx`
- `src/components/accounting/reports/SalesReport.tsx`
- dashboard components under `src/components/accounting/dashboard/`

Tasks:

- change aggregate grouping defaults to booking-first where appropriate
- keep project and contract as rollup/grouping options, not hard-coded assumptions
- replace any “No Booking -> fallback to project number” grouping with explicit unresolved states
- update sales/profitability formulas to align with V2 KPI language:
  - booked charges
  - invoiced amount
  - collected amount
  - direct cost
  - gross profit
- rebuild the Financial Health report from booking aggregates and then roll up to project/customer views
- review aggregate navigation logic:
  - when a record has both project and contract, pick navigation based on source record lineage, not just project-number presence

Exit criteria:

- aggregate pages can report accurately on:
  - contract-only bookings
  - project-only spot bookings
  - mixed project+contract bookings
- no report requires project existence to compute service finance

Implementation notes:

- 2026-03-17: `src/components/accounting/reports/SalesReport.tsx` now derives collected cash and outstanding balance through `calculateInvoiceBalance(...)` instead of summing only `collection.invoice_id`, aligning report cash math with the invoice screens and linked-billing collection model.
- 2026-03-18: `src/hooks/useFinancialHealthReport.ts` now builds financial-health rows from finance-record lineage instead of using `projects` as the financial grouping source; billing, expense, invoice, and collection data are rolled up by derived project refs first, then contract refs, then an explicit `Unlinked` bucket.
- 2026-03-18: the financial-health rollup now allocates collected cash back to project/contract rows through invoice share maps built from billing lines, with invoice-header fallback only when line-level lineage is missing.
- 2026-03-18: `src/components/accounting/reports/FinancialHealthPage.tsx` now uses less project-exclusive labels on the table/export/search surfaces so contract-only rows can appear without reading like broken project data.
- 2026-03-18: `src/components/accounting/dashboard/FinancialDashboard.tsx` summary context now counts derived work containers from project/contract refs instead of counting only `project_number` values from billing rows.
- 2026-03-18: `src/components/accounting/reports/SalesReport.tsx` now uses the already-derived `projectNumber`/container ref in the row mapper instead of falling back to invoice-header `project_number`.
- 2026-03-18: `src/components/accounting/dashboard/FinancialDashboard.tsx` now computes `Outstanding AR`, overdue invoice attention items, unpaid invoice counts, and payment reminder balances through `calculateInvoiceBalance(...)` instead of trusting invoice header `remaining_balance` / `payment_status`.
- 2026-03-18: `src/components/accounting/dashboard/ReceivablesAgingBar.tsx` now receives collections and previous-period collections, and its open-invoice filtering, bucket totals, and prior-period bucket trends use collection-aware invoice balances instead of raw invoice balance fields.
- 2026-03-18: `src/components/accounting/FinancialsModule.tsx` invoice and collection tables now search, group, display refs, and deep-link from derived booking/project/contract lineage rather than raw invoice or collection header `project_number` fields.
- 2026-03-18: `src/components/accounting/FinancialsModule.tsx` now resolves collection lineage through linked invoices, so contract-only and multi-container cash records no longer disappear behind project-first grouping assumptions.

---

## Phase 8: Introduce Cancellation and Immutability Rules in UI Workflows

**Objective:** Prevent destructive financial edits after invoicing/collection begins.

Primary files:

- booking detail views
- billing edit flows
- invoice packaging flows
- collection flows
- relevant action panels and detail sheets

Tasks:

- define booking cancellation decision tree in UI/service logic:
  - no invoice + no costs -> cancel and void unbilled lines
  - costs only -> preserve costs, void normal revenue
  - invoiced -> use reversal/credit flow
  - collected -> preserve cash history, defer to future credit/refund flow
- enforce edit restrictions:
  - once invoiced, billing lines should be immutable except via reversal patterns
- update destructive actions to become archival/reversal actions where needed

Exit criteria:

- Essentials preserves financial history correctly
- cancellation no longer risks silent data corruption

Implementation notes:

- 2026-03-18: started Phase 8 immutability guardrails in:
  - `src/components/shared/billings/UnifiedBillingsTab.tsx`
  - `src/components/shared/billings/BillingsTable.tsx`
  - `src/components/projects/invoices/InvoiceBuilder.tsx`
- 2026-03-18: billed / paid / invoiced billing lines are now blocked from local edit and delete handlers in the shared billing UI, including category rename/delete actions that would mutate invoiced lines indirectly.
- 2026-03-18: billing save now rejects mutated immutable lines if stale UI state somehow bypasses the row-level guards.
- 2026-03-18: invoice submission now re-validates that selected charge lines are still `unbilled` and not already attached to an invoice before creating a new invoice document.
- 2026-03-18: introduced `src/utils/bookingCancellation.ts` as a shared booking financial-state assessor for cancellation/deletion guard decisions.
- 2026-03-18: destructive booking delete actions in:
  - `src/components/operations/BrokerageBookings.tsx`
  - `src/components/operations/MarineInsuranceBookings.tsx`
  - `src/components/operations/OthersBookings.tsx`
  - `src/components/operations/TruckingBookings.tsx`
  - `src/components/operations/forwarding/ForwardingBookings.tsx`
  now hard-delete only finance-clean bookings; bookings with unbilled charges, costs, invoices, or collections are blocked with cancellation/reversal guidance instead of allowing history loss.
- 2026-03-18: booking detail status changes to `Cancelled` in:
  - `src/components/operations/BrokerageBookingDetails.tsx`
  - `src/components/operations/MarineInsuranceBookingDetails.tsx`
  - `src/components/operations/OthersBookingDetails.tsx`
  - `src/components/operations/TruckingBookingDetails.tsx`
  - `src/components/operations/forwarding/ForwardingBookingDetails.tsx`
  now consult the shared booking financial-state assessor before persisting the status change.
- 2026-03-18: `src/utils/bookingCancellation.ts` now includes `voidBookingUnbilledCharges(...)`, allowing the booking detail status flows to auto-void unbilled booking-linked charges before persisting a `Cancelled` status when the booking is still pre-invoice.
- 2026-03-18: billing status handling now treats `voided` as a first-class immutable state in:
  - `src/components/shared/billings/UnifiedBillingsTab.tsx`
  - `src/components/shared/billings/BillingsTable.tsx`
  - `src/components/shared/billings/BillingCategorySection.tsx`
  - `src/components/accounting/FinancialsModule.tsx`
- 2026-03-18: voided billing rows are now excluded from active billings KPIs / totals and rendered as locked view-only rows, preventing cancelled pre-invoice work from continuing to inflate active charge totals.
- 2026-03-18: introduced `src/utils/invoiceReversal.ts` as the first document-level reversal seam for invoiced cancellations.
- 2026-03-18: `src/components/accounting/billings/BillingDetailsSheet.tsx` now:
  - shows whether linked collections block reversal work
  - detects existing reversal drafts for an invoice
  - allows creation of a separate reversal-draft invoice when no collections exist
- 2026-03-18: reversal drafts mirror the original invoice into a new negative-value invoice document with `metadata.reversal_of_invoice_id`, preserving the original invoice while providing a non-destructive next step for billed/invoiced booking cancellation.
- 2026-03-18: cancellation is now allowed for:
  - finance-clean bookings
  - cost-only bookings, preserving costs
  - unbilled-charge bookings, after explicit user confirmation and automatic voiding of unbilled booking-linked charge rows
- 2026-03-18: cancellation remains blocked for billed/invoiced or collected bookings at the booking-status layer until full reversal completion and customer credit / refund handling are implemented.
- 2026-03-18: booking-cancellation decision-tree wiring now exists across the service-specific booking detail/list flows. A single unified Essentials cancellation panel is still optional future UX polish, but it is no longer a blocker for the Phase 8 safety criteria.
- 2026-03-18: invoice visibility/totals now distinguish active AR documents from reversal workflow documents in:
  - `src/utils/invoiceReversal.ts`
  - `src/utils/financialSelectors.ts`
  - `src/utils/financialCalculations.ts`
  - `src/components/accounting/AggregateInvoicesPage.tsx`
  - `src/components/shared/invoices/UnifiedInvoicesTab.tsx`
- 2026-03-18: project/contract invoice tabs and aggregate invoice views now surface `reversal_draft` / `reversed` invoice rows explicitly while excluding those documents from active invoice totals and outstanding AR totals.
- 2026-03-18: `src/components/accounting/billings/BillingDetailsSheet.tsx` now supports guarded reversal completion: when the reversal draft exists and the original invoice has no linked collections, the user can complete the reversal, which marks the source invoice as `reversed` and the reversal document as `reversal_posted` without mutating the original billing-line ownership.
- 2026-03-18: `src/utils/bookingCancellation.ts` now ignores completed reversal invoice pairs when classifying cancellation risk, so bookings can move past `reversal-required` once their billed history has been fully reversed and no collections remain.
- 2026-03-18: introduced `src/utils/collectionResolution.ts` as the shared customer-credit / refund seam for collected cancellations.
- 2026-03-18: `credited` and `refunded` collections now remain visible in history but stop counting as invoice-settling cash in:
  - `src/utils/accounting-math.ts`
  - `src/utils/financialCalculations.ts`
  - `src/utils/invoiceReversal.ts`
  - `src/utils/bookingCancellation.ts`
  - `src/hooks/useFinancialHealthReport.ts`
  - `src/components/accounting/dashboard/FinancialDashboard.tsx`
- 2026-03-18: `src/components/accounting/collections/CollectionDetailsSheet.tsx` now exposes explicit actions to resolve a linked collection as either customer credit or refund, updating the collection record (and mirrored evoucher when present) without deleting the cash history.
- 2026-03-18: collection list surfaces now recognize the new resolution states in:
  - `src/components/shared/collections/UnifiedCollectionsTab.tsx`
  - `src/components/accounting/FinancialsModule.tsx`
- 2026-03-18: `src/components/projects/collections/CollectionCreatorPanel.tsx` now appends a clear note when part of a received payment is left unapplied as pending customer credit.
- 2026-03-18: collected bookings are no longer blocked forever at the architecture level; the operational path is now:
  - resolve collection to customer credit or refund
  - create / complete invoice reversal
  - cancel booking
- 2026-03-18: future application of stored customer credit to a new invoice is still deferred; this pass only establishes the resolution state needed for safe cancellation and reversal in Essentials.

---

## Phase 9: Cleanup, Backward-Compatibility Removal, and Full Suite Seams

**Objective:** Remove temporary compatibility code and isolate the future Full Suite extension points.

Primary files:

- all compatibility hooks introduced in earlier phases
- `src/utils/financialCalculations.ts`
- reporting and aggregate helpers

Tasks:

- remove contract-as-project adapter logic that is no longer needed
- remove pseudo-booking fallback branches
- remove legacy KPI labels that conflict with V2 semantics
- isolate the future Full Suite expansion seam:
  - booking-linked operational finance
  - non-booking company finance

Exit criteria:

- the Essentials finance core is internally consistent
- Full Suite can be layered later without undoing this refactor

Implementation notes:

- 2026-03-18: started Phase 9 by removing the legacy KPI alias contract from `src/utils/financialCalculations.ts`; `FinancialTotals` is now V2-only and returns:
  - `bookedCharges`
  - `unbilledCharges`
  - `invoicedAmount`
  - `collectedAmount`
  - `directCost`
  - `paidDirectCost`
  - `netCashFlow`
  - `grossProfit`
  - `grossMargin`
  - `outstandingAmount`
  - `overdueAmount`
- 2026-03-18: migrated remaining project-level consumers off the removed alias fields in:
  - `src/hooks/useProjectsFinancialsMap.ts`
  - `src/components/projects/tabs/ProjectFinancialOverview.tsx`
- 2026-03-18: `npm.cmd run build` passes after the V2-only totals cleanup, confirming the active financial hook/UI path no longer depends on the removed `revenue` / `productionValue` / `cost` / `collected` / `profitMargin` / `openInvoicesAmount` alias fields.
- 2026-03-18: introduced `FinancialContainer` in `src/types/financials.ts` and moved the shared invoice / collection / expense surfaces off `Project`-only typing in:
  - `src/components/shared/invoices/UnifiedInvoicesTab.tsx`
  - `src/components/shared/collections/UnifiedCollectionsTab.tsx`
  - `src/components/projects/invoices/InvoiceBuilder.tsx`
  - `src/components/projects/collections/CollectionCreatorPanel.tsx`
  - `src/components/projects/ProjectExpensesTab.tsx`
- 2026-03-18: `src/components/pricing/ContractDetailView.tsx` now builds a neutral financial container directly from the contract quotation instead of adapting the contract into a fake project object.
- 2026-03-18: removed `src/utils/contractAdapter.ts` from the runtime path; the shared accounting tabs now depend on container fields they actually consume rather than the old contract-as-project compatibility seam.
- 2026-03-18: cleaned the build verification path:
  - `src/main.tsx` is now the single global stylesheet entry and imports `src/styles/globals.css`
  - `src/App.tsx` no longer double-imports global CSS, eliminating the Tailwind/PostCSS `@import` ordering warning
  - `src/App.tsx` now lazy-loads the major route modules through `React.lazy(...)` + `Suspense`, reducing the entry bundle and allowing Vite to emit smaller route chunks
  - `vite.config.ts` now uses normalized vendor chunk matching for stable vendor splitting without the previous large-chunk warning
- 2026-03-18: removed the unused runtime compatibility hook `src/hooks/useContractBillings.ts`.
- 2026-03-18: `src/hooks/useContractFinancials.ts` now uses neutral `contractReference` naming instead of the old `contractQuoteNumber` compatibility framing.
- 2026-03-18: `npm.cmd run build` now completes without the previous Tailwind/PostCSS warning, without the Vite large-chunk warning, and without circular-chunk warnings.
- 2026-03-18: verification review against the Section 9 checklist found the remaining work to be blueprint hygiene and legacy-data backfill rather than missing Essentials architecture:
  - booking-linked billing writes are enforced
  - booking-linked expense writes are enforced in Essentials flows
  - invoice packaging is line-driven and multi-booking capable
  - collection settlement is invoice-first with derived rollups
  - reporting is booking/container-derived rather than project-required
  - cancellation/reversal/credit flows preserve financial history

---

## 7. Proposed File Ownership by Refactor Slice

### Domain / Types / Utilities

- `src/types/accounting.ts`
- `src/types/financials.ts`
- `src/utils/financialCalculations.ts`
- new shared lineage/allocation utils if needed

### Hooks

- `src/hooks/useProjectFinancials.ts`
- `src/hooks/useContractFinancials.ts`
- `src/hooks/useProjectsFinancialsMap.ts`
- `src/hooks/useFinancialHealthReport.ts`
- `src/hooks/useBillingMerge.ts`
- new booking/container financial hooks

### Billing UI

- `src/components/shared/billings/UnifiedBillingsTab.tsx`
- `src/components/shared/billings/BillingsTable.tsx`
- `src/components/shared/billings/AddChargeModal.tsx`
- `src/components/shared/billings/BillingCategorySection.tsx`
- `src/components/projects/ProjectBillingsTab.tsx`

### Invoice / Collection UI

- `src/components/projects/invoices/InvoiceBuilder.tsx`
- `src/components/shared/invoices/UnifiedInvoicesTab.tsx`
- `src/components/shared/collections/UnifiedCollectionsTab.tsx`
- `src/components/projects/collections/CollectionCreatorPanel.tsx`

### Aggregate / Reports

- `src/components/accounting/FinancialsModule.tsx`
- `src/components/accounting/dashboard/*`
- `src/components/accounting/reports/FinancialHealthPage.tsx`
- `src/components/accounting/reports/SalesReport.tsx`

### Project / Contract Detail Consumers

- project detail financial tabs
- contract detail financial tabs
- booking read-only financial views

---

## 8. Data Migration / Compatibility Considerations

This blueprint assumes the schema may already contain records with polluted lineage.

Expected legacy data issues:

- `billing_line_items.booking_id` holding a project number
- contract-finance rows keyed through `project_number`
- expense rows missing real booking linkage

Recommended migration order:

1. stop creating new bad records
2. introduce read-side compatibility to interpret old records
3. backfill or repair old lineage where feasible
4. remove compatibility branches only after the dataset is clean enough

Important rule:

- write path must be fixed before read-side cleanup is considered complete

---

## 9. Verification Checklist

The refactor is only complete when all of the following work:

### Booking truth

- a spot booking inside a project produces booking-linked charges and costs
- a contract-only booking produces booking-linked charges and costs without requiring a project
- a contract booking inside a project still rolls up correctly to both project and contract

### Invoice behavior

- one invoice can package charges from multiple bookings for one customer
- invoice drill-down still shows correct booking/project/contract lineage
- one billing line cannot end up on two invoices

### Collection behavior

- a collection reduces invoice outstanding correctly
- booking-level collected cash can be derived from multi-booking invoices

### Reporting

- booking profitability works with no project fallback
- project profitability equals the sum of its bookings
- contract profitability equals the sum of its bookings
- aggregate reports include contract-only work correctly

### Cancellation safety

- cancelling a booking without invoices/costs does not leave orphan financial rows
- cancelling an invoiced booking does not delete historical records

---

## 10. Recommended Execution Order

Recommended implementation order:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8
9. Phase 9

Reasoning:

- types and selectors must stabilize first
- write-path cleanup must happen before aggregate/report cleanup
- cancellation/immutability should be layered after line/document lineage is stable

---

## 11. Current Status Tracker

- [x] Phase 0: Vocabulary and mapping rules frozen
- [x] Phase 1: Booking-first financial domain types introduced
- [x] Phase 2: Shared booking-first selectors and fetch layer built
- [x] Phase 3: Pseudo-booking fallbacks removed from billing flows
- [x] Phase 4: Expense semantics normalized to booking-first Essentials rules
- [x] Phase 5: Invoice packaging refactored around booking-owned lines
- [x] Phase 6: Collection attribution rebuilt as invoice-first, booking-derived
- [x] Phase 7: Aggregate and report surfaces rebuilt from booking rollups
- [x] Phase 8: Cancellation and immutability rules introduced
- [x] Phase 9: Cleanup and Full Suite seams finalized

---

## 12. Final Statement

This blueprint implements the V2 principle that:

- service finance starts at the booking
- containers organize work but do not own the atomic economics
- invoices package value
- collections settle invoices
- all higher-level profitability is derived from booking truth

That is the correct Essentials architecture for the business rules currently defined.
