import { X, Calendar, CreditCard, Building, User, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { apiFetch } from "../../../utils/api";
import type { Expense } from "../../types/accounting";

interface ExpenseDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  expenseId: string | null;
}

export function ExpenseDetailsSheet({ isOpen, onClose, expenseId }: ExpenseDetailsSheetProps) {
  // We use the Expense type for state, but we might be loading an E-Voucher
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      if (!expenseId || !isOpen) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log(`[ExpenseDetailsSheet] Fetching details for ID: ${expenseId}`);
        
        // Use /evouchers endpoint to support Draft/Pending items as well as Posted ones
        const response = await apiFetch(`/evouchers/${expenseId}`);
        
        if (!response.ok) {
           const text = await response.text();
           console.error(`[ExpenseDetailsSheet] API Error: ${response.status} ${response.statusText}`, text);
           throw new Error(`Failed to load details: ${response.statusText}`);
        }

        const result = await response.json();
        const data = result.data || result;
        
        // Map E-Voucher data to Expense interface for display
        const mappedExpense: any = {
          id: data.id,
          evoucher_id: data.id,
          evoucher_number: data.voucher_number || data.evoucher_number,
          date: data.request_date || data.created_at || data.date,
          vendor: data.vendor_name || data.vendor,
          category: data.expense_category || data.category,
          sub_category: data.sub_category,
          amount: data.total_amount || data.amount,
          currency: data.currency || "PHP",
          description: data.purpose || data.description,
          status: data.status,
          project_number: data.project_number,
          payment_method: data.payment_method,
          due_date: data.due_date,
          requestor_name: data.requestor_name,
          line_items: data.line_items || [],
          notes: data.notes
        };

        setExpense(mappedExpense); 
      } catch (err) {
        console.error("[ExpenseDetailsSheet] Error fetching details:", err);
        setError("Could not load transaction details.");
      } finally {
        setLoading(false);
      }
    }

    fetchDetails();
  }, [expenseId, isOpen]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount || 0);
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
      case "approved":
      case "posted":
        return { bg: "#E8F5F3", color: "#0F766E" };
      case "disbursed":
      case "audited":
        return { bg: "#D1FAE5", color: "#059669" };
      case "disapproved":
      case "rejected":
      case "cancelled":
        return { bg: "#FFE5E5", color: "#C94F3D" };
      case "under review":
      case "pending":
      case "processing":
      case "submitted":
        return { bg: "#FEF3E7", color: "#C88A2B" };
      default: // Draft
        return { bg: "#F9FAFB", color: "#9CA3AF" };
    }
  };

  const statusStyle = expense ? getStatusColor(expense.status) : { bg: "#F3F4F6", color: "#6B7A76" };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black z-40"
        onClick={onClose}
        style={{ 
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)"
        }}
      />

      {/* Slide-out Panel */}
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ 
          type: "spring",
          damping: 30,
          stiffness: 300,
          duration: 0.3
        }}
        className="fixed right-0 top-0 h-full w-[920px] bg-white shadow-2xl z-50 flex flex-col"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: "24px 48px",
            borderBottom: "1px solid var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#12332B" }}>
                  Transaction Details
                </h2>
                {expense && (
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
                    {expense.status}
                  </span>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "#667085" }}>
                {expense?.evoucher_number || "View transaction details"}
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
        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading details...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
               <AlertCircle size={32} className="mb-2" />
               <p>{error}</p>
            </div>
          ) : expense ? (
            <div className="max-w-4xl mx-auto">
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
                    PAYMENT VOUCHER
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
                        Date
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#12332B" }}>
                        {formatDate(expense.date)}
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
                        Voucher No.
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#12332B" }}>
                        {expense.evoucher_number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Request Details
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-gray-900">{expense.description}</div>
                       <div className="text-xs text-gray-500 mt-1">Purpose/Description</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{expense.category}</div>
                          <div className="text-xs text-gray-500 mt-1">Category</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{expense.sub_category || "—"}</div>
                          <div className="text-xs text-gray-500 mt-1">Sub-Category</div>
                        </div>
                     </div>
                   </div>
                </div>
                
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Payment Info
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-gray-900">{expense.vendor || "—"}</div>
                       <div className="text-xs text-gray-500 mt-1">Vendor / Payee</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{expense.payment_method || "—"}</div>
                          <div className="text-xs text-gray-500 mt-1">Method</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{expense.due_date ? formatDate(expense.due_date) : "—"}</div>
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
                        <th className="px-4 py-3 font-medium text-gray-500 w-16 text-center">#</th>
                        <th className="px-4 py-3 font-medium text-gray-500">Particulars</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-right w-40">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expense.line_items?.map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-center text-gray-400">{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{item.particular}</div>
                            <div className="text-xs text-gray-500">{item.description}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                      {/* Total Row */}
                      <tr className="bg-gray-50 font-bold">
                        <td colSpan={2} className="px-4 py-3 text-right text-gray-900">Total Amount</td>
                        <td className="px-4 py-3 text-right text-[#12332B] text-lg">
                          {formatCurrency(expense.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Meta */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-200 text-sm">
                <div>
                   <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Requested By</div>
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                        {expense.requestor_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-medium text-gray-900">{expense.requestor_name || "Unknown"}</span>
                   </div>
                </div>
                
                {expense.project_number && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Project Context</div>
                    <div className="flex items-center gap-2 text-[#0F766E] font-medium">
                       <CreditCard size={16} />
                       {expense.project_number}
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>
      </motion.div>
    </>
  );
}