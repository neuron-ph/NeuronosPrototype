import { useState, useEffect, useRef } from "react";
import { Search, Plus, Building2, Target, Briefcase, TrendingUp, Trash2, MoreHorizontal, Users as UsersIcon } from "lucide-react";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { toast } from "../ui/toast-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../utils/supabase/client";
import type { Customer, Industry, CustomerStatus } from "../../types/bd";
import { CustomDropdown } from "../bd/CustomDropdown";
import { AddCustomerPanel } from "../bd/AddCustomerPanel";
import { CustomerLedgerDetail } from "./CustomerLedgerDetail";

export function AccountingCustomers() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "detail">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<Industry | "All">("All");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: [...queryKeys.customers.list(), { searchQuery, industryFilter, statusFilter }],
    queryFn: async () => {
      let query = supabase.from('customers').select('*');
      if (searchQuery) query = query.ilike('name', `%${searchQuery}%`);
      if (industryFilter && industryFilter !== "All") query = query.eq('industry', industryFilter);
      if (statusFilter && statusFilter !== "All") query = query.eq('status', statusFilter);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users", "bd"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('department', 'Business Development');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: activities = [] } = useQuery({
    queryKey: queryKeys.crmActivities.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_activities')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
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
    if (!confirm(`Are you sure you want to delete "${customerName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId);

      if (error) {
        toast.error(`Failed to delete customer: ${error.message}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      setOpenDropdownId(null); // Close dropdown
      toast.success("Customer deleted successfully");
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error("Failed to delete customer. Please try again.");
    }
  };

  // Handle save customer
  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    const transformedData = {
      ...customerData,
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase
        .from('customers')
        .insert(transformedData);

      if (error) {
        toast.error(`Failed to create customer: ${error.message}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      setIsAddCustomerOpen(false);
      toast.success("Customer added successfully");
    } catch (error) {
      console.error("Error creating customer:", error);
      toast.error("Failed to create customer");
    }
  };

  // Get contact count for each customer
  const getContactCount = (customerId: string): number => {
    return allContacts.filter(c => c.customer_id === customerId).length;
  };

  // Get latest activity date for each customer
  const getLastActivityDate = (customerId: string): string | null => {
    const customerActivities = activities
      .filter(act => act.customer_id === customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return customerActivities.length > 0 ? customerActivities[0].date : null;
  };

  // Filter customers for owner
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

  // KPI Calculations
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const activeCustomers = customers.filter(c => c.status === "Active").length;
  
  // New Customers Added this month
  const newCustomersAdded = customers.filter(customer => {
    const createdDate = new Date(customer.created_at);
    return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
  }).length;
  const newCustomersQuota = 10;
  const newCustomersProgress = (newCustomersAdded / newCustomersQuota) * 100;
  const newCustomersTrend = 20;
  
  // Prospects Converted this month
  const prospectsConverted = 4;
  const prospectsQuota = 8;
  const prospectsProgress = (prospectsConverted / prospectsQuota) * 100;
  const prospectsTrend = 12;
  
  // Active Customers
  const activeCustomersCount = activeCustomers;
  const activeCustomersQuota = 50;
  const activeCustomersProgress = (activeCustomersCount / activeCustomersQuota) * 100;
  const activeCustomersTrend = 8;
  
  // Total Revenue (mock data)
  const totalRevenue = 2450000;
  const revenueQuota = 3000000;
  const revenueProgress = (totalRevenue / revenueQuota) * 100;
  const revenueTrend = -5;
  
  const getProgressColor = (progress: number) => {
    if (progress >= 80) return "#0F766E";
    if (progress >= 60) return "#C88A2B";
    return "#C94F3D";
  };
  
  const getProgressBgColor = (progress: number) => {
    if (progress >= 80) return "#E8F5F3";
    if (progress >= 60) return "#FEF3E7";
    return "#FFE5E5";
  };

  const formatCurrency = (amount: number) => {
    return `₱${(amount / 1000000).toFixed(2)}M`;
  };

  // Detail View
  if (view === "detail" && selectedCustomer) {
    return (
      <CustomerLedgerDetail 
        customer={selectedCustomer} 
        onClose={() => { setSelectedCustomer(null); setView("list"); }} 
      />
    );
  }

  // List View
  return (
    <div className="h-full flex flex-col bg-[var(--theme-bg-surface)]">
      {/* Header & Controls */}
      <div className="px-12 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
              Customers
            </h1>
            <p className="text-sm text-[var(--theme-text-muted)]">
              Manage customer companies and prospects
            </p>
          </div>
          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="h-12 px-6 rounded-2xl bg-[var(--theme-action-primary-bg)] border-none text-white text-sm font-semibold flex items-center gap-2 cursor-pointer hover:bg-[var(--theme-action-primary-border)] transition-colors"
          >
            <Plus size={20} />
            Add Customer
          </button>
        </div>

        {/* KPI Section */}
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

        {/* Filters & Search */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neuron-ink-muted)]" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px] border-[1.5px] border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)] focus:border-[var(--theme-action-primary-bg)]"
            />
          </div>

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
        </div>

        {/* Table */}
        <div className="border-[1.5px] border-[var(--neuron-ui-border)] rounded-2xl overflow-hidden bg-[var(--theme-bg-surface)]">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_100px_80px_120px_40px] gap-3 px-6 py-3 border-b border-[var(--neuron-ui-divider)] bg-[var(--neuron-bg-page)] sticky top-0 z-10">
            <div></div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Company</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Industry</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Status</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Contacts</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Last Activity</div>
            <div></div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-[var(--neuron-ui-divider)]">
            {isLoading ? (
              <div className="py-12 text-center text-[var(--neuron-ink-muted)]">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="py-12 text-center text-[var(--neuron-ink-muted)]">No customers found</div>
            ) : (
              filteredCustomers.map((customer) => {
                const initials = getCompanyInitials(customer.name || customer.company_name || '');
                const logoColor = getCompanyLogoColor(customer.name || customer.company_name || '');
                const contactCount = getContactCount(customer.id);
                const lastActivityDate = getLastActivityDate(customer.id);
                
                return (
                  <div 
                    key={customer.id}
                    className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_100px_80px_120px_40px] gap-3 px-6 py-4 items-center hover:bg-[var(--theme-bg-surface-subtle)] transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setView("detail");
                    }}
                  >
                    {/* Logo */}
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `${logoColor}15`,
                        color: logoColor,
                        border: `1px solid ${logoColor}30`
                      }}
                    >
                      {initials}
                    </div>

                    {/* Company Name & Owner */}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--neuron-ink-primary)] truncate">
                        {customer.name || customer.company_name}
                      </div>
                      <div className="text-[11px] text-[var(--neuron-ink-muted)] truncate">
                        {customer.type || "Prospect"}
                      </div>
                    </div>

                    {/* Industry */}
                    <div className="text-[13px] text-[var(--neuron-ink-secondary)] truncate">
                      {customer.industry || "—"}
                    </div>

                    {/* Status */}
                    <div>
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white"
                        style={{ backgroundColor: getStatusColor(customer.status) }}
                      >
                        {customer.status}
                      </span>
                    </div>

                    {/* Contacts */}
                    <div className="flex items-center gap-1.5 text-[13px] text-[var(--neuron-ink-secondary)]">
                      <UsersIcon size={14} className="text-[var(--neuron-ink-muted)]" />
                      {contactCount}
                    </div>

                    {/* Last Activity */}
                    <div className="text-[12px] text-[var(--neuron-ink-muted)] truncate">
                      {formatDate(lastActivityDate) === "—" ? "No activity" : formatDate(lastActivityDate)}
                    </div>

                    {/* Actions */}
                    <div className="relative flex justify-end">
                      <button 
                        className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)] opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === customer.id ? null : customer.id);
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openDropdownId === customer.id && (
                        <div 
                          ref={dropdownRef}
                          className="absolute right-0 top-full mt-1 w-48 bg-[var(--theme-bg-surface)] rounded-lg shadow-lg border border-[var(--theme-border-default)] py-1 z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] flex items-center gap-2"
                            onClick={() => handleDeleteCustomer(customer.id, customer.name || customer.company_name || "")}
                          >
                            <Trash2 size={14} />
                            Delete Customer
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

      {/* Add Customer Panel */}
      <AddCustomerPanel 
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSave={handleSaveCustomer}
      />
    </div>
  );
}