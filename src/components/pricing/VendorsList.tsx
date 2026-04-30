import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Plus, Search, Globe, MapPin, Building2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";

type NetworkVendorType = "Overseas Agent" | "Local Agent" | "Subcontractor";

interface NetworkVendor {
  id: string;
  company_name: string;
  country: string;
  territory?: string;
  contact_person?: string;
  type: NetworkVendorType;
  services_offered: string[];
  total_shipments?: number;
  wca_number?: string;
}

export function VendorsList() {
  const [searchParams] = useSearchParams();
  const querySeed = searchParams.get("q") ?? "";
  const [searchQuery, setSearchQuery] = useState(querySeed);
  const [typeFilter, setTypeFilter] = useState<NetworkVendorType | "All">("All");

  useEffect(() => {
    setSearchQuery(querySeed);
  }, [querySeed]);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["network_partners"],
    queryFn: async () => {
      const { data, error } = await supabase.from('network_partners').select('*').order('company_name');
      if (!error && data) return data as NetworkVendor[];
      toast.error('Error loading vendors');
      return [] as NetworkVendor[];
    },
    staleTime: 30_000,
  });

  // Filter vendors
  const filteredVendors = vendors.filter(vendor => {
    const matchesSearch = 
      vendor.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendor.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vendor.territory && vendor.territory.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = typeFilter === "All" || vendor.type === typeFilter;

    return matchesSearch && matchesType;
  });

  // Count by type
  const typeCounts = {
    All: vendors.length,
    "Overseas Agent": vendors.filter(v => v.type === "Overseas Agent").length,
    "Local Agent": vendors.filter(v => v.type === "Local Agent").length,
    Subcontractor: vendors.filter(v => v.type === "Subcontractor").length,
  };

  const getTypeBadgeColor = (type: NetworkVendorType) => {
    switch (type) {
      case "Overseas Agent": 
        return { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-status-success-fg)", border: "var(--theme-status-success-fg)" };
      case "Local Agent": 
        return { bg: "var(--theme-bg-surface-tint)", text: "var(--theme-action-primary-bg)", border: "var(--theme-action-primary-bg)" };
      case "Subcontractor": 
        return { bg: "#FEF3E7", text: "#C88A2B", border: "#C88A2B" };
      default: 
        return { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)", border: "var(--theme-border-default)" };
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "32px 48px 24px 48px",
          borderBottom: "1px solid var(--neuron-ui-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)",
                marginBottom: "4px",
                letterSpacing: "-0.5px",
              }}
            >
              Network Partners
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--neuron-ink-muted)",
                margin: 0,
              }}
            >
              Manage overseas agents, local agents, and subcontractors
            </p>
          </div>

          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: "var(--neuron-brand-green)",
              border: "none",
              borderRadius: "8px",
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
              e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
            }}
          >
            <Plus size={18} />
            Add Vendor
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--neuron-ink-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 40px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              }}
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NetworkVendorType | "All")}
            style={{
              padding: "10px 36px 10px 14px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              fontSize: "14px",
              color: "var(--neuron-ink-secondary)",
              backgroundColor: "var(--theme-bg-surface)",
              cursor: "pointer",
              outline: "none",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              minWidth: "180px",
            }}
          >
            <option value="All">All Types ({typeCounts.All})</option>
            <option value="Overseas Agent">Overseas Agent ({typeCounts["Overseas Agent"]})</option>
            <option value="Local Agent">Local Agent ({typeCounts["Local Agent"]})</option>
            <option value="Subcontractor">Subcontractor ({typeCounts.Subcontractor})</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 48px" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              color: "var(--neuron-ink-muted)",
            }}
          >
            Loading vendors...
          </div>
        ) : filteredVendors.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              color: "var(--neuron-ink-muted)",
            }}
          >
            <Globe size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
            <p style={{ fontSize: "16px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "8px" }}>
              No vendors found
            </p>
            <p style={{ fontSize: "14px", marginTop: "0" }}>
              {searchQuery || typeFilter !== "All"
                ? "Try adjusting your filters"
                : "Add your first vendor to get started"}
            </p>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-page)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Vendor
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Services
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Shipments
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    WCA
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredVendors.map((vendor) => {
                  const typeColors = getTypeBadgeColor(vendor.type);
                  return (
                    <tr
                      key={vendor.id}
                      style={{
                        borderBottom: "1px solid var(--theme-border-subtle)",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              backgroundColor: "var(--theme-bg-surface-tint)",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Building2 size={18} color="var(--theme-action-primary-bg)" />
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--neuron-ink-primary)",
                                marginBottom: "2px",
                              }}
                            >
                              {vendor.company_name}
                            </div>
                            {vendor.contact_person && (
                              <div
                                style={{
                                  fontSize: "13px",
                                  color: "var(--neuron-ink-muted)",
                                }}
                              >
                                {vendor.contact_person}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            backgroundColor: typeColors.bg,
                            color: typeColors.text,
                            border: `1px solid ${typeColors.border}20`,
                          }}
                        >
                          {vendor.type}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <MapPin size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                          <span style={{ fontSize: "14px", color: "var(--neuron-ink-secondary)" }}>
                            {vendor.country}
                            {vendor.territory && (
                              <span style={{ color: "var(--neuron-ink-muted)" }}> • {vendor.territory}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {vendor.services_offered.slice(0, 2).map((service, i) => (
                            <span
                              key={i}
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                backgroundColor: "var(--theme-bg-surface-subtle)",
                                color: "var(--theme-text-muted)",
                              }}
                            >
                              {service}
                            </span>
                          ))}
                          {vendor.services_offered.length > 2 && (
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                backgroundColor: "var(--theme-bg-surface-subtle)",
                                color: "var(--theme-text-muted)",
                                fontWeight: 600,
                              }}
                            >
                              +{vendor.services_offered.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--neuron-ink-primary)",
                          }}
                        >
                          {vendor.total_shipments || 0}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        {vendor.wca_number ? (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--neuron-ink-muted)",
                              backgroundColor: "var(--theme-bg-page)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                            }}
                          >
                            {vendor.wca_number}
                          </span>
                        ) : (
                          <span style={{ fontSize: "13px", color: "var(--theme-border-default)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
