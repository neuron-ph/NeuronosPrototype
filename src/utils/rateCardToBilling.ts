/**
 * Rate Card → Billing Items Converter
 *
 * Converts contract rate engine output (AppliedRate[]) into BillingItem[] format
 * compatible with UnifiedBillingsTab. This is the bridge that lets the rate engine
 * pre-fill the standard billing interface instead of producing locked output.
 *
 * @see /docs/blueprints/CONTRACT_BILLINGS_REWORK_BLUEPRINT.md — Phase 1, Task 1.3
 * @see /utils/contractRateEngine.ts — Source of AppliedRate[]
 * @see /components/shared/billings/UnifiedBillingsTab.tsx — Target consumer
 */

import type { ContractRateMatrix, AppliedRate } from "../types/pricing";
import {
  instantiateRates,
  generateContractBilling,
  resolveModeColumn,
  selectMatrixForPod,
  type BookingQuantities,
  type BookingFacts,
  type BookingContainer,
} from "./contractRateEngine";
import type { LineItemExtraction } from "./contractQuantityExtractor";
import type { BillingItem } from "../components/shared/billings/UnifiedBillingsTab";
import { buildCatalogSnapshot } from "./catalogSnapshot";

// ============================================
// TYPES
// ============================================

export interface RateCardGenerationContext {
  /** The contract's rate matrices (all service types) */
  rateMatrices: ContractRateMatrix[];
  /** Which service type to calculate for (e.g., "Brokerage") */
  serviceType: string;
  /** Booking mode — "FCL", "LCL", "AIR", etc. */
  mode: string;
  /** Quantities derived from the booking */
  quantities: BookingQuantities;
  /** The booking ID these billing items belong to */
  bookingId: string;
  /** The contract quotation ID */
  contractId: string;
  /** The contract's quote number (e.g., "CTR-2026-001") */
  contractNumber: string;
  /** Customer name for display */
  customerName?: string;
  /** Currency from the contract */
  currency?: string;
  /**
   * Selection-group picks for mutually-exclusive alternative rows
   * (@see SELECTION_GROUP_BLUEPRINT.md). When omitted on a service
   * that uses selection groups (e.g. trucking), all alternative rows
   * are emitted — almost never desired. Pass the same selections the
   * preview was computed with so apply matches what the user saw.
   */
  selections?: Record<string, string>;
  /**
   * Pre-extracted per-line tuples for multi-line trucking. When provided,
   * the generator loops over each extraction and runs the engine with its
   * own selections + quantities, instead of using `quantities`/`selections`
   * once for the whole booking. @see MULTI_LINE_TRUCKING_BLUEPRINT.md
   */
  truckingExtractions?: LineItemExtraction[];
  /**
   * Facts the booking declares (examinations performed, permits filed).
   * Required to gate `applies_when`-tagged rate-card rows so optional fees
   * (e.g. BAI/SRA/BPI processing, X-ray exam) only apply when the booking
   * actually consumed those services. Build via `extractBookingFacts()`.
   * Rows without `applies_when` are unaffected.
   */
  facts?: BookingFacts;
  /**
   * Per-container detail used by the 'delivery' category dispatcher. Each
   * container is matched against the matrix's delivery rows by container_type
   * (against row.particular) + delivery_address (fuzzy against row.remarks).
   * Build via `extractBookingContainers()`. Standard / optional categories
   * ignore this; delivery categories skip containers with no type.
   */
  containers?: BookingContainer[];
  /**
   * Booking-level delivery address fallback used by the delivery dispatcher
   * when a container's own delivery_address is empty (common when Ops fills
   * the top-level address but not the per-container one).
   */
  deliveryAddress?: string;
  /**
   * The booking's POD (port of discharge / entry). Selects the POD-scoped
   * rate matrix when the contract has per-POD rate cards. When omitted, the
   * global/unscoped matrix is used (legacy behaviour).
   */
  bookingPod?: string;
}

export interface RateCardGenerationResult {
  /** BillingItem[] ready to inject into UnifiedBillingsTab */
  items: BillingItem[];
  /** Total amount across all generated items */
  total: number;
  /** Number of items generated */
  count: number;
  /** The mode column that was resolved */
  modeColumn: string | null;
}

// ============================================
// CORE CONVERTER
// ============================================

/**
 * Run the rate engine and convert output to BillingItem[] format.
 *
 * Each AppliedRate becomes one BillingItem with:
 * - `source_type: 'contract_rate'` for audit trail
 * - `contract_id` and `source_booking_id` for filtering
 * - `quotation_category` set to the service type (becomes the category header in BillingsTable)
 * - Temporary IDs (will be replaced by real IDs on batch save)
 *
 * @example
 * const result = generateRateCardBillingItems({
 *   rateMatrices: contract.rate_matrices,
 *   serviceType: "Brokerage",
 *   mode: "FCL",
 *   quantities: { containers: 18, bls: 1, sets: 1, shipments: 1 },
 *   bookingId: "BRK-2026-001",
 *   contractId: "contract-uuid",
 *   contractNumber: "CTR-2026-001",
 * });
 * // result.items = BillingItem[] ready for UnifiedBillingsTab
 */
export function generateRateCardBillingItems(
  ctx: RateCardGenerationContext
): RateCardGenerationResult {
  // 1. Find the matrix for this service type, scoped to the booking's POD
  const matrix = selectMatrixForPod(ctx.rateMatrices, ctx.serviceType, ctx.bookingPod);

  if (!matrix) {
    return { items: [], total: 0, count: 0, modeColumn: null };
  }

  // 2. Resolve mode column
  const modeColumn = resolveModeColumn(matrix.columns, ctx.mode);
  if (!modeColumn) {
    return { items: [], total: 0, count: 0, modeColumn: null };
  }

  // 3. Run the rate engine. For multi-line trucking we loop per extraction so
  //    each leg's selections + quantities gate its own rows. For everything
  //    else (single-line trucking, brokerage, forwarding…) we run once with
  //    the booking-level selections.
  const appliedRates: AppliedRate[] = [];
  const useMultiLine = Array.isArray(ctx.truckingExtractions)
    && ctx.truckingExtractions.length > 0
    && ctx.serviceType.toLowerCase() === "trucking";

  if (useMultiLine) {
    // Multi-line trucking still routes through instantiateRates per leg because
    // each leg carries its own selections + quantities. Category dispatch isn't
    // a fit here — every leg evaluates the same Trucking matrix in full. This
    // path stays unchanged through Phase 1.
    for (const { selections, quantities } of ctx.truckingExtractions!) {
      const rates = instantiateRates(matrix, modeColumn, quantities, selections, ctx.facts);
      appliedRates.push(...rates);
    }
  } else {
    // Single-pass: use the new category-dispatch entry point. In Phase 1 the
    // dispatcher only does 'standard' (delegates to instantiateRates per category),
    // so output is identical to calling instantiateRates directly — but the call
    // path is now ready for Phase 2's 'optional' and Phase 3's 'delivery' dispatchers.
    appliedRates.push(
      ...generateContractBilling(matrix, modeColumn, {
        quantities: ctx.quantities,
        selections: ctx.selections,
        facts: ctx.facts,
        containers: ctx.containers,
        deliveryAddress: ctx.deliveryAddress,
      }),
    );
  }

  if (appliedRates.length === 0) {
    return { items: [], total: 0, count: 0, modeColumn };
  }

  // 4. Convert AppliedRate[] → BillingItem[]
  const now = new Date().toISOString();
  // NEU-027 P3: the rate matrix carries its own denomination + locked PHP rate.
  // Carry BOTH into the billing item so a non-PHP contract's lines convert
  // correctly downstream — previously the currency came from ctx and the rate
  // was hardcoded to 1, silently treating EUR/USD rates as pesos in the GL base.
  const currency = matrix.currency || ctx.currency || "PHP";
  const forexRate = matrix.exchange_rate ?? 1;

  const items: BillingItem[] = appliedRates.map((rate, idx) => {
    // Category from the contract rate matrix carries through to the billing item
    // so saved rows land into the same category section the user saw on apply.
    const category = rate.category || `${ctx.serviceType} Charges`;
    return {
    // Temporary ID — will be replaced by backend on batch save
    id: `rate-gen-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
    created_at: now,

    // Core fields
    description: rate.particular,
    service_type: ctx.serviceType,
    amount: rate.subtotal,
    currency,
    status: "unbilled" as const,

    // Category from the contract rate matrix (mirrors the source structure)
    quotation_category: category,

    // Booking link
    booking_id: ctx.bookingId,

    // Contract traceability
    source_type: "contract_rate" as any,
    contract_id: ctx.contractId,
    contract_number: ctx.contractNumber,
    source_booking_id: ctx.bookingId,

    // Rate engine details (preserved for traceability badges & tooltips)
    applied_rate: rate.rate,
    applied_quantity: rate.quantity,
    rule_applied: rate.rule_applied,
    condition_label: rate.condition_label,
    mode_column: modeColumn,

    // Catalog identity — carried from the contract row via the rate engine
    catalog_item_id: rate.catalog_item_id || null,
    catalog_snapshot: rate.catalog_item_id
      ? buildCatalogSnapshot(
          { description: rate.particular, amount: rate.subtotal, currency },
          category
        )
      : null,

    // Extended fields for UniversalPricingRow editing
    quantity: rate.quantity,
    forex_rate: forexRate,
    is_taxed: false,
    amount_added: 0,
    percentage_added: 0,
    base_cost: 0,
    };
  });

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    items,
    total,
    count: items.length,
    modeColumn,
  };
}

/**
 * Check if a booking already has billing items generated from the rate card.
 *
 * Used by the RateCardGeneratorPopover to show "Already billed" status
 * and prevent duplicate generation.
 */
export function hasExistingRateCardBilling(
  existingItems: BillingItem[],
  bookingId: string
): boolean {
  return existingItems.some(
    (item) =>
      (item.source_booking_id === bookingId || item.booking_id === bookingId) &&
      item.source_type === "contract_rate"
  );
}

/**
 * Count how many billing items exist for a specific booking.
 */
export function countBookingBillingItems(
  existingItems: BillingItem[],
  bookingId: string
): number {
  return existingItems.filter(
    (item) => item.source_booking_id === bookingId || item.booking_id === bookingId
  ).length;
}
