# Department QA Plan for Neuron OS

## Summary

This document defines the department-by-department QA approach for Neuron OS.

The program is:

- Audit-first
- Functional-first
- Parallelized in controlled batches
- Explicitly user-directed

The goal is to determine which departments, modules, and critical flows are truly functional, partially functional, broken, or blocked without wasting tokens or over-expanding scope.

## Control Rules

Marcus remains in control of all QA execution.

These rules are mandatory:

- Do not run any QA wave for any department unless Marcus explicitly tells the agent to run QA for that department.
- Do not run Chrome DevTools MCP unless Marcus explicitly tells the agent to use Chrome DevTools MCP.
- Do not auto-advance from one department to the next without explicit user instruction.
- Do not expand a department QA pass into cross-department execution unless Marcus explicitly asks for that expansion.
- Do not convert this plan into autonomous recurring QA unless Marcus explicitly requests that later.

Default interpretation:

- This document is a playbook, not standing permission to execute.
- Each department wave is opt-in.
- Chrome DevTools is opt-in.

## QA Topology

Use a 3-layer QA structure:

### 1. QA Conductor

The QA Conductor is responsible for:

- Performing one-time discovery of routes, sidebar structure, shared hooks, utilities, and backend dependencies
- Preparing a scoped brief for the selected department
- Keeping the QA pass bounded to the requested department
- Summarizing results after each run

The QA Conductor does not automatically trigger other department waves.

### 2. Department QA Agents

Each department QA agent owns only:

- The department/module requested by Marcus
- The explicitly relevant shared dependencies for that department
- The critical routes, entities, and flows associated with that department

Each department QA agent must stay within scope and avoid broad repo-wide retesting.

### 3. Feature Triage Agents

Feature triage agents are only used when a department QA pass finds:

- A failure
- A partial result
- An unclear result
- A blocker requiring narrower diagnosis

They are optional and should be spawned only when useful.

## Department QA Units

Use the following department/domain units:

- Business Development
- Pricing
- Shared CRM
- Projects
- Inbox
- Contracts
- Operations
- Accounting
- Reports
- HR
- Admin

## Wave Order

Run QA in waves, but only when explicitly requested.

Recommended order:

### Wave 1: Front Office

- Business Development
- Pricing
- Shared CRM
- Projects
- Inbox

### Wave 2: Commercial Execution

- Contracts
- Operations

### Wave 3: Financial Control

- Accounting
- Reports

### Wave 4: Control and Administration

- HR
- Admin

Recommended batch size:

- Maximum 3 active department QA agents at once

This keeps token use, synthesis complexity, and test overlap under control.

## Default Testing Method

The default QA method is:

- Headless functional testing first

Use headless testing for:

- Route rendering
- Navigation
- CRUD and status-change flows
- Save/load roundtrips
- Permissions behavior
- Backend data connectivity
- Critical cross-module handoff checks within the selected scope

## Chrome DevTools Policy

Chrome DevTools MCP is not the default testing engine.

Chrome DevTools MCP may only be used when Marcus explicitly instructs the agent to use it.

When approved, use Chrome DevTools only for cases such as:

- Visual or layout breakage
- Silent UI failures
- Console or network debugging
- Responsive issues
- Cases where headless testing passes but the interface still appears broken

Without explicit permission, do not use Chrome DevTools MCP.

## Write Policy

The application is connected to a real Supabase backend, so QA must use controlled writes.

Default write policy:

- Use dedicated QA accounts where possible
- Use clearly tagged QA records
- Prefer isolated, reversible records over editing ambiguous existing records
- Avoid deleting or overwriting records that may matter to normal workflows

Suggested record tagging pattern:

- `QA-<department>-<timestamp>`

If a flow cannot be tested safely using tagged records, mark it as blocked instead of improvising.

## Standard Department QA Pass

Each department QA pass should follow this structure:

### 1. Static Mapping

- Confirm entry routes
- Confirm main components
- Confirm relevant hooks, utilities, and backend dependencies
- Identify critical happy-path flows

### 2. Smoke Validation

- Department route opens
- Main list/detail page loads
- No immediate crash
- Basic navigation works

### 3. Functional Validation

- At least one critical create/edit/status-change flow where appropriate
- Save/load roundtrip
- Validation and error behavior
- Permission behavior
- Required linked flow checks within the requested department scope

### 4. Escalation

- If issues are found, narrow into feature-level triage
- Use Chrome DevTools only if Marcus explicitly authorizes it

## Department-Specific Expectations

### Business Development

Validate:

- Inquiry flows
- Task flows
- Activity flows
- Budget request entry paths
- Customer and project linkage

### Pricing

Validate:

- Quotation creation and editing
- Vendor pricing inputs
- Contract pricing inputs
- Quotation handoff readiness

### Shared CRM

Validate:

- Contact and customer search
- Autocomplete behavior
- Detail and edit flows
- Reuse by BD and Pricing

### Projects

Validate:

- Project detail rendering
- Project-linked financial entry points
- Links to invoices, collections, and related entities

### Inbox

Validate:

- Inbox rendering
- Assignment flows
- Entity picker behavior
- Record browser behavior
- File and message interactions

### Contracts

Validate:

- Contract list and detail
- Rate card behavior
- Booking-from-contract entry path

### Operations

Validate:

- Booking creation by service type
- Booking detail edit flows
- Save/load behavior
- Operations report rendering

### Accounting

Validate:

- Transactions
- E-vouchers
- Billings
- Invoices
- Collections
- Expenses
- Financial summary and linkage behavior

### Reports

Validate:

- Report rendering
- Filters and date ranges
- Source data consistency

### HR

Validate:

- Employee-facing or HR-specific actions
- HR route stability
- Relevant edit and profile flows

### Admin

Validate:

- Restricted views
- Role-sensitive controls
- Administrative actions and access behavior

## Cross-Module Handoff Checks

Run these only when Marcus asks for them or when they are explicitly part of the selected department brief:

- Business Development -> Pricing
- Pricing -> Project or Contract
- Contract -> Operations booking
- Project or Booking -> Accounting billing, invoice, collection
- Operational and financial modules -> Reports
- Front-office entities -> Inbox entity picker or record browser

## Result Format

Each department QA run should output a compact result in this format:

```md
Department:
Status: pass | partial | fail | blocked
Roles tested:
Routes tested:
Critical flows tested:
Writes performed:
Failures:
Cross-module findings:
Recommended triage:
```

## Status Definitions

### Pass

- Core route renders
- Main data loads
- Critical flow completes
- No meaningful blocker discovered

### Partial

- Main route works
- One or more important flows fail or remain uncertain

### Fail

- Main route crashes
- Critical workflow cannot complete
- Data path is materially broken

### Blocked

- Missing role, data, environment, or safety constraints prevent valid testing

## Token Efficiency Rules

To avoid wasting tokens:

- Perform discovery once, not separately for every department
- Limit active department QA agents to 3 at a time
- Use headless testing by default
- Use Chrome DevTools only by explicit instruction
- Use compact structured outputs
- Spawn feature triage agents only when needed
- Avoid re-testing shared functionality from scratch if it was already established in the same run context

## Execution Policy

This plan does not authorize autonomous execution.

Operational rule:

- The agent may prepare, inspect, and discuss the next department QA pass at any time.
- The agent may only execute that pass when Marcus explicitly says to run QA for that department.
- The agent may only invoke Chrome DevTools MCP when Marcus explicitly says to use Chrome DevTools MCP.

This is the standing control model unless Marcus changes it later.
