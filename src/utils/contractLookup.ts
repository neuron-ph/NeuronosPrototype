/**
 * Contract Lookup Utilities
 *
 * Shared functions for detecting and fetching active contracts.
 * Used by:
 *   - ContractDetectionBanner (operations booking panels)
 *   - QuotationBuilderV3 (contract rate bridge for Standard brokerage)
 *   - CreateBookingFromContractPanel (contract direct bookings)
 *
 * DRY: Centralizes contract API calls that were previously inlined
 * in ContractDetectionBanner.tsx.
 *
 * @see /docs/blueprints/CONTRACT_FLOWCHART_INTEGRATION_BLUEPRINT.md - Phase 1
 */

import type { ContractSummary, QuotationNew } from "../types/pricing";
import { apiFetch } from "./api";

// ============================================
// ACTIVE CONTRACT DETECTION
// ============================================

/**
 * Fetch active contracts for a customer by name.
 * Calls the existing `GET /contracts/active` endpoint.
 *
 * @param customerName - Customer name to match (case-insensitive server-side)
 * @returns Array of ContractSummary (may be empty)
 */
export async function fetchActiveContractsForCustomer(
  customerName: string
): Promise<ContractSummary[]> {
  if (!customerName || customerName.trim().length < 3) {
    return [];
  }

  try {
    const response = await apiFetch(
      `/contracts/active?customer_name=${encodeURIComponent(customerName.trim())}`
    );

    if (!response.ok) {
      console.error(`[contractLookup] Failed to fetch contracts: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.contracts || []) as ContractSummary[];
  } catch (err) {
    console.error("[contractLookup] Error fetching active contracts:", err);
    return [];
  }
}

/**
 * Find the best matching contract for a customer + service type.
 * Returns the first active contract that covers the given service,
 * or the first active contract if none match the service.
 *
 * @param customerName - Customer name to match
 * @param serviceType - Optional service type to prioritize (e.g., "Brokerage")
 * @returns The best matching ContractSummary, or null
 */
export async function findContractForCustomerService(
  customerName: string,
  serviceType?: string
): Promise<ContractSummary | null> {
  const contracts = await fetchActiveContractsForCustomer(customerName);

  if (contracts.length === 0) return null;

  if (serviceType) {
    const serviceMatch = contracts.find((c) =>
      c.services.some(
        (s) => s.toLowerCase() === serviceType.toLowerCase()
      )
    );
    if (serviceMatch) return serviceMatch;
  }

  // Fallback: return first active contract
  return contracts[0];
}

// ============================================
// FULL CONTRACT FETCH
// ============================================

/**
 * Fetch the full contract quotation by ID.
 * Returns the complete QuotationNew with rate_matrices, scope, T&C, etc.
 *
 * @param contractId - The contract quotation ID
 * @returns Full QuotationNew or null
 */
export async function fetchFullContract(
  contractId: string
): Promise<QuotationNew | null> {
  if (!contractId) return null;

  try {
    const response = await apiFetch(
      `/quotations/${contractId}`
    );

    if (!response.ok) {
      console.error(`[contractLookup] Failed to fetch contract ${contractId}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Validate it's actually a contract
    const quotation = data.data || data;
    if (quotation.quotation_type !== "contract") {
      console.warn(`[contractLookup] Quotation ${contractId} is not a contract (type: ${quotation.quotation_type})`);
      return null;
    }

    return quotation as QuotationNew;
  } catch (err) {
    console.error(`[contractLookup] Error fetching contract ${contractId}:`, err);
    return null;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if a contract covers a specific service type.
 */
export function contractCoversService(
  contract: ContractSummary | QuotationNew,
  serviceType: string
): boolean {
  const services = contract.services || [];
  return services.some(
    (s) => s.toLowerCase() === serviceType.toLowerCase()
  );
}

/**
 * Format contract validity period for display.
 */
export function formatContractValidity(
  start?: string,
  end?: string
): string {
  if (!start && !end) return "No validity set";

  const fmt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  if (start && end) return `${fmt(start)} - ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

/**
 * Calculate days remaining on a contract.
 * Returns null if no end date, negative if expired.
 */
export function getContractDaysRemaining(endDate?: string): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}