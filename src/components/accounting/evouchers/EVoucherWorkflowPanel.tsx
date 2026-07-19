import { supabase } from "../../../utils/supabase/client";
import { usePermission } from "../../../context/PermissionProvider";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { logActivity, logApproval } from "../../../utils/activityLog";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  CheckCircle, XCircle, Send, Ban, Loader2, ClipboardList, Unlock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { LiquidationForm } from "./LiquidationForm";
import { postJournalEntry } from "../../../utils/accounting/postTransactionJournal";
import { buildTransferEntry } from "../../../utils/accounting/buildTransferEntry";
import { ensureExpensePayableEntry } from "../../../utils/accounting/buildExpensePayableEntry";
import type { EVoucherAPType } from "../../../types/evoucher";
import { ensureBillableExpenseBillingItem } from "../../../utils/evoucherApproval";
import { recordNotificationEvent } from "../../../utils/notifications";

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
  cashReceiverId?: string;
  /** NEU-050: ISO timestamp when the cash receiver confirmed receipt (from
   *  details.receipt_confirmed_at). Undefined = not yet confirmed. */
  receiptConfirmedAt?: string;
  /** NEU-051 (slice 3): ISO timestamp when Treasury confirmed receipt of unused
   *  cash returned by the requestor (from details.cash_return_confirmed_at). */
  cashReturnConfirmedAt?: string;
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
  cashReceiverId,
  receiptConfirmedAt,
  cashReturnConfirmedAt,
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

  // Inline confirm for destructive actions (cancel, unlock) + receipt confirm (NEU-050)
  // + cash-return confirm (NEU-051 slice 3)
  const [pendingConfirm, setPendingConfirm] = useState<"cancel" | "unlock" | "receipt" | "cashreturn" | null>(null);

  // NEU-051 (slices 2/3): liquidation review data for the Treasury verifier —
  // whether every receipt line has an attachment, and how much unused cash the
  // requestor must return. Loaded only when a voucher is at pending_verification.
  const [liqReview, setLiqReview] = useState<{
    receiptsComplete: boolean;
    missingReceipts: number;
    unusedReturn: number;
  } | null>(null);

  // Inline reject zone
  const [showReject, setShowReject] = useState(false);
  const [rejectingAs, setRejectingAs] = useState<"manager" | "ceo" | "late">("manager");
  const [rejectionReason, setRejectionReason] = useState("");

  const [showLiquidationForm, setShowLiquidationForm] = useState(false);

  // NEU-051: when a voucher is awaiting Treasury verification, load its
  // liquidation submissions to check receipt-attachment completeness (slice 2)
  // and the total unused cash to be returned (slice 3). Re-runs on refetch via
  // cashReturnConfirmedAt (which changes when Treasury confirms the return).
  useEffect(() => {
    if (currentStatus !== "pending_verification") { setLiqReview(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("liquidation_submissions")
        .select("line_items, unused_return")
        .eq("evoucher_id", evoucherId);
      if (cancelled) return;
      const rows = data ?? [];
      const items = rows.flatMap((r) => (Array.isArray(r.line_items) ? r.line_items : []));
      const missingReceipts = items.filter((li: any) => !li?.receipt_url).length;
      const unusedReturn = rows.reduce((s, r) => s + (Number(r.unused_return) || 0), 0);
      setLiqReview({
        receiptsComplete: items.length > 0 && missingReceipts === 0,
        missingReceipts,
        unusedReturn,
      });
    })();
    return () => { cancelled = true; };
  }, [currentStatus, evoucherId, cashReturnConfirmedAt]);

  const userId = currentUser?.id;
  const isOwner = !requestorId || requestorId === userId;
  // NEU-045: the cash receiver is the one who liquidates. Falls back to the
  // requestor when no receiver was named (same-person case / legacy vouchers).
  const isLiquidator = cashReceiverId ? cashReceiverId === userId : isOwner;
  const actor = currentUser
    ? { id: currentUser.id, name: currentUser.name, department: currentUser.department ?? "" }
    : null;

  // ── Permission gates ──────────────────────────────────────────────────────
  // NEU-012 Phase 5b: gates mirror the evouchers RLS — dept-manager step =
  // my_evouchers:approve (DB additionally enforces the requestor-department
  // match), CEO/Accounting steps = acct_evouchers:approve.
  const { can } = usePermission();
  const holdsManagerGate = can("my_evouchers", "approve");
  const holdsAccountingGate = can("acct_evouchers", "approve");
  // NEU-042: disbursement is a distinct Treasury capability, split off from the
  // approve gate (which now covers CEO approval / verify-and-post / unlock only).
  const holdsDisburseGate = can("acct_evouchers", "disburse");

  // Audit #19: submitting is an edit — DB requires my_evouchers:edit. Gate the
  // button on it so view-only roles (TL/Sup/Mgr with V/VX) don't see a button
  // that silently bounces at RLS.
  const canSubmit = isOwner && currentStatus === "draft" && can("my_evouchers", "edit");
  // NEU-096: the requestor can cancel/void their own voucher at any stage BEFORE
  // cash moves (draft/rejected + the whole pending approval chain). Once disbursed
  // or posted it needs a reversal (accounting's Unlock/Reverse), not a cancel.
  const canCancel = isOwner &&
    ["draft", "rejected", "pending_manager", "pending_ceo", "pending_accounting"].includes(currentStatus);

  // NEU-095: a fund transfer routes to an Executive manager (Mark Javier) who
  // "processes" it — builds the Dr To / Cr From entry — instead of the normal
  // manager→ceo→accounting chain. So the standard TL approve is swapped for a
  // dedicated Process action on transfers at the manager stage.
  const isFundTransfer   = transactionType === "fund_transfer";
  const canApproveAsTL   = holdsManagerGate && currentStatus === "pending_manager" && !isFundTransfer;
  const canRejectAsTL    = holdsManagerGate && currentStatus === "pending_manager";
  const canProcessTransfer =
    isFundTransfer && currentStatus === "pending_manager" && holdsManagerGate &&
    currentUser?.department === "Executive";
  const canApproveAsCEO  = holdsAccountingGate && currentStatus === "pending_ceo";
  const canRejectAsCEO   = holdsAccountingGate && currentStatus === "pending_ceo";
  // NEU-098: back-track a post-approval voucher to the requestor for revision
  // (full re-traverse). Scoped to `pending_accounting` — i.e. after the approval
  // chain but BEFORE any cash moves; bouncing a disbursed/liquidating voucher would
  // need reversal logic, so that's out of scope for a simple back-track.
  const canSendBack =
    (holdsAccountingGate || holdsDisburseGate) && currentStatus === "pending_accounting";
  const canDisburse      = holdsDisburseGate && currentStatus === "pending_accounting";
  // NEU-051: Treasury (not generic Accounting) verifies + posts liquidations.
  const canVerifyAndPost = holdsDisburseGate && currentStatus === "pending_verification";
  const canUnlockForCorrection = holdsAccountingGate && currentStatus === "posted";

  const isAdvanceType = transactionType === "cash_advance" || transactionType === "budget_request";
  // NEU-050: the tagged cash receiver acknowledges receipt of the disbursed cash
  // before liquidating. A flag in details (no new status) — voucher stays `disbursed`.
  const canConfirmReceipt =
    isLiquidator && isAdvanceType && currentStatus === "disbursed" && !receiptConfirmedAt;
  // Liquidation is now sequenced AFTER receipt confirmation: once disbursed, the
  // receiver must confirm receipt first; once in pending_liquidation it stays open.
  const canOpenLiquidation =
    isLiquidator && isAdvanceType &&
    ((currentStatus === "disbursed" && !!receiptConfirmedAt) || currentStatus === "pending_liquidation");
  const canCloseLiquidation =
    holdsDisburseGate && currentStatus === "pending_verification";

  // NEU-051 slice 3: Treasury confirms receipt of unused cash the requestor is
  // returning (unused_return > 0) before the liquidation can be posted. The
  // reverse case (company owes the requestor / overspend) is handled by the
  // auto-created reimbursement EV and its own NEU-050 receipt confirmation.
  const unusedReturn = liqReview?.unusedReturn ?? 0;
  const needsCashReturnConfirm = unusedReturn > 0 && !cashReturnConfirmedAt;
  const canConfirmCashReturn =
    holdsDisburseGate && currentStatus === "pending_verification" && needsCashReturnConfirm;

  // NEU-051 slices 2+3: a liquidation may only be verified/posted once (2) every
  // receipt line has an attachment and (3) any unused cash return is confirmed.
  const liquidationReady =
    currentStatus !== "pending_verification" ||
    (liqReview !== null && liqReview.receiptsComplete && !needsCashReturnConfirm);
  const liquidationBlockReason =
    currentStatus !== "pending_verification" || liquidationReady
      ? null
      : liqReview === null
      ? "Loading liquidation…"
      : !liqReview.receiptsComplete
      ? `${liqReview.missingReceipts} receipt${liqReview.missingReceipts === 1 ? "" : "s"} missing an attachment — the handler must attach ${liqReview.missingReceipts === 1 ? "it" : "them"} before this can be verified.`
      : needsCashReturnConfirm
      ? `Confirm receipt of the ₱${unusedReturn.toLocaleString()} cash return before posting.`
      : null;

  const noActionsAvailable =
    !canSubmit && !canApproveAsTL && !canRejectAsTL && !canApproveAsCEO && !canRejectAsCEO &&
    !canDisburse && !canVerifyAndPost && !canConfirmReceipt && !canConfirmCashReturn &&
    !canOpenLiquidation && !canCloseLiquidation && !canUnlockForCorrection && !canCancel &&
    !canProcessTransfer && !canSendBack;

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
    // Audit #4/#8: an RLS-blocked UPDATE affects 0 rows WITHOUT throwing, so the
    // caller would otherwise report success while nothing changed. .select() lets
    // us detect the no-op (visibility-dial / department-scope mismatch) and turn
    // a silent false-success into an honest, actionable error.
    const { data, error } = await supabase
      .from("evouchers")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", evoucherId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        "You don't have permission to perform this action on this E-Voucher (it may belong to another department, or its status changed). Refresh and try again.",
      );
    }
    await writeHistory(action, currentStatus, newStatus, notes);

    // AP two-step: arriving at `pending_accounting` = final approval. Recognize
    // the payable (Dr Expense / Cr AP) into the Transaction Journal BEFORE
    // disbursement. Idempotent + advance-exempt inside the helper. Wrapped so a
    // recognition hiccup never rolls back the approval that already committed.
    if (newStatus === "pending_accounting") {
      try {
        await ensureExpensePayableEntry(evoucherId, evoucherNumber, {
          id: currentUser?.id ?? "",
          name: currentUser?.name ?? null,
        });
      } catch (e) {
        console.error("[payable] recognition failed:", e);
      }
    }
  };

  // NEU-095: the Executive approver (Mark) processes a fund transfer — builds the
  // Dr To / Cr From entry into the Transaction Journal and closes the voucher.
  const handleProcessTransfer = async () => {
    setIsSubmitting(true);
    try {
      const result = await buildTransferEntry({
        evoucherId,
        evoucherNumber,
        actor: { id: currentUser?.id ?? "", name: currentUser?.name ?? null },
      });
      if (!result) {
        toast.error("Couldn't build the transfer entry — check the From/To accounts.");
        return;
      }
      await transition(
        "posted",
        "Transfer Processed — entry queued in the Transaction Journal",
        `${currentUser?.name} processed the transfer`,
      );
      toast.success("Transfer processed — entry queued in the Transaction Journal for posting");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process transfer");
    } finally {
      setIsSubmitting(false);
    }
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit E-Voucher");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
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
      // NEU-098: back-track always returns the voucher to the requestor (draft)
      // for a full re-traverse of the approval chain — from ANY stage, no
      // partial mgr/ceo hop. The reason is carried so the requestor knows why.
      const targetStatus = "draft";
      const byLabel = rejectingAs === "ceo" ? "the CEO"
        : rejectingAs === "late" ? "Accounting"
        : "your Manager";
      const action = `Sent back to requestor by ${rejectingAs === "ceo" ? "CEO" : rejectingAs === "late" ? "Accounting" : "Manager"}`;
      await transition(targetStatus, action, rejectionReason);
      if (currentUser?.id && requestorId) {
        createWorkflowTicket({
          subject: `Sent back: ${evoucherNumber}`,
          body: `Your E-Voucher ${evoucherNumber} was sent back for revision by ${byLabel}.\n\nReason: ${rejectionReason}\n\nUpdate it and resubmit — it will go through the full approval chain again.`,
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
      void recordNotificationEvent({
        actorUserId: currentUser?.id ?? null,
        module: "accounting",
        subSection: "evouchers",
        entityType: "evoucher",
        entityId: evoucherId,
        kind: "rejected",
        summary: {
          label: `E-Voucher ${evoucherNumber} sent back for revision`,
          reference: evoucherNumber,
          to_status: targetStatus,
        },
        recipientIds: [requestorId ?? null],
      });
      toast.success("Sent back to the requestor for revision");
      setShowReject(false);
      setRejectionReason("");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject E-Voucher");
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEU-102/C: Treasury verifies + posts the liquidation. The closing entry
  // (DR Expense per booking / DR Cash butal / CR 1150) was pre-built as
  // `ready_to_post` at final liquidation; posting it flips the voucher to
  // `posted` and clears the advance. Replaces the old GLConfirmationSheet +
  // no-JE "Close Liquidation" paths.
  const handleVerifyAndPostLiquidation = async () => {
    setIsSubmitting(true);
    try {
      const { data: closingJe } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("evoucher_id", evoucherId)
        .eq("kind", "liquidation")
        .eq("status", "ready_to_post")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!closingJe) {
        toast.error("No pending closing entry found — the handler must re-submit the liquidation.");
        return;
      }
      await postJournalEntry(closingJe.id, { id: currentUser?.id ?? null, name: currentUser?.name ?? null });
      // postJournalEntry's source-effect flips the voucher to `posted` + links the entry.
      await supabase.from("evoucher_history").insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucherId,
        action: "Liquidation Verified & Posted to General Journal",
        status: "posted",
        user_id: currentUser?.id,
        user_name: currentUser?.name,
        user_role: currentUser?.department,
        metadata: { previous_status: "pending_verification", new_status: "posted", journal_entry_id: closingJe.id },
        created_at: new Date().toISOString(),
      });
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
      void recordNotificationEvent({
        actorUserId: currentUser?.id ?? null,
        module: "accounting",
        subSection: "evouchers",
        entityType: "evoucher",
        entityId: evoucherId,
        kind: "posted",
        summary: {
          label: `E-Voucher ${evoucherNumber} verified and posted`,
          reference: evoucherNumber,
        },
        recipientIds: [requestorId ?? null],
      });
      toast.success("Liquidation verified and posted to the General Journal");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post liquidation");
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEU-050: cash receiver confirms receipt of the disbursed cash. Records a
  // marker in details + a workflow-history row, and notifies Treasury + requestor.
  // Status is unchanged (stays `disbursed`) — this just gates liquidation.
  const handleConfirmReceipt = async () => {
    setPendingConfirm(null);
    setIsSubmitting(true);
    try {
      // Merge into existing details so the cash_receiver_* fields aren't clobbered.
      const { data: cur } = await supabase
        .from("evouchers").select("details").eq("id", evoucherId).single();
      const rawDetails = (cur?.details as Record<string, unknown>) || {};
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("evouchers")
        .update({
          details: {
            ...rawDetails,
            receipt_confirmed_at: now,
            receipt_confirmed_by: userId,
            receipt_confirmed_by_name: currentUser?.name,
          },
          updated_at: now,
        })
        .eq("id", evoucherId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "You don't have permission to confirm receipt on this E-Voucher (only the tagged cash receiver can). Refresh and try again.",
        );
      }

      // NEU-100: acknowledging receipt releases the disbursement entry for posting
      // (awaiting_ack → ready_to_post). Treasury can then post it in the TJ.
      // The receiver is permitted to flip only their own advance entry via the
      // journal_entries_update_ack RLS carve-out (migration 248). Guard the write:
      // an RLS-blocked UPDATE affects 0 rows without throwing, so without this the
      // entry would silently strand at awaiting_ack (the original bug).
      const { data: ackData, error: ackError } = await supabase
        .from("journal_entries")
        .update({ status: "ready_to_post", acknowledged_at: now, acknowledged_by: userId, updated_at: now })
        .eq("evoucher_id", evoucherId)
        .eq("kind", "advance")
        .eq("status", "awaiting_ack")
        .select("id");
      if (ackError) throw ackError;
      if (isAdvanceType && (!ackData || ackData.length === 0)) {
        throw new Error(
          "Receipt was recorded, but the cash-advance entry couldn't be released for posting (a permissions issue). Please refresh and try again, or ask Accounting.",
        );
      }

      await writeHistory(
        "Cash Receipt Confirmed",
        currentStatus,
        currentStatus,
        `${currentUser?.name} confirmed receipt of ₱${amount.toLocaleString()}`,
      );

      // Notify Treasury (Accounting) + the requestor that the cash was received.
      if (currentUser?.id) {
        const body = `${currentUser.name} confirmed receipt of ₱${amount.toLocaleString()} for ${evoucherNumber}.`;
        createWorkflowTicket({
          subject: `Cash receipt confirmed: ${evoucherNumber}`,
          body,
          type: "fyi",
          recipientDept: "Accounting",
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "",
          autoCreated: true,
        });
        if (requestorId && requestorId !== userId) {
          createWorkflowTicket({
            subject: `Cash receipt confirmed: ${evoucherNumber}`,
            body,
            type: "fyi",
            recipientUserId: requestorId,
            linkedRecordType: "expense",
            linkedRecordId: evoucherId,
            createdBy: currentUser.id,
            createdByName: currentUser.name,
            createdByDept: currentUser.department || "",
            autoCreated: true,
          });
        }
      }
      toast.success("Receipt confirmed — you can now submit your liquidation");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm receipt");
    } finally {
      setIsSubmitting(false);
    }
  };

  // NEU-051 slice 3: Treasury confirms receipt of the unused cash returned by the
  // requestor. Marks details + history and notifies the requestor. Status stays
  // pending_verification — this just unblocks Verify & Post.
  const handleConfirmCashReturn = async () => {
    setPendingConfirm(null);
    setIsSubmitting(true);
    try {
      const { data: cur } = await supabase
        .from("evouchers").select("details").eq("id", evoucherId).single();
      const rawDetails = (cur?.details as Record<string, unknown>) || {};
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("evouchers")
        .update({
          details: {
            ...rawDetails,
            cash_return_confirmed_at: now,
            cash_return_confirmed_by: userId,
            cash_return_confirmed_by_name: currentUser?.name,
          },
          updated_at: now,
        })
        .eq("id", evoucherId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "You don't have permission to confirm the cash return (Treasury only). Refresh and try again.",
        );
      }
      await writeHistory(
        "Cash Return Received",
        currentStatus,
        currentStatus,
        `${currentUser?.name} confirmed receipt of ₱${unusedReturn.toLocaleString()} returned by the requestor`,
      );
      if (currentUser?.id && requestorId && requestorId !== userId) {
        createWorkflowTicket({
          subject: `Cash return received: ${evoucherNumber}`,
          body: `Treasury (${currentUser.name}) confirmed receipt of the ₱${unusedReturn.toLocaleString()} you returned for ${evoucherNumber}.`,
          type: "fyi",
          recipientUserId: requestorId,
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department || "",
          autoCreated: true,
        });
      }
      toast.success("Cash return confirmed — you can now verify and post");
      onStatusChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm cash return");
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

        {/* NEU-095: Executive (Mark) processes a fund transfer → builds the TJ entry */}
        {canProcessTransfer && (
          <button
            onClick={handleProcessTransfer}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {isSubmitting ? "Processing…" : "Process Transfer"}
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

        {/* NEU-098: Accounting/Treasury sends a post-approval voucher back to the
            requestor for revision (full re-traverse). */}
        {canSendBack && !showReject && (
          <button
            onClick={() => { setRejectingAs("late"); setShowReject(true); }}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "transparent", color: "var(--theme-status-warning-fg)", border: "1px solid var(--theme-status-warning-border, var(--theme-border-default))", cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <XCircle size={14} />
            Send Back to Requestor
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
              Reason for sending back — the requestor will see this
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
                Send Back
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

        {/* NEU-051: liquidation-review blockers (Treasury) — missing receipts / pending cash return */}
        {holdsDisburseGate && currentStatus === "pending_verification" && liquidationBlockReason && (
          <div style={{
            padding: "10px 12px", borderRadius: "8px",
            border: "1px solid var(--theme-status-warning-border, var(--theme-border-default))",
            backgroundColor: "var(--theme-status-warning-bg)",
            display: "flex", alignItems: "flex-start", gap: "8px",
          }}>
            <AlertTriangle size={13} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0, marginTop: "1px" }} />
            <span style={{ fontSize: "12px", color: "var(--theme-status-warning-fg)", fontWeight: 500, lineHeight: 1.5 }}>
              {liquidationBlockReason}
            </span>
          </div>
        )}

        {/* NEU-051 slice 3: Treasury confirms receipt of unused cash returned by requestor */}
        {canConfirmCashReturn && pendingConfirm !== "cashreturn" && (
          <button
            onClick={() => setPendingConfirm("cashreturn")}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <CheckCircle size={15} />
            Confirm Cash Return (₱{unusedReturn.toLocaleString()})
          </button>
        )}
        {pendingConfirm === "cashreturn" && (
          <div style={{
            padding: "12px 14px", borderRadius: "8px",
            border: "1px solid var(--theme-status-success-border, var(--theme-border-default))",
            backgroundColor: "var(--theme-status-success-bg)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
              <CheckCircle size={13} style={{ color: "var(--theme-status-success-fg)", flexShrink: 0, marginTop: "1px" }} />
              <span style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500, lineHeight: 1.5 }}>
                Confirm Treasury received ₱{unusedReturn.toLocaleString()} returned by the requestor. This will be recorded in the workflow history.
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
              >
                Not yet
              </button>
              <button
                onClick={handleConfirmCashReturn}
                disabled={isSubmitting}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "none", backgroundColor: "var(--theme-status-success-fg)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
              >
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Yes, received
              </button>
            </div>
          </div>
        )}

        {/* Accounting (Treasury): Verify & Post the pre-built closing entry —
            gated on receipts complete + cash return confirmed. */}
        {canVerifyAndPost && (
          <button
            onClick={handleVerifyAndPostLiquidation}
            disabled={isSubmitting || !liquidationReady}
            style={{ ...btnBase, backgroundColor: "var(--theme-status-success-fg)", color: "#fff", opacity: (isSubmitting || !liquidationReady) ? 0.5 : 1, cursor: (isSubmitting || !liquidationReady) ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {isSubmitting ? "Posting…" : "Verify & Post"}
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

        {/* Cash receiver: confirm receipt (NEU-050) — sequenced before liquidation */}
        {canConfirmReceipt && pendingConfirm !== "receipt" && (
          <button
            onClick={() => setPendingConfirm("receipt")}
            disabled={isSubmitting}
            style={{ ...btnBase, backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            <CheckCircle size={15} />
            Confirm Receipt
          </button>
        )}
        {pendingConfirm === "receipt" && (
          <div style={{
            padding: "12px 14px", borderRadius: "8px",
            border: "1px solid var(--theme-status-success-border, var(--theme-border-default))",
            backgroundColor: "var(--theme-status-success-bg)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
              <CheckCircle size={13} style={{ color: "var(--theme-status-success-fg)", flexShrink: 0, marginTop: "1px" }} />
              <span style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500, lineHeight: 1.5 }}>
                Confirm you received ₱{amount.toLocaleString()} in cash. This will be recorded in the workflow history.
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
              >
                Not yet
              </button>
              <button
                onClick={handleConfirmReceipt}
                disabled={isSubmitting}
                style={{ flex: 1, padding: "7px", borderRadius: "6px", border: "none", backgroundColor: "var(--theme-status-success-fg)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
              >
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Yes, I received it
              </button>
            </div>
          </div>
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
