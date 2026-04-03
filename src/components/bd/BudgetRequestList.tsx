import { useState, useMemo } from "react";
import { Search, Plus, Calendar, ArrowUpDown, X, SlidersHorizontal, Users, Package, Briefcase, FileText } from "lucide-react";
import { supabase } from '../../utils/supabase/client';
import { toast } from "../ui/toast-utils";
import type { EVoucher } from "../../types/evoucher";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { CustomDropdown } from "./CustomDropdown";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { AddRequestForPaymentPanel } from "../accounting/AddRequestForPaymentPanel";
import { BudgetRequestDetailPanel } from "./BudgetRequestDetailPanel";
import { PhilippinePeso } from "../icons/PhilippinePeso";
import { SkeletonTable } from "../shared/NeuronSkeleton";

type QuickFilterTab = "all" | "my-requests";
type DateRangeFilter = "all" | "today" | "this-week" | "this-month" | "this-quarter" | "last-30-days";
type SortOption = "date-newest" | "date-oldest" | "amount-highest" | "amount-lowest" | "status" | "requestor";

export function BudgetRequestList() {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilterTab, setQuickFilterTab] = useState<QuickFilterTab>("all");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string[]>([]);
  const [requestorFilter, setRequestorFilter] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>("date-newest");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EVoucher | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Current user (in real app, get from auth context)
  const currentUserId = "user001";

  const queryClient = useQueryClient();

  const { data: budgetRequests = [], isLoading } = useQuery({
    queryKey: queryKeys.evouchers.list("bd"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evouchers')
        .select('*')
        .eq('source_module', 'bd')
        .eq('transaction_type', 'budget_request')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []).map((ev: any) => ({
        ...ev,
        status: normalizeStatus(ev.status),
        amount: ev.amount ?? ev.total_amount ?? 0,
        request_date: ev.request_date || ev.created_at,
        requestor_name: ev.requestor_name || 'Unknown',
        description: ev.description || ev.purpose || 'No description',
        purpose: ev.purpose || ev.description || 'No purpose',
      }))) as EVoucher[];
    },
    staleTime: 30_000,
  });

  // Extract unique values for filters
  const categories = useMemo(() => 
    Array.from(new Set(budgetRequests.map(r => r.gl_sub_category).filter(Boolean)))
  , [budgetRequests]);

  const customers = useMemo(() => 
    Array.from(new Set(budgetRequests.map(r => r.customer_name).filter(Boolean)))
  , [budgetRequests]);

  const requestors = useMemo(() => 
    Array.from(new Set(budgetRequests.map(r => r.requestor_name)))
  , [budgetRequests]);

  const vendors = useMemo(() => 
    Array.from(new Set(budgetRequests.map(r => r.vendor_name).filter(Boolean)))
  , [budgetRequests]);

  // Date filtering helper
  const isWithinDateRange = (dateStr: string, range: DateRangeFilter): boolean => {
    const date = new Date(dateStr);
    const today = new Date("2024-12-12"); // Using your current date
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    switch (range) {
      case "all":
        return true;
      case "today":
        return date >= startOfToday;
      case "this-week": {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return date >= startOfWeek;
      }
      case "this-month": {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return date >= startOfMonth;
      }
      case "this-quarter": {
        const currentQuarter = Math.floor(today.getMonth() / 3);
        const startOfQuarter = new Date(today.getFullYear(), currentQuarter * 3, 1);
        return date >= startOfQuarter;
      }
      case "last-30-days": {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        return date >= thirtyDaysAgo;
      }
      default:
        return true;
    }
  };

  // Filter and sort logic
  const filteredAndSortedRequests = useMemo(() => {
    let filtered = budgetRequests.filter(request => {
      // Search filter
      const matchesSearch = searchQuery === "" || 
        (request.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.voucher_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.requestor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (request.customer_name && request.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

      // Quick filter tabs
      let matchesQuickFilter = true;
      switch (quickFilterTab) {
        case "my-requests":
          matchesQuickFilter = request.requestor_id === currentUserId;
          break;
      }

      // Date range filter
      const matchesDateRange = dateRangeFilter === "all" || isWithinDateRange(request.request_date, dateRangeFilter);

      // Category filter
      const matchesCategory = categoryFilter.length === 0 || (request.gl_sub_category && categoryFilter.includes(request.gl_sub_category));

      // Customer filter
      const matchesCustomer = customerFilter.length === 0 || (request.customer_name && customerFilter.includes(request.customer_name));

      // Requestor filter
      const matchesRequestor = requestorFilter.length === 0 || requestorFilter.includes(request.requestor_name);

      // Vendor filter
      const matchesVendor = vendorFilter.length === 0 || (request.vendor_name && vendorFilter.includes(request.vendor_name));

      // Status filter
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(request.status);

      return matchesSearch && matchesQuickFilter && matchesDateRange && matchesCategory && 
             matchesCustomer && matchesRequestor && matchesVendor && matchesStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "date-newest":
          return new Date(b.request_date).getTime() - new Date(a.request_date).getTime();
        case "date-oldest":
          return new Date(a.request_date).getTime() - new Date(b.request_date).getTime();
        case "amount-highest":
          return b.amount - a.amount;
        case "amount-lowest":
          return a.amount - b.amount;
        case "status":
          return a.status.localeCompare(b.status);
        case "requestor":
          return a.requestor_name.localeCompare(b.requestor_name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [budgetRequests, searchQuery, quickFilterTab, dateRangeFilter, categoryFilter, customerFilter, requestorFilter, vendorFilter, statusFilter, sortOption, currentUserId]);

  // Group requests by status
  const groupedRequests = useMemo(() => {
    const groups: Record<string, EVoucher[]> = {
      "Under Review": [],
      "Submitted": [],
      "Approved": [],
      "Rejected": [],
      "Draft": []
    };

    filteredAndSortedRequests.forEach(request => {
      if (groups[request.status]) {
        groups[request.status].push(request);
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, requests]) => requests.length > 0);
  }, [filteredAndSortedRequests]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved":
        return "bg-[var(--theme-bg-surface-tint)] text-[var(--theme-action-primary-bg)]";
      case "Rejected":
        return "bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)]";
      case "Under Review":
        return "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]";
      case "Submitted":
        return "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)]";
      case "Draft":
        return "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)]";
      default:
        return "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)]";
    }
  };

  const getCategoryIcon = (category: string) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (category?.toLowerCase()) {
      case "marketing":
      case "advertising":
        return <Users {...iconProps} />;
      case "office supplies":
      case "supplies":
        return <Package {...iconProps} />;
      case "client entertainment":
      case "meals":
        return <Briefcase {...iconProps} />;
      default:
        return <FileText {...iconProps} />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const toggleGroup = (status: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(status)) {
      newCollapsed.delete(status);
    } else {
      newCollapsed.add(status);
    }
    setCollapsedGroups(newCollapsed);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setQuickFilterTab("all");
    setDateRangeFilter("all");
    setCategoryFilter([]);
    setCustomerFilter([]);
    setRequestorFilter([]);
    setVendorFilter([]);
    setStatusFilter([]);
    setSortOption("date-newest");
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (quickFilterTab !== "all") count++;
    if (dateRangeFilter !== "all") count++;
    if (categoryFilter.length > 0) count++;
    if (customerFilter.length > 0) count++;
    if (requestorFilter.length > 0) count++;
    if (vendorFilter.length > 0) count++;
    if (statusFilter.length > 0) count++;
    return count;
  }, [quickFilterTab, dateRangeFilter, categoryFilter, customerFilter, requestorFilter, vendorFilter, statusFilter]);

  // Helper function to normalize backend status to frontend display status
  const normalizeStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      'draft': 'Draft',
      'pending': 'Submitted',
      'posted': 'Approved',
      'rejected': 'Rejected',
      'cancelled': 'Cancelled',
      // Keep capitalized versions as-is
      'Draft': 'Draft',
      'Submitted': 'Submitted',
      'Under Review': 'Under Review',
      'Approved': 'Approved',
      'Rejected': 'Rejected',
    };
    
    return statusMap[status] || status;
  };

  return (
    <div 
      className="h-full flex flex-col"
      style={{
        background: "var(--theme-bg-surface)",
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
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Budget Requests
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              Manage and track budget requests for business development activities
            </p>
          </div>
          <button
            className="neuron-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
            }}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={18} />
            New Request
          </button>
        </div>

        {/* Quick Filter Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "8px", 
          marginBottom: "16px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          paddingBottom: "0px"
        }}>
          {[
            { id: "all" as QuickFilterTab, label: "All Requests" },
            { id: "my-requests" as QuickFilterTab, label: "My Requests" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setQuickFilterTab(tab.id)}
              style={{
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: quickFilterTab === tab.id ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: quickFilterTab === tab.id ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (quickFilterTab !== tab.id) {
                  e.currentTarget.style.color = "var(--theme-text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (quickFilterTab !== tab.id) {
                  e.currentTarget.style.color = "var(--theme-text-muted)";
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters Row */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 300px", minWidth: "250px" }}>
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
              placeholder="Search by title, ID, customer, or requester..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                color: "var(--neuron-ink-primary)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            />
          </div>

          {/* Date Range Filter */}
          <div style={{ flex: "0 1 180px" }}>
            <CustomDropdown
              value={dateRangeFilter}
              onChange={(value) => setDateRangeFilter(value as DateRangeFilter)}
              options={[
                { value: "all", label: "All Time", icon: <Calendar size={16} /> },
                { value: "today", label: "Today", icon: <Calendar size={16} /> },
                { value: "this-week", label: "This Week", icon: <Calendar size={16} /> },
                { value: "this-month", label: "This Month", icon: <Calendar size={16} /> },
                { value: "this-quarter", label: "This Quarter", icon: <Calendar size={16} /> },
                { value: "last-30-days", label: "Last 30 Days", icon: <Calendar size={16} /> },
              ]}
              placeholder="Date Range"
            />
          </div>

          {/* Category Filter */}
          <div style={{ flex: "0 1 200px" }}>
            <MultiSelectDropdown
              values={categoryFilter}
              onChange={setCategoryFilter}
              options={categories as string[]}
              placeholder="All Categories"
            />
          </div>

          {/* Status Filter */}
          <div style={{ flex: "0 1 200px" }}>
            <MultiSelectDropdown
              values={statusFilter}
              onChange={setStatusFilter}
              options={["Draft", "Submitted", "Under Review", "Approved", "Rejected"]}
              placeholder="All Statuses"
            />
          </div>

          {/* Sort */}
          <div style={{ flex: "0 1 180px" }}>
            <CustomDropdown
              value={sortOption}
              onChange={(value) => setSortOption(value as SortOption)}
              options={[
                { value: "date-newest", label: "Date (Newest)", icon: <ArrowUpDown size={16} /> },
                { value: "date-oldest", label: "Date (Oldest)", icon: <ArrowUpDown size={16} /> },
                { value: "amount-highest", label: "Amount (High)", icon: <ArrowUpDown size={16} /> },
                { value: "amount-lowest", label: "Amount (Low)", icon: <ArrowUpDown size={16} /> },
                { value: "status", label: "Status", icon: <ArrowUpDown size={16} /> },
                { value: "requestor", label: "Requestor (A-Z)", icon: <ArrowUpDown size={16} /> },
              ]}
              placeholder="Sort by"
            />
          </div>

          {/* More Filters Button */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              color: showAdvancedFilters ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
              backgroundColor: showAdvancedFilters ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!showAdvancedFilters) {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
              }
            }}
            onMouseLeave={(e) => {
              if (!showAdvancedFilters) {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }
            }}
          >
            <SlidersHorizontal size={16} />
            More Filters
          </button>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 16px",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--theme-status-danger-fg)",
                backgroundColor: "var(--theme-status-danger-bg)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-status-danger-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
              }}
            >
              <X size={16} />
              Clear All ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div style={{ 
            marginTop: "16px", 
            padding: "16px", 
            backgroundColor: "var(--theme-bg-page)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px"
          }}>
            <MultiSelectDropdown
              label="Requestor"
              values={requestorFilter}
              onChange={setRequestorFilter}
              options={requestors}
              placeholder="All Requestors"
            />
            <MultiSelectDropdown
              label="Vendor/Supplier"
              values={vendorFilter}
              onChange={setVendorFilter}
              options={vendors}
              placeholder="All Vendors"
            />
            <MultiSelectDropdown
              label="Customer"
              values={customerFilter}
              onChange={setCustomerFilter}
              options={customers as string[]}
              placeholder="All Customers"
            />
          </div>
        )}
      </div>

      {/* Table View */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-6">
        {isLoading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : filteredAndSortedRequests.length === 0 ? (
          <div
            style={{
              borderRadius: "10px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--neuron-ui-border)",
            }}
          >
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <PhilippinePeso
                size={48}
                style={{
                  color: "var(--neuron-ink-muted)",
                  margin: "0 auto 12px",
                  display: "block",
                }}
              />
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)",
                  marginBottom: "4px",
                }}
              >
                No budget requests found
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--neuron-ink-muted)",
                }}
              >
                {activeFilterCount > 0 || searchQuery
                  ? "Try adjusting your filters or search query"
                  : "Create your first budget request to get started"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            {/* Table Header */}
            <div className="grid grid-cols-[32px_minmax(200px,1fr)_140px_140px_110px_120px_1fr] gap-3 px-4 py-2 border-b" style={{ 
              backgroundColor: "var(--neuron-bg-page)",
              borderColor: "var(--neuron-ui-divider)"
            }}>
              <div></div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Request</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Category</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Requestor</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Date</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-right" style={{ color: "var(--neuron-ink-muted)" }}>Amount</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em] pl-8" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
            </div>

            {/* Request Rows */}
            <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
              {filteredAndSortedRequests.map(request => (
                <div
                  key={request.id}
                  className="grid grid-cols-[32px_minmax(200px,1fr)_140px_140px_110px_120px_1fr] gap-3 px-4 py-3 transition-colors cursor-pointer"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowDetailPanel(true);
                  }}
                >
                  {/* Icon Column */}
                  <div className="flex items-center justify-center">
                    {getCategoryIcon(request.gl_sub_category || "")}
                  </div>

                  {/* Request */}
                  <div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
                      {request.description}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      {request.voucher_number} • {request.purpose}
                    </div>
                    {request.customer_name && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
                        → {request.customer_name}
                      </div>
                    )}
                  </div>

                  {/* Category */}
                  <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                    {request.gl_sub_category || "—"}
                  </div>

                  {/* Requestor */}
                  <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                    {request.requestor_name}
                  </div>

                  {/* Date */}
                  <div className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                    {formatDate(request.request_date)}
                  </div>

                  {/* Amount */}
                  <div className="text-[13px] font-semibold text-right flex items-center justify-end" style={{ color: "var(--neuron-ink-primary)" }}>
                    <PhilippinePeso size={13} style={{ marginRight: "4px" }} />
                    {request.amount.toLocaleString()}
                  </div>

                  {/* Status Badge */}
                  <div className="pl-8">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Budget Request Panel */}
      <AddRequestForPaymentPanel
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          // Refresh the list after successful save
          queryClient.invalidateQueries({ queryKey: queryKeys.evouchers.all() });
        }}
        context="bd"
        defaultRequestor={currentUserId}
      />

      {/* Budget Request Detail Panel */}
      <BudgetRequestDetailPanel
        isOpen={showDetailPanel}
        onClose={() => setShowDetailPanel(false)}
        request={selectedRequest}
      />
    </div>
  );
}