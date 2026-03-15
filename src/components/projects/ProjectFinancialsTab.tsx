import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Activity, PieChart, BarChart } from "lucide-react";
import type { Project } from "../../types/pricing";
import { apiFetch } from "../../utils/api";
import { 
  ResponsiveContainer, 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Legend,
  Cell
} from "recharts";

interface ProjectFinancialsTabProps {
  project: Project;
  currentUser: any;
}

export function ProjectFinancialsTab({ project, currentUser }: ProjectFinancialsTabProps) {
  const [billings, setBillings] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFinancials();
  }, [project.project_number]);

  const fetchFinancials = async () => {
    try {
      setIsLoading(true);
      
      // Fetch Revenue (Billings)
      const billingsResponse = await apiFetch(`/evouchers?transaction_type=billing&project_number=${project.project_number}`);
      
      // Fetch Expenses
      const expensesResponse = await apiFetch(`/evouchers?transaction_type=expense&project_number=${project.project_number}`);
      
      if (billingsResponse.ok && expensesResponse.ok) {
        const billingsData = await billingsResponse.json();
        const expensesData = await expensesResponse.json();
        
        if (billingsData.success) {
           // Filter for finalized/posted billings only
           setBillings(billingsData.data.filter((b: any) => 
             b.status === "posted" || b.status === "Posted" || b.status === "Approved"
           ));
        }
        
        if (expensesData.success) {
           // Filter for approved/posted expenses only
           setExpenses(expensesData.data.filter((e: any) => 
             e.status === "Approved" || e.status === "posted" || e.status === "Posted"
           ));
        }
      }
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

  // Calculations
  const totalRevenue = billings.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalCost = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Chart Data
  const chartData = [
    { name: "Revenue", amount: totalRevenue, fill: "#0F766E" },
    { name: "Cost", amount: totalCost, fill: "#C05621" }, // Orange for cost
    { name: "Profit", amount: grossProfit, fill: "#059669" }
  ];

  return (
    <div style={{
      flex: 1,
      overflow: "auto",
      backgroundColor: "#FAFBFC",
      padding: "32px 48px",
      maxWidth: "1400px",
      margin: "0 auto"
    }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B", margin: 0 }}>Project Financials</h2>
        <p style={{ color: "#6B7280", marginTop: "4px" }}>Profit & Loss analysis for Project {project.project_number}</p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "64px", color: "#6B7280" }}>
          Loading financials...
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(4, 1fr)", 
            gap: "24px", 
            marginBottom: "32px" 
          }}>
            <div style={{ 
              backgroundColor: "white", 
              padding: "24px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#F0FDF9", color: "#0F766E" }}>
                  <TrendingUp size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#6B7280" }}>Total Revenue</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#12332B" }}>{formatCurrency(totalRevenue)}</div>
              <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>From {billings.length} invoices</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "24px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#FFF7ED", color: "#C05621" }}>
                  <TrendingDown size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#6B7280" }}>Total Cost</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#C05621" }}>{formatCurrency(totalCost)}</div>
              <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>From {expenses.length} expenses</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "24px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#F0FDF4", color: "#15803D" }}>
                  <DollarSign size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#6B7280" }}>Gross Profit</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: grossProfit >= 0 ? "#15803D" : "#DC2626" }}>
                {formatCurrency(grossProfit)}
              </div>
              <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Net Income</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "24px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                  <Activity size={20} />
                </div>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#6B7280" }}>Profit Margin</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#1D4ED8" }}>{profitMargin.toFixed(1)}%</div>
              <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Return on Sales</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
            {/* Recent Transactions List */}
            <div style={{ 
              backgroundColor: "white", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              padding: "24px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Financial Breakdown</h3>
              
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "#6B7280" }}>DESCRIPTION</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "12px", color: "#6B7280" }}>TYPE</th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: "12px", color: "#6B7280" }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Combine and sort items */}
                    {[
                      ...billings.map(b => ({ ...b, type: "Revenue" })),
                      ...expenses.map(e => ({ ...e, type: "Cost" }))
                    ].sort((a, b) => new Date(b.request_date || b.created_at).getTime() - new Date(a.request_date || a.created_at).getTime())
                     .map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "16px 8px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>{item.purpose || item.description}</div>
                          <div style={{ fontSize: "12px", color: "#9CA3AF" }}>{item.voucher_number} • {new Date(item.request_date || item.created_at).toLocaleDateString()}</div>
                        </td>
                        <td style={{ padding: "16px 8px" }}>
                          <span style={{ 
                            fontSize: "12px", 
                            fontWeight: 600, 
                            padding: "4px 8px", 
                            borderRadius: "4px",
                            backgroundColor: item.type === "Revenue" ? "#E0F2F1" : "#FFF7ED",
                            color: item.type === "Revenue" ? "#0F766E" : "#C05621"
                          }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: "16px 8px", textAlign: "right", fontWeight: 600, color: item.type === "Revenue" ? "#059669" : "#DC2626" }}>
                          {item.type === "Revenue" ? "+" : "-"}{formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                    {[...billings, ...expenses].length === 0 && (
                       <tr>
                         <td colSpan={3} style={{ textAlign: "center", padding: "32px", color: "#9CA3AF" }}>No financial data available</td>
                       </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Chart */}
            <div style={{ 
              backgroundColor: "white", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              padding: "24px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              display: "flex",
              flexDirection: "column"
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Summary Chart</h3>
              <div style={{ width: "100%", height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val/1000}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
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