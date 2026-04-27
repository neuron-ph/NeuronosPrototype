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
    default:
      // Fallback: try containers, then generic, then 1
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
  selections?: Record<string, string>
): AppliedRate[] {
  const appliedRates: AppliedRate[] = [];

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
  selections?: Record<string, string>
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

  const appliedRates = instantiateRates(matrix, modeColumn, quantities, selections);
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
  extractions: LineItemExtraction[]
): MultiLineTruckingResult {
  const lineResults: TruckingLineResult[] = extractions.map(({ lineItem, selections, quantities }) => {
    const { appliedRates, total } = calculateContractBilling(
      rateMatrices,
      "Trucking",
      bookingMode,
      quantities,
      selections
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