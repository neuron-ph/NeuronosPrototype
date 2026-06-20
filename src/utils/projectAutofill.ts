import type { Project } from "../types/pricing";
import type { BillingChargeCategory, ExpenseChargeCategory } from "../types/operations";
import { fetchProjectByNumberWithQuotation, fetchProjectsWithQuotation } from "./projectHydration";
import {
  applyMapping,
  FORWARDING_MAPPING,
  BROKERAGE_MAPPING,
  TRUCKING_MAPPING,
  MARINE_INSURANCE_MAPPING,
  OTHERS_MAPPING,
} from "./bookings/quotationToBookingMapping";

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

// ==================== Fetch Projects for a Customer ====================

/**
 * Active projects for a customer, used by the unified Project/Contract booking
 * picker (NEU-015). Matches on customer_id (preferred) or customer_name, and
 * excludes Completed projects. Mirrors the filter the Forwarding panel used
 * inline before the picker was unified across all services.
 */
export async function fetchProjectsForCustomer(
  customerId?: string | null,
  customerName?: string | null,
): Promise<Project[]> {
  const normId = customerId?.trim();
  const normName = customerName?.trim().toLowerCase();
  if (!normId && !normName) return [];

  const projects = await fetchProjectsWithQuotation();
  return projects.filter((project) => {
    const matchesId =
      !!normId && String((project as any).customer_id ?? "").trim() === normId;
    const matchesName =
      !!normName && String(project.customer_name ?? "").trim().toLowerCase() === normName;
    return project.status !== "Completed" && (matchesId || matchesName);
  });
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
  const serviceDetails = extractServiceDetails(project, "Forwarding") as Record<string, unknown> ?? {};
  const brokerageDetails = extractServiceDetails(project, "Brokerage") as Record<string, unknown> ?? {};
  const isImport = (project.movement || "").toUpperCase() === "IMPORT";

  // Canonical lookup via mapping table (canonical keys first, legacy aliases second).
  const projectFields = project as unknown as Record<string, unknown>;
  const mapped = applyMapping(FORWARDING_MAPPING, serviceDetails, projectFields);

  // Container quantities (not in the matrix mapping — preserve for FCL carry-over)
  const containers = {
    qty20ft: (String((serviceDetails as any).fcl_20ft || (serviceDetails as any).fcl20ft || "")),
    qty40ft: (String((serviceDetails as any).fcl_40ft || (serviceDetails as any).fcl40ft || "")),
    qty45ft: (String((serviceDetails as any).fcl_45ft || (serviceDetails as any).fcl45ft || "")),
    // LCL/Air aliases still needed by BookingDynamicForm pre-fill
    volumeGrossWeight: String((serviceDetails as any).lcl_gwt || (serviceDetails as any).gross_weight || ""),
    volumeDimensions: String((serviceDetails as any).lcl_dims || (serviceDetails as any).measurement || ""),
  };

  return {
    // Project header
    name: project.quotation_name || "",
    projectNumber: project.project_number,
    customerName: project.customer_name,
    customer_id: (project as any).customer_id ?? null,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    consignee: isImport ? (project.customer_name || "") : "",
    shipper: !isImport ? (project.customer_name || "") : "",
    // All matrix carry-over fields via canonical mapping
    ...mapped,
    // Preserve historical cross-service fallback: some projects stored these only under Brokerage.
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
    // Container extras
    ...containers,
  };
}

// ==================== Brokerage Autofill ====================

export function autofillBrokerageFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Brokerage") as Record<string, unknown> ?? {};
  const projectFields = project as unknown as Record<string, unknown>;
  const mapped = applyMapping(BROKERAGE_MAPPING, serviceDetails, projectFields);

  return {
    name: project.quotation_name || "",
    projectNumber: project.project_number,
    customerName: project.customer_name,
    customer_id: (project as any).customer_id ?? null,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    // Matrix carry-over via canonical mapping
    ...mapped,
    // Legacy alias kept for backward compat with booking forms that read 'shipmentOrigin'
    shipmentOrigin: (mapped.pod as string) || project.pod_aod || "",
  };
}

// ==================== Trucking Autofill ====================

export function autofillTruckingFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Trucking") as Record<string, unknown> ?? {};
  const projectFields = project as unknown as Record<string, unknown>;
  // Canonical mapping includes trucking_line_items repeater carry-over
  const mapped = applyMapping(TRUCKING_MAPPING, serviceDetails, projectFields);

  return {
    name: project.quotation_name || "",
    projectNumber: project.project_number,
    customerName: project.customer_name,
    customer_id: (project as any).customer_id ?? null,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    ...mapped,
  };
}

// ==================== Marine Insurance Autofill ====================

export function autofillMarineInsuranceFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Marine Insurance") as Record<string, unknown> ?? {};
  const projectFields = project as unknown as Record<string, unknown>;
  const mapped = applyMapping(MARINE_INSURANCE_MAPPING, serviceDetails, projectFields);

  return {
    name: project.quotation_name || "",
    projectNumber: project.project_number,
    customerName: project.customer_name,
    customer_id: (project as any).customer_id ?? null,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    ...mapped,
    // Extra fields beyond the matrix that the current MI form uses
    invoiceCurrency: (serviceDetails as any).invoice_currency || project.currency || "PHP",
    vesselName: (serviceDetails as any).vessel_name || (serviceDetails as any).vesselName || "",
    estimatedDeparture: (serviceDetails as any).etd || (serviceDetails as any).estimatedDeparture ||
                        project.requested_etd || "",
    estimatedArrival: (serviceDetails as any).eta || (serviceDetails as any).estimatedArrival || "",
  };
}

// ==================== Others Service Autofill ====================

export function autofillOthersFromProject(project: Project) {
  const serviceDetails = extractServiceDetails(project, "Others") as Record<string, unknown> ?? {};
  const projectFields = project as unknown as Record<string, unknown>;
  const mapped = applyMapping(OTHERS_MAPPING, serviceDetails, projectFields);

  return {
    name: project.quotation_name || "",
    projectNumber: project.project_number,
    customerName: project.customer_name,
    customer_id: (project as any).customer_id ?? null,
    movement: project.movement,
    quotationReferenceNumber: project.quotation_number,
    ...mapped,
    // Extra non-matrix fields the Others form uses
    deliveryAddress: (serviceDetails as any).delivery_address || project.collection_address || "",
    specialInstructions: (serviceDetails as any).special_instructions || project.special_instructions || "",
    contactPerson: (serviceDetails as any).contact_person || (serviceDetails as any).contactPerson || "",
    contactNumber: (serviceDetails as any).contact_number || (serviceDetails as any).contactNumber || "",
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

// Postgres unique-violation code for the one-booking-per-service-per-project index
// (migration 110). Lets callers translate a link conflict into a friendly message.
export const PROJECT_BOOKING_CONFLICT = "PROJECT_BOOKING_CONFLICT";

export function isProjectBookingConflict(error?: string | null): boolean {
  return (
    !!error &&
    (error === PROJECT_BOOKING_CONFLICT ||
      error.includes("bookings_one_per_service_per_project"))
  );
}

/**
 * Link a booking to a project by setting `bookings.project_id` — the single
 * source of truth. (Previously this pushed to a `projects.linked_bookings`
 * JSONB array, which drifted from the column the unique constraint guards and
 * the UI displayed; see NEU-013.) The `bookingNumber`/`serviceType`/`status`
 * params are retained for call-site compatibility but no longer stored here.
 */
export async function linkBookingToProject(
  projectId: string,
  bookingId: string,
  _bookingNumber?: string,
  _serviceType?: string,
  _status?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabase/client");
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (updateErr) {
      // 23505 = unique_violation on bookings_one_per_service_per_project
      if (updateErr.code === '23505') return { success: false, error: PROJECT_BOOKING_CONFLICT };
      return { success: false, error: updateErr.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== Unlink Booking from Project ====================

/**
 * Unlink a booking from its project by clearing `bookings.project_id`.
 * `projectId` is retained for call-site compatibility but not needed.
 */
export async function unlinkBookingFromProject(
  _projectId: string,
  bookingId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabase/client");
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ project_id: null, updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (updateErr) return { success: false, error: updateErr.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
