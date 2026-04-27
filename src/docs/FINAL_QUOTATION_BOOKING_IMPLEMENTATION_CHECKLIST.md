# Final Quotation-Booking Implementation Checklist

**Status: ✅ COMPLETE** — All phases implemented. See `FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md#implementation-change-log` for the full summary of what changed.

Purpose: provide a build-ready implementation guide for aligning the current Neuron quotation and booking system to the final input matrix documented in:

- `src/docs/FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md`

This document is intentionally prescriptive so implementation stays aligned to the final matrix and does not drift into parallel architectures or one-off field behavior.

## Implementation Guardrails

- Do not invent a second booking architecture. The booking source of truth must remain `src/config/booking/bookingScreenSchema.ts`.
- Do not create one-off hard-coded booking panels to satisfy missing fields. Add or adjust fields in the central booking schema and let shared renderers pick them up.
- Do not bolt new quotation behavior into unrelated components. If quotation standardization is implemented, it should move toward a central quotation schema or at minimum a schema-like config layer.
- Do not rename persisted legacy keys without compatibility support. Any storage normalization must preserve old records through compatibility mapping and autofill translation.
- Do not silently remove extra current-system fields unless there is a clear product decision. Fields that exist beyond the final matrix should generally remain unless they directly conflict with the client standard.
- Requiredness should follow the final matrix wherever business meaning is clear. If the final matrix says `Yes`, the default implementation goal is required, not optional.
- When a final-matrix field does not cleanly map to an existing field, prefer:
  1. canonical new key in the schema,
  2. compatibility mapping for old data,
  3. autofill mapping from legacy quotation/project/contract sources.

## Suggested Build Order

Recommended implementation order:

1. Quotation schema/source-of-truth work
2. Quotation validation tightening
3. Quotation save normalization
4. Booking General Information alignment
5. Booking service-specific field alignment
6. Handoff/autofill normalization
7. Compatibility and tests
8. Documentation refresh

This order reduces rework because booking/handoff changes should be built on top of a clearer quotation data model.

## Quotation Fixes

Goal: make quotation inputs reflect the final matrix in structure, visibility, persistence, and validation.

### Q1. Introduce a central quotation input schema

Status today:

- Quotation inputs live across:
  - `src/components/pricing/quotations/GeneralDetailsSection.tsx`
  - `src/components/pricing/quotations/BrokerageServiceForm.tsx`
  - `src/components/pricing/quotations/ForwardingServiceForm.tsx`
  - `src/components/pricing/quotations/TruckingServiceForm.tsx`
  - `src/components/pricing/quotations/MarineInsuranceServiceForm.tsx`
  - `src/components/pricing/quotations/OthersServiceForm.tsx`
- Visibility and overlap are handled manually inside `QuotationBuilderV3.tsx`.

What Claude should do:

- Create a quotation-side schema/config layer under a new quotation config area.
- Minimum viable approach:
  - define shared quotation general fields,
  - define service-specific quotation sections,
  - define visibility rules by service type, movement, brokerage package, forwarding incoterm, and mode.
- The schema does not need to immediately replace every form renderer if that is too large, but it must become the source of truth for:
  - which fields exist,
  - what labels they use,
  - when they are shown,
  - whether they are required,
  - what canonical storage key they map to.

What Claude should not do:

- Do not add more ad hoc `if` blocks inside the existing service forms as the long-term solution.
- Do not keep visibility logic duplicated in both docs and JSX.

Expected result:

- The final quotation matrix can be traced into one centralized config instead of spread across JSX branches.

### Q2. Align quotation shared general fields to the final matrix

Target fields:

- Customer
- Contact Person
- Quotation Name
- Services
- Date
- Credit Terms
- Validity

Current file:

- `src/components/pricing/quotations/GeneralDetailsSection.tsx`

What Claude should verify or adjust:

- These fields remain present and clearly labeled.
- Requiredness matches the final matrix:
  - Customer = required
  - Contact Person = required
  - Quotation Name = required
  - Services = required
  - Date = required
  - Credit Terms = present
  - Validity = present
- If quotation validation currently allows save without fields the matrix clearly expects, tighten it.

Expected result:

- Shared quotation header is not just visually present; it is structurally enforced.

### Q3. Align Brokerage quotation behavior to the final matrix

Current files:

- `src/components/pricing/quotations/BrokerageServiceForm.tsx`
- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

Target matrix behavior:

- Brokerage packages:
  - Standard
  - All-Inclusive
  - Non-Regular
- Fields:
  - Type of Entry
  - AOD/POD
  - Mode
  - Cargo Type
  - Commodity Description
  - Delivery Address
  - Country of Origin
  - Preferential Treatment
- Mode overlays:
  - FCL = Container Types and Quantity
  - LCL = Gross Weight and Measurement
  - Air = Gross Weight and Chargeable Weight

What Claude should do:

- Make sure each brokerage package exposes exactly the fields implied by the final matrix.
- Keep export restrictions only if they are explicitly intended and documented.
- Normalize the internal storage mapping for brokerage quotation values.

Canonical quotation-side storage target:

- `brokerage_type`
- `type_of_entry` or a canonical replacement if the quotation layer is also normalized
- `pod_aod` or canonical route split fields
- `mode`
- `cargo_type`
- `commodity_description`
- `delivery_address`
- `country_of_origin`
- `preferential_treatment`
- `measurement`
- `gross_weight`
- `chargeable_weight`
- `containers`

Important implementation note:

- Even if the UI still uses existing form internals temporarily, the persisted `services_metadata.service_details` should move toward canonical keys.

### Q4. Align Forwarding quotation behavior to the final matrix

Current files:

- `src/components/pricing/quotations/ForwardingServiceForm.tsx`
- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

Target matrix behavior:

- Incoterm-driven quotation matrix across:
  - EXW
  - FOB
  - CFR
  - CIF
  - FCA
  - CPT
  - CIP
  - DAP
  - DDU
  - DDP
- Fields:
  - Incoterms
  - Cargo Type
  - Cargo Nature
  - Commodity Description
  - Delivery Address
  - AOL/POL
  - AOD/POD
  - Mode
  - Collection Address
  - Transit Time
  - Carrier/Airline
  - Routing
  - Stackable

What Claude should do:

- Encode the incoterm visibility rules from the final matrix as the source of truth.
- Review existing logic where:
  - delivery address depends on import/export and incoterm,
  - cargo nature is hidden for export,
  - builderMode changes visible fields.
- Remove accidental behavior that is not supported by the final matrix, unless explicitly preserved as an intentional business rule.

What Claude should preserve carefully:

- Current support for FCL/LCL/Air fields.
- Collection address visibility for EXW.
- Delivery address visibility for DAP/DDU/DDP.

What Claude should normalize:

- `commodityDescription` -> canonical commodity description key
- `aolPol` / `aodPod` -> canonical route keys
- `route` -> `routing`
- `lclDims` / `airCwt`-style values -> canonical `measurement` / `chargeable_weight`

### Q5. Align Trucking quotation behavior to the final matrix

Current files:

- `src/components/pricing/quotations/TruckingServiceForm.tsx`
- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

Target matrix behavior:

- Pickup Location
- Destination/s
- Delivery Instructions
- Truck Type
- Qty

What Claude should do:

- Preserve the repeater model for `Destinations` if it is already operationally useful.
- Map the repeater cleanly to the final matrix interpretation:
  - each destination row should represent one destination + truck type + quantity tuple.
- Ensure there is a stable canonical mapping for:
  - pickup location / pull out
  - destination list
  - truck type
  - qty
  - delivery instructions

What Claude should not do:

- Do not simplify the repeater back into a single destination field if that would lose current operational capability.

Expected result:

- The final matrix remains satisfied, but the current stronger multi-destination capability is preserved.

### Q6. Keep Marine Insurance and Others quotation forms aligned and canonical

Current files:

- `src/components/pricing/quotations/MarineInsuranceServiceForm.tsx`
- `src/components/pricing/quotations/OthersServiceForm.tsx`

What Claude should do:

- Marine Insurance:
  - keep Commodity Description
  - keep HS Code
  - keep AOL/POL
  - keep AOD/POD
  - keep Invoice Value
  - normalize save keys if needed
- Others:
  - keep Service Description
  - ensure canonical save key is `service_description`

Expected result:

- These two services should be the easiest quotation-side areas to keep aligned.

### Q7. Tighten quotation validation to match the final matrix

Current file:

- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

Problem today:

- `isFormValid()` mainly checks:
  - customer
  - selected services
  - date
  - pricing presence
- It does not enforce service-specific quotation inputs from the final matrix.

What Claude should do:

- Add schema-driven quotation validation.
- Validate visible required fields per selected service.
- Validation should account for:
  - brokerage package
  - forwarding incoterm
  - mode
  - movement where applicable

Expected result:

- A quotation should not save as valid if a final-matrix-required input is missing.

## Booking Fixes

Goal: align the current booking schema more closely to the final matrix without replacing the shared booking architecture.

### B1. Keep booking schema as the single booking source of truth

Current files:

- `src/config/booking/bookingScreenSchema.ts`
- `src/components/operations/shared/BookingDynamicForm.tsx`
- `src/components/operations/shared/BookingInfoTab.tsx`

What Claude should do:

- Make all booking field alignment changes inside the central schema and shared validators/renderers.
- If a field is missing from a booking flow, add it in the schema rather than hand-building it in a specific booking component.

### B2. Align shared Booking General Information to the final matrix

Current file:

- `src/config/booking/bookingScreenSchema.ts`

Target matrix:

- Movement
- Consignee
- Account Owner
- Project / Contract Number
- Customs Entry
- Team Assignment
- Customs Entry Procedure
- Overseas Agent
- Local Agent

What Claude should do:

- Review whether these belong in the shared General Information section versus service-specific sections.
- Implement a deliberate mapping instead of leaving them split by historical implementation.

Specific required changes:

1. `Consignee`
- Final matrix expects it in Booking General Information for all services.
- Current system keeps it in service-specific detail sections.
- Claude should decide one of these approaches and implement it consistently:
  - move `Consignee` into shared General Information with service-based visibility, or
  - keep detail-level storage but render it in the shared General Information area if that is the UI requirement.

2. `Customs Entry`
- Final matrix expects `Yes` for BR and FWD.
- Current booking schema has it for Brokerage, but not as shared Forwarding general info.
- Claude should add Forwarding support if the final matrix is the target standard.

3. `Customs Entry Procedure`
- Final matrix expects `Yes` for BR, FWD, TKG.
- Current schema supports Brokerage and Forwarding variants but not Trucking.
- Claude should either:
  - add it to Trucking if business rules really require it, or
  - explicitly document and confirm if the final matrix is wrong here.
- If implementing, use a canonical field name and avoid inventing a Trucking-only duplicate concept.

4. `Overseas Agent`
- Final matrix expects it for FWD and MI.
- Current schema supports FWD, not MI.
- Claude should add Marine Insurance visibility only if that is intended by the final matrix.

5. `Movement` on Marine Insurance
- Final matrix says `No` for MI.
- Current booking schema shows movement for Marine Insurance.
- Claude should decide whether to:
  - remove Marine Insurance from `movement_type` visibility, or
  - retain it intentionally and document that the live product diverges from the matrix.
- If the goal is strict alignment, remove MI from the booking movement visibility rules.

### B3. Tighten booking requiredness to match final matrix `Yes` rows

Current files:

- `src/config/booking/bookingScreenSchema.ts`
- `src/components/operations/shared/bookingFormValidation.ts`

Problem today:

- Many matrix `Yes` fields are still coded as `no` or `conditional`.

What Claude should do:

- Review all fields in the final matrix that are clearly marked `Yes`.
- Convert current weak requiredness into explicit requiredness when the business meaning is clear.

High-priority fields to review:

- `account_owner`
- `team_assignment`
- Brokerage:
  - `brokerage_type`
  - `shipper`
  - `gross_weight`
  - `measurement`
  - `etd`
  - `eta`
  - `selectivity_color`
  - `entry_number`
- Forwarding:
  - `tagging_time`
  - `type_of_package`
  - `container_numbers` by applicable mode
- Trucking:
  - `driver`
  - `helper`
  - `vehicle_reference_number`
  - `date_delivered`

Important note:

- Where the final matrix conflicts with strong existing workflow behavior, Claude should preserve operational correctness but explicitly document the deviation in this file or the handoff doc.

### B4. Align Brokerage booking details exactly where the matrix is stronger than current code

Current file:

- `src/config/booking/bookingScreenSchema.ts`

What Claude should do:

- Review the brokerage sections against the final matrix and adjust:
  - requiredness,
  - labels,
  - placement,
  - visibility.

Specific fields to check carefully:

- `Incoterms`
- `ETB`
- `Selectivity Color`
- `Entry Number`
- `Examinations`
- `Customs Duties & Taxes Paid`
- `Brokerage Fee (SAD)`
- `Consolidator`
- `Location of Goods`
- `Stripping Date / Date of Discharge`
- `Chargeable Weight`

Important:

- Keep current extra fields like `VGM`, `Seal Number/s`, `Rate of Duty`, and `Permit/s` unless they are explicitly being removed.

### B5. Align Forwarding booking details where current code still diverges

Current file:

- `src/config/booking/bookingScreenSchema.ts`

What Claude should do:

- Preserve current strong field coverage.
- Resolve naming and requiredness mismatches:
  - `Dimensions` should align to `Measurement` if the final matrix is the source of truth.
  - `Forwarder`, `Agent`, and `Consolidator` need a clearer role model so the UI matches the matrix language.
  - `Tagging Time` and `Type of Package` should be reviewed for requiredness.

Specific implementation question to answer in code/comments/docs:

- If both `Forwarder` and `Agent` remain in the current design, what is each supposed to mean operationally?
- Do not leave both fields active without a clarified distinction.

### B6. Align Trucking booking details to the final matrix

Current file:

- `src/config/booking/bookingScreenSchema.ts`

What Claude should do:

1. Add missing `Selling Rate`
- Final matrix expects `Selling Rate` for both Trucking FCL and LCL.
- This field is currently missing.
- Claude should add it to the Trucking booking schema.

2. Decide how to represent `FCL / LCL` for Trucking
- The final matrix clearly distinguishes Trucking FCL and LCL.
- Current schema uses delivery/container logic without a direct top-level Trucking mode toggle.
- Claude should not invent a random new toggle without tracing real business meaning.
- Recommended implementation approach:
  - determine whether the existing Trucking schema can infer FCL/LCL from existing booking/service data,
  - if not, introduce a canonical truck shipment mode field only if needed for accurate field visibility.

3. Tighten requiredness for matrix `Yes` rows
- `Driver`
- `Helper`
- `Vehicle Reference Number`
- `Date Delivered`
- `Selling Rate`

4. Preserve current richer trucking structure
- Keep `trucking_line_items` repeater
- Keep destination rows
- Keep FCL-only container logistics fields

What Claude should not do:

- Do not downgrade Trucking to a flat single-destination model.

### B7. Review Marine Insurance and Others booking divergence

Current file:

- `src/config/booking/bookingScreenSchema.ts`

What Claude should do:

- Marine Insurance:
  - add `Overseas Agent` only if the final matrix is being enforced literally,
  - otherwise document why MI intentionally diverges.
- Others:
  - no major missing fields relative to the matrix,
  - preserve current extra internal fields unless they are product noise.

## Handoff Fixes

Goal: make quotation-to-booking carry-over predictable, canonical, and traceable.

### H1. Define a canonical handoff contract

Current files:

- `src/utils/projectAutofill.ts`
- `src/utils/contractAutofill.ts`
- `src/utils/bookings/bookingDetailsCompat.ts`
- `src/utils/bookings/bookingPayload.ts`

Problem today:

- Handoff works, but mappings are scattered and legacy-shaped.

What Claude should do:

- Define a canonical mapping from quotation/service-detail keys to booking form keys.
- This mapping should be explicit and reusable, not embedded in multiple helper functions differently.

Expected output:

- One authoritative mapping layer for quotation -> booking autofill normalization.

### H2. Normalize overlapping cross-service quotation fields before handoff

Current behavior:

- `QuotationBuilderV3` manually syncs overlapping fields between Brokerage, Forwarding, Trucking, and Marine Insurance.

Current file:

- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

What Claude should do:

- Reduce reliance on manual cross-service copying as the primary truth mechanism.
- Keep useful sync behavior for UX if needed, but ensure the persisted quotation data itself is canonical.

Specific overlapping fields to normalize:

- commodity description
- route fields
- delivery address
- cargo type
- mode
- country of origin
- preferential treatment

Expected result:

- Handoff should no longer depend on whichever service form happened to copy the field last.

### H3. Expand handoff coverage where the final matrix expects more carry-over

What Claude should review service by service:

Brokerage handoff:

- Ensure carry-over of:
  - mode
  - cargo type
  - commodity description
  - delivery address
  - country of origin
  - preferential treatment
  - type of entry / customs entry procedure

Forwarding handoff:

- Ensure carry-over of:
  - incoterms
  - cargo type
  - cargo nature
  - commodity description
  - route
  - collection address
  - delivery address
  - transit time
  - carrier/airline
  - stackable
  - mode-specific measurement/weight fields

Trucking handoff:

- Ensure carry-over of:
  - pickup / pull out
  - destination rows
  - truck type
  - qty
  - delivery instructions

Marine Insurance handoff:

- Ensure carry-over of:
  - commodity description
  - hs code
  - route
  - invoice value

Others handoff:

- Ensure carry-over of:
  - service description

### H4. Make booking autofill consume canonical keys first, legacy keys second

Current files:

- `src/utils/projectAutofill.ts`
- `src/utils/contractAutofill.ts`

What Claude should do:

- Update autofill helpers so they prefer canonical keys first.
- Keep legacy fallbacks for old saved quotations/projects/contracts.

Preferred lookup order:

1. canonical normalized key
2. known legacy snake_case variant
3. known legacy camelCase variant
4. project-level fallback

Expected result:

- New data flows cleanly.
- Old data still opens correctly.

## Field Naming / Normalization Fixes

Goal: remove ambiguity between quotation fields, booking fields, autofill logic, and stored service metadata.

### N1. Define canonical names for shared route and cargo fields

Fields that need one canonical definition:

- `commodity_description`
- `cargo_type`
- `cargo_nature`
- `movement_type`
- `mode`
- `pol_aol`
- `pod_aod`
- `delivery_address`
- `collection_address`
- `measurement`
- `gross_weight`
- `chargeable_weight`
- `preferential_treatment`
- `country_of_origin`

What Claude should do:

- Decide the canonical persisted key for each.
- Update save logic to write the canonical form.
- Keep read compatibility for old variants.

### N2. Normalize quotation storage names in `services_metadata`

Current file:

- `src/components/pricing/quotations/QuotationBuilderV3.tsx`

Problem today:

- Quotation save uses mixed keys like:
  - `commodity`
  - `pod`
  - `aolPol`
  - `aodPod`
  - `lcl_gwt`
  - `air_cwt`

What Claude should do:

- Update save logic so new quotations persist canonical final-schema-friendly keys.
- If legacy aliases must still be saved for compatibility, document that explicitly and keep them transitional.

Recommended approach:

- Save canonical keys only for new records if compatibility readers are already strong enough.
- If not safe yet, save canonical keys plus compatibility aliases temporarily, then remove aliases later.

### N3. Normalize booking schema labels where matrix wording matters

Current file:

- `src/config/booking/bookingScreenSchema.ts`

Fields to review:

- `Customs Entry Procedure` vs `Customs Entry Procedure Code`
- `Dimensions` vs `Measurement`
- `Brokerage Fee Net of VAT` vs `Brokerage Fee (SAD)`
- `POD / AOD` display wording
- `POL / AOL` display wording

What Claude should do:

- Use the final matrix wording where it is intended to be the standard.
- If the product intentionally uses a different internal/business label, document the reason rather than leaving the mismatch unexplained.

### N4. Expand compatibility mappings before removing legacy names

Current file:

- `src/utils/bookings/bookingDetailsCompat.ts`

What Claude should do:

- Add compatibility mapping for any renamed fields introduced during normalization.
- Do this before changing save behavior or autofill lookup behavior.

Expected result:

- Old records still render.
- New records use the intended canonical model.

## Validation and Test Checklist

Claude should not treat this as optional. Field alignment work without tests will be hard to trust.

### Required test areas

1. Quotation form visibility tests
- brokerage package visibility
- forwarding incoterm visibility
- mode-specific visibility

2. Quotation validation tests
- required shared header fields
- required service fields
- incoterm-specific requirements
- mode-specific requirements

3. Quotation save normalization tests
- saved `services_metadata` uses canonical keys
- legacy reads still work

4. Booking schema visibility tests
- updated General Information rules
- trucking FCL/LCL behavior
- marine insurance visibility changes if implemented

5. Booking validation tests
- required `Yes` fields are actually enforced

6. Autofill/handoff tests
- project -> booking
- contract -> booking
- canonical keys preferred
- legacy keys still accepted

### Files likely to need test updates

- `src/config/booking/bookingScreenSchema.test.ts`
- `src/utils/bookings/bookingPayload.test.ts`
- `src/utils/bookings/bookingIntegration.test.ts`
- any future quotation-schema or quotation-validation tests Claude creates

## Documentation Update Checklist

After implementation, Claude should also update:

- `src/docs/BOOKING_INFORMATION_SCREEN_SPEC.md`
- `src/docs/BOOKING_SCHEMA_STANDARD.md`
- `src/docs/BOOKING_STANDARDIZATION_PROCESS_HANDOFF.md`

At minimum, the docs should explain:

- what is now canonical on the quotation side,
- what changed on the booking side,
- what legacy compatibility remains,
- any intentional deviations from the final matrix,
- whether Trucking now has an explicit FCL/LCL representation or an inferred one.

## Definition of Done

This work should be considered done only when all of the following are true:

- quotation fields are driven by a centralized standard rather than only hard-coded JSX behavior,
- quotation validation reflects the final matrix for visible required fields,
- new quotation records persist canonical service-detail keys,
- booking General Information and service sections reflect the final matrix or explicitly documented intentional deviations,
- missing Trucking booking fields like `Selling Rate` are resolved,
- autofill/handoff prefers canonical keys and still supports legacy data,
- compatibility tests pass,
- documentation is updated to reflect the final implemented behavior.
