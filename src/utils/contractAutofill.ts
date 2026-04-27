/**
 * Contract Autofill Utilities
 *
 * Maps Contract (QuotationNew with quotation_type === "contract") data
 * to Operations booking form fields. Only covers contract-eligible services:
 *   - Brokerage (Standard)
 *   - Trucking
 *   - Others
 *
 * DRY: Mirrors the pattern of projectAutofill.ts — same function signature
 * shape, same return type structure, different source entity.
 *
 * @see /docs/blueprints/CONTRACT_FLOWCHART_INTEGRATION_BLUEPRINT.md - Phase 3
 */

import type { QuotationNew, InquiryService } from "../types/pricing";
import {
  applyMapping,
  FORWARDING_MAPPING,
  BROKERAGE_MAPPING,
  TRUCKING_MAPPING,
  MARINE_INSURANCE_MAPPING,
  OTHERS_MAPPING,
} from "./bookings/quotationToBookingMapping";

// ==================== Extract Service Details ====================

/**
 * Extract service details from a contract's services_metadata.
 * Same pattern as projectAutofill.extractServiceDetails().
 */
function extractServiceDetails(contract: QuotationNew, serviceType: string) {
  if (!contract.services_metadata) return null;

  const serviceData = contract.services_metadata.find(
    (s) => s.service_type.toUpperCase() === serviceType.toUpperCase()
  );

  return serviceData?.service_details || null;
}

// ==================== Brokerage Autofill ====================

export function autofillBrokerageFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Brokerage") as Record<string, unknown> ?? {};
  const contractFields = contract as unknown as Record<string, unknown>;
  const mapped = applyMapping(BROKERAGE_MAPPING, serviceDetails, contractFields);

  // POD — contracts may use `pods` array; pick first one as default
  const podsArr = (serviceDetails as any).pods as string[] | undefined;
  const podFromArray = podsArr && podsArr.length > 0 ? podsArr[0] : '';

  return {
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,
    contract_id: contract.id,
    ...mapped,
    // If the array-form pod is more specific, prefer it over the mapped singleton
    pod: podFromArray || (mapped.pod as string) || '',
  };
}

// ==================== Trucking Autofill ====================

export function autofillTruckingFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Trucking") as Record<string, unknown> ?? {};
  const contractFields = contract as unknown as Record<string, unknown>;
  const mapped = applyMapping(TRUCKING_MAPPING, serviceDetails, contractFields);

  return {
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,
    contract_id: contract.id,
    ...mapped,
  };
}

// ==================== Others Autofill ====================

export function autofillOthersFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Others") as Record<string, unknown> ?? {};
  const contractFields = contract as unknown as Record<string, unknown>;
  const mapped = applyMapping(OTHERS_MAPPING, serviceDetails, contractFields);

  return {
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,
    contract_id: contract.id,
    ...mapped,
  };
}

// ==================== Forwarding Autofill ====================

export function autofillForwardingFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Forwarding") as Record<string, unknown> ?? {};
  const brokerageDetails = extractServiceDetails(contract, "Brokerage") as Record<string, unknown> ?? {};
  const contractFields = contract as unknown as Record<string, unknown>;
  const mapped = applyMapping(FORWARDING_MAPPING, serviceDetails, contractFields);

  return {
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,
    contract_id: contract.id,
    ...mapped,
    // Preserve historical cross-service fallback: some contracts stored these only under Brokerage.
    countryOfOrigin:
      mapped.countryOfOrigin ||
      brokerageDetails.country_of_origin ||
      brokerageDetails.countryOfOrigin ||
      '',
    preferentialTreatment:
      mapped.preferentialTreatment ||
      brokerageDetails.preferential_treatment ||
      brokerageDetails.preferentialTreatment ||
      '',
    // Container quantities
    qty20ft: String((serviceDetails as any).fcl_20ft || (serviceDetails as any).fcl20ft || ""),
    qty40ft: String((serviceDetails as any).fcl_40ft || (serviceDetails as any).fcl40ft || ""),
    qty45ft: String((serviceDetails as any).fcl_45ft || (serviceDetails as any).fcl45ft || ""),
    volumeGrossWeight: String((serviceDetails as any).lcl_gwt || (serviceDetails as any).gross_weight || ""),
    volumeDimensions: String((serviceDetails as any).lcl_dims || (serviceDetails as any).measurement || ""),
  };
}

// ==================== Marine Insurance Autofill ====================

export function autofillMarineInsuranceFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Marine Insurance") as Record<string, unknown> ?? {};
  const contractFields = contract as unknown as Record<string, unknown>;
  const mapped = applyMapping(MARINE_INSURANCE_MAPPING, serviceDetails, contractFields);

  return {
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,
    contract_id: contract.id,
    ...mapped,
    invoiceCurrency: (serviceDetails as any).invoice_currency || contract.currency || "PHP",
  };
}

// ==================== Link Booking to Contract ====================

/**
 * Link a booking to a contract via the backend.
 * Mirrors linkBookingToProject() from projectAutofill.ts.
 *
 * @see POST /contracts/:id/link-booking
 */
export async function linkBookingToContract(
  contractId: string,
  bookingId: string,
  bookingNumber: string,
  serviceType: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabase/client");
    // Fetch the contract quotation
    const { data: contract, error: fetchErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', contractId)
      .maybeSingle();
    
    if (fetchErr || !contract) {
      return { success: false, error: fetchErr?.message || 'Contract not found' };
    }
    
    // Add booking to linked_bookings array
    const linkedBookings = contract.linked_bookings || [];
    linkedBookings.push({ bookingId, bookingNumber, serviceType, status });
    
    const { error: updateErr } = await supabase
      .from('quotations')
      .update({ linked_bookings: linkedBookings, updated_at: new Date().toISOString() })
      .eq('id', contractId);
    
    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error("[contractAutofill] Error linking booking to contract:", error);
    return { success: false, error: String(error) };
  }
}
