/**
 * Contract Rate Instantiation Engine
 *
 * Applies a contract rate matrix to actual booking quantities,
 * producing AppliedRate[] for auto-billing.
 *
 * Handles:
 * - Unit-based multiplication (per_container, per_shipment, per_bl, per_set)
 * - Succeeding rate rules (first N at base rate, remainder at lower rate)
 * - Mode-column selection (FCL / LCL / AIR)
 * - Zero-quantity suppression (don't bill rows with no applicable quantity)
 * - Selection-group filtering (mutually exclusive alternative rows)
 *
 * @see /docs/blueprints/CONTRACT_QUOTATION_BLUEPRINT.md - Phase 5, Task 5.1
 * @see /docs/blueprints/SELECTION_GROUP_BLUEPRINT.md
 */

import type { ContractRateMatrix, ContractRateRow, AppliedRate, SellingPriceCategory, SellingPriceLineItem } from "../types/pricing";

// ============================================
// INPUT TYPES
// ============================================

/**
 * Quantities provided by the booking for rate calculation.
 * Not every field is required — the engine uses whichever are relevant
 * based on each row's `unit` field.
 */
export interface BookingQuantities {
  /** Number of containers (for FCL bookings, trucking trips, etc.) */
  containers?: number;
  /** Number of shipments — typically 1 per booking */
  shipments?: number;
  /** Number of bills of lading */
  bls?: number;
  /** Number of sets (documents, stamps, etc.) */
  sets?: number;
  /** Generic fallback quantity */
  quantity?: number;
}

/**
 * Facts the booking declares about what services it actually consumed.
 * Used by the engine to gate `applies_when`-tagged rate-card rows so optional
 * fees (examinations, processing permits) only appear when the booking opted in.
 *
 * Values are matched case-insensitively against `RateRowTrigger.value`.
 */
export interface BookingFacts {
  /** Examination types performed (e.g., ['X-ray']). From booking.examinations[].type. */
  examinations?: string[];
  /** Permits/clearances declared (e.g., ['BAI', 'SRA']). From booking.permits[]. */
  permits?: string[];
}

/** Case-insensitive trim helper for fact matching. */
function normalizeFact(s: string): string {
  return (s ?? '').trim().toUpperCase();
}

// ============================================
// HELPERS
// ============================================

/** Map unit strings to the relevant quantity field */
function getQuantityForUnit(unit: string, quantities: BookingQuantities): number {
  switch (unit) {
    case "per_container":
      return quantities.containers ?? quantities.quantity ?? 1;
    case "per_shipment":
      return quantities.shipments ?? 1;
    case "per_bl":
      return quantities.bls ?? 1;
    case "per_set":
      return quantities.sets ?? quantities.quantity ?? 1;
    case "per_entry":
      // One customs entry per shipment. Without this case the row silently
      // billed × containers — see Phase 1 fix in the category-dispatch refactor.
      return quantities.shipments ?? 1;
    case "flat":
      // Flat fees apply once regardless of booking shape.
      return 1;
    default:
      // Fallback: try containers, then generic, then 1.
      // `per_kg` and `per_cbm` deliberately not handled here yet — they need
      // structured weight/volume on bookings (deferred from Phase 1).
      return quantities.containers ?? quantities.quantity ?? 1;
  }
}

/** Format a currency amount for display */
function formatPeso(amount: number): string {
  return `P${amount.toLocaleString("en-PH")}`;
}

// ============================================
// CORE ENGINE
// ============================================

/**
 * Calculate the subtotal and human-readable breakdown for a single rate row.
 */
function calculateRowRate(
  row: ContractRateRow,
  rate: number,
  quantity: number
): { subtotal: number; rule_applied: string } {
  if (quantity <= 0 || rate <= 0) {
    return { subtotal: 0, rule_applied: "N/A" };
  }

  const rule = row.succeeding_rule;

  if (rule && rule.after_qty > 0 && quantity > rule.after_qty) {
    // Succeeding rule applies
    const baseQty = rule.after_qty;
    const succeedingQty = quantity - baseQty;
    const succeedingRate = rule.rate;
    const subtotal = baseQty * rate + succeedingQty * succeedingRate;
    const rule_applied = `${baseQty} x ${formatPeso(rate)} + ${succeedingQty} x ${formatPeso(succeedingRate)}`;
    return { subtotal, rule_applied };
  }

  // Simple multiplication — no succeeding rule
  const subtotal = quantity * rate;
  const rule_applied = `${quantity} x ${formatPeso(rate)}`;
  return { subtotal, rule_applied };
}

/**
 * Apply a single rate matrix to booking quantities for a given mode column.
 *
 * @param matrix - The contract rate matrix for one service type
 * @param modeColumn - Which column to use (e.g., "FCL", "LCL / AIR")
 * @param quantities - Actual quantities from the booking
 * @param selections - Optional: maps selection_group → selected particular/charge_type_id
 *                     for mutually exclusive alternative rows. @see SELECTION_GROUP_BLUEPRINT.md
 * @returns AppliedRate[] — one entry per non-zero row
 */
export function instantiateRates(
  matrix: ContractRateMatrix,
  modeColumn: string,
  quantities: BookingQuantities,
  selections?: Record<string, string>,
  facts?: BookingFacts,
): AppliedRate[] {
  const appliedRates: AppliedRate[] = [];

  // Build row-id → category-name map for carry-through into AppliedRate.
  // Falls back to "<ServiceType> Charges" if the matrix has no categories defined.
  const rowCategoryMap = new Map<string, string>();
  if (matrix.categories) {
    for (const cat of matrix.categories) {
      for (const r of cat.rows) {
        rowCategoryMap.set(r.id, cat.category_name);
      }
    }
  }
  const fallbackCategory = `${matrix.service_type} Charges`;

  // Validate the mode column exists
  if (!matrix.columns.includes(modeColumn)) {
    console.warn(
      `[RateEngine] Mode column "${modeColumn}" not found in matrix for ${matrix.service_type}. Available: ${matrix.columns.join(", ")}`
    );
    // Try a fuzzy match (e.g., "FCL" might match "FCL")
    const fuzzy = matrix.columns.find(
      (col) => col.toLowerCase().includes(modeColumn.toLowerCase())
    );
    if (fuzzy) {
      modeColumn = fuzzy;
    } else {
      return appliedRates; // Can't proceed
    }
  }

  for (const row of matrix.rows) {
    // ── Selection group filter: skip unselected alternative rows ──
    // Auto-derive selection_group from remarks for trucking rows (legacy data compat)
    const effectiveGroup = row.selection_group ||
      (matrix.service_type.toLowerCase() === "trucking" && row.remarks ? row.remarks : undefined);
    if (effectiveGroup && selections) {
      if (!(effectiveGroup in selections)) {
        continue; // This destination group wasn't selected at all → skip
      }
      const picked = selections[effectiveGroup];
      if (picked !== row.particular && picked !== row.charge_type_id) {
        continue; // Right destination, wrong truck type → skip
      }
    }

    // ── applies_when filter: skip rows whose trigger fact isn't declared ──
    // Orthogonal to selection_group. Rows without applies_when (or with
    // kind: 'always') pass through unchanged for backwards compatibility.
    if (row.applies_when && row.applies_when.kind !== 'always') {
      const { kind, value } = row.applies_when;
      if (!value) continue; // misconfigured row — skip rather than silently apply
      const factSet = kind === 'examination'
        ? (facts?.examinations ?? [])
        : (facts?.permits ?? []);
      const target = normalizeFact(value);
      if (!factSet.some((f) => normalizeFact(f) === target)) continue;
    }

    const rate = row.rates[modeColumn];
    if (rate === undefined || rate === null || rate === 0) continue;

    const quantity = getQuantityForUnit(row.unit, quantities);
    if (quantity <= 0) continue;

    const { subtotal, rule_applied } = calculateRowRate(row, rate, quantity);

    appliedRates.push({
      particular: row.particular,
      rate,
      quantity,
      subtotal,
      rule_applied,
      catalog_item_id: row.catalog_item_id,
      category: rowCategoryMap.get(row.id) ?? fallbackCategory,
    });
  }

  return appliedRates;
}

/**
 * Select the best mode column from the matrix based on the booking's mode.
 *
 * Booking modes are typically "FCL", "LCL", or "AIR".
 * Matrix columns might be "FCL", "LCL / AIR", etc.
 * This function handles the mapping.
 */
export function resolveModeColumn(
  matrixColumns: string[],
  bookingMode: string
): string | null {
  const mode = (bookingMode || "").toUpperCase().trim();

  // Direct match
  const direct = matrixColumns.find((col) => col.toUpperCase() === mode);
  if (direct) return direct;

  // Partial match (e.g., "LCL" matches "LCL / AIR")
  const partial = matrixColumns.find((col) =>
    col.toUpperCase().includes(mode)
  );
  if (partial) return partial;

  // If mode is "AIR", also match "LCL / AIR"
  if (mode === "AIR") {
    const airCol = matrixColumns.find((col) => col.toUpperCase().includes("AIR"));
    if (airCol) return airCol;
  }

  // Fallback: use first column
  return matrixColumns.length > 0 ? matrixColumns[0] : null;
}

/**
 * High-level convenience: given a full contract's rate matrices,
 * a service type, a mode, and quantities — produce the applied rates
 * and total amount.
 */
export function calculateContractBilling(
  rateMatrices: ContractRateMatrix[],
  serviceType: string,
  bookingMode: string,
  quantities: BookingQuantities,
  selections?: Record<string, string>,
  facts?: BookingFacts,
  containers?: BookingContainer[],
  deliveryAddress?: string,
): { appliedRates: AppliedRate[]; total: number } {
  // Find the matrix for this service type
  const matrix = rateMatrices.find(
    (m) => m.service_type.toLowerCase() === serviceType.toLowerCase()
  );

  if (!matrix) {
    console.warn(`[RateEngine] No rate matrix found for service type "${serviceType}"`);
    return { appliedRates: [], total: 0 };
  }

  // Resolve the mode column
  const modeColumn = resolveModeColumn(matrix.columns, bookingMode);
  if (!modeColumn) {
    console.warn(`[RateEngine] Could not resolve mode column for "${bookingMode}"`);
    return { appliedRates: [], total: 0 };
  }

  // Delegate to the category-dispatch entry point so preview output matches
  // what the apply path emits (otherwise preview shows pre-dispatch totals and
  // apply shows post-dispatch — confusing for the user).
  const appliedRates = generateContractBilling(matrix, modeColumn, {
    quantities,
    selections,
    facts,
    containers,
    deliveryAddress,
  });
  const total = appliedRates.reduce((sum, r) => sum + r.subtotal, 0);

  return { appliedRates, total };
}

// ============================================
// SELLING PRICE CONVERTER (Phase 2: Contract Rate Bridge)
// ============================================

/**
 * Map a unit string to a human-readable label for display in quotation.
 */
function unitToLabel(unit: string): string {
  switch (unit) {
    case "per_container": return "Container";
    case "per_shipment": return "Shipment";
    case "per_bl": return "B/L";
    case "per_set": return "Set";
    default: return "Unit";
  }
}

/**
 * Convert contract rate matrices into SellingPriceCategory[] format
 * that QuotationBuilderV3 can directly render.
 *
 * This is the "Standard Service Rates" bridge: contract rates flow into
 * a project quotation's selling price section.
 *
 * DRY: When `quantities` is provided, delegates to `calculateContractBilling()`
 * for all rate math (including tiered/succeeding rules), then converts the
 * `AppliedRate[]` output into `SellingPriceLineItem[]` shape.
 * When `quantities` is NOT provided, falls back to the original quantity=1 behavior
 * for backward compatibility.
 *
 * @param rateMatrices - Rate matrices from the contract
 * @param serviceType - Which service to extract (e.g., "Brokerage")
 * @param modeColumns - Which mode columns to include (e.g., ["FCL", "LCL / AIR"])
 *                      If not provided, uses ALL columns from the matrix
 * @param quantities - Optional: actual shipment quantities for rate calculation.
 *                     When provided, rates are calculated with real quantities
 *                     including tiered/succeeding rules.
 * @param selections - Optional: maps selection_group → selected particular/charge_type_id
 *                     for mutually exclusive alternative rows. @see SELECTION_GROUP_BLUEPRINT.md
 * @returns SellingPriceCategory[] ready for QuotationBuilderV3 selling_price state
 *
 * @see /docs/blueprints/CONTRACT_RATE_AUTOMATION_BLUEPRINT.md - Phase 2, Task 2.1
 */
export function contractRatesToSellingPrice(
  rateMatrices: ContractRateMatrix[],
  serviceType: string,
  modeColumns?: string[],
  quantities?: BookingQuantities,
  selections?: Record<string, string>
): SellingPriceCategory[] {
  // Find the matrix for this service type
  const matrix = rateMatrices.find(
    (m) => m.service_type.toLowerCase() === serviceType.toLowerCase()
  );

  if (!matrix) {
    console.warn(`[RateEngine] contractRatesToSellingPrice: No matrix for "${serviceType}"`);
    return [];
  }

  // Determine which columns to process
  const columns = modeColumns && modeColumns.length > 0
    ? modeColumns.filter((col) => matrix.columns.includes(col))
    : matrix.columns;

  if (columns.length === 0) {
    console.warn(`[RateEngine] contractRatesToSellingPrice: No valid columns found`);
    return [];
  }

  // Build one SellingPriceCategory per mode column
  const categories: SellingPriceCategory[] = columns.map((col) => {
    // ── Quantity-aware path: delegate to calculateContractBilling() for real math ──
    if (quantities) {
      const { appliedRates } = calculateContractBilling(
        rateMatrices,
        serviceType,
        col,
        quantities,
        selections
      );

      const lineItems: SellingPriceLineItem[] = appliedRates.map((applied) => {
        // Find the original row for metadata (unit, remarks)
        const originalRow = matrix.rows.find(
          (r) => r.particular === applied.particular
        );

        const itemId = `contract-${matrix.id}-${col}-${applied.particular.replace(/\s+/g, "-").toLowerCase()}`;

        return {
          id: itemId,
          description: applied.particular,
          price: applied.rate,
          currency: "PHP",
          quantity: applied.quantity,
          unit: unitToLabel(originalRow?.unit || "per_container"),
          unit_type: originalRow?.unit || "per_container",
          forex_rate: 1,
          is_taxed: false,
          remarks: applied.rule_applied || originalRow?.remarks || "",
          amount: applied.subtotal,
          service_tag: serviceType,
          service: serviceType,
          // SellingPriceLineItem-specific fields
          base_cost: 0,
          amount_added: applied.subtotal,
          percentage_added: 0,
          final_price: applied.rate,
          // ✨ RATE SOURCE TAGGING: marks this line item as contract-generated
          rate_source: "contract_rate" as const,
        };
      });

      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

      const categoryName = columns.length > 1
        ? `${serviceType} — ${col}`
        : `${serviceType} Charges`;

      return {
        id: `contract-cat-${matrix.id}-${col}`,
        category_name: categoryName,
        line_items: lineItems,
        subtotal,
        is_expanded: true,
      };
    }

    // ── Original path: quantity=1 for each row (backward-compatible) ──
    const lineItems: SellingPriceLineItem[] = [];

    for (const row of matrix.rows) {
      // Skip group headers
      if (row.group_label && !row.particular) continue;
      // Skip "At Cost" rows — they don't have fixed rates
      if (row.is_at_cost) continue;
      // ── Selection group filter: skip unselected alternative rows ──
      // Auto-derive selection_group from remarks for trucking rows (legacy data compat)
      const effectiveGroup = row.selection_group ||
        (matrix.service_type.toLowerCase() === "trucking" && row.remarks ? row.remarks : undefined);
      if (effectiveGroup && selections) {
        if (!(effectiveGroup in selections)) {
          continue; // This destination group wasn't selected at all → skip
        }
        const picked = selections[effectiveGroup];
        if (picked !== row.particular && picked !== row.charge_type_id) {
          continue;
        }
      }

      const rate = row.rates[col];
      if (rate === undefined || rate === null || rate <= 0) continue;

      const itemId = `contract-${matrix.id}-${col}-${row.id}`;

      lineItems.push({
        id: itemId,
        description: row.particular,
        price: rate,
        currency: "PHP",
        quantity: 1,
        unit: unitToLabel(row.unit),
        unit_type: row.unit,
        forex_rate: 1,
        is_taxed: false,
        remarks: row.remarks || row.unit.replace("per_", "Per "),
        amount: rate,
        service_tag: serviceType,
        service: serviceType,
        // SellingPriceLineItem-specific fields
        base_cost: 0,           // No buying price reference for contract rates
        amount_added: rate,     // Full rate is the "addition" since base_cost is 0
        percentage_added: 0,
        final_price: rate,
        // ✨ RATE SOURCE TAGGING: marks this line item as contract-generated
        rate_source: "contract_rate" as const,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

    // Category name: "Brokerage — FCL" or just "Brokerage" if single column
    const categoryName = columns.length > 1
      ? `${serviceType} — ${col}`
      : `${serviceType} Charges`;

    return {
      id: `contract-cat-${matrix.id}-${col}`,
      category_name: categoryName,
      line_items: lineItems,
      subtotal,
      is_expanded: true,
    };
  });

  // Filter out empty categories
  return categories.filter((cat) => cat.line_items.length > 0);
}

/**
 * Get all available mode columns from a contract's rate matrix for a service type.
 * Useful for the UI to show which columns the user can select.
 */
export function getContractModeColumns(
  rateMatrices: ContractRateMatrix[],
  serviceType: string
): string[] {
  const matrix = rateMatrices.find(
    (m) => m.service_type.toLowerCase() === serviceType.toLowerCase()
  );
  return matrix?.columns || [];
}

// ============================================
// MULTI-LINE TRUCKING ENGINE WRAPPERS (@see MULTI_LINE_TRUCKING_BLUEPRINT.md — Phase 1)
// ============================================

import type { TruckingLineItem, TruckingLineResult, MultiLineTruckingResult } from "../types/pricing";
import type { LineItemExtraction } from "./contractQuantityExtractor";

/**
 * Calculate billing for multiple trucking line items in a single pass.
 *
 * Thin wrapper: loops over pre-extracted line item data and calls the existing
 * `calculateContractBilling()` once per item. The core engine filter logic
 * stays completely untouched.
 *
 * @param rateMatrices - Contract rate matrices
 * @param bookingMode - Resolved mode column (same for all line items)
 * @param extractions - Pre-extracted { lineItem, selections, quantities } tuples
 *                      from `extractMultiLineSelectionsAndQuantities()`
 * @returns Aggregated result with per-line breakdowns and grand total
 *
 * @example
 * const extractions = extractMultiLineSelectionsAndQuantities(lineItems, matrices);
 * const result = calculateMultiLineTruckingBilling(matrices, "FCL", extractions);
 * // result.lineResults[0].subtotal => 30000
 * // result.lineResults[1].subtotal => 24000
 * // result.grandTotal => 54000
 */
export function calculateMultiLineTruckingBilling(
  rateMatrices: ContractRateMatrix[],
  bookingMode: string,
  extractions: LineItemExtraction[],
  facts?: BookingFacts,
): MultiLineTruckingResult {
  const lineResults: TruckingLineResult[] = extractions.map(({ lineItem, selections, quantities }) => {
    const { appliedRates, total } = calculateContractBilling(
      rateMatrices,
      "Trucking",
      bookingMode,
      quantities,
      selections,
      facts,
    );
    return { lineItem, appliedRates, subtotal: total };
  });

  return {
    lineResults,
    grandTotal: lineResults.reduce((sum, lr) => sum + lr.subtotal, 0),
  };
}

/**
 * Convert multiple trucking line items into SellingPriceCategory[] format
 * for the quotation builder's selling price section.
 *
 * Thin wrapper: loops over line items and calls the existing
 * `contractRatesToSellingPrice()` once per item, then relabels each
 * category with the line item's destination and truck type for clarity.
 *
 * Each line item produces its own SellingPriceCategory. All categories
 * share the same `contract-cat-${matrixId}` prefix so the existing
 * scoped-replacement logic in QuotationBuilderV3 works without changes.
 *
 * @param rateMatrices - Contract rate matrices
 * @param modeColumns - Resolved mode columns
 * @param extractions - Pre-extracted { lineItem, selections, quantities } tuples
 * @returns SellingPriceCategory[] — one per line item (with descriptive names)
 *
 * @see /docs/blueprints/MULTI_LINE_TRUCKING_BLUEPRINT.md — Phase 1, Task 1.5
 */
export function multiLineRatesToSellingPrice(
  rateMatrices: ContractRateMatrix[],
  modeColumns: string[] | undefined,
  extractions: LineItemExtraction[]
): SellingPriceCategory[] {
  const allCategories: SellingPriceCategory[] = [];

  for (const { lineItem, selections, quantities } of extractions) {
    const categories = contractRatesToSellingPrice(
      rateMatrices,
      "Trucking",
      modeColumns,
      quantities,
      selections
    );

    // Relabel each category to include line item context
    const destLabel = lineItem.destination || "All Destinations";
    const truckLabel = lineItem.truckType || "—";
    const qtyLabel = lineItem.quantity;

    for (const cat of categories) {
      // Make category ID unique per line item (preserve matrixId prefix for scoped replacement)
      cat.id = `${cat.id}-line-${lineItem.id}`;
      cat.category_name = `Trucking — ${destLabel} x ${truckLabel} (${qtyLabel} unit${qtyLabel !== 1 ? "s" : ""})`;

      // Also make line item IDs unique per line item to avoid React key collisions
      for (const li of cat.line_items) {
        li.id = `${li.id}-line-${lineItem.id}`;
      }
    }

    allCategories.push(...categories);
  }

  return allCategories;
}

// ============================================
// CATEGORY-DISPATCH ENGINE (Phase 1 of category-dispatch refactor)
// @see /docs/blueprints/CATEGORY_DISPATCH_BLUEPRINT.md
// ============================================

import type { ContractRateCategory, RateCategoryKind } from "../types/pricing";

/**
 * A single container as the booking declares it. Used by the delivery
 * dispatcher to match against rate-matrix rows whose `particular` names a
 * container type ("20ft", "40ft", "BACK TO BACK", "4 WHEELER" etc.) and
 * whose `remarks` name a location keyword ("within Valenzuela City").
 */
export interface BookingContainer {
  container_number: string;
  container_type?: string;
  delivery_address?: string;
}

/**
 * Resolved dispatch behaviour for a single contract rate row. The dispatchers
 * route on `dispatch_kind`; `trigger_field` + `trigger_value` carry the
 * applies_when shape for the 'optional' dispatcher.
 *
 * Vocabulary note: this struct uses the plural `'permits'` / `'examinations'`
 * trigger_field while `ContractRateRow.applies_when.kind` uses the singular
 * `'permit'` / `'examination'`. `resolveRowDispatch` does the translation.
 */
export interface CatalogDispatchHint {
  dispatch_kind: RateCategoryKind;
  trigger_field?: 'permits' | 'examinations';
  trigger_value?: string;
}

/**
 * Full context the dispatchers need to evaluate a category's rows. Bundled
 * so each strategy gets every signal it might need without re-deriving.
 */
export interface BillingDispatchContext {
  quantities: BookingQuantities;
  facts?: BookingFacts;
  selections?: Record<string, string>;
  /** Per-container detail for the delivery dispatcher. Empty array when not applicable. */
  containers?: BookingContainer[];
  /** Booking-level delivery address fallback when per-container address is empty. */
  deliveryAddress?: string;
}

/**
 * Resolve the effective dispatch behaviour for a single rate row using the
 * precedence chain:
 *
 *   1. `row.applies_when` — per-row trigger set via the editor's TRIGGER popover
 *   2. `category.kind` — the wrapping category's dispatch kind from the Kind chip
 *   3. Default `'standard'`
 *
 * Catalog items intentionally do NOT carry dispatch metadata. The catalog
 * stays a pure-identity surface (name + category + side); dispatch is
 * declared on the contract where Pricing controls it per-customer.
 */
export function resolveRowDispatch(
  row: ContractRateRow,
  category: ContractRateCategory | undefined,
): CatalogDispatchHint {
  // 1. Per-row applies_when
  if (row.applies_when && row.applies_when.kind !== 'always') {
    const triggerField = row.applies_when.kind === 'permit' ? 'permits' : 'examinations';
    return {
      dispatch_kind: 'optional',
      trigger_field: triggerField,
      trigger_value: row.applies_when.value,
    };
  }
  // 2. Category kind
  if (category?.kind && category.kind !== 'standard') {
    return { dispatch_kind: category.kind };
  }
  // 3. Default
  return { dispatch_kind: 'standard' };
}

/**
 * Category dispatcher signature. Each kind ('standard' | 'optional' | 'delivery')
 * implements one of these. Phase 1 ships 'standard' only; the others delegate
 * to it as no-ops so any matrix tagged ahead of time still bills correctly.
 */
type CategoryDispatcher = (
  category: ContractRateCategory,
  matrix: ContractRateMatrix,
  modeColumn: string,
  context: BillingDispatchContext,
) => AppliedRate[];

/**
 * 'standard' — every row applies. Quantity from unit, rate × quantity, with
 * succeeding-rule support. Behaviour identical to the legacy `instantiateRates`
 * when no category metadata is involved; this dispatcher just scopes the rows
 * to the category and lets the existing kernel do the math.
 */
/**
 * Resolve the current state of a category's rows from `matrix.rows` (the
 * authoritative flat array) by id. `category.rows` is treated as a stale id
 * snapshot — the editor mutates matrix.rows directly without updating the
 * category grouping, so trusting category.rows blindly would lose edits made
 * via the flat table view (e.g. applies_when set via the TRIGGER popover).
 */
function resolveCategoryRows(category: ContractRateCategory, matrix: ContractRateMatrix): ContractRateRow[] {
  const wantedIds = new Set(category.rows.map((r) => r.id));
  // Preserve category's row ordering when possible by intersecting with matrix.rows
  // (the engine doesn't strictly care about order, but stable ordering helps debugging).
  return matrix.rows.filter((r) => wantedIds.has(r.id));
}

const dispatchStandard: CategoryDispatcher = (category, matrix, modeColumn, ctx) => {
  // Reuse the legacy kernel by synthesising a per-category matrix slice. This
  // preserves every existing behaviour (mode-column fuzzy match, selection_group
  // gating, applies_when row-level filter from Phase B) without duplicating logic.
  const currentRows = resolveCategoryRows(category, matrix);
  const slice: ContractRateMatrix = {
    ...matrix,
    rows: currentRows,
    categories: [{ ...category, rows: currentRows }],
  };
  return instantiateRates(slice, modeColumn, ctx.quantities, ctx.selections, ctx.facts);
};

/**
 * 'optional' — rows are opt-in. Each must declare `applies_when` so the engine
 * knows what booking fact gates it. Rows without `applies_when` inside an
 * optional category are misconfigured and silently skipped (the editor
 * surfaces a warning badge so Pricing can fix them; we conservatively
 * undercharge rather than wrongly bill).
 *
 * Implementation: pre-filter to rows that have `applies_when` set, then let
 * the kernel's existing applies_when filter (Phase B) evaluate them against
 * `ctx.facts`. Reusing the kernel keeps fact-matching semantics consistent
 * with row-level configuration anywhere else in the codebase.
 */
const dispatchOptional: CategoryDispatcher = (category, matrix, modeColumn, ctx) => {
  const currentRows = resolveCategoryRows(category, matrix);
  const gatedRows = currentRows.filter((row) =>
    row.applies_when && row.applies_when.kind !== 'always'
  );
  if (gatedRows.length === 0) return [];
  const slice: ContractRateMatrix = {
    ...matrix,
    rows: gatedRows,
    categories: [{ ...category, rows: gatedRows }],
  };
  return instantiateRates(slice, modeColumn, ctx.quantities, ctx.selections, ctx.facts);
};

/**
 * Normalise a location string for fuzzy matching. Lowercases, strips
 * punctuation, and removes common stopwords that appear in either booking
 * delivery_address strings ("VALENZUELA CITY") or matrix row remarks
 * ("within Valenzuela City", "to Carmona Cavite area"). Returns the
 * remaining tokens joined by single spaces.
 */
function normaliseLocation(s: string | undefined | null): string {
  if (!s) return '';
  const STOPWORDS = new Set(['within', 'to', 'from', 'at', 'in', 'the', 'city', 'area', 'province']);
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok))
    .join(' ');
}

/**
 * Fuzzy location match: each side normalised, then check substring containment
 * in either direction. Returns true if either string contains the other.
 * Both-empty returns false (engine should skip rather than guess).
 */
function locationsMatch(addressA: string | undefined | null, addressB: string | undefined | null): boolean {
  const a = normaliseLocation(addressA);
  const b = normaliseLocation(addressB);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * 'delivery' — per-container matching. For each container declared on the
 * booking, find the rate-matrix row whose `particular` matches the container's
 * type (case-insensitive, e.g. "20ft" ↔ "20FT") AND whose `remarks` fuzzy-match
 * the container's delivery address (or the booking-level fallback). Emit one
 * AppliedRate per matched container with quantity 1.
 *
 * Containers with no container_type are skipped (legacy bookings need Ops to
 * backfill). Containers whose type matches a row but whose address matches no
 * row's remarks are skipped — we don't guess. Unbilled containers surface as
 * a smaller bill rather than a wrong bill; Accounting reviews.
 */
const dispatchDelivery: CategoryDispatcher = (category, matrix, modeColumn, ctx) => {
  const currentRows = resolveCategoryRows(category, matrix);
  if (currentRows.length === 0 || !ctx.containers || ctx.containers.length === 0) return [];

  // Build row-id → category-name map for AppliedRate.category passthrough.
  const fallbackCategory = `${matrix.service_type} Charges`;
  const categoryName = category.category_name || fallbackCategory;

  const applied: AppliedRate[] = [];

  for (const container of ctx.containers) {
    if (!container.container_type) continue;  // legacy data → skip, don't guess
    const containerType = container.container_type.trim().toLowerCase();
    const containerAddress = container.delivery_address || ctx.deliveryAddress;

    // Candidate rows whose particular matches the container type.
    const candidates = currentRows.filter((row) =>
      (row.particular || '').trim().toLowerCase() === containerType
    );
    if (candidates.length === 0) continue;

    // Narrow by address. If only one candidate exists across the matrix for
    // this type, the address constraint can be skipped (Pricing didn't bother
    // splitting by location). Otherwise require a fuzzy match.
    const match = candidates.length === 1
      ? candidates[0]
      : candidates.find((row) => locationsMatch(row.remarks, containerAddress));
    if (!match) continue;

    const rate = match.rates[modeColumn];
    if (rate === undefined || rate === null || rate === 0) continue;

    applied.push({
      particular: match.particular,
      rate,
      quantity: 1,
      subtotal: rate,
      rule_applied: `1 × P${rate.toLocaleString('en-PH')} (${container.container_number || 'container'} → ${containerAddress || 'no address'})`,
      catalog_item_id: match.catalog_item_id,
      category: categoryName,
    });
  }

  return applied;
};

const DISPATCHERS: Record<RateCategoryKind, CategoryDispatcher> = {
  // Phase 1 shipped 'standard'. Phase 2 ships 'optional'. Phase 3 ships
  // 'delivery'. All three are now real strategies.
  standard: dispatchStandard,
  optional: dispatchOptional,
  delivery: dispatchDelivery,
};

/**
 * Apply a resolved dispatch hint to a row: synthesise `row.applies_when` to
 * mirror the hint so the kernel's filter agrees with the dispatcher routing.
 *
 * - `'optional'` hint with trigger → row gets the matching applies_when
 * - `'standard'` or `'delivery'` hint → row's applies_when is cleared (any
 *   legacy value on the row would otherwise re-gate inside the kernel)
 */
function applyHintToRow(row: ContractRateRow, hint: CatalogDispatchHint): ContractRateRow {
  if (hint.dispatch_kind === 'optional' && hint.trigger_field && hint.trigger_value) {
    return {
      ...row,
      applies_when: {
        kind: hint.trigger_field === 'permits' ? 'permit' : 'examination',
        value: hint.trigger_value,
      },
    };
  }
  // Standard or delivery — strip any legacy applies_when so it doesn't gate inside the kernel.
  if (row.applies_when) {
    const { applies_when: _stripped, ...rest } = row;
    return rest as ContractRateRow;
  }
  return row;
}

/**
 * Top-level billing entry point for the catalog-first dispatch refactor.
 *
 * Iterates each row across all categories. For each row, `resolveRowDispatch`
 * collapses its catalog metadata + legacy fallbacks into a single
 * `CatalogDispatchHint`. Rows are bucketed by their resolved `dispatch_kind`
 * within each category and dispatched through the appropriate strategy.
 *
 * The categories themselves keep their UI grouping role (each AppliedRate
 * carries its source `category.category_name` for grouped rendering) but
 * stop driving engine behaviour — routing is purely per-row.
 *
 * Backwards compatible: matrices without `categories` fall back to a single
 * synthetic standard category wrapping the flat `rows`. Rows without a
 * `catalog_item_id` fall back to legacy `row.applies_when` / `category.kind`
 * via `resolveRowDispatch`.
 */
export function generateContractBilling(
  matrix: ContractRateMatrix,
  modeColumn: string,
  context: BillingDispatchContext,
): AppliedRate[] {
  // Resolve the working set of categories. When the matrix has no explicit
  // categories, treat the flat rows as one implicit standard category so
  // dispatch produces the same result as legacy `instantiateRates`.
  const categories: ContractRateCategory[] = (matrix.categories && matrix.categories.length > 0)
    ? matrix.categories
    : [{
        id: `__implicit__${matrix.id}`,
        category_name: `${matrix.service_type} Charges`,
        rows: matrix.rows,
        kind: 'standard',
      }];

  const applied: AppliedRate[] = [];
  for (const category of categories) {
    // Bucket rows by their resolved per-row dispatch kind. A category can mix
    // standard + optional rows if individual rows declare applies_when even
    // while the category's overall Kind is something else — each row gets
    // routed correctly regardless.
    const buckets = new Map<RateCategoryKind, ContractRateRow[]>();
    for (const row of category.rows) {
      const hint = resolveRowDispatch(row, category);
      const rowWithHint = applyHintToRow(row, hint);
      const existing = buckets.get(hint.dispatch_kind) ?? [];
      existing.push(rowWithHint);
      buckets.set(hint.dispatch_kind, existing);
    }

    // Dispatch each bucket through its strategy. The synthesised matrix /
    // category contains only this bucket's rows so the dispatcher's internal
    // `resolveCategoryRows` lookup finds the hint-applied versions, not the
    // original ones from `matrix.rows`.
    for (const [kind, bucketRows] of buckets) {
      const dispatcher = DISPATCHERS[kind] ?? dispatchStandard;
      const syntheticCategory: ContractRateCategory = { ...category, rows: bucketRows };
      const syntheticMatrix: ContractRateMatrix = { ...matrix, rows: bucketRows };
      applied.push(...dispatcher(syntheticCategory, syntheticMatrix, modeColumn, context));
    }
  }
  return applied;
}