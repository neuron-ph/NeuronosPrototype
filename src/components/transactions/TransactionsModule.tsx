import { useState, useMemo, useEffect } from "react";
import { Settings, ChevronDown, Globe, Wallet } from "lucide-react";
import { useCachedFetch, useInvalidateCache } from "../../hooks/useNeuronCache";
import { getAccounts, saveAccount, deleteAccount, getTransactions, getTransactionViewSettings, saveTransactionViewSettings } from "../../utils/accounting-api";
import type { Account, Transaction, Currency } from "../../types/accounting";
import { BankCardsCarousel, type BankAccountSummary } from "./BankCardsCarousel";
import { TransactionsTable, type UI_Transaction, type ReviewStatus } from "./TransactionsTable";
import { TransactionsControlBar } from "./TransactionsControlBar";
import { SkeletonTransactionsPage } from "./SkeletonTransactionsPage";
import { ManageAccountsModal } from "./ManageAccountsModal";
import { AddAccountForm } from "./AddAccountForm";
import { formatCurrency } from "../../utils/format";
import { SidePanel } from "../common/SidePanel";
import { toast } from "../ui/toast-utils";
import { apiFetch } from "../../utils/api";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";

export function TransactionsModule() {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isManageAccountsOpen, setIsManageAccountsOpen] = useState(false);
  
  // Settings State
  const [visibleAccountIds, setVisibleAccountIds] = useState<string[] | null>(null);

  // Filter State
  const [activeTab, setActiveTab] = useState<ReviewStatus>('for_review');
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterType, setFilterType] = useState("all");

  const invalidateCache = useInvalidateCache();

  // ── Cached Data Fetching ──────────────────────────────────
  const { data: accounts, isLoading: loadingAccounts, refresh: refreshAccounts } = useCachedFetch<Account[]>(
    "accounts",
    getAccounts,
    [],
  );

  const { data: transactions, isLoading: loadingTxns, refresh: refreshTxns, mutate: mutateTxns } = useCachedFetch<Transaction[]>(
    "transactions",
    getTransactions,
    [],
  );

  const { data: settings, isLoading: loadingSettings, refresh: refreshSettings } = useCachedFetch(
    "transaction-view-settings",
    getTransactionViewSettings,
    { visibleAccountIds: [] as string[] },
  );

  const isLoading = loadingAccounts || loadingTxns || loadingSettings;

  // Apply settings when they load
  useEffect(() => {
    if (!loadingSettings && settings) {
      if (settings.visibleAccountIds && settings.visibleAccountIds.length > 0) {
        setVisibleAccountIds(settings.visibleAccountIds);
      } else {
        setVisibleAccountIds(null);
      }
    }
  }, [settings, loadingSettings]);

  // Note: No currency-change useEffect needed — currency filtering is client-side via useMemo

  // Save Settings
  const handleSaveVisibleAccounts = async (ids: string[]) => {
      // Phase 4: Optimistic — update carousel immediately
      const previousIds = visibleAccountIds;
      setVisibleAccountIds(ids);
      
      try {
          await saveTransactionViewSettings({ visibleAccountIds: ids });
          toast.success("Account list updated");
      } catch (e) {
          toast.error("Failed to save settings");
          // Revert on failure
          setVisibleAccountIds(previousIds);
      }
  };

  // Transform Data for Bank Cards
  const bankAccountSummaries: BankAccountSummary[] = useMemo(() => {
    // Filter logic
    const banks = accounts.filter(a => {
      // 1. Must be Asset or Liability (usually Liability for Credit Cards)
      // The original code only checked 'asset'. Let's expand to 'liability' too if they select it.
      // But for backward compatibility with 'BankCardsCarousel', let's see.
      // If visibleAccountIds is set, we strictly follow it.
      
      if (visibleAccountIds) {
          return visibleAccountIds.includes(a.id) && !a.is_folder && a.currency === currency;
      }

      // Default behavior (if no settings): Assets, non-folder, matching currency
      return a.type === 'asset' && !a.is_folder && a.currency === currency;
    });
    
    return banks.map(bank => {
      // Count "For Review" (Draft) transactions for this bank
      const count = transactions.filter(t => 
        t.bank_account_id === bank.id && 
        (t.status === 'draft' || !t.status)
      ).length;

      return {
        ...bank,
        bankBalance: bank.balance || 0, 
        neuronBalance: bank.balance || 0,
        countForReview: count
      };
    });
  }, [accounts, transactions, currency, visibleAccountIds]);

  // Auto-select logic moved here to react to bankAccountSummaries changes
  useEffect(() => {
      if (!isLoading && bankAccountSummaries.length > 0) {
          // If nothing selected, or selected not in list
          const currentInList = bankAccountSummaries.find(a => a.id === selectedBankId);
          if (!selectedBankId || !currentInList) {
              setSelectedBankId(bankAccountSummaries[0].id);
          }
      } else if (!isLoading && bankAccountSummaries.length === 0) {
          setSelectedBankId(null);
      }
  }, [bankAccountSummaries, isLoading, selectedBankId]);


  // Calculate Total Balance
  const totalBalance = useMemo(() => {
    return bankAccountSummaries.reduce((sum, account) => sum + account.bankBalance, 0);
  }, [bankAccountSummaries]);

  // Transform & Filter Transactions for Table
  const filteredTransactions = useMemo(() => {
    if (!selectedBankId) return [];

    // 1. Filter by Bank Account
    let filtered = transactions.filter(t => t.bank_account_id === selectedBankId);

    // 2. Transform to UI Model
    let uiTransactions: UI_Transaction[] = filtered.map(t => {
      // Auto-extract Payee (From/To) from Description if possible
      // Logic assumes format "Type: Name" (e.g. "Invoice #123: Customer Name" or "Expense: Vendor Name")
      let extractedPayee = undefined;
      if (t.description && t.description.includes(':')) {
          const parts = t.description.split(':');
          if (parts.length > 1) {
              extractedPayee = parts[1].trim();
          }
      }

      return {
        ...t,
        review_status: (t.status === 'posted' ? 'categorized' : 'for_review') as ReviewStatus,
        type: t.amount < 0 ? 'expense' : 'deposit',
        payee: extractedPayee
      };
    });

    // 3. Filter by Tab (Status)
    uiTransactions = uiTransactions.filter(t => t.review_status === activeTab);

    // 4. Filter by Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      uiTransactions = uiTransactions.filter(t => 
        t.description.toLowerCase().includes(q) || 
        (t.amount.toString().includes(q))
      );
    }

    // 5. Filter by Date
    if (dateFrom) {
      uiTransactions = uiTransactions.filter(t => t.date >= dateFrom);
    }
    if (dateTo) {
      uiTransactions = uiTransactions.filter(t => t.date <= dateTo);
    }

    // 6. Filter by Type
    if (filterType !== 'all') {
      uiTransactions = uiTransactions.filter(t => t.type === filterType);
    }

    return uiTransactions;
  }, [transactions, selectedBankId, activeTab, searchQuery, dateFrom, dateTo, filterType]);

  // Options for Dropdowns
  const categoryOptions = useMemo(() => {
    return accounts
      .filter(a => a.id !== selectedBankId && !a.is_folder)
      .map(a => ({ value: a.id, label: a.name }));
  }, [accounts, selectedBankId]);

  const payeeOptions = [
    { value: "Vendor A", label: "Vendor A" },
    { value: "Customer B", label: "Customer B" },
    { value: "Supplier C", label: "Supplier C" }
  ];

  const handleAction = async (txn: UI_Transaction, action: 'add' | 'match' | 'exclude') => {
    if (action === 'add') {
      // 1. Validate
      if (!txn.category_account_id) {
        toast.error("Please select a category first");
        return;
      }
      if (!selectedBankId) {
        toast.error("No bank account selected");
        return;
      }

      // Phase 4: Optimistic UI — instantly move transaction to "posted"
      const originalTxns = [...transactions];
      mutateTxns(prev => prev.map(t => 
        t.id === txn.id ? { ...t, status: 'posted' as const } : t
      ));

      try {
        if (txn.source_document_id) {
          // 3. Post to Ledger via Backend
          const response = await apiFetch(`/evouchers/${txn.source_document_id}/post-to-ledger`, {
            method: 'POST',
            body: JSON.stringify({
              user_id: "user-system",
              user_name: "System User",
              user_role: "Accountant",
              debit_account_id: txn.category_account_id,
              credit_account_id: selectedBankId,
              posting_date: txn.date
            }),
          });
          
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Failed to post");
          }
          
          toast.success("Transaction posted to ledger");
          refreshTxns(); // Confirm with fresh server data
        } else {
          // Manual transaction logic would go here
          toast.info("Manual transaction posted (Mock)");
        }
      } catch (error) {
        console.error(error);
        toast.error(`Failed to post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Revert optimistic update
        mutateTxns(originalTxns);
      }
    } else {
        toast.info(`Action ${action} triggered for ${txn.description}`);
    }
  };

  const handleRenameAccount = async (accountId: string, newName: string) => {
    try {
        const account = accounts.find(a => a.id === accountId);
        if (!account) return;

        await saveAccount({ ...account, name: newName });
        toast.success("Account renamed");
        refreshAccounts(); // Only accounts changed
    } catch (e) {
        console.error(e);
        toast.error("Failed to rename account");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
        await deleteAccount(accountId);
        toast.success("Account deleted");
        
        if (selectedBankId === accountId) {
            setSelectedBankId(null);
        }
        
        refreshAccounts(); // Only accounts changed
    } catch (e) {
        console.error(e);
        toast.error("Failed to delete account");
    }
  };

  const handleAddAccount = async (newAccountData: Omit<Account, "id" | "created_at">) => {
    try {
      const newAccount: Account = {
        ...newAccountData,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString()
      };
      
      await saveAccount(newAccount);
      toast.success("Account created successfully");
      setIsAddAccountOpen(false);
      refreshAccounts(); // Only accounts changed
    } catch (error) {
      console.error("Failed to create account:", error);
      toast.error("Failed to create account");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {isLoading && (
        <SkeletonTransactionsPage />
      )}

      <SidePanel
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        title="Add Bank Account"
        width="480px"
      >
        <AddAccountForm 
            onSuccess={handleAddAccount}
            onCancel={() => setIsAddAccountOpen(false)}
        />
      </SidePanel>

      <ManageAccountsModal 
        isOpen={isManageAccountsOpen}
        onClose={() => setIsManageAccountsOpen(false)}
        accounts={accounts}
        visibleAccountIds={visibleAccountIds || []}
        onSave={handleSaveVisibleAccounts}
      />

      {/* Top Section: Header & Bank Cards */}
      {!isLoading && (
      <div className="bg-white border-b border-gray-200">
        
        {/* Page Header */}
        <div className="px-[45px] pt-[30px] pb-0">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[32px] font-semibold text-[#12332B] mb-1 tracking-tight">
                    Transactions
                    </h1>
                    <p className="text-[13px] text-[#667085]">
                    Manage bank feeds and categorized transactions
                    </p>
                </div>
                
                {/* Header Controls */}
                <div className="flex items-center gap-3">
                    {/* Refresh Button */}
                    <NeuronRefreshButton 
                      onRefresh={async () => {
                        await Promise.all([refreshAccounts(), refreshTxns(), refreshSettings()]);
                      }}
                      label="Refresh transactions"
                    />

                    {/* Manage Accounts Button */}
                    <button 
                        onClick={() => setIsManageAccountsOpen(true)}
                        className="flex items-center justify-center w-[36px] h-[36px] bg-white border border-[#E5E7EB] rounded-[7.5px] text-[#667085] hover:text-[#12332B] hover:border-[#12332B] transition-colors"
                        title="Manage Accounts"
                    >
                        <Settings size={18} />
                    </button>

                    {/* Currency Switcher Dropdown */}
                    <div className="relative group flex-shrink-0 z-20">
                        <button className="flex items-center gap-2 text-[13px] font-semibold text-[#12332B] hover:text-[#0F766E] transition-colors rounded-[7.5px] h-[36px] px-3 border border-[#E5E7EB] hover:border-[#0F766E] hover:bg-[#F0FDF9] bg-white">
                            <div className="w-[19px] h-[19px] rounded-full bg-[#0F766E]/10 flex items-center justify-center text-[#0F766E]">
                                {currency === 'USD' ? <Globe size={10} /> : <Wallet size={10} />}
                            </div>
                            <span>{currency} Transactions</span>
                            <ChevronDown size={14} className="text-[#99A1AF]" />
                        </button>
                        
                        {/* Custom Dropdown Menu */}
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right">
                            <div className="p-1">
                                <button 
                                    onClick={() => setCurrency('USD')}
                                    className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center gap-2 ${currency === 'USD' ? 'bg-[#F0FDF9] text-[#0F766E]' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                    <Globe size={14} />
                                    <span>USD Transactions</span>
                                </button>
                                <button 
                                    onClick={() => setCurrency('PHP')}
                                    className={`w-full text-left px-3 py-2 rounded-md text-xs flex items-center gap-2 ${currency === 'PHP' ? 'bg-[#F0FDF9] text-[#0F766E]' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                    <Wallet size={14} />
                                    <span>PHP Transactions</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Combined Row: Bank Cards (Left) + Total Balance (Right) */}
        <div className="px-[45px] pb-[15px] pt-[30px] flex items-center justify-between gap-6">
            
            {/* Left: Bank Cards Scrollable Area */}
            <div className="flex-1 min-w-0">
                <BankCardsCarousel 
                    accounts={bankAccountSummaries}
                    selectedAccountId={selectedBankId}
                    onSelectAccount={setSelectedBankId}
                    isLoading={isLoading}
                    onRenameAccount={handleRenameAccount}
                    onDeleteAccount={handleDeleteAccount}
                    onAddAccount={() => setIsAddAccountOpen(true)}
                />
            </div>

            {/* Right: Total Balance Card */}
            <div className="w-[180px] h-[60px] px-4 py-0 rounded-[7.5px] border border-[#E5E7EB] flex flex-col justify-center relative bg-white shrink-0">
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-[11px] tracking-[0.02em] truncate text-[#667085]">
                        Total {currency} Balance
                    </span>
                    
                    <span className="text-[17px] font-bold text-[#12332B] font-sans leading-none tracking-tight">
                        {isLoading ? "—" : formatCurrency(totalBalance, currency)}
                    </span>
                </div>
            </div>
        </div>
        
        {/* Controls */}
        <TransactionsControlBar 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
        />
      </div>
      )}

      {/* Main Table Area */}
      {!isLoading && (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1400px] mx-auto border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-white">
            <TransactionsTable 
                transactions={filteredTransactions}
                isLoading={isLoading}
                onAction={handleAction}
                categories={categoryOptions}
                payees={payeeOptions}
            />
        </div>
      </div>
      )}
    </div>
  );
}