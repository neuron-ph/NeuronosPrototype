import { useState, useEffect, useRef } from "react";
import { Search, Plus, Building2, Users as UsersIcon, TrendingUp, Briefcase, Target, MoreHorizontal, Trash2 } from "lucide-react";
import type { Customer, Industry, CustomerStatus } from "../../types/bd";
import { CustomDropdown } from "../bd/CustomDropdown";
import { AddCustomerPanel } from "../bd/AddCustomerPanel";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { apiFetch } from "../../utils/api";
import { useUsers } from "../../hooks/useUsers";

interface CustomersListWithFiltersProps {
  userDepartment: "Business Development" | "Pricing";
  onViewCustomer: (customer: Customer) => void;
}

export function CustomersListWithFilters({ userDepartment, onViewCustomer }: CustomersListWithFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<Industry | "All">("All");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Permissions based on department
  const permissions = {
    canCreate: userDepartment === "Business Development",
    canEdit: userDepartment === "Business Development",
    showKPIs: true, // Both BD and PD see KPIs
    showOwnerFilter: userDepartment === "Business Development",
  };

  // Direct Supabase query for BD users (replaces Edge Function fetch)
  const { users } = useUsers({ department: 'Business Development' });

  // Fetch activities from backend
  const fetchActivities = async () => {
    try {
      const response = await apiFetch('/activities');
      
      if (!response.ok) {
        console.error(`HTTP error fetching activities! status: ${response.status}`);
        setActivities([]);
        return;
      }
      
      const result = await response.json();
      if (result.success) {
        setActivities(result.data);
        console.log('[CustomersListWithFilters] Fetched activities:', result.data.length);
      } else {
        console.error("Failed to fetch activities:", result.error);
        setActivities([]);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
      // Silently fail - set empty array
      setActivities([]);
    }
  };

  // Fetch customers from backend
  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      if (industryFilter && industryFilter !== "All") {
        params.append("industry", industryFilter);
      }
      if (statusFilter && statusFilter !== "All") {
        params.append("status", statusFilter);
      }
      // Pass role to backend for data filtering
      params.append("role", userDepartment);
      
      const url = `/customers?${params.toString()}`;
      console.log(`[CustomersListWithFilters] Fetching from: ${url}`);
      
      const response = await apiFetch(url);

      console.log(`[CustomersListWithFilters] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CustomersListWithFilters] HTTP error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`[CustomersListWithFilters] Result:`, result);
      
      if (result.success) {
        setCustomers(result.data);
        console.log(`[CustomersListWithFilters] Set ${result.data.length} customers`);
      } else {
        console.error("[CustomersListWithFilters] Failed to fetch customers:", result.error);
      }
    } catch (error) {
      console.error("[CustomersListWithFilters] Error fetching customers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all contacts for counting
  const fetchContacts = async () => {
    try {
      const response = await apiFetch('/contacts');

      const result = await response.json();
      if (result.success) {
        setAllContacts(result.data);
        console.log(`[CustomersListWithFilters] Fetched ${result.data.length} contacts for counting`);
        if (result.data.length > 0) {
          console.log('[CustomersListWithFilters] Sample contact:', result.data[0]);
        }
      } else {
        console.error('[CustomersListWithFilters] Failed to fetch contacts:', result.error);
      }
    } catch (error) {
      console.error('[CustomersListWithFilters] Error fetching contacts:', error);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchCustomers();
    fetchContacts();
    fetchActivities();
  }, []);

  // Debounced search and filter updates
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, industryFilter, statusFilter]);

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
    if (!confirm(`Are you sure you want to delete "${customerName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiFetch(`/customers/${customerId}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (result.success) {
        await fetchCustomers(); // Refresh list
        await fetchContacts(); // Refresh contacts
        setOpenDropdownId(null); // Close dropdown
      } else {
        alert(`Failed to delete customer: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert("Failed to delete customer. Please try again.");
    }
  };

  // Handle save customer
  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    try {
      const response = await apiFetch('/customers', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerData),
      });

      const result = await response.json();
      if (result.success) {
        await fetchCustomers(); // Refresh list
        await fetchContacts(); // Refresh contacts for accurate counts
        setIsAddCustomerOpen(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  };

  // Get contact count for each customer (using backend contacts)
  const getContactCount = (customerId: string, customerName: string): number => {
    const count = allContacts.filter(c => 
      c.customer_id === customerId // ✅ Contacts now correctly use customer_id field
    ).length;
    if (customerId === 'CUST-001') {
      console.log(`[DEBUG] Contact count for ${customerId} (${customerName}):`, count);
      console.log(`[DEBUG] All contacts:`, allContacts.map(c => ({ id: c.id, name: c.name, customer_id: c.customer_id })));
    }
    return count;
  };

  // Get latest activity date for each customer - now from backend
  const getLastActivityDate = (customerId: string): string | null => {
    const customerActivities = activities
      .filter(act => act.customer_id === customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return customerActivities.length > 0 ? customerActivities[0].date : null;
  };

  // Filter customers (now for owner only, since backend handles search, industry, status)
  const filteredCustomers = customers.filter(customer => {
    const matchesOwner = ownerFilter === "All" || customer.owner_id === ownerFilter;
    return matchesOwner;
  });

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

  // Calculate KPIs with Quotas - now from backend data
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // Total Customers - from backend
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.status === "Active").length;
  const prospectCustomers = customers.filter(c => c.status === "Prospect").length;
  
  // New Customers Added this month - from backend
  const newCustomersAdded = customers.filter(customer => {
    const createdDate = new Date(customer.created_at);
    return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
  }).length;
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
    if (progress >= 80) return "#E8F5F3"; // Light green
    if (progress >= 60) return "#FEF3E7"; // Light yellow
    return "#FFE5E5"; // Light red
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return `₱${(amount / 1000000).toFixed(2)}M`;
  };

  return (
    <div 
      className="h-full overflow-auto"
      style={{
        background: "#FFFFFF",
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
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#12332B", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Customers
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
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
                backgroundColor: "#FFFFFF",
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
                    { value: "Garments", label: "Garments" },
                    { value: "Automobile", label: "Automobile" },
                    { value: "Energy", label: "Energy" },
                    { value: "Food & Beverage", label: "Food & Beverage" },
                    { value: "Heavy Equipment", label: "Heavy Equipment" },
                    { value: "Construction", label: "Construction" },
                    { value: "Agricultural", label: "Agricultural" },
                    { value: "Pharmaceutical", label: "Pharmaceutical" },
                    { value: "IT", label: "IT" },
                    { value: "Electronics", label: "Electronics" },
                    { value: "General Merchandise", label: "General Merchandise" }
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
          backgroundColor: "#FFFFFF"
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
              const contactCount = getContactCount(customer.id, customer.name || customer.company_name || '');
              const logoColor = getCompanyLogoColor(customer.name || customer.company_name || '');
              
              return (
                <div
                  key={customer.id}
                  onClick={() => onViewCustomer(customer)}
                  className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_100px_80px_120px_40px] gap-3 px-6 py-4 cursor-pointer transition-colors items-center"
                  style={{ backgroundColor: "#FFFFFF" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFFFFF";
                  }}
                >
                  {/* Company Logo */}
                  <div>
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
                          e.currentTarget.style.backgroundColor = "#F3F4F6";
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
                    {openDropdownId === customer.id && permissions.canEdit && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-50 shadow-lg"
                        style={{
                          backgroundColor: "#FFFFFF",
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
                            backgroundColor: "#FFFFFF",
                            color: "#C94F3D",
                            border: "none"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#FFF5F5";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#FFFFFF";
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