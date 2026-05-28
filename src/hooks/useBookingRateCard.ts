/**
 * useBookingRateCard — Fetches parent contract's rate matrices for a booking.
 *
 * If the booking has a `contract_id`, this hook fetches the parent contract
 * quotation and extracts its `rate_matrices`. Returns null if the booking
 * is not linked to a contract or if the contract has no rate matrices.
 *
 * @see /docs/blueprints/CONTRACT_BILLINGS_REWORK_BLUEPRINT.md — Phase 5D, Task 5D.1
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import type { ContractRateMatrix } from "../types/pricing";

export interface BookingRateCardData {
  /** Rate matrices from the parent contract (empty if not a contract booking) */
  rateMatrices: ContractRateMatrix[];
  /** Whether the hook is currently fetching */
  isLoading: boolean;
  /** Whether this booking is linked to a contract */
  isContractBooking: boolean;
  /** The parent contract's quotation ID */
  contractId: string;
  /** The parent contract's quote number (e.g., "CTR-2026-001") */
  contractNumber: string;
  /** Customer name from the contract */
  customerName: string;
  /** Currency from the contract */
  currency: string;
  /** Version number of the pinned rate snapshot (undefined if using live contract rates) */
  rateVersionNumber?: number;
}

/**
 * @param contractId — The booking's `contract_id` field (undefined/empty if not a contract booking)
 * @param rateVersionId — Optional pinned rate version ID. When provided, rates come from
 *   the `contract_rate_versions` table instead of the live contract.
 */
export function useBookingRateCard(contractId?: string, rateVersionId?: string): BookingRateCardData {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.contracts.rateCard(rateVersionId || contractId || ""),
    queryFn: async () => {
      // If a pinned version exists, fetch rates from the version table
      if (rateVersionId) {
        const [versionRes, contractRes] = await Promise.all([
          supabase
            .from("contract_rate_versions")
            .select("rate_matrices, version_number")
            .eq("id", rateVersionId)
            .maybeSingle(),
          supabase
            .from("quotations")
            .select("quote_number, customer_name, currency")
            .eq("id", contractId!)
            .maybeSingle(),
        ]);

        if (versionRes.error) throw versionRes.error;
        if (!versionRes.data) return null;

        return {
          rateMatrices: (versionRes.data.rate_matrices ?? []) as ContractRateMatrix[],
          contractNumber: contractRes.data?.quote_number ?? "",
          customerName: contractRes.data?.customer_name ?? "",
          currency: contractRes.data?.currency ?? "PHP",
          rateVersionNumber: versionRes.data.version_number as number,
        };
      }

      // Fallback: fetch from live contract (legacy bookings without version pinning)
      const { data: row, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", contractId!)
        .maybeSingle();

      if (error) throw error;
      if (!row) return null;

      const merged = { ...row.details, ...row };

      return {
        rateMatrices: (merged.rate_matrices ?? []) as ContractRateMatrix[],
        contractNumber: merged.quote_number ?? "",
        customerName: merged.customer_name ?? "",
        currency: merged.currency ?? "PHP",
        rateVersionNumber: undefined as number | undefined,
      };
    },
    enabled: !!contractId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    rateMatrices: data?.rateMatrices ?? [],
    isLoading,
    isContractBooking: !!contractId,
    contractId: contractId ?? "",
    contractNumber: data?.contractNumber ?? "",
    customerName: data?.customerName ?? "",
    currency: data?.currency ?? "PHP",
    rateVersionNumber: data?.rateVersionNumber,
  };
}
