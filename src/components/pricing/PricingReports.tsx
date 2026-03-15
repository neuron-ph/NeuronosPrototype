import { BarChart3, Download, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import type { QuotationNew } from "../../types/pricing";
import { apiFetch } from "../../utils/api";

export function PricingReports() {
  const [quotations, setQuotations] = useState<QuotationNew[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch quotations from backend
  useEffect(() => {
    const fetchQuotations = async () => {
      setIsLoading(true);
      try {
        const response = await apiFetch(`/quotations`);
        const result = await response.json();
        if (result.success) {
          setQuotations(result.data);
        } else {
          console.warn("Unable to fetch quotations:", result.error);
          setQuotations([]);
        }
      } catch (error) {
        console.warn("Unable to fetch quotations from server. Using local data only.", error);
        setQuotations([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotations();
  }, []);

  // Calculate metrics
  const totalQuotations = quotations.length;
  const approvedQuotations = quotations.filter(q => q.status === "Approved").length;
  const totalQuotationValue = quotations
    .filter(q => q.status === "Approved")
    .reduce((sum, q) => sum + (q.total || 0), 0);
  const avgQuotationValue = approvedQuotations > 0 ? totalQuotationValue / approvedQuotations : 0;

  // Note: Removed inquiry conversion rate since inquiries are now deprecated (they're Draft quotations)
  const draftQuotations = quotations.filter(q => q.status === "Draft").length;
  const conversionRate = draftQuotations > 0 
    ? ((approvedQuotations / draftQuotations) * 100).toFixed(1)
    : "0.0";

  // Quotations by status
  const quotationsByStatus = [
    { status: "Approved", count: quotations.filter(q => q.status === "Approved").length, color: "#0F766E" },
    { status: "Waiting Approval", count: quotations.filter(q => q.status === "Waiting Approval").length, color: "#F59E0B" },
    { status: "Draft", count: draftQuotations, color: "#C88A2B" },
    { status: "Disapproved", count: quotations.filter(q => q.status === "Disapproved").length, color: "#C94F3D" },
    { status: "Cancelled", count: quotations.filter(q => q.status === "Cancelled").length, color: "#6B7A76" },
  ];

  // Top customers by quotation value
  const customerTotals = quotations
    .filter(q => q.status === "Approved")
    .reduce((acc, q) => {
      const customerName = q.customer_name || "Unknown Customer";
      if (!acc[customerName]) {
        acc[customerName] = 0;
      }
      acc[customerName] += q.total || 0;
      return acc;
    }, {} as Record<string, number>);

  const topCustomers = Object.entries(customerTotals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Services breakdown
  const servicesCount = quotations.reduce((acc, q) => {
    (q.services || []).forEach(service => {
      if (!acc[service]) {
        acc[service] = 0;
      }
      acc[service]++;
    });
    return acc;
  }, {} as Record<string, number>);

  const servicesBreakdown = Object.entries(servicesCount)
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: "var(--neuron-bg-page)" }}>
        <p style={{ color: "var(--neuron-ink-muted)" }}>Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" style={{ background: "var(--neuron-bg-page)" }}>
      <div style={{ padding: "32px 48px" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 style={{ 
              fontSize: "28px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              marginBottom: "8px"
            }}>
              Pricing Reports
            </h1>
            <p style={{ 
              fontSize: "15px",
              color: "var(--neuron-ink-muted)"
            }}>
              Analytics and insights on quotations and inquiries
            </p>
          </div>

          <button
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-[14px] transition-all"
            style={{
              background: "#E8F5F3",
              border: "1px solid #0F766E",
              color: "#0F766E",
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#D1FAE5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#E8F5F3";
            }}
          >
            <Download size={18} />
            Export Report
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <p style={{ 
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              marginBottom: "8px"
            }}>
              Total Quotations
            </p>
            <p style={{ 
              fontSize: "32px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              {totalQuotations}
            </p>
          </div>

          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <p style={{ 
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              marginBottom: "8px"
            }}>
              Approved Rate
            </p>
            <p style={{ 
              fontSize: "32px",
              fontWeight: 600,
              color: "#0F766E"
            }}>
              {totalQuotations > 0 ? ((approvedQuotations / totalQuotations) * 100).toFixed(0) : 0}%
            </p>
          </div>

          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <p style={{ 
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              marginBottom: "8px"
            }}>
              Total Value (Approved)
            </p>
            <p style={{ 
              fontSize: "28px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              PHP {(totalQuotationValue / 1000).toFixed(0)}K
            </p>
          </div>

          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <p style={{ 
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              marginBottom: "8px"
            }}>
              Inquiry Conversion
            </p>
            <p style={{ 
              fontSize: "32px",
              fontWeight: 600,
              color: "#C88A2B"
            }}>
              {conversionRate}%
            </p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Quotations by Status */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ 
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)"
              }}>
                Quotations by Status
              </h2>
              <BarChart3 size={20} style={{ color: "var(--neuron-ink-muted)" }} />
            </div>

            <div className="space-y-4">
              {quotationsByStatus.map((item) => (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ 
                      fontSize: "14px",
                      color: "var(--neuron-ink-secondary)"
                    }}>
                      {item.status}
                    </span>
                    <span style={{ 
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)"
                    }}>
                      {item.count}
                    </span>
                  </div>
                  <div 
                    className="h-2 rounded-full"
                    style={{ 
                      background: "#F3F4F6",
                      overflow: "hidden"
                    }}
                  >
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${totalQuotations > 0 ? (item.count / totalQuotations) * 100 : 0}%`,
                        background: item.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Customers */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              background: "#FFFFFF", 
              border: "1px solid var(--neuron-ui-border)"
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ 
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)"
              }}>
                Top Customers by Value
              </h2>
              <FileText size={20} style={{ color: "var(--neuron-ink-muted)" }} />
            </div>

            <div className="space-y-4">
              {topCustomers.length > 0 ? (
                topCustomers.map((customer, index) => (
                  <div 
                    key={customer.name}
                    className="flex items-center justify-between pb-4"
                    style={{ 
                      borderBottom: index < topCustomers.length - 1 ? "1px solid var(--neuron-ui-divider)" : "none"
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="flex items-center justify-center rounded-full"
                        style={{ 
                          width: "32px",
                          height: "32px",
                          background: "#E8F5F3",
                          color: "#0F766E",
                          fontSize: "14px",
                          fontWeight: 600
                        }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p style={{ 
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "var(--neuron-ink-primary)"
                        }}>
                          {customer.name}
                        </p>
                      </div>
                    </div>
                    <p style={{ 
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#0F766E"
                    }}>
                      PHP {(customer.total / 1000).toFixed(0)}K
                    </p>
                  </div>
                ))
              ) : (
                <p style={{ 
                  fontSize: "14px",
                  color: "var(--neuron-ink-muted)",
                  textAlign: "center",
                  paddingTop: "24px"
                }}>
                  No approved quotations yet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Services Breakdown */}
        <div 
          className="rounded-lg p-6" 
          style={{ 
            background: "#FFFFFF", 
            border: "1px solid var(--neuron-ui-border)"
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 style={{ 
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              Services Breakdown
            </h2>
            <BarChart3 size={20} style={{ color: "var(--neuron-ink-muted)" }} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {servicesBreakdown.map((item) => (
              <div 
                key={item.service}
                className="text-center"
              >
                <p style={{ 
                  fontSize: "32px",
                  fontWeight: 600,
                  color: "#0F766E",
                  marginBottom: "8px"
                }}>
                  {item.count}
                </p>
                <p style={{ 
                  fontSize: "14px",
                  color: "var(--neuron-ink-muted)"
                }}>
                  {item.service}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}