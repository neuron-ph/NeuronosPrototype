# Neuron OS — System Architecture V3

> This document extends and supersedes `ESSENTIALS_FINANCIAL_ARCHITECTURE_V2.md` on the topics it covers.
> V2 remains authoritative for the booking-first financial model, entity field requirements, billing rules, cost rules, KPI formulas, cancellation rules, and denormalization rules.
> V3 focuses on: the business pipeline, container semantics, booking creation paths, dual membership, rate and billing item lifecycle, booking identity, and schema additions agreed during the March 2026 architecture session.
>
> Status: authoritative
> Drafted: 2026-03-21

---

## 1. What V3 Adds

V2 established that `project` and `contract` are sibling work containers, not a hierarchy, and that `booking` is the atomic financial unit.

V3 documents the following on top of that foundation:

- The full business pipeline from Inquiry to container
- The exact relationship between `quotation` and its container (Project or Contract)
- How mixed bookings work inside a Project
- Dual membership semantics and revenue ownership rules
- Booking creation paths (pipeline vs. direct)
- Rate evaluation timing and the rate snapshot
- Billing line item lifecycle (when they are created, when they lock)
- Booking identity: the `name` field and natural identifiers
- Multiple bookings of the same service type within a Project
- The `pricing_basis` field on bookings

---

## 2. The Business Pipeline

### 2.1 Full pipeline

```
Inquiry
  └── Quotation (quotation_type = 'spot' | 'contract')
        ├── if spot     →  Project   (1:1, Project owns the Quotation)
        └── if contract →  Contract  (1:1, Contract owns the Quotation)
              └── both containers hold Bookings
```

Every Inquiry hands off to Pricing. Pricing creates a Quotation. A Quotation becomes either a Project or a Contract — never both, never neither (once approved). The relationship is strictly 1:1 in both directions.

### 2.2 Quotation type is the fork

The `quotation_type` field on the `quotations` table determines the downstream container:

| `quotation_type` | Becomes | Container type |
|---|---|---|
| `'spot'`     | Project  | One-time shipment |
| `'contract'` | Contract | Long-term rate agreement |

There is no other mechanism that determines this fork. The field is set during the Pricing phase and does not change after the Quotation is approved.

### 2.3 Quotation amendments

Quotations support a revision and amendment feature. When a quotation is revised:

- A new version record is created rather than mutating the original
- The 1:1 relationship with the downstream container (Project or Contract) is preserved through the canonical approved version
- Amendment history is retained for audit and dispute purposes

### 2.4 Inquiry is optional for contract bookings

The Inquiry → Quotation → Contract pipeline is the standard path for new contract relationships.

However, once a Contract exists, Operations may create contract bookings **directly under the Contract** without going through the Inquiry → Quotation pipeline. This is the normal operational mode for ongoing contract work once the relationship is established.

---

## 3. Container Semantics

### 3.1 Project

A Project is the container for **one-time shipment work**.

Characteristics:

- Created from a Spot Quotation (1:1)
- Represents a single shipment or job file
- Holds bookings for that shipment — potentially multiple service types
- Multiple bookings of the same service type are permitted (see Section 6)
- Owns all revenue attached to its bookings, including bookings that use contract rates
- Project profitability = sum of booking profitability within the Project

A Project is **not** a long-running entity. It represents a discrete job.

### 3.2 Contract

A Contract is the container for **long-term rate agreement work**.

Characteristics:

- Created from a Contract Quotation (1:1)
- Represents an ongoing rate agreement for one or more service types
- Holds all bookings made under the agreed rates, across the entire contract period
- Bookings may be created directly by Operations (no Inquiry → Quotation required)
- Tracks utilization — booking counts, volume, and service usage over time
- Contract profitability = sum of booking profitability within the Contract

**Revenue ownership note for financial reporting:** When a booking belongs to both a Project and a Contract (see Section 4), the revenue is owned by the Project. The Contract view for that booking shows utilization only. This prevents double-counting in company-wide P&L rollups.

### 3.3 Neither container is the parent of the other

Project and Contract are siblings. There is no parent/child relationship between them.

A booking that belongs to both (see Section 4) does not make one container a sub-entity of the other. The Project holds the booking as part of a shipment job. The Contract holds the booking as utilization under the rate agreement. These are two independent views of the same booking record.

---

## 4. Mixed Bookings and Dual Membership

### 4.1 The mixed booking scenario

A Project may contain bookings of multiple types, some priced at spot rates and others priced at contract rates.

**Real-world example:** An importer has a Brokerage Contract. A shipment arrives that requires Forwarding + Brokerage + Trucking. The BD team creates a Project (via Spot Quotation) for the full shipment. The Project contains:

- Forwarding booking — spot-priced
- Brokerage booking — contract-priced (linked to the Brokerage Contract)
- Trucking booking — spot-priced

This is the standard multi-service shipment scenario.

### 4.2 Dual membership

When a booking inside a Project is contract-priced, it belongs to **both** the Project and the Contract.

Rules:

- The booking record holds both `project_id` and `contract_id`
- The booking appears in the Project's booking list
- The booking appears in the Contract's booking list
- This dual appearance is intentional and by design

### 4.3 Revenue ownership for dual-membership bookings

Despite appearing in both container views:

- **Revenue belongs to the Project**. The Project's financial totals (booked charges, invoiced amount, gross profit) include this booking fully.
- **The Contract tracks utilization only** for project-linked bookings. The Contract's financial view should mark or filter these bookings to avoid counting their revenue in Contract-level P&L. This prevents double-counting across the company-wide rollup.

This is expressed through the `pricing_basis` and `project_id` + `contract_id` combination on the booking record (see Section 5).

### 4.4 Rate matrix application for contract bookings in a Project

When a Spot Quotation contains a service that is contract-linked:

- The rate matrix calculator runs during the Spot Quotation pricing phase
- The calculated prices for that contract-linked service are added to the Project at that time
- These become the billing line items for that booking
- The Contract supplies the rates; the Project owns the resulting charges

---

## 5. Booking Creation Paths and `pricing_basis`

### 5.1 Two creation paths

| Path | Description | `pricing_basis` | `project_id` | `contract_id` |
|---|---|---|---|---|
| Pipeline (spot) | Inquiry → Spot Quotation → Project → Booking | `'spot'` | required | null |
| Pipeline (contract in project) | Inquiry → Spot Quotation → Project → Booking linked to Contract | `'contract'` | required | required |
| Direct (contract) | Operations creates booking directly under Contract | `'contract'` | null | required |

### 5.2 `pricing_basis` field

Every booking must carry an explicit `pricing_basis` value:

```ts
pricing_basis: 'spot' | 'contract'
```

Rules:

- `'spot'` bookings require `project_id` and must have `contract_id = null`
- `'contract'` bookings require `contract_id`
- `'contract'` bookings may or may not have `project_id` (dual membership when present)

This field makes downstream financial logic — rate application, profitability attribution, reporting — deterministic without relying on null-checking combinations.

---

## 6. Multiple Bookings of the Same Service Type in a Project

### 6.1 No hard constraint

A Project does not enforce a one-booking-per-service-type limit.

A single Project may contain two Forwarding bookings, two Trucking bookings, or multiples of any other type. This is the correct behavior for:

- Split shipments (cargo across two vessels, two BLs)
- Multiple trucking legs handled as separate operational jobs
- Any scenario where a single shipment requires more than one instance of the same service

### 6.2 Disambiguation

When multiple bookings of the same type exist in a Project, they are disambiguated by:

1. **The `name` field** (see Section 7) — the primary user-facing label
2. **The natural identifier** for that service type — as a fallback when `name` is not yet set

Natural identifiers by service type:

| Service Type | Natural Identifier |
|---|---|
| Forwarding | BL Number |
| Brokerage | Entry Number |
| Trucking | Delivery Receipt / Waybill Number |
| Marine Insurance | Policy Number |
| Others | Reference field |

### 6.3 UI display rule

When rendering a Project's booking list:

- If a `name` is set on the booking, display it as the primary label
- If no `name` is set, display the natural identifier (e.g. BL Number) as the label
- If neither is set (early-stage booking), display `"{Service Type} — Pending"`
- When multiple bookings of the same service type exist, always show the label to distinguish them

---

## 7. Booking Identity: The `name` Field

### 7.1 All bookings have a name

A `name` field is added to all booking types (all five service types and the base `bookings` record).

```ts
name: string | null
```

This is a free-text, nullable field. It is optional for all bookings, not required.

### 7.2 Purpose

The `name` field serves as the **human-readable label** for a booking across all contexts:

- In Project booking lists
- In Contract booking lists
- In financial views (billing items grouped by booking)
- In Operations detail panels
- In reports

It allows ops teams to give meaningful names to bookings: "Split — Vessel 1", "Leg 2 — Port B", "Secondary Brokerage Entry", etc.

### 7.3 Not a replacement for the natural identifier

The natural identifier (BL Number, Entry Number, etc.) remains the operational identifier. The `name` field is supplemental — it adds intent and context. Both should be visible in booking detail views.

---

## 8. Rate Evaluation and the Rate Snapshot

### 8.1 Rate evaluation is lazy

Rates are not locked at booking creation time. They are evaluated at the time billing line items are created.

Behavior:

- If billing line items have already been created for a booking and the contract rates change → the existing billing items are **not affected**
- If a booking exists but billing line items have not yet been created, and the contract rates change → the **new rates apply** when billing items are eventually created

This is intentional. The system uses the most current agreed rates at the time billing is initiated, not at the time the booking is entered.

### 8.2 Rate snapshot (audit field)

A `rate_snapshot` field is added to all booking records:

```ts
rate_snapshot: Record<string, unknown> | null  // JSONB
```

This field captures the applicable rates from the contract's rate matrix **at the time the booking is created**.

Rules:

- `rate_snapshot` is written once, at booking creation, and is never updated
- It is a reference field only — it is **not used for billing calculations**
- Its sole purpose is audit and dispute resolution: "what were the agreed rates when this booking was entered?"
- For spot bookings, `rate_snapshot` may be null or may capture the quoted rate for the same audit purpose

This field addresses the window between booking creation and billing item creation where rates could theoretically change. It provides a defensible audit trail without changing the lazy evaluation behavior.

---

## 9. Billing Line Item Lifecycle

### 9.1 When billing items are created

For spot-priced services in a Project:
- Billing line items are created during the **Pricing / Quotation phase**
- The Quotation Builder generates the line items for each service
- They are immediately associated with the booking and the Project

For contract-priced bookings created directly by Operations (no Project):
- Billing line items are created when **billing is initiated** on the booking
- The rate matrix calculator applies current contract rates at that time

For contract-priced bookings within a Project (dual membership):
- The rate matrix calculator runs during the **Spot Quotation pricing phase**
- The calculated amounts are created as billing line items at that point
- The Contract supplies the rates; the billing items belong to the booking (not the Project or Contract directly)

### 9.2 Mutability rules

Billing line items follow these mutability rules:

| State | Mutability |
|---|---|
| Created, not yet on any invoice | Freely editable — amounts, descriptions, charge codes |
| Packaged into an invoice | **Locked** — no edits permitted |
| Invoice voided | Returns to editable state |

This allows for post-booking adjustments (actual weights, surcharges, port fees, corrections) up until the invoice is issued. After invoicing, changes must go through credit/reversal flows.

### 9.3 Billing items belong to bookings

This is unchanged from V2. A billing line item's primary anchor is always `booking_id`. Project-level and Contract-level financial totals are derived by aggregating booking-level billing items.

---

## 10. Financial Rollup Rules (Revenue Ownership)

### 10.1 Project financial rollup

A Project's financial totals include **all bookings** within it, regardless of `pricing_basis`:

- Spot bookings → full ownership
- Contract-linked bookings within the Project → included in Project totals

Project gross profit = sum of all booking gross profits where `project_id = this project`

### 10.2 Contract financial rollup

A Contract's financial totals use the following rule:

- **Direct contract bookings** (`contract_id = this contract`, `project_id = null`) → full ownership, included in Contract P&L
- **Project-linked contract bookings** (`contract_id = this contract`, `project_id IS NOT NULL`) → utilization tracking only, **excluded from Contract P&L totals** to prevent double-counting

Contract utilization = count and volume of all bookings where `contract_id = this contract`
Contract P&L = sum of gross profits where `contract_id = this contract AND project_id IS NULL`

### 10.3 Company-wide P&L

When computing company-wide P&L by summing across all containers, the correct approach is to sum booking-level gross profits exactly once per booking. The `pricing_basis` and `project_id` / `contract_id` combination determines the single owner:

- `pricing_basis = 'spot'` → owned by Project
- `pricing_basis = 'contract'` AND `project_id IS NULL` → owned by Contract
- `pricing_basis = 'contract'` AND `project_id IS NOT NULL` → owned by Project

Every booking is counted exactly once in P&L regardless of how many container views it appears in.

---

## 11. Schema Additions

The following fields are added or confirmed as part of this architecture:

### 11.1 All booking tables (all five service types + base `bookings`)

| Field | Type | Description |
|---|---|---|
| `name` | `text \| null` | Human-readable label. Optional. Used for display and disambiguation. |
| `rate_snapshot` | `jsonb \| null` | Rates from the applicable rate matrix captured at booking creation. Audit use only. Never used in billing calculations. |
| `pricing_basis` | `'spot' \| 'contract'` | Explicit pricing basis. Required. Drives financial attribution logic. |

### 11.2 All booking tables — existing conditional fields clarified

| Field | When required | When null |
|---|---|---|
| `project_id` | Required for spot bookings. Optional for contract bookings that are part of a Project. | Null for direct contract bookings (Ops-created, no Project). |
| `contract_id` | Required for contract bookings. | Null for spot bookings. |

---

## 12. Summary of Rules

| Rule | Statement |
|---|---|
| Container type | Project and Contract are sibling containers. Neither is parent of the other. |
| Pipeline | Inquiry → Quotation (1:1) → Project (if spot) or Contract (if contract) |
| Direct bookings | Ops may create contract bookings directly under a Contract without the pipeline |
| Mixed bookings | A Project may contain both spot-priced and contract-priced bookings |
| Dual membership | A contract-priced booking in a Project belongs to both; this is intentional |
| Revenue ownership | Project owns revenue for all its bookings. Contract P&L excludes project-linked bookings. |
| Rate evaluation | Rates are evaluated at billing item creation time, not at booking creation time |
| Rate snapshot | Rates at booking creation are stored in `rate_snapshot` for audit purposes only |
| Billing mutability | Billing line items are mutable until packaged into an Invoice |
| Booking name | All bookings have an optional `name` field for human-readable labelling |
| Same-type multiples | Multiple bookings of the same service type in one Project are allowed |
| Disambiguation | Name field is primary; natural identifier (BL#, Entry#, etc.) is fallback |
| Pricing basis | Every booking carries an explicit `pricing_basis: 'spot' \| 'contract'` |
| P&L double-counting | Prevented by the revenue ownership rule: each booking counted once in company P&L |
