import { Search, Plus, Globe, Award, ChevronDown, ChevronRight, Plane, Ship, Loader2, User, Phone, Mail } from "lucide-react";
import { useState, useMemo } from "react";
import { 
  COUNTRIES, 
  isExpired, 
  expiresSoon,
  getDaysUntilExpiry,
  type NetworkPartner,
} from "../../data/networkPartners";
import { PartnerSheet } from "./partners/PartnerSheet";
import { useNetworkPartners } from "../../hooks/useNetworkPartners";
import React from "react";

type StatusFilter = "all" | "active" | "expiring" | "expired" | "wca";
type Tab = "international" | "co-loader" | "all-in";

// Get service icon component
const getServiceIcon = (service: string) => {
  const serviceLower = service.toLowerCase();
  if (serviceLower.includes("ocean")) {
    return <Ship size={13} color="var(--theme-text-muted)" />;
  }
  if (serviceLower.includes("air")) {
    return <Plane size={13} color="var(--theme-text-muted)" />;
  }
  // Fallback to first letter for other services
  return <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", fontWeight: 600 }} title={service}>{service.charAt(0).toUpperCase()}</span>;
};

// Group partners by country
const groupPartnersByCountry = (partners: NetworkPartner[]) => {
  const grouped = partners.reduce((acc, partner) => {
    if (!acc[partner.country]) {
      acc[partner.country] = [];
    }
    acc[partner.country].push(partner);
    return acc;
  }, {} as Record<string, NetworkPartner[]>);

  // Sort countries by partner count (descending)
  return Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
};

interface NetworkPartnersModuleProps {
  onViewVendor?: (vendorId: string) => void;
  // Optional props to allow parent control (Lifting State Up)
  partners?: NetworkPartner[];
  isLoading?: boolean;
  onSavePartner?: (partner: Partial<NetworkPartner>) => Promise<any>;
}

export function NetworkPartnersModule({ 
  onViewVendor, 
  partners: propPartners, 
  isLoading: propIsLoading,
  onSavePartner: propOnSavePartner 
}: NetworkPartnersModuleProps) {
  // Use hook if props are not provided
  const hookData = useNetworkPartners();
  
  // Determine source of truth
  const partners = propPartners || hookData.partners;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hookData.isLoading;
  const savePartner = propOnSavePartner || hookData.savePartner;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTab, setActiveTab] = useState<Tab>("international");
  const [isPartnerSheetOpen, setIsPartnerSheetOpen] = useState(false);
  
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set());

  // Calculate stats dynamically
  const stats = useMemo(() => {
    const expired = partners.filter(p => p.expires && isExpired(p.expires)).length;
    const expiringSoonCount = partners.filter(p => p.expires && expiresSoon(p.expires) && !isExpired(p.expires)).length;
    const wcaConference = partners.filter(p => p.is_wca_conference).length;
    const active = partners.filter(p => !p.expires || (!isExpired(p.expires) && !expiresSoon(p.expires))).length;
    
    return {
      total: partners.length,
      expired,
      expiringSoon: expiringSoonCount,
      wcaConference,
      active
    };
  }, [partners]);

  // Calculate counts for each tab
  const tabCounts = useMemo(() => ({
    international: partners.filter(p => !p.partner_type || p.partner_type === "international").length,
    "co-loader": partners.filter(p => p.partner_type === "co-loader").length,
    "all-in": partners.filter(p => p.partner_type === "all-in").length
  }), [partners]);

  // Toggle country collapse
  const toggleCountry = (country: string) => {
    const newCollapsed = new Set(collapsedCountries);
    if (newCollapsed.has(country)) {
      newCollapsed.delete(country);
    } else {
      newCollapsed.add(country);
    }
    setCollapsedCountries(newCollapsed);
  };

  // Filter partners
  const filteredPartners = useMemo(() => {
    return partners.filter(partner => {
      // 1. Tab Filter (Primary)
      const isInternational = !partner.partner_type || partner.partner_type === "international";
      if (activeTab === "international" && !isInternational) return false;
      if (activeTab === "co-loader" && partner.partner_type !== "co-loader") return false;
      if (activeTab === "all-in" && partner.partner_type !== "all-in") return false;

      // 2. Search Filter
      const matchesSearch = 
        partner.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (partner.contact_person && partner.contact_person.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (partner.wca_id && partner.wca_id.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // 3. Country Filter
      const matchesCountry = countryFilter === "All" || partner.country === countryFilter;

      // 4. Status Filter
      let matchesStatus = true;
      if (statusFilter === "expired" && partner.expires) {
        matchesStatus = isExpired(partner.expires);
      } else if (statusFilter === "expiring" && partner.expires) {
        matchesStatus = expiresSoon(partner.expires) && !isExpired(partner.expires);
      } else if (statusFilter === "active") {
        matchesStatus = !partner.expires || (!isExpired(partner.expires) && !expiresSoon(partner.expires));
      } else if (statusFilter === "wca") {
        matchesStatus = partner.is_wca_conference;
      }

      return matchesSearch && matchesCountry && matchesStatus;
    });
  }, [partners, activeTab, searchQuery, countryFilter, statusFilter]);

  // Group filtered partners by country
  const groupedPartners = useMemo(() => groupPartnersByCountry(filteredPartners), [filteredPartners]);

  const getStatusColor = (partner: NetworkPartner): string => {
    if (!partner.expires) return "#9CA3AF"; // gray
    if (isExpired(partner.expires)) return "#DC2626"; // red
    if (expiresSoon(partner.expires)) return "#D97706"; // amber
    return "#059669"; // green
  };

  const getStatusLabel = (partner: NetworkPartner): string => {
    if (!partner.expires) return "No expiry";
    if (isExpired(partner.expires)) return "EXPIRED";
    if (expiresSoon(partner.expires)) {
      const days = getDaysUntilExpiry(partner.expires);
      return `${days}d left`;
    }
    return "Active";
  };

  // Format date compactly
  const formatCompactDate = (dateStr: string): string => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  const handleSavePartner = async (data: Partial<NetworkPartner>) => {
    console.log("Saving new partner:", data);
    try {
      await savePartner(data);
      setIsPartnerSheetOpen(false);
    } catch (error) {
      console.error("Failed to save partner", error);
      // Ideally show a toast here
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--theme-bg-surface)]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--theme-action-primary-bg)]" />
          <p className="text-sm text-[var(--theme-text-muted)]">Loading partners...</p>
        </div>
      </div>
    );
  }

  // Define column widths for consistency
  const colWidths = (
    <colgroup>
      <col style={{ width: "40px" }} />
      <col style={{ width: "auto" }} />
      <col style={{ width: "140px" }} />
      <col style={{ width: "100px" }} />
      <col style={{ width: "160px" }} />
      <col style={{ width: "100px" }} />
      <col style={{ width: "100px" }} />
    </colgroup>
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        backgroundColor: "var(--theme-bg-surface)",
        position: "relative",
      }}
    >
      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header Section */}
        <div style={{ flexShrink: 0 }}>
          {/* Title Row */}
          <div
            style={{
              padding: "32px 48px 24px 48px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "32px",
                  fontWeight: 600,
                  color: "var(--theme-text-primary)",
                  marginBottom: "4px",
                  letterSpacing: "-1.2px",
                }}
              >
                Network Partners
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--theme-text-muted)",
                  margin: 0,
                }}
              >
                {stats.total} active agents across {COUNTRIES.length} countries
              </p>
            </div>

            <button
              onClick={() => setIsPartnerSheetOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "48px",
                padding: "0 24px",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "none",
                borderRadius: "16px",
                fontSize: "14px",
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0F544A";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
              }}
            >
              <Plus size={16} />
              Add Partner
            </button>
          </div>

          {/* Filters Row */}
          <div 
            style={{ 
              padding: "0 48px 24px 48px", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center" 
            }}
          >
            {/* Stats Pills - Left Side */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setStatusFilter("all")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusFilter === "all" ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                  color: statusFilter === "all" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                  border: statusFilter === "all" ? "2px solid var(--theme-action-primary-bg)" : "1px solid var(--neuron-pill-inactive-border)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                All • {stats.total}
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusFilter === "active" ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                  color: statusFilter === "active" ? "var(--theme-status-success-fg)" : "var(--neuron-pill-inactive-text)",
                  border: statusFilter === "active" ? "2px solid var(--theme-status-success-fg)" : "1px solid var(--neuron-pill-inactive-border)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                Active • {stats.active}
              </button>
              <button
                onClick={() => setStatusFilter("expiring")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusFilter === "expiring" ? "var(--theme-status-warning-bg)" : "var(--neuron-pill-inactive-bg)",
                  color: statusFilter === "expiring" ? "var(--theme-status-warning-fg)" : "var(--neuron-pill-inactive-text)",
                  border: statusFilter === "expiring" ? "2px solid var(--theme-status-warning-fg)" : "1px solid var(--neuron-pill-inactive-border)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                Expiring • {stats.expiringSoon}
              </button>
              <button
                onClick={() => setStatusFilter("expired")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusFilter === "expired" ? "var(--theme-status-danger-bg)" : "var(--neuron-pill-inactive-bg)",
                  color: statusFilter === "expired" ? "var(--theme-status-danger-fg)" : "var(--neuron-pill-inactive-text)",
                  border: statusFilter === "expired" ? "2px solid var(--theme-status-danger-fg)" : "1px solid var(--neuron-pill-inactive-border)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                Expired • {stats.expired}
              </button>
              <button
                onClick={() => setStatusFilter("wca")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusFilter === "wca" ? "var(--neuron-status-accent-bg)" : "var(--neuron-pill-inactive-bg)",
                  color: statusFilter === "wca" ? "var(--neuron-status-accent-fg)" : "var(--neuron-pill-inactive-text)",
                  border: statusFilter === "wca" ? "2px solid var(--neuron-status-accent-fg)" : "1px solid var(--neuron-pill-inactive-border)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Award size={12} />
                WCA • {stats.wcaConference}
              </button>
            </div>

            {/* Search and Filters - Right Side */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--neuron-ink-muted)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "240px",
                    padding: "8px 10px 8px 34px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                    e.currentTarget.style.boxShadow = "0 0 0 1px #0F766E";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>

              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                style={{
                  padding: "8px 32px 8px 12px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "var(--neuron-ink-secondary)",
                  backgroundColor: "var(--theme-bg-surface)",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  minWidth: "160px",
                }}
              >
                <option value="All">All Countries</option>
                {COUNTRIES.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabs Row */}
          <div style={{ padding: "0 48px", display: "flex", gap: "32px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
            <button
              onClick={() => setActiveTab("international")}
              style={{
                padding: "0 0 16px 0",
                fontSize: "14px",
                fontWeight: 600,
                color: activeTab === "international" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                borderBottom: activeTab === "international" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s"
              }}
            >
              International Partners
              <span style={{
                backgroundColor: activeTab === "international" ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                color: activeTab === "international" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                fontSize: "12px", 
                padding: "2px 8px", 
                borderRadius: "12px" 
              }}>
                {tabCounts.international}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("co-loader")}
              style={{
                padding: "0 0 16px 0",
                fontSize: "14px",
                fontWeight: 600,
                color: activeTab === "co-loader" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                borderBottom: activeTab === "co-loader" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s"
              }}
            >
              Co-Loader Partners
              <span style={{
                backgroundColor: activeTab === "co-loader" ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                color: activeTab === "co-loader" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                fontSize: "12px", 
                padding: "2px 8px", 
                borderRadius: "12px" 
              }}>
                {tabCounts["co-loader"]}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("all-in")}
              style={{
                padding: "0 0 16px 0",
                fontSize: "14px",
                fontWeight: 600,
                color: activeTab === "all-in" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                borderBottom: activeTab === "all-in" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s"
              }}
            >
              All-In Partners
              <span style={{
                backgroundColor: activeTab === "all-in" ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                color: activeTab === "all-in" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-text)",
                fontSize: "12px", 
                padding: "2px 8px", 
                borderRadius: "12px" 
              }}>
                {tabCounts["all-in"]}
              </span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: "auto", padding: "32px 48px" }}>
          {filteredPartners.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                color: "var(--neuron-ink-muted)",
                backgroundColor: "var(--theme-bg-page)",
                borderRadius: "12px",
                border: "1px dashed var(--neuron-ui-border)",
              }}
            >
              <Globe size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
              <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "8px" }}>
                No partners found
              </p>
              <p style={{ fontSize: "13px", marginTop: "0" }}>
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1.5px solid var(--neuron-ui-border)",
                borderRadius: "16px",
                overflow: "hidden",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            >
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                {colWidths}
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--neuron-ui-border)" }}>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}></th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>COMPANY</th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>LOCATION</th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>WCA ID</th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>CONTACT</th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>EXPIRES</th>
                    <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-surface)" }}>SERVICES</th>
                  </tr>
                </thead>
                {groupedPartners.map(([country, partners]) => {
                  const isCollapsed = collapsedCountries.has(country);
                  
                  return (
                    <tbody key={country}>
                      {/* Country Group Header */}
                      <tr 
                        onClick={() => toggleCountry(country)}
                        className="cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                        style={{ 
                          backgroundColor: "var(--theme-bg-page)",
                          borderBottom: "1px solid var(--neuron-ui-border)"
                        }}
                      >
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <ChevronDown 
                              size={16} 
                              className="text-[var(--theme-text-muted)] transition-transform duration-200"
                              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                            />
                            <span className="text-[13px] font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wide">
                              {country}
                            </span>
                            <span className="text-xs text-[var(--theme-text-muted)] font-medium bg-[var(--theme-bg-surface)] px-2 py-0.5 rounded-full border border-[var(--theme-border-default)]">
                              {partners.length}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Partner Rows Wrapper */}
                      <tr>
                        <td colSpan={7} className="p-0 border-0">
                          <div
                            style={{
                              maxHeight: isCollapsed ? "0px" : "2000px",
                              opacity: isCollapsed ? 0 : 1,
                              overflow: "hidden",
                              transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out",
                            }}
                          >
                            <table className="w-full" style={{ borderCollapse: "collapse" }}>
                              {colWidths}
                              <tbody>
                                {partners.map((partner) => {
                                  const statusColor = getStatusColor(partner);
                                  const statusLabel = getStatusLabel(partner);
                                  
                                  return (
                                    <tr
                                      key={partner.id}
                                      onClick={() => onViewVendor?.(partner.id)}
                                      className="cursor-pointer hover:bg-[var(--theme-state-hover)] transition-colors"
                                      style={{
                                        borderBottom: "1px solid var(--neuron-ui-border)",
                                        backgroundColor: "var(--theme-bg-surface)"
                                      }}
                                    >
                                      {/* Status Dot */}
                                      <td className="px-4 py-3 align-middle text-center">
                                        <div 
                                          title={statusLabel}
                                          className="w-2 h-2 rounded-full mx-auto"
                                          style={{ backgroundColor: statusColor }}
                                        />
                                      </td>

                                      {/* Company */}
                                      <td className="px-4 py-3 align-middle">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                                            {partner.company_name}
                                          </span>
                                          {partner.is_wca_conference && (
                                            <Award size={14} className="text-purple-600" />
                                          )}
                                        </div>
                                      </td>

                                      {/* Location */}
                                      <td className="px-4 py-3 align-middle">
                                        <div className="flex flex-col">
                                          <span className="text-[13px] text-[var(--theme-text-secondary)]">
                                            {partner.territory || partner.country}
                                          </span>
                                        </div>
                                      </td>

                                      {/* WCA ID */}
                                      <td className="px-4 py-3 align-middle">
                                        <span className="text-[13px] text-[var(--theme-text-secondary)] font-mono">
                                          {partner.wca_id || "—"}
                                        </span>
                                      </td>

                                      {/* Contact */}
                                      <td className="px-4 py-3 align-middle">
                                        <span className="text-[13px] text-[var(--neuron-ink-primary)]">
                                          {partner.contact_person || "—"}
                                        </span>
                                      </td>

                                      {/* Expires */}
                                      <td className="px-4 py-3 align-middle">
                                        <span 
                                          className="text-[13px]"
                                          style={{
                                            color: isExpired(partner.expires) ? "#DC2626" : 
                                                   expiresSoon(partner.expires) ? "#D97706" : "#6B7280",
                                            fontWeight: expiresSoon(partner.expires) ? 600 : 400
                                          }}
                                        >
                                          {formatCompactDate(partner.expires)}
                                        </span>
                                      </td>

                                      {/* Services */}
                                      <td className="px-4 py-3 align-middle">
                                        <div className="flex gap-1.5 flex-wrap">
                                          {partner.services && partner.services.slice(0, 3).map(service => (
                                            <div 
                                              key={service}
                                              className="p-1 rounded bg-[var(--theme-bg-surface-subtle)] border border-[var(--theme-border-subtle)]"
                                              title={service}
                                            >
                                              {getServiceIcon(service)}
                                            </div>
                                          ))}
                                          {partner.services && partner.services.length > 3 && (
                                            <span className="text-[10px] text-[var(--theme-text-muted)] bg-[var(--theme-bg-surface-subtle)] px-1 rounded flex items-center">
                                              +{partner.services.length - 3}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </div>

        {/* Partner Sheet */}
        <PartnerSheet
          isOpen={isPartnerSheetOpen}
          onClose={() => setIsPartnerSheetOpen(false)}
          onSave={handleSavePartner}
        />
      </div>
    </div>
  );
}