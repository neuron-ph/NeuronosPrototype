import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, Calendar } from "lucide-react";
import type { Expense } from "../../types/accounting";
import { apiFetch } from "../../utils/api";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { ExpensesListTable } from "./ExpensesListTable";

export function ExpensesPageNew() {
  const navigate = useNavigate();

  // State for data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for UI
  const [showAddPanel, setShowAddPanel] = useState(false);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  
  // Get current user
  const userData = localStorage.getItem("neuron_user");
  const currentUser = userData ? JSON.parse(userData) : null;

  // Fetch expenses from API
  useEffect(() => {
    fetchExpenses();
  }, [dateRange]);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query params
      const params = new URLSearchParams();
      if (dateRange.from) params.append("date_from", dateRange.from);
      if (dateRange.to) params.append("date_to", dateRange.to);
      
      const response = await apiFetch(`/accounting/expenses?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Fetched expenses:', data);
      setExpenses(data.data || []);
    } catch (err) {
      console.error('❌ Error fetching expenses:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load expenses';
      setError(errorMessage);
      
      // If it's a network error, show a more helpful message
      if (errorMessage.includes('Failed to fetch')) {
        setError('Unable to connect to server. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort logic
  const filteredExpenses = useMemo(() => {
    let filtered = expenses;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(expense =>
        expense.description?.toLowerCase().includes(query) ||
        expense.vendor?.toLowerCase().includes(query) ||
        expense.evoucher_number?.toLowerCase().includes(query) ||
        expense.project_number?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter && categoryFilter !== "all") {
      filtered = filtered.filter(expense => expense.category === categoryFilter);
    }

    // Sort by date descending
    filtered.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return filtered;
  }, [expenses, searchQuery, categoryFilter]);

  // Get unique categories for filter dropdown
  const categories = useMemo(() => {
    const cats = new Set(expenses.map(e => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [expenses]);

  return (
    <div 
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF"
      }}
    >
      {/* Header */}
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
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "#12332B",
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}
            >
              Expenses
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Track all company expenses and disbursements
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => setShowAddPanel(true)}
              style={{
                height: "48px",
                padding: "0 24px",
                borderRadius: "16px",
                background: "#0F766E",
                border: "none",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#0D6560";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#0F766E";
              }}
            >
              <Plus size={20} />
              Log Expense
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input
              type="text"
              placeholder="Search expenses, vendors, projects, or E-Voucher numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "#FFFFFF",
                color: "var(--neuron-ink-primary)"
              }}
            />
          </div>

          {/* Category Filter */}
          <CustomDropdown
            label=""
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map(cat => ({ value: cat, label: cat }))
            ]}
          />

          {/* Date Range Filter */}
          <CustomDropdown
            label=""
            value="all"
            onChange={(value) => {
              // TODO: Implement date range filtering logic
            }}
            options={[
              { value: "all", label: "All Time", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "today", label: "Today", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#0F766E" }} /> },
              { value: "this-week", label: "This Week", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "this-month", label: "This Month", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#6B7A76" }} /> }
            ]}
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-6">
        <ExpensesListTable 
          expenses={filteredExpenses} 
          isLoading={loading} 
        />
      </div>

      {/* Add Expense Panel */}
      {showAddPanel && (
        <AddRequestForPaymentPanel
          context="expense"
          isOpen={showAddPanel}
          onClose={() => setShowAddPanel(false)}
          onSave={async () => {
            await fetchExpenses();
            setShowAddPanel(false);
          }}
          defaultRequestor={currentUser?.name || "Current User"}
        />
      )}
    </div>
  );
}