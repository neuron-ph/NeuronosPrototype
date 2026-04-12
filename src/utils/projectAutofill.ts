import type { Project } from "../types/pricing";
import type { BillingChargeCategory, ExpenseChargeCategory } from "../types/operations";
import { fetchProjectByNumberWithQuotation } from "./projectHydration";

/**
 * Project Autofill Utilities
 * Maps Project data to Operations booking fields
 */

// ====================  Fetch Project by Number ====================

export async function fetchProjectByNumber(
  projectNumber: string,
): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const data = await fetchProjectByNumberWithQuotation(projectNumber);
    if (!data) return { success: false, error: 'Project not found' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== Extract Service Details ====================

export function extractServiceDetails(project: Project, serviceType: string) {
  if (!project.services_metadata) {
    return null;
  }

  const serviceData = project.services_metadata.find(
    (s) => s.service_type.toUpperCase() === serviceType.toUpperCase()
  );

  return serviceData?.service_details || null;
}

// ==================== Forwarding Autofill ====================

export function autofillForwardingFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Forwarding");
  
  // Also check brokerage for cross-service fields
  const brokerageDetails = extractServiceDetails(project, "Brokerage");
  
  return {
    // From Project - Basic Info
    projectNumber: project.project_number,
    customerName: project.customer_name,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    
    // From Service Details (if available)
    ...(serviceDetails && {
      cargoType: (serviceDetails as any).cargo_type || "",
      commodityDescription: (serviceDetails as any).commodity || project.commodity || "",
      deliveryAddress: (serviceDetails as any).delivery_address || project.collection_address || "",
      aolPol: (serviceDetails as any).pol || project.pol_aol || "",
      aodPod: (serviceDetails as any).pod || project.pod_aod || "",
      mode: (serviceDetails as any).mode || "",
      
      // NEW: Additional forwarding fields from quotation
      carrier: (serviceDetails as any).carrierAirline || (serviceDetails as any).carrier_airline || project.carrier || "",
      stackability: (serviceDetails as any).stackable || (serviceDetails as any).stackability || "",
      
      // NEW: Volume/Weight specifications
      grossWeight: (serviceDetails as any).lclGwt || (serviceDetails as any).lcl_gross_weight || 
                   (serviceDetails as any).airGwt || (serviceDetails as any).air_gross_weight || 
                   project.gross_weight?.toString() || "",
      dimensions: (serviceDetails as any).lclDims || (serviceDetails as any).lcl_dimensions || 
                  project.dimensions || "",
      
      // NEW: Container quantities (for expected volume display)
      qty20ft: (serviceDetails as any).fcl20ft?.toString() || (serviceDetails as any).fcl_20ft?.toString() || "",
      qty40ft: (serviceDetails as any).fcl40ft?.toString() || (serviceDetails as any).fcl_40ft?.toString() || "",
      qty45ft: (serviceDetails as any).fcl45ft?.toString() || (serviceDetails as any).fcl_45ft?.toString() || "",
      
      // NEW: LCL/AIR specific
      volumeGrossWeight: (serviceDetails as any).lclGwt || (serviceDetails as any).lcl_gross_weight || "",
      volumeDimensions: (serviceDetails as any).lclDims || (serviceDetails as any).lcl_dimensions || "",
      volumeChargeableWeight: (serviceDetails as any).airCwt || (serviceDetails as any).air_chargeable_weight || "",
      
      // NEW: Additional routing/logistics info
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
    
    // Fallback to project level (if no service details)
    ...(!serviceDetails && {
      commodityDescription: project.commodity || "",
      aolPol: project.pol_aol || "",
      aodPod: project.pod_aod || "",
      deliveryAddress: project.collection_address || "",
      carrier: project.carrier || "",
      grossWeight: project.gross_weight?.toString() || "",
      dimensions: project.dimensions || "",
    }),
  };
}

// ==================== Brokerage Autofill ====================

export function autofillBrokerageFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Brokerage");
  
  return {
    // From Project - Basic Info
    projectNumber: project.project_number,
    customerName: project.customer_name,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    
    // From Service Details (if available)
    ...(serviceDetails && {
      // Brokerage Type from subtype
      brokerageType: (serviceDetails as any).subtype || (serviceDetails as any).brokerage_type || "",
      
      // General fields from Quotation Builder
      customsEntryType: (serviceDetails as any).type_of_entry || (serviceDetails as any).typeOfEntry || "",
      commodityDescription: (serviceDetails as any).commodity_description || (serviceDetails as any).commodity || project.commodity || "",
      deliveryAddress: (serviceDetails as any).delivery_address || (serviceDetails as any).deliveryAddress || "",
      shipmentOrigin: (serviceDetails as any).pod || project.pod_aod || "",
      
      // NEW: Shipment details from Quotation Builder
      pod: (serviceDetails as any).pod || "",
      mode: (serviceDetails as any).mode || "",
      cargoType: (serviceDetails as any).cargo_type || (serviceDetails as any).cargoType || "",
      
      // All-Inclusive specific fields
      countryOfOrigin: (serviceDetails as any).country_of_origin || (serviceDetails as any).countryOfOrigin || "",
      preferentialTreatment: (serviceDetails as any).preferential_treatment || (serviceDetails as any).preferentialTreatment || "",
    }),
    
    // Fallback to project level (if no service details)
    ...(!serviceDetails && {
      commodityDescription: project.commodity || "",
      shipmentOrigin: project.pod_aod || "",
    }),
  };
}

// ==================== Trucking Autofill ====================

export function autofillTruckingFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Trucking");
  
  return {
    // From Project
    projectNumber: project.project_number,
    customerName: project.customer_name,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    
    // From Service Details (if available)
    ...(serviceDetails && {
      pullOutLocation: (serviceDetails as any).pull_out || "",
      deliveryAddress: (serviceDetails as any).delivery_address || "",
      truckType: (serviceDetails as any).truck_type || "",
      deliveryInstructions: (serviceDetails as any).delivery_instructions || "",
    }),
  };
}

// ==================== Marine Insurance Autofill ====================

export function autofillMarineInsuranceFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Marine Insurance");
  
  return {
    // From Project
    projectNumber: project.project_number,
    customerName: project.customer_name,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    
    // From Service Details (if available)
    ...(serviceDetails && {
      commodityDescription: (serviceDetails as any).commodity_description || 
                           (serviceDetails as any).commodity || 
                           project.commodity || "",
      hsCode: (serviceDetails as any).hs_code || 
              (serviceDetails as any).hsCode || "",
      departurePort: (serviceDetails as any).pol || 
                    (serviceDetails as any).departure_port ||
                    project.pol_aol || "",
      arrivalPort: (serviceDetails as any).pod || 
                  (serviceDetails as any).arrival_port ||
                  project.pod_aod || "",
      invoiceValue: (serviceDetails as any).invoice_value || 
                   (serviceDetails as any).invoiceValue || "",
      invoiceCurrency: (serviceDetails as any).invoice_currency || 
                      (serviceDetails as any).invoiceCurrency || 
                      project.currency || "PHP",
      cargoValue: (serviceDetails as any).cargo_value || 
                 (serviceDetails as any).cargoValue || "",
      insuranceType: (serviceDetails as any).insurance_type || 
                    (serviceDetails as any).insuranceType || "",
      vesselName: (serviceDetails as any).vessel_name || 
                 (serviceDetails as any).vesselName || "",
      voyageNumber: (serviceDetails as any).voyage_number || 
                   (serviceDetails as any).voyageNumber || "",
      estimatedDeparture: (serviceDetails as any).estimated_departure || 
                         (serviceDetails as any).estimatedDeparture || 
                         project.requested_etd || "",
      estimatedArrival: (serviceDetails as any).estimated_arrival || 
                       (serviceDetails as any).estimatedArrival || "",
    }),
    
    // Fallback to project level
    ...(!serviceDetails && {
      commodityDescription: project.commodity || "",
      departurePort: project.pol_aol || "",
      arrivalPort: project.pod_aod || "",
      invoiceCurrency: project.currency || "PHP",
      estimatedDeparture: project.requested_etd || "",
    }),
  };
}

// ==================== Others Service Autofill ====================

export function autofillOthersFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Others");
  
  return {
    // From Project
    projectNumber: project.project_number,
    customerName: project.customer_name,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    
    // From Service Details (if available)
    ...(serviceDetails && {
      serviceDescription: (serviceDetails as any).service_description || 
                         (serviceDetails as any).serviceDescription || "",
      serviceType: (serviceDetails as any).service_type || 
                  (serviceDetails as any).serviceType || "",
      deliveryAddress: (serviceDetails as any).delivery_address || 
                      (serviceDetails as any).deliveryAddress || 
                      project.collection_address || "",
      specialInstructions: (serviceDetails as any).special_instructions || 
                          (serviceDetails as any).specialInstructions || 
                          project.special_instructions || "",
      contactPerson: (serviceDetails as any).contact_person || 
                    (serviceDetails as any).contactPerson || "",
      contactNumber: (serviceDetails as any).contact_number || 
                    (serviceDetails as any).contactNumber || "",
    }),
    
    // Fallback to project level
    ...(!serviceDetails && {
      deliveryAddress: project.collection_address || "",
      specialInstructions: project.special_instructions || "",
    }),
  };
}

// ==================== Billing Autofill ====================

export function autofillBillingsFromProject(project: Project): BillingChargeCategory[] {
  if (!project.charge_categories || project.charge_categories.length === 0) {
    return [];
  }

  return project.charge_categories.map((category: any) => ({
    categoryName: category.category_name || category.name,
    lineItems: (category.line_items || []).map((item: any) => ({
      description: item.description,
      price: item.price,
      quantity: item.quantity,
      unit: item.unit,
      amount: item.amount,
      remarks: item.remarks || "",
    })),
    subtotal: category.subtotal,
  }));
}

// ==================== Expense Autofill ====================

export function autofillExpensesFromProject(project: Project): ExpenseChargeCategory[] {
  if (!project.charge_categories || project.charge_categories.length === 0) {
    return [];
  }

  // Filter only line items that have buying_price (vendor costs)
  return project.charge_categories
    .map((category: any) => {
      const expenseItems = (category.line_items || [])
        .filter((item: any) => item.buying_price !== undefined && item.buying_price > 0)
        .map((item: any) => ({
          description: item.description,
          buyingPrice: item.buying_price,
          quantity: item.quantity,
          unit: item.unit,
          amount: item.buying_amount || (item.buying_price * item.quantity * (item.forex_rate || 1)),
          vendorId: item.vendor_id,
          vendorName: item.vendor_name || "",
          remarks: item.remarks || "",
        }));

      if (expenseItems.length === 0) {
        return null;
      }

      return {
        categoryName: category.category_name || category.name,
        lineItems: expenseItems,
        subtotal: expenseItems.reduce((sum: number, item: any) => sum + item.amount, 0),
      };
    })
    .filter((cat) => cat !== null) as ExpenseChargeCategory[];
}

// ==================== Link Booking to Project ====================

export async function linkBookingToProject(
  projectId: string,
  bookingId: string,
  bookingNumber: string,
  serviceType: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabase/client");
    // Fetch the project
    const { data: project, error: fetchErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    
    if (fetchErr || !project) {
      return { success: false, error: fetchErr?.message || 'Project not found' };
    }
    
    // Add booking to linked_bookings array
    const linkedBookings = project.linked_bookings || [];
    linkedBookings.push({ bookingId, bookingNumber, serviceType, status });

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ linked_bookings: linkedBookings, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    
    if (updateErr) return { success: false, error: updateErr.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== Unlink Booking from Project ====================

export async function unlinkBookingFromProject(
  projectId: string,
  bookingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabase/client");
    const { data: project, error: fetchErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();
    
    if (fetchErr || !project) {
      return { success: false, error: fetchErr?.message || 'Project not found' };
    }
    
    const linkedBookings = (project.linked_bookings || [])
      .filter((b: any) => b.bookingId !== bookingId);

    const { error: updateErr } = await supabase
      .from('projects')
      .update({ linked_bookings: linkedBookings, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    
    if (updateErr) return { success: false, error: updateErr.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
