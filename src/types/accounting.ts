/**
 * Ledger, bank, and general accounting types.
 *
 * Booking-first Essentials finance domain types now live in `./financials.ts`
 * so operational finance can evolve independently from the GL/account catalog
 * layer defined here.
 */
export type Currency = 'USD' | 'PHP';

export type AccountType = 
  | 'asset' 
  | 'liability' 
  | 'equity' 
  | 'income' 
  | 'expense';

export interface Account {
  id: string;
  name: string;
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
