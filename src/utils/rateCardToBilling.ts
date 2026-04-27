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
  resolveModeColumn,
  type BookingQuantities,
} from "./contractRateEngine";
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
  // 1. Find the matrix for this service type
  const matrix = ctx.rateMatrices.find(
    (m) => m.service_type.toLowerCase() === ctx.serviceType.toLowerCase()
  );

  if (!matrix) {
    return { items: [], total: 0, count: 0, modeColumn: null };
  }

  // 2. Resolve mode column
  const modeColumn = resolveModeColumn(matrix.columns, ctx.mode);
  if (!modeColumn) {
    return { items: [], total: 0, count: 0, modeColumn: null };
  }

  // 3. Run the rate engine
  const appliedRates = instantiateRates(matrix, modeColumn, ctx.quantities);

  if (appliedRates.length === 0) {
    return { items: [], total: 0, count: 0, modeColumn };
  }

  // 4. Convert AppliedRate[] → BillingItem[]
  const now = new Date().toISOString();
  const currency = ctx.currency || "PHP";

  const items: BillingItem[] = appliedRates.map((rate, idx) => ({
    // Temporary ID — will be replaced by backend on batch save
    id: `rate-gen-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`,
    created_at: now,

    // Core fields
    description: rate.particular,
    service_type: ctx.serviceType,
    amount: rate.subtotal,
    currency,
    status: "unbilled" as const,

    // Category = service type (appears as section header in BillingsTable)
    quotation_category: `${ctx.serviceType} Charges`,

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
    mode_column: modeColumn,

    // Catalog identity — carried from the contract row via the rate engine
    catalog_item_id: rate.catalog_item_id || null,
    catalog_snapshot: rate.catalog_item_id
      ? buildCatalogSnapshot(
          { description: rate.particular, amount: rate.subtotal, currency },
          `${ctx.serviceType} Charges`
        )
      : null,

    // Extended fields for UniversalPricingRow editing
    quantity: rate.quantity,
    forex_rate: 1,
    is_taxed: false,
    amount_added: 0,
    percentage_added: 0,
    base_cost: 0,
  }));

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
