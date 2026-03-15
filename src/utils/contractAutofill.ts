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
  const serviceDetails = extractServiceDetails(contract, "Brokerage");

  return {
    // From Contract — Basic Info
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,

    // Contract link
    contract_id: contract.id,

    // From Brokerage service scope
    ...(serviceDetails && {
      brokerageType: (serviceDetails as any).subtype ||
        (serviceDetails as any).brokerageType ||
        "Standard",
      customsEntryType:
        (serviceDetails as any).type_of_entry ||
        (serviceDetails as any).typeOfEntry ||
        "",
      mode: (serviceDetails as any).mode || "Multi-modal",
      // POD — contracts use `pods` array; pick first one as default,
      // operations can override per-booking
      pod:
        ((serviceDetails as any).pods && (serviceDetails as any).pods.length > 0
          ? (serviceDetails as any).pods[0]
          : "") ||
        (serviceDetails as any).pod ||
        "",
    }),

    // Fallback
    ...(!serviceDetails && {
      brokerageType: "Standard",
      mode: "Multi-modal",
    }),
  };
}

// ==================== Trucking Autofill ====================

export function autofillTruckingFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Trucking");

  return {
    // From Contract — Basic Info
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,

    // Contract link
    contract_id: contract.id,

    // From Trucking service scope
    ...(serviceDetails && {
      truckType: (serviceDetails as any).truck_type ||
        (serviceDetails as any).truckType ||
        "",
    }),
  };
}

// ==================== Others Autofill ====================

export function autofillOthersFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Others");

  return {
    // From Contract — Basic Info
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,

    // Contract link
    contract_id: contract.id,

    // From Others service scope
    ...(serviceDetails && {
      serviceDescription:
        (serviceDetails as any).service_description ||
        (serviceDetails as any).serviceDescription ||
        "",
    }),
  };
}

// ==================== Forwarding Autofill ====================

export function autofillForwardingFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Forwarding");
  const brokerageDetails = extractServiceDetails(contract, "Brokerage");

  return {
    // From Contract — Basic Info
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,

    // Contract link
    contract_id: contract.id,

    // From Forwarding service scope
    ...(serviceDetails && {
      cargoType: (serviceDetails as any).cargo_type || "",
      commodityDescription: (serviceDetails as any).commodity || contract.commodity || "",
      deliveryAddress: (serviceDetails as any).delivery_address || contract.collection_address || "",
      aolPol: (serviceDetails as any).pol || contract.pol_aol || "",
      aodPod: (serviceDetails as any).pod || contract.pod_aod || "",
      mode: (serviceDetails as any).mode || "",
      carrier: (serviceDetails as any).carrierAirline || (serviceDetails as any).carrier_airline || contract.carrier || "",
      stackability: (serviceDetails as any).stackable || (serviceDetails as any).stackability || "",
      grossWeight: (serviceDetails as any).lclGwt || (serviceDetails as any).lcl_gross_weight ||
                   (serviceDetails as any).airGwt || (serviceDetails as any).air_gross_weight ||
                   contract.gross_weight?.toString() || "",
      dimensions: (serviceDetails as any).lclDims || (serviceDetails as any).lcl_dimensions ||
                  contract.dimensions || "",
      qty20ft: (serviceDetails as any).fcl20ft?.toString() || (serviceDetails as any).fcl_20ft?.toString() || "",
      qty40ft: (serviceDetails as any).fcl40ft?.toString() || (serviceDetails as any).fcl_40ft?.toString() || "",
      qty45ft: (serviceDetails as any).fcl45ft?.toString() || (serviceDetails as any).fcl_45ft?.toString() || "",
      volumeGrossWeight: (serviceDetails as any).lclGwt || (serviceDetails as any).lcl_gross_weight || "",
      volumeDimensions: (serviceDetails as any).lclDims || (serviceDetails as any).lcl_dimensions || "",
      volumeChargeableWeight: (serviceDetails as any).airCwt || (serviceDetails as any).air_chargeable_weight || "",
      typeOfEntry: (serviceDetails as any).typeOfEntry || (serviceDetails as any).type_of_entry || "",
    }),

    // Cross-service fields (from Brokerage if not in Forwarding)
    countryOfOrigin: (serviceDetails as any)?.countryOfOrigin ||
                     (serviceDetails as any)?.country_of_origin ||
                     (brokerageDetails as any)?.countryOfOrigin ||
                     (brokerageDetails as any)?.country_of_origin || "",
    preferentialTreatment: (serviceDetails as any)?.preferentialTreatment ||
                          (serviceDetails as any)?.preferential_treatment ||
                          (brokerageDetails as any)?.preferentialTreatment ||
                          (brokerageDetails as any)?.preferential_treatment || "",

    // Fallback to contract level
    ...(!serviceDetails && {
      commodityDescription: contract.commodity || "",
      aolPol: contract.pol_aol || "",
      aodPod: contract.pod_aod || "",
      deliveryAddress: contract.collection_address || "",
      carrier: contract.carrier || "",
      grossWeight: contract.gross_weight?.toString() || "",
      dimensions: contract.dimensions || "",
    }),
  };
}

// ==================== Marine Insurance Autofill ====================

export function autofillMarineInsuranceFromContract(contract: QuotationNew) {
  const serviceDetails = extractServiceDetails(contract, "Marine Insurance");

  return {
    // From Contract — Basic Info
    customerName: contract.customer_name,
    movement: contract.movement,
    quotationReferenceNumber: contract.quote_number,

    // Contract link
    contract_id: contract.id,

    // From Marine Insurance service scope
    ...(serviceDetails && {
      commodityDescription: (serviceDetails as any).commodity_description ||
                           (serviceDetails as any).commodity ||
                           contract.commodity || "",
      hsCode: (serviceDetails as any).hs_code ||
              (serviceDetails as any).hsCode || "",
      departurePort: (serviceDetails as any).pol ||
                    (serviceDetails as any).departure_port ||
                    contract.pol_aol || "",
      arrivalPort: (serviceDetails as any).pod ||
                  (serviceDetails as any).arrival_port ||
                  contract.pod_aod || "",
      invoiceValue: (serviceDetails as any).invoice_value ||
                   (serviceDetails as any).invoiceValue || "",
      invoiceCurrency: (serviceDetails as any).invoice_currency ||
                      (serviceDetails as any).invoiceCurrency ||
                      contract.currency || "PHP",
      cargoValue: (serviceDetails as any).cargo_value ||
                 (serviceDetails as any).cargoValue || "",
      insuranceType: (serviceDetails as any).insurance_type ||
                    (serviceDetails as any).insuranceType || "",
      vesselName: (serviceDetails as any).vessel_name ||
                 (serviceDetails as any).vesselName || "",
      voyageNumber: (serviceDetails as any).voyage_number ||
                   (serviceDetails as any).voyageNumber || "",
      estimatedDeparture: (serviceDetails as any).estimated_departure ||
                         (serviceDetails as any).estimatedDeparture || "",
      estimatedArrival: (serviceDetails as any).estimated_arrival ||
                       (serviceDetails as any).estimatedArrival || "",
    }),

    // Fallback to contract level
    ...(!serviceDetails && {
      commodityDescription: contract.commodity || "",
      departurePort: contract.pol_aol || "",
      arrivalPort: contract.pod_aod || "",
      invoiceCurrency: contract.currency || "PHP",
    }),
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
    const { apiFetch } = await import("./api");
    const response = await apiFetch(`/contracts/${contractId}/link-booking`, {
      method: "POST",
      body: JSON.stringify({
          bookingId,
          bookingNumber,
          serviceType,
          status,
        }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
      };
    }

    return result;
  } catch (error) {
    console.error("[contractAutofill] Error linking booking to contract:", error);
    return { success: false, error: String(error) };
  }
}