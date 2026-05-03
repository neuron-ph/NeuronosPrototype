import { X, Calendar, CreditCard, Building, User, FileText, CheckCircle2, Clock, AlertCircle, Loader2, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { supabase } from "../../../utils/supabase/client";
import type { Billing } from "../../../types/accounting";
import { SidePanel } from "../../common/SidePanel";
import {
  completeInvoiceReversalDraft,
  createInvoiceReversalDraft,
  findInvoiceReversalDocument,
  getInvoiceCollectionSummary,
  getInvoiceLifecycleStatus,
  isInvoiceReversalDraft,
  isInvoiceReversalPosted,
  isInvoiceReversedOriginal,
} from "../../../utils/invoiceReversal";
import { toast } from "../../ui/toast-utils";
import { InvoiceGLPostingSheet } from "../invoices/InvoiceGLPostingSheet";

interface BillingDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  billingId: string | null;
}

export function BillingDetailsSheet({ isOpen, onClose, billingId }: BillingDetailsSheetProps) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedCollectionCount, setLinkedCollectionCount] = useState(0);
  const [reversalDocument, setReversalDocument] = useState<any | null>(null);
  const [isCreatingReversal, setIsCreatingReversal] = useState(false);
  const [isCompletingReversal, setIsCompletingReversal] = useState(false);
  const [showGLPosting, setShowGLPosting] = useState(false);

  useEffect(() => {
    async function fetchBilling() {
      if (!billingId || !isOpen) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Fetching billing details for ID: ${billingId}`);
        // Try invoices table first (posted billings), fallback to evouchers
        const { data: invoiceData, error: invoiceError } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', billingId)
          .maybeSingle();
        
        if (invoiceData) {
          setBilling(invoiceData);
          if (invoiceData?.metadata?.reversal_of_invoice_id) {
            const sourceInvoiceId = invoiceData.metadata.reversal_of_invoice_id;
            const collectionSummary = await getInvoiceCollectionSummary(sourceInvoiceId);
            setLinkedCollectionCount(collectionSummary.collectionCount);
            setReversalDocument(invoiceData);
          } else {
            const [collectionSummary, existingReversal] = await Promise.all([
              getInvoiceCollectionSummary(invoiceData.id),
              findInvoiceReversalDocument(invoiceData.id),
            ]);
            setLinkedCollectionCount(collectionSummary.collectionCount);
            setReversalDocument(existingReversal);
          }
        } else {
          // Fallback: try evouchers table
          const { data: evData, error: evError } = await supabase
            .from('evouchers')
            .select('*')
            .eq('id', billingId)
            .maybeSingle();
          
          if (evError) throw new Error(evError.message);
          setBilling(evData);
          setLinkedCollectionCount(0);
          setReversalDocument(null);
        }
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
      case "reversal_draft":
        return { bg: "var(--theme-status-warning-bg)", color: "#B45309" };
      case "reversal_posted":
      case "reversed":
        return { bg: "var(--theme-bg-surface-subtle)", color: "#475467" };
      case "paid":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" };
      case "partial":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" };
      case "unpaid":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" };
      case "overdue":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" };
      case "invoiced":
        return { bg: "var(--neuron-semantic-info-bg)", color: "var(--neuron-semantic-info)" };
      case "pending":
        return { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" };
      default:
        return { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" };
    }
  };

  const displayStatus = billing
    ? getInvoiceLifecycleStatus(billing) || billing.payment_status || billing.status || "pending"
    : "pending";
  const statusStyle = getStatusColor(displayStatus);

  const handleCreateReversalDraft = async () => {
    if (!billing?.id || !billing.invoice_number) return;

    try {
      setIsCreatingReversal(true);
      const draft = await createInvoiceReversalDraft(billing);
      setReversalDocument(draft);
      toast.success(`Reversal draft ${draft.invoice_number} created`);
    } catch (err) {
      console.error("Error creating reversal draft:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create reversal draft");
    } finally {
      setIsCreatingReversal(false);
    }
  };

  const handleCompleteReversal = async () => {
    const targetReversal =
      isInvoiceReversalDraft(billing) ? billing : reversalDocument;

    if (!targetReversal || !isInvoiceReversalDraft(targetReversal)) return;

    try {
      setIsCompletingReversal(true);
      const { originalInvoice, reversalInvoice } = await completeInvoiceReversalDraft(targetReversal);

      if (billing?.id === reversalInvoice.id) {
        setBilling(reversalInvoice);
      } else if (billing?.id === originalInvoice.id) {
        setBilling(originalInvoice);
      }

      setReversalDocument(reversalInvoice);
      toast.success(`Reversal ${reversalInvoice.invoice_number || ""} completed`.replace(/Reversal +completed/, "Reversal completed"));
    } catch (err) {
      console.error("Error completing reversal:", err);
      toast.error(err instanceof Error ? err.message : "Failed to complete reversal");
    } finally {
      setIsCompletingReversal(false);
    }
  };

  // Custom Header Component for SidePanel
  const CustomHeader = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
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
                {String(displayStatus).replace(/_/g, " ") || "Pending"}
                </span>
            )}
            </div>
            <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
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
            <div className="flex items-center justify-center h-full text-[var(--theme-text-muted)]">Loading details...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--theme-status-danger-fg)]">
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
                    INVOICE / BILLING
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
                        Invoice Date
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        {formatDate(billing.invoice_date)}
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
                        Invoice No.
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        {billing.invoice_number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                   <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                     Bill To
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-[var(--theme-text-primary)]">{billing.customer_name}</div>
                       <div className="text-xs text-[var(--theme-text-muted)] mt-1">{billing.customer_address || "No address provided"}</div>
                       {billing.customer_contact && <div className="text-xs text-[var(--theme-text-muted)]">{billing.customer_contact}</div>}
                     </div>
                   </div>
                </div>
                
                <div>
                   <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2">
                     Payment Details
                   </label>
                   <div className="space-y-4">
                     <div>
                       <div className="text-sm font-medium text-[var(--theme-text-primary)]">{billing.description}</div>
                       <div className="text-xs text-[var(--theme-text-muted)] mt-1">Description</div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-[var(--theme-text-primary)]">{billing.payment_terms || "None"}</div>
                          <div className="text-xs text-[var(--theme-text-muted)] mt-1">Terms</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[var(--theme-text-primary)]">{billing.due_date ? formatDate(billing.due_date) : "—"}</div>
                          <div className="text-xs text-[var(--theme-text-muted)] mt-1">Due Date</div>
                        </div>
                     </div>
                   </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="mb-8">
                <label className="block text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-3">
                  Line Items
                </label>
                <div className="rounded-lg border border-[var(--theme-border-default)] overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)]">
                      <tr>
                        <th className="px-4 py-3 font-medium text-[var(--theme-text-muted)]">Description</th>
                        <th className="px-4 py-3 font-medium text-[var(--theme-text-muted)] text-right w-20">Qty</th>
                        <th className="px-4 py-3 font-medium text-[var(--theme-text-muted)] text-right w-32">Unit Price</th>
                        <th className="px-4 py-3 font-medium text-[var(--theme-text-muted)] text-right w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {((billing as any).metadata?.line_items ?? billing.line_items ?? []).map((item: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[var(--theme-text-primary)]">{item.description}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--theme-text-secondary)]">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-[var(--theme-text-secondary)]">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-[var(--theme-text-primary)]">
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                      
                      {/* Subtotal Section */}
                      <tr className="bg-[var(--theme-bg-surface-subtle)]/50">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs text-[var(--theme-text-muted)] uppercase tracking-wide">Subtotal</td>
                        <td className="px-4 py-2 text-right font-medium text-[var(--theme-text-primary)]">
                          {formatCurrency(billing.subtotal ?? 0)}
                        </td>
                      </tr>
                      {(billing.tax_amount ?? 0) > 0 && (
                        <tr className="bg-[var(--theme-bg-surface-subtle)]/50">
                           <td colSpan={3} className="px-4 py-2 text-right text-xs text-[var(--theme-text-muted)] uppercase tracking-wide">Tax</td>
                           <td className="px-4 py-2 text-right font-medium text-[var(--theme-text-primary)]">
                             {formatCurrency(billing.tax_amount ?? 0)}
                           </td>
                        </tr>
                      )}
                      {(billing.discount_amount ?? 0) > 0 && (
                        <tr className="bg-[var(--theme-bg-surface-subtle)]/50">
                           <td colSpan={3} className="px-4 py-2 text-right text-xs text-[var(--theme-text-muted)] uppercase tracking-wide">Discount</td>
                           <td className="px-4 py-2 text-right font-medium text-[var(--theme-status-danger-fg)]">
                             -{formatCurrency(billing.discount_amount ?? 0)}
                           </td>
                        </tr>
                      )}
                      {/* Grand Total */}
                      <tr className="bg-[var(--theme-bg-surface-subtle)] font-bold border-t border-[var(--theme-border-default)]">
                        <td colSpan={3} className="px-4 py-3 text-right text-[var(--theme-text-primary)]">Total Amount</td>
                        <td className="px-4 py-3 text-right text-[var(--theme-text-primary)] text-lg">
                          {formatCurrency(billing.total_amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Status Summary */}
              <div className="bg-[var(--theme-bg-surface-subtle)] rounded-lg p-4 mb-8 flex justify-between items-center border border-[var(--theme-border-default)]">
                 <div className="flex gap-8">
                    <div>
                       <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-1">Amount Paid</div>
                       <div className="text-lg font-bold text-emerald-600">{formatCurrency(billing.amount_paid ?? 0)}</div>
                    </div>
                    <div>
                       <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-1">Balance Due</div>
                       <div className="text-lg font-bold text-[var(--theme-status-danger-fg)]">{formatCurrency(billing.amount_due ?? 0)}</div>
                    </div>
                 </div>
              </div>

              {billing.invoice_number && !billing.journal_entry_id && !isInvoiceReversalPosted(billing) && !isInvoiceReversedOriginal(billing) && (
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

              {billing.invoice_number && (
                <div
                  style={{
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "12px",
                    padding: "16px 18px",
                    marginBottom: "24px",
                    backgroundColor: linkedCollectionCount > 0 ? "var(--theme-status-danger-bg)" : reversalDocument ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                        Reversal Control
                      </div>
                      {linkedCollectionCount > 0 ? (
                        <div style={{ fontSize: "13px", color: "var(--theme-status-danger-fg)", lineHeight: 1.5 }}>
                          {linkedCollectionCount} collection record(s) are linked to this invoice. Resolve customer credit or refund handling before creating a reversal draft.
                        </div>
                      ) : isInvoiceReversalPosted(billing) || isInvoiceReversedOriginal(billing) ? (
                        <div style={{ fontSize: "13px", color: "var(--theme-status-success-fg)", lineHeight: 1.5 }}>
                          This invoice has already been reversed. The original document is preserved and no longer counts as active AR.
                        </div>
                      ) : reversalDocument ? (
                        <div style={{ fontSize: "13px", color: "var(--theme-status-success-fg)", lineHeight: 1.5 }}>
                          {isInvoiceReversalDraft(reversalDocument)
                            ? <>Reversal draft created: <strong>{reversalDocument.invoice_number || "—"}</strong>. Keep the original invoice intact and complete the cancellation from this reversal workflow.</>
                            : <>Reversal posted: <strong>{reversalDocument.invoice_number || "—"}</strong>. The original invoice is preserved for audit history and excluded from active AR.</>}
                        </div>
                      ) : (
                        <div style={{ fontSize: "13px", color: "var(--theme-text-secondary)", lineHeight: 1.5 }}>
                          This invoice can be mirrored into a reversal draft without mutating the original document or reusing its billing-line ownership.
                        </div>
                      )}
                    </div>

                    {linkedCollectionCount === 0 && (
                      <>
                        {!reversalDocument && !isInvoiceReversalPosted(billing) && !isInvoiceReversedOriginal(billing) && (
                          <button
                            onClick={handleCreateReversalDraft}
                            disabled={isCreatingReversal}
                            style={{
                              border: "1px solid #12332B",
                              backgroundColor: isCreatingReversal ? "var(--theme-border-default)" : "var(--theme-text-primary)",
                              color: isCreatingReversal ? "var(--theme-text-muted)" : "#FFFFFF",
                              borderRadius: "10px",
                              padding: "10px 14px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: isCreatingReversal ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              minWidth: "168px",
                              justifyContent: "center",
                            }}
                          >
                            {isCreatingReversal ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                            {isCreatingReversal ? "Creating..." : "Create Reversal Draft"}
                          </button>
                        )}

                        {(isInvoiceReversalDraft(billing) || isInvoiceReversalDraft(reversalDocument)) && (
                          <button
                            onClick={handleCompleteReversal}
                            disabled={isCompletingReversal}
                            style={{
                              border: "1px solid #0F766E",
                              backgroundColor: isCompletingReversal ? "var(--theme-border-default)" : "var(--theme-status-success-bg)",
                              color: isCompletingReversal ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
                              borderRadius: "10px",
                              padding: "10px 14px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: isCompletingReversal ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              minWidth: "168px",
                              justifyContent: "center",
                            }}
                          >
                            {isCompletingReversal ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {isCompletingReversal ? "Completing..." : "Complete Reversal"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Footer Meta */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-[var(--theme-border-default)] text-sm">
                <div>
                   <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-2">Prepared By</div>
                   <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                        {billing.created_by_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-medium text-[var(--theme-text-primary)]">{billing.created_by_name}</span>
                   </div>
                </div>
                
                {billing.project_number && (
                  <div>
                    <div className="text-xs font-semibold text-[var(--theme-text-muted)] uppercase mb-2">Project Context</div>
                    <div className="flex items-center gap-2 text-[var(--theme-action-primary-bg)] font-medium">
                       <CreditCard size={16} />
                       {billing.project_number}
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>

      {billingId && (
        <InvoiceGLPostingSheet
          isOpen={showGLPosting}
          onClose={() => setShowGLPosting(false)}
          invoiceId={billingId}
          onPosted={() => {
            setShowGLPosting(false);
            // refetch to reflect updated journal_entry_id
            setBilling(prev => prev ? { ...prev, journal_entry_id: "__posted__" } : prev);
          }}
        />
      )}
    </SidePanel>
  );
}
