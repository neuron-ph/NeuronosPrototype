# Final Quotation-Booking Input Schema

Purpose: convert `docs/Booking List/Final Inputs for Falcons Centralized Management System.pdf` into a working Markdown schema that preserves the logic of both source tables:

1. the `Quotation -> Booking carry-over matrix`, and
2. the `Additional Inputs for Bookings` matrix.

## Reading Guide

The PDF is best understood as two related tables.

### Table 1: Quotation to Booking

- The `left side` is the `BD/PD Module > Import (Inquiries & Quotations)` stage.
- The `right side` is the `Operations Module (Once became Booking)` stage.
- This table answers:
  - what should appear during quotation,
  - what should still appear once the record becomes a booking, and
  - which fields are being renamed or moved in the booking structure.

### Table 2: Additional Inputs for Bookings

- This table is `booking-only`.
- It defines the extra operational fields that appear after a quotation has already become a booking.
- It is organized by:
  - shared booking `General Information`,
  - `Brokerage` by `FCL / LCL / AIR`,
  - `Trucking` by `FCL / LCL`,
  - `Forwarding` by `FCL / LCL / AIR`.

## Part 1: Quotation to Booking Matrix

## Quotation General Information

These are the shared quotation fields shown under `Standard`, `All-Inclusive`, and `Non-Regular`, and whether they also remain visible in booking.

| Field | Standard | All-Inclusive | Non-Regular | Booking | Notes |
|---|---|---|---|---|---|
| Customer | Yes | Yes | Yes | Yes | Shared across quotation and booking. |
| Contact Person | Yes | Yes | Yes | Yes | Shared across quotation and booking. |
| Quotation Name | Yes | Yes | Yes | Yes | Shared across quotation and booking. |
| Services | Yes | Yes | Yes | Yes | Shared across quotation and booking. |
| Date | Yes | Yes | Yes | Yes | Shared across quotation and booking. |
| Credit Terms | Yes | Yes | Yes | No | Quotation-only in this matrix. |
| Validity | Yes | Yes | Yes | No | Quotation-only in this matrix. |

## Brokerage Service/s

This block defines the quotation inputs for `Brokerage`, split by `Standard`, `All-Inclusive`, and `Non-Regular`, and whether they continue into booking.

| Field | Standard | All-Inclusive | Non-Regular | Booking | Notes |
|---|---|---|---|---|---|
| Type of Entry | Yes | No | Yes | Yes | Change to `Customs Entry Procedure Code` and move to Booking General Information. |
| AOD/POD | Yes | Yes | Yes | Yes | Description should be updated. |
| Mode | Yes | Yes | Yes | Yes | Move to Booking General Information. |
| Cargo Type | Yes | Yes | Yes | Yes | Move to Booking General Information. |
| Commodity Description | Yes | Yes | Yes | Yes | Move to Booking General Information. |
| Delivery Address | Yes | Yes | Yes | Yes | Shared from quotation into booking. |
| Country of Origin | No | Yes | No | Yes | Quotation only for All-Inclusive, but present in booking. |
| Preferential Treatment | No | Yes | No | Yes | Quotation only for All-Inclusive, but present in booking. |

## Forwarding Service/s

This block defines quotation inputs for `Forwarding`, but instead of `Standard / All-Inclusive / Non-Regular`, it is driven by forwarding arrangement:

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

| Field | EXW | FOB | CFR | CIF | FCA | CPT | CIP | DAP | DDU | DDP | Booking | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Incoterms | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Core forwarding quotation selector. |
| Cargo Type | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Move to Booking General Information. |
| Cargo Nature | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Shared quotation and booking field. |
| Commodity Description | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Shared quotation and booking field. |
| Delivery Address | No | No | No | No | No | No | No | Yes | Yes | Yes | Yes | Required for destination-delivery setups. |
| AOL/POL | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Shared quotation and booking field. |
| AOD/POD | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Shared quotation and booking field. |
| Mode | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Move to Booking General Information. |
| Collection Address | Yes | No | No | No | No | No | No | No | No | No | Yes | Pickup-oriented forwarding field. |
| Transit Time | Yes | Yes | No | No | Yes | No | No | No | No | No | Yes | Only for selected forwarding arrangements. |
| Carrier/Airline | Yes | Yes | No | No | Yes | No | No | No | No | No | Yes | Only for selected forwarding arrangements. |
| Routing | Yes | Yes | No | No | Yes | No | No | No | No | No | Yes | Only for selected forwarding arrangements. |
| Stackable (Yes or No) | Yes | Yes | No | No | Yes | No | No | Yes | Yes | Yes | Yes | Depends on forwarding arrangement. |

## Booking-Only Service Blocks From Table 1

These rows appear on the booking side of the first table, but do not have a quotation-side yes/no matrix in the screenshot provided. They should therefore be treated as booking-stage service blocks.

### Trucking Service/s

| Field | Booking |
|---|---|
| Pickup Location | Yes |
| Destination/s | Yes |
| Delivery Instructions | Yes |
| Truck Type | Yes |
| Qty | Yes |

### Marine Insurance

| Field | Booking |
|---|---|
| Commodity Description | Yes |
| HS Code | Yes |
| AOL/POL | Yes |
| AOD/POD | Yes |
| Invoice Value | Yes |

### Others

| Field | Booking |
|---|---|
| Service Description | Yes |

## Additional Inputs for Modes

These are cross-cutting mode overlays from the first table.

| Mode | Additional Input | Notes |
|---|---|---|
| FCL | Container Types and Quantity | Mode-specific quotation and booking context. |
| LCL | Gross Weight and Measurement | `Dims` should be normalized to `Measurement`. |
| Air | Gross Weight and Chargeable Weight | `Chargeable Weight` is the air-specific metric. |

## Part 2: Additional Inputs for Bookings

This section reflects the second table directly. These are operational booking fields that appear after conversion from quotation.

Legend:

- `BR` = Brokerage
- `FWD` = Forwarding
- `TKG` = Trucking
- `MI` = Marine Insurance
- `OT` = Others

## Booking General Information

These are top-level booking fields by service type.

| Field | BR | FWD | TKG | MI | OT |
|---|---|---|---|---|---|
| Movement | Yes | Yes | Yes | No | No |
| Consignee | Yes | Yes | Yes | Yes | Yes |
| Account Owner | Yes | Yes | Yes | Yes | Yes |
| Project / Contract Number | Yes | Yes | Yes | Yes | Yes |
| Customs Entry | Yes | Yes | No | No | No |
| Team Assignment | Yes | Yes | Yes | Yes | Yes |
| Customs Entry Procedure | Yes | Yes | Yes | No | No |
| Overseas Agent | No | Yes | No | Yes | No |
| Local Agent | No | Yes | No | No | No |

## Brokerage Booking Inputs

These are the additional booking fields for `Brokerage`, split by `FCL`, `LCL`, and `AIR`.

| Field | FCL | LCL | AIR | Notes |
|---|---|---|---|---|
| Shipper | Yes | Yes | Yes | Required across all brokerage modes. |
| MBL/MAWB | Yes | Yes | Yes | Required across all brokerage modes. |
| HBL/HAWB | Yes | Yes | Yes | Required across all brokerage modes. |
| Carrier/Airline | Yes | Yes | Yes | Required across all brokerage modes. |
| AOL/POL | Yes | Yes | Yes | Required across all brokerage modes. |
| Forwarder (If any) | Yes | Yes | Yes | Optional in business meaning, but shown in all three modes. |
| Gross Weight | Yes | Yes | Yes | Required across all brokerage modes. |
| Measurement | Yes | Yes | Yes | Required across all brokerage modes. |
| Container Number/s | Yes | Yes | No | Sea-only field. |
| Incoterms | Yes | Yes | Yes | Required across all brokerage modes. |
| ETD | Yes | Yes | Yes | Required across all brokerage modes. |
| ETA | Yes | Yes | Yes | Required across all brokerage modes. |
| ETB | Yes | Yes | No | Sea-only field. |
| Selectivity Color (Yellow, Orange & Red) | Yes | Yes | Yes | Customs execution field. |
| Entry Number | Yes | Yes | Yes | Customs execution field. |
| Examinations (Xray, Spotcheck & DEA) | Yes | Yes | Yes | Must support multiple entry. |
| Customs Duties & Taxes Paid | Yes | Yes | Yes | Customs execution field. |
| Brokerage Fee (SAD) | Yes | Yes | Yes | Brokerage cost field. |
| Consolidator | No | Yes | No | LCL-specific field. |
| Location of Goods | Yes | Yes | Yes | Required across all brokerage modes. |
| Stripping Date / Date of Discharge | Yes | Yes | No | Sea-only field. |
| Chargeable Weight | No | No | Yes | Air-only field. |

## Trucking Booking Inputs

These are the additional booking fields for `Trucking`, split by `FCL` and `LCL`.

| Field | FCL | LCL | Notes |
|---|---|---|---|
| Driver | Yes | Yes | Core trucking execution field. |
| Helper | Yes | Yes | Core trucking execution field. |
| Vehicle Reference Number | Yes | Yes | Core trucking execution field. |
| Date Delivered | Yes | Yes | Delivery milestone field. |
| TABS Booking | Yes | No | FCL-only field. |
| Empty Return | Yes | No | FCL-only field. |
| CY Fee | Yes | No | FCL-only field. |
| Early Gate In | Yes | No | FCL-only field. |
| EIR Availability | Yes | No | FCL-only field. |
| Det/Dem Validity | Yes | No | FCL-only field. |
| Storage Validity | Yes | No | FCL-only field. |
| Shipping Line | Yes | No | FCL-only field. |
| Container Number | Yes | No | FCL-only field. |
| Selling Rate | Yes | Yes | Present in both trucking modes. |

## Forwarding Booking Inputs

These are the additional booking fields for `Forwarding`, split by `FCL`, `LCL`, and `AIR`.

| Field | FCL | LCL | AIR | Notes |
|---|---|---|---|---|
| Shipper | Yes | Yes | Yes | Required across all forwarding modes. |
| MBL/MAWB | Yes | Yes | Yes | Required across all forwarding modes. |
| HBL/HAWB | Yes | Yes | Yes | Required across all forwarding modes. |
| Forwarder (if any) | Yes | Yes | Yes | Shown across all forwarding modes. |
| Gross Weight | Yes | Yes | Yes | Required across all forwarding modes. |
| Container Number/s | Yes | Yes | No | Sea-only field. |
| Preferential Treatment (Form E, Form D etc.) | Yes | Yes | Yes | Required across all forwarding modes. |
| Country of Origin | Yes | Yes | Yes | Required across all forwarding modes. |
| Container Deposit (Yes or No) | Yes | No | No | FCL-only field. |
| Det/Dem Validity | Yes | No | No | FCL-only field. |
| ETD | Yes | Yes | Yes | Required across all forwarding modes. |
| ETA/ATA | Yes | Yes | Yes | Required across all forwarding modes. |
| ETB | Yes | Yes | No | Sea-only field. |
| Stripping Date / Date of Discharge | Yes | Yes | No | Sea-only field. |
| Tagging Time | Yes | Yes | Yes | Required across all forwarding modes. |
| Registry Number | Yes | Yes | Yes | Required across all forwarding modes. |
| Type of Package | Yes | Yes | Yes | Required across all forwarding modes. |
| Consolidator | No | Yes | No | LCL-specific field. |
| Location of Goods | Yes | Yes | Yes | Required across all forwarding modes. |
| Measurement | Yes | Yes | Yes | Required across all forwarding modes. |
| Chargeable Weight | No | No | Yes | Air-only field. |

## Carry-Over Logic

The matrix implies three kinds of fields.

### Quotation-Only

These appear in quotation but are not standard booking inputs in the matrix.

| Field |
|---|
| Credit Terms |
| Validity |

### Shared From Quotation Into Booking

These appear in quotation and still remain relevant after conversion to booking.

| Field |
|---|
| Customer |
| Contact Person |
| Quotation Name |
| Services |
| Date |
| Type of Entry / Customs Entry Procedure Code |
| AOD/POD |
| Mode |
| Cargo Type |
| Commodity Description |
| Delivery Address |
| Country of Origin |
| Preferential Treatment |
| Incoterms |
| Cargo Nature |
| AOL/POL |
| Collection Address |
| Transit Time |
| Carrier/Airline |
| Routing |
| Stackable |
| Gross Weight |
| Measurement |
| Chargeable Weight |

### Booking-Only Additions

These are introduced at the booking stage for operations use.

| Field Group | Examples |
|---|---|
| Booking ownership and control | Account Owner, Project / Contract Number, Team Assignment |
| Customs execution | Customs Entry, Selectivity Color, Entry Number, Examinations, Customs Duties & Taxes Paid |
| Shipment execution references | MBL/MAWB, HBL/HAWB, Registry Number, Container Number/s |
| Schedule and milestone fields | ETD, ETA, ETA/ATA, ETB, Tagging Time, Stripping Date / Date of Discharge, Date Delivered |
| Trucking operations | Driver, Helper, Vehicle Reference Number, TABS Booking, Empty Return, CY Fee, EIR Availability |
| Service-specific operations | Container Deposit, Det/Dem Validity, Storage Validity, Selling Rate, Invoice Value |

## Normalization Notes

These notes come directly from the comments embedded in the first table and should be treated as part of the final schema interpretation.

| Source Note | Working Interpretation |
|---|---|
| Change `Type of Entry` to `Customs Entry Procedure Code` and move it to `General Information` | Booking should use the normalized label in its General Information block. |
| `Mode` should be moved to `General Information` | Treat Mode as a top-level booking selector. |
| `Cargo Type` should be moved to `General Information` | Treat Cargo Type as a top-level booking selector. |
| `Commodity Description` should be moved to `General Information` | Treat Commodity Description as part of the booking header context where appropriate. |
| `AOD/POD` description should be updated | Keep the field but revise the user-facing description. |
| `Examinations` should support multiple entry | Use repeatable or multi-select UI behavior. |
| `Dims` should map to `Measurement` | Normalize dimension-style inputs under Measurement. |
| Air mode should use `Gross Weight` and `Chargeable Weight` | Preserve Chargeable Weight as the air-specific execution field. |
| `Oversees Agent` appears in the source | Standardize the label to `Overseas Agent`. |

## Working Interpretation

In plain terms:

- `Quotation` captures the pre-booking commercial and service-definition fields.
- `Booking` keeps the fields that still matter operationally.
- `Booking` also introduces new execution fields required by operations, customs, trucking, forwarding, and service-specific handling.

This document is intended to be the readable Markdown version of the full final quotation-to-booking input matrix.

## Current System Comparison

This section compares the final matrix in this document against how quotation and booking inputs are currently implemented in Neuron.

Reference sources used for this comparison:

- `src/components/pricing/quotations/GeneralDetailsSection.tsx`
- `src/components/pricing/quotations/QuotationBuilderV3.tsx`
- `src/components/pricing/quotations/BrokerageServiceForm.tsx`
- `src/components/pricing/quotations/ForwardingServiceForm.tsx`
- `src/components/pricing/quotations/TruckingServiceForm.tsx`
- `src/components/pricing/quotations/MarineInsuranceServiceForm.tsx`
- `src/components/pricing/quotations/OthersServiceForm.tsx`
- `src/config/booking/bookingScreenSchema.ts`
- `src/components/operations/shared/BookingDynamicForm.tsx`
- `src/components/operations/shared/BookingInfoTab.tsx`
- `src/utils/projectAutofill.ts`
- `src/utils/contractAutofill.ts`
- `src/docs/BOOKING_STANDARDIZATION_PROCESS_HANDOFF.md`

Legend:

- `Aligned` = current system behavior matches the final matrix closely.
- `Partial` = current system covers part of the requirement but differs in structure, naming, visibility, or requiredness.
- `Missing` = the final matrix expects behavior or fields that are not currently implemented.

## Overall Comparison Summary

### Quotation

| Area | Status | Notes |
|---|---|---|
| Shared quotation header | Partial | Current system already has Customer, Contact Person, Quotation Name, Services, Date, Credit Terms, Validity, and Movement. The gap is that quotation behavior is not governed by a central schema; it is still hard-coded in `GeneralDetailsSection` and service forms. |
| Brokerage quotation fields | Partial | Most matrix fields exist, but the current form is package-specific and manually coded. Naming and storage still use legacy keys like `commodity`, `pod`, and `type_of_entry`. |
| Forwarding quotation fields | Partial | Most matrix fields exist, but visibility logic is partly driven by `builderMode`, movement, and old assumptions that do not exactly match the final matrix. |
| Trucking quotation fields | Partial | Core fields exist, but the current UI uses a repeater-based destination structure rather than a simple flat quote matrix. |
| Marine Insurance quotation fields | Aligned | Commodity Description, HS Code, AOL/POL, AOD/POD, and Invoice Value are all present. |
| Others quotation fields | Aligned | Service Description exists as a dedicated form field. |
| Quotation persistence / handoff structure | Partial | Service forms save into `services_metadata`, but field names are mixed legacy and modern conventions. |
| Quotation validation against final matrix | Missing | Current quotation validation mostly checks customer, services, date, and pricing presence, not the field-by-field requirements implied by the final matrix. |

### Booking

| Area | Status | Notes |
|---|---|---|
| Shared booking architecture | Aligned | Booking create/edit/detail flows are centralized and schema-driven. |
| Booking service-specific detail sections | Partial | Brokerage and Forwarding are close. Trucking, Marine Insurance, and shared General Information still diverge from the final matrix. |
| Booking requiredness rules | Partial | Many matrix `Yes` fields are currently marked optional or conditional in the code. |
| Booking field naming / normalization | Partial | The booking system uses canonical snake_case and compatibility helpers, but the final matrix and old quotation/service metadata still require normalization. |
| Quotation-to-booking carry-over | Partial | There is working autofill/handoff from project and contract sources, but coverage is uneven and still depends on legacy field names. |

## Quotation Comparison

## Shared Quotation General Information

Expected from final matrix:

- Customer
- Contact Person
- Quotation Name
- Services
- Date
- Credit Terms
- Validity

Current system status: `Aligned`

What is aligned:

- `Customer` exists.
- `Contact Person` exists.
- `Quotation Name` exists.
- `Services` exists as a multi-select.
- `Date` exists.
- `Credit Terms` exists.
- `Validity` exists.
- `Movement` also exists in the current system as a high-level switch even though it is not explicitly shown in the left-side header rows of the first table.

What is partial:

- The current implementation is not schema-driven. These fields live in `GeneralDetailsSection.tsx` instead of a centralized quotation schema.
- Requiredness is weaker than the final matrix suggests. The form can be considered valid without checking all service-specific quotation inputs.

What is missing:

- There is no centralized quotation-side validation contract equivalent to the booking-side schema system.

## Brokerage Quotation

Expected from final matrix:

- Brokerage Type / Standard / All-Inclusive / Non-Regular structure
- Type of Entry
- AOD/POD
- Mode
- Cargo Type
- Commodity Description
- Delivery Address
- Country of Origin
- Preferential Treatment
- FCL / LCL / Air additional inputs

Current system status: `Partial`

What is aligned:

- `Brokerage Type` exists.
- `Type of Entry` exists.
- `POD / AOL/POL` exists.
- `Mode` exists.
- `Cargo Type` exists.
- `Commodity Description` exists.
- `Delivery Address` exists.
- `Country of Origin` exists.
- `Preferential Treatment` exists.
- FCL container inputs exist through `ContainerEntriesManager`.
- LCL Gross Weight and Dimensions exist.
- Air Gross Weight and Chargeable Weight exist.

What is partial:

- The current form stores `POD` and export-side `AOL/POL` under the same legacy `pod` area instead of a clean normalized route model.
- `Type of Entry` is still represented as checkbox-style flags like `consumption`, `warehousing`, and `peza`, not yet normalized the way the final booking structure expects.
- `Commodity Description` is saved as `commodity`, not a canonical `commodity_description`.
- Export filtering and brokerage package logic are hand-coded instead of schema-driven.
- The quotation save layer still persists mixed legacy keys such as `type_of_entry`, `pod`, `commodity`, `lcl_gwt`, and `air_cwt`.

What is missing:

- No centralized quotation schema controls Brokerage field visibility and requiredness.
- No direct quotation-side normalization toward the final booking labels such as `Customs Entry Procedure Code`.

## Forwarding Quotation

Expected from final matrix:

- Incoterms-driven field visibility across EXW, FOB, CFR, CIF, FCA, CPT, CIP, DAP, DDU, DDP
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
- FCL / LCL / Air additional mode inputs

Current system status: `Partial`

What is aligned:

- `Incoterms` exists.
- `Cargo Type` exists.
- `Cargo Nature` exists.
- `Commodity Description` exists.
- `Delivery Address` exists with destination-delivery logic.
- `AOL/POL` exists.
- `AOD/POD` exists.
- `Mode` exists.
- `Collection Address` exists for EXW.
- `Transit Time` exists.
- `Carrier/Airline` exists.
- `Route` exists.
- `Stackable` exists.
- FCL container entries exist.
- LCL Gross Weight and Dimensions exist.
- Air Gross Weight and Chargeable Weight exist.

What is partial:

- The current form uses a mixture of field names such as `aolPol`, `aodPod`, `commodityDescription`, `route`, and `stackable`, while the final matrix implies a more canonical shared language.
- Visibility logic is not a clean direct encoding of the final matrix. Some logic depends on `builderMode`, `movement`, and historical assumptions.
- `Cargo Nature` is currently hidden for export in the quotation form, which is a product choice not directly stated in the final matrix.
- The quotation save layer stores `commodity`, `aolPol`, `aodPod`, `carrier_airline`, `transit_time`, and `route`, which means handoff into booking still needs translation.

What is missing:

- No quotation-side schema explicitly models the full incoterm matrix as a source of truth.
- No shared quotation validation enforces the final forwarding matrix row-by-row.

## Trucking Quotation

Expected from final matrix:

- Pickup Location
- Destination/s
- Delivery Instructions
- Truck Type
- Qty

Current system status: `Partial`

What is aligned:

- `Pickup Location` exists as `Pickup Location` or `Pull Out` depending on movement.
- `Delivery Instructions` exists.
- `Truck Type` exists.
- `Destination/s` exists.
- `Qty` exists per destination row.

What is partial:

- The current form is repeater-based and supports multiple destination rows with truck type and quantity per row.
- This is more powerful than the final matrix, but it does not map one-to-one to the simpler document language.
- Export-side trucking fields such as `AOL/POL` also exist in the quotation form even though they are not highlighted in the simplified final matrix summary.

What is missing:

- No quotation-side centralized schema for Trucking.
- No explicit final-matrix-style validation that guarantees every destination row is structurally complete according to a formal rule set.

## Marine Insurance Quotation

Expected from final matrix:

- Commodity Description
- HS Code
- AOL/POL
- AOD/POD
- Invoice Value

Current system status: `Aligned`

What is aligned:

- All five expected fields exist directly in the quotation form.

What is partial:

- The current save layer persists both compound and split route fields, which is useful, but still part of the legacy-to-normalized transition story.

What is missing:

- Nothing major at the quotation field level relative to the final matrix.

## Others Quotation

Expected from final matrix:

- Service Description

Current system status: `Aligned`

What is aligned:

- `Service Description` exists directly and is persisted.

What is missing:

- Nothing major at the quotation field level relative to the final matrix.

## Booking Comparison

## Shared Booking Architecture

Expected from final matrix:

- Booking should be a structured operational screen with shared general information plus service-specific and mode-specific sections.

Current system status: `Aligned`

What is aligned:

- Booking create forms are schema-driven.
- Booking detail screens are schema-driven.
- Visibility rules are centralized.
- Storage is normalized through shared booking payload and compatibility helpers.

What is partial:

- Exact requiredness and profile-backed behavior are not fully production-complete yet.

What is missing:

- Nothing major at the architecture level. The main remaining work is alignment, not infrastructure.

## Booking General Information

Expected from final matrix:

- Movement
- Consignee
- Account Owner
- Project / Contract Number
- Customs Entry
- Team Assignment
- Customs Entry Procedure
- Overseas Agent
- Local Agent

Current system status: `Partial`

What is aligned:

- `Movement` exists.
- `Account Owner` exists.
- `Project / Contract Number` exists.
- `Team Assignment` exists.
- `Overseas Agent` exists for Forwarding.
- `Local Agent` exists for Forwarding.

What is partial:

- `Movement` is currently shown for Marine Insurance in the booking schema, while the final matrix says `No` for Marine Insurance.
- `Project / Contract Number` exists, but is treated more as lineage/autofill metadata than a strict client-facing operational requirement.
- `Team Assignment` exists, but is only conditionally required.

What is missing:

- `Consignee` is not implemented as a shared General Information field; it lives inside service-specific booking details instead.
- `Customs Entry` is not implemented for Forwarding in Booking General Information the way the final matrix expects.
- `Customs Entry Procedure` is not present for Trucking the way the final matrix says it should be.
- `Overseas Agent` is not present for Marine Insurance, even though the final matrix says `Yes`.

## Brokerage Booking

Expected from final matrix:

- Shared mode-specific operational fields for FCL, LCL, AIR
- Customs execution block
- LCL-specific Consolidator
- Air-specific Chargeable Weight

Current system status: `Partial`

What is aligned:

- `Shipper`
- `MBL/MAWB`
- `HBL/HAWB`
- `Carrier/Airline`
- `AOL/POL`
- `Forwarder (If any)`
- `Gross Weight`
- `Measurement`
- `Container Number/s`
- `Incoterms`
- `ETD`
- `ETA`
- `ETB`
- `Selectivity Color`
- `Entry Number`
- `Examinations`
- `Customs Duties & Taxes Paid`
- `Brokerage Fee`
- `Consolidator`
- `Location of Goods`
- `Stripping Date / Date of Discharge`
- `Chargeable Weight`

What is partial:

- Some fields are present but under slightly different labels:
  - `Brokerage Fee (SAD)` is currently modeled as `Brokerage Fee Net of VAT`.
  - `Examinations` is modeled as a repeater, which is correct functionally, but not yet guaranteed to exactly match all client expectations.
- Some requiredness is softer than the final matrix.
- `Country of Origin` and `Preferential Treatment` are available in booking details but not elevated exactly the way the final matrix comments imply.

What is missing:

- Nothing major in terms of brokerage field coverage.

What exists in the current system beyond the final matrix:

- `Seal Number/s`
- `Tare Weight`
- `VGM`
- `Container Deposit`
- `Storage Validity`
- `CRO Availability`
- `Booking Confirmation Number`
- `Pull Out`
- `Collection Address`
- `Trucking Name`
- `Plate Number`
- `HS Code/s`
- `Rate of Duty`
- `Permit/s`

## Forwarding Booking

Expected from final matrix:

- Shared FCL / LCL / AIR operational set
- Sea-specific container fields
- LCL-specific Consolidator
- Air-specific Chargeable Weight
- General forwarding fields like Customs Entry Procedure, Overseas Agent, Local Agent

Current system status: `Partial`

What is aligned:

- `Incoterms`
- `Cargo Type`
- `Cargo Nature`
- `Customs Entry Procedure Code`
- `Overseas Agent`
- `Local Agent`
- `Consignee`
- `Shipper`
- `MBL/MAWB`
- `HBL/HAWB`
- `Gross Weight`
- `Container Number/s`
- `Preferential Treatment`
- `Country of Origin`
- `Container Deposit`
- `Det/Dem Validity`
- `ETD`
- `ETA/ATA`
- `ETB`
- `Stripping Date / Date of Discharge`
- `Tagging Time`
- `Registry Number`
- `Type of Package`
- `Consolidator`
- `Location of Goods`
- `Measurement`
- `Chargeable Weight`

What is partial:

- `Forwarder (if any)` exists, but the codebase also models `Agent`, so the operational meaning is partially split.
- `Measurement` is currently represented as `Dimensions` in one section of the booking schema, while the final matrix expects Measurement terminology.
- `Tagging Time` exists but is not required.
- `Type of Package` exists but is not required.
- `Customs Entry` itself is not modeled in shared booking General Information for Forwarding, even though the final matrix says it should be present.

What is missing:

- No direct shared Booking General Information `Customs Entry` field for Forwarding.

What exists in the current system beyond the final matrix:

- `Country of Destination`
- `Flight Number`
- `Vessel`
- `Remarks`
- `Cut Off Time`
- `Transit Time`
- `Routing`
- `Stackable`
- `Shipping Charges`
- `Consolidator Charges`
- `Collection Address`
- `Delivery Address` driven by incoterms

## Trucking Booking

Expected from final matrix:

- General Information rows applicable to Trucking
- Trucking booking inputs split by `FCL` and `LCL`
- Driver, Helper, Vehicle Reference Number, Date Delivered, TABS Booking, Empty Return, CY Fee, Early Gate In, EIR Availability, Det/Dem Validity, Storage Validity, Shipping Line, Container Number, Selling Rate

Current system status: `Partial`

What is aligned:

- `Consignee`
- `Driver`
- `Helper`
- `Vehicle Reference Number`
- `Date Delivered`
- `TABS Booking`
- `Empty Return`
- `CY Fee`
- `Early Gate In`
- `EIR Availability`
- `Det/Dem Validity`
- `Storage Validity`
- `Shipping Line`
- `Container Number`
- `Truck Type`
- `Delivery Instructions`
- `Destination/s` through `trucking_line_items`

What is partial:

- The current schema does not cleanly separate `FCL` versus `LCL` as a top-level Trucking mode selector. Instead, the trucking form has its own delivery and container detail structure.
- `Date Delivered` only appears based on status progression, not simply because the field belongs to the trucking schema.
- `Helper` exists but is not required.
- `Driver` and `Vehicle Reference Number` are conditional, not firm `Yes` fields.
- The current trucking structure is more operations-driven and status-driven than the final matrix's simpler Yes/No representation.

What is missing:

- `Selling Rate` is not present in the current booking schema.
- The final-matrix-style `FCL / LCL` trucking split is not explicitly represented as a clean schema selector.
- `Customs Entry Procedure` is not present in Trucking General Information even though the final matrix marks it `Yes`.

What exists in the current system beyond the final matrix:

- `Preferred Delivery Date`
- `Pull Out`
- `Pull Out Date`
- `Date of Empty Return`
- Repeater-style `Destinations` with truck type and quantity per row

## Marine Insurance Booking

Expected from final matrix:

- General Information rows as applicable
- Booking-side service continuity

Current system status: `Partial`

What is aligned:

- `Account Owner`
- `Project / Contract Number`
- `Team Assignment`
- `Consignee`

What is partial:

- The current Marine Insurance booking schema is much richer than the final matrix, which means it does not conflict directly but also does not mirror the matrix layout closely.

What is missing:

- `Overseas Agent` is not implemented even though the additional-inputs matrix marks it `Yes` for Marine Insurance.
- The final matrix does not define a full Marine Insurance booking block, but the current system goes beyond it rather than matching it directly.

What exists in the current system beyond the final matrix:

- `Shipper`
- `Carrier`
- `Insurer`
- `Amount Insured`
- `BL / AWB Number`
- `ETD`
- `ETA`
- `Date Issued`
- `Policy Number`
- `Premium`
- `Coverage Type`
- `Policy Start Date`
- `Policy End Date`
- `Remarks`

## Others Booking

Expected from final matrix:

- Service Description

Current system status: `Aligned`

What is aligned:

- `Service Description` exists in the booking schema.

What is partial:

- The current schema adds internal optional operational fields that are outside the final matrix.

What is missing:

- Nothing major relative to the final matrix.

What exists in the current system beyond the final matrix:

- `Delivery Location`
- `Schedule Date`
- `Completion Date`
- `Contact Person`
- `Contact Number`
- `Estimated Cost`
- `Actual Cost`
- `Special Instructions`

## Quotation-to-Booking Handoff Comparison

Expected from final matrix:

- Shared quotation fields should carry into booking in a predictable and normalized way.

Current system status: `Partial`

What is aligned:

- There is a real handoff pipeline from quotation/project/contract into booking.
- Brokerage, Forwarding, Trucking, Marine Insurance, and Others all have autofill helpers.
- Common fields like customer, movement, quotation reference number, route data, commodity-style fields, and service description can flow into booking forms.

What is partial:

- Handoff depends on mixed legacy quotation keys such as `commodity`, `pod`, `aolPol`, `aodPod`, `type_of_entry`, `lcl_gwt`, and `air_cwt`.
- Some carry-over fields are inferred from project-level values instead of a clean canonical service schema.
- Trucking handoff is notably thinner than the final matrix and focuses on a smaller subset of fields.
- Cross-service field syncing in quotations is manual and heuristic-based rather than schema-driven.

What is missing:

- No single canonical quotation schema guarantees that all final-matrix carry-over fields are stored in one normalized way before booking conversion.
- No single handoff contract ensures a one-to-one transition from quotation matrix rows to booking matrix rows.

## Priority Gaps To Close

If the goal is to make the current system match the final matrix more closely, these are the highest-value gaps:

| Priority | Gap |
|---|---|
| 1 | Create a centralized quotation schema equivalent to the booking schema. |
| 2 | Tighten quotation validation so service-specific required fields follow the final matrix. |
| 3 | Align Booking General Information with the matrix, especially for `Consignee`, `Customs Entry`, `Customs Entry Procedure`, and `Overseas Agent`. |
| 4 | Add missing Trucking booking fields such as `Selling Rate` and decide how explicit `FCL / LCL` mode should be in Trucking. |
| 5 | Normalize quotation field storage so carry-over into booking no longer depends on mixed legacy names. |
| 6 | Review all `Yes` rows in the final matrix and convert current soft optional fields into stricter required rules where the business really expects them. |

## Actionable Implementation Checklist

This section is written as a build guide for implementation work. It is intentionally prescriptive so the work stays aligned to the final matrix and does not drift into a parallel architecture.

## Implementation Guardrails

These rules should be followed during implementation:

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

---

## Implementation Change Log

The implementation work below reflects the current state of the quotation-booking alignment effort. The following describes what changed and any intentional deviations that still remain.

### Quotation Schema (Phases 1–3)

- **New:** `src/config/quotation/quotationScreenSchema.ts` — centralized quotation schema mirroring booking's `FieldDef`/`SectionDef` structure, covering all five services with full matrix field and visibility coverage.
- **New:** `src/config/quotation/quotationFieldTypes.ts` — types: `QuotationFieldDef`, `QuotationSectionDef`, `QuotationServiceSchema`, `QuotationFormContext`, `QuotationVisibilityCondition`.
- **New:** `src/utils/quotation/quotationValidation.ts` — `validateQuotation()` validates visible required fields per service/mode/package/incoterm. Wired into `QuotationBuilderV3.isFormValid()` for both Inquiry and Quotation flows.
- **New:** `src/utils/quotation/quotationNormalize.ts` — `normalizeServicesMetadata()` dual-writes canonical keys alongside legacy aliases. Wired into `QuotationBuilderV3` save handler.
- **Updated:** `BrokerageServiceForm.tsx` — collapsed 3 duplicated package blocks into one unified layout. Type of Entry gated on Standard/Non-Regular; Country of Origin + Preferential Treatment gated on All-Inclusive. Delivery Address now shows for all packages (matrix: no export restriction).
- **Updated:** `ForwardingServiceForm.tsx` — fixed 3 incorrect `!isExport` restrictions: Delivery Address now shows only for DAP/DDU/DDP (not all imports), Cargo Nature now shows for all incoterms, Carrier/Transit/Route/Stackable block now shows for EXW/FOB/FCA regardless of movement direction.

### Canonical Key Normalization (Phases 3 & 5)

New aliases added to `bookingDetailsCompat.GLOBAL_LEGACY_MAP`:
- `commodity → commodity_description`
- `lcl_gwt → gross_weight`
- `lcl_dims → measurement`
- `air_gwt → gross_weight`
- `air_cwt → chargeable_weight`
- `route → routing`
- `pull_out → pull_out_location`
- `customsEntryProcedureCode → customs_entry_procedure`
- `customsEntryType → customs_entry_procedure`
- `dimensions → measurement`

### Booking General Information (Phase 4)

- `movement_type` visibility — removed Marine Insurance (matrix: MI = No). MI bookings no longer show the Movement field.
- `consignee` — moved from four service-specific sections to shared General Information. Shown for all five services. `required: 'yes'`.
- `account_owner` — tightened to `required: 'yes'` to match the matrix.
- `project_number` — tightened to `required: 'yes'` to match the matrix.
- `team_assignment` — tightened to `required: 'yes'` to match the matrix.
- `customs_entry` — moved to shared GI; shown for Brokerage and Forwarding (matrix: BR=Yes, FWD=Yes). `required: 'yes'`.
- `customs_entry_procedure` — consolidated into one shared GI field for Brokerage, Forwarding, and Trucking (matrix: BR=Yes, FWD=Yes, TKG=Yes). Legacy `_code` values normalize into this one key.
- `overseas_agent` — moved to shared GI; shown for Forwarding and Marine Insurance (matrix: FWD=Yes, MI=Yes). `required: 'yes'`.
- `local_agent` — moved to shared GI; shown for Forwarding only (matrix: FWD=Yes). `required: 'yes'`.

### Booking Service-Specific (Phase 5)

- **Brokerage:** `brokerage_fee_sad` added as the matrix-backed field with label "Brokerage Fee (SAD)". Existing `brokerage_fee_net_of_vat` was retained as a separate extra field to avoid silently reinterpreting historical values.
- **Forwarding:** `dimensions` renamed to `measurement` with label "Measurement". Legacy alias in compat layer. `tagging_time` made `required: 'yes'` (matrix: all forwarding modes). `type_of_package` made `required: 'yes'` and removed Import-only restriction (matrix: all modes). `agent` field label changed to "Forwarder (if any)" (matrix wording). Duplicate `forwarder` field removed. `customs_entry_procedure_code` was removed as a separate field and normalized into shared GI `customs_entry_procedure`.
- **Trucking:** `driver`, `helper`, `vehicle_reference_number` made `required: 'yes'`. Added `selling_rate` (currency, `required: 'yes'`).

### Quotation-To-Booking Handoff (Phase 6)

- **New:** `src/utils/bookings/quotationToBookingMapping.ts` — canonical mapping tables for all five services. `applyMapping()` powers both `projectAutofill.ts` and `contractAutofill.ts`.
- **Updated:** `projectAutofill.ts` — all five service autofill functions now use `applyMapping` with canonical-first lookup. Forwarding handoff covers the full matrix and preserves the historical Brokerage fallback for `country_of_origin` and `preferential_treatment`. Trucking handoff now carries `trucking_line_items` repeater.
- **Updated:** `contractAutofill.ts` — all five service autofill functions now use `applyMapping`, including the same Brokerage fallback preservation for Forwarding.

### Intentional Deviations from the Matrix

The following behaviors deviate from the matrix but were either pre-existing or represent intentional product extensions:

- **Marine Insurance Movement field** — The matrix says MI = No for Movement. The booking schema was updated to hide it for MI. Historical MI bookings retain stored movement values; the field is simply not shown in the UI.
- **Trucking FCL/LCL mode** — No explicit `trucking_mode` toggle was added. The existing `movement_type` gates the container section (Import/Export maps to FCL context). This decision was taken to avoid inventing a new field not explicitly required by the matrix.
- **Extra service fields** — Many fields beyond the matrix (VGM, Seal Numbers, Rate of Duty, Insurer, Premium, Coverage Type, etc.) remain in the booking schema. The matrix is a floor, not a ceiling.
