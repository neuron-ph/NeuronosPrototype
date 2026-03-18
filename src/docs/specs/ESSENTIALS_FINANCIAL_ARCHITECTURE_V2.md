# Essentials Financial Architecture V2

> Target state specification for Neuron OS Essentials mode.
> This document supersedes the project-first financial framing in `FINANCIAL_ARCHITECTURE.md` for future architecture work.
> Status: proposed
> Drafted: 2026-03-17

---

## 1. Purpose

This V2 spec defines the correct financial architecture for **Essentials mode**.

The core correction is:

- Financial recording is **booking-first**
- `project` and `contract` are **work containers**
- `invoice` and `collection` are **financial documents**
- profitability rolls up from **bookings**, not from projects

This spec is intentionally limited to Essentials mode:

- track service-linked revenue and direct service costs
- support spot and contract work
- support invoicing and collections
- leave non-booking company accounting for Full Suite

---

## 2. Core Design Principles

### 2.1 Booking-first financial truth

A `booking` is exactly **one service being performed**.

Every service-linked financial event in Essentials must originate from a booking:

- service revenue charges
- direct service costs
- booking profitability

This makes `booking` the atomic financial unit for service work.

### 2.2 Containers are not the atomic financial basis

`project` and `contract` are both work containers.

They organize bookings, but they do not replace bookings as the source of service economics.

- `project` = umbrella file when a shipment or job is being handled as a grouped file
- `contract` = long-running pricing/work umbrella

Financial rollups may group by project or contract, but recording should still anchor to bookings.

### 2.3 Documents package or settle value

- `invoice` packages booking-owned charge lines into a customer-facing billing document
- `collection` records cash received against an invoice

These documents track billing and cash state. They do not create the underlying operational value.

### 2.4 Essentials is commercial finance, not full accounting

Essentials answers:

- what services are we performing
- what are we charging
- what direct costs are we incurring
- what have we invoiced
- what have we collected
- what is the gross profit by booking, project, contract, or customer

Essentials does **not** need to fully model:

- office overhead
- payroll
- approvals
- posting workflows
- full GL behavior
- non-booking company-wide expenses

Those belong to Full Suite.

---

## 3. Entity Roles

### 3.1 `project`

Purpose:

- umbrella file for spot work
- umbrella file for grouped multi-service work
- optional umbrella for contract work when a contract booking is also part of a shipment-level file

Rules:

- a spot booking must belong to a project
- a contract booking may belong to a project
- project profitability is the aggregate of its bookings

### 3.2 `contract`

Purpose:

- pricing umbrella
- long-running work container
- parent of contract-priced bookings

Rules:

- a contract booking must belong to a contract
- a contract booking may also belong to a project
- contract profitability is the aggregate of its bookings

### 3.3 `booking`

Purpose:

- one booking = one service
- atomic operational and financial unit for Essentials

Rules:

- all service-linked billing lines must reference `booking_id`
- all Essentials direct costs must reference `booking_id`
- booking profitability is the primary profitability truth

### 3.4 `billing_line_item`

Purpose:

- atomic revenue charge tied to a booking
- may remain unbilled until packaged into an invoice

Rules:

- belongs to one booking
- may belong to one invoice at most
- if staged billing is needed, split into multiple charge lines before invoicing

### 3.5 `expense`

Purpose:

- direct service cost tied to a booking in Essentials

Rules:

- every Essentials expense must reference `booking_id`
- non-booking expenses are out of scope for Essentials

### 3.6 `invoice`

Purpose:

- single-customer document that packages booking-owned billing lines

Rules:

- one invoice may include charges from multiple bookings
- one invoice may include charges across multiple projects
- one invoice may include charges across multiple contracts
- one invoice must remain single-customer

### 3.7 `collection`

Purpose:

- records actual cash received against an invoice

Rules:

- collections attach to invoices, not directly to bookings
- booking-level cash reporting is derived by tracing invoice lines back to bookings

---

## 4. Relationship Model

### 4.1 Allowed booking contexts

Bookings may exist in these valid states:

| Booking Type | `project_id` | `contract_id` | Notes |
|---|---|---|---|
| Spot booking | required | null or empty | Spot work cannot exist without a project |
| Contract booking | optional | required | Contract-only booking is valid |
| Contract booking inside project | required | required | Valid when contract-priced service is part of a larger shipment file |

### 4.2 Pricing basis

Each booking should explicitly encode its pricing basis:

```ts
pricing_basis: 'spot' | 'contract'
```

Rules:

- if `pricing_basis = 'spot'`, `project_id` is required
- if `pricing_basis = 'contract'`, `contract_id` is required
- if `pricing_basis = 'contract'`, `project_id` is optional

This field removes ambiguity and makes downstream financial logic deterministic.

---

## 5. Source of Truth Rules

### 5.1 Operational value

The source of truth for service-linked commercial value is the booking layer:

- booking-linked revenue charges live in `billing_line_items`
- booking-linked direct costs live in `expenses`

### 5.2 Invoice value

The source of truth for document billing totals is the invoice layer:

- `invoice.total_amount` is the customer-facing billed amount

### 5.3 Cash value

The source of truth for cash received is the collection layer:

- `collection.amount` is the actual cash received

### 5.4 Rollup logic

Higher-level profitability is always derived:

- project profit = sum of booking profits in the project
- contract profit = sum of booking profits in the contract
- customer profit = sum of booking profits for that customer

---

## 6. Required Keys and Recommended Fields

### 6.1 `bookings`

Required conceptual fields:

| Field | Requirement | Notes |
|---|---|---|
| `id` | required | Primary key |
| `customer_id` | required | Needed for billing ownership |
| `service_type` | required | One booking = one service |
| `pricing_basis` | required | `'spot'` or `'contract'` |
| `project_id` | conditional | Required for spot bookings |
| `contract_id` | conditional | Required for contract bookings |
| `status` | required | Operational state |

### 6.2 `billing_line_items`

Required conceptual fields:

| Field | Requirement | Notes |
|---|---|---|
| `id` | required | Primary key |
| `booking_id` | required | Primary operational anchor |
| `customer_id` | required | Should agree with booking/invoice customer |
| `amount` | required | Charge amount |
| `invoice_id` | nullable | Null until packaged into invoice |
| `status` | required | Billing lifecycle state |

Recommended denormalized context:

- `project_id`
- `project_number`
- `contract_id`
- `service_type`
- `customer_name`

These are for filtering and display only. `booking_id` remains the real anchor.

### 6.3 `expenses`

Required conceptual fields for Essentials:

| Field | Requirement | Notes |
|---|---|---|
| `id` | required | Primary key |
| `booking_id` | required | Required in Essentials |
| `customer_id` | recommended | Helpful for reporting |
| `amount` | required | Direct cost amount |
| `status` | required | Final-on-record in Essentials |

Recommended denormalized context:

- `project_id`
- `project_number`
- `contract_id`
- `service_type`
- `customer_name`

### 6.4 `invoices`

Required conceptual fields:

| Field | Requirement | Notes |
|---|---|---|
| `id` | required | Primary key |
| `customer_id` | required | Invoice must be single-customer |
| `total_amount` | required | Canonical billed total |
| `status` | required | Invoice lifecycle |

Recommended behavior:

- derive booking/project/contract associations from invoice lines
- do not rely on a single `project_id` or `contract_id` on the invoice header as canonical truth

### 6.5 `collections`

Required conceptual fields:

| Field | Requirement | Notes |
|---|---|---|
| `id` | required | Primary key |
| `invoice_id` | required | Collections settle invoices |
| `customer_id` | required | Must match invoice customer |
| `amount` | required | Cash received |
| `collection_date` | required | Actual cash date |

---

## 7. Billing Rules

### 7.1 Booking-owned charge rule

All service revenue charges belong to bookings first.

Implication:

- a billing line is created because a booking exists
- an invoice only packages existing booking-linked billing lines

### 7.2 One-line-one-invoice rule

A billing line may belong to **one invoice at most**.

If the business needs staged billing:

- split the charge into multiple billing lines before invoicing
- do not reuse the same line across multiple invoices

### 7.3 Single-customer invoice rule

An invoice may bundle billing lines from:

- multiple bookings
- multiple projects
- multiple contracts

But only if all lines belong to the same customer.

### 7.4 Advanced billing is allowed

An invoice may be created before the service is completed.

Therefore Essentials must distinguish between:

- booked charges
- invoiced charges
- collected cash

This should be reported explicitly instead of using strict accrual accounting terminology.

---

## 8. Cost Rules

### 8.1 Essentials cost basis

In Essentials, all recorded expenses are treated as final operational costs.

There is no approval or posting workflow in Essentials.

### 8.2 Direct cost ownership

All Essentials direct costs must belong to a booking.

This means Essentials cost reporting is always service-linked.

### 8.3 Full Suite extension

Future non-booking costs such as:

- office expenses
- payroll
- overhead
- budget requests
- reimbursements

must be added as a separate Full Suite path and must **not** be forced into booking-linked expense records.

---

## 9. KPI Model for Essentials

Because advanced accounting treatment is out of scope, Essentials should use operationally clear KPI labels.

### 9.1 Booking-level truth

Primary measures:

- `booked_charges`
- `invoiced_amount`
- `collected_amount`
- `direct_cost`
- `gross_profit`

Suggested formulas:

```text
booked_charges = sum(billing_line_items.amount for booking)
invoiced_amount = sum(billing_line_items.amount where invoice_id is not null for booking)
collected_amount = allocated cash from collections through invoiced lines
direct_cost = sum(expenses.amount for booking)
gross_profit = booked_charges - direct_cost
```

### 9.2 Rollups

Derived measures:

- project gross profit = sum of booking gross profit in project
- contract gross profit = sum of booking gross profit in contract
- customer gross profit = sum of booking gross profit for customer

### 9.3 Commercial state metrics

Recommended commercial views:

- unbilled charges
- invoiced but uncollected amount
- collected cash
- direct costs recorded
- gross profit by booking

Avoid using:

- earned revenue
- unearned revenue

unless the system later adopts explicit accrual accounting rules.

---

## 10. Cancellation Rules

Booking cancellation must preserve financial history.

### 10.1 If no invoice and no costs exist

Recommended behavior:

- mark booking as cancelled
- void or archive uninvoiced booking charge lines

### 10.2 If costs exist but no invoice exists

Recommended behavior:

- mark booking as cancelled
- preserve the recorded costs
- classify the result as operational loss or cancellation cost
- void normal revenue lines unless a cancellation fee is intentionally billed

### 10.3 If invoice already exists

Recommended behavior:

- do not delete invoice-linked history
- resolve through credit, reversal, or cancellation billing logic

### 10.4 If collection already exists

Recommended behavior:

- do not rewrite collection history
- resolve later via customer credit or refund flow

### 10.5 Immutable-history rule

Once a charge has been invoiced or collected against, the system should favor:

- reversals
- credit handling
- adjustment documents

and should avoid destructive edits.

---

## 11. Reporting Dimensions

The reporting dimensions in Essentials should be:

- booking
- project
- contract
- customer
- service type

These are views over booking-based financial data.

Important rule:

- `project_number` is a reporting dimension
- it is not the universal basis of financial recording

---

## 12. Denormalization Rules

Denormalized fields are useful for filtering and UI performance, but must never outrank booking truth.

Recommended denormalized fields on financial records:

- `project_id`
- `project_number`
- `contract_id`
- `customer_id`
- `customer_name`
- `service_type`

Rule:

- if a denormalized field conflicts with the owning booking or source document, the owning record wins

---

## 13. Explicit Non-Goals for Essentials

The following are not part of the V2 Essentials core:

- customer credit management
- refunds
- overpayment allocation
- office/admin expense accounting
- AP approvals
- GL posting enforcement
- journal-entry-first accounting

These should be layered into Full Suite later without changing the booking-first service-finance core.

---

## 14. Migration Guidance from the Current Architecture

The current architecture should be reinterpreted as follows:

### Replace this assumption

Current framing:

- `project_number` is the main financial grouping key and practical anchor

V2 framing:

- `booking_id` is the primary operational financial anchor
- `project_number` is one important reporting dimension

### Keep this behavior

- invoices package line items
- collections settle invoices
- project and contract views are valid rollups

### Change this behavior

- do not assume every invoice belongs to one project
- do not assume project-level grouping is sufficient for all service finance
- do not model contract-only work as a project exception

Contract-only bookings are a first-class valid state in V2.

---

## 15. Final Architecture Statement

The V2 Essentials architecture for Neuron OS is:

- `booking` is the atomic financial unit for service work
- `project` and `contract` are work containers
- `billing_line_items` and `expenses` originate from bookings
- `invoice` is a single-customer packaging document over booking-owned charges
- `collection` records cash against invoices
- all profitability above booking level is derived by aggregation

This architecture fits all currently stated Essentials business rules while leaving a clean extension path for Full Suite.
