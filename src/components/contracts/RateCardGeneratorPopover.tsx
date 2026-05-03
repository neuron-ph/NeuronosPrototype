/**
 * RateCardGeneratorPopover
 *
 * Inline popover for the "Generate from Rate Card" action on Contract Billings.
 * Lists unbilled bookings with auto-detected quantities, lets the user select
 * one or all, runs the rate engine client-side, and returns BillingItem[] via callback.
 *
 * @see /docs/blueprints/CONTRACT_BILLINGS_REWORK_BLUEPRINT.md — Phase 3, Task 3.1
 */

import { useState, useRef, useEffect } from "react";
import { Zap, ChevronDown, Check, AlertTriangle, Loader2, X } from "lucide-react";
import type { ContractRateMatrix } from "../../types/pricing";
import type { BillingItem } from "../shared/billings/UnifiedBillingsTab";
import { deriveQuantitiesFromBooking } from "../../utils/contractQuantityExtractor";
import {
  generateRateCardBillingItems,
  hasExistingRateCardBilling,
} from "../../utils/rateCardToBilling";

// ============================================
// TYPES
// ============================================

interface RateCardGeneratorPopoverProps {
  /** All bookings linked to this contract */
  linkedBookings: any[];
  /** Contract's rate matrices */
  rateMatrices: ContractRateMatrix[];
  /** Existing billing items (for duplicate detection) */
  existingBillingItems: BillingItem[];
  /** Contract quotation ID */
  contractId: string;
  /** Contract quote number (e.g., "CTR-2026-001") */
  contractNumber: string;
  /** Customer name */
  customerName?: string;
  /** Currency */
  currency?: string;
  /** Callback when items are generated */
  onGenerate: (items: BillingItem[]) => void;
}

// ============================================
// COMPONENT
// ============================================

export function RateCardGeneratorPopover({
  linkedBookings,
  rateMatrices,
  existingBillingItems,
  contractId,
  contractNumber,
  customerName,
  currency,
  onGenerate,
}: RateCardGeneratorPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Build booking rows with derived quantities and billing status
  const bookingRows = linkedBookings.map((booking) => {
    const bookingId = booking.bookingId || booking.id;
    const bookingNumber = (booking as any).booking_number || (booking as any).bookingNumber || "—";
    const serviceType = booking.serviceType || booking.bookingType || "Brokerage";
    const mode = booking.mode || "FCL";
    const quantities = deriveQuantitiesFromBooking(booking, serviceType);
    const alreadyBilled = hasExistingRateCardBilling(existingBillingItems, bookingId);

    const hasMatrix = rateMatrices.some(
      (m) => m.service_type.toLowerCase() === serviceType.toLowerCase()
    );

    return {
      booking,
      bookingId,
      bookingNumber,
      serviceType,
      mode,
      quantities,
      alreadyBilled,
      hasMatrix,
    };
  });

  const unbilledRows = bookingRows.filter((r) => !r.alreadyBilled && r.hasMatrix);

  const handleGenerateForBooking = (row: (typeof bookingRows)[0]) => {
    setGenerating(row.bookingId);

    // Small timeout to show loading state
    setTimeout(() => {
      const result = generateRateCardBillingItems({
        rateMatrices,
        serviceType: row.serviceType,
        mode: row.mode,
        quantities: row.quantities,
        bookingId: row.bookingId,
        contractId,
        contractNumber,
        customerName,
        currency,
      });

      if (result.items.length > 0) {
        onGenerate(result.items);
      }

      setGenerating(null);
      setIsOpen(false);
    }, 150);
  };

  const handleGenerateAll = () => {
    setGenerating("all");

    setTimeout(() => {
      const allItems: BillingItem[] = [];

      for (const row of unbilledRows) {
        const result = generateRateCardBillingItems({
          rateMatrices,
          serviceType: row.serviceType,
          mode: row.mode,
          quantities: row.quantities,
          bookingId: row.bookingId,
          contractId,
          contractNumber,
          customerName,
          currency,
        });
        allItems.push(...result.items);
      }

      if (allItems.length > 0) {
        onGenerate(allItems);
      }

      setGenerating(null);
      setIsOpen(false);
    }, 150);
  };

  // Format quantities for display
  const formatQuantities = (qty: any) => {
    const parts: string[] = [];
    if (qty.containers && qty.containers > 0) parts.push(`${qty.containers} ctr`);
    if (qty.bls && qty.bls > 0) parts.push(`${qty.bls} BL`);
    if (qty.shipments && qty.shipments > 0) parts.push(`${qty.shipments} shpt`);
    if (qty.sets && qty.sets > 1) parts.push(`${qty.sets} sets`);
    return parts.length > 0 ? parts.join(", ") : "1 unit";
  };

  const getServiceColor = (service: string) => {
    switch (service.toLowerCase()) {
      case "brokerage": return "#0F766E";
      case "forwarding": return "#2563EB";
      case "trucking": return "#D97706";
      case "marine insurance": return "#7C3AED";
      default: return "#6B7280";
    }
  };

  if (linkedBookings.length === 0 || rateMatrices.length === 0) {
    return null; // Nothing to show
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] rounded-lg hover:bg-[var(--theme-bg-surface-tint)] transition-colors font-medium text-[14px]"
      >
        <Zap size={16} />
        Generate from Rate Card
        <ChevronDown size={14} style={{ opacity: 0.5 }} />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "440px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "10px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 10px -5px rgba(0,0,0,0.04)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--theme-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                Smart Pre-Fill from Rate Card
              </div>
              <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "2px" }}>
                {contractNumber} — {unbilledRows.length} unbilled booking{unbilledRows.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ color: "var(--theme-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Generate All button */}
          {unbilledRows.length > 1 && (
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--theme-border-subtle)",
                backgroundColor: "var(--theme-bg-page)",
              }}
            >
              <button
                onClick={handleGenerateAll}
                disabled={generating !== null}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  backgroundColor: "var(--theme-action-primary-bg)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: generating ? "not-allowed" : "pointer",
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating === "all" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Generate All ({unbilledRows.length} bookings)
              </button>
            </div>
          )}

          {/* Booking list */}
          <div style={{ maxHeight: "320px", overflow: "auto" }}>
            {bookingRows.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
                No bookings linked to this contract yet.
              </div>
            ) : (
              bookingRows.map((row) => (
                <div
                  key={row.bookingId}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--neuron-pill-inactive-bg)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    opacity: row.alreadyBilled ? 0.55 : 1,
                  }}
                >
                  {/* Left: Booking info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                        {row.bookingNumber}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          color: getServiceColor(row.serviceType),
                          backgroundColor: `${getServiceColor(row.serviceType)}10`,
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {row.serviceType}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                      {row.mode} — {formatQuantities(row.quantities)}
                    </div>
                  </div>

                  {/* Right: Action */}
                  {row.alreadyBilled ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "12px",
                        color: "var(--theme-status-success-fg)",
                        fontWeight: 500,
                      }}
                    >
                      <Check size={14} />
                      Generated
                    </div>
                  ) : !row.hasMatrix ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "12px",
                        color: "var(--theme-status-warning-fg)",
                        fontWeight: 500,
                      }}
                      title={`No rate matrix found for "${row.serviceType}" in this contract`}
                    >
                      <AlertTriangle size={14} />
                      No matrix
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGenerateForBooking(row)}
                      disabled={generating !== null}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--theme-action-primary-bg)",
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        border: "1px solid var(--theme-status-success-border)",
                        borderRadius: "5px",
                        cursor: generating ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {generating === row.bookingId ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Zap size={12} />
                      )}
                      Generate
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
