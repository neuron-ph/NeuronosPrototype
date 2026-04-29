/**
 * BookingRateCardButton (now renders as a contextual banner)
 *
 * Renders inline within the billings tab as contextual awareness — not a header button.
 * When no rate card items exist: shows a full-width banner prompting the user to review rates.
 * When rate card items exist: shows a subtle single-line confirmation note.
 * When not a contract booking: renders nothing.
 *
 * Self-contained: uses `useBookingRateCard` internally to fetch contract data.
 *
 * REFACTORED (Phase 1.5): Button → contextual banner positioned between filters and table.
 *
 * @see /docs/blueprints/RATE_CALCULATION_SHEET_BLUEPRINT.md
 */

import { useBookingRateCard } from "../../hooks/useBookingRateCard";
import { hasExistingRateCardBilling } from "../../utils/rateCardToBilling";
import { deriveQuantitiesFromBooking, extractTruckingSelections, normalizeTruckingLineItems, extractMultiLineSelectionsAndQuantities } from "../../utils/contractQuantityExtractor";
import { InlineRateCardSection } from "./InlineRateCardSection";
import type { BillingItem } from "../shared/billings/UnifiedBillingsTab";
import type { TruckingLineItem } from "../../types/pricing";

interface BookingRateCardButtonProps {
  /** The booking object — needs bookingId, mode, containerNumbers, etc. */
  booking: any;
  /** Service type of the booking (e.g., "Brokerage", "Forwarding", "Trucking") */
  serviceType: string;
  /** Current billing items for this booking (for duplicate detection) */
  existingBillingItems: BillingItem[];
  /** Called after items are saved to refresh the billing items list */
  onRefresh: () => void;
}

export function BookingRateCardButton({
  booking,
  serviceType,
  existingBillingItems,
  onRefresh,
}: BookingRateCardButtonProps) {
  const contractId = booking.contract_id || booking.contractId;
  const rateCard = useBookingRateCard(contractId);

  // Don't render if not a contract booking or no rate matrices
  if (!rateCard.isContractBooking || rateCard.isLoading) return null;
  if (rateCard.rateMatrices.length === 0) return null;

  const bookingId = booking.bookingId || booking.id;
  const mode = booking.mode || "FCL";
  const alreadyGenerated = hasExistingRateCardBilling(existingBillingItems, bookingId);

  // Derive quantities for the sheet's initial state
  const initialQuantities = deriveQuantitiesFromBooking(booking, serviceType);

  // ✨ Selection group / Multi-line: derive selections for trucking alternative row filtering
  const truckingLineItems = serviceType.toLowerCase() === "trucking"
    ? normalizeTruckingLineItems(booking)
    : undefined;
  const isMultiLine = truckingLineItems && truckingLineItems.length > 1;

  const selections = serviceType.toLowerCase() === "trucking"
    ? (isMultiLine
        ? (() => {
            // Merge all line items' selections
            const extractions = extractMultiLineSelectionsAndQuantities(truckingLineItems!, rateCard.rateMatrices);
            const merged: Record<string, string> = {};
            for (const ext of extractions) {
              if (ext.selections) Object.assign(merged, ext.selections);
            }
            return Object.keys(merged).length > 0 ? merged : undefined;
          })()
        : extractTruckingSelections(
            { truckType: booking.truckType, deliveryAddress: booking.deliveryAddress },
            rateCard.rateMatrices
          )
      )
    : undefined;

  // Count items previously applied from this rate card (used by the inline
  // section to render a "Applied" success state while still showing the calc).
  const appliedRateCardItems = existingBillingItems.filter(
    (item) =>
      (item.source_type === "rate_card" || item.source_type === "contract_rate") &&
      item.booking_id === bookingId
  );
  const appliedTotal = appliedRateCardItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <InlineRateCardSection
      booking={booking}
      serviceType={serviceType}
      rateMatrices={rateCard.rateMatrices}
      contractId={rateCard.contractId}
      contractNumber={rateCard.contractNumber}
      customerName={rateCard.customerName}
      currency={rateCard.currency}
      initialQuantities={initialQuantities}
      bookingMode={mode}
      selections={selections}
      truckingLineItems={truckingLineItems}
      onRefresh={onRefresh}
      alreadyApplied={alreadyGenerated}
      appliedItemCount={appliedRateCardItems.length}
      appliedTotal={appliedTotal}
      appliedRateCardItems={appliedRateCardItems}
    />
  );
}