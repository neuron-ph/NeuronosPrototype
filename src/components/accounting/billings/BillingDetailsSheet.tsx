import { X, Calendar, CreditCard, Building, User, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { apiFetch } from "../../../utils/api";
import type { Billing } from "../../types/accounting";
import { SidePanel } from "../../common/SidePanel";

interface BillingDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  billingId: string | null;
}

export function BillingDetailsSheet({ isOpen, onClose, billingId }: BillingDetailsSheetProps) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBilling() {
      if (!billingId || !isOpen) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Fetching billing details for ID: ${billingId}`);
        const response = await apiFetch(`/accounting/billings/${billingId}`);
        
        if (!response.ok) {
           const text = await response.text();
           console.error(`Billing fetch failed: ${response.status} ${response.statusText}`, text);
           throw new Error(`Failed to load billing details: ${response.statusText}`);
        }

        const data = await response.json();
        setBilling(data.data || data); 
      } catch (err) {
        console.error("Error fetching billing:", err);
        setError("Could not load billing details.");
      } finally {
        setLoading(false);
      }
    }

    fetchBilling();
  }, [billingId, isOpen]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return { bg: "#D1FAE5", color: "#059669" };
      case "partial":
        return { bg: "#FEF3E7", color: "#C88A2B" };
      case "unpaid":
        return { bg: "#FEE2E2", color: "#DC2626" };
      case "overdue":
        return { bg: "#FEE2E2", color: "#991B1B" };
      case "invoiced":
        return { bg: "#EFF6FF", color: "#1D4ED8" };
      case "pending":
        return { bg: "#F3F4F6", color: "#6B7A76" };
      default:
        return { bg: "#F3F4F6", color: "#6B7A76" };
    }
  };

  const statusStyle = billing ? getStatusColor(billing.payment_status || "pending") : { bg: "#F3F4F6", color: "#6B7A76" };

  // Custom Header Component for SidePanel
  const CustomHeader = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#12332B" }}>
                Invoice Details
            </h2>
            {billing && (
                <span style={{
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 600,
                backgroundColor: statusStyle.bg,
                color: statusStyle.color,
                borderRadius: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
                }}>
                {billing.payment_status || "Pending"}
                </span>
            )}
            </div>
            <p style={{ fontSize: "13px", color: "#667085" }}>
            {billing?.invoice_number || "View invoice details"}
            </p>
        </div>
        <button
            onClick={onClose}
            style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "transparent",
            color: "#667085",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#F3F4F6";
            }}
            onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            }}
        >
            <X size={20} />
        </button>
    </div>
  );

  return (
    <SidePanel 
        isOpen={isOpen} 
        onClose={onClose} 
        size="lg" // Matches the original 920px width
        title={CustomHeader}
        showCloseButton={false} // We have a custom close button in the header
    >
        {/* Content - Scrollable */}
        <div style={{ height: "100%", overflowY: "auto", padding: "32px 48px" }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading details...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
               <AlertCircle size={32} className="mb-2" />
               <p>{error}</p>
            </div>
          ) : billing ? (
            <div className="max-w-4xl mx-auto pb-12">
              {/* Receipt Header Style */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                justifyContent: "space-between",
                marginBottom: "32px",
                paddingBottom: "24px",
                borderBottom: "1px solid #E5E7EB"
              }}>
                <div>
                  <img 
                    src={logoImage} 
                    alt="Neuron" 
                    style={{ height: "32px", marginBottom: "12px" }}
                  />
                </div>
                
                <div style={{ textAlign: "right" }}>
                  <h1 style={{ 
                    fontSize: "20px", 
                    fontWeight: 700, 
                    color: "#12332B",
                    letterSpacing: "0.5px",
                    marginBottom: "16px"
                  }}>
                    INVOICE / BILLING
                  </h1>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <span style={{ 
                        fontSize: "11px", 
                        fontWeight: 500, 
                        color: "#6B7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        display: "block",
                        marginBottom: "4px"
                      }}>
                        Invoice Date
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#12332B" }}>
                        {formatDate(billing.invoice_date)}
                      </span>
                    </div>
                    <div>
                      <span style={{ 
                        fontSize: "11px", 
                        fontWeight: 500, 
                        color: "#6B7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        display: "block",
                        marginBottom: "4px"
                      }}>
                        Invoice No.
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#12332B" }}>
                        {billing.invoice_number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Bill To
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-gray-900">{billing.customer_name}</div>
                       <div className="text-xs text-gray-500 mt-1">{billing.customer_address || "No address provided"}</div>
                       {billing.customer_contact && <div className="text-xs text-gray-500">{billing.customer_contact}</div>}
                     </div>
                   </div>
                </div>
                
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Payment Details
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-gray-900">{billing.description}</div>
                       <div className="text-xs text-gray-500 mt-1">Description</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{billing.payment_terms || "None"}</div>
                          <div className="text-xs text-gray-500 mt-1">Terms</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{billing.due_date ? formatDate(billing.due_date) : "—"}</div>
                          <div className="text-xs text-gray-500 mt-1">Due Date</div>
                        </div>
                     </div>
                   </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="mb-8">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Line Items
                </label>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-medium text-gray-500">Description</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-right w-20">Qty</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-right w-32">Unit Price</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-right w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {billing.line_items?.map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{item.description}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                      
                      {/* Subtotal Section */}
                      <tr className="bg-gray-50/50">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide">Subtotal</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(billing.subtotal)}
                        </td>
                      </tr>
                      {billing.tax_amount > 0 && (
                        <tr className="bg-gray-50/50">
                           <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide">Tax</td>
                           <td className="px-4 py-2 text-right font-medium text-gray-900">
                             {formatCurrency(billing.tax_amount)}
                           </td>
                        </tr>
                      )}
                      {billing.discount_amount > 0 && (
                        <tr className="bg-gray-50/50">
                           <td colSpan={3} className="px-4 py-2 text-right text-xs text-gray-500 uppercase tracking-wide">Discount</td>
                           <td className="px-4 py-2 text-right font-medium text-red-600">
                             -{formatCurrency(billing.discount_amount)}
                           </td>
                        </tr>
                      )}
                      {/* Grand Total */}
                      <tr className="bg-gray-100 font-bold border-t border-gray-200">
                        <td colSpan={3} className="px-4 py-3 text-right text-gray-900">Total Amount</td>
                        <td className="px-4 py-3 text-right text-[#12332B] text-lg">
                          {formatCurrency(billing.total_amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Status Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-8 flex justify-between items-center border border-gray-200">
                 <div className="flex gap-8">
                    <div>
                       <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Amount Paid</div>
                       <div className="text-lg font-bold text-emerald-600">{formatCurrency(billing.amount_paid)}</div>
                    </div>
                    <div>
                       <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Balance Due</div>
                       <div className="text-lg font-bold text-red-600">{formatCurrency(billing.amount_due)}</div>
                    </div>
                 </div>
              </div>

              {/* Footer Meta */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-200 text-sm">
                <div>
                   <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Prepared By</div>
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                        {billing.created_by_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-medium text-gray-900">{billing.created_by_name}</span>
                   </div>
                </div>
                
                {billing.project_number && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Project Context</div>
                    <div className="flex items-center gap-2 text-[#0F766E] font-medium">
                       <CreditCard size={16} />
                       {billing.project_number}
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>
    </SidePanel>
  );
}