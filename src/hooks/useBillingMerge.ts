import { useMemo } from "react";
import type { BillingItem } from "../components/shared/billings/UnifiedBillingsTab";
import type { QuotationNew } from "../types/pricing";
import { resolveBookingIdForService } from "../utils/financialSelectors";

interface UseBillingMergeProps {
  items: BillingItem[];
  quotation?: QuotationNew;
  projectId: string;
  bookingId?: string;
  linkedBookings?: any[];
}

export function useBillingMerge({
  items,
  quotation,
  projectId,
  bookingId,
  linkedBookings,
}: UseBillingMergeProps) {
  const mergedItems = useMemo(() => {
    const combined = items.map((item) => ({ ...item }));
    const realItemIndices = new Map<string, number>();

    combined.forEach((item, index) => {
      const sourceId = item.source_quotation_item_id || item.source_id;
      if (sourceId) {
        realItemIndices.set(sourceId, index);
      }
    });

    if (quotation && quotation.selling_price) {
      quotation.selling_price.forEach((category) => {
        category.line_items.forEach((item) => {
          const sourceId = item.id;
          const existingIndex = realItemIndices.get(sourceId);
          const resolvedBookingId = resolveBookingIdForService({
            serviceType: item.service,
            bookingId,
            linkedBookings,
          });

          if (existingIndex !== undefined) {
            const existingItem = combined[existingIndex];

            if (existingItem.status === "unbilled") {
              combined[existingIndex] = {
                ...existingItem,
                description: item.description,
                service_type: item.service || existingItem.service_type || "General",
                amount: item.amount,
                currency: item.currency,
                quotation_category: category.category_name,
                booking_id: resolveBookingIdForService({
                  serviceType: item.service || existingItem.service_type,
                  bookingId: existingItem.booking_id || bookingId,
                  linkedBookings,
                }),
                quantity: item.quantity,
                forex_rate: item.forex_rate,
                is_taxed: item.is_taxed,
                amount_added: item.amount_added,
                percentage_added: item.percentage_added,
                base_cost: item.base_cost,
              };
            }

            return;
          }

          const virtualItem: BillingItem = {
            id: `virtual-${item.id}`,
            source_id: item.id,
            source_quotation_item_id: item.id,
            source_type: "quotation_item",
            is_virtual: true,
            created_at: quotation.created_at || new Date().toISOString(),
            service_type: item.service || "General",
            description: item.description,
            amount: item.amount,
            currency: item.currency,
            status: "unbilled",
            quotation_category: category.category_name,
            booking_id: resolvedBookingId || undefined,
            quantity: item.quantity,
            forex_rate: item.forex_rate,
            is_taxed: item.is_taxed,
            amount_added: item.amount_added,
            percentage_added: item.percentage_added,
            base_cost: item.base_cost,
          };

          combined.push(virtualItem);
        });
      });
    }

    return combined;
  }, [items, quotation, projectId, bookingId, linkedBookings]);

  return mergedItems;
}
