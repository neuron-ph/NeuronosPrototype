import { useState, useEffect, useMemo } from "react";
import { Search, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { PhilippinePeso } from "../icons/PhilippinePeso";
import type { Expense } from "../../types/accounting";
import { supabase } from "../../utils/supabase/client";
import { useNavigate } from "react-router";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";

type QuickFilterTab = "all" | "this-month" | "last-month" | "this-quarter" | "recorded" | "pending-audit";
type SortOption = "date-newest" | "date-oldest" | "amount-high" | "amount-low" | "category";
type DateRangeFilter = "all" | "today" | "this-week" | "this-month" | "this-quarter" | "last-30-days";

export function ExpensesPage() {
  // State for panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  
  // State for data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [quickFilterTab, setQuickFilterTab] = useState<QuickFilterTab>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("date-newest");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  
  // Mock data for current user
  const currentUserName = "Maria Santos";

  // Fetch expenses from API
  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchErr } = await supabase.from('expenses').select('*');
      
      if (fetchErr) throw new Error(fetchErr.message);
      
      console.log('Fetched expenses:', (data || []).length);
      setExpenses(data || []);
    } catch (err) {
      console.error('Error fetching expenses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async (expenseData: any) => {
    try {
      const mappedData = {
        id: `exp-${Date.now()}`,
        description: expenseData.requestName,
        purpose: expenseData.requestName,
        voucher_number: expenseData.evrnNumber,
        expense_category: expenseData.expenseCategory,
        sub_category: expenseData.subCategory,
        project_number: expenseData.projectNumber,
        line_items: expenseData.lineItems,
        amount: expenseData.totalAmount,
        payment_method: expenseData.preferredPayment,
        vendor_name: expenseData.vendor,
        credit_terms: expenseData.creditTerms,
        due_date: expenseData.paymentSchedule,
        notes: expenseData.notes,
        request_date: expenseData.date,
        requestor_name: expenseData.requestor,
        status: expenseData.status || "Submitted",
        created_at: new Date().toISOString(),
      };

      const { error: insertErr } = await supabase.from('expenses').insert(mappedData);
      if (insertErr) throw new Error(insertErr.message);
      
      await fetchExpenses();
      setShowAddPanel(false);
    } catch (err) {
      console.error('Error creating expense:', err);
      alert(err instanceof Error ? err.message : 'Failed to create expense');
    }
  };

  const handleSaveDraft = async (draftData: any) => {
    try {
      const mappedData = {
        id: `exp-${Date.now()}`,
        description: draftData.requestName,
        purpose: draftData.requestName,
        voucher_number: draftData.evrnNumber,
        expense_category: draftData.expenseCategory,
        sub_category: draftData.subCategory,
        project_number: draftData.projectNumber,
        line_items: draftData.lineItems,
        amount: draftData.totalAmount,
        payment_method: draftData.preferredPayment,
        vendor_name: draftData.vendor,
        credit_terms: draftData.creditTerms,
        due_date: draftData.paymentSchedule,
        notes: draftData.notes,
        request_date: draftData.date,
        requestor_name: draftData.requestor,
        status: 'Draft',
        created_at: new Date().toISOString(),
      };

      const { error: insertErr } = await supabase.from('expenses').insert(mappedData);
      if (insertErr) throw new Error(insertErr.message);
      
      await fetchExpenses();
      setShowAddPanel(false);
    } catch (err) {
      console.error('Error saving draft:', err);
      alert(err instanceof Error ? err.message : 'Failed to save draft');
    }
  };

  // Filter and sort logic
  const filteredAndSortedExpenses = useMemo(() => {
    let filtered = expenses.filter(expense => {
      // Search filter
      const matchesSearch = searchQuery === "" || 
        expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.voucher_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expense.project_number && expense.project_number.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const matchesStatus = statusFilter === "All" || expense.status === statusFilter;

      // Category filter
      const matchesCategory = categoryFilter === "All" || expense.expense_category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });

    // Sort
    filtered.sort((a, b) => {
      return new Date(b.request_date || b.created_at).getTime() - new Date(a.request_date || a.created_at).getTime();
    });

    return filtered;
  }, [expenses, searchQuery, statusFilter, categoryFilter]);

  // Group by category
  const groupedExpenses = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    filteredAndSortedExpenses.forEach(expense => {
      const category = expense.expense_category || "Uncategorized";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(expense);
    });
    return Array.from(groups.entries());
  }, [filteredAndSortedExpenses]);

  // Calculate totals
  const totals = useMemo(() => {
    const thisMonth = filteredAndSortedExpenses.filter(e => {
      const date = new Date(e.request_date || e.created_at);
      const today = new Date();
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    });
    
    return {
      total: filteredAndSortedExpenses.reduce((sum, e) => sum + e.amount, 0),
      thisMonth: thisMonth.reduce((sum, e) => sum + e.amount, 0),
      count: filteredAndSortedExpenses.length,
    };
  }, [filteredAndSortedExpenses]);

  const toggleGroup = (category: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedGroups(newCollapsed);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Recorded":
        return { bg: "#E8F5F3", color: "#0F766E" };
      case "Audited":
        return { bg: "#D1FAE5", color: "#059669" };
      case "Disbursed":
        return { bg: "#DBEAFE", color: "#1D4ED8" };
      case "Draft":
        return { bg: "#F3F4F6", color: "#6B7280" };
      default:
        return { bg: "#FEF3E7", color: "#C88A2B" };
    }
  };

  return (
    <div 
      className="h-full flex flex-col"
      style={{
        background: "#FFFFFF",
      }}
    >
      {/* Header Section */}
      <div style={{ padding: "32px 48px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#12332B", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Expenses
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Manage and track all company expenses and disbursements
            </p>
          </div>
          <button
            className="neuron-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
            }}
            onClick={() => setShowAddPanel(true)}
          >
            <Plus size={20} />
            Log Expense
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
          <div style={{ 
            padding: "16px 20px", 
            border: "1px solid var(--neuron-ui-border)", 
            borderRadius: "8px",
            background: "#FFFFFF"
          }}>
            <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Total Expenses</p>
            <p style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
              {formatCurrency(totals.total)}
            </p>
          </div>
          <div style={{ 
            padding: "16px 20px", 
            border: "1px solid var(--neuron-ui-border)", 
            borderRadius: "8px",
            background: "#FFFFFF"
          }}>
            <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>This Month</p>
            <p style={{ fontSize: "24px", fontWeight: 600, color: "#0F766E" }}>
              {formatCurrency(totals.thisMonth)}
            </p>
          </div>
          <div style={{ 
            padding: "16px 20px", 
            border: "1px solid var(--neuron-ui-border)", 
            borderRadius: "8px",
            background: "#FFFFFF"
          }}>
            <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Total Entries</p>
            <p style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
              {totals.count}
            </p>
          </div>
        </div>

        {/* Quick Filter Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {[
            { id: "all" as QuickFilterTab, label: "All Expenses" },
            { id: "this-month" as QuickFilterTab, label: "This Month" },
            { id: "last-month" as QuickFilterTab, label: "Last Month" },
            { id: "this-quarter" as QuickFilterTab, label: "This Quarter" },
            { id: "recorded" as QuickFilterTab, label: "Recorded" },
            { id: "pending-audit" as QuickFilterTab, label: "Pending Audit" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setQuickFilterTab(tab.id)}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: quickFilterTab === tab.id ? "1px solid #0F766E" : "1px solid var(--neuron-ui-border)",
                background: quickFilterTab === tab.id ? "#E8F5F3" : "#FFFFFF",
                color: quickFilterTab === tab.id ? "#0F766E" : "#667085",
                fontSize: "14px",
                fontWeight: quickFilterTab === tab.id ? 500 : 400,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Filters */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Search */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#667085",
              }}
            />
            <input
              type="text"
              placeholder="Search expenses, vendors, projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Expenses List */}
      <div className="flex-1 overflow-auto" style={{ padding: "24px 48px" }}>
        {loading ? (
          <div className="text-center py-12">
            <p style={{ fontSize: "16px", color: "#667085" }}>Loading expenses...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p style={{ fontSize: "16px", color: "#EF4444", marginBottom: "8px" }}>Error loading expenses</p>
            <p style={{ fontSize: "14px", color: "#667085" }}>{error}</p>
            <button
              onClick={fetchExpenses}
              style={{
                marginTop: "16px",
                padding: "8px 16px",
                background: "#0F766E",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredAndSortedExpenses.length === 0 ? (
          <div className="text-center py-12">
            <PhilippinePeso size={48} style={{ color: "#667085", margin: "0 auto 16px" }} />
            <p style={{ fontSize: "16px", color: "#667085", marginBottom: "8px" }}>
              No expenses found
            </p>
            <p style={{ fontSize: "14px", color: "#98A2B3" }}>
              {searchQuery
                ? "Try adjusting your search query" 
                : "Log your first expense to get started"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {groupedExpenses.map(([category, categoryExpenses]) => {
              const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);
              const isCollapsed = collapsedGroups.has(category);

              return (
                <div key={category}>
                  {/* Category Header */}
                  <div
                    onClick={() => toggleGroup(category)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "#F9FAFB",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      marginBottom: isCollapsed ? "0" : "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {isCollapsed ? <ChevronRight size={20} color="#667085" /> : <ChevronDown size={20} color="#667085" />}
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B" }}>
                        {category}
                      </h3>
                      <span style={{ fontSize: "14px", color: "#667085" }}>
                        ({categoryExpenses.length})
                      </span>
                    </div>
                    <p style={{ fontSize: "16px", fontWeight: 600, color: "#0F766E" }}>
                      {formatCurrency(categoryTotal)}
                    </p>
                  </div>

                  {/* Expense Cards */}
                  {!isCollapsed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {categoryExpenses.map((expense) => {
                        const statusStyle = getStatusColor(expense.status);
                        return (
                          <div
                            key={expense.id}
                            onClick={() => {
                              setSelectedExpense(expense);
                              setShowDetailPanel(true);
                            }}
                            style={{
                              padding: "16px 20px",
                              border: "1px solid var(--neuron-ui-border)",
                              borderRadius: "8px",
                              background: "#FFFFFF",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "#0F766E";
                              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                                  <h4 style={{ fontSize: "15px", fontWeight: 600, color: "#12332B" }}>
                                    {expense.description || expense.purpose}
                                  </h4>
                                  <span
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: 500,
                                      background: statusStyle.bg,
                                      color: statusStyle.color,
                                    }}
                                  >
                                    {expense.status}
                                  </span>
                                </div>
                                <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#667085" }}>
                                  <span>{expense.voucher_number}</span>
                                  <span>•</span>
                                  <span>{formatDate(expense.request_date || expense.created_at)}</span>
                                  <span>•</span>
                                  <span>{expense.vendor_name}</span>
                                  {expense.created_from_evoucher_id && (
                                    <>
                                      <span>•</span>
                                      <span style={{ 
                                        color: "#0F766E", 
                                        fontWeight: 500,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px"
                                      }}>
                                        📋 E-Voucher: {expense.created_from_evoucher_id}
                                      </span>
                                    </>
                                  )}
                                  {expense.project_number && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: "#0F766E", fontWeight: 500 }}>{expense.project_number}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: "18px", fontWeight: 600, color: "#12332B" }}>
                                  {formatCurrency(expense.amount)}
                                </p>
                                {expense.sub_category && (
                                  <p style={{ fontSize: "12px", color: "#667085", marginTop: "4px" }}>
                                    {expense.sub_category}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Expense Panel */}
      <AddRequestForPaymentPanel
        isOpen={showAddPanel}
        onClose={() => setShowAddPanel(false)}
        context="accounting"
        defaultRequestor={currentUserName}
        onSave={handleCreateExpense}
        onSaveDraft={handleSaveDraft}
      />

      {/* Expense Detail Panel - Reuse same component in view mode */}
      {selectedExpense && showDetailPanel && (
        <AddRequestForPaymentPanel
          isOpen={showDetailPanel}
          onClose={() => {
            setShowDetailPanel(false);
            setSelectedExpense(null);
          }}
          context="accounting"
          mode="view"
          existingData={selectedExpense}
        />
      )}
    </div>
  );
}