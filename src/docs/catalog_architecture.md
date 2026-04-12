# Catalog System — Full Architecture
**Overhauled: 2026-04-12 | Status: Complete (All 6 Phases)**

---

## 1. Overview

The catalog is a **pure taxonomy** — a registry of line item names used across quotations, billing, and expenses. It is context-agnostic: the same item can be a charge (revenue side) or an expense (cost side) depending on where it's used.

The catalog system was overhauled in 6 phases to fix broken data pipes, unify a fragmented charge system, and enable end-to-end cost/revenue analytics.

---

## 2. Data Model

### catalog_categories

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g., `cat-freight` |
| `name` | TEXT | e.g., "Freight Charges" |
| `side` | TEXT | `revenue` \| `expense` \| `both` — filters which combobox contexts show this category's items |
| `sort_order` | INTEGER | Controls display order; wired to up/down arrows in admin UI |
| `is_default` | BOOLEAN | One category can be default (auto-expands on page load) |

### catalog_items

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g., `ci-freight-ocean` |
| `category_id` | TEXT FK | References `catalog_categories(id)` |
| `name` | TEXT | The item name (e.g., "Ocean Freight", "THC") |

### Linking Tables

| Table | FK Column | What It Links |
|---|---|---|
| `billing_line_items` | `catalog_item_id` | Revenue-side charges on invoices/billings |
| `evoucher_line_items` | `catalog_item_id` | Expense-side costs on E-Vouchers |

Both tables FK to `catalog_items(id) ON DELETE SET NULL`.

---

## 3. The Side System

Categories have a `side` column that determines where their items appear:

| Side | Where Items Show |
|---|---|
| `revenue` | Quotation line items, billing line items |
| `expense` | E-Voucher line items |
| `both` | Everywhere |

The `CatalogItemCombobox` accepts a `side` prop. Consumers pass:
- `side="revenue"` — quotation/billing contexts (`LineItemRow`, `UnifiedLineItemRow`, `UniversalPricingRow`)
- `side="expense"` — E-Voucher creation (`AddRequestForPaymentPanel`)
- No `side` prop — admin/management pages (show all)

---

## 4. Seeded Charge Categories (Revenue Side)

These 6 categories + 38 items replace the hardcoded `quotation-charges.ts`:

| Category | Items | Source |
|---|---|---|
| Freight Charges | Ocean Freight, Air Freight | `cat-freight` |
| Origin Local Charges | Pick up fee, CFS, CUS, DOCS, Handling Fee, FE Fee, THC, BL Fee, MBL Surrender Fee, Seal, IRF, Customs Clearance, Export Customs Fee, Add Broker, Gate Permission Receipt, Special Form A/I C/O | `cat-origin` |
| Destination Local Charges | Turn Over Fee, LCL Charges, Documentation Fee, THC, CIC, CRS, BL Fee, BBF, EEC, IRF, ECC, PSS, CHC | `cat-destination` |
| Reimbursable Charges | Warehouse Charges, Arrastre & Wharfage Due | `cat-reimbursable` |
| Brokerage Charges | Documentation Fee, Processing Fee, Brokerage Fee, Handling | `cat-brokerage` |
| Customs Duty & VAT | Duties & Taxes | `cat-customs` |

Items with the same name in different categories (e.g., "THC" in Origin vs Destination, "Documentation Fee" in Destination vs Brokerage) are intentionally separate catalog items with different IDs.

---

## 5. Data Pipes (Fixed)

### Quotation → Billing Merge

**Problem:** When quotation charges were merged into billing line items via `UnifiedBillingsTab`, the `catalog_item_id` was dropped.

**Fix:** Both merge paths (existing-item update and virtual-item creation) now copy `catalog_item_id: item.catalog_item_id` from the quotation line item.

**Chain:** `catalog_item_id` flows through → `catalog_snapshot` JSONB is auto-populated at save time → historical snapshot preserved.

### Usage Counts RPC

**Problem:** `get_catalog_usage_counts()` only queried `billing_line_items`. Expense-only items showed 0 usage.

**Fix:** Function now does `UNION ALL` across `billing_line_items` + `evoucher_line_items`.

### E-Voucher Line Items (Phase 0)

**Problem:** EV line items were stored as JSONB blob — couldn't FK `catalog_item_id` to a JSON array element.

**Fix:** Created relational `evoucher_line_items` table with `catalog_item_id` FK. Write path inserts into relational table. Read path joins with `evoucher_line_items(*)` and falls back to JSONB for old records.

---

## 6. CatalogItemCombobox

**Path:** `src/components/shared/pricing/CatalogItemCombobox.tsx`

Shared combobox used across all line item creation surfaces. Features:

- **Portal-based dropdown** — `position: fixed`, `z-index: 9999`, scroll-repositioning (matches CustomDropdown pattern)
- **Module-level cache** — 60-second TTL, shared across all instances
- **Quick-create** — one-click "Add [name]" button when no exact match exists
- **Fuzzy duplicate detection** — before quick-create, checks for similar names (substring match + Levenshtein ≤ 2). Shows confirmation dialog if similar items found.
- **Side filtering** — optional `side` prop filters items by category side
- **Category side cache** — fetches `catalog_categories.side` alongside items for client-side filtering

### Props

```typescript
interface CatalogItemComboboxProps {
  value: string;
  catalogItemId?: string;
  serviceType?: string;
  side?: "revenue" | "expense" | "both";
  onChange: (description: string, catalogItemId?: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

### Usage Sites

| File | Context | Side |
|---|---|---|
| `AddRequestForPaymentPanel.tsx` | E-Voucher line items | `expense` |
| `LineItemRow.tsx` | Quotation line items | `revenue` |
| `UnifiedLineItemRow.tsx` | Quotation line items | `revenue` |
| `UniversalPricingRow.tsx` | Universal pricing row | `revenue` |
| `CatalogManagementPage.tsx` | Admin (types only) | — |

---

## 7. CatalogManagementPage

**Path:** `src/components/accounting/CatalogManagementPage.tsx`

Admin page under Accounting with two tabs: **Items** and **Rate Matrix**.

### Items Tab Features

- Category-grouped view with collapse/expand
- Search/filter by name or category
- Inline editing of item names and category assignment
- Category CRUD (create, rename, delete)
- **Merge tool** — checkbox selection on items, "Merge N Items" button. Pick survivor → re-links all `billing_line_items` + `evoucher_line_items` references → deletes merged items
- **Category sort order** — up/down arrow buttons on category headers, swaps sort_order values
- **Default category toggle** — star icon on category headers, only one default at a time
- Delete with impact analysis — shows referenced billing lines + expenses, optional re-link before delete

### Rate Matrix Tab (ChargeExpenseMatrix)

Pivot table: bookings as rows, catalog items as columns.

**Three views:**

| View | Data Source | Shows |
|---|---|---|
| Revenue | `billing_line_items` | Revenue per catalog item per booking |
| Expense | `evoucher_line_items` | Cost per catalog item per booking |
| Margin | Both | Revenue minus cost per catalog item per booking |

Additional features: period navigator, service type filter, CSV export, meta chips (bookings count, line items count, linked percentage).

---

## 8. Database Migrations Applied

| # | Migration | What |
|---|---|---|
| 031 | `evoucher_line_items` | Relational EV line items table with `catalog_item_id` FK |
| 032 | `catalog_usage_counts_v2` | Usage RPC now UNION ALLs billing + expense line items |
| 033 | `catalog_categories_side` | Added `side` column to categories |
| 034 | `seed_quotation_charges` | 6 categories + 38 items seeded from hardcoded list |

---

## 9. Retired / Deleted Code

| Item | Action |
|---|---|
| `src/constants/quotation-charges.ts` | Deleted — charges now in DB |
| `ChargeItemDropdown.tsx` | Deleted — replaced by `CatalogItemCombobox` |
| `CategoryDropdown.tsx` | Updated — now fetches categories from DB instead of hardcoded list |
| `evouchers.catalog_item_id` (header column) | Dead column — catalog linkage is now at `evoucher_line_items` level |

---

## 10. Key Components

| Component | Path | Purpose |
|---|---|---|
| `CatalogItemCombobox` | `src/components/shared/pricing/` | Shared combobox with quick-create, fuzzy dedup, side filter |
| `CatalogManagementPage` | `src/components/accounting/` | Admin CRUD + merge tool + sort/default controls |
| `ChargeExpenseMatrix` | `src/components/accounting/` | Revenue/Expense/Margin pivot table |
| `CategoryDropdown` | `src/components/pricing/quotations/` | DB-driven category picker for charge categories |

---

## 11. Future Considerations

- **Expense-side categories** — currently all seeded categories are `side='revenue'`. When Accounting defines expense-specific categories (e.g., "Office Supplies", "Travel"), seed them with `side='expense'`.
- **Catalog item deduplication** — the merge tool handles manual dedup. A future phase could add scheduled duplicate scanning.
- **`liquidation_submissions.line_items`** — still JSONB. Could migrate to relational `liquidation_line_items` table with `catalog_item_id` FK for receipt-level catalog tracking.
- **Unique constraint on name** — `catalog_items.name` has no UNIQUE constraint. Intentional (same name can exist in different categories), but the fuzzy detection catches accidental duplicates.
