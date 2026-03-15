import { useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { apiFetch } from '../../utils/api';
import { toast } from "../ui/toast-utils";
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

  if (!isOpen || !request) return null;

  // Check if user is accounting staff and can approve/post
  const isAccountingStaff = 
    currentUser?.department === "Accounting" || 
    currentUser?.department === "Executive" ||
    (currentUser?.department === "Accounting" && (currentUser?.role === "manager" || currentUser?.role === "director"));
    
  const canApprove = showAccountingControls && isAccountingStaff && (
    request.status === "Submitted" || 
    request.status === "Draft" || 
    request.status === "pending" || 
    request.status === "Under Review" ||
    request.status === "Processing"
  );
  
  const canPostToLedger = showAccountingControls && isAccountingStaff && request.status === "Approved" && !request.posted_to_ledger;

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
      const response = await apiFetch(`/evouchers/${request.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: currentUser?.id,
          user_name: currentUser?.name,
          user_role: currentUser?.role,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to approve E-Voucher');
      }

      toast.success('E-Voucher approved successfully');
      
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
            backgroundColor: isApproving ? "#9CA3AF" : "#0F766E",
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
            if (!isApproving) e.currentTarget.style.backgroundColor = "#0D6560";
          }}
          onMouseLeave={(e) => {
            if (!isApproving) e.currentTarget.style.backgroundColor = "#0F766E";
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
            backgroundColor: isPosting ? "#9CA3AF" : "#0F766E",
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
            if (!isPosting) e.currentTarget.style.backgroundColor = "#0D6560";
          }}
          onMouseLeave={(e) => {
            if (!isPosting) e.currentTarget.style.backgroundColor = "#0F766E";
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-scale-in">
            <div className="p-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600">
                <FileText size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Create Invoice?</h3>
              <p className="text-sm text-gray-600 mb-6">
                This expense is linked to Project <span className="font-semibold text-[#0F766E]">{request.project_number}</span>. 
                Would you like to create a Client Invoice for this amount now?
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBillingPrompt(false);
                    onStatusChange?.();
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  No, Skip
                </button>
                <button
                  onClick={() => {
                    setShowBillingPrompt(false);
                    setShowBillingCreation(true);
                  }}
                  className="flex-1 px-4 py-2 bg-[#0F766E] hover:bg-[#0D6560] text-white rounded-lg text-sm font-medium transition-colors"
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