// Core Accounting Types (QuickBooks Style)

export type AccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export interface Account {
  id: string;
  code: string; // e.g. "1000"
  name: string; // e.g. "Cash in Bank"
  type: AccountType | "asset" | "liability" | "equity" | "income" | "expense" | "revenue" | "cost";
  subtype: string; // e.g. "Accounts Receivable"
  sub_type?: string;
  category?: string | null;
  sub_category?: string | null;
  normal_balance?: "debit" | "credit";
  sort_order?: number;
  description?: string;
  parent_account_id?: string | null;
  is_system: boolean; // Cannot be deleted
  is_active: boolean;
  starting_amount?: number; // Opening balance set by the user
  balance: number; // Current balance (starting_amount + net transaction activity)
  created_at: string;
  updated_at: string;
  
  // Neuron Hierarchical Fields
  is_folder?: boolean;
  depth?: number;
  currency?: "PHP" | "USD";
  parent_id?: string | null; // Alias for parent_account_id if inconsistent
}

export type JournalEntryType = "Invoice" | "Payment" | "Bill" | "Expense" | "Journal";

export interface JournalLine {
  id: string;
  account_id: string;
  account_name: string; // Snapshot for display
  description?: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  transaction_date: string;
  posted_at: string;
  description: string;
  reference_number: string;
  transaction_type: JournalEntryType;
  
  // Linking
  entity_id?: string; // Customer/Vendor ID
  entity_name?: string;
  project_id?: string;
  project_number?: string;
  
  // The Lines
  lines: JournalLine[];
  
  // Metadata
  total_amount: number; // Sum of debits (should equal sum of credits)
  status: "Posted" | "Void" | "Draft";
  created_by: string;
  created_at: string;
  updated_at: string;
}
