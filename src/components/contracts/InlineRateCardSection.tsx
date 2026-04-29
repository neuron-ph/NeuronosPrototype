/**
 * InlineRateCardSection
 *
 * Inline contract rate calculator rendered as a category-style section
 * directly on the billings tab. Replaces the old banner + side-panel pattern.
 *
 * Layout:
 *   ┌─ Header ─ "Contract Charges · CQ…" + collapse + Reset ─┐
 *   │  Quantities strip (Containers · BoLs · Doc Sets)       │
 *   │  Rate breakdown table (live recalc on quantity edit)   │
 *   │  Footer: N items · ₱total                Apply button  │
 *   └────────────────────────────────────────────────────────┘
 *
 * Math, save logic, and multi-line trucking handling are reused from
 * the previous side-panel implementation.
 */

import { useState, useMemo, useCallback } from "react";
import { Check, Loader2, FileSpreadsheet, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { calculateContractBilling, calculateMultiLineTruckingBilling, type BookingQuantities } from "../../utils/contractRateEngine";
import { generateRateCardBillingItems } from "../../utils/rateCardToBilling";
import type { ContractRateMatrix, AppliedRate, TruckingLineItem } from "../../types/pricing";
import { toast } from "../ui/toast-utils";
import { supabase } from "../../utils/supabase/client";
import { RateBreakdownTable, formatCurrency } from "../pricing/shared/RateBreakdownTable";
import { QuantityDisplaySection } from "../pricing/shared/QuantityDisplaySection";
import { extractMultiLineSelectionsAndQuantities } from "../../utils/contractQuantityExtractor";

interface InlineRateCardSectionProps {
  booking: any;
  serviceType: string;
  rateMatrices: ContractRateMatrix[];
  contractId: string;
  contractNumber: string;
  customerName: string;
  currency: string;
  initialQuantities: BookingQuantities;
  bookingMode: string;
  selections?: Record<string, string>;
  truckingLineItems?: TruckingLineItem[];
  onRefresh: () => void;
  /** True if rate-card billing items already exist for this booking */
  alreadyApplied?: boolean;
  /** Count of already-applied rate card items (for success-state display) */
  appliedItemCount?: number;
  /** Sum of already-applied rate card item amounts (for success-state display) */
  appliedTotal?: number;
  /** Existing rate-card billing items for this booking — used to mark which rates are already applied. */
  appliedRateCardItems?: Array<{
    catalog_item_id?: string | null;
    description?: string | null;
    quotation_category?: string | null;
    quantity?: number | null;
    amount?: number | null;
  }>;
}

export function InlineRateCardSection({
  booking,
  serviceType,
  rateMatrices,
  contractId,
  contractNumber,
  customerName,
  currency,
  initialQuantities,
  bookingMode,
  selections,
  truckingLineItems,
  onRefresh,
  alreadyApplied = false,
  appliedItemCount = 0,
  appliedTotal = 0,
  appliedRateCardItems = [],
}: InlineRateCardSectionProps) {
  const [quantities, setQuantities] = useState<BookingQuantities>({ ...initialQuantities });
  const [isSaving, setIsSaving] = useState(false);
  // Collapse the calculator by default once the user has applied rates — they
  // can still expand to recalculate or apply additional rounds.
  const [collapsed, setCollapsed] = useState(alreadyApplied);

  const resetQuantities = useCallback(() => {
    setQuantities({ ...initialQuantities });
  }, [initialQuantities]);

  const isMultiLine = serviceType.toLowerCase() === "trucking"
    && truckingLineItems && truckingLineItems.length > 1;

  const multiLineResults = useMemo(() => {
    if (!isMultiLine) return null;
    const extractions = extractMultiLineSelectionsAndQuantities(truckingLineItems!, rateMatrices);
    return calculateMultiLineTruckingBilling(rateMatrices, bookingMode, extractions);
  }, [isMultiLine, rateMatrices, bookingMode, JSON.stringify(truckingLineItems)]);

  const calculation = useMemo(() => {
    if (isMultiLine) return { appliedRates: [] as AppliedRate[], total: 0 };
    return calculateContractBilling(rateMatrices, serviceType, bookingMode, quantities, selections);
  }, [rateMatrices, serviceType, bookingMode, quantities, selections, isMultiLine]);

  const grandTotal = isMultiLine && multiLineResults ? multiLineResults.grandTotal : calculation.total;
  const totalItems = isMultiLine && multiLineResults
    ? multiLineResults.lineResults.reduce((sum: number, lr: any) => sum + lr.appliedRates.length, 0)
    : calculation.appliedRates.length;

  const handleQuantityChange = (key: keyof BookingQuantities, value: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  };

  /** Stable identity for a contract-rate billing row — prefer catalog_item_id, fall back to category::description. */
  const rowKey = (r: { catalog_item_id?: string | null; quotation_category?: string | null; description?: string | null }) =>
    r.catalog_item_id ? `cat:${r.catalog_item_id}` : `desc:${r.quotation_category ?? ""}::${r.description ?? ""}`;

  /** Aggregated existing billings per key — sums quantity & amount across multiple rows
   *  (e.g., original apply + delta apply both share the same particular). */
  const appliedMap = useMemo(() => {
    const map = new Map<string, { quantity: number; amount: number }>();
    for (const item of appliedRateCardItems) {
      const k = rowKey(item);
      const prev = map.get(k) ?? { quantity: 0, amount: 0 };
      map.set(k, {
        quantity: prev.quantity + (item.quantity ?? 0),
        amount: prev.amount + (item.amount ?? 0),
      });
    }
    return map;
  }, [appliedRateCardItems]);

  /** Map an AppliedRate to the same key shape (uses category + particular for fallback). */
  const keyForAppliedRate = (r: AppliedRate) =>
    r.catalog_item_id ? `cat:${r.catalog_item_id}` : `desc:${r.category ?? `${serviceType} Charges`}::${r.particular}`;

  /** Per-rate status: fully applied, partially applied (qty grew), or not yet applied. */
  const rateStatus = (r: AppliedRate): {
    state: "none" | "applied" | "partial";
    appliedQty: number;
    appliedAmount: number;
    deltaQty: number;
    deltaAmount: number;
  } => {
    const existing = appliedMap.get(keyForAppliedRate(r));
    if (!existing) return { state: "none", appliedQty: 0, appliedAmount: 0, deltaQty: r.quantity, deltaAmount: r.subtotal };
    const deltaQty = r.quantity - existing.quantity;
    const deltaAmount = r.subtotal - existing.amount;
    if (deltaQty <= 0 && deltaAmount <= 0) {
      return { state: "applied", appliedQty: existing.quantity, appliedAmount: existing.amount, deltaQty: 0, deltaAmount: 0 };
    }
    return { state: "partial", appliedQty: existing.quantity, appliedAmount: existing.amount, deltaQty, deltaAmount };
  };

  /** Counts of pending work for the footer summary. */
  const pendingSummary = useMemo(() => {
    let newItems = 0;
    let topUps = 0;
    let pendingAmount = 0;
    for (const r of calculation.appliedRates) {
      const s = rateStatus(r);
      if (s.state === "none") {
        newItems += 1;
        pendingAmount += s.deltaAmount;
      } else if (s.state === "partial") {
        topUps += 1;
        pendingAmount += s.deltaAmount;
      }
    }
    return { newItems, topUps, pendingAmount };
  }, [calculation.appliedRates, appliedMap]);

  const allApplied = calculation.appliedRates.length > 0
    && pendingSummary.newItems === 0 && pendingSummary.topUps === 0;

  const handleApply = async () => {
    if (totalItems === 0) {
      toast.warning("No billing items to generate — all rates are zero or suppressed.");
      return;
    }
    setIsSaving(true);
    try {
      const bookingId = booking.bookingId || booking.id;
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
      });
      if (result.items.length === 0) {
        toast.warning("No billing items generated — check rate card configuration.");
        setIsSaving(false);
        return;
      }

      // Re-fetch existing rows fresh so we don't trust a stale prop snapshot.
      const { data: existingRows, error: fetchError } = await supabase
        .from('billing_line_items')
        .select('id, catalog_item_id, description, quotation_category, quantity, amount')
        .eq('booking_id', bookingId)
        .in('source_type', ['contract_rate', 'rate_card']);
      if (fetchError) throw new Error(fetchError.message);

      // Aggregate existing qty/amount per stable key.
      const existingMap = new Map<string, { quantity: number; amount: number }>();
      for (const row of existingRows ?? []) {
        const k = rowKey(row);
        const prev = existingMap.get(k) ?? { quantity: 0, amount: 0 };
        existingMap.set(k, {
          quantity: prev.quantity + (row.quantity ?? 0),
          amount: prev.amount + (row.amount ?? 0),
        });
      }

      // Classify each generated item: full insert, delta top-up, or skip.
      let newItemCount = 0;
      let topUpCount = 0;
      let skippedCount = 0;
      const billingRows: any[] = [];
      const now = new Date().toISOString();

      for (const item of result.items) {
        const k = rowKey(item);
        const existing = existingMap.get(k);
        const newQty = item.quantity ?? 1;
        const newAmount = item.amount;

        if (!existing) {
          newItemCount += 1;
          billingRows.push(buildBillingRow(item, newQty, newAmount, item.description, now));
          continue;
        }

        const deltaQty = newQty - existing.quantity;
        const deltaAmount = newAmount - existing.amount;
        if (deltaQty <= 0 && deltaAmount <= 0) {
          skippedCount += 1;
          continue;
        }

        // Top-up: insert a delta row preserving audit trail (don't mutate the original).
        topUpCount += 1;
        const deltaDesc = deltaQty > 0
          ? `${item.description} (additional ${deltaQty} unit${deltaQty !== 1 ? "s" : ""})`
          : `${item.description} (rate adjustment)`;
        billingRows.push(buildBillingRow(item, Math.max(deltaQty, 0), deltaAmount, deltaDesc, now));
      }

      if (billingRows.length === 0) {
        toast.info(
          skippedCount === 1
            ? "That item is already applied to this booking."
            : `All ${skippedCount} items are already applied to this booking.`
        );
        setIsSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from('billing_line_items').insert(billingRows);
      if (insertError) throw new Error(insertError.message);

      const insertedTotal = billingRows.reduce((s, r) => s + (r.amount ?? 0), 0);
      const parts: string[] = [];
      if (newItemCount > 0) parts.push(`${newItemCount} new item${newItemCount !== 1 ? "s" : ""}`);
      if (topUpCount > 0) parts.push(`${topUpCount} top-up${topUpCount !== 1 ? "s" : ""} for added units`);
      const tail = skippedCount > 0
        ? ` Skipped ${skippedCount} already up-to-date item${skippedCount !== 1 ? "s" : ""}.`
        : "";
      toast.success(`Applied ${parts.join(" + ")} (${formatCurrency(insertedTotal, currency)}).${tail}`);
      onRefresh();
    } catch (error) {
      console.error("Error saving rate card billing items:", error);
      toast.error(`Failed to save billing items: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  function buildBillingRow(
    sourceItem: any,
    quantity: number,
    amount: number,
    description: string,
    createdAt: string,
  ) {
    return {
      id: `BIL-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      description,
      service_type: sourceItem.service_type,
      amount,
      quantity,
      currency: sourceItem.currency,
      is_taxed: sourceItem.is_taxed ?? false,
      status: 'unbilled',
      source_type: 'contract_rate',
      source_id: contractId,
      quotation_category: sourceItem.quotation_category,
      booking_id: sourceItem.booking_id,
      customer_name: customerName,
      project_number: booking.projectNumber || "",
      created_at: createdAt,
      catalog_item_id: sourceItem.catalog_item_id ?? null,
      catalog_snapshot: sourceItem.catalog_snapshot ?? null,
    };
  }

  return (
    <div className="rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--theme-border-default)]">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] shrink-0"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <div className="w-7 h-7 rounded-md bg-[var(--theme-bg-surface)] flex items-center justify-center shrink-0">
          {alreadyApplied ? (
            <Check size={14} className="text-[var(--theme-status-success-fg)]" />
          ) : (
            <FileSpreadsheet size={14} className="text-[var(--theme-action-primary-bg)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--theme-text-primary)]">
              Contract Charges
            </span>
            {alreadyApplied && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--theme-bg-surface-tint)] border border-[var(--theme-status-success-border)] text-[var(--theme-status-success-fg)] font-medium">
                Applied · {appliedItemCount} {appliedItemCount === 1 ? "item" : "items"} · {formatCurrency(appliedTotal, currency)}
              </span>
            )}
            {!alreadyApplied && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-muted)] font-medium">
                {totalItems} {totalItems === 1 ? "item" : "items"}
              </span>
            )}
            <span className="text-[11px] text-[var(--theme-text-muted)]">·</span>
            <span className="text-[12px] text-[var(--theme-text-muted)]">
              {contractNumber} · {serviceType} · {bookingMode}
              {isMultiLine ? ` · ${truckingLineItems!.length} destinations` : ""}
            </span>
          </div>
        </div>
        {!collapsed && (
          <button
            onClick={resetQuantities}
            className="flex items-center gap-1.5 text-[12px] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors shrink-0"
          >
            <RefreshCw size={12} />
            Reset
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Quantities strip */}
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

          {/* Rate breakdown */}
          {isMultiLine && multiLineResults ? (
            <div className="px-6 py-4">
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
                    rateStatus={rateStatus}
                  />
                </div>
              ))}
              <div className="mt-6 pt-4 border-t border-[var(--theme-border-default)] flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[var(--theme-text-primary)]">Grand Total</span>
                <span className="text-[14px] font-bold text-[var(--theme-action-primary-bg)]">
                  {formatCurrency(multiLineResults.grandTotal, currency)}
                </span>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4">
              {(() => {
                // Group applied rates by category (mirrors the contract's Category → Line Item structure)
                const groups = new Map<string, AppliedRate[]>();
                for (const r of calculation.appliedRates) {
                  const key = r.category || `${serviceType} Charges`;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(r);
                }
                const entries = Array.from(groups.entries());
                if (entries.length === 0) {
                  return (
                    <RateBreakdownTable
                      appliedRates={calculation.appliedRates}
                      total={calculation.total}
                      currency={currency}
                      rateStatus={rateStatus}
                    />
                  );
                }
                return (
                  <>
                    {entries.map(([categoryName, rates], idx) => {
                      const subtotal = rates.reduce((s, r) => s + r.subtotal, 0);
                      return (
                        <div key={categoryName} className={idx > 0 ? "mt-6" : ""}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-[var(--theme-text-primary)]">
                                {categoryName}
                              </span>
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-muted)] font-medium">
                                {rates.length} {rates.length === 1 ? "item" : "items"}
                              </span>
                            </div>
                            <div className="text-[12px] font-medium text-[var(--theme-action-primary-bg)]">
                              {formatCurrency(subtotal, currency)}
                            </div>
                          </div>
                          <RateBreakdownTable
                            appliedRates={rates}
                            total={subtotal}
                            currency={currency}
                            hideTotal={true}
                            rateStatus={rateStatus}
                          />
                        </div>
                      );
                    })}
                    <div className="mt-6 pt-4 border-t border-[var(--theme-border-default)] flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[var(--theme-text-primary)]">Total</span>
                      <span className="text-[14px] font-bold text-[var(--theme-action-primary-bg)]">
                        {formatCurrency(calculation.total, currency)}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--theme-border-default)]">
            <div className="text-[13px] text-[var(--theme-text-muted)]">
              {totalItems} item{totalItems !== 1 ? "s" : ""} ·{" "}
              <span className="font-semibold text-[var(--theme-text-primary)]">
                {formatCurrency(grandTotal, currency)}
              </span>
              {alreadyApplied && !allApplied && (
                <span className="ml-2 text-[11px] text-[var(--theme-text-muted)]">
                  {pendingSummary.newItems > 0 && pendingSummary.topUps > 0
                    ? `${pendingSummary.newItems} new + ${pendingSummary.topUps} top-up · ${formatCurrency(pendingSummary.pendingAmount, currency)} pending`
                    : pendingSummary.newItems > 0
                      ? `${pendingSummary.newItems} new item${pendingSummary.newItems !== 1 ? "s" : ""} pending · ${formatCurrency(pendingSummary.pendingAmount, currency)}`
                      : `${pendingSummary.topUps} top-up${pendingSummary.topUps !== 1 ? "s" : ""} for added units · ${formatCurrency(pendingSummary.pendingAmount, currency)}`}
                </span>
              )}
              {allApplied && (
                <span className="ml-2 text-[11px] text-[var(--theme-status-success-fg)]">
                  Everything is up to date
                </span>
              )}
            </div>
            <button
              onClick={handleApply}
              disabled={isSaving || totalItems === 0 || allApplied}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
              style={{
                backgroundColor: isSaving || totalItems === 0 || allApplied ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
                cursor: isSaving || totalItems === 0 || allApplied ? "not-allowed" : "pointer",
              }}
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {allApplied
                ? "All Applied"
                : alreadyApplied
                  ? (pendingSummary.topUps > 0 && pendingSummary.newItems === 0
                      ? "Bill Added Units"
                      : pendingSummary.newItems > 0 && pendingSummary.topUps === 0
                        ? "Bill New Items"
                        : "Sync to Billings")
                  : "Apply to Billings"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
