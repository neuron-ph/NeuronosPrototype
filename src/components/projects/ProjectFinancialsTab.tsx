import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import type { Project } from "../../types/pricing";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

interface ProjectFinancialsTabProps {
  project: Project;
  currentUser: any;
}

export function ProjectFinancialsTab({ project, currentUser }: ProjectFinancialsTabProps) {
  void currentUser;

  const financials = useProjectFinancials(
    project.project_number,
    project.linkedBookings || [],
    project.quotation_id,
  );

  const billings = financials.invoices;
  const expenses = financials.expenses;
  const isLoading = financials.isLoading;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  };

  const totalRevenue = financials.totals.invoicedAmount;
  const totalCost = financials.totals.directCost;
  const grossProfit = financials.totals.grossProfit;
  const profitMargin = financials.totals.grossMargin;

  const chartData = [
    { name: "Revenue", amount: totalRevenue, fill: "var(--theme-action-primary-bg)" },
    { name: "Cost", amount: totalCost, fill: "var(--theme-status-warning-fg)" },
    { name: "Profit", amount: grossProfit, fill: "var(--theme-status-success-fg)" },
  ];

  const timelineItems = [
    ...billings.map((billing) => ({ ...billing, type: "Revenue" as const })),
    ...expenses.map((expense) => ({ ...expense, type: "Cost" as const })),
  ].sort(
    (a, b) =>
      new Date(b.request_date || b.invoice_date || b.created_at).getTime() -
      new Date(a.request_date || a.invoice_date || a.created_at).getTime(),
  );

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        backgroundColor: "var(--theme-bg-page)",
        padding: "32px 48px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>
          Project Financials
        </h2>
        <p style={{ color: "var(--theme-text-muted)", marginTop: "4px" }}>
          Profit & Loss analysis for Project {project.project_number}
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "64px", color: "var(--theme-text-muted)" }}>
          Loading financials...
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "24px",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)" }}>
                  <TrendingUp size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-muted)" }}>Total Revenue</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--theme-text-primary)" }}>{formatCurrency(totalRevenue)}</div>
              <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
                From {billings.length} invoices
              </div>
            </div>

            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" }}>
                  <TrendingDown size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-muted)" }}>Total Cost</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--theme-status-warning-fg)" }}>{formatCurrency(totalCost)}</div>
              <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
                From {expenses.length} expenses
              </div>
            </div>

            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" }}>
                  <DollarSign size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-muted)" }}>Gross Profit</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: grossProfit >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)" }}>
                {formatCurrency(grossProfit)}
              </div>
              <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>Net Income</div>
            </div>

            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                padding: "24px",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "var(--neuron-semantic-info-bg)", color: "var(--neuron-semantic-info)" }}>
                  <Activity size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-muted)" }}>Profit Margin</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--neuron-semantic-info)" }}>{profitMargin.toFixed(1)}%</div>
              <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>Return on Sales</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                padding: "24px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                Financial Breakdown
              </h3>

              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--theme-bg-surface)", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid var(--theme-border-default)" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--theme-text-muted)" }}>DESCRIPTION</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "var(--theme-text-muted)" }}>TYPE</th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: "12px", color: "var(--theme-text-muted)" }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timelineItems.map((item, idx) => (
                      <tr key={`${item.type}-${item.id || idx}`} style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                        <td style={{ padding: "16px 8px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                            {item.purpose || item.description || item.invoice_number || "Financial Entry"}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                            {item.voucher_number || item.invoice_number || "—"} •{" "}
                            {new Date(item.request_date || item.invoice_date || item.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: "16px 8px" }}>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              padding: "4px 8px",
                              borderRadius: "4px",
                              backgroundColor: item.type === "Revenue" ? "var(--theme-bg-surface-tint)" : "var(--theme-status-warning-bg)",
                              color: item.type === "Revenue" ? "var(--theme-action-primary-bg)" : "var(--theme-status-warning-fg)",
                            }}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "16px 8px",
                            textAlign: "right",
                            fontWeight: 600,
                            color: item.type === "Revenue" ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)",
                          }}
                        >
                          {item.type === "Revenue" ? "+" : "-"}
                          {formatCurrency(Number(item.amount || item.total_amount || 0))}
                        </td>
                      </tr>
                    ))}
                    {timelineItems.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "center", padding: "32px", color: "var(--theme-text-muted)" }}>
                          No financial data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "var(--theme-bg-surface)",
                borderRadius: "12px",
                border: "1px solid var(--theme-border-default)",
                padding: "24px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                Summary Chart
              </h3>
              <div style={{ width: "100%", height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val / 1000}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: "transparent" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
