import { useState, useEffect } from "react";
import { TrendingUp, CreditCard, DollarSign, Activity, FileText } from "lucide-react";
import type { Customer } from "../../types/bd";
import { apiFetch } from "../../utils/api";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Legend,
  Cell
} from "recharts";

interface CustomerFinancialsTabProps {
  customer: Customer;
}

export function CustomerFinancialsTab({ customer }: CustomerFinancialsTabProps) {
  const [billings, setBillings] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFinancials();
  }, [customer.id]);

  const fetchFinancials = async () => {
    try {
      setIsLoading(true);
      
      // Fetch Revenue (Billings)
      const billingsResponse = await apiFetch(`/billings?customerId=${customer.id}`);
      
      // Fetch Collections
      const collectionsResponse = await apiFetch(`/collections?customer_id=${customer.id}`);
      
      if (billingsResponse.ok) {
        const billingsData = await billingsResponse.json();
        if (billingsData.success) {
           setBillings(billingsData.data);
        }
      }
      
      if (collectionsResponse.ok) {
        const collectionsData = await collectionsResponse.json();
        if (collectionsData.success) {
           setCollections(collectionsData.data);
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculations
  const totalBilled = billings.reduce((sum, item) => sum + (Number(item.total_amount || item.amount) || 0), 0);
  const totalCollected = collections.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const outstandingBalance = totalBilled - totalCollected;
  
  // Calculate collection rate
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  // Chart Data (Last 6 months logic could be added, simpler for MVP)
  const chartData = [
    { name: "Total Billed", amount: totalBilled, fill: "#0F766E" },
    { name: "Collected", amount: totalCollected, fill: "#059669" },
    { name: "Outstanding", amount: outstandingBalance, fill: "#C05621" }
  ];

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", margin: 0 }}>Financial Overview</h3>
        <p style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>Billing and collection history for {customer.name || customer.company_name}</p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "48px", color: "#6B7280" }}>
          Loading financial data...
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(4, 1fr)", 
            gap: "16px", 
            marginBottom: "32px" 
          }}>
            <div style={{ 
              backgroundColor: "white", 
              padding: "20px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ padding: "6px", borderRadius: "6px", backgroundColor: "#F0FDF9", color: "#0F766E" }}>
                  <FileText size={16} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#6B7280" }}>Total Billed</span>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#12332B" }}>{formatCurrency(totalBilled)}</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "20px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ padding: "6px", borderRadius: "6px", backgroundColor: "#F0FDF4", color: "#15803D" }}>
                  <CreditCard size={16} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#6B7280" }}>Total Collected</span>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#15803D" }}>{formatCurrency(totalCollected)}</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "20px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ padding: "6px", borderRadius: "6px", backgroundColor: "#FFF7ED", color: "#C05621" }}>
                  <DollarSign size={16} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#6B7280" }}>Outstanding</span>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#C05621" }}>{formatCurrency(outstandingBalance)}</div>
            </div>

            <div style={{ 
              backgroundColor: "white", 
              padding: "20px", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ padding: "6px", borderRadius: "6px", backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                  <Activity size={16} />
                </div>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#6B7280" }}>Collection Rate</span>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#1D4ED8" }}>{collectionRate.toFixed(1)}%</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
            {/* Transaction Ledger */}
            <div style={{ 
              backgroundColor: "white", 
              borderRadius: "12px", 
              border: "1px solid #E5E7EB",
              padding: "24px",
            }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Transaction History</h3>
              
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "11px", color: "#6B7280", textTransform: "uppercase" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "11px", color: "#6B7280", textTransform: "uppercase" }}>Ref #</th>
                      <th style={{ textAlign: "left", padding: "12px 8px", fontSize: "11px", color: "#6B7280", textTransform: "uppercase" }}>Description</th>
                      <th style={{ textAlign: "right", padding: "12px 8px", fontSize: "11px", color: "#6B7280", textTransform: "uppercase" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Combine and sort items */}
                    {[
                      ...billings.map(b => ({ 
                        ...b, 
                        type: "Invoice", 
                        date: b.invoice_date || b.created_at,
                        ref: b.invoice_number || b.evoucher_number,
                        amount: Number(b.total_amount || b.amount)
                      })),
                      ...collections.map(c => ({ 
                        ...c, 
                        type: "Payment", 
                        date: c.collection_date || c.created_at,
                        ref: c.reference_number || c.evoucher_number,
                        amount: Number(c.amount)
                      }))
                    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                     .map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "12px 8px", fontSize: "13px", color: "#374151" }}>
                          {formatDate(item.date)}
                        </td>
                        <td style={{ padding: "12px 8px" }}>
                          <span style={{ 
                            fontSize: "12px", 
                            fontWeight: 500, 
                            color: item.type === "Invoice" ? "#0F766E" : "#059669"
                          }}>
                            {item.ref}
                          </span>
                        </td>
                        <td style={{ padding: "12px 8px", fontSize: "13px", color: "#6B7280" }}>
                           {item.description || item.type}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 600 }}>
                          <span style={{ color: item.type === "Invoice" ? "#374151" : "#059669" }}>
                            {item.type === "Payment" ? "-" : ""}{formatCurrency(item.amount)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {[...billings, ...collections].length === 0 && (
                       <tr>
                         <td colSpan={4} style={{ textAlign: "center", padding: "32px", color: "#9CA3AF" }}>No transactions found</td>
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
              display: "flex",
              flexDirection: "column"
            }}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>Balance Summary</h3>
              <div style={{ flex: 1, minHeight: "250px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₱${val/1000}k`} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={40}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}