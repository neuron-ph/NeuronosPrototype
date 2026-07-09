/**
 * RateCalculationSheet
 *
 * Transparent rate calculation preview shown before billing items are created.
 * Opens as a slide-over panel (SidePanel) with 3 sections:
 *   1. Detected Inputs — what the system derived from the booking (editable)
 *   2. Calculation Table — full rate engine breakdown per row
 *   3. Total + Confirm — save to billings on explicit user approval
 *
 * Uses existing pure functions for all math — this is purely a presentation layer.
 * Table and quantity sections are now shared components.
 *
 * @see /docs/blueprints/RATE_CALCULATION_SHEET_BLUEPRINT.md — Phase 1
 * @see /docs/blueprints/RATE_TABLE_DRY_BLUEPRINT.md
 */

import { useState, useMemo, useCallback } from "react";
import { SidePanel } from "../common/SidePanel";
import { Check, Loader2 } from "lucide-react";
import { calculateContractBilling, calculateMultiLineTruckingBilling, type BookingQuantities } from "../../utils/contractRateEngine";
import { generateRateCardBillingItems } from "../../utils/rateCardToBilling";
import { resolveContractCatalogIds } from "../../utils/resolveContractCatalogIds";
import type { ContractRateMatrix, AppliedRate, TruckingLineItem } from "../../types/pricing";
import type { BillingItem } from "../shared/billings/UnifiedBillingsTab";
import { toast } from "../ui/toast-utils";
import { supabase } from "../../utils/supabase/client";
import { RateBreakdownTable, formatCurrency } from "../pricing/shared/RateBreakdownTable";
import { QuantityDisplaySection } from "../pricing/shared/QuantityDisplaySection";
import { normalizeTruckingLineItems, extractMultiLineSelectionsAndQuantities, extractBookingFacts, extractBookingContainers } from "../../utils/contractQuantityExtractor";

// ============================================
// TYPES
// ============================================

interface RateCalculationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The booking object (needs bookingId, mode, containerNumbers, etc.) */
  booking: any;
  /** Service type of the booking */
  serviceType: string;
  /** Rate matrices from the parent contract */
  rateMatrices: ContractRateMatrix[];
  /** Contract metadata for billing items */
  contractId: string;
  contractNumber: string;
  customerName: string;
  currency: string;
  /** Initial quantities derived from the booking */
  initialQuantities: BookingQuantities;
  /** Detected booking mode */
  bookingMode: string;
  /** Booking's POD — selects the POD-scoped rate matrix (empty = global/legacy). */
  bookingPod?: string;
  /** Optional selections for alternative row filtering (@see SELECTION_GROUP_BLUEPRINT.md) */
  selections?: Record<string, string>;
  /** Optional: multi-line trucking line items for grouped display (@see MULTI_LINE_TRUCKING_BLUEPRINT.md) */
  truckingLineItems?: TruckingLineItem[];
  /** Called after items are saved to refresh the parent list */
  onRefresh: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function RateCalculationSheet({
  isOpen,
  onClose,
  booking,
  serviceType,
  rateMatrices,
  contractId,
  contractNumber,
  customerName,
  currency,
  initialQuantities,
  bookingMode,
  bookingPod,
  selections,
  truckingLineItems,
  onRefresh,
}: RateCalculationSheetProps) {
  // Editable quantities (initialized from derived values)
  const [quantities, setQuantities] = useState<BookingQuantities>({ ...initialQuantities });
  const [isSaving, setIsSaving] = useState(false);

  // Reset quantities when sheet opens with new data
  const resetQuantities = useCallback(() => {
    setQuantities({ ...initialQuantities });
  }, [initialQuantities]);

  // ✨ Multi-line trucking: compute per-line-item breakdowns
  const isMultiLine = serviceType.toLowerCase() === "trucking"
    && truckingLineItems && truckingLineItems.length > 1;

  // Booking facts gate applies_when-tagged rows.
  const facts = useMemo(
    () => extractBookingFacts(booking),
    [JSON.stringify(booking?.examinations), JSON.stringify(booking?.permits)],
  );

  // Containers + delivery address drive the delivery category dispatcher.
  const containers = useMemo(
    () => extractBookingContainers(booking),
    [JSON.stringify(booking?.container_numbers ?? booking?.containerNumbers)],
  );
  const deliveryAddress: string | undefined =
    booking?.deliveryAddress ?? booking?.delivery_address ?? undefined;

  const multiLineResults = useMemo(() => {
    if (!isMultiLine) return null;
    const extractions = extractMultiLineSelectionsAndQuantities(truckingLineItems!, rateMatrices);
    return calculateMultiLineTruckingBilling(rateMatrices, bookingMode, extractions, facts);
  }, [isMultiLine, rateMatrices, bookingMode, JSON.stringify(truckingLineItems), facts]);

  // Run the rate engine with current quantities (reactive — recalculates on every change)
  const calculation = useMemo(() => {
    if (isMultiLine) return { appliedRates: [] as AppliedRate[], total: 0 };
    return calculateContractBilling(rateMatrices, serviceType, bookingMode, quantities, selections, facts, containers, deliveryAddress, bookingPod);
  }, [rateMatrices, serviceType, bookingMode, quantities, selections, isMultiLine, facts, containers, deliveryAddress, bookingPod]);

  // Grand total
  const grandTotal = isMultiLine && multiLineResults
    ? multiLineResults.grandTotal
    : calculation.total;

  const totalItems = isMultiLine && multiLineResults
    ? multiLineResults.lineResults.reduce((sum: number, lr: any) => sum + lr.appliedRates.length, 0)
    : calculation.appliedRates.length;

  // Handle quantity change
  const handleQuantityChange = (key: keyof BookingQuantities, value: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  };

  // Save billing items (same logic as old BookingRateCardButton.handleGenerate)
  const handleConfirm = async () => {
    if (totalItems === 0) {
      toast.warning("No billing items to generate — all rates are zero or suppressed.");
      return;
    }

    setIsSaving(true);

    try {
      const bookingId = booking.bookingId || booking.id;

      const truckingExtractions = isMultiLine
        ? extractMultiLineSelectionsAndQuantities(truckingLineItems!, rateMatrices)
        : undefined;

      const result = generateRateCardBillingItems({
        rateMatrices,
        serviceType,
        mode: bookingMode,
        quantities,
        bookingId,
        contractId,
        contractNumber,
        customerName,
        currency,
        selections,
        truckingExtractions,
        facts,
        containers,
        deliveryAddress,
        bookingPod,
      });

      if (result.items.length === 0) {
        toast.warning("No billing items generated — check rate card configuration.");
        setIsSaving(false);
        return;
      }

      // The contract's rate card carries snapshotted catalog ids that can drift
      // stale as the catalog changes. Re-point them to the live catalog before
      // insert so the FK never rejects the batch; block on anything unresolvable.
      const { items: resolvedItems, unresolved } = await resolveContractCatalogIds(result.items);
      if (unresolved.length > 0) {
        const names = unresolved.map((u) => u.description).filter(Boolean).join(", ");
        toast.error(
          `These charges aren't in the Billing Catalog and must be added before applying: ${names}`
        );
        setIsSaving(false);
        return;
      }

      const billingRows = resolvedItems.map((item) => ({
        id: `BIL-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
        description: item.description,
        service_type: item.service_type,
        amount: item.amount,
        quantity: item.quantity ?? 1,
        currency: item.currency,
        is_taxed: item.is_taxed ?? false,
        status: 'unbilled',
        source_type: 'contract_rate',
        source_id: contractId,
        quotation_category: item.quotation_category,
        booking_id: item.booking_id,
        customer_name: customerName,
        project_number: booking.projectNumber || "",
        created_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('billing_line_items').insert(billingRows);
      if (insertError) throw new Error(insertError.message);

      toast.success(
        `Applied ${result.count} billing item${result.count !== 1 ? "s" : ""} totaling ${formatCurrency(result.total, currency)}.`
      );

      onRefresh();
      onClose();
    } catch (error) {
      console.error("Error saving rate card billing items:", error);
      toast.error(`Failed to save billing items: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ──

  const panelTitle = (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-[18px] font-semibold text-[var(--theme-text-primary)]">Rate Calculation Preview</h2>
      <p className="text-[12px] text-[var(--theme-text-muted)] font-normal">
        {contractNumber} &middot; {serviceType} &middot; {bookingMode}
        {isMultiLine ? ` · ${truckingLineItems!.length} destinations` : ""}
      </p>
    </div>
  );

  const panelFooter = (
    <div className="px-8 py-4 border-t border-[var(--theme-border-default)] bg-[var(--neuron-pill-inactive-bg)] flex items-center justify-between">
      <div className="text-[13px] text-[var(--theme-text-muted)]">
        {totalItems} item{totalItems !== 1 ? "s" : ""} &middot;{" "}
        <span className="font-semibold text-[var(--theme-text-primary)]">{formatCurrency(grandTotal, currency)}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-[13px] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={isSaving || totalItems === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
          style={{
            backgroundColor: isSaving ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Apply to Billings
        </button>
      </div>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={panelTitle}
      footer={panelFooter}
      size="md"
    >
      <div className="h-full overflow-y-auto">
        {/* Section 1: Detected Inputs (editable) */}
        <QuantityDisplaySection
          mode="editable"
          serviceType={serviceType}
          quantities={quantities}
          resolvedMode={bookingMode}
          booking={booking}
          onQuantityChange={handleQuantityChange}
          onReset={resetQuantities}
          truckingLineItems={truckingLineItems}
          selectionContext={
            serviceType.toLowerCase() === "trucking" && selections
              && (!truckingLineItems || truckingLineItems.length <= 1)
              ? {
                  truckType: booking?.truckType || "—",
                  destination: Object.keys(selections).length === 1
                    ? Object.keys(selections)[0]
                    : Object.keys(selections).length > 1
                      ? `All (${Object.keys(selections).length} destinations)`
                      : "—",
                }
              : undefined
          }
        />

        {/* Section 2: Rate Breakdown — single or grouped */}
        {isMultiLine && multiLineResults ? (
          <div className="px-8 py-6">
            {multiLineResults.lineResults.map((lr: any, idx: number) => (
              <div key={lr.lineItem.id} className={idx > 0 ? "mt-6 pt-6 border-t border-[var(--theme-border-default)]" : ""}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-semibold text-[var(--theme-text-primary)]">
                    {lr.lineItem.destination || "All Destinations"} — {lr.lineItem.truckType || "—"} × {lr.lineItem.quantity}
                  </div>
                  <div className="text-[12px] font-medium text-[var(--theme-action-primary-bg)]">
                    {formatCurrency(lr.subtotal, currency)}
                  </div>
                </div>
                <RateBreakdownTable
                  appliedRates={lr.appliedRates}
                  total={lr.subtotal}
                  currency={currency}
                  hideTotal={true}
                />
              </div>
            ))}
            <div className="mt-6 pt-4 border-t-2 border-[var(--theme-text-primary)] flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[var(--theme-text-primary)]">Grand Total</span>
              <span className="text-[14px] font-bold text-[var(--theme-text-primary)]">
                {formatCurrency(multiLineResults.grandTotal, currency)}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-8 py-6">
            <RateBreakdownTable
              appliedRates={calculation.appliedRates}
              total={calculation.total}
              currency={currency}
            />
          </div>
        )}
      </div>
    </SidePanel>
  );
}