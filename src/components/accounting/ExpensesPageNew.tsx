import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus, Search, Calendar } from "lucide-react";
import type { Expense } from "../../types/accounting";
import { supabase } from "../../utils/supabase/client";
import { useDataScope } from "../../hooks/useDataScope";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { ExpensesListTable } from "./ExpensesListTable";
import { queryKeys } from "../../lib/queryKeys";

export function ExpensesPageNew() {
  const navigate = useNavigate();

  // State for UI
  const [showAddPanel, setShowAddPanel] = useState(false);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  
  const { scope, isLoaded } = useDataScope();
  const queryClient = useQueryClient();

  // Get current user from localStorage (needed for Panel defaultRequestor)
  const userData = typeof window !== "undefined" ? localStorage.getItem("neuron_user") : null;
  const currentUser = userData ? JSON.parse(userData) : null;

  const { data: rawEvouchers = [], isLoading: evouchersLoading } = useQuery({
    queryKey: ["expenses", "evouchers", scope, dateRange],
    queryFn: async () => {
      if (!isLoaded) return [];
      let query = supabase.from('evouchers').select('*').eq('transaction_type', 'expense');
      if (scope.type === 'userIds') query = query.in('created_by', scope.ids);
      else if (scope.type === 'own') query = query.eq('created_by', scope.userId);
      if (dateRange.from) query = query.gte('request_date', dateRange.from);
      if (dateRange.to) query = query.lte('request_date', dateRange.to);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isLoaded,
    staleTime: 30_000,
  });

  const { data: postedRows = [], isLoading: postedLoading } = useQuery({
    queryKey: ["expenses", "posted"],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const loading = evouchersLoading || postedLoading;

  // Merge: posted expenses + unposted evouchers
  const expenses: Expense[] = useMemo(() => {
    const postedIds = new Set((postedRows || []).map((e: any) => e.evoucher_id));
    const unpostedEvouchers = rawEvouchers.filter((ev: any) => !postedIds.has(ev.id));
    return [
      ...(postedRows || []),
      ...unpostedEvouchers.map((ev: any) => ({
        id: ev.id,
        evoucher_id: ev.id,
        evoucher_number: ev.voucher_number,
        date: ev.request_date || ev.created_at,
        vendor: ev.vendor_name,
        category: ev.expense_category,
        amount: ev.amount,
        currency: ev.currency || 'PHP',
        description: ev.purpose || ev.description,
        status: ev.status,
        project_number: ev.project_number,
        payment_method: ev.payment_method,
        created_at: ev.created_at,
      })),
    ] as Expense[];
  }, [rawEvouchers, postedRows]);

  const fetchExpenses = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
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
      new Date(b.date || "").getTime() - new Date(a.date || "").getTime()
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
        backgroundColor: "var(--theme-bg-surface)"
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
                color: "var(--theme-text-primary)",
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}
            >
              Expenses
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
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
                e.currentTarget.style.background = "var(--theme-action-primary-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--theme-action-primary-bg)";
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
                backgroundColor: "var(--theme-bg-surface)",
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
              ...categories.map(cat => ({ value: cat || "", label: cat || "" }))
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
              { value: "today", label: "Today", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-action-primary-bg)" }} /> },
              { value: "this-week", label: "This Week", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "this-month", label: "This Month", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} /> }
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
          context="accounting"
          isOpen={showAddPanel}
          onClose={() => setShowAddPanel(false)}
          onSave={() => {
            fetchExpenses();
            setShowAddPanel(false);
          }}
          defaultRequestor={currentUser?.name || "Current User"}
        />
      )}
    </div>
  );
}