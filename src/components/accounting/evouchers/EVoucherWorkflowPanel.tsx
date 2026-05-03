import { supabase } from "../../../utils/supabase/client";
import { canPerformEVAction } from "../../../utils/permissions";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { logActivity, logApproval } from "../../../utils/activityLog";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  CheckCircle, XCircle, Send, Ban, Loader2, ClipboardList, Unlock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { LiquidationForm } from "./LiquidationForm";
import { GLConfirmationSheet } from "./GLConfirmationSheet";
import type { EVoucherAPType } from "../../../types/evoucher";
import { ensureBillableExpenseBillingItem } from "../../../utils/evoucherApproval";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  requestorId?: string;
  currentUser?: CurrentUser;
  onStatusChange?: () => void;
  // Billable expense auto-billing
  isBillable?: boolean;
  bookingId?: string;
  projectNumber?: string;
  currency?: string;
  expenseCategory?: string;
}

// ─── Button base styles — stable reference outside component ──────────────────

const btnBase: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  border: "none",
  fontSize: "13px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  cursor: "pointer",
};

// ─── Submit target resolver ───────────────────────────────────────────────────

function resolveSubmitTarget(requestorDept?: string, transactionType?: string): string {
  if (requestorDept === "Executive") return "pending_accounting";
  if (transactionType === "direct_expense") return "pending_ceo";
  return "pending_manager";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EVoucherWorkflowPanel({
  evoucherId,
  evoucherNumber = evoucherId,
  transactionType,
  amount = 0,
  currentStatus,
  requestorId,
  currentUser,
  onStatusChange,
  isBillable,
  bookingId,
  projectNumber,
  currency,
  expenseCategory,
}: EVoucherWorkflowPanelProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") || "accounting";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousTotalSpent, setPreviousTotalSpent] = useState(0);
  const [previousTotalReturned, setPreviousTotalReturned] = useState(0);

  // Inline confirm for destructive actions (cancel, unlock)
  const [pendingConfirm, setPendingConfirm] = useState<"cancel" | "unlock" | null>(null);

  // Inline reject zone
  const [showReject, setShowReject] = useState(false);
  const [rejectingAs, setRejectingAs] = useState<"manager" | "ceo">("manager");
  const [rejectionReason, setRejectionReason] = useState("");

  const [showLiquidationForm, setShowLiquidationForm] = useState(false);
  const [showGLSheet, setShowGLSheet] = useState(false);

  const userId = currentUser?.id;
  const isOwner = !requestorId || requestorId === userId;
  const actor = currentUser
    ? { id: currentUser.id, name: currentUser.name, department: currentUser.department ?? "" }
    : null;

  const role = currentUser?.role ?? "";
  const department = currentUser?.department ?? "";

  // ── Permission gates ──────────────────────────────────────────────────────
  const canSubmit = isOwner && currentStatus === "draft";
  const canCancel = isOwner && (currentStatus === "draft" || currentStatus === "rejected");

  const canApproveAsTL   = canPerformEVAction("approve_tl", role, department) && currentStatus === "pending_manager";
  const canRejectAsTL    = canPerformEVAction("approve_tl", role, department) && currentStatus === "pending_manager";
  const canApproveAsCEO  = canPerformEVAction("approve_ceo", role, department) && currentStatus === "pending_ceo";
  const canRejectAsCEO   = canPerformEVAction("approve_ceo", role, department) && currentStatus === "pending_ceo";
  const canDisburse      = canPerformEVAction("approve_accounting", role, department) && currentStatus === "pending_accounting";
  const canVerifyAndPost = canPerformEVAction("post_gl", role, department) && currentStatus === "pending_verification";
  const canUnlockForCorrection = canPerformEVAction("unlock_posted", role, department) && currentStatus === "posted";

  const isAdvanceType = transactionType === "cash_advance" || transactionType === "budget_request";
  const canOpenLiquidation =
    isOwner && isAdvanceType &&
    (currentStatus === "disbursed" || currentStatus === "pending_liquidation");
  const canCloseLiquidation =
    canPerformEVAction("approve_accounting", role, department) && currentStatus === "pending_verification";

  const noActionsAvailable =
    !canSubmit && !canApproveAsTL && !canRejectAsTL && !canApproveAsCEO && !canRejectAsCEO &&
    !canDisburse && !canVerifyAndPost && !canOpenLiquidation && !canCloseLiquidation &&
    !canUnlockForCorrection && !canCancel;

  // ── Shared helpers ────────────────────────────────────────────────────────
  const writeHistory = async (action: string, prevStatus: string, newStatus: string, notes?: string) => {
    await supabase.from("evoucher_history").insert({
      id: `EH-${Date.now()}`,
      evoucher_id: evoucherId,
      action,
      status: newStatus,
      user_id: userId,
      user_name: currentUser?.name,
      user_role: currentUser?.department,
      remarks: notes ?? null,
      metadata: { previous_status: prevStatus, new_status: newStatus, notes: notes ?? null },
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

  // ── Billable expense auto-billing ─────────────────────────────────────────

  const ensureBillableBillingItem = async () => {
    const result = await ensureBillableExpenseBillingItem({
      id: evoucherId,
      isBillable,
      bookingId,
    });
    if (result.billingError) {
      console.error("Failed to ensure billable expense billing item", result.billingError);
      toast.warning(`Approved, but automatic booking billing could not be created. ${result.billingError}`);
    }
  };

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const nextStatus = resolveSubmitTarget(currentUser?.department, transactionType);
      await transition(nextStatus, "Submitted for Approval");
      if (currentUser?.id) {
        const recipientDept =
          nextStatus === "pending_accounting" ? "Accounting"
          : nextStatus === "pending_ceo" ? "Executive"
          : undefined;
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
    } catch {
      toast.error("Failed to submit E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTLApprove = async () => {
    setIsSubmitting(true);
    try {
      const nextStatus = currentUser?.ev_approval_authority ? "pending_accounting" : "pending_ceo";
      await transition(nextStatus, "Approved by Team Leader / Manager");
      if (actor) logApproval("evoucher", evoucherId, evoucherNumber, currentStatus, nextStatus, actor, true);
      toast.success(
        nextStatus === "pending_accounting"
          ? "Approved — forwarded to Accounting"
          : "Approved — forwarded to CEO for final approval"
      );
      if (nextStatus === "pending_accounting" && currentUser?.id) {
        await ensureBillableBillingItem();
        createWorkflowTicket({
          subject: `Disburse E-Voucher: ${evoucherNumber}`,
          body: `${evoucherNumber} has been approved and is ready for disbursement.`,
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
    } catch {
      toast.error("Failed to approve");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCEOApprove = async () => {
    setIsSubmitting(true);
    try {
      await transition("pending_accounting", "Approved by CEO / Executive");
      if (actor) logApproval("evoucher", evoucherId, evoucherNumber, currentStatus, "pending_accounting", actor, true);
      await ensureBillableBillingItem();
      toast.success("Approved — forwarded to Accounting");
      if (currentUser?.id) {
        createWorkflowTicket({
          subject: `Disburse E-Voucher: ${evoucherNumber}`,
          body: `${evoucherNumber} has been approved by the CEO and is ready for disbursement.`,
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
    } catch {
      toast.error("Failed to approve");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockForCorrection = async () => {
    setPendingConfirm(null);
    setIsSubmitting(true);
    try {
      const { data: ev, error: evFetchError } = await supabase
        .from("evouchers").select("closing_journal_entry_id").eq("id", evoucherId).maybeSingle();
      if (evFetchError) throw evFetchError;

      if (ev?.closing_journal_entry_id) {
        const { data: originalJE, error: jeFetchError } = await supabase
          .from("journal_entries")
          .select("lines, description, total_debit, total_credit")
          .eq("id", ev.closing_journal_entry_id).maybeSingle();

        if (!jeFetchError && originalJE) {
          const reversalLines = (originalJE.lines as Array<{
            account_id: string; account_code: string; account_name: string;
            debit: number; credit: number; description: string;
          }>).map((line) => ({
            ...line,
            debit: line.credit,
            credit: line.debit,
            description: `REVERSAL: ${line.description}`,
          }));
          const reversalId = `JE-REV-${Date.now()}`;
          await supabase.from("journal_entries").insert({
            id: reversalId,
            entry_date: new Date().toISOString(),
            evoucher_id: evoucherId,
            description: `REVERSAL of ${ev.closing_journal_entry_id} — Correction Unlock by ${currentUser?.name}`,
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

      const { error: updateError } = await supabase
        .from("evouchers")
        .update({ status: "pending_accounting", closing_journal_entry_id: null, updated_at: new Date().toISOString() })
        .eq("id", evoucherId);
      if (updateError) throw updateError;

      if (actor) logActivity("evoucher", evoucherId, evoucherNumber, "updated", actor, { description: "Unlocked for correction" });
      await writeHistory("Unlocked for GL Correction — Original Entry Reversed", currentStatus, "pending_accounting");
      toast.success("E-Voucher unlocked — original journal entry reversed. Post a new GL entry.");
      onStatusChange?.();
    } catch {
      toast.error("Failed to unlock for correction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setIsSubmitting(true);
    try {
      const targetStatus = rejectingAs === "ceo" ? "pending_manager" : "draft";
      const action = rejectingAs === "ceo" ? "Rejected by CEO" : "Rejected by Manager";
      await transition(targetStatus, action, rejectionReason);
      if (currentUser?.id && requestorId) {
        createWorkflowTicket({
          subject: `Rejected: ${evoucherNumber}`,
          body: `Your E-Voucher ${evoucherNumber} was not approved by ${rejectingAs === "ceo" ? "the CEO" : "your Manager"}.\n\nReason: ${rejectionReason}`,
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
      setShowReject(false);
      setRejectionReason("");
      onStatusChange?.();
    } catch {
      toast.error("Failed to reject E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setPendingConfirm(null);
    setIsSubmitting(true);
    try {
      await transition("cancelled", "Cancelled by Requestor");
      toast.success("E-Voucher cancelled");
      onStatusChange?.();
    } catch {
      toast.error("Failed to cancel E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseLiquidation = async () => {
    setIsSubmitting(true);
    try {
      await transition("posted", "Verified & Posted by Accounting");
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
    } catch {
      toast.error("Failed to close liquidation");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Inline confirm zone ───────────────────────────────────────────────────

  const InlineConfirm = ({
    action,
    label,
    onConfirm,
  }: {
    action: "cancel" | "unlock";
    label: string;
    onConfirm: () => void;
  }) => (
    <div style={{
      padding: "12px 14px", borderRadius: "8px",
      border: "1px solid var(--theme-status-warning-border, var(--theme-border-default))",
      backgroundColor: "var(--theme-status-warning-bg)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
        <AlertTriangle size={13} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0, marginTop: "1px" }} />
        <span style={{ fontSize: "12px", color: "var(--theme-status-warning-fg)", fontWeight: 500, lineHeight: 1.5 }}>
          {action === "cancel"
            ? "This cannot be undone. The E-Voucher will be permanently cancelled."
            : "The original journal entry will be automatically reversed."}
        </span>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => setPendingConfirm(null)}
          style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
        >
          Keep
        </button>
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "none", backgroundColor: "var(--theme-status-danger-fg)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
        >
          {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : null}
          {label}
        </button>
      </div>
    </div>
  );


  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

        {/* Submit */}
        {canSubmit && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {isSubmitting ? "Submitting…" : "Submit for Approval"}
          </button>
        )}

        {/* TL / Manager: approve */}
        {canApproveAsTL && (
          <button
            onClick={handleTLApprove}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {isSubmitting ? "Approving…" : "Approve"}
          </button>
        )}

        {/* TL / Manager: reject */}
        {canRejectAsTL && !showReject && (
          <button
            onClick={() => { setRejectingAs("manager"); setShowReject(true); }}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "transparent", color: "var(--theme-status-danger-fg)", border: "1px solid var(--theme-border-default)", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <XCircle size={14} />
            Reject
          </button>
        )}

        {/* CEO / Executive: approve */}
        {canApproveAsCEO && (
          <button
            onClick={handleCEOApprove}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {isSubmitting ? "Approving…" : "Approve (CEO)"}
          </button>
        )}

        {/* CEO: reject */}
        {canRejectAsCEO && !showReject && (
          <button
            onClick={() => { setRejectingAs("ceo"); setShowReject(true); }}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "transparent", color: "var(--theme-status-danger-fg)", border: "1px solid var(--theme-border-default)", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <XCircle size={14} />
            Reject
          </button>
        )}

        {/* Inline reject zone */}
        {showReject && (
          <div style={{
            padding: "12px 14px", borderRadius: "8px",
            border: "1px solid var(--theme-status-danger-border, var(--theme-border-default))",
            backgroundColor: "var(--theme-status-danger-bg)",
            display: "flex", flexDirection: "column", gap: "10px",
          }}>
            <label
              htmlFor="ev-reject-reason"
              style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-status-danger-fg)" }}
            >
              Reason for rejection — the requestor will see this
            </label>
            <textarea
              id="ev-reject-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason…"
              rows={3}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: "6px",
                border: "1px solid var(--theme-border-default)",
                fontSize: "13px", fontFamily: "inherit", resize: "vertical",
                outline: "none", boxSizing: "border-box",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-primary)",
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { setShowReject(false); setRejectionReason(""); }}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "none", backgroundColor: "var(--theme-status-danger-fg)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: isSubmitting || !rejectionReason.trim() ? "not-allowed" : "pointer", opacity: !rejectionReason.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
              >
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Confirm Rejection
              </button>
            </div>
          </div>
        )}

        {/* Accounting: Disburse — navigate to full disbursement page */}
        {canDisburse && (
          <button
            onClick={() => navigate(`/evouchers/${evoucherId}/disburse?from=${from}`)}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <CheckCircle size={15} />
            Disburse
          </button>
        )}

        {/* Accounting: Verify & Post */}
        {canVerifyAndPost && (
          <button
            onClick={() => setShowGLSheet(true)}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <CheckCircle size={15} />
            Verify & Post
          </button>
        )}

        {/* Accounting Manager: Unlock for GL Correction */}
        {canUnlockForCorrection && pendingConfirm !== "unlock" && (
          <button
            onClick={() => setPendingConfirm("unlock")}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-warning-fg)", border: "1px solid var(--theme-status-warning-fg)", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <Unlock size={15} />
            Unlock for GL Correction
          </button>
        )}
        {pendingConfirm === "unlock" && (
          <InlineConfirm action="unlock" label="Unlock & Reverse" onConfirm={handleUnlockForCorrection} />
        )}

        {/* Requestor: open liquidation */}
        {canOpenLiquidation && !showLiquidationForm && (
          <button
            onClick={async () => {
              if (currentStatus === "pending_liquidation") {
                const { data } = await supabase
                  .from("liquidation_submissions")
                  .select("total_spend, unused_return")
                  .eq("evoucher_id", evoucherId);
                const rows = data ?? [];
                setPreviousTotalSpent(rows.reduce((s: number, r: any) => s + (r.total_spend ?? 0), 0));
                setPreviousTotalReturned(rows.reduce((s: number, r: any) => s + (r.unused_return ?? 0), 0));
              }
              setShowLiquidationForm(true);
            }}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", cursor: "pointer" }}
          >
            <ClipboardList size={15} />
            {currentStatus === "pending_liquidation" ? "Add More Receipts" : "Submit Liquidation"}
          </button>
        )}

        {/* Accounting: close liquidation */}
        {canCloseLiquidation && (
          <button
            onClick={handleCloseLiquidation}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {isSubmitting ? "Closing…" : "Close Liquidation"}
          </button>
        )}

        {/* Requestor: cancel */}
        {canCancel && pendingConfirm !== "cancel" && (
          <button
            onClick={() => setPendingConfirm("cancel")}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-border-default)", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <Ban size={15} />
            Cancel E-Voucher
          </button>
        )}
        {pendingConfirm === "cancel" && (
          <InlineConfirm action="cancel" label="Yes, Cancel" onConfirm={handleCancel} />
        )}

        {noActionsAvailable && (
          <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", textAlign: "center", padding: "8px 0" }}>
            No actions available for your role at this stage.
          </p>
        )}
      </div>

      {/* GL Confirmation Sheet */}
      {showGLSheet && currentUser && (
        <GLConfirmationSheet
          isOpen={showGLSheet}
          onClose={() => setShowGLSheet(false)}
          evoucherId={evoucherId}
          evoucherNumber={evoucherNumber}
          transactionType={transactionType as EVoucherAPType}
          amount={amount}
          currentUser={{ id: currentUser.id, name: currentUser.name, department: currentUser.department }}
          onPosted={() => { setShowGLSheet(false); onStatusChange?.(); }}
        />
      )}

      {/* Liquidation Form — inline, expands below the action buttons */}
      {currentUser && (
        <LiquidationForm
          isOpen={showLiquidationForm}
          onClose={() => setShowLiquidationForm(false)}
          evoucherId={evoucherId}
          evoucherNumber={evoucherNumber}
          advanceAmount={amount}
          currentUser={{ id: currentUser.id, name: currentUser.name }}
          onSubmitted={() => { setShowLiquidationForm(false); onStatusChange?.(); }}
          inline
          previousTotalSpent={previousTotalSpent > 0 ? previousTotalSpent : undefined}
          previousTotalReturned={previousTotalReturned > 0 ? previousTotalReturned : undefined}
        />
      )}
    </>
  );
}
