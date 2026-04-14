import type { AppliedRate } from "./pricing";

// ==================== STATUS TYPES ====================

export type ExecutionStatus =
  | "Draft"
  | "Pending"
  | "Confirmed"
  | "In Progress"
  | "Delivered"
  | "Completed"
  | "On Hold"
  | "Cancelled"
  | "Closed";

// ==================== SERVICE TYPES ====================

export type ServiceType = 
  | "Forwarding" 
  | "Brokerage" 
  | "Trucking" 
  | "Marine Insurance" 
  | "Others";

// ==================== CLIENT HANDLER PREFERENCES ====================

export interface ClientHandlerPreference {
  id: string;
  customer_id: string;
  service_type: ServiceType;
  preferred_manager_id: string;
  preferred_manager_name: string;
  preferred_supervisor_id: string;
  preferred_supervisor_name: string;
  preferred_handler_id: string;
  preferred_handler_name: string;
  created_at: string;
  updated_at: string;
}

// ==================== SHIPMENT QUANTITIES ====================

/**
 * Structured numeric quantities for a booking's shipment.
 * Used by the contract rate engine to calculate billing.
 * 
 * Maps 1:1 to BookingQuantities in contractRateEngine.ts:
 *   containers → per_container rates
 *   bls        → per_bl rates
 *   sets       → per_set rates
 *   shipments  → per_shipment rates
 *
 * @see /docs/blueprints/BOOKING_QUANTITIES_BLUEPRINT.md
 */
export interface ShipmentQuantities {
  /** Number of containers (FCL) or trucks (Trucking). Default: 1 */
  containers: number;
  /** Number of bills of lading. Default: 1 */
  bls: number;
  /** Number of document sets (stamps, certificates, etc.). Default: 1 */
  sets: number;
  /** Number of shipments — almost always 1 per booking. Default: 1 */
  shipments: number;
}

/** Default shipment quantities for new bookings */
export const DEFAULT_SHIPMENT_QUANTITIES: ShipmentQuantities = {
  containers: 1,
  shipments: 1,
  bls: 1,
  sets: 1,
};

// ==================== EXAMINATION & PENALTY TRACKING ====================

/**
 * Customs examination types that may occur during brokerage processing.
 * These are operational facts that can have billing implications.
 */
export type ExaminationType = "None" | "DEA" | "Physical" | "X-Ray";

// ==================== FORWARDING BOOKING ====================

export interface ForwardingBooking {
  bookingId: string;
  projectNumber?: string; // Optional reference for autofill
  createdAt: string;
  updatedAt: string;

  // ✨ CONTRACT: Link to active contract quotation (for contractual clients)
  contract_id?: string;
  contract_applied_rates?: AppliedRate[];

  // 📦 SHIPMENT QUANTITIES: Structured counts for billing calculation
  shipment_quantities?: ShipmentQuantities;

  // General Information
  customerName: string;
  movement: "IMPORT" | "EXPORT";
  accountOwner: string;
  accountHandler: string;
  services: string[];
  subServices: string[];
  typeOfEntry: string;
  mode: "FCL" | "LCL" | "AIR";
  cargoType: string;
  stackability?: string;
  deliveryAddress: string;
  quotationReferenceNumber: string;
  status: ExecutionStatus;

  // Team Assignments (new architecture)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;

  // Expected Volume
  qty20ft?: string;
  qty40ft?: string;
  qty45ft?: string;
  volumeGrossWeight?: string;
  volumeDimensions?: string;
  volumeChargeableWeight?: string;

  // Status-dependent fields
  pendingReason?: string;
  completionDate?: string;
  cancellationReason?: string;
  cancelledDate?: string;

  // General Export Fields
  incoterms?: string;
  cargoNature?: string;

  // Shipment Information
  consignee: string;
  consignee_id?: string; // Links to Consignee entity (optional)
  shipper: string;
  mblMawb: string;
  hblHawb: string;
  bookingReferenceNumber?: string; // Export specific
  registryNumber: string;
  carrier: string;
  aolPol: string;
  aodPod: string;
  forwarder: string;
  commodityDescription: string;
  countryOfOrigin: string;
  preferentialTreatment: string;
  grossWeight: string;
  dimensions: string;
  eta: string;
  lct?: string; // Export specific (Last Cargo Time)
  transitTime?: string; // Export specific
  route?: string; // Export specific

  // FCL-specific fields
  containerNumbers?: string[];
  containerDeposit?: boolean;
  emptyReturn?: string;
  detDemValidity?: string;
  storageValidity?: string;
  croAvailability?: string;
  tareWeight?: string; // Export specific
  vgm?: string; // Export specific
  warehouseAddress?: string; // Export specific
  truckingName?: string; // Export specific
  plateNumber?: string; // Export specific
  pickupLocation?: string; // Export specific (Collection Address)

  // LCL/AIR-specific fields
  warehouseLocation?: string;

  // DB/legacy fields
  id?: string;
  booking_number?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
}

// ==================== BROKERAGE BOOKING ====================

export interface BrokerageBooking {
  bookingId: string;
  booking_number?: string;
  projectNumber?: string; // Optional reference for autofill
  createdAt: string;
  updatedAt: string;

  // ✨ CONTRACT: Link to active contract quotation (for contractual clients)
  contract_id?: string;
  contract_applied_rates?: AppliedRate[];

  // 📦 SHIPMENT QUANTITIES: Structured counts for billing calculation
  shipment_quantities?: ShipmentQuantities;

  // 🔍 EXAMINATION & PENALTIES: Operational events with billing implications
  examination_type?: ExaminationType;
  penalty_flags?: string[];

  // General Information
  customerName: string;
  movement: "IMPORT" | "EXPORT";
  accountOwner?: string;
  accountHandler?: string;
  service?: string; // Service/s
  incoterms?: string;
  mode?: string;
  cargoType?: string;
  cargoNature?: string;
  quotationReferenceNumber?: string;
  status: ExecutionStatus;

  // Team Assignments (new architecture)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;

  // Shipment Information
  consignee?: string;
  consignee_id?: string; // Links to Consignee entity (optional)
  shipper?: string;
  mblMawb?: string;
  bookingConfirmationNumber?: string; // Export specific
  hblHawb?: string;
  registryNumber?: string;
  carrier?: string;
  aolPol?: string;
  aodPod?: string;
  pod?: string; // Port of Discharge (from service specs)
  forwarder?: string;
  commodityDescription?: string;
  grossWeight?: string;
  dimensions?: string;
  taggingTime?: string;
  etd?: string;
  etb?: string;
  eta?: string;
  lct?: string; // Export specific (Last Cargo Time)

  // FCL Information
  containerNumbers?: string;
  containerDeposit?: string;
  detDem?: string;
  tareWeight?: string; // Export specific
  vgm?: string; // Export specific
  truckingName?: string; // Export specific
  plateNumber?: string; // Export specific
  pickupLocation?: string; // Export specific (Collection Address)
}

// ==================== TRUCKING BOOKING ====================

export interface TruckingBooking {
  bookingId: string;
  booking_number?: string;
  projectNumber?: string;
  createdAt: string;
  updatedAt: string;

  // ✨ CONTRACT: Link to active contract quotation (for contractual clients)
  contract_id?: string;
  contract_applied_rates?: AppliedRate[];

  // 📦 SHIPMENT QUANTITIES: Structured counts for billing calculation
  shipment_quantities?: ShipmentQuantities;

  // General Information
  customerName: string;
  movement: "IMPORT" | "EXPORT";
  accountOwner?: string;
  accountHandler?: string;
  service?: string;
  truckType?: string;
  mode?: string;
  preferredDeliveryDate?: string;
  quotationReferenceNumber?: string;
  status: ExecutionStatus;

  // Team Assignments (new architecture)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;

  // Shipment Information
  consignee?: string;
  consignee_id?: string; // Links to Consignee entity (optional)
  driver?: string;
  helper?: string;
  vehicleReferenceNumber?: string;
  pullOut?: string;
  deliveryAddress?: string;
  warehouseAddress?: string; // Export specific
  deliveryInstructions?: string;
  dateDelivered?: string;
  withGps?: boolean; // Export specific

  // FCL Information
  tabsBooking?: string;
  emptyReturn?: string;
  cyFee?: string;
  eirAvailability?: string;
  earlyGateIn?: string;
  gateIn?: string; // Export specific
  detDemValidity?: string;
  storageValidity?: string;
  shippingLine?: string;
}

// ==================== MARINE INSURANCE BOOKING ====================

export interface MarineInsuranceBooking {
  bookingId: string;
  booking_number?: string;
  projectNumber?: string;
  createdAt: string;
  updatedAt: string;

  // ✨ CONTRACT: Link to active contract quotation (for contractual clients)
  contract_id?: string;
  contract_applied_rates?: AppliedRate[];

  // General Information
  customerName: string;
  movement: "IMPORT" | "EXPORT";
  accountOwner?: string;
  accountHandler?: string;
  service?: string;
  quotationReferenceNumber?: string;
  status: ExecutionStatus;

  // Team Assignments (new architecture)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;

  // Policy Information
  policyNumber?: string;
  insuranceCompany?: string;
  insuredValue?: string;
  currency?: string;
  coverageType?: string;
  effectiveDate?: string;
  expiryDate?: string;

  // Shipment Information
  commodityDescription?: string;
  hsCode?: string;
  invoiceNumber?: string;
  invoiceValue?: string;
  packagingType?: string;
  numberOfPackages?: string;
  grossWeight?: string;
  dimensions?: string;

  // Route Information
  aol?: string; // Airport/Port of Loading
  pol?: string; // Port of Loading
  aod?: string; // Airport/Port of Discharge
  pod?: string; // Port of Discharge
  vesselVoyage?: string;
  mode?: string;

  // Additional Information
  specialConditions?: string;
  remarks?: string;
}

// ==================== OTHERS BOOKING ====================

export interface OthersBooking {
  bookingId: string;
  booking_number?: string;
  projectNumber?: string;
  createdAt: string;
  updatedAt: string;

  // ✨ CONTRACT: Link to active contract quotation (for contractual clients)
  contract_id?: string;
  contract_applied_rates?: AppliedRate[];

  // 📦 SHIPMENT QUANTITIES: Structured counts for billing calculation
  shipment_quantities?: ShipmentQuantities;

  // General Information
  customerName: string;
  movement: "IMPORT" | "EXPORT";
  accountOwner?: string;
  accountHandler?: string;
  service?: string;
  serviceDescription?: string;
  quotationReferenceNumber?: string;
  status: ExecutionStatus;

  // Team Assignments (new architecture)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;

  // Service Details
  deliveryAddress?: string;
  requestedDate?: string;
  completionDate?: string;
  specialRequirements?: string;

  // Additional Information
  notes?: string;
  attachments?: string[];
}

// ==================== BILLINGS ====================

export interface BillingLineItem {
  description: string;
  price: number;
  quantity: number;
  unit?: string;
  amount: number;
  remarks?: string;
  original_currency?: string;
  exchange_rate?: number;
  original_amount?: number;
}

export interface BillingChargeCategory {
  categoryName: string;
  lineItems: BillingLineItem[];
  subtotal: number;
}

export interface Billing {
  billingId: string;
  bookingId: string;
  bookingType: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  createdAt: string;
  updatedAt: string;

  // Source tracking
  source?: "project" | "manual";
  projectNumber?: string;
  quotationNumber?: string;

  // Detailed structure (for project billings)
  chargeCategories?: BillingChargeCategory[];

  // Legacy fields (for manual billings or backward compat)
  description: string;
  amount: number;
  currency: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  status: "Pending" | "Invoiced" | "Paid";
  paymentDate?: string;
  notes?: string;
}

// ==================== EXPENSES ====================

export interface ExpenseLineItem {
  description: string;
  buyingPrice: number;
  quantity: number;
  unit?: string;
  amount: number;
  vendorId?: string;
  vendorName?: string;
  remarks?: string;
}

export interface ExpenseChargeCategory {
  categoryName: string;
  lineItems: ExpenseLineItem[];
  subtotal: number;
}

export interface Expense {
  expenseId: string;
  bookingId: string;
  bookingType: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  createdAt: string;
  updatedAt: string;

  // Source tracking
  source?: "project" | "manual";
  projectNumber?: string;
  quotationNumber?: string;

  // Detailed structure (for project expenses)
  chargeCategories?: ExpenseChargeCategory[];

  // Legacy fields (for manual expenses or backward compat)
  description: string;
  amount: number;
  currency: string;
  vendor?: string;
  expenseDate?: string;
  category?: string;
  status: "Pending" | "Approved" | "Paid";
  notes?: string;
  isBillable?: boolean;
}