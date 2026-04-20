// ============================================
// NEW QUOTATION SYSTEM (Category-based with Multi-currency & Tax)
// ============================================

// Service-specific detail types (flexible maps for inquiry/quotation service data)
export type Incoterm = string;
export type BrokerageDetails = Record<string, any>;
export type ForwardingDetails = Record<string, any>;
export type TruckingDetails = Record<string, any>;
export type MarineInsuranceDetails = Record<string, any>;
export type OthersDetails = Record<string, any>;

// Form subtypes used by quotation form components
export type BrokerageSubtype = string;
export type ShipmentType = string;
export type Mode = string;
export type CargoType = string;
export type TruckType = string;

/**
 * @deprecated Use QuotationChargeCategory instead
 * Kept for backward compatibility during migration
 */
export interface VendorLineItem {
  id: string;
  description: string;
  unit_price: number;
  unit_type: "per_cbm" | "per_container" | "per_shipment" | "per_kg" | "flat_fee";
  currency: string;
  category?: string; // e.g., "Origin Charges", "Freight", "Destination Charges"
}

// ============================================
// VENDOR TYPES (for Quotation Builder)
// ============================================

/**
 * Vendor type classification
 */
export type VendorType = "International Partners" | "Local Partners" | "Subcontractors";

/**
 * Service type tags for multi-service quotations
 */
export type ServiceType = "Forwarding" | "Brokerage" | "Trucking" | "Marine Insurance" | "Others";

/**
 * Vendor in Quotation Builder
 * Represents a network partner/vendor added to a quotation
 */
export interface Vendor {
  id: string;                          // Local quotation vendor ID (e.g., "vendor-1234567890")
  type: VendorType;                    // Vendor classification
  name: string;                        // Display name (from NETWORK_PARTNERS)
  service_tag?: ServiceType;           // Which service this vendor provides
  vendor_id?: string;                  // Backend ID (e.g., "np-001") - Links to NETWORK_PARTNERS and KV store
  territory?: string;

  // Rate card data (copied from NETWORK_PARTNERS on add, or loaded from backend)
  charge_categories?: QuotationChargeCategory[];  // NEW format: Category-based rates
  line_items?: VendorLineItem[];                  // DEPRECATED: Old format (backward compatibility)
  services_offered?: string[];
}

/**
 * Line Item in the new quotation system
 * Supports multi-currency, forex conversion, and tax handling
 */
export interface QuotationLineItemNew {
  id: string;
  description: string;        // "O/F", "CFS", "LCL CHARGES"
  price: number;             // Base price (40.00)
  currency: string;          // "USD", "PHP", "EUR"
  quantity: number;          // 3.68
  unit?: string;             // "W/M", "B/L", "Set", "Shipment", "Container"
  unit_type?: string;        // ✨ NEW: Phase 2 (Per BL, Per Set) - Explicit field
  rating_basis?: string;     // ✨ NEW: Phase 2 (W/M, CBM, KG)
  forex_rate: number;        // 1.0 (or actual conversion rate)
  is_taxed: boolean;         // true if VAT applies to this item
  taxed?: boolean;           // alias for is_taxed (used by some components)
  charge_currency?: string;  // display currency for this line item
  tax_code?: string;         // ✨ NEW: Phase 2 (VAT, NVAT, ZR)
  remarks: string;           // "PER W/M", "PER BL", "PER SET"
  amount: number;            // Calculated: price × quantity × forex_rate
  service_tag?: string;      // Which service booking this belongs to: "Forwarding", "Brokerage", "Trucking", "Marine Insurance", "Others"
  service?: string;          // ✨ NEW: Service grouping (auto-populated from vendor's service_tag or manually set)
  
  // Optional (for cost tracking)
  buying_price?: number;
  vendor_id?: string;
  buying_amount?: number;

  // Catalog linkage (Item Master reference)
  catalog_item_id?: string;
}

/**
 * Charge Category group
 * Groups related charges together with subtotal
 */
export interface QuotationChargeCategory {
  id: string;
  category_name: string;     // "SEA FREIGHT", "ORIGIN LOCAL CHARGES"
  name?: string;             // Backward compatibility alias
  line_items: QuotationLineItemNew[];
  subtotal: number;          // Auto-calculated sum of line_items amounts
  catalog_category_id?: string; // FK to catalog_categories.id, used to scope catalog item creation
  
  // ✨ NEW: Category expansion state (for collapsible UI)
  is_expanded?: boolean;     // true = expanded, false = collapsed (default: true)
  display_order?: number;    // Order in which category appears (for drag-and-drop reordering)
}

// ============================================
// BUYING PRICE & SELLING PRICE (New Dual-Section Pricing)
// ============================================

/**
 * Buying Price - What you pay vendors (your costs)
 * Uses same structure as QuotationChargeCategory for consistency
 */
export type BuyingPriceCategory = QuotationChargeCategory;

/**
 * Selling Price Line Item - Enhanced with profit margin calculator
 * Per-line-item profit calculation with bidirectional amount/percentage sync
 */
export interface SellingPriceLineItem extends QuotationLineItemNew {
  base_cost: number;          // From buying price (what vendor charges you)
  amount_added: number;       // Dollar amount added as profit (e.g., $80)
  percentage_added: number;   // Percentage markup (e.g., 20%)
  final_price: number;        // Calculated: base_cost + amount_added
  // Note: final_price should equal 'price' field for consistency with existing system
  
  // ✨ VENDOR TRACKING (Internal Only - NOT displayed in Selling Price UI)
  // vendor_id is inherited from QuotationLineItemNew (line 25)
  // This allows linking back to Buying Price for sync operations
  // CRITICAL: Must NEVER be displayed in customer-facing Selling Price UI

  // ✨ RATE SOURCE TAGGING: Tracks where this line item's price came from
  // Used downstream for billing deduplication and revenue source analysis
  rate_source?: "contract_rate" | "manual" | "quotation" | "billable_expense";
}

/**
 * Selling Price Category - Group of selling price items with profit margins
 * 
 * DATA FLOW & MERGE LOGIC:
 * - When importing from multiple vendors with same category name (e.g., "Origin Charges"),
 *   the system will MERGE line items into a single category in Selling Price
 * - Category matching is case-insensitive: "Origin Charges" === "origin charges"
 * - Each line item maintains vendor_id internally for sync with Buying Price
 * - Customer sees consolidated view without vendor information
 * 
 * BUYING PRICE (Internal):        SELLING PRICE (Customer-Facing):
 * └─ Vendor A                     └─ Origin Charges (merged)
 *    └─ Origin Charges (3 items)      ├─ Item from Vendor A
 * └─ Vendor B                          ├─ Item from Vendor A
 *    └─ Origin Charges (2 items)      ├─ Item from Vendor A
 *                                     ├─ Item from Vendor B
 *                                     └─ Item from Vendor B
 */
export interface SellingPriceCategory {
  id: string;
  category_name: string;
  name?: string;              // Backward compatibility alias
  line_items: SellingPriceLineItem[];
  subtotal: number;           // Auto-calculated sum of final prices
  catalog_category_id?: string; // FK to catalog_categories.id — set on add/load, used to scope item combobox

  // ✨ NEW: Category expansion state (for collapsible UI)
  is_expanded?: boolean;      // true = expanded, false = collapsed (default: true)
  display_order?: number;     // Order in which category appears (for drag-and-drop reordering)
}

// ============================================
// HELPER TYPES FOR CATEGORY MERGE LOGIC
// ============================================

/**
 * Helper type for category matching during merge operations
 * Used to find existing categories by normalized name
 */
export interface CategoryMatcher {
  normalizedName: string;     // Lowercase, trimmed category name for comparison
  originalCategory: SellingPriceCategory;
}

/**
 * Result of a category merge operation
 * Indicates whether categories were merged or newly created
 */
export interface MergeResult {
  merged: boolean;            // true if items were merged into existing category
  categoryId: string;         // ID of the category (existing or new)
  itemsAdded: number;         // Number of line items added
  previousItemCount: number;  // Number of items before merge
  newItemCount: number;       // Number of items after merge
}

/**
 * Financial summary for quotation
 * Handles tax calculation and grand total
 */
export interface FinancialSummary {
  subtotal_non_taxed: number;   // Sum of non-taxed items
  subtotal_taxed: number;        // Sum of taxed items (before tax)
  tax_rate: number;              // e.g., 0.12 for 12% VAT
  tax_amount: number;            // subtotal_taxed × tax_rate
  other_charges: number;         // Any additional charges
  grand_total: number;           // sum of all + tax
}

/**
 * New Quotation Document
 * Category-based structure matching the actual quotation format
 * This is the UNIFIED structure - "Inquiry" is just a quotation with status "Inquiry"
 */
export interface QuotationNew {
  id: string;
  
  // Header
  quote_number: string;          // "IQ25120034"
  quotation_name?: string;       // Optional user-defined name
  created_date: string;          // User-visible business date (date-only, from builder)
  valid_until: string;
  customer_id: string;
  customer_name: string;
  customer_company?: string;
  customer_organization?: string;
  customer_department?: string;  // ✨ NEW: Phase 1
  customer_role?: string;        // ✨ NEW: Phase 1
  contact_id?: string;           // Alias for contact_person_id
  contact_person_id?: string;    // Link to Contact.id for proper relationships
  contact_person_name?: string;  // Contact person display name
  
  // ✨ CONTRACT: Quotation Type Discriminator
  // "project" = per-shipment (default, backward-compatible)
  // "contract" = annual rate table for contractual clients
  quotation_type?: QuotationType;
  
  // ✨ CONTRACT: Contract-specific fields (only when quotation_type === "contract")
  contract_validity_start?: string;    // Contract effective start date (ISO)
  contract_validity_end?: string;      // Contract effective end date (ISO)
  contract_status?: ContractQuotationStatus; // Contract lifecycle status
  rate_matrices?: ContractRateMatrix[];      // Rate tables per service type
  renewed_from_id?: string;            // ID of previous contract (renewal chain)
  scope_of_services?: string[];        // Contract: bullet-point scope items
  terms_and_conditions?: string[];     // Contract: bullet-point T&C items
  
  // ✨ CONTRACT: General Details (contract-level fields shown before service scope)
  contract_general_details?: {
    port_of_entry?: string[];           // Multi-select ports (e.g., ["MICP", "NAIA"])
    transportation?: string[];          // Multi-select: ["Air Freight", "Sea Freight"]
    type_of_entry?: string;             // Single: "Consumption" | "Warehousing" | "PEZA"
    releasing?: string;                 // Single: "Straight" | "Transfer" | "Partial"
  };
  
  // Shipment Details
  movement: "IMPORT" | "EXPORT";
  category: "SEA FREIGHT" | "AIR FREIGHT" | "LAND FREIGHT";
  shipment_freight: "LCL" | "FCL" | "CONSOLIDATION" | "BREAK BULK";
  services: string[];            // ["FORWARDING", "BROKERAGE"]
  service_mode?: string;         // ✨ NEW: Phase 1 (e.g. "Forwarding", "Brokerage")
  services_metadata?: InquiryService[]; // Optional detailed service specifications (used when status = "Inquiry")
  incoterm: string;
  carrier: string;               // "TBA" or actual carrier
  transit_days?: number;
  transit_time?: string;         // ✨ NEW: Phase 1 (e.g. "7 DAY/S")
  routing_info?: string;         // ✨ NEW: Phase 1 (e.g. "Via Hong Kong")
  collection_address?: string;
  pickup_address?: AddressStruct; // ✨ NEW: Phase 1 (Structured)
  
  // Cargo Details
  commodity: string;
  packaging_type?: string;       // ✨ NEW: Phase 1 (e.g. "Pallets", "Cartons")
  volume?: string;
  gross_weight?: number;         // GWT
  chargeable_weight?: number;    // CWT
  dimensions?: string;           // DIMS
  pol_aol: string;              // Port/Airport of Loading
  pod_aod: string;              // Port/Airport of Discharge
  
  // Pricing (Category-based)
  charge_categories: QuotationChargeCategory[];
  
  // ✨ NEW: Dual-Section Pricing (Buying vs Selling)
  buying_price?: BuyingPriceCategory[];   // What you pay vendors (costs)
  selling_price?: SellingPriceCategory[]; // What client pays you (revenue with margins)
  
  // Financial Summary
  currency: string;              // "USD", "PHP"
  financial_summary: FinancialSummary;
  
  // Terms & Approval
  credit_terms?: string;         // "Net 30", "Net 45"
  validity_period?: string;      // "15 days", "30 days"
  prepared_by?: string;
  prepared_by_title?: string;
  approved_by?: string;
  approved_by_title?: string;
  customer_signatory?: string;

  // PDF Document fields
  payment_terms?: string;
  custom_notes?: string;
  addressed_to_name?: string;
  addressed_to_title?: string;

  // Metadata
  status: QuotationStatus;
  inquiry_id?: string;           // Link to original inquiry (deprecated - same document now)
  assigned_to?: string;          // PD user assigned (when status = "Inquiry")
  disapproval_reason?: string;   // Reason for disapproval (when status = "Disapproved")
  
  // Project Conversion (set when converted to project)
  project_id?: string;           // Link to created project
  project_number?: string;       // Project number (e.g., "PROJ-2025-001")
  converted_to_project_at?: string; // Timestamp of conversion
  
  // ✨ CONTRACT RATE BRIDGE: Link to contract that supplied rates
  source_contract_id?: string;         // Contract ID if project uses contract rates
  source_contract_number?: string;     // Contract quote_number for display
  
  created_by: string;
  created_at: string;            // Server-stamped ISO timestamp (set on creation)
  updated_at: string;
  notes?: string;
}

// Backward compatibility alias - Inquiry is now just a QuotationNew with status "Inquiry"
export type Inquiry = QuotationNew;

// ============================================
// MOVEMENT & FREIGHT CATEGORY TYPES
// ============================================

export type Movement = "IMPORT" | "EXPORT";
export type FreightCategory = "SEA FREIGHT" | "AIR FREIGHT" | "LAND FREIGHT";
export type ShipmentFreight = "LCL" | "FCL" | "CONSOLIDATION" | "BREAK BULK";


// ============================================
// PROJECT & INQUIRY SERVICE TYPES
// ============================================

export interface AddressStruct {
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

export interface InquiryService {
  service_type: ServiceType;
  service_details: any; // Dynamic details based on service type
  [key: string]: any;
}

export type ProjectBookingStatus = "Not Booked" | "Partially Booked" | "Fully Booked" | "No Bookings Yet";

export type ProjectStatus = "Active" | "Completed" | "On Hold" | "Cancelled";

export interface Project {
  id: string;
  project_number: string;
  quotation_id: string;
  quotation_number: string;
  quotation_name?: string;
  
  // Customer
  customer_id: string;
  customer_name: string;
  customer_address?: string;
  customer_department?: string;
  customer_role?: string;
  contact_person_id?: string;
  contact_person_name?: string;
  
  // Shipment Details
  movement: "IMPORT" | "EXPORT";
  services: string[];
  service_mode?: string;
  services_metadata: InquiryService[];
  charge_categories: QuotationChargeCategory[];
  currency: string;
  total?: number;
  
  category?: "SEA FREIGHT" | "AIR FREIGHT" | "LAND FREIGHT";
  pol_aol?: string;
  pod_aod?: string;
  commodity?: string;
  packaging_type?: string;
  incoterm?: string;
  carrier?: string;
  volume?: string;
  gross_weight?: number;
  chargeable_weight?: number;
  dimensions?: string;
  transit_time?: string;
  routing_info?: string;
  collection_address?: string;
  pickup_address?: AddressStruct;
  
  shipment_type?: string;
  transit_days?: number;
  cargo_type?: string;
  stackability?: string;
  volume_cbm?: number;
  volume_containers?: number;
  volume_packages?: number;
  client_po_number?: string;
  client_po_date?: string;
  actual_etd?: string;
  eta?: string;
  actual_delivery_date?: string;
  shipment_ready_date?: string | null;
  requested_etd?: string | null;
  special_instructions?: string;
  
  // Status
  status: ProjectStatus;
  booking_status: ProjectBookingStatus;
  
  // Linking
  linkedBookings?: any[];
  
  // ✨ CONTRACT RATE BRIDGE: Link to contract that supplied rates
  source_contract_id?: string;         // Contract ID if project uses contract rates
  source_contract_number?: string;     // Contract quote_number for display
  
  // Ownership
  bd_owner_user_id?: string;
  bd_owner_user_name?: string;
  ops_assigned_user_id?: string | null;
  ops_assigned_user_name?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  
  // Derived/Joined fields
  quotation?: QuotationNew;
}

export type QuotationStatus = 
  | "Draft" 
  | "Pending Pricing" 
  | "Priced" 
  | "Sent to Client" 
  | "Accepted by Client" 
  | "Rejected by Client" 
  | "Needs Revision" 
  | "Disapproved" 
  | "Converted to Project" 
  | "Converted to Contract"
  | "Cancelled";

// ============================================
// CONTRACT QUOTATION TYPES
// ============================================

/**
 * Contract-specific statuses for the contract quotation lifecycle.
 * Separate from QuotationStatus because contracts have a fundamentally
 * different lifecycle (long-running vs one-time).
 */
export type ContractQuotationStatus =
  | "Draft"        // Being composed by Pricing
  | "Sent"         // Sent to client for review/signing
  | "Active"       // Signed and in effect — bookings can be linked
  | "Expiring"     // Within 30 days of validity end date
  | "Expired"      // Past validity end date
  | "Renewed";     // Superseded by a newer contract (renewed_from_id links them)

/**
 * Quotation type discriminator.
 * - "project": Per-shipment quotation that converts into a Project
 * - "contract": Annual rate table / menu for contractual clients
 */
export type QuotationType = "project" | "contract";

/**
 * A single row in a contract rate matrix.
 * Represents one charge particular (e.g., "Container", "Clearance") with
 * rates across multiple mode columns (e.g., FCL, LCL/AIR).
 */
export interface ContractRateRow {
  id: string;
  particular: string;                  // "Container", "Clearance", "Documentation", "Stamps"
  charge_type_id?: string;             // Stable ID from ChargeTypeRegistry — used for downstream matching (Contract → Project, Contract → Booking)
  rates: Record<string, number>;       // { "FCL": 4500, "LCL / AIR": 3500 }
  unit: string;                        // "per_container", "per_shipment", "per_bl", "per_set"
  succeeding_rule?: {
    rate: number;                      // 1800 — the rate for additional units
    after_qty: number;                 // 1 — first N at base rate, remainder at succeeding rate
  };
  remarks?: string;                    // Free-text: "per succeeding container", etc.
  is_at_cost?: boolean;                // When true, show "At Cost" instead of numeric rates
  group_label?: string;                // When set, render as a section sub-header row (e.g., "Valenzuela City")
  selection_group?: string;            // When set, rows sharing the same value are mutually exclusive alternatives
                                       // — only billed if explicitly selected via `selections` param in the engine.
                                       // Rows without this field remain additive (always billed). @see SELECTION_GROUP_BLUEPRINT.md
}

/**
 * A category grouping of rate rows within a contract rate matrix.
 * Mirrors the SellingPriceCategory / BuyingPriceCategory pattern.
 *
 * @see ContractRateMatrix.categories
 */
export interface ContractRateCategory {
  id: string;
  category_name: string;               // "Container Handling", "Documentation", etc.
  rows: ContractRateRow[];
}

/**
 * A rate matrix for one service type within a contract quotation.
 * One contract can have multiple matrices (e.g., Brokerage + Trucking).
 *
 * The matrix structure mirrors how clients actually see their rate agreements:
 *   Categories = charge groupings (Container Handling, Documentation, etc.)
 *   Rows = charge particulars within each category
 *   Columns = mode variants (FCL, LCL/AIR, etc.)
 *
 * `rows` is the flat source of truth for the rate engine.
 * `categories` organizes rows for the UI. When categories exist,
 * `rows` is derived by flattening all category rows before save.
 */
export interface ContractRateMatrix {
  id: string;
  service_type: ServiceType;           // "Brokerage", "Forwarding", "Trucking", etc.
  columns: string[];                   // ["FCL", "LCL / AIR"] — configurable per service
  rows: ContractRateRow[];             // Flat array for engine compatibility
  categories?: ContractRateCategory[]; // UI grouping (optional — auto-migrated from rows if missing)
}

/**
 * An instantiated rate — the result of applying a contract rate matrix
 * to an actual booking's quantities. Used for auto-billing.
 *
 * Example: 18 FCL containers under Brokerage with "Container" rate
 *   → particular: "Container"
 *   → rate: 4500 (base) + 1800 (succeeding)
 *   → quantity: 18
 *   → subtotal: 4500 + (17 × 1800) = 35100
 *   → rule_applied: "1 × ₱4,500 + 17 × ₱1,800"
 */
export interface AppliedRate {
  particular: string;
  rate: number;
  quantity: number;
  subtotal: number;
  rule_applied?: string;               // Human-readable breakdown
}

// ============================================
// MULTI-LINE TRUCKING TYPES (@see MULTI_LINE_TRUCKING_BLUEPRINT.md)
// ============================================

/**
 * A single trucking dispatch line item — one destination × one truck type × one quantity.
 *
 * Stored as `truckingLineItems: TruckingLineItem[]` on both quotations
 * (in `services_metadata[].service_details`) and bookings.
 *
 * @example
 * { id: "abc123", destination: "Valenzuela City", truckType: "40ft", quantity: 2 }
 */
export interface TruckingLineItem {
  id: string;              // Unique ID for React keys and identification
  destination: string;     // Free-text delivery address / destination
  truckType: string;       // Form value: "4W", "6W", "10W", "20ft", "40ft", "45ft"
  quantity: number;        // Number of trucks of this type to this destination
}

/**
 * Result of calculating billing for a single trucking line item.
 * Used by the multi-pass engine wrapper.
 */
export interface TruckingLineResult {
  lineItem: TruckingLineItem;
  appliedRates: AppliedRate[];
  subtotal: number;
}

/**
 * Aggregated result from the multi-pass trucking billing calculation.
 * Contains per-line-item breakdowns and a grand total.
 */
export interface MultiLineTruckingResult {
  lineResults: TruckingLineResult[];
  grandTotal: number;
}

// ============================================
// CONTRACT LOOKUP TYPES
// ============================================

/**
 * Slim projection of a contract quotation for detection/lookup scenarios.
 * Avoids fetching the full QuotationNew with all charge categories and rate matrices
 * unless the caller explicitly needs them.
 *
 * @see /utils/contractLookup.ts
 */
export interface ContractSummary {
  id: string;
  quote_number: string;
  quotation_name?: string;
  customer_name: string;
  contract_status: ContractQuotationStatus;
  contract_validity_start?: string;
  contract_validity_end?: string;
  services: string[];
  rate_matrices?: ContractRateMatrix[];   // Included when full=true
}
