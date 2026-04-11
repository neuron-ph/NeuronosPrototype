import { useState } from "react";
import { Project } from "../../types/pricing";
import { NeuronStatusPill } from "../NeuronStatusPill";
import { Search, Briefcase, CheckCircle, Package, Calendar, CircleDot, User, TrendingUp, TrendingDown, DollarSign, AlertCircle, Building2 } from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { useProjectsFinancialsMap } from "../../hooks/useProjectsFinancialsMap";
import { SkeletonTable, SkeletonControlBar } from "../shared/NeuronSkeleton";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";

interface ProjectsListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  isLoading?: boolean;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  department: "BD" | "Operations" | "Accounting";
  onRefresh?: () => Promise<void>;
}

export function ProjectsList({ 
  projects, 
  onSelectProject, 
  isLoading,
  currentUser,
  department,
  onRefresh,
}: ProjectsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("all");
  
  // Filters
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [marginFilter, setMarginFilter] = useState<string>("all");
  const [profitFilter, setProfitFilter] = useState<string>("all");

  // Fetch actual financials (now using strict accounting logic)
  const { financialsMap, isLoading: isLoadingFinancials } = useProjectsFinancialsMap(projects);

  // Grid template constant
  const GRID_COLS = "240px 200px 120px 120px 120px 100px 100px";

  const formatCurrency = (amount: number, currency: string = "PHP") => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const uniqueOwners = Array.from(new Set(projects.map(p => p.bd_owner_user_name).filter(Boolean)));
  const uniqueCustomers = Array.from(new Set(projects.map(p => p.customer_name).filter(Boolean))).sort();

  // Filter projects based on active tab
  const getFilteredByTab = () => {
    let filtered = projects;

    if (activeTab === "active") {
      return filtered.filter(p => p.status === "Active");
    }
    if (activeTab === "completed") {
      return filtered.filter(p => p.status === "Completed");
    }
    return filtered;
  };

  // Apply all filters
  const filteredProjects = getFilteredByTab().filter((project) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        project.project_number.toLowerCase().includes(query) ||
        project.customer_name.toLowerCase().includes(query) ||
        project.quotation_number?.toLowerCase().includes(query) ||
        project.quotation_name?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Time period filter (date range)
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      const projectDate = new Date(project.created_at);
      if (projectDate < fromDate) return false;
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      const projectDate = new Date(project.created_at);
      if (projectDate > toDate) return false;
    }
    
    // Financial Data for filtering
    const stats = financialsMap[project.project_number] || { income: 0, costs: 0, grossProfit: 0, margin: 0 };

    // Customer filter
    if (customerFilter !== "all" && project.customer_name !== customerFilter) return false;

    if (department === "Accounting") {
      // Margin Filter
      if (marginFilter !== "all") {
        if (marginFilter === "high" && (stats.margin ?? 0) < 20) return false;
        if (marginFilter === "low" && ((stats.margin ?? 0) >= 20 || (stats.margin ?? 0) < 0)) return false;
        if (marginFilter === "loss" && (stats.margin ?? 0) >= 0) return false;
      }

      // Profit Filter
      if (profitFilter !== "all") {
         if (profitFilter === "profitable" && stats.grossProfit <= 0) return false;
         if (profitFilter === "loss" && stats.grossProfit >= 0) return false;
      }
    } else {
      // BD/Ops Filters
      
      // Status filter
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      
      // Owner filter
      if (ownerFilter !== "all" && project.bd_owner_user_name !== ownerFilter) return false;
    }
    
    return true;
  });

  // Calculate counts
  const allCount = projects.length;
  const activeCount = projects.filter(p => p.status === "Active").length;
  const completedCount = projects.filter(p => p.status === "Completed").length;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--theme-bg-surface)" }}>
      <div style={{ padding: "32px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ 
              fontSize: "32px", 
              fontWeight: 600, 
              color: "var(--theme-text-primary)", 
              marginBottom: "4px",
              letterSpacing: "-1.2px"
            }}>
              Projects
            </h1>
            <p style={{ 
              fontSize: "14px", 
              color: "var(--theme-text-muted)"
            }}>
              {department === "Accounting" 
                ? "Monitor revenue, costs, and margins across all active shipments"
                : department === "BD" 
                  ? "Manage approved quotations and project execution"
                  : "View assigned projects and bookings"}
            </p>
          </div>
          {onRefresh && (
            <NeuronRefreshButton 
              onRefresh={onRefresh}
              label="Refresh projects"
            />
          )}
        </div>

        {/* Search Bar */}
        <div style={{ position: "relative", marginBottom: "12px" }}>
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
            placeholder={department === "Accounting" ? "Search projects by number, name, or customer..." : "Search projects by number, customer, or quotation..."}
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

        {/* Filters Row */}
        <div style={{ 
          display: "flex",
          gap: "4px",
          marginBottom: "16px",
          alignItems: "center",
          flexWrap: "wrap"
        }}>
          {/* Common: Time Period Filter */}
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>
          <span className="text-[13px] text-[var(--theme-text-muted)] font-medium px-2">to</span>
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>

          {/* Customer Filter - Common to all departments */}
          <div style={{ minWidth: "120px" }}>
            <CustomDropdown
              value={customerFilter}
              onChange={setCustomerFilter}
              options={[
                { value: "all", label: "All Customers", icon: <Building2 size={16} /> },
                ...uniqueCustomers.map(customer => ({ 
                  value: customer, 
                  label: customer, 
                  icon: <Building2 size={16} style={{ color: "var(--theme-action-primary-bg)" }} /> 
                }))
              ]}
              placeholder="Select customer"
            />
          </div>

          {department === "Accounting" ? (
            <>
              {/* Margin Filter */}
              <div style={{ minWidth: "150px" }}>
                <CustomDropdown
                  value={marginFilter}
                  onChange={setMarginFilter}
                  options={[
                    { value: "all", label: "All Margins", icon: <TrendingUp size={16} /> },
                    { value: "high", label: "High Margin (>20%)", icon: <TrendingUp size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                    { value: "low", label: "Low Margin (<20%)", icon: <TrendingDown size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                    { value: "loss", label: "Loss Making (<0%)", icon: <AlertCircle size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> }
                  ]}
                  placeholder="Filter by margin"
                />
              </div>

              {/* Profit Status Filter */}
              <div style={{ minWidth: "140px" }}>
                <CustomDropdown
                  value={profitFilter}
                  onChange={setProfitFilter}
                  options={[
                    { value: "all", label: "All Status", icon: <DollarSign size={16} /> },
                    { value: "profitable", label: "Profitable", icon: <CheckCircle size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                    { value: "loss", label: "Loss", icon: <AlertCircle size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> }
                  ]}
                  placeholder="Profit status"
                />
              </div>
            </>
          ) : (
            <>
              {/* BD/Ops Filters */}
              
              {/* Status Filter */}
              <div style={{ minWidth: "120px" }}>
                <CustomDropdown
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "All Statuses", icon: <CircleDot size={16} /> },
                    { value: "Active", label: "Active", icon: <CircleDot size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                    { value: "Completed", label: "Completed", icon: <CheckCircle size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                    { value: "On Hold", label: "On Hold", icon: <CircleDot size={16} style={{ color: "var(--theme-text-muted)" }} /> },
                    { value: "Cancelled", label: "Cancelled", icon: <CircleDot size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> }
                  ]}
                  placeholder="Select status"
                />
              </div>

              {/* Owner Filter */}
              <div style={{ minWidth: "120px" }}>
                <CustomDropdown
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={[
                    { value: "all", label: "All Owners", icon: <User size={16} /> },
                    ...uniqueOwners.map(owner => ({
                      value: owner || "",
                      label: owner || "",
                      icon: <User size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                    }))
                  ]}
                  placeholder="Select owner"
                />
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "8px", 
          borderBottom: "1px solid var(--theme-border-default)",
          marginBottom: "24px"
        }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "all" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              color: activeTab === "all" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <Briefcase size={18} />
            All Projects
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "all" ? "var(--theme-action-primary-bg)" : "var(--theme-action-primary-bg-15, rgba(15,118,110,0.08))",
                color: activeTab === "all" ? "#FFFFFF" : "var(--theme-action-primary-bg)",
                minWidth: "20px",
                textAlign: "center"
              }}
            >
              {allCount}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab("active")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "active" ? "2px solid var(--theme-status-warning-fg)" : "2px solid transparent",
              color: activeTab === "active" ? "var(--theme-status-warning-fg)" : "var(--theme-text-muted)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <Package size={18} />
            Active
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "active" ? "var(--theme-status-warning-fg)" : "rgba(245,158,11,0.08)",
                color: activeTab === "active" ? "#FFFFFF" : "var(--theme-status-warning-fg)",
                minWidth: "20px",
                textAlign: "center"
              }}
            >
              {activeCount}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab("completed")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "completed" ? "2px solid var(--theme-status-success-fg)" : "2px solid transparent",
              color: activeTab === "completed" ? "var(--theme-status-success-fg)" : "var(--theme-text-muted)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <CheckCircle size={18} />
            Completed
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "completed" ? "var(--theme-status-success-fg)" : "rgba(16,185,129,0.08)",
                color: activeTab === "completed" ? "#FFFFFF" : "var(--theme-status-success-fg)",
                minWidth: "20px",
                textAlign: "center"
              }}
            >
              {completedCount}
            </span>
          </button>
        </div>

        {/* Table */}
        {isLoading || isLoadingFinancials ? (
          <div className="mt-2">
            <SkeletonTable rows={10} cols={7} />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div style={{ 
            padding: "64px", 
            textAlign: "center", 
            maxWidth: "600px", 
            margin: "0 auto"
          }}>
            <div className="text-center py-12">
              <Package size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
              <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>
                {projects.length === 0 ? "No Projects Yet" : "No projects match your filters"}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ 
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "12px",
            overflow: "hidden"
          }}>
            {/* Table Header */}
            <div 
              className="grid gap-4 px-6 py-4"
              style={{ 
                gridTemplateColumns: GRID_COLS,
                borderBottom: "1px solid var(--theme-border-default)",
                background: "transparent"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                PROJECT
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                CUSTOMER
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                INCOME
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                COSTS
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                GROSS PROFIT
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                MARGIN
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>
                STATUS
              </div>
            </div>

            {/* Table Body */}
            {filteredProjects.map((project, index) => {
              const stats = financialsMap[project.project_number] || { income: 0, costs: 0, grossProfit: 0, margin: 0 };
              
              return (
                <div
                  key={project.id}
                  className="grid gap-4 px-6 py-4 transition-colors cursor-pointer"
                  style={{ 
                    gridTemplateColumns: GRID_COLS,
                    borderBottom: index < filteredProjects.length - 1 ? "1px solid var(--theme-border-default)" : "none",
                  }}
                  onClick={() => onSelectProject(project)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                    <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: "1px solid var(--theme-status-success-border)"
                    }}>
                        <Briefcase size={16} color="var(--theme-action-primary-bg)" />
                    </div>
                    
                    <div style={{ overflow: "hidden", width: "100%" }}>
                      <div style={{ 
                        fontSize: "13px", 
                        fontWeight: 600, 
                        color: "var(--theme-text-primary)",
                        marginBottom: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {project.quotation_name || project.project_number}
                      </div>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "var(--theme-text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {project.project_number}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
                    <div style={{ 
                      fontSize: "13px", 
                      color: "var(--theme-text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {project.customer_name}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-status-success-fg)" }}>
                      {formatCurrency(stats.income)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-status-danger-fg)" }}>
                      {formatCurrency(stats.costs)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: stats.grossProfit >= 0 ? "var(--theme-text-primary)" : "var(--theme-status-danger-fg)" }}>
                      {formatCurrency(stats.grossProfit)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <div style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: (stats.margin ?? 0) >= 20 ? "var(--theme-status-success-bg)" : (stats.margin ?? 0) >= 0 ? "var(--theme-status-warning-bg)" : "var(--theme-status-danger-bg)",
                      color: (stats.margin ?? 0) >= 20 ? "var(--theme-status-success-fg)" : (stats.margin ?? 0) >= 0 ? "var(--theme-status-warning-fg)" : "var(--theme-status-danger-fg)"
                    }}>
                      {(stats.margin ?? 0).toFixed(1)}%
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <NeuronStatusPill status={project.status} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}