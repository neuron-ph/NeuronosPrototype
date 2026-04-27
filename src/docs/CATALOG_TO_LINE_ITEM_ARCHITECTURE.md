# Catalog To Line-Item Architecture

**Status:** Planned  
**Scope:** System-wide architecture brief for Billing, Expenses, Quotations, Contracts, and related line-item creation flows  
**Last Updated:** 2026-04-25

---

## 1. Feature Summary

Neuron will use Catalog as the single source of truth for all selectable line items.

- Revenue-side flows must source from `Billing Catalog`
- Cost-side flows must source from `Expenses Catalog`
- Contracts must also source from `Billing Catalog`

This architecture is meant to remove cross-module inconsistency while keeping Catalog itself user-defined and low-friction.

---

## 2. Primary User Action

When adding a line item anywhere in the system, the user should:

1. Choose or create a category in the correct catalog domain
2. Choose or create an item inside that category
3. Continue entering transaction-specific metadata without leaving the current form

The interaction must behave the same way across all applicable modules.

---

## 3. Design Direction

This system should feel:

- Strict
- Predictable
- Low-friction
- Consistent across modules

Catalog should remain simple and user-defined. Business logic such as pricing rules, contract metadata, accounting logic, and workflow behavior should live outside the core catalog taxonomy.

---

## 4. Canonical Rules

### 4.1 Catalog Domains

Catalog has exactly two domains:

- `Billing`
- `Expenses`

These are separate domains in both UI and rules.

### 4.2 Category Rules

- Categories are user-defined
- A category belongs to exactly one domain
- Category names may duplicate within the same domain
- Duplicate warnings should be shown, but duplicates are allowed
- Categories can be created inline from forms
- Categories become immediately global after creation
- Categories can be archived
- Categories are never deleted
- Archiving a category auto-archives its items

### 4.3 Item Rules

- Items are user-defined
- An item belongs to exactly one category
- An item therefore belongs to exactly one domain
- Items cannot exist without a category
- Item names may duplicate
- Duplicate warnings should use exact match and near-match detection
- Items can be created inline from forms
- Items become immediately global after creation
- Items cannot be moved to another category after creation
- Items can be archived
- Items are never deleted

### 4.4 Historical Integrity Rules

- Historical records must not rely on live catalog names for display
- Historical records should render from saved snapshot fields
- Renaming a category or item affects future selection only
- Archived categories/items disappear from new pickers
- Old records continue showing plain snapshot text

---

## 5. Source-Of-Truth Rules By Surface

### 5.1 Billing / Revenue Side

All revenue-facing line items must source from `Billing Catalog`, including:

- Quotations
- Contract quotations
- Project billings
- Manual billing entries
- Auto-generated billing from bookings or contracts

### 5.2 Expense / Cost Side

All cost-facing line items must source from `Expenses Catalog`, including:

- E-vouchers
- Approved expense flows
- Future cost-side line-item capture surfaces

### 5.3 Contracts

Contracts must use `Billing Catalog` items.

Contract rate rows should no longer depend on a separate contract-only charge registry. Instead, they should:

1. Choose or create a Billing category
2. Choose or create a Billing item
3. Store contract-specific metadata outside Catalog

---

## 6. Data Model Boundary

Catalog is a pure taxonomy. It should only represent:

- Domains
- Categories
- Items
- Archival state
- Basic admin/display metadata

It should not become the place where rate behavior, units, tax defaults, workflow rules, or accounting mappings are stored.

### 6.1 Core Catalog Entities

#### `catalog_categories`

Recommended responsibilities:

- `id`
- `domain` (`billing` or `expense`)
- `name`
- `is_archived`
- ordering / audit fields

#### `catalog_items`

Recommended responsibilities:

- `id`
- `category_id`
- `name`
- `is_archived`
- ordering / audit fields

### 6.2 Transactional Line Item Persistence

Every persisted transactional line item should store:

- `catalog_item_id`
- `catalog_item_name_snapshot`
- `catalog_category_id_snapshot`
- `catalog_category_name_snapshot`
- `catalog_domain_snapshot`

These snapshot fields protect historical readability even if catalog names change later or records are archived.

---

## 7. Usage Counting Rules

Catalog usage must reflect committed business events only.

### 7.1 Billing Usage

Billing item usage counts only when the related billing is invoiced.

The following do **not** count as usage:

- Quotations
- Contract quotations
- Draft billing lines
- Uninvoiced billing records

### 7.2 Expense Usage

Expense item usage counts only when the related e-voucher is approved.

The following do **not** count as usage:

- Draft expense lines
- Unapproved e-vouchers

### 7.3 Usage Display

- Usage should be shown at item level only
- No usage should be counted for newly created categories or items until a committed business event occurs

---

## 8. UX Model

### 8.1 Selection Flow

The required upstream UX pattern is:

1. Select or create category
2. Select or create item within that category
3. Enter transaction-specific fields

This category-first flow should be consistent across all modules, including Contracts.

### 8.2 Inline Creation

Inline creation should use a structured mini-flow rather than a raw quick-add.

The mini-flow should allow users to:

- Create a new category without leaving the form
- Create a new item without leaving the form
- Receive duplicate warnings during creation

### 8.3 Duplicate Warnings

Warnings should be informational, not blocking.

Matching should include:

- Exact match
- Near-match

### 8.4 Archived Records

For simplicity:

- Archived categories/items should disappear from new pickers
- Historical records should continue displaying their saved snapshot text
- No special archived badge is required for historical rows

---

## 9. Contracts: Catalog vs Metadata Boundary

Contracts should use Billing catalog items as the canonical line-item reference.

However, contract-specific behavior should live outside Catalog, such as:

- Rate values
- Mode columns
- Succeeding-rate rules
- Grouping/display metadata
- Any contract-only calculation logic

This preserves a clean separation:

- `Catalog` = item master / taxonomy
- `Contract metadata` = pricing behavior and contract-specific configuration

---

## 10. Future-Safe Metadata Layer

Catalog should stay clean even if the product later needs smarter behavior.

If future features require richer semantics, they should be implemented through side tables or optional metadata layers, not by overloading the core catalog tables.

Examples of metadata that should live outside core Catalog:

- Reporting mappings
- Contract pricing behavior
- Workflow hints
- Billing defaults
- Expense defaults
- Tax or presentation helpers

### Why this matters

- Keeps Catalog user-defined and flexible
- Prevents schema clutter in the item master
- Allows Contracts, Billing, Expenses, and Reporting to evolve independently
- Preserves the principle that Catalog is a pure taxonomy

Recommended long-term model:

- `Catalog` = pure taxonomy
- `Transactional lines` = committed business records linked to Catalog
- `Optional metadata layers` = separate systems attached only when needed

---

## 11. Rollout Strategy

This should not be implemented as a one-shot migration.

Recommended phased rollout:

### Phase 1: Canonical Contract

- Define the shared catalog architecture contract
- Lock domain rules, archival rules, and usage rules
- Standardize transactional persistence requirements

### Phase 2: Shared Picker / Creation Flow

- Build one shared category-first picker pattern
- Build one shared structured inline creation mini-flow
- Ensure duplicate warning behavior is consistent everywhere

### Phase 3: Billing-Side Adoption

- Convert all revenue-side forms to Billing Catalog
- Ensure all writes persist `catalog_item_id` and snapshot fields

### Phase 4: Expense-Side Adoption

- Convert all expense-side forms to Expenses Catalog
- Ensure all writes persist `catalog_item_id` and snapshot fields

### Phase 5: Contract Adoption

- Replace contract-only charge registry behavior
- Use Billing Catalog items for contract rate rows
- Keep contract metadata outside core Catalog

### Phase 6: Usage Counting

- Add committed-only usage counting
- Count Billing usage only at invoice time
- Count Expense usage only at approved e-voucher time

### Phase 7: Archive Consistency

- Ensure archived categories/items disappear from new pickers
- Ensure historical rows remain readable through snapshots

### Phase 8: Later Admin Enhancements

- Duplicate cleanup tools
- Merge flows
- Taxonomy hygiene tools

These are explicitly later-phase concerns.

---

## 12. Main Risks To Guard Against

### 12.1 Admin Friction

The architecture must not introduce heavy admin dependency for everyday line-item creation.

### 12.2 Cross-Module Inconsistency

The biggest product risk is hidden divergence:

- one module using Catalog
- another module using hardcoded registries
- another writing names without `catalog_item_id`

This architecture succeeds only if the same source-of-truth rules apply everywhere.

### 12.3 Inflated Usage Counts

Usage counts must not be polluted by drafts, quotations, contracts, or unapproved transactions.

### 12.4 Historical Breakage

Past records must remain readable even after rename or archive actions.

---

## 13. Final Principle

System-wide invariant:

- If it is a revenue line, it must come from `Billing Catalog`
- If it is a cost line, it must come from `Expenses Catalog`
- Catalog is the only source of truth for selectable line items
- Catalog remains a pure taxonomy
- Committed usage only counts after invoice or approval

This is the foundation for a consistent catalog-to-line-item architecture across Neuron.
