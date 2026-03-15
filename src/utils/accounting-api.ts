import { apiFetch } from './api';
import { Account, AccountType } from '../types/accounting-core';
import { Transaction } from '../types/accounting'; // Keep Transaction from old types for now if not present in core

console.log("Loading accounting-api.ts (Client Side - Robust)");

/**
 * Fetches all accounts from the Server.
 */
export const getAccounts = async (): Promise<Account[]> => {
  try {
    const response = await apiFetch('/accounts');
    if (!response.ok) throw new Error('Failed to fetch accounts');
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    
    // Sort logic: Code then Name
    return (result.data || []).sort((a: Account, b: Account) => {
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
  const response = await apiFetch('/accounts', {
    method: 'POST',
    body: JSON.stringify(account)
  });
  if (!response.ok) throw new Error('Failed to save account');
};

/**
 * Deletes an account.
 */
export const deleteAccount = async (id: string): Promise<void> => {
  const response = await apiFetch(`/accounts/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete account');
};

/**
 * Fetches all transactions.
 */
export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    const response = await apiFetch('/transactions');
    if (!response.ok) throw new Error('Failed to fetch transactions');
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    
    return (result.data || []).sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return [];
  }
};

/**
 * Saves a transaction and updates the account balance.
 * NOTE: The logic for updating balances is now client-side driven but persists to server.
 */
export const saveTransaction = async (txn: Transaction): Promise<void> => {
  // 1. Save the transaction
  const response = await apiFetch('/transactions', {
    method: 'POST',
    body: JSON.stringify(txn)
  });
  if (!response.ok) throw new Error('Failed to save transaction');

  // 2. Update balances
  const accounts = await getAccounts();
  
  const updateBalance = async (id: string, delta: number) => {
    const acc = accounts.find(a => a.id === id);
    if (acc) {
      acc.balance = (acc.balance || 0) + delta;
      await saveAccount(acc);
    }
  };

  // Source (bank_account_id) is Credited. So Balance -= Amount.
  // (Assuming typical asset account behavior)
  await updateBalance(txn.bank_account_id, -txn.amount);
  
  // Destination (category_account_id) is Debited. So Balance += Amount.
  // (Assuming typical expense/asset account behavior)
  await updateBalance(txn.category_account_id, txn.amount);
};

// --- NEW: TRANSACTION VIEW SETTINGS ---

export interface TransactionViewSettings {
  visibleAccountIds: string[];
}

export const getTransactionViewSettings = async (): Promise<TransactionViewSettings> => {
  try {
    const response = await apiFetch('/settings/transaction-view');
    if (!response.ok) throw new Error('Failed to fetch settings');
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.data;
  } catch (error) {
    console.error('Failed to fetch transaction view settings:', error);
    return { visibleAccountIds: [] };
  }
};

export const saveTransactionViewSettings = async (settings: TransactionViewSettings): Promise<void> => {
  const response = await apiFetch('/settings/transaction-view', {
    method: 'POST',
    body: JSON.stringify(settings)
  });
  if (!response.ok) throw new Error('Failed to save settings');
};


// --- DATA MIGRATION LOGIC ---

// Configuration Node for the Chart of Accounts Hierarchy
interface COAConfigNode {
  name: string;
  code?: string;
  type?: AccountType; // Optional: Override or set for root
  subtype?: string; // Optional
  is_folder?: boolean; // Explicit override
  currency?: "PHP" | "USD"; // Explicit currency override
  children?: COAConfigNode[];
}

// THE NEW STRUCTURE
const COA_STRUCTURE: COAConfigNode[] = [
  // 1. ASSETS
  {
    name: "CURRENT ASSET",
    type: "Asset",
    is_folder: true,
    children: [
      {
        name: "CASH AND CASH EQUIVALENTS",
        is_folder: true,
        children: [
          { name: "CASH ON HAND (PHP)", code: "100", currency: "PHP" },
          { name: "CASH ON HAND (USD)", code: "101", currency: "USD" },
          { 
            name: "CASH IN BANK (PHP)", 
            code: "102",
            is_folder: true,
            currency: "PHP",
            children: [
              { name: "CASH IN BANK - BPI (000-130008623)", code: "102-001" },
              { name: "CASH IN BANK - BPI (000-133379983)", code: "102-002" },
              { name: "CASH IN BANK - BDO (008-290102440)", code: "102-003" },
              { name: "CASH IN BANK - BDO (008-290110893)", code: "102-004" },
              { name: "CASH IN BANK - BDO (005-128014653)", code: "102-005" },
              { name: "CASH IN BANK - BOC (006-000052394)", code: "102-006" },
              { name: "CASH IN BANK - SB (000-0072502366)", code: "102-007" },
              { name: "CASH IN BANK - RCBC (000-7591404794)", code: "102-008" },
              { name: "CASH IN BANK - EB (200-022102183)", code: "102-009" },
              { name: "CASH IN BANK - AUB (100-10009371)", code: "102-010" },
              { name: "CASH IN BANK - UB (001-930011572)", code: "102-011" },
              { name: "CASH IN BANK - PBCOM (022-3101006483)", code: "102-012" },
            ]
          },
          {
            name: "CASH IN BANK (USD)",
            code: "103",
            is_folder: true,
            currency: "USD",
            children: [
              { name: "CASH IN BANK - BOC (006-210005062)", code: "103-001" },
              { name: "CASH IN BANK - AUB (101-90046563)", code: "103-002" },
            ]
          },
          {
            name: "E-WALLETS",
            code: "104",
            is_folder: true,
            children: [
              { name: "G-CASH", code: "104-001" },
              { name: "WCA partner pay", code: "104-002" },
            ]
          }
        ]
      },
      {
        name: "ACCOUNTS RECEIVABLE",
        code: "105",
        is_folder: true,
        children: [
          { name: "ACCOUNTS RECEIVABLE", code: "105" },
          { name: "ACCOUNTS RECEIVABLE (USD)", code: "106", currency: "USD" },
          { name: "ALLOWANCE FOR DOUBTFUL ACCOUNTS", code: "107" },
        ]
      },
      {
        name: "EMPLOYEE CASH ADVANCES",
        code: "108",
        is_folder: true,
        children: [
          { name: "CA OF (NAME) 1", code: "108-001" },
          { name: "CA OF (NAME) 2", code: "108-002" },
          { name: "CA OF (NAME) 3", code: "108-003" },
          { name: "CA OF (NAME) 4", code: "108-004" },
          { name: "CA OF (NAME) 5", code: "108-005" },
        ]
      },
      {
        name: "PREPAID EXPENSES",
        code: "109",
        is_folder: true,
        children: [
          { name: "ICTSI FUND", code: "109-001" },
          { name: "SIMPLY BOOK RELOAD", code: "109-002" },
          { name: "TABS TOP UP", code: "109-003" },
          { name: "RENT ADVANCE DEPOSIT", code: "109-004" },
        ]
      },
      {
        name: "LOAN TO OTHERS",
        code: "110",
        is_folder: true,
        children: [
           { name: "LOAN TO (NAME) 1", code: "110-001" },
           { name: "LOAN TO (NAME) 2", code: "110-002" },
           { name: "LOAN TO (NAME) 3", code: "110-003" },
        ]
      },
      {
        name: "OTHER CURRENT ASSET",
        is_folder: true,
        children: [
          { name: "CONTAINER SECURITY DEPOSIT", code: "111" },
          { name: "OFFICE SUPPLIES", code: "112" },
          { name: "UNDEPOSITED FUNDS", code: "113" },
          { name: "UNCATEGORIZED ASSET", code: "114" },
        ]
      }
    ]
  },
  {
    name: "NON-CURRENT ASSET",
    type: "Asset",
    is_folder: true,
    children: [
      {
        name: "SECURITY DEPOSIT",
        is_folder: true,
        children: [
           { name: "WAREHOUSE SECURITY DEPOSIT", code: "115" },
           { name: "RENT SECURITY DEPOSIT", code: "116" },
        ]
      },
      {
        name: "LOAN TO OTHERS",
        code: "117",
        is_folder: true,
        children: [
           { name: "LOAN TO OTHERS (NAME)", code: "117-001" } 
        ]
      }
    ]
  },
  {
    name: "FIXED ASSETS",
    type: "Asset",
    is_folder: true,
    children: [
      {
         name: "PROPERTY PLANT & EQUIPMENT",
         is_folder: true,
         children: [
            {
               name: "FURNITURE & FIXTURES",
               is_folder: true,
               children: [
                  { name: "FURNITURE & FIXTURE 1" },
                  { name: "FURNITURE & FIXTURE 2" }
               ]
            },
            { name: "ACCUMULATED DEPRECIATION - FURNITURE AND FIXTURE" },
            {
               name: "OFFICE EQUIPMENT",
               is_folder: true,
               children: [
                  { name: "OFFICE EQUIPMENT 1" },
                  { name: "OFFICE EQUIPMENT 2" }
               ]
            },
            { name: "ACCUMULATED DEPRECIATION - OFFICE EQUIPMENT" }
         ]
      },
      {
         name: "VEHICLE",
         is_folder: true,
         children: [
            {
               name: "VEHICLES",
               is_folder: true,
               children: [
                  { name: "TRUCK 1" },
                  { name: "TRUCK 2" }
               ]
            },
            { name: "ACCUMULATED DEPRECIATION - VEHICLES" }
         ]
      }
    ]
  },
  // 2. LIABILITIES
  {
     name: "CURRENT LIABILITIES",
     type: "Liability",
     is_folder: true,
     children: [
        {
           name: "ACCOUNTS PAYABLE",
           is_folder: true,
           children: [
              { name: "ACCOUNTS PAYABLE (PHP)" },
              { name: "ACCOUNTS PAYABLE (USD)", currency: "USD" },
              { name: "MAXICARE PAYABLE" }
           ]
        },
        {
           name: "CREDIT CARD",
           is_folder: true,
           children: [
              { name: "CREDIT CARD 1" },
              { name: "CREDIT CARD 2" }
           ]
        },
        {
           name: "ACCRUED LIABILITIES",
           is_folder: true,
           children: [
              { name: "EMPLOYEE PAG IBIG CONTRIBUTION" },
              { name: "EMPLOYEE PHILHEALTH CONTRIBUTION" },
              { name: "EMPLOYEE SSS CONTRIBUTION" }
           ]
        }
     ]
  },
  {
     name: "NON-CURRENT LIABILITIES",
     type: "Liability",
     is_folder: true,
     children: [
        {
           name: "NOTES PAYABLE",
           is_folder: true,
           children: [
              { name: "NOTES PAYABLE" } 
           ]
        },
        {
           name: "LOAN PAYABLE",
           is_folder: true,
           children: [
              {
                 name: "LOAN TO BANKS",
                 is_folder: true,
                 children: [
                    { name: "BANK 1" },
                    { name: "BANK 2" }
                 ]
              }
           ]
        }
     ]
  },
  // 3. EQUITY
  {
     name: "OWNER'S EQUITY",
     type: "Equity",
     is_folder: true,
     children: [
        { name: "OPENING BALANCE EQUITY" },
        { name: "RETAINED EARNINGS" },
        { name: "SHAREHOLDERS DIVIDEND" }
     ]
  },
  // 4. INCOME
  {
    name: "INCOME",
    type: "Income",
    is_folder: true,
    children: [
      {
        name: "REVENUE",
        is_folder: true,
        children: [
          {
            name: "BROKERAGE INCOME",
            is_folder: true,
            children: [
              { name: "Brokerage Service 1" },
              { name: "Brokerage Service 2" },
              { name: "Brokerage Service 3" },
            ]
          },
          { name: "DISCOUNTS - BROKERAGE" },
          {
            name: "FORWARDING INCOME",
            is_folder: true,
            children: [
              { name: "Forwarding Service 1" },
              { name: "Forwarding Service 2" },
              { name: "Forwarding Service 3" },
            ]
          },
          { name: "DISCOUNTS - FORWARDING" },
          {
            name: "TRUCKING INCOME",
            is_folder: true,
            children: [
              { name: "Trucking Service 1" },
              { name: "Trucking Service 2" },
              { name: "Trucking Service 3" },
            ]
          },
          { name: "DISCOUNTS - TRUCKING" },
          {
            name: "MISCELLANEOUS INCOME",
            is_folder: true,
            children: [
              { name: "Miscellaneous Service 1" },
              { name: "Miscellaneous Service 2" },
            ]
          },
          {
            name: "OTHER INCOME",
            is_folder: true,
            children: [
              { name: "Other Income 1" },
              { name: "Other Income 2" },
              { name: "Other Income 3" },
            ]
          },
          { name: "UNCATEGORIZED INCOME" }
        ]
      }
    ]
  },
  // 5. COST OF SERVICE
  {
    name: "COST OF SERVICE",
    type: "Expense",
    subtype: "Cost of Service",
    is_folder: true,
    children: [
      {
        name: "BROKERAGE EXPENSES",
        is_folder: true,
        children: [
          { name: "Brokerage Expense 1" },
          { name: "Brokerage Expense 2" },
          { name: "Brokerage Expense 3" },
        ]
      },
      {
        name: "FORWARDING EXPENSES",
        is_folder: true,
        children: [
          { name: "Forwarding Expense 1" },
          { name: "Forwarding Expense 2" },
          { name: "Forwarding Expense 3" },
        ]
      },
      {
        name: "TRUCKING EXPENSES",
        is_folder: true,
        children: [
          { name: "Trucking Expense 1" },
          { name: "Trucking Expense 2" },
          { name: "Trucking Expense 3" },
        ]
      },
      {
        name: "MISCELLANEOUS EXPENSES",
        is_folder: true,
        children: [
          { name: "Miscellaneous Expense 1" },
          { name: "Miscellaneous Expense 2" },
        ]
      }
    ]
  },
  // 6. EXPENSES
  {
    name: "EXPENSES",
    type: "Expense",
    subtype: "Operating",
    is_folder: true,
    children: [
      {
        name: "OPERATING EXPENSES",
        is_folder: true,
        children: [
          { name: "SALES COMMISSION" },
          {
            name: "ADVERTISING / MARKETING",
            is_folder: true,
            children: [
              { name: "Sponsorship" },
              { name: "Business Profile" },
              { name: "Marketing Kits" },
              { name: "Business Card" },
              { name: "Others" },
            ]
          },
          {
            name: "TRAVELS AND ENTERTAINMENT",
            is_folder: true,
            children: [
              { name: "Airfare" },
              { name: "Land Fare" },
              { name: "Accommodation" },
              { name: "Foods" },
              { name: "Gifts/Token" },
              { name: "Others" },
            ]
          },
          {
            name: "TRAINING AND DEVELOPMENT",
            is_folder: true,
            children: [
              { name: "Professional Fee" },
              { name: "Venue" },
              { name: "Foods" },
              { name: "Others" },
            ]
          },
          {
            name: "TALENT ACQUISITION & RECRUITMENT",
            is_folder: true,
            children: [
              { name: "Job Adds" },
              { name: "Others" },
            ]
          },
          {
            name: "EMPLOYEE ENGAGEMENT & RELATIONS",
            is_folder: true,
            children: [
              { name: "Bonuses" },
              { name: "Incentives/Rewards" },
              { name: "Plaques / Medals / Certificate" },
              { name: "Others" },
            ]
          },
          {
            name: "HEALTH & SAFETY",
            is_folder: true,
            children: [
              { name: "Medicines" },
              { name: "Equipment/s" },
              { name: "Others" },
            ]
          },
          {
            name: "CORPORATE SOCIAL RESPONSIBILITY",
            is_folder: true,
            children: [
              { name: "Cash / Goods Donation" },
              { name: "Foods" },
              { name: "Others" },
            ]
          },
          {
            name: "TRADE SHOW AND CONFERENCE",
            is_folder: true,
            children: [
              { name: "Registration" },
              { name: "Accommodation" },
              { name: "Others" },
            ]
          },
          {
            name: "TRUCKING MAINTENANCE AND REPAIRS",
            is_folder: true,
            children: [
              { name: "PMS" },
              { name: "Parts and Equipment" },
              { name: "Vulcanizing" },
              { name: "Minor Repairs" },
              { name: "Others" },
            ]
          },
          { name: "MEMBERSHIP FEES" },
          {
            name: "OFFICE MAINTENANCE",
            is_folder: true,
            children: [
              { name: "Cleaning Materials & Supplies" },
              { name: "Repairs" },
              { name: "Others" },
            ]
          },
          { name: "OTHER VARIABLE EXPENSES" },
          {
            name: "COMPENSATION & BENEFITS",
            is_folder: true,
            children: [
              { name: "Salaries and Wages" },
              { name: "SSS/Pag-IBIG/PhilHealth" },
              { name: "HMO" },
              { name: "Others" },
            ]
          },
          {
            name: "RENT / LEASE",
            is_folder: true,
            children: [
              { name: "Office Rental" },
              { name: "Garage Rental" },
              { name: "Others" },
            ]
          },
          {
            name: "UTILITIES",
            is_folder: true,
            children: [
              { name: "Internet" },
              { name: "Electricity" },
              { name: "Water" },
              { name: "Parking" },
              { name: "Others" },
            ]
          },
          {
            name: "INSURANCE",
            is_folder: true,
            children: [
              { name: "Fire Insurance" },
              { name: "Marine Insurance" },
              { name: "Vehicle Insurance" },
              { name: "Others" },
            ]
          },
          { name: "OFFICE SUPPLIES EXPENSE" },
          {
            name: "PROFESSIONAL FEES",
            is_folder: true,
            children: [
              { name: "Accountant Fee" },
              { name: "Legal Fee" },
              { name: "Others" },
            ]
          },
          {
            name: "SOFTWARE / TECHNOLOGY SUBSCRIPTION",
            is_folder: true,
            children: [
              { name: "QuickBooks" },
              { name: "Google Workspace" },
              { name: "Server Domain" },
              { name: "Others" },
            ]
          },
          {
            name: "PERMITS & LICENSES",
            is_folder: true,
            children: [
              { name: "Business Permit" },
              { name: "Sanitary Permit" },
              { name: "Fire Certification" },
              { name: "Others" },
            ]
          },
          {
            name: "OFFICE IMPROVEMENTS / RENOVATION",
            is_folder: true,
            children: [
              { name: "Construction Materials" },
              { name: "Labor Fees" },
              { name: "Appliances / Machines" },
              { name: "Others" },
            ]
          },
          { name: "OTHER FIXED EXPENSES" },
          {
            name: "TAXES PAID",
            is_folder: true,
            children: [
              { name: "Income Tax" },
              { name: "Value Added Tax" },
              { name: "Withholding Tax - Expanded" },
            ]
          },
          {
            name: "EMPLOYEES ALLOWANCES",
            is_folder: true,
            children: [
              { name: "Gas" },
              { name: "Load" },
              { name: "Meal" },
              { name: "Parking" },
              { name: "Sales" },
            ]
          },
          {
            name: "INTEREST EXPENSE",
            is_folder: true,
            children: [
              { name: "Credit Card Interest" },
              { name: "Credit Line Interest" },
              { name: "Loan Interest" },
              { name: "Notes Payable Interest" },
            ]
          },
        ]
      }
    ]
  },
  // 7. OTHER EXPENSES
  {
    name: "OTHER EXPENSES",
    type: "Expense",
    subtype: "Other",
    is_folder: true,
    children: [
      {
        name: "DEPRECIATION EXPENSE",
        is_folder: true,
        children: [
          { name: "Furniture and Fixtures" },
          { name: "Equipment/s" },
          { name: "Vehicle" },
        ]
      },
      { name: "UNCATEGORIZED EXPENSE" }
    ]
  }
];

// Helper: Determine currency from name or inheritance
const getCurrency = (name: string, inherited: "PHP" | "USD"): "PHP" | "USD" => {
  if (name.includes("(USD)")) return "USD";
  if (name.includes("(PHP)")) return "PHP";
  return inherited;
};

// Helper: Generate Account Objects recursively
const generateAccountsFromConfig = (
   nodes: COAConfigNode[], 
   parentId: string | null = null, 
   depth: number = 0,
   inheritedType: AccountType = "Asset",
   inheritedSubtype: string = "",
   inheritedCurrency: "PHP" | "USD" = "PHP"
): Account[] => {
   let accounts: Account[] = [];

   nodes.forEach((node, index) => {
      const type = node.type || inheritedType;
      // Subtype logic: If depth 1 (SubGroup), use its name as subtype for children
      const subtype = depth === 1 ? node.name : inheritedSubtype;
      
      const id = node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + `-${Math.random().toString(36).substr(2, 5)}`;
      const isFolder = node.is_folder || (node.children && node.children.length > 0) || false;
      
      // Resolve currency: Explicit > Name Check > Inherited
      let currency = inheritedCurrency;
      if (node.currency) {
          currency = node.currency;
      } else {
          currency = getCurrency(node.name, inheritedCurrency);
      }

      const account: Account = {
         id,
         code: node.code || "",
         name: node.name,
         type,
         subtype,
         currency,
         is_folder: isFolder,
         depth,
         parent_id: parentId,
         balance: 0,
         is_system: false,
         is_active: true,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString()
      };

      accounts.push(account);

      if (node.children) {
         const childrenAccounts = generateAccountsFromConfig(
            node.children,
            id,
            depth + 1,
            type,
            subtype,
            currency // PASS DOWN
         );
         accounts = [...accounts, ...childrenAccounts];
      }
   });

   return accounts;
};

/**
 * Initial Seed Data for the Chart of Accounts.
 * Call this if no accounts exist.
 */
export const seedInitialAccounts = async () => {
  const existing = await getAccounts();
  if (existing.length > 0) return; // Don't overwrite

  const accounts = generateAccountsFromConfig(COA_STRUCTURE);
  
  console.log(`Seeding ${accounts.length} accounts based on configuration...`);
  
  // Use sequential saving to avoid overwhelming the server/kv_store if needed, 
  // or parallel if robust. Since KV is simple, we'll do batches or sequential.
  // Sequential for safety.
  for (const acc of accounts) {
    await saveAccount(acc);
  }
  
  console.log('Seeded initial accounts successfully.');
};

/**
 * UTILITY: Reset and Re-Seed Chart of Accounts
 * WARNING: Deletes all existing accounts!
 * Usage: Call manually from console or via button.
 */
export const resetChartOfAccounts = async () => {
   console.warn("Resetting Chart of Accounts... this will delete all existing accounts.");
   
   const existing = await getAccounts();
   
   // Delete all existing
   await Promise.all(existing.map(acc => deleteAccount(acc.id)));
   
   console.log("All existing accounts deleted. Re-seeding...");
   
   // Re-seed
   await seedInitialAccounts(); // Now existing.length is 0, so it will run
   
   console.log("Chart of Accounts Reset Complete.");
};

// Expose to window for debugging if needed
if (typeof window !== 'undefined') {
   (window as any).resetNeuronCOA = resetChartOfAccounts;
}