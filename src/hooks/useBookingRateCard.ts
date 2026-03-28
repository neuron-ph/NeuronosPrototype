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
}

/**
 * @param contractId — The booking's `contract_id` field (undefined/empty if not a contract booking)
 */
export function useBookingRateCard(contractId?: string): BookingRateCardData {
  const { data } = useQuery({
    queryKey: queryKeys.contracts.rateCard(contractId ?? ""),
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", contractId!)
        .maybeSingle();

      if (error) throw error;
      if (!row) return null;

      return {
        rateMatrices: (row.rate_matrices ?? []) as ContractRateMatrix[],
        contractNumber: row.quote_number ?? "",
        customerName: row.customer_name ?? "",
        currency: row.currency ?? "PHP",
      };
    },
    enabled: !!contractId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    rateMatrices: data?.rateMatrices ?? [],
    isLoading: !data,
    isContractBooking: !!contractId,
    contractId: contractId ?? "",
    contractNumber: data?.contractNumber ?? "",
    customerName: data?.customerName ?? "",
    currency: data?.currency ?? "PHP",
  };
}
