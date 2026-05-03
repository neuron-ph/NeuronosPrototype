import type { QuotationNew } from "./pricing";
import type { ServiceType } from "./operations";

export type BookingPricingBasis = "spot" | "contract";

export type BookingResolution =
  | "resolved"
  | "missing"
  | "legacy-project-fallback";

export interface BookingFinancialContext {
  /**
   * Real booking identity for service-linked finance.
   * Legacy fallback values like project numbers must not be surfaced here.
   */
  bookingId: string | null;
  bookingResolution: BookingResolution;
  legacyBookingFallback: string | null;
  pricingBasis?: BookingPricingBasis | null;
  projectId?: string | null;
  projectNumber?: string | null;
  contractId?: string | null;
  contractNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  serviceType?: ServiceType | string | null;
}

export interface BookingChargeLine extends BookingFinancialContext {
  id: string;
  description: string;
  amount: number;
  currency: string;
  /** PHP-base equivalent of `amount` for reporting; falls back to `amount` for legacy rows. */
  baseAmount?: number;
  baseCurrency?: "PHP" | "USD";
  exchangeRate?: number;
  status: string;
  createdAt: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  category?: string | null;
  chargeType?: "revenue" | "cost" | "expense" | string | null;
  sourceId?: string | null;
  sourceQuotationItemId?: string | null;
  sourceBookingId?: string | null;
  sourceType?: "quotation_item" | "billable_expense" | "manual" | "rate_card" | string | null;
  isVirtual?: boolean;
  catalogItemId?: string | null;
  quantity?: number | null;
  forexRate?: number | null;
  isTaxed?: boolean | null;
}

export interface BookingExpense extends BookingFinancialContext {
  id: string;
  amount: number;
  currency: string;
  baseAmount?: number;
  baseCurrency?: "PHP" | "USD";
  exchangeRate?: number;
  status: string;
  createdAt: string | null;
  expenseDate: string | null;
  description?: string | null;
  vendorName?: string | null;
  category?: string | null;
  isBillable?: boolean;
  paymentStatus?: string | null;
}

export interface InvoiceFinancialDocument {
  id: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  status: string;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  /** PHP-base equivalent of totalAmount used for reporting. */
  baseAmount?: number;
  baseCurrency?: "PHP" | "USD";
  originalCurrency?: "PHP" | "USD" | string;
  exchangeRate?: number;
  remainingBalance: number;
  projectNumbers: string[];
  contractIds: string[];
  bookingIds: string[];
}

export interface BookingInvoiceLink extends BookingFinancialContext {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  remainingBalance: number;
}

export interface CollectionFinancialRecord {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  amount: number;
  baseAmount?: number;
  baseCurrency?: "PHP" | "USD";
  originalCurrency?: "PHP" | "USD" | string;
  exchangeRate?: number;
  status: string;
  collectionDate: string | null;
  projectNumbers: string[];
}

export interface BookingCollectionAllocation extends BookingFinancialContext {
  collectionId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  collectionDate: string | null;
  amount: number;
}

export interface BookingProfitabilityRow extends BookingFinancialContext {
  bookedCharges: number;
  unbilledCharges: number;
  invoicedAmount: number;
  collectedAmount: number;
  directCost: number;
  outstandingAmount: number;
  grossProfit: number;
}

export interface FinancialTotalsV2 {
  bookedCharges: number;
  unbilledCharges: number;
  invoicedAmount: number;
  collectedAmount: number;
  directCost: number;
  paidDirectCost: number;
  netCashFlow: number;
  grossProfit: number;
  grossMargin: number;
  outstandingAmount: number;
  overdueAmount: number;
}

export interface FinancialContainer {
  id: string;
  project_number: string;
  customer_id: string;
  customer_name: string;
  customer_address?: string;
  currency?: string;
  commodity?: string;
  linkedBookings?: any[];
  quotation?: QuotationNew;
}
