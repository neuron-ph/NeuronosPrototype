import { apiFetch } from "../../../utils/api";
import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Download, Calendar } from "lucide-react";
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
import type { Account } from "../../../types/accounting-core";

export function FinancialReports() {
  const [activeReport, setActiveReport] = useState<"income_statement" | "balance_sheet">("income_statement");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const response = await apiFetch(`/accounts`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAccounts(result.data || []);
        }
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
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
  const incomeAccounts = accounts.filter(a => a.type === "Income");
  const expenseAccounts = accounts.filter(a => a.type === "Expense");
  const assetAccounts = accounts.filter(a => a.type === "Asset");
  const liabilityAccounts = accounts.filter(a => a.type === "Liability");
  const equityAccounts = accounts.filter(a => a.type === "Equity");

  // Sum balances (Assuming standard storage: Assets +Dr, Liabilities +Cr, Equity +Cr, Income +Cr, Expense +Dr)
  // Backend updates 'balance' field. We assume positive numbers for all natural balances.
  
  const totalRevenue = incomeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const netIncome = totalRevenue - totalExpenses;

  const totalAssets = assetAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + (a.balance || 0), 0) + netIncome; // Add Net Income to Equity (Retained Earnings)

  // Chart Data
  const plChartData = [
    { name: "Revenue", amount: totalRevenue, fill: "#0F766E" },
    { name: "Expenses", amount: totalExpenses, fill: "#C05621" },
    { name: "Net Income", amount: netIncome, fill: netIncome >= 0 ? "#059669" : "#DC2626" }
  ];

  const bsChartData = [
    { name: "Assets", amount: totalAssets, fill: "#0F766E" },
    { name: "Liabilities", amount: totalLiabilities, fill: "#C05621" },
    { name: "Equity", amount: totalEquity, fill: "#1D4ED8" }
  ];

  return (
    <div style={{ padding: "32px 48px", height: "100%", overflow: "auto", backgroundColor: "#FAFBFC" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B", marginBottom: "4px" }}>Financial Reports</h1>
          <p style={{ color: "#6B7280", fontSize: "14px" }}>Real-time financial position and performance</p>
        </div>
        
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ display: "flex", backgroundColor: "#F3F4F6", borderRadius: "8px", padding: "4px" }}>
            <button
              onClick={() => setActiveReport("income_statement")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                backgroundColor: activeReport === "income_statement" ? "white" : "transparent",
                color: activeReport === "income_statement" ? "#0F766E" : "#6B7280",
                boxShadow: activeReport === "income_statement" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                transition: "all 0.2s"
              }}
            >
              Income Statement
            </button>
            <button
              onClick={() => setActiveReport("balance_sheet")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                backgroundColor: activeReport === "balance_sheet" ? "white" : "transparent",
                color: activeReport === "balance_sheet" ? "#0F766E" : "#6B7280",
                boxShadow: activeReport === "balance_sheet" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                transition: "all 0.2s"
              }}
            >
              Balance Sheet
            </button>
          </div>
          
          <button style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "8px 16px", backgroundColor: "white", border: "1px solid #E5E7EB",
            borderRadius: "8px", color: "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer"
          }}>
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "64px", color: "#6B7280" }}>
          Loading financial data...
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "24px" }}>
          {/* Main Report Area */}
          <div style={{ 
            backgroundColor: "white", 
            borderRadius: "12px", 
            border: "1px solid #E5E7EB", 
            padding: "32px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}>
            <div style={{ textAlign: "center", marginBottom: "32px", paddingBottom: "24px", borderBottom: "1px solid #E5E7EB" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                {activeReport === "income_statement" ? "Statement of Comprehensive Income" : "Statement of Financial Position"}
              </h2>
              <p style={{ color: "#6B7280", fontSize: "13px" }}>As of {new Date().toLocaleDateString()}</p>
            </div>

            {activeReport === "income_statement" ? (
              // Income Statement Layout
              <div style={{ maxWidth: "700px", margin: "0 auto" }}>
                {/* Revenue Section */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#12332B", textTransform: "uppercase", marginBottom: "12px" }}>Revenue</h3>
                  {incomeAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>{acc.code} - {acc.name}</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(acc.balance || 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E5E7EB", fontWeight: 700 }}>
                    <span>Total Revenue</span>
                    <span>{formatCurrency(totalRevenue)}</span>
                  </div>
                </div>

                {/* Expenses Section */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#12332B", textTransform: "uppercase", marginBottom: "12px" }}>Operating Expenses</h3>
                  {expenseAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>{acc.code} - {acc.name}</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(acc.balance || 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E5E7EB", fontWeight: 700 }}>
                    <span>Total Operating Expenses</span>
                    <span>{formatCurrency(totalExpenses)}</span>
                  </div>
                </div>

                {/* Net Income */}
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  marginTop: "32px", 
                  padding: "16px", 
                  backgroundColor: "#F9FAFB", 
                  borderRadius: "8px",
                  border: "1px solid #E5E7EB"
                }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>NET INCOME</span>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: netIncome >= 0 ? "#059669" : "#DC2626" }}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
              </div>
            ) : (
              // Balance Sheet Layout
              <div style={{ maxWidth: "700px", margin: "0 auto" }}>
                {/* Assets Section */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#12332B", textTransform: "uppercase", marginBottom: "12px" }}>Assets</h3>
                  {assetAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>{acc.code} - {acc.name}</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(acc.balance || 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E5E7EB", fontWeight: 700 }}>
                    <span>Total Assets</span>
                    <span>{formatCurrency(totalAssets)}</span>
                  </div>
                </div>

                {/* Liabilities Section */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#12332B", textTransform: "uppercase", marginBottom: "12px" }}>Liabilities</h3>
                  {liabilityAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>{acc.code} - {acc.name}</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(acc.balance || 0)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E5E7EB", fontWeight: 700 }}>
                    <span>Total Liabilities</span>
                    <span>{formatCurrency(totalLiabilities)}</span>
                  </div>
                </div>

                {/* Equity Section */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#12332B", textTransform: "uppercase", marginBottom: "12px" }}>Equity</h3>
                  {equityAccounts.map(acc => (
                    <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>{acc.code} - {acc.name}</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(acc.balance || 0)}</span>
                    </div>
                  ))}
                  {/* Retained Earnings (Net Income) */}
                   <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                      <span style={{ color: "#4B5563" }}>Retained Earnings (Net Income)</span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(netIncome)}</span>
                    </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #E5E7EB", fontWeight: 700 }}>
                    <span>Total Equity</span>
                    <span>{formatCurrency(totalEquity)}</span>
                  </div>
                </div>

                {/* Total Liabilities and Equity */}
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  marginTop: "32px", 
                  padding: "16px", 
                  backgroundColor: "#F9FAFB", 
                  borderRadius: "8px",
                  border: "1px solid #E5E7EB"
                }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>TOTAL LIABILITIES & EQUITY</span>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                    {formatCurrency(totalLiabilities + totalEquity)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Visuals */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ 
              backgroundColor: "white", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB", 
              padding: "24px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              flex: 1
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Analysis</h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={activeReport === "income_statement" ? plChartData : bsChartData} 
                    margin={{ top: 20, right: 0, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val/1000}k`} tick={{ fontSize: 11 }} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40}>
                      {(activeReport === "income_statement" ? plChartData : bsChartData).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {activeReport === "income_statement" && (
                <div style={{ marginTop: "24px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>Key Metrics</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
                    <span style={{ color: "#6B7280" }}>Profit Margin</span>
                    <span style={{ fontWeight: 600 }}>{totalRevenue > 0 ? ((netIncome/totalRevenue)*100).toFixed(1) : 0}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                    <span style={{ color: "#6B7280" }}>Expense Ratio</span>
                    <span style={{ fontWeight: 600 }}>{totalRevenue > 0 ? ((totalExpenses/totalRevenue)*100).toFixed(1) : 0}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}