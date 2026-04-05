import { useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { logCreation, logStatusChange } from "../../../utils/activityLog";
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

      // 2. If final submission, transition EV to liquidation_pending
      if (isFinal) {
        const { error: evError } = await supabase
          .from("evouchers")
          .update({ status: "liquidation_pending", updated_at: new Date().toISOString() })
          .eq("id", evoucherId);
        if (evError) throw evError;

        const actor = { id: currentUser.id, name: currentUser.name, department: "" };
        logStatusChange("evoucher", evoucherId, evoucherNumber, "liquidation_open", "liquidation_pending", actor);

        await supabase.from("evoucher_history").insert({
          id: `EH-${Date.now()}`,
          evoucher_id: evoucherId,
          action: "Liquidation Submitted (Final) — Pending Accounting Review",
          previous_status: "liquidation_open",
          new_status: "liquidation_pending",
          performed_by: currentUser.id,
          performed_by_name: currentUser.name,
          performed_by_role: "Handler",
          created_at: new Date().toISOString(),
        });

        // 3. Auto-create Reimbursement EV if overspend
        if (hasOverspend) {
          const { error: reimburseError } = await supabase
            .from("evouchers")
            .insert({
              id: `EV-REIMB-${Date.now()}`,
              transaction_type: "reimbursement",
              status: "draft",
              requestor_id: currentUser.id,
              requestor_name: currentUser.name,
              amount: overspend,
              currency: "PHP",
              purpose: `Reimbursement for overspend on ${evoucherNumber}`,
              description: `Automatically created from liquidation of ${evoucherNumber}. Handler spent ₱${overspend.toLocaleString()} beyond the approved advance.`,
              vendor_name: currentUser.name,
              parent_voucher_id: evoucherId,
              approvers: [],
              workflow_history: [],
              request_date: new Date().toISOString().split("T")[0],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (reimburseError) {
            console.warn("Reimbursement EV creation failed — create manually:", reimburseError);
            toast.warning("Overspend reimbursement EV could not be auto-created. Please create it manually.");
          } else {
            const reimburseActor = { id: currentUser.id, name: currentUser.name, department: "" };
            logCreation("evoucher", `EV-REIMB-${Date.now()}`, `Reimbursement for ${evoucherNumber}`, reimburseActor);
            toast.info(`A draft Reimbursement EV for ₱${overspend.toLocaleString()} has been created. Submit it separately.`);
          }
        }

        toast.success("Liquidation submitted for Accounting review");
      } else {
        // Incremental submission — ensure EV is in liquidation_open
        await supabase
          .from("evouchers")
          .update({ status: "liquidation_open", updated_at: new Date().toISOString() })
          .eq("id", evoucherId)
          .in("status", ["posted", "liquidation_open"]); // safe: only transitions from valid states

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
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", flexDirection: "column", gap: "12px", backgroundColor: "var(--neuron-bg-elevated)" }}>
      {/* Final submission toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "8px", backgroundColor: isFinal ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface-subtle)", border: "1px solid var(--neuron-ui-border)" }}>
        <input
          type="checkbox"
          id="is-final"
          checked={isFinal}
          onChange={(e) => setIsFinal(e.target.checked)}
          style={{ width: "16px", height: "16px", cursor: "pointer" }}
        />
        <label htmlFor="is-final" style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", cursor: "pointer" }}>
          This is my final submission — close the advance and send to Accounting for review
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <button
          onClick={onClose}
          style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--neuron-ink-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ height: "40px", padding: "0 24px", borderRadius: "8px", backgroundColor: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: "13px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: submitting ? 0.8 : 1 }}
        >
          {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {isFinal ? "Submit & Close Advance" : "Save Receipts"}
        </button>
      </div>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={`Liquidate ${evoucherNumber}`} footer={footer} width="560px">
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        {/* Advance summary */}
        <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", border: "1px solid var(--neuron-ui-border)", marginBottom: "24px" }}>
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
              style={{ height: "32px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-secondary)", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
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
                  {index === 0 && (
                    <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Description</p>
                  )}
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    placeholder="e.g., Port charges, fuel, etc."
                    style={{ width: "100%", height: "36px", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                {/* Amount */}
                <div>
                  {index === 0 && (
                    <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Amount (₱)</p>
                  )}
                  <input
                    type="number"
                    value={item.amount || ""}
                    onChange={(e) => updateItem(item.id, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    style={{ width: "100%", height: "36px", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                {/* Remove */}
                <div style={{ paddingTop: index === 0 ? "20px" : "0" }}>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={lineItems.length === 1}
                    style={{ width: "32px", height: "36px", borderRadius: "6px", border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", cursor: lineItems.length === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: lineItems.length === 1 ? 0.4 : 1 }}
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
              style={{ width: "100%", height: "36px", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}
      </div>
    </SidePanel>
  );
}
