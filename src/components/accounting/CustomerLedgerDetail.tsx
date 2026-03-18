import { useState, useEffect } from "react";
import { 
  ArrowLeft, Building2, MapPin, Briefcase, Edit, Users, Calendar, MessageSquare, 
  Plus, Search, FileText, CreditCard, DollarSign, Activity, TrendingUp, Target, 
  ArrowUp, ArrowDown, Download, Filter, Layout, Receipt, Package, ArrowRight
} from "lucide-react";
import type { Customer, Industry, CustomerStatus } from "../../types/bd";
import { CustomDropdown } from "../bd/CustomDropdown";
import { UnifiedExpensesTab } from "./UnifiedExpensesTab";
import type { Expense as OperationsExpense } from "../../types/operations";
import { supabase } from "../../utils/supabase/client";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Cell
} from "recharts";

interface CustomerLedgerDetailProps {
  customer: Customer;
  onClose: () => void;
}

type TabType = "overview" | "projects" | "billings" | "collections" | "expenses";

export function CustomerLedgerDetail({ customer, onClose }: CustomerLedgerDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [billings, setBillings] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters for Tabs
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDateFilter, setProjectDateFilter] = useState("All Time");
  
  const [billingSearch, setBillingSearch] = useState("");
  const [billingDateFilter, setBillingDateFilter] = useState("All Time");
  
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionDateFilter, setCollectionDateFilter] = useState("All Time");
  
  // State for Customer Profile editing (read-only for now based on requirement to look like BD)
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchFinancials();
  }, [customer.id]);

  const fetchFinancials = async () => {
    try {
      setIsLoading(true);
      
      // Fetch Revenue (Billings) from billing_line_items
      const { data: billingsData, error: billingsError } = await supabase
        .from('billing_line_items')
        .select('*');
      
      // Fetch Collections
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('*')
        .eq('customer_id', customer.id);

      // Fetch Projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('customer_id', customer.id);

      // Fetch Expenses (evouchers with expense transaction_type + posted expenses)
      const { data: expensesData, error: expensesError } = await supabase
        .from('evouchers')
        .select('*')
        .eq('transaction_type', 'expense');
      
      if (!billingsError && billingsData) setBillings(billingsData);
      if (!collectionsError && collectionsData) setCollections(collectionsData);
      if (!projectsError && projectsData) setProjects(projectsData);
      if (!expensesError && expensesData) setExpenses(expensesData);
    } catch (error) {
      console.error("Error fetching financials:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculations for Overview
  const totalBilled = billings.reduce((sum, item) => sum + (Number(item.total_amount || item.amount) || 0), 0);
  const totalCollected = collections.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const outstandingBalance = totalBilled - totalCollected;
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  // Chart Data
  const chartData = [
    { name: "Total Billed", amount: totalBilled, fill: "#0F766E" },
    { name: "Collected", amount: totalCollected, fill: "#059669" },
    { name: "Outstanding", amount: outstandingBalance, fill: "#C05621" }
  ];

  // Helper functions for UI
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
    const colors = ['#0F766E', '#2B8A6E', '#237F66', '#1E6D59', '#C88A2B', '#6B7A76', '#C94F3D'];
    const index = companyName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getStatusColor = (status: CustomerStatus) => {
    switch (status) {
      case "Active": return "#0F766E";
      case "Prospect": return "#C88A2B";
      case "Inactive": return "#6B7A76";
      default: return "#6B7A76";
    }
  };

  const logoColor = getCompanyLogoColor(customer.name || customer.company_name || '');

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* 1. Header Section (Customer Profile Card style) */}
      <div className="border-b border-[#E5E9F0] bg-white px-12 py-6">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-[13px] transition-colors"
            style={{ color: "#0F766E" }}
          >
            <ArrowLeft size={16} />
            Back to Customers
          </button>
        </div>

        {/* Profile Card Content */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-6">
            {/* Logo */}
            <div 
              className="rounded-lg flex-shrink-0 flex items-center justify-center text-[24px] font-semibold"
              style={{
                width: "80px",
                height: "80px",
                backgroundColor: `${logoColor}15`,
                color: logoColor,
                border: `2px solid ${logoColor}30`
              }}
            >
              {getCompanyInitials(customer.name || customer.company_name || '')}
            </div>

            {/* Info Grid */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <h1 className="text-[24px] font-semibold text-[#12332B]">
                  {customer.name || customer.company_name}
                </h1>
                <span 
                  className="inline-flex items-center px-2.5 py-0.5 rounded text-[12px] font-medium text-white"
                  style={{ backgroundColor: getStatusColor(customer.status) }}
                >
                  {customer.status}
                </span>
              </div>

              <div className="flex items-start gap-12">
                {/* Column 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#667085]">
                    <Briefcase size={14} />
                    Industry
                  </div>
                  <div className="text-[13px] text-[#0A1D4D]">
                    {customer.industry || "—"}
                  </div>
                </div>

                {/* Column 2 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#667085]">
                    <MapPin size={14} />
                    Registered Address
                  </div>
                  <div className="text-[13px] text-[#0A1D4D] max-w-md truncate">
                    {customer.registered_address || "—"}
                  </div>
                </div>

                {/* Column 3 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#667085]">
                    <Building2 size={14} />
                    Lead Source
                  </div>
                  <div className="text-[13px] text-[#0A1D4D]">
                    {customer.lead_source || "—"}
                  </div>
                </div>

                {/* Column 4 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#667085]">
                    <Users size={14} />
                    Total Contacts
                  </div>
                  <div className="text-[13px] text-[#0A1D4D]">
                    {/* Placeholder for contact count if not passed, but usually available */}
                    —
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Action (Visual only) */}
          <button
            className="p-2 rounded-lg transition-colors flex-shrink-0 text-[#667085] hover:bg-[#F9FAFB]"
            title="Edit Customer"
          >
            <Edit size={18} />
          </button>
        </div>
      </div>

      {/* 2. Tabs Navigation */}
      <div className="px-12 border-b border-[#E5E9F0] bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4 py-4">
          {[
            { id: "overview", label: "Overview", icon: Layout },
            { id: "projects", label: "Projects", icon: Briefcase },
            { id: "billings", label: "Billings & Invoices", icon: FileText },
            { id: "collections", label: "Collections", icon: CreditCard },
            { id: "expenses", label: "Expenses", icon: Receipt },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                style={{
                  backgroundColor: isActive ? "#E8F5F3" : "transparent",
                  color: isActive ? "#0F766E" : "#6B7280",
                  border: isActive ? "1px solid #5FC4A1" : "1px solid transparent",
                  fontWeight: isActive ? 600 : 500
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Tab Content */}
      <div className="flex-1 overflow-auto bg-white px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-4 gap-4">
                {/* Total Billed */}
                <div className="p-5 rounded-xl border border-[1.5px] border-[var(--neuron-ui-border)] bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[#E8F5F3]">
                      <FileText size={18} style={{ color: "#0F766E" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--neuron-ink-muted)]">Total Billed</p>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl text-[var(--neuron-ink-primary)]">{formatCurrency(totalBilled)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#E8F5F3" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: "100%", backgroundColor: "#0F766E" }} />
                    </div>
                  </div>
                </div>

                {/* Total Collected */}
                <div className="p-5 rounded-xl border border-[1.5px] border-[var(--neuron-ui-border)] bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[#F0FDF4]">
                      <CreditCard size={18} style={{ color: "#15803D" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--neuron-ink-muted)]">Total Collected</p>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl text-[var(--neuron-ink-primary)]">{formatCurrency(totalCollected)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F0FDF4" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(collectionRate, 100)}%`, backgroundColor: "#15803D" }} />
                    </div>
                  </div>
                </div>

                {/* Outstanding Balance */}
                <div className="p-5 rounded-xl border border-[1.5px] border-[var(--neuron-ui-border)] bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[#FFF7ED]">
                      <DollarSign size={18} style={{ color: "#C05621" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--neuron-ink-muted)]">Outstanding Balance</p>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl text-[var(--neuron-ink-primary)]">{formatCurrency(outstandingBalance)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#FFF7ED" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${totalBilled > 0 ? Math.min((outstandingBalance / totalBilled) * 100, 100) : 0}%`, backgroundColor: "#C05621" }} />
                    </div>
                  </div>
                </div>

                {/* Collection Rate */}
                <div className="p-5 rounded-xl border border-[1.5px] border-[var(--neuron-ui-border)] bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[#EFF6FF]">
                      <Activity size={18} style={{ color: "#1D4ED8" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--neuron-ink-muted)]">Collection Rate</p>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl text-[var(--neuron-ink-primary)]">{collectionRate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#EFF6FF" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(collectionRate, 100)}%`, backgroundColor: "#1D4ED8" }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-8">
                {/* Financial Chart */}
                <div className="col-span-1 p-6 rounded-xl border border-[#E5E9F0] bg-white h-[400px]">
                  <h3 className="text-[16px] font-semibold text-[#12332B] mb-6">Financial Summary</h3>
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val/1000}k`} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E9F0', boxShadow: 'none' }}
                      />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={40}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Recent Ledger */}
                <div className="col-span-2 rounded-[10px] border border-[#E5E9F0] bg-white overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-[#E5E9F0] flex justify-between items-center">
                    <h3 className="text-[16px] font-semibold text-[#12332B]">Recent Transactions</h3>
                    <button className="text-[13px] font-medium text-[#0F766E] hover:underline">View All</button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full">
                      <thead className="bg-[#F8F9FB] border-b border-[#E5E9F0]">
                        <tr>
                          <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Date</th>
                          <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Type</th>
                          <th className="text-left px-6 py-3 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Reference</th>
                          <th className="text-right px-6 py-3 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E9F0]">
                        {[
                          ...billings.map(b => ({ ...b, type: "Invoice", date: b.invoice_date || b.created_at, ref: b.invoice_number, amount: Number(b.total_amount || b.amount) })),
                          ...collections.map(c => ({ ...c, type: "Collection", date: c.collection_date || c.created_at, ref: c.reference_number, amount: Number(c.amount) }))
                        ]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .slice(0, 10)
                        .map((item, idx) => (
                          <tr key={idx} className="hover:bg-[#F9FAFB]">
                            <td className="px-6 py-3 text-[13px] text-[#0A1D4D]">{formatDate(item.date)}</td>
                            <td className="px-6 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                                item.type === "Invoice" ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"
                              }`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-[13px] text-[#0A1D4D] font-medium">{item.ref}</td>
                            <td className="px-6 py-3 text-[13px] text-right font-medium text-[#0A1D4D]">
                              {item.type === "Collection" ? "-" : ""}{formatCurrency(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* PROJECTS TAB */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              {/* Filters */}
               <div className="flex items-center gap-4">
                 <div className="flex-1 relative">
                   <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
                   <input 
                     type="text" 
                     placeholder="Search projects..." 
                     value={projectSearch}
                     onChange={(e) => setProjectSearch(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 border border-[#E5E9F0] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all bg-white"
                   />
                 </div>
                 <div style={{ minWidth: "160px" }}>
                   <CustomDropdown
                     value={projectDateFilter}
                     onChange={setProjectDateFilter}
                     options={[
                       { value: "All Time", label: "All Time", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Month", label: "This Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "Last Month", label: "Last Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Year", label: "This Year", icon: <Calendar size={14} className="text-[#667085]" /> }
                     ]}
                     placeholder="Date Range"
                   />
                 </div>
              </div>
              
              {/* Table Card */}
              <div className="rounded-[10px] border border-[#E5E9F0] bg-white overflow-hidden">
                <table className="w-full">
                  <thead className="bg-white border-b border-[#E5E9F0]">
                    <tr>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.05em] w-[35%]">Project Name</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.05em]">Movement</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.05em]">Route</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.05em]">Status</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.05em]">Booking Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E9F0]">
                    {projects.length > 0 ? projects.map((project) => (
                      <tr key={project.id} className="hover:bg-[#F9FAFB] transition-colors group">
                        {/* Project Name */}
                        <td className="px-6 py-5">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-[#0F766E]">
                              <Package size={20} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[13px] font-semibold text-[#12332B] group-hover:text-[#0F766E] transition-colors">
                                {project.project_name || project.quotation_name || "Untitled Project"}
                              </span>
                              <span className="text-[11px] text-[#667085]">
                                {project.project_number}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Movement */}
                        <td className="px-6 py-5">
                          <span className="inline-flex px-2.5 py-1 rounded text-[11px] font-semibold bg-[#E8F5F3] text-[#0F766E] uppercase tracking-wide">
                            IMPORT
                          </span>
                        </td>

                        {/* Route */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 text-[13px] text-[#667085]">
                            <span>—</span>
                            <ArrowRight size={14} className="text-[#9CA3AF]" />
                            <span>—</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium ${
                            project.status === 'Completed' ? 'bg-gray-100 text-gray-700' : 'bg-[#F0FDF4] text-[#15803D]'
                          }`}>
                            {project.status || "Active"}
                          </span>
                        </td>

                        {/* Booking Status */}
                        <td className="px-6 py-5 text-[13px] text-[#667085]">
                          Not Booked
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-[#667085] text-[13px]">No projects found for this client.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BILLINGS TAB */}
          {activeTab === "billings" && (
             <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                   <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
                   <input 
                     type="text" 
                     placeholder="Search invoices..." 
                     value={billingSearch}
                     onChange={(e) => setBillingSearch(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 border border-[#E5E9F0] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all bg-white"
                   />
                </div>
                <div style={{ minWidth: "160px" }}>
                   <CustomDropdown
                     value={billingDateFilter}
                     onChange={setBillingDateFilter}
                     options={[
                       { value: "All Time", label: "All Time", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Month", label: "This Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "Last Month", label: "Last Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Year", label: "This Year", icon: <Calendar size={14} className="text-[#667085]" /> }
                     ]}
                     placeholder="Date Range"
                   />
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E5E9F0] text-[#344054] rounded-lg text-[13px] font-medium hover:bg-[#F9FAFB] transition-colors h-[42px]">
                  <Download size={16} /> Export
                </button>
              </div>

              {/* Table Card */}
              <div className="rounded-[10px] border border-[#E5E9F0] bg-white overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#F8F9FB] border-b border-[#E5E9F0]">
                    <tr>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Invoice #</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Date</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Description</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Status</th>
                      <th className="text-right px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E9F0]">
                    {billings.length > 0 ? billings.map((inv) => {
                       const statusColor = inv.status === 'Paid' ? '#0F766E' : '#C05621';
                       const statusBg = inv.status === 'Paid' ? '#E8F5F3' : '#FFF7ED';
                       return (
                        <tr key={inv.id} className="hover:bg-[#F9FAFB] transition-colors">
                          <td className="px-6 py-4 text-[13px] text-[#0F766E] font-medium">{inv.invoice_number || inv.evoucher_number}</td>
                          <td className="px-6 py-4 text-[13px] text-[#344054]">{formatDate(inv.invoice_date || inv.created_at)}</td>
                          <td className="px-6 py-4 text-[13px] text-[#0A1D4D]">{inv.description || "General Services"}</td>
                          <td className="px-6 py-4">
                            <span 
                              className="inline-flex px-2 py-1 rounded text-[11px] font-semibold"
                              style={{ backgroundColor: statusBg, color: statusColor }}
                            >
                              {inv.status || "Pending"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-right font-medium text-[#0A1D4D]">
                            {formatCurrency(inv.total_amount || inv.amount || 0)}
                          </td>
                        </tr>
                      );
                    }) : (
                       <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-[#667085] text-[13px]">No billings found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* COLLECTIONS TAB */}
          {activeTab === "collections" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                   <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
                   <input 
                     type="text" 
                     placeholder="Search collections..." 
                     value={collectionSearch}
                     onChange={(e) => setCollectionSearch(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 border border-[#E5E9F0] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-all bg-white"
                   />
                </div>
                <div style={{ minWidth: "160px" }}>
                   <CustomDropdown
                     value={collectionDateFilter}
                     onChange={setCollectionDateFilter}
                     options={[
                       { value: "All Time", label: "All Time", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Month", label: "This Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "Last Month", label: "Last Month", icon: <Calendar size={14} className="text-[#667085]" /> },
                       { value: "This Year", label: "This Year", icon: <Calendar size={14} className="text-[#667085]" /> }
                     ]}
                     placeholder="Date Range"
                   />
                </div>
                <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E5E9F0] text-[#344054] rounded-lg text-[13px] font-medium hover:bg-[#F9FAFB] transition-colors h-[42px]">
                  <Filter size={16} /> Filter
                </button>
              </div>

              {/* Table Card */}
              <div className="rounded-[10px] border border-[#E5E9F0] bg-white overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#F8F9FB] border-b border-[#E5E9F0]">
                    <tr>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Reference #</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Payment Date</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Method</th>
                      <th className="text-left px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Account</th>
                      <th className="text-right px-6 py-4 text-[11px] font-semibold text-[#667085] uppercase tracking-[0.002em]">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E9F0]">
                    {collections.length > 0 ? collections.map((col) => (
                      <tr key={col.id} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="px-6 py-4 text-[13px] text-[#0F766E] font-medium">{col.reference_number || col.evoucher_number}</td>
                        <td className="px-6 py-4 text-[13px] text-[#344054]">{formatDate(col.collection_date || col.created_at)}</td>
                        <td className="px-6 py-4 text-[13px] text-[#0A1D4D]">{col.payment_method || "Check"}</td>
                        <td className="px-6 py-4 text-[13px] text-[#0A1D4D]">{col.deposit_account || "Main Ops"}</td>
                        <td className="px-6 py-4 text-[13px] text-right font-medium text-[#15803D]">
                          {formatCurrency(col.amount || 0)}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-[#667085] text-[13px]">No collections found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EXPENSES TAB */}
          {activeTab === "expenses" && (
            <UnifiedExpensesTab 
              expenses={expenses.map((exp) => ({
                expenseId: exp.id,
                id: exp.id,
                expenseName: exp.evoucher_number || exp.id,
                expenseCategory: exp.category || "General",
                amount: Number(exp.amount || 0),
                currency: exp.currency || "PHP",
                expenseDate: exp.date || exp.created_at,
                vendorName: exp.vendor || exp.payee_name || "—",
                description: exp.description || exp.notes || "",
                status: (exp.status || "posted").toLowerCase(),
                bookingId: exp.booking_id || "—",
                projectNumber: exp.project_number || undefined,
                bookingType: "Customer",
                createdBy: exp.created_by || "System",
                createdAt: exp.created_at,
                lineItems: []
              } as OperationsExpense))}
              isLoading={isLoading}
              showHeader={false}
              context="customer"
            />
          )}
          
        </div>
      </div>
    </div>
  );
}
