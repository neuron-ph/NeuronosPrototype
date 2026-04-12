import { supabase } from "../../../utils/supabase/client";
import { canPerformEVAction } from "../../../utils/permissions";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { logActivity, logApproval } from "../../../utils/activityLog";
import { useState } from "react";
import { CheckCircle, XCircle, Send, Ban, Loader2, ClipboardList, Unlock } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { LiquidationForm } from "./LiquidationForm";
import { GLConfirmationSheet } from "./GLConfirmationSheet";
import type { EVoucherAPType } from "../../../types/evoucher";

interface CurrentUser {
  id: string;
  name: string;
  department?: string;
  role?: string;
  ev_approval_authority?: boolean;
}

interface EVoucherWorkflowPanelProps {
  evoucherId: string;
  evoucherNumber?: string;
  transactionType?: string;
  amount?: number;
  currentStatus: string;
  requestorId?: string;         // EV owner — used to show submit/cancel only to the owner
  currentUser?: CurrentUser;
  onStatusChange?: () => void;
}

/**
 * Determines the next status when a requestor submits their EV.
 * Executive-created EVs skip Manager + CEO gates and land directly at Accounting.
 * direct_expense skips Manager and goes straight to CEO.
 */
function resolveSubmitTarget(requestorDept?: string, transactionType?: string): string {
  if (requestorDept === "Executive") return "pending_accounting";
  if (transactionType === "direct_expense") return "pending_ceo";
  return "pending_manager";
}

export function EVoucherWorkflowPanel({
  evoucherId,
  evoucherNumber = evoucherId,
  transactionType,
  amount = 0,
  currentStatus,
  requestorId,
  currentUser,
  onStatusChange,
}: EVoucherWorkflowPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingAs, setRejectingAs] = useState<"manager" | "ceo">("manager");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showLiquidationForm, setShowLiquidationForm] = useState(false);
  const [showGLSheet, setShowGLSheet] = useState(false);

  const userId = currentUser?.id;
  const isOwner = !requestorId || requestorId === userId;
  const actor = currentUser
    ? { id: currentUser.id, name: currentUser.name, department: currentUser.department ?? "" }
    : null;

  // Requestor actions (visible to EV owner only)
  const canSubmit = isOwner && currentStatus === "draft";
  const canCancel = isOwner && (currentStatus === "draft" || currentStatus === "rejected");

  // Approval gate — derive from centralized canPerformEVAction()
  const role       = currentUser?.role       ?? "";
  const department = currentUser?.department ?? "";

  const canApproveAsTL = canPerformEVAction("approve_tl", role, department) && currentStatus === "pending_manager";
  const canRejectAsTL  = canPerformEVAction("approve_tl", role, department) && currentStatus === "pending_manager";
  const canApproveAsCEO = canPerformEVAction("approve_ceo", role, department) && currentStatus === "pending_ceo";
  const canRejectAsCEO  = canPerformEVAction("approve_ceo", role, department) && currentStatus === "pending_ceo";

  // Accounting: two separate actions
  // 1. Disburse — releases cash to rep (pending_accounting → disbursed)
  const canDisburse = canPerformEVAction("approve_accounting", role, department) && currentStatus === "pending_accounting";
  // 2. Verify & Post — reviews receipts, posts GL (pending_verification → posted)
  const canVerifyAndPost = canPerformEVAction("post_gl", role, department) && currentStatus === "pending_verification";

  // Accounting Manager can unlock a posted EV for correction (auto-reverses the journal entry)
  const canUnlockForCorrection = canPerformEVAction("unlock_posted", role, department) && currentStatus === "posted";

  // Liquidation: only for cash_advance and budget_request, only the EV owner can liquidate
  const isAdvanceType = transactionType === "cash_advance" || transactionType === "budget_request" || transactionType === "expense" || transactionType === "direct_expense";
  const canOpenLiquidation =
    isOwner &&
    isAdvanceType &&
    (currentStatus === "disbursed" || currentStatus === "pending_liquidation");

  // Accounting verifies the liquidation
  const canCloseLiquidation = canPerformEVAction("approve_accounting", role, department) && currentStatus === "pending_verification";

  const writeHistory = async (action: string, prevStatus: string, newStatus: string, notes?: string) => {
    await supabase.from("evoucher_history").insert({
      id: `EH-${Date.now()}`,
      evoucher_id: evoucherId,
      action,
      previous_status: prevStatus,
      new_status: newStatus,
      performed_by: userId,
      performed_by_name: currentUser?.name,
      performed_by_role: currentUser?.department,
      notes: notes ?? null,
      created_at: new Date().toISOString(),
    });
  };

  const transition = async (newStatus: string, action: string, notes?: string) => {
    const { error } = await supabase
      .from("evouchers")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", evoucherId);
    if (error) throw error;
    await writeHistory(action, currentStatus, newStatus, notes);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const nextStatus = resolveSubmitTarget(currentUser?.department, transactionType);
      await transition(nextStatus, "Submitted for Approval");
      // Notify the next approver
      if (currentUser?.id) {
        const recipientDept = nextStatus === "pending_accounting" ? "Accounting" : nextStatus === "pending_ceo" ? "Executive" : undefined;
        createWorkflowTicket({
          subject: `Approve E-Voucher: ${evoucherNumber}`,
          body: `${evoucherNumber} needs your approval.\n\nAmount: ${amount ? `₱${amount.toLocaleString()}` : "—"}`,
          type: "approval",
          recipientDept: recipientDept || currentUser.department || "",
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "",
          autoCreated: true,
        });
      }
      toast.success("E-Voucher submitted for approval");
      onStatusChange?.();
    } catch (error) {
      console.error("Error submitting E-Voucher:", error);
      toast.error("Failed to submit E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTLApprove = async () => {
    if (!confirm("Approve this E-Voucher? It will be escalated to the CEO for final approval.")) return;
    setIsSubmitting(true);
    try {
      // Phase B will check ev_approval_authority to route to pending_accounting instead.
      // For now all TL approvals escalate to CEO.
      const nextStatus = currentUser?.ev_approval_authority
        ? "pending_accounting"
        : "pending_ceo";
      await transition(nextStatus, "Approved by Team Leader / Manager");
      if (actor) logApproval("evoucher", evoucherId, evoucherNumber, currentStatus, nextStatus, actor, true);
      toast.success(
        nextStatus === "pending_accounting"
          ? "Approved — forwarded to Accounting"
          : "Approved — forwarded to CEO for final approval"
      );
      if (nextStatus === "pending_accounting" && currentUser?.id) {
        createWorkflowTicket({
          subject: `Disburse E-Voucher: ${evoucherNumber}`,
          body: `${evoucherNumber} has been approved and is ready for disbursement. Please process the payment.`,
          type: "request",
          priority: "normal",
          recipientDept: "Accounting",
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "Operations",
          autoCreated: true,
        });
      }
      onStatusChange?.();
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("Failed to approve");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCEOApprove = async () => {
    if (!confirm("Approve this E-Voucher? It will be forwarded to Accounting for processing.")) return;
    setIsSubmitting(true);
    try {
      await transition("pending_accounting", "Approved by CEO / Executive");
      if (actor) logApproval("evoucher", evoucherId, evoucherNumber, currentStatus, "pending_accounting", actor, true);
      toast.success("Approved — forwarded to Accounting");
      if (currentUser?.id) {
        createWorkflowTicket({
          subject: `Disburse E-Voucher: ${evoucherNumber}`,
          body: `${evoucherNumber} has been approved by the CEO and is ready for disbursement. Please process the payment.`,
          type: "request",
          priority: "normal",
          recipientDept: "Accounting",
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "Executive",
          autoCreated: true,
        });
      }
      onStatusChange?.();
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("Failed to approve");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockForCorrection = async () => {
    if (!confirm("Unlock this E-Voucher for correction? The original journal entry will be automatically reversed.")) return;
    setIsSubmitting(true);
    try {
      // Fetch current journal_entry_id from the EV
      const { data: ev, error: evFetchError } = await supabase
        .from("evouchers")
        .select("journal_entry_id")
        .eq("id", evoucherId)
        .maybeSingle();

      if (evFetchError) throw evFetchError;

      if (ev?.journal_entry_id) {
        // Fetch original journal entry to reverse
        const { data: originalJE, error: jeFetchError } = await supabase
          .from("journal_entries")
          .select("lines, description, total_debit, total_credit")
          .eq("id", ev.journal_entry_id)
          .maybeSingle();

        if (!jeFetchError && originalJE) {
          // Create reversal entry (flip debit/credit on each line)
          const reversalLines = (originalJE.lines as Array<{ account_id: string; account_code: string; account_name: string; debit: number; credit: number; description: string }>).map((line) => ({
            ...line,
            debit: line.credit,
            credit: line.debit,
            description: `REVERSAL: ${line.description}`,
          }));

          const reversalId = `JE-REV-${Date.now()}`;
          await supabase.from("journal_entries").insert({
            id: reversalId,
            entry_number: reversalId,
            entry_date: new Date().toISOString(),
            evoucher_id: evoucherId,
            description: `REVERSAL of ${ev.journal_entry_id} — Correction Unlock by ${currentUser?.name}`,
            lines: reversalLines,
            total_debit: originalJE.total_credit,
            total_credit: originalJE.total_debit,
            status: "posted",
            created_by: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (actor) logActivity("evoucher", evoucherId, evoucherNumber, "posted", actor);
        }
      }

      // Transition back to pending_accounting and clear journal_entry_id
      const { error: updateError } = await supabase
        .from("evouchers")
        .update({ status: "pending_accounting", journal_entry_id: null, updated_at: new Date().toISOString() })
        .eq("id", evoucherId);

      if (updateError) throw updateError;

      if (actor) logActivity("evoucher", evoucherId, evoucherNumber, "updated", actor, { description: "Unlocked for correction" });
      await writeHistory("Unlocked for GL Correction — Original Entry Reversed", currentStatus, "pending_accounting");
      toast.success("E-Voucher unlocked — original journal entry reversed. Post a new GL entry.");
      onStatusChange?.();
    } catch (error) {
      console.error("Error unlocking for correction:", error);
      toast.error("Failed to unlock for correction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisburse = async () => {
    if (!confirm("Disburse cash for this E-Voucher? This releases funds to the requestor.")) return;
    setIsSubmitting(true);
    try {
      await transition("disbursed", "Cash Disbursed by Accounting");
      // Notify creator: cash is ready
      if (currentUser?.id && requestorId) {
        createWorkflowTicket({
          subject: `Disbursed: ${evoucherNumber}`,
          body: `Your E-Voucher ${evoucherNumber} has been disbursed. Cash has been released.`,
          type: "fyi",
          recipientUserId: requestorId,
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "Accounting",
          autoCreated: true,
        });
      }
      toast.success("E-Voucher disbursed — cash released to requestor");
      onStatusChange?.();
    } catch (error) {
      console.error("Error disbursing:", error);
      toast.error("Failed to disburse");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (rejectingRole: "manager" | "ceo") => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setIsSubmitting(true);
    try {
      // CEO rejects → back to pending_manager; Manager rejects → back to draft
      const targetStatus = rejectingRole === "ceo" ? "pending_manager" : "draft";
      const action = rejectingRole === "ceo" ? "Rejected by CEO" : "Rejected by Manager";
      await transition(targetStatus, action, rejectionReason);
      // Notify creator: rejected with reason
      if (currentUser?.id && requestorId) {
        createWorkflowTicket({
          subject: `Rejected: ${evoucherNumber}`,
          body: `Your E-Voucher ${evoucherNumber} was not approved by ${rejectingRole === "ceo" ? "the CEO" : "your Manager"}.\n\nReason: ${rejectionReason}`,
          type: "fyi",
          priority: "urgent",
          recipientUserId: requestorId,
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "",
          autoCreated: true,
        });
      }
      toast.success("E-Voucher rejected");
      setShowRejectModal(false);
      setRejectionReason("");
      onStatusChange?.();
    } catch (error) {
      console.error("Error rejecting:", error);
      toast.error("Failed to reject E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this E-Voucher? This action cannot be undone.")) return;
    setIsSubmitting(true);
    try {
      await transition("cancelled", "Cancelled by Requestor");
      toast.success("E-Voucher cancelled");
      onStatusChange?.();
    } catch (error) {
      console.error("Error cancelling:", error);
      toast.error("Failed to cancel E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const btnBase: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    fontSize: "14px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: isSubmitting ? "not-allowed" : "pointer",
    opacity: isSubmitting ? 0.6 : 1,
  };

  const handleCloseLiquidation = async () => {
    if (!confirm("Close this liquidation? This marks the advance as fully accounted for.")) return;
    setIsSubmitting(true);
    try {
      await transition("posted", "Verified & Posted by Accounting");
      // Notify creator: EV is complete
      if (currentUser?.id && requestorId) {
        createWorkflowTicket({
          subject: `Complete: ${evoucherNumber}`,
          body: `Your E-Voucher ${evoucherNumber} has been verified and posted. This transaction is complete.`,
          type: "fyi",
          recipientUserId: requestorId,
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "Accounting",
          autoCreated: true,
        });
      }
      toast.success("E-Voucher verified and posted to ledger");
      onStatusChange?.();
    } catch (error) {
      console.error("Error closing liquidation:", error);
      toast.error("Failed to close liquidation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const noActionsAvailable =
    !canSubmit &&
    !canApproveAsTL &&
    !canRejectAsTL &&
    !canApproveAsCEO &&
    !canRejectAsCEO &&
    !canDisburse &&
    !canVerifyAndPost &&
    !canOpenLiquidation &&
    !canCloseLiquidation &&
    !canUnlockForCorrection &&
    !canCancel;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Requestor: submit */}
        {canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {isSubmitting ? "Submitting..." : "Submit for Approval"}
          </button>
        )}

        {/* TL / Manager approval gate */}
        {canApproveAsTL && (
          <button
            onClick={handleTLApprove}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#FFFFFF" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Approving..." : "Approve"}
          </button>
        )}
        {canRejectAsTL && (
          <button
            onClick={() => { setRejectingAs("manager"); setShowRejectModal(true); }}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-danger-fg)", border: "1px solid var(--theme-status-danger-fg)" }}
          >
            <XCircle size={16} />
            Reject
          </button>
        )}

        {/* CEO / Executive approval gate */}
        {canApproveAsCEO && (
          <button
            onClick={handleCEOApprove}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#FFFFFF" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Approving..." : "Approve (CEO)"}
          </button>
        )}
        {canRejectAsCEO && (
          <button
            onClick={() => { setRejectingAs("ceo"); setShowRejectModal(true); }}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-danger-fg)", border: "1px solid var(--theme-status-danger-fg)" }}
          >
            <XCircle size={16} />
            Reject
          </button>
        )}

        {/* Accounting: Disburse — release cash (pending_accounting → disbursed) */}
        {canDisburse && (
          <button
            onClick={handleDisburse}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Disbursing..." : "Disburse"}
          </button>
        )}

        {/* Accounting: Verify & Post — review receipts, post GL (pending_verification → posted) */}
        {canVerifyAndPost && (
          <button
            onClick={() => setShowGLSheet(true)}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#FFFFFF" }}
          >
            <CheckCircle size={16} />
            Verify & Post
          </button>
        )}

        {/* Accounting Manager: unlock posted EV for GL correction */}
        {canUnlockForCorrection && (
          <button
            onClick={handleUnlockForCorrection}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-warning-fg, #B45309)", border: "1px solid var(--theme-status-warning-fg, #B45309)" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
            {isSubmitting ? "Unlocking..." : "Unlock for GL Correction"}
          </button>
        )}

        {/* Requestor: cancel */}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-text-muted)" }}
          >
            <Ban size={16} />
            Cancel E-Voucher
          </button>
        )}

        {/* Handler: open liquidation form */}
        {canOpenLiquidation && (
          <button
            onClick={() => setShowLiquidationForm(true)}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#FFFFFF" }}
          >
            <ClipboardList size={16} />
            {currentStatus === "pending_liquidation" ? "Add More Receipts" : "Submit Liquidation"}
          </button>
        )}

        {/* Accounting: close liquidation after reviewing submissions */}
        {canCloseLiquidation && (
          <button
            onClick={handleCloseLiquidation}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#FFFFFF" }}
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {isSubmitting ? "Closing..." : "Close Liquidation"}
          </button>
        )}

        {noActionsAvailable && (
          <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", textAlign: "center", padding: "8px 0" }}>
            No actions available for your role at this stage.
          </p>
        )}
      </div>

      {/* GL Confirmation Sheet — opens when Accounting posts journal entry */}
      {showGLSheet && currentUser && (
        <GLConfirmationSheet
          isOpen={showGLSheet}
          onClose={() => setShowGLSheet(false)}
          evoucherId={evoucherId}
          evoucherNumber={evoucherNumber}
          transactionType={transactionType as EVoucherAPType}
          amount={amount}
          currentUser={{ id: currentUser.id, name: currentUser.name, department: currentUser.department }}
          onPosted={() => {
            setShowGLSheet(false);
            onStatusChange?.();
          }}
        />
      )}

      {/* Liquidation form */}
      {showLiquidationForm && currentUser && (
        <LiquidationForm
          isOpen={showLiquidationForm}
          onClose={() => setShowLiquidationForm(false)}
          evoucherId={evoucherId}
          evoucherNumber={evoucherNumber}
          advanceAmount={amount}
          currentUser={{ id: currentUser.id, name: currentUser.name }}
          onSubmitted={() => {
            setShowLiquidationForm(false);
            onStatusChange?.();
          }}
        />
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: "20px" }}
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{ backgroundColor: "var(--theme-bg-surface)", borderRadius: "16px", width: "100%", maxWidth: "480px", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
              Reject E-Voucher
            </h3>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginBottom: "16px" }}>
              Provide a reason. The requestor will see this before resubmitting.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              style={{ width: "100%", minHeight: "100px", padding: "12px", borderRadius: "8px", border: "1px solid var(--theme-border-default)", fontSize: "14px", fontFamily: "inherit", resize: "vertical", marginBottom: "16px" }}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={isSubmitting}
                style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-secondary)", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectingAs)}
                disabled={isSubmitting || !rejectionReason.trim()}
                style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", backgroundColor: "var(--theme-status-danger-fg)", color: "#FFFFFF", fontSize: "14px", fontWeight: 500, cursor: isSubmitting || !rejectionReason.trim() ? "not-allowed" : "pointer", opacity: isSubmitting || !rejectionReason.trim() ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                {isSubmitting ? "Rejecting..." : "Reject E-Voucher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
