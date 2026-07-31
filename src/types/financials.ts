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

/**
 * Booking-first financial document types.
 *
 * These moved out of the retired `types/accounting.ts` when the double-entry
 * layer was removed (docs/ACCOUNTING_REMOVAL_PLAN.md, Phase 5). They describe
 * the DOCUMENTS operations actually works with — billings, collections,
 * expenses, invoices — not ledger accounts.
 *
 * FxFields stays because per-document FX metadata (what rate this invoice was
 * struck at) is real and survives; it is GL *revaluation* that died, not
 * currency itself.
 */

export type Currency = 'USD' | 'PHP';

export interface FxFields {
  original_currency?: Currency | string;
  exchange_rate?: number;
  base_currency?: Currency;
  base_amount?: number;
  exchange_rate_date?: string | null;
}

// Billing record as stored in the invoices/evouchers tables
export interface Billing extends FxFields {
  id: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  customer_name?: string;
  customer_address?: string;
  customer_contact?: string;
  project_number?: string;
  payment_terms?: string;
  payment_status?: string;
  status?: string;
  total_amount: number;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  amount_paid?: number;
  amount_due?: number;
  line_items?: any[];
  created_by_name?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

// Collection record as stored in the collections/evouchers tables
export interface Collection extends FxFields {
  id: string;
  evoucher_number?: string;
  reference_number?: string;
  customer_name?: string;
  description?: string;
  project_number?: string;
  amount: number;
  currency?: string;
  collection_date?: string;
  payment_method?: string;
  received_by_name?: string;
  evoucher_id?: string;
  invoice_id?: string;
  status?: string;
  notes?: string;
  linked_billings?: any[];
  created_at?: string;
  [key: string]: any;
}

// Expense record as stored in the evouchers table
export interface Expense extends FxFields {
  id: string;
  evoucher_number?: string;
  date?: string;
  vendor?: string;
  category?: string;
  sub_category?: string;
  amount: number;
  currency?: string;
  description?: string;
  status: string;
  project_number?: string;
  payment_method?: string;
  due_date?: string;
  requestor_name?: string;
  line_items?: any[];
  notes?: string;
  [key: string]: any;
}

export interface Invoice extends FxFields {
  id: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  credit_terms?: string;
  customer_name?: string;
  customer_address?: string;
  customer_tin?: string;
  bl_number?: string;
  commodity_description?: string;
  consignee?: string;
  currency?: string;
  status?: string;
  line_items?: any[];
  description?: string;
  amount?: number;
  total_amount?: number;
  ewt_total?: number; // NEU-069: EWT withheld across lines; internal, reduces the collectible balance
  created_at?: string;
  notes?: string;
  created_by_name?: string;
  [key: string]: unknown;
}
