import { supabase } from './supabase/client';
import { Account, AccountType } from '../types/accounting-core';
import { Transaction } from '../types/accounting';
import { freightForwardingCoASeed, SeedAccountRow } from './accounting-seed';
import {
  FUNCTIONAL_CURRENCY,
  normalizeCurrency,
  type AccountingCurrency,
} from './accountingCurrency';

/**
 * Account types that may legitimately hold a non-PHP balance.
 *
 * Currency-specific behaviour is restricted to monetary leaf accounts (cash,
 * bank, AR, AP). Revenue/Expense/Equity accounts stay in the PHP functional
 * currency since the GL itself balances in PHP.
 *
 * The seeded chart of accounts stores types as lowercase strings ("asset",
 * "liability", ...), while UI code uses the capitalized forms. Compare
 * case-insensitively so we never silently coerce a USD bank account back to
 * PHP when reading a seeded row.
 */
const MONETARY_ACCOUNT_TYPES = new Set(["asset", "liability"]);

export function isMonetaryAccountType(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return MONETARY_ACCOUNT_TYPES.has(value.trim().toLowerCase());
}

function resolveAccountCurrency(account: Partial<Account>): AccountingCurrency {
  const requested = normalizeCurrency(account.currency, FUNCTIONAL_CURRENCY);
  if (requested === FUNCTIONAL_CURRENCY) return FUNCTIONAL_CURRENCY;
  if (!isMonetaryAccountType(account.type ?? "Expense")) return FUNCTIONAL_CURRENCY;
  return requested;
}

console.log("Loading accounting-api.ts (Client Side - Direct Supabase)");

function mapDbAccountToUi(row: Record<string, any>): Account {
  return {
    ...row,
    type: row.type,
    subtype: row.subtype ?? row.sub_type ?? "",
    sub_type: row.sub_type ?? row.subtype ?? "",
    category: row.category ?? null,
    sub_category: row.sub_category ?? null,
    normal_balance: row.normal_balance ?? "debit",
    sort_order: row.sort_order ?? 0,
    parent_id: row.parent_id ?? row.parent_account_id ?? null,
    currency: row.currency ?? "PHP",
    is_folder: Boolean(row.is_folder),
    starting_amount: row.starting_amount ?? 0,
    balance: row.balance ?? 0,
    is_active: row.is_active ?? true,
    is_system: row.is_system ?? false,
  };
}

function mapUiAccountToDb(account: Partial<Account>): Record<string, any> {
  return {
    id: account.id,
    code: account.code ?? "",
    name: account.name ?? "",
    type: account.type ?? "Expense",
    sub_type: account.subtype ?? account.sub_type ?? null,
    category: account.category ?? null,
    sub_category: account.sub_category ?? null,
    description: account.description ?? null,
    parent_id: account.parent_id ?? account.parent_account_id ?? null,
    balance: account.balance ?? 0,
    starting_amount: account.starting_amount ?? 0,
    normal_balance: account.normal_balance ?? "debit",
    is_active: account.is_active ?? true,
    is_system: account.is_system ?? false,
    sort_order: account.sort_order ?? 0,
    currency: resolveAccountCurrency(account),
    updated_at: account.updated_at ?? new Date().toISOString(),
    created_at: account.created_at,
  };
}

async function upsertSeedAccounts(rows: SeedAccountRow[]): Promise<void> {
  const chunkSize = 75;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from('accounts').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }
}

/**
 * Fetches all accounts from Supabase.
 */
export const getAccounts = async (): Promise<Account[]> => {
  try {
    const { data, error } = await supabase.from('accounts').select('*');
    if (error) throw new Error(error.message);
    
    // Sort logic: Code then Name
    return (data || []).map((row) => mapDbAccountToUi(row)).sort((a: Account, b: Account) => {
        const codeA = a.code || "";
        const codeB = b.code || "";
        return codeA.localeCompare(codeB) || a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    return [];
  }
};

/**
 * Saves or updates an account.
 */
export const saveAccount = async (account: Account): Promise<void> => {
  const { error } = await supabase.from('accounts').upsert(mapUiAccountToDb(account), { onConflict: 'id' });
  if (error) throw new Error('Failed to save account: ' + error.message);
};

/**
 * Deletes an account.
 */
export const deleteAccount = async (id: string): Promise<void> => {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw new Error('Failed to delete account: ' + error.message);
};

/**
 * Seeds initial accounts if the table is empty. No-op if accounts already exist.
 * For full COA seeding, use the Supabase SQL Editor with the seed scripts.
 */
export const seedInitialAccounts = async (): Promise<void> => {
  const { data, error } = await supabase.from('accounts').select('id, code').limit(500);
  if (error) throw new Error('Failed to inspect chart of accounts: ' + error.message);

  const accounts = data || [];
  const hasBaseFreightForwardingChart = accounts.some((account) => account.id === 'coa-1000' || account.code === '1000');
  const hasExpenseDetailOnlySeed = accounts.some((account) => account.id === 'coa-6700' || account.code === '6700');

  if (accounts.length === 0 || (!hasBaseFreightForwardingChart && hasExpenseDetailOnlySeed)) {
    await upsertSeedAccounts(freightForwardingCoASeed);
  }
};

/**
 * Resets (deletes all) accounts from the chart of accounts.
 */
export const resetChartOfAccounts = async (): Promise<void> => {
  const { error } = await supabase.from('accounts').delete().neq('id', '');
  if (error) throw new Error('Failed to reset chart of accounts: ' + error.message);
  await upsertSeedAccounts(freightForwardingCoASeed);
};

/**
 * Fetches all transactions.
 */
export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return [];
  }
};

/**
 * Saves a transaction and updates the account balance.
 */
export const saveTransaction = async (txn: Transaction): Promise<void> => {
  // 1. Save the transaction
  const { error } = await supabase.from('transactions').upsert(txn, { onConflict: 'id' });
  if (error) throw new Error('Failed to save transaction: ' + error.message);

  // 2. Update balances
  const accounts = await getAccounts();
  
  const updateBalance = async (id: string, delta: number) => {
    const acc = accounts.find(a => a.id === id);
    if (acc) {
      acc.balance = (acc.balance || 0) + delta;
      await saveAccount(acc);
    }
  };

  await updateBalance(txn.bank_account_id, -txn.amount);
  await updateBalance(txn.category_account_id, txn.amount);
};

// --- NEW: TRANSACTION VIEW SETTINGS ---

export interface TransactionViewSettings {
  visibleAccountIds: string[];
}

export const getTransactionViewSettings = async (): Promise<TransactionViewSettings> => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'transaction-view')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value as TransactionViewSettings) || { visibleAccountIds: [] };
  } catch (error) {
    console.error('Failed to fetch transaction view settings:', error);
    return { visibleAccountIds: [] };
  }
};

export const saveTransactionViewSettings = async (settings: TransactionViewSettings): Promise<void> => {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'transaction-view', value: settings, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error('Failed to save settings: ' + error.message);
};
