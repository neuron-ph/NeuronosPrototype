import React, { useState, useEffect, useMemo } from "react";
import { usePermission } from "../../../context/PermissionProvider";
import { Plus, Search, Filter, Download, ChevronDown, ChevronRight, Folder, FileText, MoreHorizontal, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { getAccounts, seedInitialAccounts, resetChartOfAccounts } from "../../../utils/accounting-api";
import { Account } from "../../../types/accounting-core";
import { AccountSidePanel } from "./AccountSidePanel";
import { DataTable, ColumnDef } from "../../common/DataTable";

import { AccountLedger } from "./AccountLedger";
import { ManualJournalEntryPanel } from "./ManualJournalEntryPanel";

// Extended type for flattened tree
type FlatAccount = Account & { level: number };

const normalizeAccountType = (type?: string) => {
  const normalized = (type || "").toLowerCase();
  if (normalized === "asset") return "Asset";
  if (normalized === "liability") return "Liability";
  if (normalized === "equity") return "Equity";
  if (normalized === "income" || normalized === "revenue") return "Income";
  if (normalized === "expense" || normalized === "cost") return "Expense";
  return type || "";
};

export function ChartOfAccounts() {
  const { can } = usePermission();

  const canAllTab             = can("accounting_coa_all_tab", "view");
  const canBalanceSheetTab    = can("accounting_coa_balance_sheet_tab", "view");
  const canIncomeStatementTab = can("accounting_coa_income_statement_tab", "view");

  const defaultCOATab: "All" | "BalanceSheet" | "IncomeStatement" =
    canAllTab             ? "All" :
    canBalanceSheetTab    ? "BalanceSheet" :
    canIncomeStatementTab ? "IncomeStatement" :
    "All";

  // State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"All" | "BalanceSheet" | "IncomeStatement">(defaultCOATab);
  
  // Ledger View State
  const [viewMode, setViewMode] = useState<"list" | "ledger">("list");
  const [activeLedgerAccount, setActiveLedgerAccount] = useState<Account | null>(null);

  // Side Panel State
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showManualJE, setShowManualJE] = useState(false);

  // Expanded folders state (for hierarchy)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Fetch Accounts
  const loadAccounts = async () => {
    try {
      setLoading(true);
      
      // Seed data if empty (just once)
      await seedInitialAccounts();
      const data = await getAccounts();
      setAccounts(data);
      
      // Expand all parents by default. The DB schema uses parent_id, not is_folder.
      const allFolderIds = Array.from(
        new Set(
          data
            .map((account) => account.parent_id)
            .filter((parentId): parentId is string => Boolean(parentId))
        )
      );
      const initialExpanded: Record<string, boolean> = {};
      allFolderIds.forEach(id => initialExpanded[id] = true);
      setExpandedFolders(initialExpanded);
      
    } catch (error) {
      console.error("Error loading accounts:", error);
      toast.error("Failed to load Chart of Accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Filtering
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchesSearch = 
        acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.code && acc.code.includes(searchQuery));
      
      let matchesTab = true;
      const accountType = normalizeAccountType(acc.type);
      if (activeTab === "BalanceSheet") {
        matchesTab = ["Asset", "Liability", "Equity"].includes(accountType);
      } else if (activeTab === "IncomeStatement") {
        matchesTab = ["Income", "Expense"].includes(accountType);
      }
      
      return matchesSearch && matchesTab;
    });
  }, [accounts, searchQuery, activeTab]);

  // Build Tree Structure helpers
  const { roots, getChildren, parentIdsWithChildren } = useMemo(() => {
    const roots = filteredAccounts.filter(a => !a.parent_id); // Root nodes
    const childrenMap = new Map<string, Account[]>();
    
    filteredAccounts.forEach(acc => {
      if (acc.parent_id) {
        if (!childrenMap.has(acc.parent_id)) {
          childrenMap.set(acc.parent_id, []);
        }
        childrenMap.get(acc.parent_id)?.push(acc);
      }
    });

    return { 
      roots: roots.sort((a, b) => (a.code || "").localeCompare(b.code || "")),
      getChildren: (id: string) => (childrenMap.get(id) || []).sort((a, b) => (a.code || "").localeCompare(b.code || "")),
      parentIdsWithChildren: new Set(childrenMap.keys()),
    };
  }, [filteredAccounts]);

  // Flatten Tree for DataTable
  const flatAccounts = useMemo(() => {
    const result: FlatAccount[] = [];
    
    const traverse = (nodes: Account[], level: number) => {
      nodes.forEach(node => {
        result.push({ ...node, level });
        
        // If expanded and has children, traverse them
        if (expandedFolders[node.id]) {
          const children = getChildren(node.id);
          if (children.length > 0) {
            traverse(children, level + 1);
          }
        }
      });
    };
    
    traverse(roots, 0);
    return result;
  }, [roots, expandedFolders, getChildren]);

  // Handlers
  const handleViewRegister = (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveLedgerAccount(account);
    setViewMode("ledger");
  };

  const handleBackToCOA = () => {
    setViewMode("list");
    setActiveLedgerAccount(null);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddAccount = () => {
    setSelectedAccount(null);
    setIsPanelOpen(true);
  };

  const handleResetCOA = async () => {
    if (confirm("WARNING: This will delete ALL existing accounts and reset them to the standard Neuron Chart of Accounts. Are you sure?")) {
      try {
        setLoading(true);
        await resetChartOfAccounts();
        await loadAccounts();
        toast.success("Chart of Accounts reset successfully");
      } catch (error) {
        console.error("Reset failed:", error);
        toast.error("Failed to reset Chart of Accounts");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleEditAccount = (account: Account) => {
    setSelectedAccount(account);
    setIsPanelOpen(true);
  };

  // Helper: Currency Formatter
  const formatCurrency = (amount: number, currency: "PHP" | "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount).replace('PHP', '₱').replace('USD', '$');
  };

  // Column Definitions
  const columns: ColumnDef<FlatAccount>[] = [
    {
      header: "Account Name",
      width: "35%",
      cell: (item) => {
        const hasChildren = parentIdsWithChildren.has(item.id);

        return (
          <div 
            className="flex items-center gap-2"
            style={{ paddingLeft: `${item.level * 24}px` }}
          >
            {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(item.id);
              }}
              className="p-1 hover:bg-[var(--theme-bg-surface-tint)] rounded text-[var(--theme-text-muted)] transition-colors"
            >
              {expandedFolders[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            ) : (
            <div className="w-6" /> // Spacer
            )}
          
          <span className="font-mono text-[var(--theme-text-muted)] text-xs w-12">{item.code}</span>

            {hasChildren ? (
             <Folder size={16} className="text-[var(--theme-action-primary-bg)] fill-[var(--theme-action-primary-bg)]/10" />
            ) : (
             <FileText size={16} className="text-[var(--theme-text-muted)]" />
            )}
          
            <span className={hasChildren ? "font-semibold text-[var(--theme-text-primary)]" : "text-[var(--theme-text-secondary)]"}>
              {item.name}
            </span>
          </div>
        );
      }
    },
    {
      header: "Type",
      width: "12%",
      cell: (item) => {
        const typeColors: Record<string, { bg: string; fg: string }> = {
          Asset:     { bg: "var(--theme-status-success-bg)", fg: "var(--theme-status-success-fg)" },
          Liability: { bg: "var(--theme-status-warning-bg)", fg: "var(--theme-status-warning-fg)" },
          Equity:    { bg: "var(--neuron-status-accent-bg)", fg: "var(--neuron-status-accent-fg)" },
          Income:    { bg: "var(--theme-bg-surface-tint)",   fg: "var(--theme-action-primary-bg)" },
          Expense:   { bg: "var(--theme-status-danger-bg)",  fg: "var(--theme-status-danger-fg)"  },
        };
        const accountType = normalizeAccountType(item.type);
        const c = typeColors[accountType] ?? { bg: "var(--theme-bg-surface-subtle)", fg: "var(--theme-text-muted)" };
        return (
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 10px", borderRadius: "9999px",
            fontSize: "11px", fontWeight: 500, textTransform: "capitalize",
            backgroundColor: c.bg, color: c.fg,
          }}>
            {accountType}
          </span>
        );
      }
    },
    {
      header: "Detail Type",
      width: "20%",
      cell: (item) => (
        <span className="text-[var(--theme-text-muted)] text-[12px]">{item.subtype || "-"}</span>
      )
    },
    {
      header: "Starting Balance",
      width: "15%",
      align: "right",
      cell: (item) => {
        if (parentIdsWithChildren.has(item.id)) return <span className="text-[var(--theme-text-muted)] text-[12px]">—</span>;
        const currency = item.currency || "PHP";
        return (
          <span className="font-mono text-[var(--theme-text-muted)] text-[12px]">
            {formatCurrency(item.starting_amount ?? 0, currency)}
          </span>
        );
      }
    },
    {
      header: "Balance",
      width: "15%",
      align: "right",
      cell: (item) => {
        const currency = item.currency || "PHP";
        return (
          <span className="font-mono font-medium text-[var(--theme-text-primary)] text-[12px]">
            {formatCurrency(item.balance || 0, currency)}
          </span>
        );
      }
    },
    {
      header: "Action",
      align: "right",
      width: "150px",
      cell: (item) => (
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span 
            onClick={(e) => handleViewRegister(item, e)}
            className="text-[11px] font-medium text-[var(--theme-action-primary-bg)] hover:underline cursor-pointer"
          >
            View register
          </span>
        </div>
      )
    }
  ];

  if (viewMode === "ledger" && activeLedgerAccount) {
    return (
      <AccountLedger 
        account={activeLedgerAccount} 
        onBack={handleBackToCOA} 
      />
    );
  }

  // Calculate counts for tabs (Mock or Real)
  // For now, simple counts
  const tabCounts = {
    "All": accounts.length,
    "BalanceSheet": accounts.filter(a => ["Asset", "Liability", "Equity"].includes(normalizeAccountType(a.type))).length,
    "IncomeStatement": accounts.filter(a => ["Income", "Expense"].includes(normalizeAccountType(a.type))).length
  };

  return (
    <div className="h-full flex flex-col bg-[var(--theme-bg-surface)]">
      {/* Header Section */}
      <div style={{ 
        padding: "32px 48px 24px 48px",
        borderBottom: "1px solid var(--theme-border-default)"
      }}>
        {/* Title and Buttons */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start",
          marginBottom: "24px"
        }}>
          <div>
            <h1 style={{ 
              fontSize: "32px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              marginBottom: "4px",
              letterSpacing: "-1.2px"
            }}>
              Chart of Accounts
            </h1>
            <p style={{ 
              fontSize: "14px",
              color: "var(--theme-text-muted)",
              margin: 0
            }}>
              Manage your financial structure and ledger balances
            </p>
          </div>
          
          <div className="flex gap-3">
             <button 
                onClick={handleResetCOA}
                className="h-10 px-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-status-danger-border)] text-[var(--theme-status-danger-fg)] rounded-lg font-medium text-sm hover:bg-[var(--theme-status-danger-bg)] transition-colors flex items-center gap-2"
                title="Reset to Standard COA"
             >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">Reset</span>
             </button>
             <button className="h-10 px-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] rounded-lg font-medium text-sm hover:bg-[var(--theme-bg-surface-subtle)] transition-colors flex items-center gap-2">
                <Download size={16} />
                Export
             </button>
             <button
               onClick={() => setShowManualJE(true)}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
               style={{ backgroundColor: "var(--neuron-brand-green, #0F766E)" }}
             >
               <BookOpen size={16} />
               Create Journal Entry
             </button>
             <button
               onClick={handleAddAccount}
               style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  backgroundColor: "var(--theme-action-primary-bg)", // var(--neuron-brand-green)
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "white",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
               }}
               onMouseEnter={(e) => {
                 e.currentTarget.style.backgroundColor = "#0F544A";
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
               }}
             >
               <Plus size={18} />
               New Account
             </button>
          </div>
        </div>

        {/* Search Bar - Full Width */}
        <div style={{ position: "relative", marginBottom: "20px" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--theme-text-muted)",
            }}
          />
          <input
            type="text"
            placeholder="Filter by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 40px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              color: "var(--theme-text-primary)",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          />
        </div>

        {/* Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "24px"
        }}>
          {(["All", "BalanceSheet", "IncomeStatement"] as const).filter((tab) => {
            if (tab === "All")             return canAllTab;
            if (tab === "BalanceSheet")    return canBalanceSheetTab;
            if (tab === "IncomeStatement") return canIncomeStatementTab;
            return true;
          }).map((tab) => {
             const label = tab === "All" ? "All Accounts" : tab === "BalanceSheet" ? "Balance Sheet" : "Income Statement";
             return (
               <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 style={{
                   display: "flex",
                   alignItems: "center",
                   gap: "8px",
                   padding: "12px 4px",
                   background: "none",
                   border: "none",
                   borderBottom: activeTab === tab ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                   fontSize: "14px",
                   fontWeight: 600,
                   color: activeTab === tab ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                   cursor: "pointer",
                   transition: "all 0.2s ease",
                   marginBottom: "0"
                 }}
                 onMouseEnter={(e) => {
                   if (activeTab !== tab) {
                     e.currentTarget.style.color = "var(--theme-text-primary)";
                   }
                 }}
                 onMouseLeave={(e) => {
                   if (activeTab !== tab) {
                     e.currentTarget.style.color = "var(--theme-text-muted)";
                   }
                 }}
               >
                 {tab === "All" && <FileText size={16} />}
                 {tab === "BalanceSheet" && <Folder size={16} />}
                 {tab === "IncomeStatement" && <FileText size={16} />}
                 {label}
                 <span
                   style={{
                     display: "inline-flex",
                     alignItems: "center",
                     justifyContent: "center",
                     padding: "2px 8px",
                     borderRadius: "10px",
                     backgroundColor: activeTab === tab ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                     fontSize: "12px",
                     fontWeight: 600,
                     color: activeTab === tab ? "#0F766E" : "#667085"
                   }}
                 >
                   {tabCounts[tab]}
                 </span>
               </button>
             );
          })}
        </div>
      </div>

      {/* DataTable */}
      <div className="flex-1 overflow-auto bg-[var(--theme-bg-surface)] p-6">
        <DataTable
          data={flatAccounts}
          columns={columns}
          isLoading={loading}
          emptyMessage="No accounts found matching your filters."
          onRowClick={handleEditAccount}
          rowClassName={() => "group cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)]"}
          enableSelection={false}
          footerSummary={[
             {
                label: "Total Accounts",
                value: <span className="text-[var(--theme-text-secondary)]">{flatAccounts.length}</span>
             }
          ]}
        />
      </div>

      {/* Side Panel */}
      <AccountSidePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        onSave={loadAccounts}
        account={selectedAccount}
      />

      <ManualJournalEntryPanel
        isOpen={showManualJE}
        onClose={() => setShowManualJE(false)}
        onCreated={() => {
          setShowManualJE(false);
          // refetch balances if the panel updated the ledger
          loadAccounts();
        }}
      />
    </div>
  );
}
