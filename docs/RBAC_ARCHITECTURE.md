# RBAC Architecture

## Purpose

This document defines the target access-control architecture for Neuron. It is meant to guide the redesign of Access Profiles so they are flexible enough for cross-department workflows, but structured enough to prevent broken product states such as clickable tabs with no visible content.

The core decision is:

> Access cascades by default. Parent access grants normal child access unless a child is explicitly denied.

This gives admins a simple default model while preserving precise control.

## Problem Summary

The current access system is powerful but too flat. It stores permissions as individual keys such as:

```text
acct_contracts:view
acct_contracts_billings_tab:view
acct_contracts_expenses_tab:view
```

The product experience, however, is hierarchical:

```text
Accounting
  Contracts
    Contract Detail
      Dashboard
      Operations
      Accounting
      Collaboration
```

Some UI surfaces are permission-controlled, while others are hard-coded display groups. This creates invalid states:

```text
User can open Accounting > Contracts
User cannot view any Accounting child tabs inside the contract detail
Accounting category still appears
Clicking it shows a blank content area
```

The issue is not that RBAC exists. The issue is that RBAC does not yet model every clickable product surface consistently.

## Design Principles

1. Every clickable surface must be permission-backed or derived from permission-backed children.
2. Parent access cascades to child views by default.
3. Explicit denies override inherited grants.
4. Feature access and data scope are separate concerns.
5. A user's home department provides defaults, not hard boundaries.
6. Cross-department access is normal and must be explicit.
7. Access Profiles should prevent or warn about product-invalid configurations.
8. Runtime UI should render from resolved access, not from hard-coded assumptions.
9. Route access, sidebar access, tabs, actions, and data visibility should all use the same resolved access model.

## Core Concepts

### Identity

Identity describes who the user is organizationally.

```text
department: Business Development
role: staff
team: Sales Team A
position: Business Development Officer
```

Identity should provide default profile selection and workflow context. It should not be treated as the only source of access.

For example, a BD officer may receive access to Accounting modules without changing departments.

### Feature Access

Feature access controls what product surfaces and actions the user can use.

Examples:

```text
bd_contracts:view
bd_contracts:edit
acct_contracts:view
acct_contracts_billings_tab:view
acct_financials:view
accounting_financials_collections_tab:export
```

Feature access answers:

```text
Can the user open this module?
Can the user see this tab?
Can the user press this action?
Can the user approve this workflow?
```

### Data Scope

Data scope controls which records the user can see after the feature is available.

Examples:

```text
own
team
department
selected_departments
company_wide
assigned_records
```

Data scope answers:

```text
Which contracts can this user see?
Which customers are visible?
Which accounting records are in scope?
```

Feature access and data scope must not be collapsed into one idea.

Example:

```text
Feature access: Contracts view
Data scope: Department Wide
```

This means the user can open Contracts and see department-wide contract records. It does not automatically mean the user can see every accounting tab or every company record.

### Explicit Deny

An explicit deny removes access inherited from a parent grant.

Example:

```text
acct_contracts:view = true
acct_contracts_billings_tab:view = inherited true
acct_contracts_expenses_tab:view = false
```

The user can open Accounting Contracts and see most default contract tabs, but Expenses is hidden.

## Cascading Access Model

Access should resolve in this order:

```text
1. Start with role/default profile grants
2. Apply parent-to-child cascading grants
3. Apply profile-specific explicit grants
4. Apply explicit denies
5. Apply user-specific overrides
6. Validate the resolved tree
```

The final output should be a resolved access tree, not just a flat dictionary.

### Parent View Cascade

Granting a parent `view` should grant default child `view` permissions.

Example:

```text
acct_contracts:view
```

Should normally imply:

```text
acct_contracts_all_tab:view
acct_contracts_active_tab:view
acct_contracts_expiring_tab:view
acct_contracts_financial_overview_tab:view
acct_contracts_quotation_tab:view
acct_contracts_rate_card_tab:view
acct_contracts_bookings_tab:view
acct_contracts_billings_tab:view
acct_contracts_invoices_tab:view
acct_contracts_collections_tab:view
acct_contracts_expenses_tab:view
acct_contracts_attachments_tab:view
acct_contracts_comments_tab:view
acct_contracts_activity_tab:view
```

Any child can then be explicitly removed.

### Action Cascade

Actions should cascade more carefully than `view`.

Recommended rule:

```text
view cascades by default
create/edit/approve/delete/export cascade only when the parent action is explicitly granted
```

Example:

```text
acct_contracts:edit
```

May imply edit capability for normal editable child areas, but sensitive children can opt out from automatic action cascade.

Some actions may be invalid for some surfaces. For example, `delete` may not make sense on a report tab. The schema should define applicable actions per node.

### View Foundation Rule

Any non-view action should require view access.

Invalid:

```text
acct_contracts:edit = true
acct_contracts:view = false
```

The editor should either auto-add view or warn/block the configuration.

## Product Access Tree

The access schema should model the product hierarchy users actually experience.

Example for Contracts:

```text
Accounting
  Contracts
    List
      All
      Active
      Expiring
    Detail
      Dashboard
        Financial Overview
        Quotation
        Rate Card
      Operations
        Bookings
      Accounting
        Billings
        Invoices
        Collections
        Expenses
      Collaboration
        Attachments
        Comments
        Activity
```

The important addition is that visual categories such as Dashboard, Operations, Accounting, and Collaboration are part of the access tree, even if they do not store data themselves.

They may be:

```text
explicit permission nodes
```

or:

```text
derived visible when at least one child is visible
```

The recommended approach is derived visibility for display-only groups:

```text
Category visible = at least one child tab is visible
```

## Cross-Department Modules

Some business objects are inherently cross-departmental:

```text
Inquiries
Projects
Contracts
Bookings
Customers
Invoices
Collections
Expenses
```

These should not be treated as belonging exclusively to one department. Instead, they should be modeled as shared objects with departmental lenses.

Example:

```text
Contract object
  BD lens
  Pricing lens
  Operations lens
  Accounting lens
```

Each lens can expose different tabs and actions.

```text
BD Contract Lens
  customer context
  quotation context
  collaboration

Accounting Contract Lens
  billings
  invoices
  collections
  expenses
  financial overview

Operations Contract Lens
  linked bookings
  booking execution status
```

The same underlying record can be visible through multiple lenses.

## Home Department Is Not A Wall

A user's department should answer:

```text
What defaults should they get?
What workflow context do they belong to?
Which records count as department-owned?
```

It should not answer:

```text
What are they permanently forbidden from accessing?
```

Cross-department access should be explicit through the profile.

Example:

```text
User: BD Officer
Home Department: Business Development

Feature grants:
  bd_contracts:view
  acct_contracts:view
  acct_contracts_billings_tab:view

Data scopes:
  BD Contracts: department
  Accounting Contracts: selected_departments or assigned_records
```

This allows a BD officer to access accounting modules without changing their identity.

## Per-Module Data Scope

Long term, data scope should be configurable per module or module family.

Current simple model:

```text
User has one visibility scope
```

Target model:

```text
Default data scope: department

Overrides:
  bd_contracts: department
  acct_contracts: selected_departments
  acct_financials: assigned_records
  exec_activity_log: company_wide
```

This is critical because cross-department feature access does not always mean cross-company data visibility.

## Example: Rovilyn

Scenario:

```text
Rovilyn
Department: Business Development
Role: Staff
Data scope: Department Wide
```

Target configuration:

```text
Profile: BD Staff - Department Contracts

Feature access:
  bd_contracts:view = true

Inherited child access:
  bd_contracts list and detail tabs = true by default

Explicit denies:
  bd_contracts_expenses_tab:view = false
  bd_contracts_collections_tab:view = false

Data scope:
  bd_contracts = department
```

Product result:

```text
She sees Contracts.
She sees department-wide contract records.
She sees all default allowed contract tabs.
Hidden tabs do not appear.
No clickable blank category appears.
```

If she also needs Accounting access:

```text
Additional feature grants:
  acct_contracts:view = true
  acct_contracts_billings_tab:view = true

Accounting data scope:
  acct_contracts = selected_departments: Business Development
```

Product result:

```text
She can access Accounting > Contracts.
She only sees the accounting contract surfaces granted to her.
She only sees accounting contract data inside her configured scope.
```

## Validation Rules

The Access Profile editor should validate the resolved profile before save.

### Required Validation

```text
Visible module must have a valid default route or at least one visible child view.
Visible detail page must have at least one visible detail tab.
Visible category must have at least one visible child tab.
Visible tab must have renderable content.
Create/edit/approve/delete/export should require view.
Sidebar-visible page must map to a real permission node.
Deep-linked forbidden tab must fall back to the first permitted tab or show no-access state.
```

### Warnings

```text
Module has view access but all child tabs are explicitly denied.
User has cross-department feature access but no matching data scope.
User has export without company-wide or selected-department data scope.
User has approve access but no relevant pending queue visibility.
Profile target department and granted modules are unusual but allowed.
```

Warnings should not always block save, because flexible RBAC needs exceptions. But they should be visible and deliberate.

## Runtime Rendering Rules

The frontend should render from resolved access.

### Sidebar

```text
Show section if at least one child module is visible.
Show module if its resolved view is true.
```

### Page

```text
Allow route if module view is true.
Choose default tab from the first visible child tab.
```

### Grouped Tabs

```text
Show category if at least one child tab is visible.
Click category selects first visible child tab.
Do not select a hidden child tab.
```

### Deep Links

```text
If requested tab is visible, open it.
If requested tab is hidden, open first visible tab.
If no tabs are visible, show explicit no-access state.
```

### Actions

```text
Show action only if resolved action permission is true.
If action is blocked by data state, show disabled state with reason.
```

## Access Profile Editor Requirements

The editor should support:

```text
Hierarchical tree view
Cascade indicators
Explicit deny indicators
Per-module data scope
Cross-department grants
Validation summary
Preview as profile/user
Diff from default profile
Search by module, tab, action, and department
```

### Suggested UI States

Each permission cell should distinguish:

```text
Inherited allow
Inherited deny
Explicit allow
Explicit deny
Not applicable
Validation warning
```

This matters because admins need to understand whether access is coming from the parent, from the default role profile, or from a manual override.

## Resolved Access Output

The application should consume a resolved tree similar to:

```ts
type ResolvedAccessNode = {
  id: string;
  label: string;
  type: "department" | "module" | "category" | "tab" | "action";
  visible: boolean;
  actions: {
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    approve?: boolean;
    delete?: boolean;
    export?: boolean;
  };
  source: "inherited" | "explicit_allow" | "explicit_deny" | "default";
  dataScope?: DataScope;
  children: ResolvedAccessNode[];
};
```

The exact TypeScript shape can change, but the product requirement is stable:

```text
The UI should not have to guess whether a surface should appear.
It should ask the resolved access tree.
```

## Database Enforcement

Frontend RBAC is not enough.

The database should enforce the same model for sensitive reads and writes.

Target database rules:

```text
current_user_has_module_permission(module_id, action)
current_user_data_scope(resource)
record_is_in_user_scope(record, resource)
```

Frontend rules prevent confusing UX. Database rules prevent unauthorized access.

Both need to agree on the same permission IDs and scope model.

## Migration Strategy

### Phase 1: Document and Freeze the Access Contract

Create a canonical access tree that includes:

```text
modules
routes
list tabs
detail categories
detail tabs
actions
data scope defaults
```

No UI should introduce a new clickable surface outside this tree.

### Phase 2: Resolve Cascading Permissions

Build a resolver that takes:

```text
default profile
applied profile
user overrides
explicit denies
data scopes
```

and returns a resolved access tree.

### Phase 3: Add Validation

Add profile validation before save and before applying a profile to users.

Start with warnings, then make severe invalid states blocking.

### Phase 4: Migrate UI Rendering

Update modules incrementally:

```text
Sidebar
Contracts
Projects
Inquiries
Accounting Financials
Bookings
Customers
```

Each screen should consume resolved access for navigation and actions.

### Phase 5: Add Preview and Audit Tools

Admins should be able to select a profile or user and see:

```text
visible sidebar
reachable routes
visible tabs
available actions
data scope
validation warnings
```

### Phase 6: Strengthen Database Policies

Move sensitive table reads and writes to the same module/action/scope model.

## Non-Goals

This architecture does not require every user to be hand-configured.

The goal is:

```text
Defaults handle the normal case.
Inheritance handles most child access.
Explicit denies handle exceptions.
Per-module scopes handle cross-department complexity.
Validation prevents broken states.
```

## Final Product Rule

The access profile system should make this true:

> If a user can click something, they can see a meaningful result. If they should not see the result, they should not see the click target.

That rule is the practical test for whether the RBAC architecture is working.

