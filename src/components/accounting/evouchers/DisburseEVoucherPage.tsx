import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Loader2, ChevronDown, Lock, AlertTriangle } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { toast } from "sonner@2.0.3";
import { useUser } from "../../../hooks/useUser";
import { useUsers } from "../../../hooks/useUsers";
import { usePermission } from "../../../context/PermissionProvider";
import { CustomDropdown } from "../../bd/CustomDropdown";
import type { EVoucherAPType } from "../../../types/evoucher";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  normalizeCurrency,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EVoucherSummary {
  id: string;
  evoucher_number: string;
  transaction_type: EVoucherAPType;
  amount: number;
  status: string;
  requestor_id?: string;
  requestor_name?: string;
  requestor_department?: string;
  cash_receiver_id?: string;
  cash_receiver_name?: string;
  purpose?: string;
  currency?: string;
  original_currency?: string;
  exchange_rate?: number;
  base_amount?: number;
  base_currency?: string;
  exchange_rate_date?: string;
}

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const PAYMENT_METHODS = ["Cash", "Check", "Bank Transfer", "Petty Cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

// NEU-044: only cash advances / budget requests are true advances (cash out
// before receipts) — those park in 1150 and go to liquidation. Everything else
// (reimbursement, expense, direct expense, billable) settles in one step:
// post the expense and close. No fake liquidation.
const isAdvanceEvoucher = (t: string) => t === "cash_advance" || t === "budget_request";

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  cash_advance: "Cash Advance",
  reimbursement: "Reimbursement",
  budget_request: "Budget Request",
  direct_expense: "Direct Expense",
};

const BACK_ROUTES: Record<string, string> = {
  accounting: "/accounting/evouchers",
  my: "/my-evouchers",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DisburseEVoucherPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const from = searchParams.get("from") || "accounting";
  const backRoute = BACK_ROUTES[from] || "/accounting/evouchers";

  // ── EVoucher data ─────────────────────────────────────────────────────────
  const [evoucher, setEvoucher] = useState<EVoucherSummary | null>(null);
  const [rawDetails, setRawDetails] = useState<Record<string, unknown>>({});
  const [loadingEV, setLoadingEV] = useState(true);

  // ── Cash receiver (NEU-045) — who physically receives the cash and will
  // liquidate it. Defaults to the requestor; Treasury can reassign at payout.
  const { users: activeUsers, isLoading: usersLoading } = useUsers();
  const [receiverId, setReceiverId] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [disbursementDate, setDisbursementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [posting, setPosting] = useState(false);

  // ── Load EVoucher ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoadingEV(true);
      const { data, error } = await supabase
        .from("evouchers")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!error && data) {
        const merged = { ...data?.details, ...data } as EVoucherSummary;
        setEvoucher(merged);
        setRawDetails((data?.details as Record<string, unknown>) ?? {});
        // Default the receiver to whoever's already named, else the requestor.
        setReceiverId(
          (merged.cash_receiver_id as string) || (merged.requestor_id as string) || null,
        );
      }
      setLoadingEV(false);
    };
    load();
  }, [id]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // NEU-042: disbursement is gated on the dedicated Treasury disburse capability
  // (split from acct_evouchers:approve, which now covers voucher approval only).
  const { can } = usePermission();
  const canDisburse =
    !!user &&
    can("acct_evouchers", "disburse") &&
    evoucher?.status === "pending_accounting";

  const isAdvanceType = evoucher ? isAdvanceEvoucher(evoucher.transaction_type) : false;
  // Direct-settle = post the expense and close in one step. The opposite of an advance.
  const settlesDirectly = !isAdvanceType;
  const refRequired = paymentMethod === "Check" || paymentMethod === "Bank Transfer";
  // The voucher amount is in `evoucher.currency` (USD or PHP); the GL posts
  // in PHP base via the locked `exchange_rate` stamped at creation time.
  const amount = evoucher?.amount ?? 0;
  const voucherCurrency: AccountingCurrency = normalizeCurrency(
    evoucher?.original_currency ?? evoucher?.currency ?? FUNCTIONAL_CURRENCY,
    FUNCTIONAL_CURRENCY,
  );

  // The dropdown renders its placeholder whenever `value` matches no option —
  // so a receiver defaulted from the voucher looked UNSET while the user list
  // was still loading, or permanently if that person is deactivated. Keep a
  // synthetic entry for the current value so the field always shows who it is.
  const receiverOptions = useMemo(() => {
    const opts = [...activeUsers]
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((u) => ({
        value: u.id,
        label: u.department ? `${u.name} · ${u.department}` : u.name,
      }));
    if (receiverId && !opts.some((o) => o.value === receiverId)) {
      const known =
        (evoucher?.cash_receiver_name as string) ||
        (receiverId === evoucher?.requestor_id ? (evoucher?.requestor_name as string) : "") ||
        "";
      opts.unshift({ value: receiverId, label: known || "Current receiver" });
    }
    return opts;
  }, [activeUsers, receiverId, evoucher]);

  const canConfirm =
    canDisburse &&
    !!paymentMethod &&
    (!refRequired || !!reference.trim()) &&
    (settlesDirectly || !!receiverId);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!canConfirm || !evoucher || !user) return;
    setPosting(true);
    try {
      const now = new Date().toISOString();
      const disbDate = new Date(disbursementDate + "T12:00:00").toISOString();
      const evoucherNumber = evoucher.evoucher_number;

      // NEU-045: for advances, stamp the cash receiver (who liquidates).
      const effectiveReceiverId = receiverId || evoucher.requestor_id || null;
      const effectiveReceiverName =
        activeUsers.find((u) => u.id === effectiveReceiverId)?.name ||
        (effectiveReceiverId === evoucher.requestor_id ? evoucher.requestor_name : undefined) ||
        null;

      // 2. Update evoucher
      const newStatus = settlesDirectly ? "posted" : "disbursed";
      const { error: evError } = await supabase
        .from("evouchers")
        .update({
          status: newStatus,
          disbursement_method: paymentMethod,
          disbursement_reference: reference.trim() || null,
          disbursement_date: disbDate,
          disbursed_by_user_id: user.id,
          disbursed_by_name: user.name,
          disbursement_remarks: remarks.trim() || null,
          // Advances park for liquidation → persist the receiver into details.
          ...(isAdvanceType
            ? {
                details: {
                  ...rawDetails,
                  cash_receiver_id: effectiveReceiverId,
                  cash_receiver_name: effectiveReceiverName,
                },
              }
            : {}),
          updated_at: now,
        })
        .eq("id", evoucher.id);
      if (evError) throw evError;

      // 3. Write history
      const historyAction = settlesDirectly
        ? `Disbursed — ${paymentMethod}${reference ? ` [${reference}]` : ""}`
        : `Cash Disbursed by Accounting — ${paymentMethod}${reference ? ` [${reference}]` : ""}`;
      await supabase.from("evoucher_history").insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucher.id,
        action: historyAction,
        status: newStatus,
        user_id: user.id,
        user_name: user.name,
        user_role: user.department,
        metadata: {
          previous_status: "pending_accounting",
          new_status: newStatus,
          disbursement_method: paymentMethod,
          disbursement_reference: reference.trim() || null,
          disbursement_date: disbDate,
        },
        created_at: now,
      });

      // 4. Notify.
      // NEU-045: for advances, send an actionable "For Liquidation" task to the
      // cash receiver (the person who got the money) — not a passive FYI to the
      // requestor. For direct-settle types, keep the FYI-posted note to requestor.
      if (settlesDirectly) {
        if (evoucher.requestor_id) {
          createWorkflowTicket({
            subject: `Disbursed: ${evoucherNumber}`,
            body: `Your E-Voucher ${evoucherNumber} has been disbursed.`,
            type: "fyi",
            recipientUserId: evoucher.requestor_id,
            linkedRecordType: "expense",
            linkedRecordId: evoucher.id,
            linkedRecordLabel: evoucherNumber, // show EV-… not the raw internal id
            createdBy: user.id,
            createdByName: user.name,
            createdByDept: user.department || "Accounting",
            autoCreated: true,
          });
        }
      } else if (effectiveReceiverId) {
        createWorkflowTicket({
          subject: `For Liquidation: ${evoucherNumber}`,
          body: `You received ${formatMoney(amount, voucherCurrency)} for ${evoucherNumber} via ${paymentMethod}. Confirm receipt in the system, then submit your liquidation with receipts to close this advance.`,
          type: "request",
          recipientUserId: effectiveReceiverId,
          linkedRecordType: "expense",
          linkedRecordId: evoucher.id,
          linkedRecordLabel: evoucherNumber, // show EV-… not the raw internal id
          createdBy: user.id,
          createdByName: user.name,
          createdByDept: user.department || "Accounting",
          autoCreated: true,
        });
      }

      toast.success(settlesDirectly ? "Disbursed" : "Cash disbursed");
      navigate(backRoute);
    } catch (err) {
      console.error("Disbursement error:", err);
      toast.error("Failed to process disbursement");
    } finally {
      setPosting(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingEV) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", backgroundColor: "var(--theme-bg-page)" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }} />
      </div>
    );
  }

  // ── Guard: not found ──────────────────────────────────────────────────────
  if (!evoucher) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--theme-text-muted)" }}>
        <AlertTriangle size={32} />
        <p style={{ fontSize: "14px" }}>E-Voucher not found.</p>
        <button onClick={() => navigate(backRoute)} style={{ fontSize: "13px", color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer" }}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Guard: wrong status / no permission ───────────────────────────────────
  if (!canDisburse) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--theme-text-muted)" }}>
        <AlertTriangle size={32} />
        <p style={{ fontSize: "14px" }}>
          {evoucher.status !== "pending_accounting"
            ? `This voucher is not pending disbursement (status: ${evoucher.status}).`
            : "You don't have permission to disburse this voucher."}
        </p>
        <button onClick={() => navigate(backRoute)} style={{ fontSize: "13px", color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer" }}>
          ← Back to Voucher
        </button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--theme-bg-page)", overflow: "hidden" }}>

      {/* ── Page header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 24px",
        borderBottom: "1px solid var(--theme-border-default)",
        backgroundColor: "var(--theme-bg-surface)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(backRoute)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--theme-text-muted)", fontSize: "13px",
            padding: "4px 6px", borderRadius: "6px",
          }}
        >
          <ArrowLeft size={15} />
          Back to Voucher
        </button>
        <span style={{ color: "var(--theme-border-default)", fontSize: "16px", lineHeight: 1 }}>·</span>
        <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>{evoucher.evoucher_number}</span>
        <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>→</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>Disburse</span>
      </div>

      {/* ── Two-panel split layout — fills remaining height ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left panel: Voucher context ── */}
        <div style={{
          width: "360px",
          flexShrink: 0,
          borderRight: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-surface)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}>

          {/* Voucher identity block */}
          <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--theme-border-default)" }}>
            <div style={{
              fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)",
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px",
            }}>
              Disbursement
            </div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.01em", marginBottom: "4px" }}>
              {evoucher.evoucher_number}
            </div>
            <div style={{ fontSize: "30px", fontWeight: 700, color: "var(--theme-text-primary)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "14px" }}>
              {formatMoney(amount, voucherCurrency)}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "3px 9px", borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              border: "1px solid var(--theme-border-default)",
              fontSize: "10px", fontWeight: 600, color: "var(--theme-text-secondary)",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {TRANSACTION_TYPE_LABELS[evoucher.transaction_type] ?? evoucher.transaction_type}
            </span>
          </div>

          {/* Summary rows */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--theme-border-default)" }}>
            <div style={{
              fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px",
            }}>
              Voucher Summary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {evoucher.requestor_name && (
                <Row label="Requestor" value={`${evoucher.requestor_name}${evoucher.requestor_department ? ` · ${evoucher.requestor_department}` : ""}`} />
              )}
              {evoucher.purpose && (
                <Row label="Purpose" value={evoucher.purpose} />
              )}
            </div>
          </div>

        </div>

        {/* ── Right panel: Form ── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "var(--theme-bg-page)",
          padding: "32px 40px",
        }}>
          <div style={{ maxWidth: "480px" }}>

            {/* Form heading */}
            <div style={{ marginBottom: "28px" }}>
              <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--theme-text-primary)", margin: "0 0 4px" }}>
                Disbursement Details
              </h1>
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0 }}>
                Confirm details before releasing funds.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* NEU-045: cash receiver — only advances liquidate, so only they
                    need a receiver. Defaults to the requestor. */}
                {!settlesDirectly && (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                      Cash Receiver *
                    </label>
                    <CustomDropdown
                      fullWidth
                      searchable
                      value={receiverId || ""}
                      placeholder={usersLoading ? "Loading people…" : "Select who receives the cash…"}
                      triggerAriaLabel="Cash receiver"
                      options={receiverOptions}
                      onChange={(id) => setReceiverId(id || null)}
                    />
                    <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--theme-text-muted)", lineHeight: 1.5 }}>
                      Whoever physically receives the cash — they'll get the liquidation task. Defaults to the requestor.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="disb-method" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                    Payment Method *
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      id="disb-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      style={{
                        width: "100%", height: "40px",
                        border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                        padding: "0 36px 0 12px", fontSize: "13px",
                        backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                        appearance: "none", cursor: "pointer", outline: "none",
                      }}
                    >
                      <option value="">Select payment method…</option>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)", pointerEvents: "none" }} />
                  </div>
                </div>

                <div>
                  <label htmlFor="disb-ref" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                    Reference Number{" "}
                    {refRequired
                      ? <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                      : <span style={{ fontWeight: 400 }}>(optional)</span>}
                  </label>
                  <input
                    id="disb-ref"
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={
                      paymentMethod === "Check" ? "Check number…"
                      : paymentMethod === "Bank Transfer" ? "Transfer reference…"
                      : "Voucher or reference number…"
                    }
                    style={{
                      width: "100%", height: "40px",
                      border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                      padding: "0 12px", fontSize: "13px", outline: "none",
                      boxSizing: "border-box",
                      backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                    }}
                  />
                </div>

                {/* Date + Released By inline */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label htmlFor="disb-date" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                      Disbursement Date *
                    </label>
                    <input
                      id="disb-date"
                      type="date"
                      value={disbursementDate}
                      onChange={(e) => setDisbursementDate(e.target.value)}
                      style={{
                        width: "100%", height: "40px",
                        border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                        padding: "0 12px", fontSize: "13px", outline: "none",
                        boxSizing: "border-box",
                        backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                      Released By
                    </label>
                    <div style={{
                      display: "flex", alignItems: "center", height: "40px", padding: "0 12px",
                      border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                      backgroundColor: "var(--theme-bg-surface-subtle)", fontSize: "13px", color: "var(--theme-text-secondary)",
                    }}>
                      <Lock size={12} style={{ color: "var(--theme-text-muted)", marginRight: "8px", flexShrink: 0 }} />
                      {user?.name ?? "—"}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="disb-remarks" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                    Remarks <span style={{ fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    id="disb-remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Notes about this disbursement…"
                    rows={3}
                    style={{
                      width: "100%", padding: "10px 12px",
                      border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                      fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none",
                      boxSizing: "border-box",
                      backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                    }}
                  />
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fixed action bar ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 24px",
        borderTop: "1px solid var(--theme-border-default)",
        backgroundColor: "var(--theme-bg-surface)",
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(backRoute)}
          style={{
            height: "38px", padding: "0 18px", background: "none", border: "none",
            color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={posting || !canConfirm}
          style={{
            height: "38px", padding: "0 24px", borderRadius: "8px",
            backgroundColor: "var(--theme-action-primary-bg)", border: "none",
            color: "var(--theme-action-primary-text)", fontSize: "13px", fontWeight: 600,
            cursor: posting || !canConfirm ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: "8px",
            opacity: posting || !canConfirm ? 0.55 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {posting && <Loader2 size={15} className="animate-spin" />}
          {posting ? "Processing…" : settlesDirectly ? "Disburse & Close" : "Confirm Disbursement"}
        </button>
      </div>
    </div>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
  valueStyle,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
      <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: bold ? 600 : 400, color: "var(--theme-text-primary)", textAlign: "right", ...valueStyle }}>
        {value}
      </span>
    </div>
  );
}
