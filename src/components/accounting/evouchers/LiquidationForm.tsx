import { useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { logCreation, logStatusChange } from "../../../utils/activityLog";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { toast } from "sonner@2.0.3";
import { SidePanel } from "../../common/SidePanel";
import type { LiquidationLineItem } from "../../../types/evoucher";

interface LiquidationFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** The parent cash_advance or budget_request EV */
  evoucherId: string;
  evoucherNumber: string;
  advanceAmount: number;
  currentUser: { id: string; name: string };
  onSubmitted?: () => void;
  /** When true, renders inline (no SidePanel wrapper) */
  inline?: boolean;
}

function newLineItem(): LiquidationLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    amount: 0,
  };
}

export function LiquidationForm({
  isOpen,
  onClose,
  evoucherId,
  evoucherNumber,
  advanceAmount,
  currentUser,
  onSubmitted,
  inline = false,
}: LiquidationFormProps) {
  const [lineItems, setLineItems] = useState<LiquidationLineItem[]>([newLineItem()]);
  const [unusedReturn, setUnusedReturn] = useState<string>("");
  const [isFinal, setIsFinal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalSpend = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const overspend = totalSpend - advanceAmount;
  const hasOverspend = isFinal && overspend > 0;

  const updateItem = (id: string, field: keyof LiquidationLineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => setLineItems((prev) => [...prev, newLineItem()]);

  const removeItem = (id: string) => {
    if (lineItems.length === 1) return; // keep at least one row
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async () => {
    // Validate: all line items need a description and positive amount
    const hasEmptyRows = lineItems.some((item) => !item.description.trim() || !item.amount);
    if (hasEmptyRows) {
      toast.error("All receipt lines need a description and amount");
      return;
    }

    if (isFinal && hasOverspend) {
      // Auto-create a Reimbursement EV after this submission completes
      const confirmMsg = `Your spend (₱${totalSpend.toLocaleString()}) exceeds the advance (₱${advanceAmount.toLocaleString()}) by ₱${overspend.toLocaleString()}. A Reimbursement E-Voucher will be created for this difference. Proceed?`;
      if (!confirm(confirmMsg)) return;
    }

    setSubmitting(true);
    try {
      // 1. Create the liquidation submission record
      const { error: submissionError } = await supabase
        .from("liquidation_submissions")
        .insert({
          evoucher_id: evoucherId,
          submitted_by: currentUser.id,
          submitted_by_name: currentUser.name,
          line_items: lineItems,
          total_spend: totalSpend,
          unused_return: isFinal && unusedReturn ? Number(unusedReturn) : null,
          is_final: isFinal,
          status: "pending",
          submitted_at: new Date().toISOString(),
        });

      if (submissionError) throw submissionError;

      // 2. If final submission, transition EV to pending_verification
      if (isFinal) {
        const { error: evError } = await supabase
          .from("evouchers")
          .update({ status: "pending_verification", liquidated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", evoucherId);
        if (evError) throw evError;

        const actor = { id: currentUser.id, name: currentUser.name, department: "" };
        logStatusChange("evoucher", evoucherId, evoucherNumber, "pending_liquidation", "pending_verification", actor);

        await supabase.from("evoucher_history").insert({
          id: `EH-${Date.now()}`,
          evoucher_id: evoucherId,
          action: "Liquidation Submitted (Final) — Pending Accounting Verification",
          status: "pending_verification",
          user_id: currentUser.id,
          user_name: currentUser.name,
          user_role: "Handler",
          metadata: {
            previous_status: "pending_liquidation",
            new_status: "pending_verification",
          },
          created_at: new Date().toISOString(),
        });

        // 3. Auto-create Reimbursement EV if overspend
        if (hasOverspend) {
          const reimbursementId = `EV-REIMB-${Date.now()}`;
          const reimbursementCreatedAt = new Date().toISOString();
          const { error: reimburseError } = await supabase
            .from("evouchers")
            .insert({
              id: reimbursementId,
              evoucher_number: reimbursementId,
              transaction_type: "reimbursement",
              source_module: "operations",
              status: "draft",
              amount: overspend,
              currency: "PHP",
              purpose: `Reimbursement for overspend on ${evoucherNumber}`,
              description: `Automatically created from liquidation of ${evoucherNumber}. Handler spent ₱${overspend.toLocaleString()} beyond the approved advance.`,
              vendor_name: currentUser.name,
              created_by: currentUser.id,
              created_by_name: currentUser.name,
              details: {
                requestor_id: currentUser.id,
                requestor_name: currentUser.name,
                parent_voucher_id: evoucherId,
                request_date: reimbursementCreatedAt.split("T")[0],
              },
              created_at: reimbursementCreatedAt,
              updated_at: reimbursementCreatedAt,
            });

          if (reimburseError) {
            console.warn("Reimbursement EV creation failed — create manually:", reimburseError);
            toast.warning("Overspend reimbursement EV could not be auto-created. Please create it manually.");
          } else {
            const reimburseActor = { id: currentUser.id, name: currentUser.name, department: "" };
            logCreation("evoucher", reimbursementId, `Reimbursement for ${evoucherNumber}`, reimburseActor);
            toast.info(`A draft Reimbursement EV for ₱${overspend.toLocaleString()} has been created. Submit it separately.`);
          }
        }

        // Notify Accounting: liquidation submitted for verification
        createWorkflowTicket({
          subject: `Verify Liquidation: ${evoucherNumber}`,
          body: `Liquidation receipts for ${evoucherNumber} are ready for your verification.\n\nTotal spend: ₱${totalSpend.toLocaleString()}`,
          type: "request",
          recipientDept: "Accounting",
          linkedRecordType: "expense",
          linkedRecordId: evoucherId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: "",
          autoCreated: true,
        });
        toast.success("Liquidation submitted for Accounting review");
      } else {
        // Incremental submission — ensure EV is in pending_liquidation
        await supabase
          .from("evouchers")
          .update({ status: "pending_liquidation", updated_at: new Date().toISOString() })
          .eq("id", evoucherId)
          .in("status", ["disbursed", "pending_liquidation"]); // safe: only transitions from valid states

        toast.success("Receipts saved. Add more anytime, or submit as final when done.");
      }

      onSubmitted?.();
      onClose();
    } catch (error) {
      console.error("Liquidation submission error:", error);
      toast.error("Failed to submit liquidation");
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--theme-border-default)", display: "flex", flexDirection: "column", gap: "12px", backgroundColor: "var(--theme-bg-surface)" }}>
      {/* Final submission toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "8px", backgroundColor: isFinal ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface-subtle)", border: "1px solid var(--theme-border-default)" }}>
        <input
          type="checkbox"
          id="is-final"
          checked={isFinal}
          onChange={(e) => setIsFinal(e.target.checked)}
          style={{ width: "16px", height: "16px", cursor: "pointer" }}
        />
        <label htmlFor="is-final" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", cursor: "pointer" }}>
          This is my final submission — close the advance and send to Accounting for review
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <button
          onClick={onClose}
          style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ height: "40px", padding: "0 24px", borderRadius: "8px", backgroundColor: "var(--theme-action-primary-bg)", border: "none", color: "var(--theme-action-primary-text)", fontSize: "13px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: submitting ? 0.8 : 1 }}
        >
          {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {isFinal ? "Submit & Close Advance" : "Save Receipts"}
        </button>
      </div>
    </div>
  );

  const formBody = (
    <div style={{ padding: inline ? "20px 0 0 0" : "24px", overflowY: inline ? undefined : "auto", height: inline ? undefined : "100%" }}>

        {/* Advance summary */}
        <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", border: "1px solid var(--theme-border-default)", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Cash Advance</span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
              {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(advanceAmount)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Total spent (this session)</span>
            <span style={{ fontSize: "14px", fontWeight: 600, color: totalSpend > advanceAmount ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
              {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(totalSpend)}
            </span>
          </div>
          {totalSpend > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Balance remaining</span>
              <span style={{ fontSize: "12px", color: advanceAmount - totalSpend < 0 ? "var(--theme-status-danger-fg)" : "var(--theme-status-success-fg)", fontWeight: 500 }}>
                {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(advanceAmount - totalSpend)}
              </span>
            </div>
          )}
        </div>

        {/* Overspend warning */}
        {hasOverspend && (
          <div style={{ display: "flex", gap: "10px", padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-status-danger-bg)", border: "1px solid var(--theme-status-danger-border)", marginBottom: "20px" }}>
            <AlertTriangle size={16} style={{ color: "var(--theme-status-danger-fg)", flexShrink: 0, marginTop: "1px" }} />
            <p style={{ fontSize: "13px", color: "var(--theme-status-danger-fg)", lineHeight: "1.5" }}>
              You have exceeded the advance by{" "}
              <strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(overspend)}</strong>.
              A Reimbursement E-Voucher will be created automatically on submission.
            </p>
          </div>
        )}

        {/* Receipt line items */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>Receipt Line Items</p>
            <button
              onClick={addItem}
              style={{ height: "32px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-secondary)", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Plus size={14} />
              Add receipt
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {lineItems.map((item, index) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: "8px", alignItems: "start" }}>
                {/* Description */}
                <div>
                  <label
                    htmlFor={`li-desc-${item.id}`}
                    style={{ display: index === 0 ? "block" : "none", fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}
                  >
                    Description
                  </label>
                  <input
                    id={`li-desc-${item.id}`}
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    placeholder="e.g., Port charges, fuel, etc."
                    aria-label={index > 0 ? `Receipt description ${index + 1}` : undefined}
                    style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                  />
                </div>

                {/* Amount */}
                <div>
                  <label
                    htmlFor={`li-amt-${item.id}`}
                    style={{ display: index === 0 ? "block" : "none", fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}
                  >
                    Amount (₱)
                  </label>
                  <input
                    id={`li-amt-${item.id}`}
                    type="number"
                    value={item.amount || ""}
                    onChange={(e) => updateItem(item.id, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    aria-label={index > 0 ? `Receipt amount ${index + 1}` : undefined}
                    style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                  />
                </div>

                {/* Remove */}
                <div style={{ paddingTop: index === 0 ? "20px" : "0" }}>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={lineItems.length === 1}
                    style={{ width: "32px", height: "36px", borderRadius: "6px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", cursor: lineItems.length === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: lineItems.length === 1 ? 0.4 : 1 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Unused cash return (final submission only) */}
        {isFinal && (
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px" }}>Unused Cash to Return</p>
            <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "8px" }}>
              If you have unspent cash from the advance, enter the amount being returned.
            </p>
            <input
              type="number"
              value={unusedReturn}
              onChange={(e) => setUnusedReturn(e.target.value)}
              placeholder="0.00"
              min={0}
              step={0.01}
              style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
            />
          </div>
        )}
      </div>
  );

  if (inline) {
    if (!isOpen) return null;
    return (
      <div style={{ borderTop: "1px solid var(--theme-border-default)", marginTop: "16px" }}>
        {formBody}
        {footer}
      </div>
    );
  }

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={`Liquidate ${evoucherNumber}`} footer={footer} width="560px">
      {formBody}
    </SidePanel>
  );
}
