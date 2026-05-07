import { X, Calendar, CreditCard, Building, User, FileText, CheckCircle2, Clock, AlertCircle, Hash, DollarSign, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { supabase } from "../../../utils/supabase/client";
import type { Collection } from "../../../types/accounting";
import {
  getCollectionResolutionLabel,
  isCollectionResolvedByCreditOrRefund,
  resolveCollectionDisposition,
} from "../../../utils/collectionResolution";
import { toast } from "../../ui/toast-utils";
import { CollectionGLPostingSheet } from "./CollectionGLPostingSheet";
import { useMarkEntityReadOnMount } from "../../../hooks/useNotifications";

interface CollectionDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string | null;
}

export function CollectionDetailsSheet({ isOpen, onClose, collectionId }: CollectionDetailsSheetProps) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionSource, setCollectionSource] = useState<"collections" | "evouchers" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [showGLPosting, setShowGLPosting] = useState(false);
  useMarkEntityReadOnMount("collection", isOpen ? collectionId : null);

  useEffect(() => {
    async function fetchCollection() {
      if (!collectionId || !isOpen) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Fetching collection details for ID: ${collectionId}`);
        const { data: collData, error: collError } = await supabase
          .from('collections')
          .select('*')
          .eq('id', collectionId)
          .maybeSingle();
        
        if (collData) {
          setCollection(collData);
          setCollectionSource("collections");
        } else {
          // Fallback: try evouchers table
          const { data: evData, error: evError } = await supabase
            .from('evouchers')
            .select('*')
            .eq('id', collectionId)
            .maybeSingle();
          
          if (evError) throw new Error(evError.message);
          setCollection(evData);
          setCollectionSource("evouchers");
        }
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
      case "credited":
        return { bg: "var(--neuron-semantic-info-bg)", color: "var(--neuron-semantic-info)" };
      case "refunded":
        return { bg: "var(--theme-bg-surface-subtle)", color: "#475467" };
      case "posted":
      case "cleared":
        return { bg: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)" };
      case "deposited":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" };
      case "pending":
      case "received":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" };
      case "bounced":
      case "cancelled":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" };
      default:
        return { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" };
    }
  };

  const statusStyle = collection ? getStatusColor(collection.status || "pending") : { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" };
  const canResolve = Boolean(
    collection &&
    collectionSource &&
    !isCollectionResolvedByCreditOrRefund(collection) &&
    (
      (Array.isArray((collection as any).linked_billings) && (collection as any).linked_billings.length > 0) ||
      (collection as any).invoice_id
    )
  );

  const handleResolveCollection = async (resolution: "credited" | "refunded") => {
    if (!collection || !collectionSource) return;

    try {
      setIsResolving(true);
      const updatedCollection = await resolveCollectionDisposition({
        collection,
        sourceTable: collectionSource,
        resolution,
      });
      setCollection(updatedCollection);
      toast.success(
        resolution === "credited"
          ? "Collection moved to customer credit"
          : "Collection marked as refunded",
      );
    } catch (err) {
      console.error("Error resolving collection disposition:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update collection resolution");
    } finally {
      setIsResolving(false);
    }
  };

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
        className="fixed right-0 top-0 h-full w-[920px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: "24px 48px",
            borderBottom: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
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
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
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
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
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
            <div className="flex items-center justify-center h-full text-[var(--theme-text-muted)]">Loading details...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--theme-status-danger-fg)]">
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
                borderBottom: "1px solid var(--theme-border-default)"
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
                    color: "var(--theme-text-primary)",
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
                        color: "var(--theme-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        display: "block",
                        marginBottom: "4px"
                      }}>
                        Date
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        {formatDate(collection.collection_date)}
                      </span>
                    </div>
                    <div>
                      <span style={{ 
                        fontSize: "11px", 
                        fontWeight: 500, 
                        color: "var(--theme-text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        display: "block",
                        marginBottom: "4px"
                      }}>
                        Receipt No.
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
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
                   <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                     Received From
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-[var(--theme-text-primary)]">{collection.customer_name}</div>
                       <div className="text-xs text-[var(--theme-text-muted)] mt-1">Customer / Payer</div>
                     </div>
                   </div>
                </div>
                
                <div>
                   <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                     Payment Details
                   </label>
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-[var(--theme-text-primary)]">{collection.payment_method}</div>
                          <div className="text-xs text-[var(--theme-text-muted)] mt-1">Method</div>
                        </div>
                        {collection.reference_number && (
                          <div>
                            <div className="text-sm font-medium text-[var(--theme-text-primary)]">{collection.reference_number}</div>
                            <div className="text-xs text-[var(--theme-text-muted)] mt-1">Reference No.</div>
                          </div>
                        )}
                     </div>
                   </div>
                </div>
              </div>

              {!(collection as any).journal_entry_id && !isCollectionResolvedByCreditOrRefund(collection) && (
                <div style={{ marginBottom: "16px" }}>
                  <button
                    onClick={() => setShowGLPosting(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
                    style={{ backgroundColor: "var(--neuron-brand-green, #0F766E)" }}
                  >
                    <BookOpen size={14} />
                    Post to GL
                  </button>
                </div>
              )}

              {(canResolve || isCollectionResolvedByCreditOrRefund(collection)) && (
                <div
                  style={{
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "12px",
                    padding: "16px 18px",
                    marginBottom: "24px",
                    backgroundColor: isCollectionResolvedByCreditOrRefund(collection) ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                        Credit / Refund Control
                      </div>
                      {isCollectionResolvedByCreditOrRefund(collection) ? (
                        <div style={{ fontSize: "13px", color: "var(--theme-status-success-fg)", lineHeight: 1.5 }}>
                          Resolution recorded: <strong>{getCollectionResolutionLabel(collection)}</strong>. This payment stays in history but no longer applies to invoice settlement.
                        </div>
                      ) : (
                        <div style={{ fontSize: "13px", color: "var(--theme-text-secondary)", lineHeight: 1.5 }}>
                          Use this when collected cash for the linked invoice needs to be preserved as customer credit or marked as refunded before invoice reversal and booking cancellation.
                        </div>
                      )}
                    </div>

                    {canResolve && (
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => handleResolveCollection("credited")}
                          disabled={isResolving}
                          style={{
                            border: "1px solid var(--neuron-semantic-info)",
                            backgroundColor: isResolving ? "var(--theme-border-default)" : "var(--neuron-semantic-info-bg)",
                            color: isResolving ? "var(--theme-text-muted)" : "var(--neuron-semantic-info)",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isResolving ? "not-allowed" : "pointer",
                          }}
                        >
                          Record Customer Credit
                        </button>
                        <button
                          onClick={() => handleResolveCollection("refunded")}
                          disabled={isResolving}
                          style={{
                            border: "1px solid var(--theme-text-secondary)",
                            backgroundColor: isResolving ? "var(--theme-border-default)" : "var(--neuron-pill-inactive-bg)",
                            color: isResolving ? "var(--theme-text-muted)" : "var(--theme-text-secondary)",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isResolving ? "not-allowed" : "pointer",
                          }}
                        >
                          Mark Refunded
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description & Notes */}
              <div className="mb-8 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                    Description
                  </label>
                  <div className="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface-subtle)] p-3 rounded-lg border border-[var(--theme-border-subtle)]">
                    {collection.description}
                  </div>
                </div>

                {collection.notes && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                      Notes
                    </label>
                    <div className="text-sm text-[var(--theme-text-secondary)] italic">
                      {collection.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Meta */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-[var(--theme-border-default)] text-sm">
                <div>
                   <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-2">Received By</div>
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                        {collection.received_by_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-medium text-[var(--theme-text-primary)]">{collection.received_by_name}</span>
                   </div>
                </div>
                
                {collection.project_number && (
                  <div>
                    <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-2">Project Context</div>
                    <div className="flex items-center gap-2 text-[var(--theme-action-primary-bg)] font-medium">
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

      {collectionId && (
        <CollectionGLPostingSheet
          isOpen={showGLPosting}
          onClose={() => setShowGLPosting(false)}
          collectionId={collectionId}
          onPosted={() => {
            setShowGLPosting(false);
            // refetch to reflect updated journal_entry_id
            setCollection(prev => prev ? { ...prev, journal_entry_id: "__posted__" } : prev);
          }}
        />
      )}
    </>
  );
}
