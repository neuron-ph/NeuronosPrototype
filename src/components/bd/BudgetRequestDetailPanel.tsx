import { useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { supabase } from '../../utils/supabase/client';
import { usePermission } from "../../context/PermissionProvider";
import { logApproval } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { AddRequestForPaymentPanel } from "../accounting/AddRequestForPaymentPanel";
import { PostToLedgerPanel } from "../accounting/PostToLedgerPanel";
import type { EVoucher } from "../../types/evoucher";

interface BudgetRequestDetailPanelProps {
  request: EVoucher | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: { id: string; name: string; email: string; role?: string; department?: string };
  onStatusChange?: () => void;
  showAccountingControls?: boolean;
}

export function BudgetRequestDetailPanel({ 
  request, 
  isOpen, 
  onClose, 
  currentUser,
  onStatusChange,
  showAccountingControls = false
}: BudgetRequestDetailPanelProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showBillingPrompt, setShowBillingPrompt] = useState(false);
  const [showBillingCreation, setShowBillingCreation] = useState(false);
  const [showPostToLedger, setShowPostToLedger] = useState(false);

  const { can } = usePermission();

  if (!isOpen || !request) return null;

  const canApproveBudget = can("bd_budget_requests", "approve");
  const canPostEntries = can("acct_evouchers", "approve") || can("acct_journal", "create");

  const canApprove = showAccountingControls && canApproveBudget && (
    request.status === "Submitted" ||
    request.status === "Draft" ||
    request.status === "pending" ||
    request.status === "Under Review" ||
    request.status === "Processing"
  );

  const canPostToLedger = showAccountingControls && canPostEntries && request.status === "Approved" && !(request as any).journal_entry_id;

  const handleApprove = async () => {
    if (!canApprove) return;
    
    setIsApproving(true);

    // Optimistic: close panel and notify parent immediately
    const hasBillingPrompt = request.project_number && 
      (request.transaction_type === 'expense' || request.transaction_type === 'budget_request');

    if (!hasBillingPrompt) {
      onStatusChange?.();
      onClose();
    }

    try {
      const { error } = await supabase.from('evouchers')
        .update({ status: 'Approved', updated_at: new Date().toISOString() })
        .eq('id', request.id);
      
      if (error) throw error;
      const _actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
      logApproval("budget_request", request.id, request.title ?? request.id, request.status ?? "", "Approved", _actor, true);

      // Insert history
      await supabase.from('evoucher_history').insert({
        id: `EH-${Date.now()}`,
        evoucher_id: request.id,
        action: 'Approved',
        status: 'Approved',
        user_id: currentUser?.id ?? null,
        user_name: currentUser?.name ?? null,
        user_role: currentUser?.department ?? null,
        metadata: {
          previous_status: request.status,
          new_status: 'Approved',
        },
        created_at: new Date().toISOString()
      });

      toast.success("Budget request approved");
      if (onStatusChange) onStatusChange();
      
      // Show billing prompt if applicable (panel stayed open for this path)
      if (hasBillingPrompt) {
        setShowBillingPrompt(true);
      }
    } catch (error) {
      console.error('Error approving E-Voucher:', error);
      toast.error('Failed to approve E-Voucher');
      // Refresh to revert optimistic close
      onStatusChange?.();
    } finally {
      setIsApproving(false);
    }
  };

  const handlePostToLedger = async () => {
    if (!canPostToLedger) return;
    setShowPostToLedger(true);
  };

  const footerActions = (
    <>
      {canApprove && (
        <button
          onClick={handleApprove}
          disabled={isApproving}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: isApproving ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
            color: "#FFFFFF",
            fontSize: "13px",
            fontWeight: 500,
            cursor: isApproving ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!isApproving) e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
          }}
          onMouseLeave={(e) => {
            if (!isApproving) e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
          }}
        >
          <CheckCircle2 size={16} />
          {isApproving ? "Approving..." : "Approve"}
        </button>
      )}
      
      {canPostToLedger && (
        <button
          onClick={handlePostToLedger}
          disabled={isPosting}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: isPosting ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
            color: "#FFFFFF",
            fontSize: "13px",
            fontWeight: 500,
            cursor: isPosting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!isPosting) e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
          }}
          onMouseLeave={(e) => {
            if (!isPosting) e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
          }}
        >
          <CheckCircle2 size={16} />
          Post to Ledger
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Post to Ledger Panel */}
      {showPostToLedger && (
        <PostToLedgerPanel
          evoucher={request}
          isOpen={showPostToLedger}
          onClose={() => setShowPostToLedger(false)}
          onSuccess={() => {
            setShowPostToLedger(false);
            onStatusChange?.();
            onClose();
          }}
          currentUser={currentUser}
        />
      )}

      {/* Billing Prompt Modal */}
      {showBillingPrompt && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" style={{ backdropFilter: "blur(2px)" }}>
          <div className="bg-[var(--theme-bg-surface)] rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-scale-in">
            <div className="p-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
                <FileText size={24} />
              </div>
              <h3 className="text-lg font-bold text-[var(--theme-text-primary)] mb-2">Create Invoice?</h3>
              <p className="text-sm text-[var(--theme-text-secondary)] mb-6">
                This expense is linked to Project <span className="font-semibold text-[var(--theme-action-primary-bg)]">{request.project_number}</span>. 
                Would you like to create a Client Invoice for this amount now?
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBillingPrompt(false);
                    onStatusChange?.();
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                >
                  No, Skip
                </button>
                <button
                  onClick={() => {
                    setShowBillingPrompt(false);
                    setShowBillingCreation(true);
                  }}
                  className="flex-1 px-4 py-2 bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Yes, Create Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Billing Creation Panel */}
      {showBillingCreation && (
        <AddRequestForPaymentPanel
          context="billing"
          isOpen={showBillingCreation}
          onClose={() => {
            setShowBillingCreation(false);
            onStatusChange?.();
            onClose();
          }}
          initialValues={{
            project_number: request.project_number,
            purpose: `Billing for ${request.purpose || request.description}`,
            description: request.description,
            amount: request.amount,
            vendor_name: request.vendor_name,
            transaction_type: "billing",
            source_type: "billable_expense",
            source_id: request.id,
            is_billable: true
          }}
          onSuccess={() => {
            setShowBillingCreation(false);
            onStatusChange?.();
            onClose();
          }}
        />
      )}

      {/* Main Detail View */}
      {/* Hide main view if billing creation is open to avoid stacking weirdness */}
      {!showBillingCreation && (
        <AddRequestForPaymentPanel 
          isOpen={isOpen} 
          onClose={onClose}
          mode="view"
          existingData={request}
          context="bd" 
          defaultRequestor={request.requestor_name}
          footerActions={footerActions}
          onSuccess={onStatusChange}
        />
      )}
    </>
  );
}
