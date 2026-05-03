/**
 * Ledger, bank, and general accounting types.
 *
 * Booking-first Essentials finance domain types now live in `./financials.ts`
 * so operational finance can evolve independently from the GL/account catalog
 * layer defined here.
 */
export type Currency = 'USD' | 'PHP';

/**
 * FX metadata persisted alongside any posted document or journal entry.
 * Original-currency fields preserve the source intent; base fields are
 * the locked PHP equivalents used for GL balancing and reporting.
 */
export interface FxFields {
  original_currency?: Currency | string;
  exchange_rate?: number;
  base_currency?: Currency;
  base_amount?: number;
  exchange_rate_date?: string | null;
}

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Income'
  | 'Expense';

export interface Account {
  id: string;
  name: string;
  code?: string;
  type: AccountType;
  currency: Currency;
  parent_id?: string;
  is_folder: boolean; // True for "A Plus Falcons - USD", False for "HSBC"
  balance: number; // Cached balance for quick display
  created_at: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  
  // The "Bank" side (Source of Funds)
  bank_account_id: string; 
  
  // The "Category" side (Destination / Classification)
  category_account_id: string; 
  
  // Optional: Reference number, attachments, etc.
  reference?: string;
  status: 'posted' | 'draft';
  created_at: string;
}

// Helper type for the hierarchical view
export interface AccountNode extends Account {
  children: AccountNode[];
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
  created_at?: string;
  notes?: string;
  created_by_name?: string;
  [key: string]: unknown;
}

export interface AccountingEntry {
  id: string;
  enteredBy?: string;
  [key: string]: unknown;
}
