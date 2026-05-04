import { useRef, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle, Paperclip, FileText, Image as ImageIcon, ExternalLink, X } from "lucide-react";
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
  /** Cumulative totals from prior submissions — used for balance display and overspend detection */
  previousTotalSpent?: number;
  previousTotalReturned?: number;
}

function newLineItem(): LiquidationLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    amount: 0,
  };
}

type ReceiptMeta = {
  url: string;
  name: string;
  type: string;
  size: number;
};

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const formatPHP = (n: number) => PHP.format(n);

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function LiquidationForm({
  isOpen,
  onClose,
  evoucherId,
  evoucherNumber,
  advanceAmount,
  currentUser,
  onSubmitted,
  inline = false,
  previousTotalSpent = 0,
  previousTotalReturned = 0,
}: LiquidationFormProps) {
  const [lineItems, setLineItems] = useState<LiquidationLineItem[]>([newLineItem()]);
  const [receipts, setReceipts] = useState<Record<string, ReceiptMeta>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [unusedReturn, setUnusedReturn] = useState<string>("");
  const [isFinal, setIsFinal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const currentSessionSpend = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  // Keep totalSpend as current-session value for DB storage
  const totalSpend = currentSessionSpend;
  const finalReturn = isFinal ? (Number(unusedReturn) || 0) : 0;
  const cumulativeSpend = previousTotalSpent + currentSessionSpend;
  const cumulativeReturned = previousTotalReturned + finalReturn;
  const overspend = Math.max(0, cumulativeSpend - cumulativeReturned - advanceAmount);
  const hasOverspend = isFinal && overspend > 0;
  const hasPrevious = previousTotalSpent > 0 || previousTotalReturned > 0;

  const updateItem = (id: string, field: keyof LiquidationLineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => setLineItems((prev) => [...prev, newLineItem()]);

  const removeItem = (id: string) => {
    if (lineItems.length === 1) return; // keep at least one row
    setLineItems((prev) => prev.filter((item) => item.id !== id));
    setReceipts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleReceiptUpload = async (lineId: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Receipt is too large (max 10 MB)");
      return;
    }
    setUploadingId(lineId);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `liquidations/${evoucherId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);

      setReceipts((prev) => ({
        ...prev,
        [lineId]: { url: urlData.publicUrl, name: file.name, type: file.type, size: file.size },
      }));
      setLineItems((prev) =>
        prev.map((item) => (item.id === lineId ? { ...item, receipt_url: urlData.publicUrl } : item))
      );
      toast.success("Receipt attached");
    } catch (err) {
      console.error("Receipt upload failed:", err);
      toast.error("Couldn't upload receipt. Try again.");
    } finally {
      setUploadingId(null);
    }
  };

  const removeReceipt = (lineId: string) => {
    setReceipts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    setLineItems((prev) =>
      prev.map((item) => (item.id === lineId ? { ...item, receipt_url: undefined } : item))
    );
  };

  const handleSubmit = async () => {
    // Validate: all line items need a description and positive amount
    const hasEmptyRows = lineItems.some((item) => !item.description.trim() || !item.amount);
    if (hasEmptyRows) {
      toast.error("All receipt lines need a description and amount");
      return;
    }

    if (isFinal && hasOverspend) {
      const confirmMsg = `Your total spend (₱${cumulativeSpend.toLocaleString()}) exceeds the advance (₱${advanceAmount.toLocaleString()}) by ₱${overspend.toLocaleString()}. A Reimbursement E-Voucher will be created for this difference. Proceed?`;
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

        // 3. Auto-create Reimbursement EV if overspend (cumulative)
        if (hasOverspend) {
          const reimbursementId = `EV-REIMB-${Date.now()}`;
          const reimbursementCreatedAt = new Date().toISOString();
          const { error: reimburseError } = await supabase
            .from("evouchers")
            .insert({
              id: reimbursementId,
              // evoucher_number filled by DB trigger
              transaction_type: "reimbursement",
              source_module: "operations",
              status: "draft",
              amount: overspend, // cumulative overspend
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
          body: `Liquidation receipts for ${evoucherNumber} are ready for your verification.\n\nTotal spend: ₱${cumulativeSpend.toLocaleString()}\nUnused return: ₱${cumulativeReturned.toLocaleString()}`,
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
    <div style={{ padding: "16px 24px 20px", borderTop: "1px solid var(--theme-border-default)", display: "flex", flexDirection: "column", gap: "14px", backgroundColor: "var(--theme-bg-surface)" }}>
      {/* Final submission toggle */}
      <label
        htmlFor="is-final"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "12px 14px",
          borderRadius: "10px",
          backgroundColor: isFinal ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface-subtle)",
          border: `1px solid ${isFinal ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"}`,
          cursor: "pointer",
          transition: "background-color 180ms ease, border-color 180ms ease",
        }}
      >
        <input
          type="checkbox"
          id="is-final"
          checked={isFinal}
          onChange={(e) => setIsFinal(e.target.checked)}
          style={{ width: "16px", height: "16px", marginTop: "1px", cursor: "pointer", accentColor: "var(--theme-action-primary-bg)" }}
        />
        <span style={{ fontSize: "13px", lineHeight: 1.45, color: "var(--theme-text-primary)" }}>
          <span style={{ fontWeight: 600 }}>Final submission</span>
          <span style={{ color: "var(--theme-text-muted)" }}> — close the advance and send to Accounting for review.</span>
        </span>
      </label>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <button
          onClick={onClose}
          style={{ height: "40px", padding: "0 16px", background: "none", border: "none", color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer", borderRadius: "8px" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ height: "40px", padding: "0 22px", borderRadius: "8px", backgroundColor: "var(--theme-action-primary-bg)", border: "none", color: "var(--theme-action-primary-text)", fontSize: "13px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: submitting ? 0.7 : 1, transition: "opacity 150ms ease, transform 150ms ease" }}
        >
          {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {isFinal ? "Submit & close advance" : "Save receipts"}
        </button>
      </div>
    </div>
  );

  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    height: "38px",
    border: "1px solid var(--theme-border-default)",
    borderRadius: "8px",
    padding: "0 12px",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    backgroundColor: "var(--theme-bg-surface)",
    color: "var(--theme-text-primary)",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  };

  const formBody = (
    <div style={{ padding: inline ? "20px 0 0 0" : "24px", overflowY: inline ? undefined : "auto", height: inline ? undefined : "100%" }}>

        {/* Advance summary card */}
        <section
          aria-label="Advance summary"
          style={{
            padding: "16px 18px",
            borderRadius: "12px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--theme-border-default)",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
            <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--theme-text-muted)", fontWeight: 600 }}>Cash advance</span>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {formatPHP(advanceAmount)}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "12px", borderTop: "1px solid var(--theme-border-subtle, var(--theme-border-default))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                {hasPrevious ? "This session" : "Total spent this session"}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: currentSessionSpend > advanceAmount ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
                {formatPHP(currentSessionSpend)}
              </span>
            </div>

            {hasPrevious && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Previously filed</span>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-secondary, var(--theme-text-primary))", fontVariantNumeric: "tabular-nums" }}>
                    {formatPHP(previousTotalSpent)}
                  </span>
                </div>
                {previousTotalReturned > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Previously returned</span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-status-success-fg)", fontVariantNumeric: "tabular-nums" }}>
                      {formatPHP(previousTotalReturned)}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Cumulative spend</span>
                  <span style={{ fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: cumulativeSpend > advanceAmount ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)" }}>
                    {formatPHP(cumulativeSpend)}
                  </span>
                </div>
              </>
            )}

            {cumulativeSpend > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", paddingTop: "8px", borderTop: "1px dashed var(--theme-border-default)" }}>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Balance remaining</span>
                <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: advanceAmount - cumulativeSpend < 0 ? "var(--theme-status-danger-fg)" : "var(--theme-status-success-fg)" }}>
                  {formatPHP(advanceAmount - cumulativeSpend)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Overspend warning */}
        {hasOverspend && (
          <div style={{ display: "flex", gap: "12px", padding: "12px 14px", borderRadius: "10px", backgroundColor: "var(--theme-status-danger-bg)", border: "1px solid var(--theme-status-danger-border)", marginBottom: "20px" }}>
            <AlertTriangle size={16} style={{ color: "var(--theme-status-danger-fg)", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "13px", color: "var(--theme-status-danger-fg)", lineHeight: 1.5, margin: 0 }}>
              You've exceeded the advance by{" "}
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatPHP(overspend)}</strong>.
              A reimbursement E-Voucher will be created automatically on submission.
            </p>
          </div>
        )}

        {/* Receipt line items */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>Receipt line items</p>
              <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", margin: "2px 0 0" }}>
                Add a row per receipt and attach the photo or scan.
              </p>
            </div>
            <button
              onClick={addItem}
              style={{
                height: "34px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid var(--theme-border-default)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-primary)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "border-color 150ms ease, background-color 150ms ease",
              }}
            >
              <Plus size={14} />
              Add row
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            {lineItems.map((item, index) => {
              const receipt = receipts[item.id];
              const isImage = receipt?.type?.startsWith("image/");
              const isUploadingThis = uploadingId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "14px 14px",
                    borderTop: index === 0 ? "none" : "1px solid var(--theme-border-default)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    backgroundColor: index % 2 === 1 ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Receipt {index + 1}
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={lineItems.length === 1}
                      aria-label={`Remove receipt ${index + 1}`}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        border: "1px solid transparent",
                        backgroundColor: "transparent",
                        color: "var(--theme-text-muted)",
                        cursor: lineItems.length === 1 ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: lineItems.length === 1 ? 0.35 : 1,
                        transition: "background-color 150ms ease, color 150ms ease",
                      }}
                      onMouseEnter={(e) => {
                        if (lineItems.length > 1) {
                          e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                          e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--theme-text-muted)";
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "10px" }}>
                    <div>
                      <label htmlFor={`li-desc-${item.id}`} style={{ display: "block", fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px", fontWeight: 500 }}>
                        Description
                      </label>
                      <input
                        id={`li-desc-${item.id}`}
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        placeholder="e.g., Port charges, fuel"
                        style={inputBaseStyle}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.18)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--theme-border-default)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor={`li-amt-${item.id}`} style={{ display: "block", fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px", fontWeight: 500 }}>
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
                        style={{ ...inputBaseStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.18)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--theme-border-default)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </div>
                  </div>

                  {/* Receipt attachment */}
                  <input
                    ref={(el) => { fileInputRefs.current[item.id] = el; }}
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleReceiptUpload(item.id, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />

                  {receipt ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--theme-border-default)",
                        backgroundColor: "var(--theme-bg-surface)",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          backgroundColor: "var(--theme-bg-surface-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--theme-action-primary-bg)",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {isImage ? (
                          <img src={receipt.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <FileText size={16} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={receipt.name}>
                          {receipt.name}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>
                          {formatBytes(receipt.size)}
                        </div>
                      </div>
                      <a
                        href={receipt.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open receipt"
                        style={{
                          width: "28px", height: "28px", borderRadius: "6px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--theme-text-muted)", textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => removeReceipt(item.id)}
                        aria-label="Remove receipt"
                        style={{
                          width: "28px", height: "28px", borderRadius: "6px",
                          border: "none", backgroundColor: "transparent",
                          color: "var(--theme-text-muted)", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRefs.current[item.id]?.click()}
                      disabled={isUploadingThis}
                      style={{
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px dashed var(--theme-border-default)",
                        backgroundColor: "transparent",
                        color: "var(--theme-text-secondary, var(--theme-text-primary))",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: isUploadingThis ? "wait" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        transition: "border-color 150ms ease, background-color 150ms ease, color 150ms ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isUploadingThis) {
                          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                          e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-border-default)";
                        e.currentTarget.style.color = "var(--theme-text-secondary, var(--theme-text-primary))";
                      }}
                    >
                      {isUploadingThis ? (
                        <>
                          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Paperclip size={14} />
                          Attach receipt
                          <span style={{ color: "var(--theme-text-muted)", fontWeight: 400 }}>(image or PDF)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Unused cash return (final submission only) */}
        {isFinal && (
          <div style={{ marginBottom: "20px", padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface-subtle)" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>Unused cash to return</p>
            <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", margin: "2px 0 10px" }}>
              If you have unspent cash from the advance, enter the amount being returned.
            </p>
            <input
              type="number"
              value={unusedReturn}
              onChange={(e) => setUnusedReturn(e.target.value)}
              placeholder="0.00"
              min={0}
              step={0.01}
              style={{ ...inputBaseStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.18)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
                e.currentTarget.style.boxShadow = "none";
              }}
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
