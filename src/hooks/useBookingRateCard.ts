/**
 * useBookingRateCard — Fetches parent contract's rate matrices for a booking.
 *
 * If the booking has a `contract_id`, this hook fetches the parent contract
 * quotation and extracts its `rate_matrices`. Returns null if the booking
 * is not linked to a contract or if the contract has no rate matrices.
 *
 * @see /docs/blueprints/CONTRACT_BILLINGS_REWORK_BLUEPRINT.md — Phase 5D, Task 5D.1
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";
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
  const [rateMatrices, setRateMatrices] = useState<ContractRateMatrix[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contractNumber, setContractNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [currency, setCurrency] = useState("PHP");

  const isContractBooking = Boolean(contractId);

  const fetchContract = useCallback(async () => {
    if (!contractId) {
      setRateMatrices([]);
      return;
    }

    try {
      setIsLoading(true);

      // Fetch all quotations and find the parent contract by ID
      const response = await apiFetch(`/quotations/${contractId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        const contract = data.data.find((q: any) => q.id === contractId);

        if (contract) {
          setRateMatrices(contract.rate_matrices || []);
          setContractNumber(contract.quote_number || "");
          setCustomerName(contract.customer_name || "");
          setCurrency(contract.currency || "PHP");
        } else {
          console.warn(`useBookingRateCard: Contract ${contractId} not found`);
          setRateMatrices([]);
        }
      }
    } catch (error) {
      console.error("Error fetching contract for rate card:", error);
      setRateMatrices([]);
    } finally {
      setIsLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  return {
    rateMatrices,
    isLoading,
    isContractBooking,
    contractId: contractId || "",
    contractNumber,
    customerName,
    currency,
  };
}