import { X, Calendar, CreditCard, Building, User, FileText, CheckCircle2, Clock, AlertCircle, Hash, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { apiFetch } from "../../../utils/api";
import type { Collection } from "../../types/accounting";

interface CollectionDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string | null;
}

export function CollectionDetailsSheet({ isOpen, onClose, collectionId }: CollectionDetailsSheetProps) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCollection() {
      if (!collectionId || !isOpen) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Fetching collection details for ID: ${collectionId}`);
        const response = await apiFetch(`/accounting/collections/${collectionId}`);
        
        if (!response.ok) {
           const text = await response.text();
           console.error(`Collection fetch failed: ${response.status} ${response.statusText}`, text);
           throw new Error(`Failed to load collection details: ${response.statusText}`);
        }

        const data = await response.json();
        setCollection(data.data || data); 
      } catch (err) {
        console.error("Error fetching collection:", err);
        setError("Could not load collection details.");
      } finally {
        setLoading(false);
      }
    }

    fetchCollection();
  }, [collectionId, isOpen]);

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
      case "posted":
      case "cleared":
        return { bg: "#E8F5F3", color: "#0F766E" };
      case "deposited":
        return { bg: "#D1FAE5", color: "#059669" };
      case "pending":
      case "received":
        return { bg: "#FEF3E7", color: "#C88A2B" };
      case "bounced":
      case "cancelled":
        return { bg: "#FFE5E5", color: "#C94F3D" };
      default:
        return { bg: "#F3F4F6", color: "#6B7A76" };
    }
  };

  const statusStyle = collection ? getStatusColor(collection.status || "pending") : { bg: "#F3F4F6", color: "#6B7A76" };

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
                  Collection Details
                </h2>
                {collection && (
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
                    {collection.status || "Received"}
                  </span>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "#667085" }}>
                {collection?.evoucher_number || "View collection details"}
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
          ) : collection ? (
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
                    OFFICIAL RECEIPT
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
                        {formatDate(collection.collection_date)}
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
                        Receipt No.
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#12332B" }}>
                        {collection.evoucher_number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Amount Box */}
              <div className="p-6 bg-teal-50 rounded-xl border border-teal-100 mb-8 text-center">
                 <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Amount Received</div>
                 <div className="text-3xl font-bold text-teal-900">{formatCurrency(collection.amount)}</div>
                 <div className="text-teal-600 text-sm mt-1">{collection.currency || "PHP"}</div>
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Received From
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-gray-900">{collection.customer_name}</div>
                       <div className="text-xs text-gray-500 mt-1">Customer / Payer</div>
                     </div>
                   </div>
                </div>
                
                <div>
                   <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                     Payment Details
                   </label>
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{collection.payment_method}</div>
                          <div className="text-xs text-gray-500 mt-1">Method</div>
                        </div>
                        {collection.reference_number && (
                          <div>
                            <div className="text-sm font-medium text-gray-900">{collection.reference_number}</div>
                            <div className="text-xs text-gray-500 mt-1">Reference No.</div>
                          </div>
                        )}
                     </div>
                   </div>
                </div>
              </div>

              {/* Description & Notes */}
              <div className="mb-8 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Description
                  </label>
                  <div className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {collection.description}
                  </div>
                </div>

                {collection.notes && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Notes
                    </label>
                    <div className="text-sm text-gray-600 italic">
                      {collection.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Meta */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-200 text-sm">
                <div>
                   <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Received By</div>
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                        {collection.received_by_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-medium text-gray-900">{collection.received_by_name}</span>
                   </div>
                </div>
                
                {collection.project_number && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Project Context</div>
                    <div className="flex items-center gap-2 text-[#0F766E] font-medium">
                       <CreditCard size={16} />
                       {collection.project_number}
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