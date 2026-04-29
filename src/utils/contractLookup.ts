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
import { supabase } from "./supabase/client";

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
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('quotation_type', 'contract')
      .in('contract_status', ['Active', 'Expiring'])
      .ilike('customer_name', `%${customerName.trim()}%`);

    if (error) {
      console.error(`[contractLookup] Failed to fetch contracts:`, error.message);
      return [];
    }

    return (data || []).map((q: any) => ({
      id: q.id,
      quote_number: q.quote_number,
      quotation_name: q.quotation_name,
      customer_name: q.customer_name,
      contract_status: q.contract_status,
      contract_validity_start: q.contract_validity_start,
      contract_validity_end: q.contract_validity_end,
      services: Array.isArray(q.services) ? q.services : [],
    })) as ContractSummary[];
  } catch (err) {
    console.error("[contractLookup] Error fetching active contracts:", err);
    return [];
  }
}

function serviceMatches(contractService: string, serviceType: string): boolean {
  return contractService.trim().toLowerCase() === serviceType.trim().toLowerCase();
}

/**
 * Filter contracts down to those covering the requested service.
 * When no service type is provided, returns the original array unchanged.
 */
export function filterContractsForService(
  contracts: ContractSummary[],
  serviceType?: string
): ContractSummary[] {
  if (!serviceType) return contracts;
  return contracts.filter((contract) =>
    (contract.services || []).some((service) => serviceMatches(service, serviceType))
  );
}

/**
 * Pick the best contract for a service from an already-fetched contract list.
 * When requireExactServiceMatch is enabled, returns null if no matching service contract exists.
 */
export function pickBestContractForService(
  contracts: ContractSummary[],
  serviceType?: string,
  options?: { requireExactServiceMatch?: boolean }
): ContractSummary | null {
  if (contracts.length === 0) return null;

  const matchingContracts = filterContractsForService(contracts, serviceType);
  if (matchingContracts.length > 0) {
    return matchingContracts[0];
  }

  if (options?.requireExactServiceMatch) return null;
  return contracts[0];
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
  serviceType?: string,
  options?: { requireExactServiceMatch?: boolean }
): Promise<ContractSummary | null> {
  const contracts = await fetchActiveContractsForCustomer(customerName);
  return pickBestContractForService(contracts, serviceType, options);
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
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', contractId)
      .maybeSingle();

    if (error) {
      console.error(`[contractLookup] Failed to fetch contract ${contractId}:`, error.message);
      return null;
    }

    const quotation = data;
    if (!quotation) return null;

    if (quotation.quotation_type !== "contract") {
      console.warn(`[contractLookup] Quotation ${contractId} is not a contract (type: ${quotation.quotation_type})`);
      return null;
    }

    // Merge details JSONB so rate_matrices and other overflow fields are top-level
    return { ...(quotation.details ?? {}), ...quotation } as QuotationNew;
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
    (s) => serviceMatches(s, serviceType)
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
