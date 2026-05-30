# Ticket Board

Internal tracking for Neuron OS. Claude is the primary reader/writer — Marcus drops tickets here, Claude keeps status current.

**Status:** `Todo` · `In Progress` · `Blocked` · `Review` · `Done`
**Priority:** `P0` critical · `P1` high · `P2` normal · `P3` low

---

## Active

| ID | Title | Area | Priority | Status | Notes |
|----|-------|------|----------|--------|-------|
| NEU-004 | Closing of tickets from Inbox | Inbox / Workflow | P2 | Todo | Let users close/resolve workflow inbox items directly. Confirm what "closed" means for downstream handoffs. |

## Done

| ID | Title | Area | Closed | Notes |
|----|-------|------|--------|-------|
| NEU-003 | Multiple POD rate billing | Pricing / Billing | 2026-05-30 | Per-POD (port-of-discharge) contract rate cards. Each POD gets its own complete, standalone rate card (REPLACE model, not additive). Data: optional `pod_scope?: string[]` on `ContractRateMatrix` (undefined/empty = applies to all PODs = legacy default → zero migration). Engine: new `selectMatrixForPod()` (scoped POD wins → global fallback) wired into `calculateContractBilling` + `generateRateCardBillingItems`; bookings carry one POD. UX ("Idea 1"): one card with a header `POD:` selector — "Default rates — all other PODs" + each POD; picking a port seeds a copy of default in one step; reset folded into the dropdown menu. POD list sourced from each service form's `pods` field (NOT `contract_general_details.port_of_entry`, which isn't rendered in the builder). Trucking excluded from v1 (multi-line billing doesn't thread POD). Fix: booking POD lives under `pod_aod` for Brokerage — `BookingRateCardButton` now reads all field variants. No DB migration. Files: `types/pricing.ts`, `utils/contractRateEngine.ts`, `utils/rateCardToBilling.ts`, `quotations/ContractServiceRateGroup.tsx` (new), `quotations/ContractRateCardV2.tsx`, `quotations/QuotationBuilderV3.tsx`, `pricing/ContractDetailView.tsx`, `contracts/BookingRateCardButton.tsx` + `InlineRateCardSection.tsx` + `RateCalculationSheet.tsx`. |
| NEU-001 | Restrict duplicate MBL/MAWB on booking creation | Ops / Bookings | 2026-05-29 | Hard block, globally unique. Migration 124 adds partial unique index `bookings_unique_mbl_mawb` on `lower(btrim(details->>'mbl_mawb'))` (case/whitespace-insensitive; blank/draft MBLs exempt). `CreateForwardingBookingPanel` translates the 23505 violation into a friendly toast on both submit and save-draft paths. MBL/MAWB is filled by Ops after creation, so the guard fires at save, not at the create modal. ⚠️ Migration 124 is dev-only — apply to prod on release. |
| NEU-005 | Countries for Vendor | Vendors | 2026-05-29 | Countries are name-only (no ISO), managed in Admin → Profiling → Countries. Migration 123 makes `profile_countries.iso_code` nullable; registry `country` entry keyed on `name` (fixes the previously-broken add). Vendor country dropdowns (`VendorDetail`, `PartnerSheet`, quotations `VendorsSection`) wired to `ProfileLookupCombobox`. `NetworkPartnersModule` filter now sources the managed list and uses a searchable, right-aligned `CustomDropdown` (added opt-in `searchable` + `align` props). Removed dead `COUNTRIES` export. ⚠️ Migration 123 is dev-only — apply to prod on release. |
| NEU-002 | Attachment support for E-Voucher request | Accounting / E-Voucher | 2026-05-29 | File picker in `AddRequestForPaymentPanel`, upload via `uploadCrmAttachments` to `attachments` bucket, persisted to `evouchers.attachments` JSONB. Openable links in `EVoucherDetailView`. No migration needed. |

---

### Conventions
- **ID:** `NEU-###`, incrementing. Never reuse a number.
- **Area:** module/domain — Sales, Pricing, Contracts, Ops, Accounting, HR, RBAC, Catalog, Inbox, Vendors, Infra.
- Move to **Done** when merged; note the commit/PR.
- One ticket = one shippable change. Split anything larger.
- Open questions live in the Notes cell until resolved.
