# Final Quotation-Booking Alignment Plan (Strict Matrix Match)

Purpose: provide an implementation-safe plan for aligning the current quotation, booking, and handoff system to the source matrix in:

- `src/docs/FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md`
- `src/docs/FINAL_QUOTATION_BOOKING_IMPLEMENTATION_CHECKLIST.md`

This plan is intentionally stricter than the earlier draft. Its goal is a `1:1 match` with the source matrix. It removes inferred product decisions and prohibits new schema inventions unless the matrix or Marcus explicitly approves them.

## Primary Goal

End state:

- quotation inputs match the source quotation matrix,
- booking inputs match the source booking matrix,
- quotation-to-booking carry-over matches the source matrix,
- naming is normalized without breaking old records,
- no extra interpretation is introduced as a substitute for the matrix.

Success means:

- if the matrix says a field should exist, it exists,
- if the matrix says a field should not exist for a given service/mode/package/incoterm, it does not appear,
- if the matrix says a field carries from quotation to booking, that carry-over works,
- if the matrix says a field is booking-only, it is not forced into quotation.

## Non-Negotiable Guardrails

Claude must follow these guardrails during implementation:

- Do not invent new business fields unless they are explicitly in the source matrix or explicitly approved by Marcus.
- Do not encode speculative product decisions as requirements.
- Do not split one matrix field into multiple canonical fields unless the matrix explicitly requires the split.
- Do not add new user-facing controls just to make the implementation easier.
- Do not create a parallel booking architecture. Booking source of truth remains `src/config/booking/bookingScreenSchema.ts`.
- Do not leave quotation logic spread permanently across JSX branches. Move toward a quotation schema/config source of truth.
- Do not remove legacy storage compatibility. Any normalization must preserve old records and existing reads.
- Do not preserve current-system behavior when it conflicts with the source matrix, unless Marcus explicitly approves that deviation.

## Explicit Corrections To The Earlier Draft

The following items must be treated as `not approved` and therefore `out of scope` unless Marcus later says otherwise:

- Do not add a new explicit `trucking_mode` field unless Marcus separately approves it.
- Do not keep `Marine Insurance Movement` as an intentional deviation. The target is the source matrix as written.
- Do not invent `agent_origin` and `agent_destination`.
- Do not invent a new separate `brokerage_fee_sad` field unless Marcus separately approves it.

Implementation should instead target the source matrix exactly:

- Trucking FCL/LCL behavior should be driven by existing service/mode context if possible, not by a newly invented field.
- Marine Insurance General Information visibility should match the matrix, even if that means removing current extra visibility.
- Forwarding agent-related fields should only map to matrix-backed concepts already present in the final schema comparison:
  - `Forwarder (if any)`
  - `Overseas Agent`
  - `Local Agent`
- Brokerage fee behavior should match existing matrix-backed booking fields only.

## Source-Of-Truth Interpretation

The matrix defines four implementation layers:

1. `Quotation General Information`
2. `Quotation Service-Specific Inputs`
3. `Booking General Information`
4. `Booking Service-Specific Inputs`

It also defines three logic axes:

1. service type
2. mode or shipment type (`FCL`, `LCL`, `AIR` where applicable)
3. quotation subtype logic:
   - Brokerage: `Standard`, `All-Inclusive`, `Non-Regular`
   - Forwarding: `EXW`, `FOB`, `CFR`, `CIF`, `FCA`, `CPT`, `CIP`, `DAP`, `DDU`, `DDP`

Implementation must mirror those axes directly instead of introducing substitute abstractions.

## Build Order

Recommended implementation order:

1. establish quotation schema/config source of truth
2. align quotation visibility to the matrix
3. align quotation validation and save normalization
4. align booking general information to the matrix
5. align booking service-specific fields to the matrix
6. align quotation-to-booking handoff to the matrix
7. complete compatibility/test sweep
8. refresh docs to reflect the final shipped behavior

This order reduces rework and keeps matrix-driven logic ahead of handoff logic.

## Phase 1 - Quotation Schema Foundation

Goal:

- create a centralized quotation schema/config that directly represents the source matrix.

Files to add:

- `src/config/quotation/quotationFieldTypes.ts`
- `src/config/quotation/quotationFieldOptions.ts`
- `src/config/quotation/quotationScreenSchema.ts`
- `src/config/quotation/quotationScreenSchema.test.ts`

Files to reference for structure:

- `src/config/booking/bookingFieldTypes.ts`
- `src/config/booking/bookingScreenSchema.ts`

What the quotation schema must define:

- shared quotation general fields
- brokerage quotation fields
- forwarding quotation fields
- trucking quotation fields
- marine insurance quotation fields
- others quotation fields
- visibility rules
- requiredness rules
- canonical storage keys
- legacy alias hints for normalization

Quotation general fields that must exist:

- `customer`
- `contact_person`
- `quotation_name`
- `services`
- `date`
- `credit_terms`
- `validity`

Brokerage quotation matrix that must be represented:

- quotation packages:
  - `Standard`
  - `All-Inclusive`
  - `Non-Regular`
- fields:
  - `Type of Entry`
  - `AOD/POD`
  - `Mode`
  - `Cargo Type`
  - `Commodity Description`
  - `Delivery Address`
  - `Country of Origin`
  - `Preferential Treatment`
- mode overlays:
  - `FCL -> Container Types & Quantity`
  - `LCL -> Gross Weight & Measurement`
  - `Air -> Gross Weight & Chargeable Weight`

Forwarding quotation matrix that must be represented:

- incoterms:
  - `EXW`
  - `FOB`
  - `CFR`
  - `CIF`
  - `FCA`
  - `CPT`
  - `CIP`
  - `DAP`
  - `DDU`
  - `DDP`
- fields:
  - `Incoterms`
  - `Cargo Type`
  - `Cargo Nature`
  - `Commodity Description`
  - `Delivery Address`
  - `AOL/POL`
  - `AOD/POD`
  - `Mode`
  - `Collection Address`
  - `Transit Time`
  - `Carrier/Airline`
  - `Routing`
  - `Stackable`

Trucking quotation matrix that must be represented:

- `Pickup Location`
- `Destination/s`
- `Delivery Instructions`
- `Truck Type`
- `Qty`

Marine Insurance quotation matrix that must be represented:

- `Commodity Description`
- `HS Code`
- `AOL/POL`
- `AOD/POD`
- `Invoice Value`

Others quotation matrix that must be represented:

- `Service Description`

Verification:

- schema test confirms every matrix field exists in the quotation schema
- schema test confirms every matrix visibility branch exists
- no runtime behavior change yet

## Phase 2 - Quotation Visibility Alignment

Goal:

- drive quotation field visibility from the schema instead of hard-coded JSX conditionals.

Files to edit:

- `src/components/pricing/QuotationBuilderV3.tsx`
- `src/components/pricing/quotations/GeneralDetailsSection.tsx`
- `src/components/pricing/quotations/BrokerageServiceForm.tsx`
- `src/components/pricing/quotations/ForwardingServiceForm.tsx`
- `src/components/pricing/quotations/TruckingServiceForm.tsx`
- `src/components/pricing/quotations/MarineInsuranceServiceForm.tsx`
- `src/components/pricing/quotations/OthersServiceForm.tsx`

Possible helper files:

- `src/utils/shared/visibilityEvaluator.ts`
- `src/utils/quotation/quotationVisibility.ts`

What must happen:

- existing inline field visibility logic is replaced by schema evaluation
- brokerage visibility follows `Standard / All-Inclusive / Non-Regular`
- forwarding visibility follows the incoterm matrix exactly
- trucking quotation visibility follows the source matrix exactly
- marine insurance and others remain simple but schema-driven

Important restrictions:

- do not add any new user-facing quotation field not in the source matrix
- do not add a new quotation-side `trucking_mode` field
- do not preserve old visibility rules if they conflict with the matrix

Special note for Trucking quotation:

- the current repeater for destinations may remain if it is just a richer UI representation of the matrix's `Destination/s`
- if retained, each repeater row must still map cleanly to matrix-backed data:
  - destination
  - truck type
  - qty
  - delivery instructions where relevant

Verification:

- brokerage package toggles show only matrix-approved fields
- forwarding incoterm toggles show only matrix-approved fields
- trucking quotation fields match the matrix
- no non-matrix field appears because of legacy JSX leftovers

## Phase 3 - Quotation Validation And Save Normalization

Goal:

- enforce the matrix at validation time
- persist quotation details in canonical shape while preserving legacy compatibility

Files to edit:

- `src/components/pricing/QuotationBuilderV3.tsx`

Files to add:

- `src/utils/quotation/quotationValidation.ts`
- `src/utils/quotation/quotationValidation.test.ts`
- `src/utils/quotation/quotationNormalize.ts`
- `src/utils/quotation/quotationNormalize.test.ts`

Files to reuse:

- `src/utils/bookings/bookingDetailsCompat.ts`

Validation rules:

- if a matrix field is required for the active quotation context, save must fail when it is missing
- validation must be conditional by:
  - service
  - brokerage package
  - forwarding incoterm
  - shipment mode where applicable

Normalization rules:

- write canonical keys
- preserve legacy aliases for backward compatibility
- do not invent new canonical concepts beyond the matrix

Canonical naming targets already aligned with the schema/comparison docs:

- `commodity_description`
- `pol_aol`
- `pod_aod`
- `cargo_type`
- `cargo_nature`
- `country_of_origin`
- `preferential_treatment`
- `gross_weight`
- `measurement`
- `chargeable_weight`

Normalization restrictions:

- do not invent `agent_origin`
- do not invent `agent_destination`
- do not invent `trucking_mode`
- do not invent `brokerage_fee_sad`

Verification:

- missing matrix-required quotation fields block save
- legacy quotations still reopen correctly
- new quotations save with canonical keys plus legacy compatibility
- round-trip load/edit/save loses no field

## Phase 4 - Booking General Information Alignment

Goal:

- make booking General Information match the source matrix exactly.

Primary file to edit:

- `src/config/booking/bookingScreenSchema.ts`

Support files:

- `src/config/booking/bookingScreenSchema.test.ts`
- `src/utils/bookings/bookingDetailsCompat.ts`

Booking General Information matrix that must be matched:

- `Movement`
  - `BR = Yes`
  - `FWD = Yes`
  - `TKG = Yes`
  - `MI = No`
  - `OT = No`
- `Consignee`
  - `BR = Yes`
  - `FWD = Yes`
  - `TKG = Yes`
  - `MI = Yes`
  - `OT = Yes`
- `Account Owner`
  - all five = `Yes`
- `Project/Contract Number`
  - all five = `Yes`
- `Customs Entry`
  - `BR = Yes`
  - `FWD = Yes`
  - `TKG = No`
  - `MI = No`
  - `OT = No`
- `Team Assignment`
  - all five = `Yes`
- `Customs Entry Procedure`
  - `BR = Yes`
  - `FWD = Yes`
  - `TKG = Yes`
  - `MI = No`
  - `OT = No`
- `Overseas Agent`
  - `BR = No`
  - `FWD = Yes`
  - `TKG = No`
  - `MI = Yes`
  - `OT = No`
- `Local Agent`
  - `BR = No`
  - `FWD = Yes`
  - `TKG = No`
  - `MI = No`
  - `OT = No`

What must happen:

- shared booking GI visibility is updated to match the matrix exactly
- current Marine Insurance Movement visibility is removed if it conflicts with the matrix
- requiredness for matrix `Yes` GI fields is tightened appropriately

Restrictions:

- do not preserve current GI drift just because it already exists in code
- do not document a deviation unless Marcus explicitly asks for one

Verification:

- each service type shows the exact matrix-backed GI fields
- each service type hides GI fields marked `No`
- tests cover all service/GI combinations above

## Phase 5 - Booking Service-Specific Alignment

Goal:

- make booking service-specific sections match the source matrix exactly.

Primary file:

- `src/config/booking/bookingScreenSchema.ts`

Support files:

- `src/config/booking/bookingScreenSchema.test.ts`
- `src/utils/bookings/bookingIntegration.test.ts`
- `src/utils/bookings/bookingDetailsCompat.ts`

### Phase 5A - Brokerage Booking

Brokerage booking matrix:

- applies by `FCL / LCL / AIR`
- common fields across all three:
  - `Shipper`
  - `MBL/MAWB`
  - `HBL/HAWB`
  - `Carrier/Airline`
  - `AOL/POL`
  - `Forwarder (if any)`
  - `Gross Weight`
  - `Measurement`
  - `Incoterms`
  - `ETD`
  - `ETA`
  - `Selectivity Color`
  - `Entry Number`
  - `Examinations`
  - `Customs Duties & Taxes Paid`
  - `Brokerage Fee (SAD)`
  - `Location of Goods`
- `FCL + LCL only`:
  - `Container Number/s`
  - `ETB`
  - `Stripping Date/Date of Discharge`
- `LCL only`:
  - `Consolidator`
- `AIR only`:
  - `Chargeable Weight`

Required implementation notes:

- `Examinations` must support multiple entries
- if the current system has a differently named brokerage fee field, it must be reconciled to the matrix requirement, not duplicated into a new invented business concept

### Phase 5B - Forwarding Booking

Forwarding booking matrix:

- applies by `FCL / LCL / AIR`
- common fields across all three:
  - `Shipper`
  - `MBL/MAWB`
  - `HBL/HAWB`
  - `Forwarder (if any)`
  - `Gross Weight`
  - `Preferential Treatment`
  - `Country of Origin`
  - `ETD`
  - `ETA/ATA`
  - `Tagging Time`
  - `Registry Number`
  - `Type of Package`
  - `Location of Goods`
  - `Measurement`
- `FCL + LCL only`:
  - `Container Number/s`
  - `ETB`
  - `Stripping Date/Date of Discharge`
- `FCL only`:
  - `Container Deposit (Yes or No)`
  - `Det/Dem Validity`
- `LCL only`:
  - `Consolidator`
- `AIR only`:
  - `Chargeable Weight`

Required restrictions:

- do not replace `Forwarder (if any)` with invented `agent_origin` or `agent_destination`
- use `Overseas Agent` and `Local Agent` only where the matrix calls for them in General Information

### Phase 5C - Trucking Booking

Trucking booking matrix:

- applies by `FCL / LCL`
- common to both:
  - `Driver`
  - `Helper`
  - `Vehicle Reference Number`
  - `Date Delivered`
  - `Selling Rate`
- `FCL only`:
  - `TABS Booking`
  - `Empty Return`
  - `CY Fee`
  - `Early Gate In`
  - `EIR Availability`
  - `Det/Dem Validity`
  - `Storage Validity`
  - `Shipping Line`
  - `Container Number`

Required implementation note:

- implement FCL/LCL-specific visibility using existing booking context where possible
- do not add a new explicit `trucking_mode` field unless Marcus separately approves it

### Phase 5D - Marine Insurance Booking

Marine Insurance booking matrix:

- `Commodity Description`
- `HS Code`
- `AOL/POL`
- `AOD/POD`
- `Invoice Value`

Required implementation note:

- if the current MI booking form has extra fields, they must not replace or obscure the matrix-backed fields
- if extra fields remain, they must be clearly secondary and not alter matrix behavior

### Phase 5E - Others Booking

Others booking matrix:

- `Service Description`

Verification for Phase 5:

- each booking service/mode shows exactly the matrix-backed fields
- each matrix `Yes` field is present
- each matrix `No` field is absent
- requiredness is tightened where the matrix clearly implies required input
- historical bookings still display via compatibility mapping

## Phase 6 - Quotation-To-Booking Handoff Alignment

Goal:

- make handoff follow the source matrix exactly and consistently across project and contract autofill.

Files to edit:

- `src/utils/projectAutofill.ts`
- `src/utils/contractAutofill.ts`

Files to add:

- `src/utils/bookings/quotationToBookingMapping.ts`
- `src/utils/bookings/quotationToBookingMapping.test.ts`
- `src/utils/contractAutofill.test.ts`

Required mapping principles:

- one mapping table should power both project and contract autofill where possible
- lookup order should be:
  1. canonical quotation key
  2. supported legacy aliases
  3. project or contract fallback

Required carry-over behaviors from the matrix:

- quotation fields marked for booking carry-over must prefill the booking form
- booking-only fields must remain booking-only
- trucking multi-destination quotation data must carry into booking without flattening away operational detail

Forwarding handoff must include the matrix-backed inputs where applicable:

- `incoterms`
- `cargo_type`
- `cargo_nature`
- `commodity_description`
- `delivery_address`
- `pol_aol`
- `pod_aod`
- `mode`
- `collection_address`
- `transit_time`
- `carrier_airline`
- `routing`
- `stackable`

Restrictions:

- do not rewrite handoff around invented canonical concepts
- do not claim a service is unsupported if code already has support; refactor existing support instead of duplicating it

Verification:

- one project autofill test per service
- one contract autofill test per service that is supported
- quotation to booking conversion prefills the exact matrix-backed carry-over fields
- trucking repeater carry-over is preserved

## Phase 7 - Compatibility And Test Sweep

Goal:

- guarantee no regression for old quotations/bookings while shipping the matrix match.

Files to review and extend:

- `src/utils/bookings/bookingDetailsCompat.ts`
- `src/utils/bookings/bookingIntegration.test.ts`
- `src/utils/bookings/bookingPayload.test.ts`
- `src/config/booking/bookingScreenSchema.test.ts`
- `src/config/quotation/quotationScreenSchema.test.ts`
- `src/utils/quotation/quotationValidation.test.ts`
- `src/utils/quotation/quotationNormalize.test.ts`
- `src/utils/bookings/quotationToBookingMapping.test.ts`
- `src/utils/contractAutofill.test.ts`

What must be covered:

- canonical-key write
- legacy-key read
- quotation round-trip per service
- booking round-trip per service
- handoff prefill correctness per service
- matrix-required visibility per service/mode/package/incoterm

Minimum expected test coverage:

- Brokerage quotation package matrix
- Forwarding quotation incoterm matrix
- Brokerage booking FCL/LCL/AIR matrix
- Forwarding booking FCL/LCL/AIR matrix
- Trucking booking FCL/LCL matrix
- Marine Insurance and Others booking visibility
- GI visibility matrix for all five services

## Phase 8 - Documentation Reconciliation

Goal:

- update docs so implementation and matrix are fully synchronized.

Files to edit:

- `src/docs/FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md`
- `src/docs/FINAL_QUOTATION_BOOKING_IMPLEMENTATION_CHECKLIST.md`
- `src/docs/BOOKING_SCHEMA_STANDARD.md`
- `src/docs/BOOKING_INFORMATION_SCREEN_SPEC.md`

Documentation requirements:

- document the final shipped canonical naming
- document the final quotation visibility rules
- document the final booking visibility rules
- document the final handoff rules
- do not document unapproved deviations as if they were requirements

## Required Acceptance Criteria

The work is only complete when all of the following are true:

1. Quotation forms match the source quotation matrix exactly.
2. Booking forms match the source booking matrix exactly.
3. Quotation-to-booking carry-over matches the source matrix exactly.
4. No invented user-facing fields were added without explicit approval.
5. Old quotations and bookings still reopen without field loss.
6. Tests cover matrix visibility, requiredness, normalization, and handoff.
7. `npm run build` passes.
8. Relevant test suites pass.

## Final Instruction To Implementer

When the matrix and the current code disagree, the matrix wins.

When the earlier draft plan and the matrix disagree, the matrix wins.

When implementation convenience suggests a new field or abstraction not present in the matrix, stop and do not introduce it without Marcus explicitly approving it first.
