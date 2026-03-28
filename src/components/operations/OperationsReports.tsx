import { supabase } from "../../utils/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Download, Calendar, Filter } from "lucide-react";


interface ReportFilters {
  startDate: string;
  endDate: string;
  serviceType: string;
  status: string;
  customer: string;
}

interface ReportSummary {
  totalBookings: number;
  byStatus: Record<string, number>;
  byService: Record<string, number>;
}

export function OperationsReports() {
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    serviceType: "All",
    status: "All",
    customer: "",
  });
  const serviceTypes = ["All", "Forwarding", "Trucking", "Brokerage", "Marine Insurance", "Others"];
  const statusOptions = ["All", "Draft", "Confirmed", "In Progress", "Pending", "On Hold", "Completed", "Cancelled"];

  const [queryFilters, setQueryFilters] = useState(filters);

  const { data: reportData, isLoading: loading, refetch } = useQuery({
    queryKey: ["operations_reports", queryFilters],
    queryFn: async () => {
      const tableMap: Record<string, string> = {
        "Forwarding": "forwarding_bookings",
        "Trucking": "trucking_bookings",
        "Brokerage": "brokerage_bookings",
        "Marine Insurance": "marine_insurance_bookings",
        "Others": "others_bookings",
      };

      const serviceEntries = [
        { type: "Forwarding" },
        { type: "Trucking" },
        { type: "Brokerage" },
        { type: "Marine Insurance" },
        { type: "Others" },
      ];

      const allBookings: any[] = [];

      for (const service of serviceEntries) {
        const tableName = tableMap[service.type];
        if (!tableName) continue;
        const { data } = await supabase.from(tableName).select('*').order('created_at', { ascending: false });
        if (data) {
          allBookings.push(...data.map((b: any) => ({ ...b, serviceType: service.type })));
        }
      }

      // Apply filters
      const filtered = allBookings.filter(b => {
        const createdDate = new Date(b.createdAt);
        const matchesDate = createdDate >= new Date(queryFilters.startDate) && createdDate <= new Date(queryFilters.endDate);
        const matchesService = queryFilters.serviceType === "All" || b.serviceType === queryFilters.serviceType;
        const matchesStatus = queryFilters.status === "All" || b.status === queryFilters.status;
        const matchesCustomer = !queryFilters.customer || b.customerName?.toLowerCase().includes(queryFilters.customer.toLowerCase());
        return matchesDate && matchesService && matchesStatus && matchesCustomer;
      });

      // Calculate summary
      const byStatus: Record<string, number> = {};
      const byService: Record<string, number> = {};

      filtered.forEach(b => {
        byStatus[b.status] = (byStatus[b.status] || 0) + 1;
        byService[b.serviceType] = (byService[b.serviceType] || 0) + 1;
      });

      return {
        bookings: filtered,
        summary: { totalBookings: filtered.length, byStatus, byService } as ReportSummary,
      };
    },
    staleTime: 30_000,
  });

  const bookings = reportData?.bookings ?? [];
  const summary = reportData?.summary ?? { totalBookings: 0, byStatus: {}, byService: {} };

  const handleFilter = () => {
    setQueryFilters({ ...filters });
  };

  const handleExportCSV = () => {
    const headers = ["Booking ID", "Service Type", "Customer", "Status", "Created Date"];
    const rows = bookings.map(b => [
      b.bookingId,
      b.serviceType,
      b.customerName || "",
      b.status,
      new Date(b.createdAt).toLocaleDateString()
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operations-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--theme-bg-surface)" }}>
      {/* Header */}
      <div style={{ padding: "32px 48px 24px 48px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ 
            fontSize: "32px", 
            fontWeight: 600, 
            color: "var(--theme-text-primary)", 
            marginBottom: "4px",
            letterSpacing: "-1.2px"
          }}>
            Reports
          </h1>
          <p style={{ 
            fontSize: "14px", 
            color: "var(--theme-text-muted)"
          }}>
            Generate reports and analytics across all operational services
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "0 48px 48px 48px" }}>
        {/* Filters */}
        <div style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Filter size={20} style={{ color: "var(--neuron-brand-green)" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>Filters</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>Start Date</label>
              <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--neuron-ink-primary)", backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>End Date</label>
              <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--neuron-ink-primary)", backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>Service Type</label>
              <select value={filters.serviceType} onChange={(e) => setFilters({ ...filters, serviceType: e.target.value })} style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--neuron-ink-primary)", backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", outline: "none", cursor: "pointer" }}>
                {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--neuron-ink-muted)", marginBottom: "6px" }}>Status</label>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ width: "100%", height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--neuron-ink-primary)", backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", outline: "none", cursor: "pointer" }}>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <input type="text" placeholder="Filter by customer name..." value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} style={{ flex: 1, height: "40px", padding: "0 12px", fontSize: "14px", color: "var(--neuron-ink-primary)", backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", outline: "none" }} />
            <button onClick={handleFilter} style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px", fontSize: "14px", fontWeight: 600, color: "white", backgroundColor: "var(--neuron-brand-green)", border: "none", borderRadius: "8px", cursor: "pointer" }}>Apply Filters</button>
            <button onClick={handleExportCSV} disabled={bookings.length === 0} style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px", fontSize: "14px", fontWeight: 600, color: "var(--neuron-brand-green)", backgroundColor: "var(--neuron-state-selected)", border: "1px solid var(--neuron-brand-green)", borderRadius: "8px", cursor: bookings.length === 0 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px" }}>
              <Download size={16} />Export CSV
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: "12px", padding: "24px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Bookings</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--neuron-brand-green)" }}>{summary.totalBookings}</div>
          </div>
          <div style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: "12px", padding: "24px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>By Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <div key={status} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--neuron-ink-secondary)" }}>
                  <span>{status}</span>
                  <span style={{ fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: "12px", padding: "24px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>By Service</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {Object.entries(summary.byService).map(([service, count]) => (
                <div key={service} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--neuron-ink-secondary)" }}>
                  <span>{service}</span>
                  <span style={{ fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bookings Table */}
        <div style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>Bookings Report</h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--neuron-bg-page)" }}>
                  {["BOOKING ID", "SERVICE TYPE", "CUSTOMER", "STATUS", "CREATED DATE"].map((header) => (
                    <th key={header} style={{ padding: "16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "var(--neuron-ink-muted)" }}>Loading report data...</td></tr>
                ) : bookings.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "var(--neuron-ink-muted)" }}>No bookings match your filters</td></tr>
                ) : (
                  bookings.map((booking) => (
                    <tr key={booking.bookingId} style={{ transition: "background-color 0.15s" }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                      <td style={{ padding: "16px", fontSize: "14px", fontWeight: 600, color: "var(--neuron-brand-green)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{booking.bookingId}</td>
                      <td style={{ padding: "16px", fontSize: "14px", color: "var(--neuron-ink-primary)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{booking.serviceType}</td>
                      <td style={{ padding: "16px", fontSize: "14px", color: "var(--neuron-ink-primary)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{booking.customerName || "—"}</td>
                      <td style={{ padding: "16px", fontSize: "14px", color: "var(--neuron-ink-secondary)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{booking.status}</td>
                      <td style={{ padding: "16px", fontSize: "14px", color: "var(--neuron-ink-muted)", borderBottom: "1px solid var(--neuron-ui-border)" }}>{new Date(booking.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}