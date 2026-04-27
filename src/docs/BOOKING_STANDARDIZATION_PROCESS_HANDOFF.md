# Booking Standardization Process Handoff

Date: 2026-04-26

Audience: Marcus, Claude, Codex, and the Neuron implementation team

## Purpose

This document explains where the Booking Screen Standardization work currently stands, what the goal is, what source material drove the work, what Claude implemented, what Codex reviewed and fixed, and what still needs to be completed before the booking standard can be considered fully production-ready.

The short version: the booking system is now much closer to the target standard. The five service booking flows are schema-driven, detail views now use the shared booking information tab, snake_case detail payloads are supported, and compatibility exists for old camelCase records. The remaining work is mostly about making the standard real in production behavior: profile-backed dropdowns, exact requiredness rules, service catalog integration, and a few product decisions.

## Original Goal

Neuron needs one consistent booking information structure across all service types while still preserving the exact fields the client provided for each operation.

The target structure is:

1. General Information
2. General Specific Booking Information
3. Booking Information Details

General Information means fields genuinely repeated across services, such as booking name, booking number, service type, customer, account owner, account handler, quotation reference, project or contract reference, movement, status, and team assignment.

General Specific Booking Information means fields that the client considers part of the general booking screen, but which are actually specific to a service's workflow. Examples include Brokerage Type, Customs Entry, Forwarding Incoterms, Cargo Nature, Truck Type, and Marine Insurance service selection.

Booking Information Details means the real execution data for the service: shipment details, customs details, container details, trucking delivery details, policy information, and miscellaneous service descriptions.

## Source Material Reviewed

The standard was derived from the client-provided dump under:

`docs/Booking List`

Files reviewed:

- `docs/Booking List/Inputs_for_Brokerage_Forwarding_Trucking_Marine_Insurance__Others.pdf`
- `docs/Booking List/Brokerage/Brokerage Module - Import.pdf`
- `docs/Booking List/Brokerage/Brokerage Module - Export.pdf`
- `docs/Booking List/Brokerage/BROKERAGE.docx`
- `docs/Booking List/Forwarding/Forwarding Module - Import.pdf`
- `docs/Booking List/Forwarding/Forwarding Module - Export.pdf`
- `docs/Booking List/Forwarding/FORWARDING..pdf`
- `docs/Booking List/Trucking/viber_image_2026-04-22_17-01-52-589.png`

Two internal documentation files were created from those client inputs:

- `src/docs/BOOKING_SCHEMA_STANDARD.md`
- `src/docs/BOOKING_INFORMATION_SCREEN_SPEC.md`

The schema standard explains the conceptual model, storage strategy, field naming rules, cross-service input types, and service-by-service requirements.

The screen spec is the more implementation-oriented document. It states what the actual booking information screen should contain per service, what each input type should be, and which fields are conditional.

## Current Process State

The implementation is no longer just a document or plan. There is now a working central booking schema and shared rendering system in the codebase.

Completed architecture pieces:

- Central booking field definitions exist in `src/config/booking`.
- Shared dynamic form components exist in `src/components/operations/shared`.
- Compatibility and payload mapping utilities exist in `src/utils/bookings`.
- All five create booking panels now use the shared dynamic booking form.
- All five booking detail views now render the Booking Information tab through the shared schema-driven `BookingInfoTab`.
- New booking detail payloads are designed to save snake_case keys.
- Old camelCase records are normalized for display through compatibility helpers.
- Targeted tests pass.
- Production build passes.

Important caveat:

The system is structurally aligned, but some product behavior is still incomplete. Most notably, fields marked as profile-backed still render as plain text, several fields that are client-required are currently optional due to softened validation rules, and Service/s options are currently static rather than sourced from a real service catalog/profile module.

## What Claude Implemented

Claude completed the initial implementation across the plan phases and recorded progress on `AGENT_COORDINATION.md`.

### Phase 1: Central Schema Config

Claude added the booking schema files under:

- `src/config/booking/bookingFieldTypes.ts`
- `src/config/booking/bookingFieldOptions.ts`
- `src/config/booking/bookingScreenSchema.ts`
- `src/config/booking/bookingVisibilityRules.ts`

This introduced:

- Service schema definitions for Brokerage, Forwarding, Trucking, Marine Insurance, and Others.
- Shared General Information fields.
- Service-specific General Specific Booking Information sections.
- Service-specific Booking Information Details sections.
- Conditional display rules based on service type, movement, mode, incoterms, and status.
- Service-specific status options.
- Field control types such as dropdown, segmented control, date, datetime, multi-select, multi-value, repeater, currency, percent, profile-lookup, and autofill-readonly.

### Phase 2: Compatibility and Payload Mapping

Claude added utilities under:

- `src/utils/bookings/bookingDetailsCompat.ts`
- `src/utils/bookings/bookingPayload.ts`

This introduced:

- Normalization from legacy camelCase detail keys to canonical snake_case keys.
- Service-specific compatibility mappings, such as Forwarding `forwarder` to `agent`.
- Payload splitting between top-level booking columns and `bookings.details`.
- Support for preserving old detail keys while new saves use snake_case.

### Phase 3: Shared Dynamic Form Components

Claude added shared booking form components under:

- `src/components/operations/shared/BookingDynamicForm.tsx`
- `src/components/operations/shared/BookingSectionRenderer.tsx`
- `src/components/operations/shared/BookingFieldRenderer.tsx`
- `src/components/operations/shared/useBookingFormState.ts`
- `src/components/operations/shared/bookingFormValidation.ts`

This introduced:

- A schema-driven renderer for booking sections and fields.
- Shared validation based on visible required fields.
- Shared form state normalization.
- Repeater support.
- Multi-value and multi-select support.
- Read-only display behavior for detail pages.

### Phases 4 to 8: Create Panel Rewrites

Claude rewrote all five create booking panels to use the dynamic schema-driven form:

- `src/components/operations/CreateBrokerageBookingPanel.tsx`
- `src/components/operations/forwarding/CreateForwardingBookingPanel.tsx`
- `src/components/operations/CreateTruckingBookingPanel.tsx`
- `src/components/operations/CreateMarineInsuranceBookingPanel.tsx`
- `src/components/operations/CreateOthersBookingPanel.tsx`

This replaced the previous hard-coded create forms with schema-driven rendering and shared payload creation.

### Phase 9: Detail View Normalization

Claude initially normalized booking records before dispatching to detail views through `BookingFullView`.

That was a good compatibility step, but it did not yet fully standardize the actual detail screens because the detail screens still had hand-built sections.

### Later Phase 9 Completion: Schema-Driven BookingInfoTab

After review feedback, Claude adapted all five booking detail views to render the shared `BookingInfoTab`.

Files now using `BookingInfoTab`:

- `src/components/operations/BrokerageBookingDetails.tsx`
- `src/components/operations/forwarding/ForwardingBookingDetails.tsx`
- `src/components/operations/TruckingBookingDetails.tsx`
- `src/components/operations/MarineInsuranceBookingDetails.tsx`
- `src/components/operations/OthersBookingDetails.tsx`

This was a major step because the actual booking screens now point at the same schema architecture used by creation flows.

### Phase 10: Autofill Integration

Claude added compatibility for autofill/project/contract data so existing handoffs continue to populate booking forms.

Work included:

- Additional camelCase-to-snake_case mappings.
- Normalization for prefill inputs.
- Preservation of project and contract handoff behavior.
- Fixes around `linkBookingToProject`.

### Phase 11: Tests

Claude added and expanded tests across:

- Schema visibility.
- Status options.
- Payload splitting.
- Compatibility normalization.
- Integration-style schema/payload behavior.

At one checkpoint, 75 tests passed. After follow-up fixes, the targeted suite reached 88 passing tests.

## What Codex Did

Codex first read and extracted the client source files, then helped create the standard docs, wrote implementation planning, reviewed Claude's implementation, wrote review feedback for Claude, and then made several targeted fixes directly.

### Source Extraction and Schema Documentation

Codex read all files under `docs/Booking List`, including nested Brokerage, Forwarding, and Trucking materials.

Codex produced:

- `src/docs/BOOKING_SCHEMA_STANDARD.md`
- `src/docs/BOOKING_INFORMATION_SCREEN_SPEC.md`

These documents captured:

- The three-part booking screen structure.
- Universal General Information fields.
- Service-specific fields for Brokerage, Forwarding, Trucking, Marine Insurance, and Others.
- Input type recommendations.
- Conditional display rules.
- Current Neuron gaps.
- Implementation priorities.

### Implementation Plan

Codex wrote the implementation plan at:

`C:\Users\Marcus\.claude\plans\booking-screen-standardization-plan.md`

That plan broke the work into phases:

1. Alignment and guardrails.
2. Central schema config.
3. Compatibility and payload mapping.
4. Shared dynamic booking form components.
5. Brokerage implementation.
6. Marine Insurance implementation.
7. Trucking implementation.
8. Forwarding implementation.
9. Others implementation.
10. Detail views and edit views.
11. Autofill, contract, and project integration.
12. Tests and QA.

### Code Review for Claude

Codex reviewed Claude's initial implementation and wrote:

`C:\Users\Marcus\.claude\plans\booking-screen-standardization-code-review.md`

Major findings in that review:

- Required-field semantics were too strict and blocked create forms.
- Service/s used `optionKey: service_catalog` but had no options wired.
- Repeater fields could add blank unusable rows.
- Legacy compatibility mappings had issues.
- Save-as-default team preference behavior was inconsistent.
- Autofill-readonly labels were unclear.
- Profile lookups were still plain text.
- Disabled segmented controls could still look interactive.
- Detail views were not yet truly schema-driven.

### Fixes Codex Applied

After Claude adapted the detail views, Codex made additional direct fixes.

Files touched included:

- `src/config/booking/bookingFieldOptions.ts`
- `src/config/booking/bookingVisibilityRules.ts`
- `src/components/operations/shared/BookingFieldRenderer.tsx`
- `src/components/operations/shared/BookingInfoTab.tsx`

Fixes included:

- Added static service catalog and sub-service catalog option lists as a temporary bridge.
- Added `getOptionKeyOptions()` so `optionKey` fields resolve to actual selectable options.
- Updated option resolution so `service_catalog`, `sub_service_catalog`, and status option keys work.
- Made multi-select rendering include selected values even if they are not currently in the option list, preventing existing data from disappearing visually.
- Updated `BookingInfoTab` to render `BookingTeamSection` above schema sections.
- Updated `BookingInfoTab` to run validation before saving.
- Prevented the detail tab from writing `status` through the generic booking information save, since status is controlled by the header status selector.
- Ensured generic detail saves merge over existing `details` instead of replacing them.
- Passed validation errors into section rendering.

Codex initially tried making Service/s required again, but tests revealed the current system still intentionally treats catalog-backed fields as optional during the transition. Codex reverted that requiredness change to keep the create flows passing.

### Latest Audit

Codex performed a fresh audit comparing:

- The current codebase.
- `BOOKING_SCHEMA_STANDARD.md`.
- `BOOKING_INFORMATION_SCREEN_SPEC.md`.
- Every source file under `docs/Booking List`.

Audit result:

The system is now mostly aligned on field presence, but not yet fully aligned on behavior.

Main remaining gaps:

- Profile-backed fields are still rendered as plain text inputs.
- Most `conditional` required fields are effectively optional unless they have explicit `requiredWhen`.
- Service/s and Sub-Service/s are static and optional, not truly catalog/profile-backed and required.
- Forwarding Domestic movement needs confirmation because the Forwarding note mentions Import, Export, Domestic, but code only gives Domestic to Trucking.
- Team Assignment is generic Manager/Supervisor/Handler, while client docs mention more specific operational roles.
- Forwarding charges are simple currency fields, not charge repeaters or billing line items.
- Others still exposes optional internal fields beyond the client-required service description.
- LCL/Air location fields can be duplicated as both `location_of_goods` and `warehouse_location`.

## Current Technical State

### Schema

The core schema lives in:

`src/config/booking/bookingScreenSchema.ts`

Service schemas currently exported:

- `BROKERAGE_SCHEMA`
- `FORWARDING_SCHEMA`
- `TRUCKING_SCHEMA`
- `MARINE_INSURANCE_SCHEMA`
- `OTHERS_SCHEMA`
- `BOOKING_SCHEMA_MAP`

The schemas define sections in this order:

- Shared General Information.
- Service-specific General Specific Booking Information.
- Service-specific details sections.

Some services have additional detail subsections, such as:

- Brokerage FCL Details.
- Brokerage LCL Details.
- Brokerage Air Freight Details.
- Brokerage Import Customs Details.
- Forwarding FCL Details.
- Forwarding LCL Details.
- Forwarding Air Freight Details.
- Forwarding Delivery Information.
- Trucking Delivery Information.
- Trucking Destinations.
- Trucking Container / FCL Details.
- Marine Policy Information.
- Marine Internal Policy Details.
- Others Additional Details.

### Rendering

Create flows use:

`BookingDynamicForm`

Detail booking information tabs use:

`BookingInfoTab`

Individual fields are rendered through:

`BookingFieldRenderer`

Sections are rendered through:

`BookingSectionRenderer`

### Validation

Validation lives in:

`src/components/operations/shared/bookingFormValidation.ts`

Validation currently:

- Skips invisible fields.
- Skips team assignment because it is handled by form shells.
- Requires fields marked `required: 'yes'`.
- Requires `conditional` fields only when `requiredWhen` matches.
- Treats conditional fields without `requiredWhen` as not required.

This behavior avoids blocking manual create flows but means many client-required conditional fields are not yet enforced.

### Persistence

Payload creation lives in:

`src/utils/bookings/bookingPayload.ts`

Top-level fields go to `bookings` columns.

Service-specific fields go to `bookings.details`.

New work uses snake_case detail keys.

Legacy camelCase compatibility lives in:

`src/utils/bookings/bookingDetailsCompat.ts`

## Current Service-by-Service Coverage

### Brokerage

Current coverage is strong at the field-presence level.

Implemented areas:

- Movement.
- Primary trade party with Import/Export dynamic label.
- Brokerage Type.
- Mode.
- Cargo Type.
- Customs Entry.
- Customs Entry Procedure.
- Service/s.
- Sub-Service/s.
- Incoterms.
- Consignee and Shipper.
- MBL/MAWB and HBL/HAWB.
- Carrier.
- POL/AOL and POD/AOD.
- Forwarder.
- Description of Goods.
- Gross Weight.
- Measurement.
- Chargeable Weight for Air Freight.
- Preferential Treatment.
- Country of Origin.
- Registry Number.
- Vessel.
- Flight Number.
- ETD, ETA, ETB, LCT.
- Additional Information.
- FCL container fields.
- Import customs fields.
- Examination repeater.
- Duties/taxes, brokerage fee, HS codes, rate of duty, permits.

Remaining Brokerage gaps:

- Profile fields are not actual profile lookups.
- `Type of Entry` wording from summary PDF may need to map to `Customs Entry`.
- Service/s and Sub-Service/s are not real catalog-driven profile values yet.
- Some client-required conditional fields are not enforced.
- Duplicate location fields may need cleanup for LCL/Air.

### Forwarding

Current coverage is strong at the field-presence level.

Implemented areas:

- Movement.
- Primary trade party with dynamic Import/Export label.
- Mode.
- Incoterms.
- Cargo Type.
- Cargo Nature.
- Customs Entry Procedure Code.
- Service/s and Sub-Service/s.
- Overseas Agent and Local Agent.
- Consignee and Shipper.
- MBL/MAWB and HBL/HAWB.
- Registry Number.
- Carrier.
- POL/AOL and POD/AOD.
- Agent.
- Consolidator for LCL.
- Commodity Description.
- Gross Weight.
- Dimensions.
- Chargeable Weight for Air Freight.
- Country of Origin and Destination.
- Preferential Treatment.
- Tagging Time.
- ETD, ETB, ETA.
- Vessel.
- Flight Number.
- Type of Package.
- Remarks.
- FCL container fields.
- Det/Dem, cut-off time, transit time, routing, stackable.
- LCL/Air warehouse/location fields.
- Collection address for EXW.
- Delivery address for DAP/DDU/DDP.
- Shipping Charges and Consolidator Charges.

Remaining Forwarding gaps:

- Client note says Type of Shipment includes Domestic. Code currently only gives Domestic to Trucking.
- Profile fields are not actual profile lookups.
- Charges are simple currency inputs, not line-item charge repeaters.
- Service/s and Sub-Service/s are static and optional.
- Conditional requiredness is not fully enforced.

### Trucking

Current coverage matches the trucking image well.

Implemented areas:

- Truck Type.
- Container Number replacing visible quotation reference.
- Preferred Delivery Date.
- Service/s.
- Consignee.
- Driver.
- Helper.
- Vehicle Reference Number.
- Pull Out.
- Pull Out Date.
- Delivery Address.
- Delivery Instructions.
- Date Delivered.
- Date of Empty Return.
- Destinations repeater.
- TABS Booking.
- Empty Return.
- CY Fee.
- EIR Availability.
- Early Gate In.
- Storage Validity.
- Det/Dem Validity.
- Shipping Line.
- Statuses: Draft, Ongoing, Delivered, Empty Return, Liquidated, Billed, Paid, Cancelled.

Remaining Trucking gaps:

- Many starred fields from the image are not enforced as required.
- Profile fields are not actual profile lookups.
- Service/s is static and optional.
- Quotation Reference is preserved as lineage, but the exact display behavior should remain confirmed with operations.

### Marine Insurance

Current coverage now aligns much better with the client policy information list.

Implemented areas:

- Service/s.
- Shipper.
- Consignee.
- BL/AWB Number.
- Carrier.
- Commodity Description.
- HS Code/s.
- POL/AOL and POD/AOD.
- ETD and ETA.
- Amount Insured.
- Insurer.
- Date Issued.
- Optional internal policy details: Policy Number, Premium, Coverage Type, Policy Start Date, Policy End Date, Remarks.

Remaining Marine Insurance gaps:

- Insurer, shipper, consignee, carrier, and ports are still plain text rather than profile/search fields.
- Service/s is static and optional.
- Optional internal fields may need to be hidden behind an advanced/internal group if the client-facing screen should stay minimal.
- Conditional requiredness for issued policy fields needs tighter enforcement.

### Others

Current coverage includes the client-required core plus extra optional/internal fields.

Implemented areas:

- Service/s.
- Service/s Description.
- Remarks.
- Delivery Location.
- Schedule Date.
- Completion Date.
- Contact Person.
- Contact Number.
- Special Instructions.
- Estimated Cost.
- Actual Cost.

Remaining Others gaps:

- Client only explicitly required Service/s and Service/s Description.
- Extra fields may make the screen feel overbuilt unless they are clearly marked internal/optional.
- Service/s is static and optional.

## Verification Status

Latest targeted test command:

```powershell
npm.cmd run test -- src/config/booking/bookingScreenSchema.test.ts src/utils/bookings/bookingPayload.test.ts src/utils/bookings/bookingIntegration.test.ts
```

Result:

- 3 test files passed.
- 88 tests passed.

Latest build command:

```powershell
npm.cmd run build
```

Result:

- Build passed.
- Existing warning remains in `src/components/Pricing.tsx` around nullish coalescing.
- Large chunk warnings remain from Vite.

## Current Risks

### Profile Inputs Are Not Real Yet

The code has `profile-lookup` as a control type, but it renders as a plain text input. This means the team should not yet tell the client that customer, consignee, shipper, carrier, agent, port, warehouse, driver, helper, shipping line, or insurer fields are truly profile-backed.

### Requiredness Is Softened

The system intentionally avoids making most conditional fields blocking. This protects create flows, but it also means the system does not yet enforce every client-required field exactly.

### Service Catalog Is Temporary

Service/s and Sub-Service/s currently use static option lists. They should eventually be sourced from the actual service catalog or profiling module.

### Detail Views Use the New Tab, But Old Code Still Exists

The active booking information tab now uses `BookingInfoTab`, but the old hand-built `BookingInformationTab` functions and related legacy section code still exist in some detail files below the active render path. This is not necessarily a runtime problem, but it is cleanup debt and can confuse future maintainers.

### Working Tree Has Broad Unrelated Changes

The working tree includes changes outside booking standardization, including accounting, billing, catalog, pricing, and deleted billing component files. Those should not be silently treated as part of the booking standardization review unless intentionally included.

## Recommended Next Steps

### Step 1: Confirm Product Decisions

Marcus or the operations team should confirm:

- Should Forwarding support Domestic movement now?
- Should Service/s be required on every service?
- Should Sub-Service/s remain on Brokerage despite the Brokerage note saying sub-category may be redundant with line items?
- Should Others show the optional internal fields by default?
- Should Marine Insurance internal fields be visible by default?
- Should Team Assignment stay Manager/Supervisor/Handler or include service-specific role labels?

### Step 2: Implement Real Profile Lookup Controls

Replace plain text rendering for `profile-lookup` with a reusable searchable control.

Minimum profile targets:

- Customer.
- Consignee.
- Shipper.
- Carrier.
- Forwarder.
- Agent.
- Consolidator.
- Port/Airport.
- Country.
- Warehouse.
- Trucking company.
- Driver.
- Helper.
- Shipping line.
- Insurer.
- User/account owner/account handler.

### Step 3: Tighten Requiredness Rules

Add explicit `requiredWhen` rules for client-required conditional fields, or adjust the model to support:

- Required when visible.
- Required only on submit.
- Required only when sourced from quotation/project/contract.
- Required only for specific movement/mode/incoterm/status.

### Step 4: Wire Service Catalog Options to Real Data

Replace static service and sub-service option arrays with real service catalog or profile-backed options.

Until then, static options are acceptable as a transition bridge, but they should be documented as temporary.

### Step 5: Clean Legacy Detail Code

Remove or quarantine old unused hand-built booking information tab code from service detail files after confirming `BookingInfoTab` is fully stable.

### Step 6: Manual QA by Service Scenario

Run manual QA for:

- Brokerage Import FCL.
- Brokerage Export FCL.
- Brokerage Import LCL.
- Brokerage Air Freight.
- Forwarding Import FCL.
- Forwarding Export LCL.
- Forwarding Air Freight.
- Forwarding EXW collection address.
- Forwarding DAP/DDU/DDP delivery address.
- Trucking Ongoing.
- Trucking Delivered.
- Trucking Empty Return.
- Trucking Liquidated.
- Marine Insurance Draft.
- Marine Insurance Issued.
- Others simple service booking.
- Create booking from Project.
- Create booking from Contract.
- Open booking from Accounting booking shell.

## Practical Definition of Current Done

The current work can be considered structurally complete for the booking standardization foundation.

It is not yet fully product-complete because:

- Profile-backed controls are not live.
- Requiredness is not exact.
- Service catalog source is not real.
- Some product decisions remain open.
- Manual browser QA has not been recorded in this document.

## Practical Definition of Final Done

The booking standardization should be considered fully done when:

- All five booking services render from the central schema.
- Create and detail screens use the same section and field contract.
- Every client-provided field is implemented, intentionally optional, or explicitly deferred.
- Conditional visibility works for movement, mode, incoterm, and status.
- Requiredness matches the client source and operational reality.
- Profile-backed fields use real searchable dropdowns or combo boxes.
- Service/s and Sub-Service/s come from real catalog/profile data.
- New saves use snake_case `details` keys.
- Old records still display correctly.
- Project/contract/quotation handoff flows still work.
- Accounting booking browsing still works.
- Targeted tests pass.
- Build passes.
- Manual QA has been completed across all major service scenarios.

## Ownership Summary

Claude owned the bulk implementation of the central booking schema, dynamic form infrastructure, create panel rewrites, detail tab adaptation, compatibility layer, payload mapping, and test expansion.

Codex owned source extraction, documentation, implementation planning, code review, issue reporting to Claude, follow-up fixes, and the latest source-vs-system audit.

Marcus owned product direction and validation, especially the three-part booking structure, review of the client input dump, and decisions around how operational concepts should appear in Neuron.

## Current Recommended Handoff Message to Claude

The booking standardization foundation is in good shape. The next highest-value work is not adding more fields. It is making the existing schema behavior real:

- Replace `profile-lookup` plain text with searchable profile controls.
- Add exact `requiredWhen` rules for client-required conditional fields.
- Wire Service/s and Sub-Service/s to real catalog/profile data.
- Confirm Forwarding Domestic movement.
- Clean old inactive detail tab code.
- Run manual QA across the listed service scenarios.

