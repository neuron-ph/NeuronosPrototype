/**
 * useContractBillings — Booking-aggregated billing items for a contract.
 *
 * Phase 5B: Rewritten to aggregate by linked booking IDs instead of contract_id.
 * Fetches ALL billing items from the standard `billing:` KV prefix
 * (via GET /accounting/billing-items) and filters client-side where
 * `booking_id` or `project_number` matches any of the linked booking IDs.
 *
 * This makes the Contract Billings tab a true read-only aggregate of all
 * booking-level billing items — matching the "Booking-Owned Billings" architecture.
 *
 * @see /docs/blueprints/CONTRACT_BILLINGS_REWORK_BLUEPRINT.md — Phase 5B
 * @see /hooks/useProjectFinancials.ts — Reference pattern for booking-level filtering
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "../utils/api";
import { toast } from "../components/ui/toast-utils";
import type { BillingItem } from "../components/shared/billings/UnifiedBillingsTab";

export interface BookingBillingSummary {
  bookingId: string;
  items: BillingItem[];
  totalAmount: number;
  unbilledAmount: number;
}

export interface ContractBillingsData {
  /** All billing items across linked bookings */
  billingItems: BillingItem[];
  /** Loading state */
  isLoading: boolean;
  /** Re-fetch billing items */
  refresh: () => Promise<void>;
  /** Items grouped by booking ID with per-booking subtotals */
  groupedByBooking: BookingBillingSummary[];
  /** Summary totals across all bookings */
  summary: {
    totalAmount: number;
    unbilledAmount: number;
    billedAmount: number;
    paidAmount: number;
    draftCount: number;
  };
}

/**
 * @param linkedBookingIds — Array of booking IDs linked to this contract.
 *   Pass `linkedBookings.map(b => b.bookingId || b.id)` from ContractDetailView.
 */
export function useContractBillings(linkedBookingIds: string[]): ContractBillingsData {
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Stable stringified key so useCallback doesn't thrash on array reference changes
  const bookingIdsKey = JSON.stringify(linkedBookingIds.filter(Boolean).sort());

  const fetchBillings = useCallback(async () => {
    const ids: string[] = JSON.parse(bookingIdsKey);

    if (ids.length === 0) {
      setBillingItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const response = await apiFetch(`/accounting/billing-items`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        const validIds = new Set(ids);

        // Client-side filter: items where booking_id OR project_number matches any linked booking
        const matchedItems = data.data.filter((item: any) => {
          if (item.booking_id && validIds.has(item.booking_id)) return true;
          if (item.project_number && validIds.has(item.project_number)) return true;
          if (item.source_booking_id && validIds.has(item.source_booking_id)) return true;
          return false;
        });

        // Map to BillingItem shape (ensure all fields exist)
        const mapped: BillingItem[] = matchedItems.map((item: any) => ({
          id: item.id,
          created_at: item.created_at || new Date().toISOString(),
          service_type: item.service_type || "General",
          description: item.description || item.purpose || "",
          amount: item.amount || 0,
          currency: item.currency || "PHP",
          status: item.status === "draft" ? "unbilled" : (item.status || item.billing_status || "unbilled"),
          quotation_category: item.quotation_category || item.service_type || "General",
          booking_id: item.booking_id || item.source_booking_id || item.project_number || "",
          source_id: item.source_id,
          source_quotation_item_id: item.source_quotation_item_id,
          source_type: item.source_type,
          is_virtual: false,
          // Extended fields
          quantity: item.quantity || item.applied_quantity || 1,
          forex_rate: item.forex_rate || 1,
          is_taxed: item.is_taxed || false,
          amount_added: item.amount_added || 0,
          percentage_added: item.percentage_added || 0,
          base_cost: item.base_cost || 0,
          // Contract-specific metadata (pass through)
          contract_id: item.contract_id,
          contract_number: item.contract_number,
          source_booking_id: item.source_booking_id,
          applied_rate: item.applied_rate,
          applied_quantity: item.applied_quantity,
          rule_applied: item.rule_applied,
          mode_column: item.mode_column,
        }));

        setBillingItems(mapped);
      } else {
        setBillingItems([]);
      }
    } catch (error) {
      console.error("Error fetching contract billing items (booking aggregation):", error);
      toast.error("Failed to load contract billings");
      setBillingItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [bookingIdsKey]);

  useEffect(() => {
    fetchBillings();
  }, [fetchBillings]);

  // Group items by booking ID
  const groupedByBooking = useMemo((): BookingBillingSummary[] => {
    const groups = new Map<string, BillingItem[]>();

    for (const item of billingItems) {
      const bid = item.booking_id || "unknown";
      if (!groups.has(bid)) groups.set(bid, []);
      groups.get(bid)!.push(item);
    }

    return Array.from(groups.entries()).map(([bookingId, items]) => ({
      bookingId,
      items,
      totalAmount: items.reduce((sum, i) => sum + (i.amount || 0), 0),
      unbilledAmount: items.filter(i => i.status === "unbilled").reduce((sum, i) => sum + (i.amount || 0), 0),
    }));
  }, [billingItems]);

  // Compute summary
  const summary = useMemo(() => ({
    totalAmount: billingItems.reduce((sum, i) => sum + (i.amount || 0), 0),
    unbilledAmount: billingItems
      .filter((i) => i.status === "unbilled")
      .reduce((sum, i) => sum + (i.amount || 0), 0),
    billedAmount: billingItems
      .filter((i) => i.status === "billed")
      .reduce((sum, i) => sum + (i.amount || 0), 0),
    paidAmount: billingItems
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + (i.amount || 0), 0),
    draftCount: billingItems.filter((i) => i.status === "unbilled").length,
  }), [billingItems]);

  return {
    billingItems,
    isLoading,
    refresh: fetchBillings,
    groupedByBooking,
    summary,
  };
}