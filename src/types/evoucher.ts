// E-Voucher System Types

// Canonical AP workflow states (new state machine — finalized 2026-04-11)
export type EVoucherStatus =
  | "draft"                   // Initial creation
  | "pending_manager"         // Awaiting Department Manager approval
  | "pending_ceo"             // Awaiting CEO / Executive approval
  | "pending_accounting"      // Awaiting Accounting — ready for disbursement
  | "disbursed"               // Treasury has released cash to rep
  | "pending_liquidation"     // Rep must submit receipts + actuals
  | "pending_verification"    // Accounting reviewing submitted receipts
  | "posted"                  // GL entries written — expense is on the books
  | "rejected"                // Rejected at Manager or CEO gate (cascades back)
  | "cancelled"               // Terminal — from draft or rejected only
  // Legacy states — kept for backwards compat with existing DB records; do not use for new EVs
  | "pending_tl"              // Legacy: renamed to pending_manager
  | "liquidation_open"        // Legacy: renamed to pending_liquidation
  | "liquidation_pending"     // Legacy: renamed to pending_verification
  | "liquidation_closed"      // Legacy: mapped to posted
  | "pending"
  | "Submitted"
  | "Under Review"
  | "Approved"
  | "Rejected"
  | "Processing"
  | "Disbursed"
  | "Recorded"
  | "Audited"
  | "Draft"
  | "Cancelled"
  | "Disapproved";

// AP-side transaction types (go through the full EV approval workflow)
export type EVoucherAPType =
  | "expense"          // Pay a vendor — creates cost record
  | "cash_advance"     // Give employee money before job — creates advance asset
  | "reimbursement"    // Pay employee back for out-of-pocket — creates cost record, direct cash
  | "budget_request"   // Lump sum to a department — creates advance asset
  | "direct_expense";  // Direct purchase request, not tied to booking — CEO approval only

// EVoucherTransactionType is now identical to EVoucherAPType.
// The retired AR-side pseudo-types ("billing", "collection", "adjustment") have been removed.
// Billings and collections are tracked in their own tables, not as EV transaction types.
export type EVoucherTransactionType = EVoucherAPType;

// Source Module - Which module created this E-Voucher
export type EVoucherSourceModule = 
  | "bd"                // Business Development
  | "operations"        // Operations
  | "accounting"        // Accounting
  | "pricing"           // Pricing
  | "hr"                // HR
  | "executive";        // Executive

// GL Account Categories for Financial Statements
export type GLCategory = 
  | "Revenue"         // Income Statement - Revenue
  | "Cost of Sales"   // Income Statement - COGS
  | "Operating Expenses" // Income Statement - OpEx
  | "Assets"          // Balance Sheet - Assets
  | "Liabilities"     // Balance Sheet - Liabilities
  | "Equity";         // Balance Sheet - Equity

// Sub-categories mapped to specific GL accounts
export type GLSubCategory = {
  // Revenue sub-categories
  Revenue: 
    | "Brokerage Income"
    | "Forwarding Income"
    | "Trucking Income"
    | "Warehousing Income"
    | "Documentation Fees"
    | "Other Service Income";
  
  // Cost of Sales sub-categories
  "Cost of Sales":
    | "Brokerage Costs"
    | "Forwarding Costs"
    | "Trucking Costs"
    | "Warehousing Costs"
    | "Port Charges"
    | "Customs Duties";
  
  // Operating Expenses sub-categories
  "Operating Expenses":
    | "Salaries & Wages"
    | "Office Rent"
    | "Utilities"
    | "Marketing & Advertising"
    | "Travel & Entertainment"
    | "Office Supplies"
    | "Professional Fees"
    | "Telecommunications"
    | "Depreciation"
    | "Miscellaneous";
  
  // Assets sub-categories
  Assets:
    | "Cash & Cash Equivalents"
    | "Accounts Receivable"
    | "Inventory"
    | "Prepaid Expenses"
    | "Property & Equipment"
    | "Other Assets";
  
  // Liabilities sub-categories
  Liabilities:
    | "Accounts Payable"
    | "Accrued Expenses"
    | "Loans Payable"
    | "Other Liabilities";
  
  // Equity sub-categories
  Equity:
    | "Capital"
    | "Retained Earnings"
    | "Drawings";
};

export type EVoucherCategory = string;

export type PaymentMethod = "Cash" | "Bank Transfer" | "Check" | "Credit Card" | "Online Payment";

export type PaymentType = "Full" | "Partial";

export type LiquidationStatus = "Yes" | "No" | "Pending";

// New Types for Billing Architecture
export type BillingStatus = "unbilled" | "billed" | "paid" | "partial";

export interface LinkedBilling {
  id: string; // The ID of the billing EVoucher being paid
  amount: number; // The amount applied to this billing
}

export interface EVoucherApprover {
  id: string;
  name: string;
  role: string;
  approved_at?: string;
  remarks?: string;
}

export interface EVoucherWorkflowHistory {
  id: string;
  timestamp: string;
  status: EVoucherStatus;
  user_name: string;
  user_role: string;
  action: string;
  remarks?: string;
}

export interface EVoucher {
  id: string;
  voucher_number: string; // e.g., EVRN-2025-001 or BR-001
  
  // Universal Transaction Fields
  transaction_type?: EVoucherTransactionType; // Type of transaction
  source_module?: EVoucherSourceModule; // Which module created this
  
  // Request Details
  requestor_id: string;
  requestor_name: string;
  requestor_department?: string; // BD, Operations, HR, etc.
  request_date: string;
  
  // Transaction Information (filled by requestor)
  amount: number;
  currency: string;
  purpose: string;
  description?: string;
  
  // GL Categorization (filled by Accounting during approval)
  gl_category?: GLCategory;
  gl_sub_category?: string; // Varies based on gl_category
  expense_category?: string;
  sub_category?: string;
  
  // Linking
  project_number?: string; // Booking ID
  customer_id?: string;
  customer_name?: string;
  budget_request_id?: string;
  budget_request_number?: string;
  parent_voucher_id?: string; // For linking liquidations/returns to original request
  
  // Billing & Collections Architecture (New Fields)
  statement_reference?: string; // ID for grouping billings (SOA)
  billing_status?: BillingStatus; // Lifecycle of a billing item
  remaining_balance?: number; // Amount left to be paid
  linked_billings?: LinkedBilling[]; // For collections: which billings this pays
  billable_item_reference?: string; // ID of source item (e.g. Quotation Charge ID)

  // Vendor Information (filled by requestor)
  vendor_id?: string;
  vendor_name: string;
  vendor_contact?: string;
  is_billable?: boolean; // Is this expense billable to the client?
  
  // Payment Terms (filled by requestor)
  credit_terms?: string;
  due_date?: string;
  payment_method?: PaymentMethod;
  payment_type?: PaymentType;
  source_account_id?: string; // ID of the bank/cash account
  
  // Approval Flow
  status: EVoucherStatus;
  current_approver_id?: string;
  current_approver_name?: string;
  approvers: EVoucherApprover[];
  
  // Treasury/Disbursement
  disbursement_officer_id?: string;
  disbursement_officer_name?: string;
  disbursement_date?: string;
  disbursement_method?: string;
  disbursement_reference?: string;
  disbursement_source_account_id?: string;
  disbursement_source_account_name?: string;
  disbursement_journal_entry_id?: string;
  disbursed_by_user_id?: string;
  disbursed_by_name?: string;
  disbursement_remarks?: string;
  liquidation_status?: LiquidationStatus;
  source_of_funds?: string;

  // GL Journal Entries
  closing_journal_entry_id?: string;   // Closing / Verify & Post entry (renamed from journal_entry_id)
  
  // Accounting
  recorded_by_id?: string;
  recorded_by_name?: string;
  recorded_date?: string;
  
  // Audit
  audited_by_id?: string;
  audited_by_name?: string;
  audited_date?: string;
  pre_audit_remarks?: string;
  
  // Source tracking (used by billing_line_items and conversion flows)
  source_type?: string;
  source_id?: string;
  posted_to_ledger?: boolean;

  // Line Items (for multi-line vouchers)
  line_items?: unknown[];                        // Legacy JSONB — kept for backwards compat reads
  evoucher_line_items?: EVoucherLineItem[];      // Relational line items (new)
  notes?: string;

  // Attachments & History
  attachments?: string[];
  workflow_history: EVoucherWorkflowHistory[];
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface EVoucherFilters {
  status?: EVoucherStatus | "all";
  transaction_type?: EVoucherTransactionType | "all";
  source_module?: EVoucherSourceModule | "all";
  gl_category?: GLCategory | "all";
  date_from?: string;
  date_to?: string;
  requestor_id?: string;
  customer_id?: string;
  search?: string;
}

// Relational line item for an E-Voucher (replaces JSONB line_items)
export interface EVoucherLineItem {
  id: string;
  evoucher_id: string;
  particular: string;
  description: string;
  amount: number;
  catalog_item_id?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// A single receipt/expense line item within a liquidation submission
export interface LiquidationLineItem {
  id: string;
  description: string;
  vendor_name?: string;     // Who was paid (rep fills)
  amount: number;
  receipt_url?: string;     // Uploaded receipt photo/scan
  gl_category?: string;     // Accounting assigns during verification
}

// A liquidation submission against a cash_advance or budget_request EV
export interface LiquidationSubmission {
  id: string;
  evoucher_id: string;          // FK to the parent cash_advance / budget_request EV
  submitted_by: string;         // User ID of handler
  submitted_by_name: string;
  line_items: LiquidationLineItem[];
  total_spend: number;          // Sum of all line item amounts in this submission
  unused_return?: number;       // Cash being returned (final submission only)
  is_final: boolean;            // True = handler is closing out the advance
  status: "pending" | "approved" | "revision_requested";
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_remarks?: string;
  created_at: string;
}

// GL journal entry suggestion per EV type (used in the GL Confirmation Sheet)
export interface GLEntrySuggestion {
  debit_account_id: string;
  debit_account_name: string;
  credit_account_id: string;
  credit_account_name: string;
  amount: number;
  description: string;
}

// Canonical GL contract per AP type
export const GL_CONTRACT: Record<EVoucherAPType, { on_approval: string; on_disbursement: string }> = {
  expense:        { on_approval: "DR Accounts Payable / CR (pending)",  on_disbursement: "DR Accounts Payable / CR Cash" },
  cash_advance:   { on_approval: "(no entry)",                           on_disbursement: "DR Advances to Employees / CR Cash" },
  reimbursement:  { on_approval: "(no entry)",                           on_disbursement: "DR Expense / CR Cash" },
  budget_request: { on_approval: "(no entry)",                           on_disbursement: "DR Advances to Employees / CR Cash" },
  direct_expense: { on_approval: "(no entry)",                           on_disbursement: "DR Expense / CR Cash" },
};
