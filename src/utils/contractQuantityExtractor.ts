/**
 * Contract Quantity Extraction Utility
 *
 * Shared functions for extracting `BookingQuantities` from various form states.
 * Used by:
 *   - QuotationBuilderV3 (contract rate bridge — Phase 2)
 *   - CreateBrokerageBookingPanel (billing preview — Phase 3)
 *   - CreateTruckingBookingPanel (billing preview — Phase 3)
 *   - CreateOthersBookingPanel (billing preview — Phase 3)
 *   - Auto-billing on save (Phase 4)
 *
 * DRY: Single source of truth for "how to convert form fields into the shape
 * that the contract rate engine expects." All downstream consumers import from here.
 *
 * @see /docs/blueprints/CONTRACT_RATE_AUTOMATION_BLUEPRINT.md — Phase 1
 */

import type { BookingQuantities } from "./contractRateEngine";
import { resolveModeColumn } from "./contractRateEngine";
import type { ContractRateMatrix } from "../types/pricing";
import type { TruckingLineItem } from "../types/pricing";

// ============================================
// TYPES (Form-field shapes — matching existing interfaces)
// ============================================

/**
 * Matches the ContainerEntry interface used in BrokerageServiceForm
 * and QuotationBuilderV3 (declared inline in both files).
 */
interface ContainerEntry {
  id: string;
  type: "20ft" | "40ft" | "45ft" | "";
  qty: number;
}

function isContainerEntry(value: unknown): value is ContainerEntry {
  return !!value && typeof value === "object" && "qty" in value;
}

function normalizeContainerEntries(containers: unknown): ContainerEntry[] {
  if (Array.isArray(containers)) {
    return containers.filter(isContainerEntry);
  }

  if (typeof containers === "string") {
    try {
      const parsed = JSON.parse(containers);
      return Array.isArray(parsed) ? parsed.filter(isContainerEntry) : [];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Subset of BrokerageFormData relevant for quantity extraction.
 * Uses `Partial` semantics — all fields optional, we handle missing data gracefully.
 */
interface BrokerageFormFields {
  mode?: string;                    // "FCL" | "LCL" | "AIR" | "Multi-modal"
  containers?: ContainerEntry[];    // New format: array of { type, qty }
  // Legacy fields (backward compatibility)
  fcl20ft?: number;
  fcl40ft?: number;
  fcl45ft?: number;
  fclQty?: number;
  // LCL fields
  lclGwt?: string;
  lclDims?: string;
  // AIR fields
  airGwt?: string;
  airCwt?: string;
}

/**
 * Subset of TruckingServiceForm / TruckingBooking fields for quantity extraction.
 */
interface TruckingFormFields {
  truckType?: string;               // "4W" | "6W" | "10W" | "20ft" | "40ft" | "45ft"
  qty?: number;                     // Number of trucks/containers
  mode?: string;                    // Sometimes present in booking forms
}

/**
 * Generic booking form fields — superset used by `extractQuantitiesFromBookingForm()`.
 * Each service type only uses the subset it cares about.
 */
interface BookingFormFields {
  mode?: string;
  // Brokerage-specific
  containers?: ContainerEntry[];
  fcl20ft?: number;
  fcl40ft?: number;
  fcl45ft?: number;
  fclQty?: number;
  // Trucking-specific
  truckType?: string;
  qty?: number;
  // Forwarding-specific (same container structure)
  qty20ft?: string;
  qty40ft?: string;
  qty45ft?: string;
}

// ============================================
// CONTAINER COUNTING HELPERS
// ============================================

/**
 * Sum total container count from the containers[] array.
 * Handles empty arrays, undefined, and zero-qty entries.
 *
 * @example
 * sumContainerEntries([{ type: "20ft", qty: 10 }, { type: "40ft", qty: 8 }])
 * // => 18
 *
 * @example
 * sumContainerEntries([])
 * // => 0
 */
function sumContainerEntries(containers?: ContainerEntry[] | string): number {
  const entries = normalizeContainerEntries(containers);
  if (entries.length === 0) return 0;
  return entries.reduce((sum, entry) => sum + (entry.qty || 0), 0);
}

/**
 * Sum total container count from legacy per-size fields.
 * Used as fallback when containers[] array is not populated.
 *
 * @example
 * sumLegacyContainerFields({ fcl20ft: 5, fcl40ft: 3 })
 * // => 8
 */
function sumLegacyContainerFields(fields: {
  fcl20ft?: number;
  fcl40ft?: number;
  fcl45ft?: number;
  fclQty?: number;
}): number {
  const sized = (fields.fcl20ft || 0) + (fields.fcl40ft || 0) + (fields.fcl45ft || 0);
  // If per-size fields are populated, use their sum; otherwise fall back to fclQty
  return sized > 0 ? sized : (fields.fclQty || 0);
}

/**
 * Sum container count from booking form string fields (qty20ft, qty40ft, qty45ft).
 * These are stored as strings in the ForwardingBooking / BrokerageBooking types.
 */
function sumBookingContainerStrings(fields: {
  qty20ft?: string;
  qty40ft?: string;
  qty45ft?: string;
}): number {
  const q20 = parseInt(fields.qty20ft || "0", 10) || 0;
  const q40 = parseInt(fields.qty40ft || "0", 10) || 0;
  const q45 = parseInt(fields.qty45ft || "0", 10) || 0;
  return q20 + q40 + q45;
}

// ============================================
// CORE EXTRACTION FUNCTIONS
// ============================================

/**
 * Extract BookingQuantities from BrokerageServiceForm / QuotationBuilderV3 state.
 *
 * Used by the contract rate bridge in the project quotation builder (Phase 2).
 *
 * @param brokerageData - The brokerage form data (containers, mode, etc.)
 * @param shipmentFreight - Optional shipment freight type from ShipmentDetailsSection
 * @returns BookingQuantities for the rate engine
 *
 * @example — 18 FCL containers
 * extractQuantitiesFromBrokerageForm({
 *   mode: "FCL",
 *   containers: [
 *     { id: "1", type: "20ft", qty: 10 },
 *     { id: "2", type: "40ft", qty: 8 }
 *   ]
 * })
 * // => { containers: 18, shipments: 1, bls: 1, sets: 1 }
 *
 * @example — LCL shipment (no containers)
 * extractQuantitiesFromBrokerageForm({ mode: "LCL" })
 * // => { containers: 0, shipments: 1, bls: 1, sets: 1 }
 *
 * @example — Empty form
 * extractQuantitiesFromBrokerageForm({})
 * // => { containers: 0, shipments: 1, bls: 1, sets: 1 }
 */
export function extractQuantitiesFromBrokerageForm(
  brokerageData: BrokerageFormFields,
  shipmentFreight?: string
): BookingQuantities {
  const mode = (brokerageData.mode || shipmentFreight || "").toUpperCase();
  const isFCL = mode === "FCL" || mode === "MULTI-MODAL";

  let containerCount = 0;

  if (isFCL) {
    // Try new containers[] array first
    containerCount = sumContainerEntries(brokerageData.containers);

    // Fall back to legacy per-size fields
    if (containerCount === 0) {
      containerCount = sumLegacyContainerFields(brokerageData);
    }
  }

  return {
    containers: containerCount,
    shipments: 1,
    bls: 1,
    sets: 1,
  };
}

/**
 * Extract BookingQuantities from Trucking form fields.
 *
 * Trucking uses per-container / per-truck pricing. The `qty` field in
 * TruckingServiceForm represents the number of trucks/containers for the booking.
 *
 * @param truckingData - The trucking form data (truckType, qty)
 * @returns BookingQuantities for the rate engine
 *
 * @example — 5 trucks
 * extractQuantitiesFromTruckingForm({ truckType: "20ft", qty: 5 })
 * // => { containers: 5, shipments: 1, bls: 1, sets: 1 }
 *
 * @example — No quantity set (defaults to 1)
 * extractQuantitiesFromTruckingForm({ truckType: "6W" })
 * // => { containers: 1, shipments: 1, bls: 1, sets: 1 }
 */
export function extractQuantitiesFromTruckingForm(
  truckingData: TruckingFormFields
): BookingQuantities {
  // Trucking: qty is the number of trucks/containers per booking
  const truckCount = truckingData.qty || 1;

  return {
    containers: truckCount,
    shipments: 1,
    bls: 1,
    sets: 1,
  };
}

/**
 * Extract BookingQuantities from Others service form.
 * Others services typically have a single quantity of 1 (per-shipment pricing).
 *
 * @returns BookingQuantities with quantity = 1
 */
export function extractQuantitiesFromOthersForm(): BookingQuantities {
  return {
    containers: 1,
    shipments: 1,
    bls: 1,
    sets: 1,
    quantity: 1,
  };
}

/**
 * Universal extractor: given any booking form data and a service type,
 * returns the appropriate BookingQuantities.
 *
 * Dispatches to the service-specific extractors. This is the preferred
 * entry point for booking panels that already know their service type.
 *
 * @param formData - The booking form data (superset of all service fields)
 * @param serviceType - The service type ("Brokerage", "Trucking", "Others", etc.)
 * @returns BookingQuantities for the rate engine
 *
 * @example — Brokerage booking with FCL mode
 * extractQuantitiesFromBookingForm({ mode: "FCL", qty20ft: "10", qty40ft: "8" }, "Brokerage")
 * // => { containers: 18, shipments: 1, bls: 1, sets: 1 }
 *
 * @example — Trucking booking with 3 trucks
 * extractQuantitiesFromBookingForm({ truckType: "20ft", qty: 3 }, "Trucking")
 * // => { containers: 3, shipments: 1, bls: 1, sets: 1 }
 */
export function extractQuantitiesFromBookingForm(
  formData: BookingFormFields,
  serviceType: string
): BookingQuantities {
  const type = serviceType.toLowerCase();

  if (type === "brokerage" || type === "forwarding") {
    // Brokerage/Forwarding booking forms use different field names than the quotation builder.
    // Try containers[] first, then booking-style string fields, then legacy number fields.
    let containerCount = sumContainerEntries(formData.containers);

    if (containerCount === 0) {
      containerCount = sumBookingContainerStrings(formData);
    }

    if (containerCount === 0) {
      containerCount = sumLegacyContainerFields(formData);
    }

    const mode = (formData.mode || "").toUpperCase();
    const isFCL = mode === "FCL" || mode === "MULTI-MODAL";

    return {
      containers: isFCL ? containerCount : 0,
      shipments: 1,
      bls: 1,
      sets: 1,
    };
  }

  if (type === "trucking") {
    return extractQuantitiesFromTruckingForm(formData as TruckingFormFields);
  }

  // Others / Marine Insurance / fallback
  return extractQuantitiesFromOthersForm();
}

// ============================================
// MODE RESOLUTION
// ============================================

/**
 * Determine the rate matrix column to use based on form state.
 *
 * Combines information from the brokerage form's `mode` field, the
 * `shipmentFreight` from ShipmentDetailsSection, and the freight `category`
 * to produce the best-matching column name.
 *
 * Then delegates to `resolveModeColumn()` from the rate engine for fuzzy
 * matching against the actual matrix columns.
 *
 * @param matrixColumns - Available columns from the contract rate matrix (e.g., ["FCL", "LCL / AIR"])
 * @param formMode - Mode from the form (e.g., "FCL", "LCL", "AIR", "Multi-modal")
 * @param shipmentFreight - Optional: from ShipmentDetailsSection ("FCL", "LCL", "CONSOLIDATION", "BREAK BULK")
 * @param freightCategory - Optional: "SEA FREIGHT" | "AIR FREIGHT" | "LAND FREIGHT"
 * @returns The resolved column name, or null if no match
 *
 * @example — FCL mode
 * resolveModeFromForm(["FCL", "LCL / AIR"], "FCL")
 * // => "FCL"
 *
 * @example — LCL with AIR category
 * resolveModeFromForm(["FCL", "LCL / AIR"], "LCL", undefined, "AIR FREIGHT")
 * // => "LCL / AIR"
 *
 * @example — Multi-modal defaults to FCL
 * resolveModeFromForm(["FCL", "LCL / AIR"], "Multi-modal")
 * // => "FCL"
 */
export function resolveModeFromForm(
  matrixColumns: string[],
  formMode?: string,
  shipmentFreight?: string,
  freightCategory?: string
): string | null {
  // Determine the raw mode string
  let rawMode = (formMode || shipmentFreight || "").toUpperCase().trim();

  // Special handling: Multi-modal typically uses FCL column for brokerage
  if (rawMode === "MULTI-MODAL" || rawMode === "MULTIMODAL") {
    rawMode = "FCL";
  }

  // Special handling: AIR FREIGHT category overrides to "AIR" if mode is ambiguous
  if (
    freightCategory?.toUpperCase() === "AIR FREIGHT" &&
    (rawMode === "" || rawMode === "LCL")
  ) {
    rawMode = "AIR";
  }

  // Special handling: CONSOLIDATION / BREAK BULK → try LCL column
  if (rawMode === "CONSOLIDATION" || rawMode === "BREAK BULK") {
    rawMode = "LCL";
  }

  if (!rawMode) return matrixColumns.length > 0 ? matrixColumns[0] : null;

  // Delegate to the rate engine's fuzzy matcher
  return resolveModeColumn(matrixColumns, rawMode);
}

// ============================================
// CONVENIENCE: COMBINED EXTRACTION + MODE RESOLUTION
// ============================================

/**
 * All-in-one extraction for the Project Quotation rate bridge.
 * Returns both quantities and the resolved mode column.
 *
 * @param brokerageData - Brokerage form state from QuotationBuilderV3
 * @param matrixColumns - Available columns from the contract rate matrix
 * @param shipmentFreight - From ShipmentDetailsSection
 * @param freightCategory - From ShipmentDetailsSection
 * @returns Object with quantities and resolved mode
 *
 * @example
 * extractForRateBridge(
 *   { mode: "FCL", containers: [{ id: "1", type: "20ft", qty: 10 }, { id: "2", type: "40ft", qty: 8 }] },
 *   ["FCL", "LCL / AIR"],
 *   "FCL",
 *   "SEA FREIGHT"
 * )
 * // => {
 * //   quantities: { containers: 18, shipments: 1, bls: 1, sets: 1 },
 * //   resolvedMode: "FCL",
 * //   totalContainers: 18,
 * //   hasQuantities: true
 * // }
 */
export function extractForRateBridge(
  brokerageData: BrokerageFormFields,
  matrixColumns: string[],
  shipmentFreight?: string,
  freightCategory?: string
): {
  quantities: BookingQuantities;
  resolvedMode: string | null;
  totalContainers: number;
  hasQuantities: boolean;
} {
  const quantities = extractQuantitiesFromBrokerageForm(brokerageData, shipmentFreight);
  const resolvedMode = resolveModeFromForm(
    matrixColumns,
    brokerageData.mode,
    shipmentFreight,
    freightCategory
  );
  const totalContainers = quantities.containers || 0;

  return {
    quantities,
    resolvedMode,
    totalContainers,
    hasQuantities: totalContainers > 0 || (quantities.shipments || 0) > 0,
  };
}

/**
 * All-in-one extraction for Operations booking panels.
 * Returns both quantities and the resolved mode column.
 *
 * @param formData - Booking form data
 * @param serviceType - Service type string
 * @param matrixColumns - Available columns from the contract rate matrix
 * @returns Object with quantities and resolved mode
 */
export function extractForBookingPreview(
  formData: BookingFormFields,
  serviceType: string,
  matrixColumns: string[]
): {
  quantities: BookingQuantities;
  resolvedMode: string | null;
  hasQuantities: boolean;
} {
  const quantities = extractQuantitiesFromBookingForm(formData, serviceType);
  const resolvedMode = resolveModeFromForm(
    matrixColumns,
    formData.mode,
    undefined,
    undefined
  );

  const containerQty = quantities.containers || 0;
  const hasQuantities = containerQty > 0 || (quantities.shipments || 0) > 0;

  return { quantities, resolvedMode, hasQuantities };
}

// ============================================
// SAVED BOOKING EXTRACTION (Phase 1 — Booking Quantities Blueprint)
// → REFACTORED: Derived Quantities (see DERIVED_QUANTITIES_BLUEPRINT.md)
// ============================================

/**
 * Count the number of distinct entries in a text field.
 *
 * Splits by comma, semicolon, or newline — trims whitespace — filters empty.
 * Handles both `string` and `string[]` inputs gracefully.
 *
 * @param text - A comma/semicolon/newline-separated string, or an array of strings
 * @returns The number of non-empty entries
 *
 * @example
 * countEntries("MSCU5285725, HLXU2008419, TLLU5146210")
 * // => 3
 *
 * @example
 * countEntries("MSCU123456789, COSU987654321")
 * // => 2
 *
 * @example
 * countEntries(["ABCD1234567", "EFGH7654321"])
 * // => 2
 *
 * @example
 * countEntries(undefined)
 * // => 0
 *
 * @example
 * countEntries("")
 * // => 0
 */
export function countEntries(text?: string | string[]): number {
  if (!text) return 0;
  if (Array.isArray(text)) return text.filter(s => s && s.trim() !== "").length;
  return text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).length;
}

/**
 * Derive BookingQuantities by parsing a saved booking's actual operational fields.
 *
 * Instead of reading a manually-entered `shipment_quantities` field, this function
 * counts the actual container IDs, B/L numbers, and vehicle references that
 * Operations already entered as part of normal workflow.
 *
 * @param booking - Any saved booking object (all fields optional for flexibility)
 * @param serviceType - The booking's service type (e.g., "Brokerage", "Trucking", "Others", "Forwarding")
 * @returns BookingQuantities for the rate engine
 *
 * @example — Brokerage with 3 containers and 2 B/Ls
 * deriveQuantitiesFromBooking({
 *   containerNumbers: "MSCU5285725, HLXU2008419, TLLU5146210",
 *   mblMawb: "MSCU123456789, COSU987654321"
 * }, "Brokerage")
 * // => { containers: 3, bls: 2, sets: 1, shipments: 1 }
 *
 * @example — Forwarding with array container numbers
 * deriveQuantitiesFromBooking({
 *   containerNumbers: ["ABCD1234567", "EFGH7654321"],
 *   mblMawb: "MBL-001"
 * }, "Forwarding")
 * // => { containers: 2, bls: 1, sets: 1, shipments: 1 }
 *
 * @example — Forwarding with qty20ft/qty40ft fallback
 * deriveQuantitiesFromBooking({
 *   qty20ft: "10", qty40ft: "8",
 *   mblMawb: "MBL-001"
 * }, "Forwarding")
 * // => { containers: 18, bls: 1, sets: 1, shipments: 1 }
 *
 * @example — Trucking with 2 vehicles
 * deriveQuantitiesFromBooking({
 *   vehicleReferenceNumber: "ABC-123, DEF-456"
 * }, "Trucking")
 * // => { containers: 2, bls: 1, sets: 1, shipments: 1 }
 *
 * @example — Others (defaults to 1)
 * deriveQuantitiesFromBooking({}, "Others")
 * // => { containers: 0, bls: 1, sets: 1, shipments: 1 }
 *
 * @see /docs/blueprints/DERIVED_QUANTITIES_BLUEPRINT.md — Phase 1
 */
export function deriveQuantitiesFromBooking(
  booking: {
    containerNumbers?: string | string[];
    container_numbers?: string | string[];
    containers?: ContainerEntry[];
    mblMawb?: string;
    mbl_mawb?: string;
    hblHawb?: string;
    vehicleReferenceNumber?: string;
    vehicle_reference_number?: string;
    qty20ft?: string;
    qty40ft?: string;
    qty45ft?: string;
    mode?: string;
  } & Record<string, any>,
  serviceType: string
): BookingQuantities {
  const type = serviceType.toLowerCase();

  // Read either camelCase or snake_case (records merge both shapes)
  const containerNumbersField = booking.containerNumbers ?? booking.container_numbers;
  const mblField = booking.mblMawb ?? booking.mbl_mawb;
  const vehicleField = booking.vehicleReferenceNumber ?? booking.vehicle_reference_number;

  if (type === "brokerage" || type === "forwarding") {
    // Tier 1: Count actual container numbers entered by Ops
    let containers = countEntries(containerNumbersField);

    // Tier 2: Try containers[] array (used by booking creation forms)
    if (containers === 0) {
      containers = sumContainerEntries(booking.containers);
    }

    // Tier 3: Try qty20ft + qty40ft + qty45ft string fields
    if (containers === 0) {
      containers = sumBookingContainerStrings({
        qty20ft: booking.qty20ft,
        qty40ft: booking.qty40ft,
        qty45ft: booking.qty45ft,
      });
    }

    // Reflect actual booking data — zero is a valid signal of "info missing".
    const bls = countEntries(mblField);

    return {
      containers,
      bls,
      sets: 1, // Entry is per-booking (intrinsic to brokerage filing)
      shipments: 1,
    };
  }

  if (type === "trucking") {
    // Trucking: count vehicle reference entries as truck/container count
    const trucks = countEntries(vehicleField);

    return {
      containers: trucks,
      bls: 0,
      sets: 1,
      shipments: 1,
    };
  }

  // Others / Marine Insurance / fallback — no countable source fields
  return {
    containers: 0,
    bls: 1,
    sets: 1,
    shipments: 1,
  };
}

/**
 * Extract BookingQuantities from a saved booking.
 *
 * REFACTORED: Now delegates to `deriveQuantitiesFromBooking()` which parses
 * actual operational fields instead of reading a manually-entered
 * `shipment_quantities` property.
 *
 * If `serviceType` is provided, uses field-based derivation.
 * Falls back to legacy `shipment_quantities` read if present (backward compat).
 *
 * @param booking - Any saved booking object
 * @param serviceType - Optional service type for field-based derivation
 * @returns BookingQuantities for the rate engine
 *
 * @see /docs/blueprints/DERIVED_QUANTITIES_BLUEPRINT.md — Phase 1, Task 1.3
 */
export function extractQuantitiesFromSavedBooking(
  booking: {
    shipment_quantities?: { containers?: number; bls?: number; sets?: number; shipments?: number };
    containerNumbers?: string | string[];
    containers?: ContainerEntry[];
    mblMawb?: string;
    hblHawb?: string;
    vehicleReferenceNumber?: string;
    qty20ft?: string;
    qty40ft?: string;
    qty45ft?: string;
    mode?: string;
  },
  serviceType?: string
): BookingQuantities {
  // If service type is known, derive from actual booking fields
  if (serviceType) {
    return deriveQuantitiesFromBooking(booking, serviceType);
  }

  // Legacy fallback: try to read stored shipment_quantities
  const sq = booking.shipment_quantities;
  if (sq) {
    return {
      containers: sq.containers ?? 1,
      shipments: sq.shipments ?? 1,
      bls: sq.bls ?? 1,
      sets: sq.sets ?? 1,
    };
  }

  // No service type and no stored quantities — return defaults
  return {
    containers: 1,
    shipments: 1,
    bls: 1,
    sets: 1,
  };
}

// ============================================
// TRUCKING SELECTIONS EXTRACTOR (@see SELECTION_GROUP_BLUEPRINT.md — Phase 3)
// ============================================

/**
 * Map form truckType values to contract rate charge_type_ids.
 *
 * Form values (TruckingServiceForm): "4W", "6W", "10W", "20ft", "40ft", "45ft"
 * Rate matrix charge_type_ids: "20ft_40ft", "back_to_back", "4wheeler", "6wheeler"
 */
const TRUCK_TYPE_TO_CHARGE_ID: Record<string, string> = {
  "20ft": "20ft_40ft",
  "40ft": "20ft_40ft",
  "45ft": "20ft_40ft",
  "4W":   "4wheeler",
  "6W":   "6wheeler",
  "10W":  "6wheeler",   // Best-effort fallback to 6Wheeler
};

/**
 * Extract known destination groups from a trucking contract's rate matrices.
 *
 * Single source of truth: collects unique `selection_group || remarks` values
 * from the trucking matrix rows. Used by:
 *   - `extractTruckingSelections()` internally (replaces inline logic)
 *   - UI components (FormComboBox dropdown options) via prop threading
 *
 * @param rateMatrices - All rate matrices from the contract
 * @returns string[] of unique destination group names (e.g., ["Cavite City", "Metro Manila"])
 *
 * @see /docs/blueprints/DESTINATION_COMBOBOX_BLUEPRINT.md — Phase 1, Task 1.1
 */
export function extractContractDestinations(rateMatrices: ContractRateMatrix[]): string[] {
  const truckingMatrix = rateMatrices.find(
    (m) => m.service_type.toLowerCase() === "trucking"
  );
  if (!truckingMatrix) return [];

  const groups = new Set<string>();
  for (const row of truckingMatrix.rows) {
    const group = row.selection_group || row.remarks;
    if (group) groups.add(group);
  }
  return Array.from(groups);
}

/**
 * Extract a `selections` map from trucking form data for the rate engine.
 *
 * Matches the form's `deliveryAddress` (free text) against known
 * `selection_group` values from the trucking rate matrix using fuzzy substring
 * matching, and maps the form's `truckType` to a `charge_type_id`.
 *
 * Returns `{ [matched_selection_group]: matched_charge_type_id }` — exactly
 * the shape `instantiateRates()` and `calculateContractBilling()` expect.
 *
 * @param truckingData - Trucking form state (truckType, deliveryAddress, etc.)
 * @param rateMatrices - All rate matrices from the contract
 * @returns selections map (may be empty if no match found)
 *
 * @example
 * extractTruckingSelections(
 *   { truckType: "40ft", deliveryAddress: "123 Main St, Valenzuela City" },
 *   [{ service_type: "Trucking", rows: [{ selection_group: "Valenzuela City", ... }] }]
 * )
 * // => { "Valenzuela City": "20ft_40ft" }
 *
 * @see /docs/blueprints/SELECTION_GROUP_BLUEPRINT.md — Phase 3
 * @see /docs/blueprints/DESTINATION_COMBOBOX_BLUEPRINT.md — Phase 1, Task 1.2
 */
export function extractTruckingSelections(
  truckingData: { truckType?: string; deliveryAddress?: string },
  rateMatrices: ContractRateMatrix[]
): Record<string, string> | undefined {
  // ── Resolve charge_type_id from form truckType ──
  const chargeTypeId = truckingData.truckType
    ? TRUCK_TYPE_TO_CHARGE_ID[truckingData.truckType] || null
    : null;

  if (!chargeTypeId) return undefined; // Can't select without knowing truck type → no filtering

  // ── Use shared utility to get known destination groups (DRY) ──
  const knownGroups = extractContractDestinations(rateMatrices);

  if (knownGroups.length === 0) return undefined; // No selection groups → no filtering

  // ── Fuzzy-match deliveryAddress against known selection groups ──
  const address = (truckingData.deliveryAddress || "").toLowerCase().trim();
  if (!address) {
    // No address entered — select the same truck type across ALL destination groups.
    // This filters out non-matching truck types while keeping all destinations visible.
    const selections: Record<string, string> = {};
    for (const group of knownGroups) {
      selections[group] = chargeTypeId;
    }
    return selections;
  }

  // Try exact match first, then substring match
  let matchedGroup: string | null = null;

  // Exact (case-insensitive)
  for (const group of knownGroups) {
    if (group.toLowerCase() === address) {
      matchedGroup = group;
      break;
    }
  }

  // Substring: does the address CONTAIN a known group name?
  if (!matchedGroup) {
    for (const group of knownGroups) {
      if (address.includes(group.toLowerCase())) {
        matchedGroup = group;
        break;
      }
    }
  }

  // Reverse substring: does a known group name CONTAIN the address?
  if (!matchedGroup) {
    for (const group of knownGroups) {
      if (group.toLowerCase().includes(address)) {
        matchedGroup = group;
        break;
      }
    }
  }

  if (matchedGroup) {
    return { [matchedGroup]: chargeTypeId };
  }

  // ✨ FIX (DESTINATION_COMBOBOX_BLUEPRINT Phase 1, Task 1.3):
  // Previously returned `undefined` here → engine skipped ALL filtering → every rate row fired.
  // Now return empty `{}` → engine sees "selections exist but nothing is selected" →
  // all selection-group rows are skipped → appliedRates = [] → ₱0 subtotal.
  // This correctly handles "outside contract" destinations.
  return {};
}

// ============================================
// MULTI-LINE TRUCKING (@see MULTI_LINE_TRUCKING_BLUEPRINT.md — Phase 1)
// ============================================

/**
 * Normalize trucking data into a `TruckingLineItem[]` array.
 *
 * Handles backward compatibility: auto-migrates old single-field
 * `truckType`/`deliveryAddress`/`qty` data into a one-element array.
 * If `truckingLineItems` already exists and is non-empty, returns it as-is.
 *
 * @param data - Any object that may contain legacy or new trucking fields
 * @returns TruckingLineItem[] — always at least one element (empty row if no data)
 *
 * @example — New format passthrough
 * normalizeTruckingLineItems({
 *   truckingLineItems: [
 *     { id: "a", destination: "Valenzuela", truckType: "40ft", quantity: 2 },
 *     { id: "b", destination: "Metro Manila", truckType: "4W", quantity: 3 },
 *   ]
 * })
 * // => returns the array as-is
 *
 * @example — Legacy migration
 * normalizeTruckingLineItems({ truckType: "40ft", deliveryAddress: "Valenzuela", qty: 2 })
 * // => [{ id: "legacy-0", destination: "Valenzuela", truckType: "40ft", quantity: 2 }]
 *
 * @example — Snake_case legacy (from saved quotation service_details)
 * normalizeTruckingLineItems({ truck_type: "40ft", delivery_address: "Valenzuela", qty: 2 })
 * // => [{ id: "legacy-0", destination: "Valenzuela", truckType: "40ft", quantity: 2 }]
 *
 * @example — Empty data
 * normalizeTruckingLineItems({})
 * // => [{ id: "default-0", destination: "", truckType: "", quantity: 1 }]
 */
export function normalizeTruckingLineItems(
  data: {
    truckingLineItems?: TruckingLineItem[];
    trucking_line_items?: TruckingLineItem[];  // snake_case from saved data
    truckType?: string;
    truck_type?: string;
    deliveryAddress?: string;
    delivery_address?: string;
    qty?: number;
  }
): TruckingLineItem[] {
  // Prefer camelCase, fall back to snake_case (from KV store)
  const lineItems = data.truckingLineItems || data.trucking_line_items;
  if (lineItems && lineItems.length > 0) {
    return lineItems;
  }

  // Legacy migration: single-field → one-element array
  const truckType = data.truckType || data.truck_type || "";
  const destination = data.deliveryAddress || data.delivery_address || "";
  const qty = data.qty || 1;

  if (truckType || destination) {
    return [{
      id: "legacy-0",
      destination,
      truckType,
      quantity: qty,
    }];
  }

  // No data at all — return one empty row for the form
  return [{
    id: "default-0",
    destination: "",
    truckType: "",
    quantity: 1,
  }];
}

/**
 * Intermediate result for one line item's extraction — used by the multi-pass engine.
 */
export interface LineItemExtraction {
  lineItem: TruckingLineItem;
  selections: Record<string, string> | undefined;
  quantities: BookingQuantities;
}

/**
 * Extract selections and quantities for each trucking line item.
 *
 * This is the multi-line equivalent of calling `extractTruckingSelections()`
 * and `extractQuantitiesFromTruckingForm()` separately. It reuses both
 * existing functions internally — DRY: no new fuzzy matching or quantity logic.
 *
 * Filters out line items with no truckType or zero quantity.
 *
 * @param lineItems - Array of trucking dispatch line items
 * @param rateMatrices - Contract rate matrices (for selection group matching)
 * @returns Array of { lineItem, selections, quantities } tuples ready for the engine
 *
 * @example
 * extractMultiLineSelectionsAndQuantities(
 *   [
 *     { id: "a", destination: "Valenzuela City", truckType: "40ft", quantity: 2 },
 *     { id: "b", destination: "Metro Manila", truckType: "4W", quantity: 3 },
 *   ],
 *   rateMatrices
 * )
 * // => [
 * //   { lineItem: {...}, selections: { "Valenzuela City": "20ft_40ft" }, quantities: { containers: 2, ... } },
 * //   { lineItem: {...}, selections: { "Metro Manila": "4wheeler" }, quantities: { containers: 3, ... } },
 * // ]
 *
 * @see /docs/blueprints/MULTI_LINE_TRUCKING_BLUEPRINT.md — Phase 1, Task 1.3
 */
export function extractMultiLineSelectionsAndQuantities(
  lineItems: TruckingLineItem[],
  rateMatrices: ContractRateMatrix[]
): LineItemExtraction[] {
  return lineItems
    .filter(li => li.truckType && li.quantity > 0)
    .map(li => ({
      lineItem: li,
      selections: extractTruckingSelections(
        { truckType: li.truckType, deliveryAddress: li.destination },
        rateMatrices
      ),
      quantities: {
        containers: li.quantity,
        shipments: 1,
        bls: 1,
        sets: 1,
      },
    }));
}
