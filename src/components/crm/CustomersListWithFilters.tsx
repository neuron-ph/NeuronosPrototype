import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users as UsersIcon, MoreHorizontal, Building2, Target, Briefcase, TrendingUp, Trash2 } from "lucide-react";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { supabase } from "../../utils/supabase/client";
import { useUsers } from "../../hooks/useUsers";
import { useUser } from "../../hooks/useUser";
import { logCreation, logDeletion } from "../../utils/activityLog";
import { recordNotificationEvent, fetchDeptManagerIds } from "../../utils/notifications";
import { useUnreadEntityIds } from "../../hooks/useNotifications";
import { useCustomersPaginated } from "../../hooks/useCustomers";
import { useCRMActivities } from "../../hooks/useCRMActivities";
import { useDebounce } from "../../hooks/useDebounce";
import { TablePagination } from "../shared/TablePagination";
import type { Customer, Industry, CustomerStatus } from "../../types/bd";
import { useDataScope } from "../../hooks/useDataScope";
import { CustomDropdown } from "../bd/CustomDropdown";
import { AddCustomerPanel } from "../bd/AddCustomerPanel";
import { usePermission } from "../../context/PermissionProvider";
import type { ModuleId } from "../admin/permissionsConfig";
import { useCustomerProfileOptions } from "../../hooks/useCustomerProfileOptions";

interface CustomersListWithFiltersProps {
  userDepartment: "Business Development" | "Pricing";
  /** Required — drives all create/edit/view permission checks. No fallback. */
  moduleId: ModuleId;
  onViewCustomer: (customer: Customer) => void;
}

export function CustomersListWithFilters({ userDepartment, moduleId, onViewCustomer }: CustomersListWithFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<Industry | "All">("All");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { user } = useUser();
  const queryClient = useQueryClient();

  // Visibility is enforced by RLS (crew-based, migration 189) — the hook only
  // gates the fetch until auth context is ready. No client-side scope filter.
  const { isLoaded } = useDataScope('customers');

  // Permissions — explicit, driven by moduleId. No dept-string fallbacks.
  const { can } = usePermission();
  const permissions = {
    canCreate: can(moduleId, "create"),
    canEdit:   can(moduleId, "edit"),
    canDelete: can(moduleId, "delete"), // NEU-019 WG-20: delete had hidden behind edit
    showKPIs: true, // Both BD and PD see KPIs
    showOwnerFilter: userDepartment === "Business Development",
  };

  // Direct Supabase query for BD users (replaces Edge Function fetch)
  const { users } = useUsers({ department: 'Business Development' });

  // Reset to first page whenever a filter or search changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, industryFilter, statusFilter, ownerFilter]);

  // Server-paginated customers (search + industry + status + owner pushed to the DB)
  const {
    rows: filteredCustomers,
    total,
    totalPages,
    pageSize,
    isLoading,
    isFetching,
  } = useCustomersPaginated({
    page,
    search: debouncedSearch,
    industry: industryFilter,
    status: statusFilter,
    owner: ownerFilter,
    enabled: isLoaded,
  });

  const invalidateCustomers = () => queryClient.invalidateQueries({ queryKey: ["customers"] });
  const invalidateContacts = () => queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const { activities } = useCRMActivities();
  const { industries } = useCustomerProfileOptions({
    industryValuesFromRecords: filteredCustomers.map((customer: any) => customer.industry),
  });

  // Per-row contact counts for the visible page only (bounded by ~pageSize customers)
  const visibleCustomerIds = filteredCustomers.map((c: any) => c.id);
  const { data: contactCountMap = {} } = useQuery({
    queryKey: ["customers", "contact-counts", visibleCustomerIds],
    enabled: isLoaded && visibleCustomerIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("customer_id")
        .in("customer_id", visibleCustomerIds);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = (row as any).customer_id;
        if (id) map[id] = (map[id] ?? 0) + 1;
      }
      return map;
    },
  });

  // KPI counts run as dedicated queries (the list is paginated; full counts reflect
  // the user's RLS-visible customer set, independent of the search/filter inputs).
  const kpiMonth = new Date();
  const kpiMonthStart = new Date(kpiMonth.getFullYear(), kpiMonth.getMonth(), 1).toISOString();
  const kpiNextMonthStart = new Date(kpiMonth.getFullYear(), kpiMonth.getMonth() + 1, 1).toISOString();
  const { data: kpiCounts = { total: 0, active: 0, prospect: 0, newThisMonth: 0 } } = useQuery({
    queryKey: ["customers", "kpi-counts"],
    enabled: isLoaded,
    staleTime: 30_000,
    queryFn: async () => {
      const head = (apply?: (q: any) => any) => {
        let q = supabase.from("customers").select("id", { count: "exact", head: true });
        if (apply) q = apply(q);
        return q;
      };
      const [all, active, prospect, fresh] = await Promise.all([
        head(),
        head((q) => q.eq("status", "Active")),
        head((q) => q.eq("status", "Prospect")),
        head((q) => q.gte("created_at", kpiMonthStart).lt("created_at", kpiNextMonthStart)),
      ]);
      return {
        total: all.count ?? 0,
        active: active.count ?? 0,
        prospect: prospect.count ?? 0,
        newThisMonth: fresh.count ?? 0,
      };
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle delete customer
  const handleDeleteCustomer = async (customerId: string, customerName: string) => {
    if (!permissions.canDelete) return; // WG-20 backstop
    if (!confirm(`Are you sure you want to delete "${customerName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('customers').delete().eq('id', customerId);
      if (!error) {
        const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
        logDeletion("customer", customerId, customerName, _actor);
        invalidateCustomers();
        invalidateContacts();
        setOpenDropdownId(null);
      } else {
        alert(`Failed to delete customer: ${error.message}`);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert("Failed to delete customer. Please try again.");
    }
  };

  // Handle save customer
  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    try {
      const newCustId = `CUST-${Date.now()}`;
      const { error } = await supabase.from('customers').insert({
        ...customerData,
        id: newCustId,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("customer", newCustId, customerData.name ?? newCustId, _actor);

      // Red-dot ping: notify assigned account owner (if any) + BD managers
      const accountOwnerId = (customerData as any).account_owner_id as string | undefined;
      const bdManagers = await fetchDeptManagerIds('Business Development');
      void recordNotificationEvent({
        actorUserId: user?.id ?? null,
        module: 'bd',
        subSection: 'customers',
        entityType: 'customer',
        entityId: newCustId,
        kind: 'updated',
        summary: { label: `New customer ${customerData.name ?? newCustId}`, customer_name: customerData.name ?? undefined },
        recipientIds: [accountOwnerId, ...bdManagers],
      });

      invalidateCustomers();
      invalidateContacts();
      setIsAddCustomerOpen(false);
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  };

  // Get contact count for each customer (counts fetched for the visible page only)
  const getContactCount = (customerId: string): number => contactCountMap[customerId] ?? 0;

  // Get latest activity date for each customer - now from backend
  const getLastActivityDate = (customerId: string): string | null => {
    const customerActivities = activities
      .filter(act => act.customer_id === customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return customerActivities.length > 0 ? customerActivities[0].date : null;
  };

  const unreadCustomerIds = useUnreadEntityIds("customer", filteredCustomers.map((c: any) => c.id));

  const getOwnerName = (ownerId: string) => {
    const owner = users.find(u => u.id === ownerId);
    return owner?.name || "—";
  };

  const getStatusColor = (status: CustomerStatus) => {
    switch (status) {
      case "Active": return "#0F766E";
      case "Prospect": return "#C88A2B";
      case "Inactive": return "#6B7A76";
      default: return "#6B7A76";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  // Generate company logo (initials from company name)
  const getCompanyInitials = (companyName: string) => {
    if (!companyName) return '??';
    const words = companyName.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return companyName.substring(0, 2).toUpperCase();
  };

  const getCompanyLogoColor = (companyName: string) => {
    if (!companyName) return '#0F766E';
    const colors = [
      '#0F766E', '#2B8A6E', '#237F66', '#1E6D59',
      '#C88A2B', '#6B7A76', '#C94F3D'
    ];
    const index = companyName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // KPIs from dedicated count queries (full RLS-visible set, not just the current page)
  const activeCustomers = kpiCounts.active;
  const newCustomersAdded = kpiCounts.newThisMonth;
  const newCustomersQuota = 10;
  const newCustomersProgress = (newCustomersAdded / newCustomersQuota) * 100;
  const newCustomersTrend = 20; // +20% vs last month (mock data)
  
  // Prospects Converted this month
  const prospectsConverted = 4; // Mock data - would track status changes
  const prospectsQuota = 8;
  const prospectsProgress = (prospectsConverted / prospectsQuota) * 100;
  const prospectsTrend = 12; // +12% vs last month (mock data)
  
  // Active Customers
  const activeCustomersCount = activeCustomers;
  const activeCustomersQuota = 50;
  const activeCustomersProgress = (activeCustomersCount / activeCustomersQuota) * 100;
  const activeCustomersTrend = 8; // +8% vs last month (mock data)
  
  // Total Revenue (mock data - would come from actual bookings)
  const totalRevenue = 2450000; // ₱2.45M
  const revenueQuota = 3000000; // ₱3M
  const revenueProgress = (totalRevenue / revenueQuota) * 100;
  const revenueTrend = -5; // -5% vs last month (mock data)
  
  // Helper function to get progress color
  const getProgressColor = (progress: number) => {
    if (progress >= 80) return "#0F766E"; // Green - on track
    if (progress >= 60) return "#C88A2B"; // Yellow - behind
    return "#C94F3D"; // Red - urgent
  };
  
  // Helper function to get background color
  const getProgressBgColor = (progress: number) => {
    if (progress >= 80) return "var(--theme-bg-surface-tint)"; // Light green
    if (progress >= 60) return "var(--theme-status-warning-bg)"; // Light yellow
    return "var(--theme-status-danger-bg)"; // Light red
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return `₱${(amount / 1000000).toFixed(2)}M`;
  };

  return (
    <div 
      className="h-full overflow-auto"
      style={{
        background: "var(--theme-bg-surface)",
      }}
    >
      <div style={{ padding: "32px 48px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Customers
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              {userDepartment === "Business Development" 
                ? "Manage customer companies and prospects" 
                : "View customer companies and check inquiries"}
            </p>
          </div>
          {permissions.canCreate && (
            <button
              style={{
                height: "48px",
                padding: "0 24px",
                borderRadius: "16px",
                background: "var(--theme-action-primary-bg)",
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
              onClick={() => setIsAddCustomerOpen(true)}
            >
              <Plus size={20} />
              Add Customer
            </button>
          )}
        </div>

        {/* KPI Section */}
        {permissions.showKPIs && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <NeuronKPICard
              icon={Building2}
              label="New Customers Added"
              value={newCustomersAdded}
              suffix={`/ ${newCustomersQuota}`}
              progress={newCustomersProgress}
              trend={newCustomersTrend}
            />
            <NeuronKPICard
              icon={Target}
              label="Prospects Converted"
              value={prospectsConverted}
              suffix={`/ ${prospectsQuota}`}
              progress={prospectsProgress}
              trend={prospectsTrend}
            />
            <NeuronKPICard
              icon={Briefcase}
              label="Active Customers"
              value={activeCustomersCount}
              suffix={`/ ${activeCustomersQuota}`}
              progress={activeCustomersProgress}
              trend={activeCustomersTrend}
            />
            <NeuronKPICard
              icon={TrendingUp}
              label="Total Revenue (MTD)"
              value={formatCurrency(totalRevenue)}
              suffix={`/ ${formatCurrency(revenueQuota)}`}
              progress={revenueProgress}
              trend={revenueTrend}
            />
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
              style={{
                border: "1.5px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--neuron-ink-primary)"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              }}
            />
          </div>

          {/* BD sees Industry and Status filters, PD does not */}
          {userDepartment === "Business Development" && (
            <>
              <div style={{ minWidth: "150px" }}>
                <CustomDropdown
                  value={industryFilter}
                  onChange={(value) => setIndustryFilter(value as Industry | "All")}
                  options={[
                    { value: "All", label: "All Industries" },
                    ...industries.map(industry => ({ value: industry, label: industry }))
                  ]}
                />
              </div>

              <div style={{ minWidth: "140px" }}>
                <CustomDropdown
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as CustomerStatus | "All")}
                  options={[
                    { value: "All", label: "All Statuses" },
                    { value: "Prospect", label: "Prospect" },
                    { value: "Active", label: "Active" },
                    { value: "Inactive", label: "Inactive" }
                  ]}
                />
              </div>
            </>
          )}

          {permissions.showOwnerFilter && (
            <div style={{ minWidth: "140px" }}>
              <CustomDropdown
                value={ownerFilter}
                onChange={(value) => setOwnerFilter(value)}
                options={[
                  { value: "All", label: "All Owners" },
                  ...users.map(user => ({ value: user.id, label: user.name }))
                ]}
              />
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ 
          border: "1.5px solid var(--neuron-ui-border)", 
          borderRadius: "16px", 
          overflow: "hidden",
          backgroundColor: "var(--theme-bg-surface)"
        }}>
        {/* Table Header - Sticky */}
        <div 
          className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_100px_80px_120px_40px] gap-3 px-6 py-3 border-b sticky top-0 z-10" 
          style={{ 
            backgroundColor: "var(--neuron-bg-page)",
            borderColor: "var(--neuron-ui-divider)",
            borderTopLeftRadius: "10px",
            borderTopRightRadius: "10px"
          }}
        >
          <div></div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>Company</div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>Industry</div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>Contacts</div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>Last Activity</div>
          <div></div>
        </div>

        {/* Table Body */}
        <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)", overflow: "visible" }}>
          {isLoading ? (
            <div className="px-6 py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
              <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">Loading customers...</h3>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
              <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No customers found</h3>
              <p style={{ color: "var(--neuron-ink-muted)" }}>Try adjusting your filters or search query</p>
            </div>
          ) : (
            filteredCustomers.map(customer => {
              const lastActivityDate = getLastActivityDate(customer.id);
              const contactCount = getContactCount(customer.id);
              const logoColor = getCompanyLogoColor(customer.name || customer.company_name || '');
              
              return (
                <div
                  key={customer.id}
                  onClick={() => onViewCustomer(customer)}
                  className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_100px_80px_120px_40px] gap-3 px-6 py-4 cursor-pointer transition-colors items-center"
                  style={{ backgroundColor: "var(--theme-bg-surface)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                  }}
                >
                  {/* Company Logo + unread dot */}
                  <div style={{ position: "relative" }}>
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${logoColor}15`,
                        color: logoColor,
                        border: `1px solid ${logoColor}30`
                      }}
                    >
                      {getCompanyInitials(customer.name || customer.company_name || '')}
                    </div>
                    {unreadCustomerIds.has(customer.id) && (
                      <span aria-label="Unread" style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: "var(--theme-status-danger-fg)" }} />
                    )}
                  </div>

                  {/* Company Info (Name & Lead Source) */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: "var(--neuron-ink-primary)" }}>
                      {customer.name || customer.company_name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--neuron-ink-muted)" }}>
                      {customer.lead_source}
                    </div>
                  </div>

                  {/* Industry */}
                  <div className="text-[13px] truncate" style={{ color: "var(--neuron-ink-secondary)" }}>
                    {customer.industry}
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white w-fit"
                      style={{ backgroundColor: getStatusColor(customer.status) }}
                    >
                      {customer.status}
                    </span>
                  </div>

                  {/* Contact Count */}
                  <div className="flex items-center gap-1.5">
                    <UsersIcon size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                    <span className="text-[13px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                      {contactCount}
                    </span>
                  </div>

                  {/* Last Activity */}
                  <div className="text-[11px] truncate" style={{ color: "var(--neuron-ink-muted)" }}>
                    {lastActivityDate ? formatDate(lastActivityDate) : "No activity"}
                  </div>

                  {/* Actions Menu */}
                  <div className="relative" ref={openDropdownId === customer.id ? dropdownRef : null}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId(openDropdownId === customer.id ? null : customer.id);
                      }}
                      className="p-1 rounded transition-colors"
                      style={{ 
                        color: "var(--neuron-ink-muted)",
                        backgroundColor: openDropdownId === customer.id ? "var(--neuron-state-hover)" : "transparent"
                      }}
                      onMouseEnter={(e) => {
                        if (openDropdownId !== customer.id) {
                          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (openDropdownId !== customer.id) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {openDropdownId === customer.id && permissions.canDelete && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-50 shadow-lg"
                        style={{
                          backgroundColor: "var(--theme-bg-surface)",
                          border: "1px solid var(--neuron-ui-border)",
                          minWidth: "160px",
                          boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomer(customer.id, customer.name || customer.company_name || '');
                          }}
                          className="w-full px-4 py-2.5 text-left text-[13px] transition-colors flex items-center gap-2"
                          style={{
                            backgroundColor: "var(--theme-bg-surface)",
                            color: "var(--theme-status-danger-fg)",
                            border: "none"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                          }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {!isLoading && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            isFetching={isFetching}
          />
        )}
      </div>
      </div>

      {/* Add Customer Panel - Only for BD */}
      {permissions.canCreate && (
        <AddCustomerPanel 
          isOpen={isAddCustomerOpen}
          onClose={() => setIsAddCustomerOpen(false)} 
          onSave={handleSaveCustomer} 
        />
      )}
    </div>
  );
}
