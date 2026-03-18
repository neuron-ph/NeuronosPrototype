import type { FinancialTotals } from "../utils/financialCalculations";

export interface FinancialData {
  invoices: any[];
  billingItems: any[];
  expenses: any[];
  collections: any[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  totals: FinancialTotals;
}
