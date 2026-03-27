/**
 * ContractsList
 *
 * Filterable list of Contract Quotations.
 * 1:1 structural copy of ProjectsList.tsx — same layout, same styling,
 * same components — adapted for contract domain data.
 *
 * @see /docs/blueprints/CONTRACTS_MODULE_BLUEPRINT.md
 */

import { useState } from "react";
import type { QuotationNew } from "../../types/pricing";
import { NeuronStatusPill } from "../NeuronStatusPill";
import { Search, Handshake, CheckCircle, Package, Calendar, CircleDot, Ship, Truck, Shield, User, Clock, Briefcase, AlertCircle, Building2 } from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { SkeletonTable, SkeletonControlBar } from "../shared/NeuronSkeleton";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";
import { getNormalizedContractStatus } from "../../utils/quotationStatus";

interface ContractsListProps {
  contracts: QuotationNew[];
  onSelectContract: (contract: QuotationNew) => void;
  isLoading?: boolean;
  currentUser?: { 
    id?: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  department: "BD" | "Operations" | "Accounting";
  onRefresh?: () => Promise<void>;
}

export function ContractsList({ 
  contracts, 
  onSelectContract, 
  isLoading,
  currentUser,
  department,
  onRefresh,
}: ContractsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "expiring">("all");
  
  // Filters
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  // Grid template constant
  const GRID_COLS = "240px 200px 160px 100px 140px 100px";

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  const getDaysRemaining = (endDate?: string) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const uniqueOwners = Array.from(new Set(contracts.map(c => c.prepared_by).filter(Boolean)));
  const uniqueCustomers = Array.from(new Set(contracts.map(c => c.customer_name).filter(Boolean))).sort();

  // Derive contract_status for filtering
  const getContractStatus = (c: QuotationNew) => getNormalizedContractStatus(c) || "Draft";

  // Filter contracts based on active tab
  const getFilteredByTab = () => {
    let filtered = contracts;

    if (activeTab === "active") {
      return filtered.filter(c => getContractStatus(c) === "Active");
    }
    if (activeTab === "expiring") {
      return filtered.filter(c => getContractStatus(c) === "Expiring");
    }
    return filtered;
  };

  // Apply all filters
  const filteredContracts = getFilteredByTab().filter((contract) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        contract.quote_number?.toLowerCase().includes(query) ||
        contract.customer_name?.toLowerCase().includes(query) ||
        contract.quotation_name?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Time period filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      const contractDate = new Date(contract.created_at);
      if (contractDate < fromDate) return false;
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      const contractDate = new Date(contract.created_at);
      if (contractDate > toDate) return false;
    }
    
    // Status filter
    if (statusFilter !== "all" && getContractStatus(contract) !== statusFilter) return false;
    
    // Customer filter
    if (customerFilter !== "all" && contract.customer_name !== customerFilter) return false;
    
    // Owner filter
    if (ownerFilter !== "all" && contract.prepared_by !== ownerFilter) return false;
    
    return true;
  });

  // Calculate counts
  const allCount = contracts.length;
  const activeCount = contracts.filter(c => getContractStatus(c) === "Active").length;
  const expiringCount = contracts.filter(c => getContractStatus(c) === "Expiring").length;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "white" }}>
      <div style={{ padding: "32px 48px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ 
              fontSize: "32px", 
              fontWeight: 600, 
              color: "#12332B", 
              marginBottom: "4px",
              letterSpacing: "-1.2px"
            }}>
              Contracts
            </h1>
            <p style={{ 
              fontSize: "14px", 
              color: "#667085"
            }}>
              {department === "Accounting" 
                ? "Monitor contract revenue and billing across all active agreements"
                : department === "BD" 
                  ? "Manage annual rate agreements and contract quotations"
                  : "View assigned contracts and linked bookings"}
            </p>
          </div>
          {onRefresh && (
            <NeuronRefreshButton 
              onRefresh={onRefresh}
              label="Refresh contracts"
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
              color: "#667085",
            }}
          />
          <input
            type="text"
            placeholder="Search contracts by number, customer, or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 40px",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              color: "#12332B",
              backgroundColor: "#FFFFFF",
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
          {/* Time Period Filter */}
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>
          <span className="text-[13px] text-[#6B7280] font-medium px-2">to</span>
          <div style={{ minWidth: "140px" }}>
            <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2" />
          </div>

          {/* Customer Filter */}
          <div style={{ minWidth: "120px" }}>
            <CustomDropdown
              value={customerFilter}
              onChange={setCustomerFilter}
              options={[
                { value: "all", label: "All Customers", icon: <Building2 size={16} /> },
                ...uniqueCustomers.map(customer => ({ 
                  value: customer!, 
                  label: customer!, 
                  icon: <Building2 size={16} style={{ color: "#0F766E" }} /> 
                }))
              ]}
              placeholder="Select customer"
            />
          </div>

          {/* Contract Status Filter */}
          <div style={{ minWidth: "120px" }}>
            <CustomDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All Statuses", icon: <CircleDot size={16} /> },
                { value: "Active", label: "Active", icon: <CircleDot size={16} style={{ color: "#0F766E" }} /> },
                { value: "Expiring", label: "Expiring", icon: <AlertCircle size={16} style={{ color: "#D97706" }} /> },
                { value: "Expired", label: "Expired", icon: <CircleDot size={16} style={{ color: "#6B7280" }} /> },
                { value: "Renewed", label: "Renewed", icon: <CheckCircle size={16} style={{ color: "#7C3AED" }} /> },
                { value: "Draft", label: "Draft", icon: <CircleDot size={16} style={{ color: "#6B7280" }} /> }
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
                  value: owner!, 
                  label: owner!, 
                  icon: <User size={16} style={{ color: "#0F766E" }} /> 
                }))
              ]}
              placeholder="Select owner"
            />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "8px", 
          borderBottom: "1px solid #E5E7EB",
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
              borderBottom: activeTab === "all" ? "2px solid #0F766E" : "2px solid transparent",
              color: activeTab === "all" ? "#0F766E" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <Handshake size={18} />
            All Contracts
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "all" ? "#0F766E" : "#0F766E15",
                color: activeTab === "all" ? "#FFFFFF" : "#0F766E",
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
              borderBottom: activeTab === "active" ? "2px solid #F59E0B" : "2px solid transparent",
              color: activeTab === "active" ? "#F59E0B" : "#667085",
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
                background: activeTab === "active" ? "#F59E0B" : "#F59E0B15",
                color: activeTab === "active" ? "#FFFFFF" : "#F59E0B",
                minWidth: "20px",
                textAlign: "center"
              }}
            >
              {activeCount}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab("expiring")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "expiring" ? "2px solid #EF4444" : "2px solid transparent",
              color: activeTab === "expiring" ? "#EF4444" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginBottom: "-1px"
            }}
          >
            <AlertCircle size={18} />
            Expiring
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                background: activeTab === "expiring" ? "#EF4444" : "#EF444415",
                color: activeTab === "expiring" ? "#FFFFFF" : "#EF4444",
                minWidth: "20px",
                textAlign: "center"
              }}
            >
              {expiringCount}
            </span>
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="mt-2">
            <SkeletonTable rows={10} cols={6} />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div style={{ 
            padding: "64px", 
            textAlign: "center", 
            maxWidth: "600px", 
            margin: "0 auto"
          }}>
            <div className="text-center py-12">
              <Handshake size={48} style={{ color: "#D1D5DB", margin: "0 auto 16px" }} />
              <p className="text-[14px]" style={{ color: "#667085" }}>
                {contracts.length === 0 ? "No Contracts Yet" : "No contracts match your filters"}
              </p>
            </div>
          </div>
        ) : (
          <div style={{ 
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: "12px",
            overflow: "hidden"
          }}>
            {/* Table Header */}
            <div 
              className="grid gap-4 px-6 py-4"
              style={{ 
                gridTemplateColumns: GRID_COLS,
                borderBottom: "1px solid #E5E7EB",
                background: "#F9FAFB"
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                CONTRACT
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                CUSTOMER
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                SERVICES
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                VALIDITY
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                VALID UNTIL
              </div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>
                STATUS
              </div>
            </div>

            {/* Table Body */}
            {filteredContracts.map((contract, index) => {
              const contractStatus = getContractStatus(contract);
              const daysRemaining = getDaysRemaining(contract.contract_validity_end);
              
              return (
                <div
                  key={contract.id}
                  className="grid gap-4 px-6 py-4 transition-colors cursor-pointer"
                  style={{ 
                    gridTemplateColumns: GRID_COLS,
                    borderBottom: index < filteredContracts.length - 1 ? "1px solid #E5E7EB" : "none",
                  }}
                  onClick={() => onSelectContract(contract)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#F9FAFB";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {/* CONTRACT — icon + name + number */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                    <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        backgroundColor: "#F0FDF9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: "1px solid #CCFBF1"
                    }}>
                        <Handshake size={16} color="#0F766E" />
                    </div>
                    
                    <div style={{ overflow: "hidden", width: "100%" }}>
                      <div style={{ 
                        fontSize: "13px", 
                        fontWeight: 600, 
                        color: "#12332B",
                        marginBottom: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {contract.quotation_name || (contract.customer_name ? `${contract.customer_name} Contract` : null) || contract.quote_number || 'Untitled Contract'}
                      </div>
                      <div style={{
                        fontSize: "12px",
                        color: "#6B7280",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>
                        {contract.quote_number || contract.id?.slice(0, 12)}
                      </div>
                    </div>
                  </div>
                  
                  {/* CUSTOMER */}
                  <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
                    <div style={{ 
                      fontSize: "13px", 
                      color: "#12332B",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {contract.customer_name}
                    </div>
                  </div>

                  {/* SERVICES */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                    {(contract.services || []).map(service => {
                      const getIcon = () => {
                        if (service === "Brokerage") return <Briefcase size={11} color="#0F766E" />;
                        if (service === "Forwarding") return <Ship size={11} color="#0F766E" />;
                        if (service === "Trucking") return <Truck size={11} color="#0F766E" />;
                        if (service === "Marine Insurance") return <Shield size={11} color="#0F766E" />;
                        return <Package size={11} color="#0F766E" />;
                      };
                      return (
                        <span key={service} style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          fontSize: "11px",
                          fontWeight: 500,
                          color: "#0F766E",
                          backgroundColor: "#E8F5F3",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}>
                          {getIcon()}
                          {service.length > 10 ? service.slice(0, 8) + ".." : service}
                        </span>
                      );
                    })}
                  </div>

                  {/* VALIDITY — days remaining */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    {daysRemaining !== null ? (
                      <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 10px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: daysRemaining <= 0 ? "#FEF2F2" : daysRemaining <= 30 ? "#FFF7ED" : "#ECFDF5",
                        color: daysRemaining <= 0 ? "#B91C1C" : daysRemaining <= 30 ? "#C2410C" : "#059669"
                      }}>
                        {daysRemaining <= 0 ? "Expired" : `${daysRemaining}d`}
                      </div>
                    ) : (
                      <span style={{ fontSize: "12px", color: "#6B7280" }}>—</span>
                    )}
                  </div>

                  {/* VALID UNTIL */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={12} color="#6B7280" />
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>
                      {formatDate(contract.contract_validity_end)}
                    </span>
                  </div>

                  {/* STATUS */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <NeuronStatusPill status={contractStatus} size="sm" />
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
