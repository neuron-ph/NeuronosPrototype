import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Loader2, ChevronDown, Lock, AlertTriangle } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { toast } from "sonner@2.0.3";
import { useUser } from "../../../hooks/useUser";
import { canPerformEVAction } from "../../../utils/permissions";
import type { EVoucherAPType } from "../../../types/evoucher";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface EVoucherSummary {
  id: string;
  evoucher_number: string;
  transaction_type: EVoucherAPType;
  amount: number;
  status: string;
  requestor_id?: string;
  requestor_name?: string;
  requestor_department?: string;
  purpose?: string;
}

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const PAYMENT_METHODS = ["Cash", "Check", "Bank Transfer", "Petty Cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const isReimbursement = (t: string) => t === "reimbursement";

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

// ─── AccountSelect ────────────────────────────────────────────────────────────

function AccountSelect({
  label,
  id,
  accounts,
  value,
  onChange,
  placeholder = "Select account…",
}: {
  label: string;
  id: string;
  accounts: GLAccount[];
  value: string;
  onChange: (id: string, account: GLAccount) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const acct = accounts.find((a) => a.id === e.target.value);
            if (acct) onChange(acct.id, acct);
          }}
          style={{
            width: "100%",
            height: "40px",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            padding: "0 36px 0 12px",
            fontSize: "13px",
            backgroundColor: "var(--theme-bg-surface)",
            color: "var(--theme-text-primary)",
            appearance: "none",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="">{placeholder}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

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
  const [loadingEV, setLoadingEV] = useState(true);

  // ── GL accounts ───────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [advancesReceivable, setAdvancesReceivable] = useState<GLAccount | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // ── Form state ────────────────────────────────────────────────────────────
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [sourceAccountName, setSourceAccountName] = useState("");
  const [sourceAccountCode, setSourceAccountCode] = useState("");

  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [expenseAccountName, setExpenseAccountName] = useState("");
  const [expenseAccountCode, setExpenseAccountCode] = useState("");

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
      }
      setLoadingEV(false);
    };
    load();
  }, [id]);

  // ── Load GL accounts ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingAccounts(true);
      const { data } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });
      const all = (data || []) as GLAccount[];
      setAccounts(all);
      const adv =
        all.find((a) => a.code === "1150") ??
        all.find((a) => a.name.toLowerCase().includes("advances receivable")) ??
        null;
      setAdvancesReceivable(adv);
      setLoadingAccounts(false);
    };
    load();
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const role = user?.role ?? "";
  const department = user?.department ?? "";

  const canDisburse =
    !!user &&
    canPerformEVAction("approve_accounting", role, department) &&
    evoucher?.status === "pending_accounting";

  const isReimb = evoucher ? isReimbursement(evoucher.transaction_type) : false;
  const refRequired = paymentMethod === "Check" || paymentMethod === "Bank Transfer";
  const amount = evoucher?.amount ?? 0;

  const sourceAccounts = accounts.filter(
    (a) => a.type === "asset" || a.type === "cash" || a.type === "bank"
  );
  const expenseAccounts = accounts.filter((a) => a.type === "expense" || a.type === "cost").length > 0
    ? accounts.filter((a) => a.type === "expense" || a.type === "cost")
    : accounts;

  const canConfirm =
    canDisburse &&
    !!sourceAccountId &&
    !!paymentMethod &&
    (!refRequired || !!reference.trim()) &&
    (!isReimb || !!expenseAccountId);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!canConfirm || !evoucher || !user) return;
    setPosting(true);
    try {
      const entryId = `JE-DISB-${Date.now()}`;
      const now = new Date().toISOString();
      const disbDate = new Date(disbursementDate + "T12:00:00").toISOString();
      const evoucherNumber = evoucher.evoucher_number;

      let lines;
      if (isReimb) {
        lines = [
          {
            account_id: expenseAccountId,
            account_code: expenseAccountCode,
            account_name: expenseAccountName,
            debit: amount,
            credit: 0,
            description: `Reimbursement — ${evoucherNumber}`,
          },
          {
            account_id: sourceAccountId,
            account_code: sourceAccountCode,
            account_name: sourceAccountName,
            debit: 0,
            credit: amount,
            description: `Reimbursement — ${evoucherNumber}`,
          },
        ];
      } else {
        lines = [
          {
            account_id: advancesReceivable?.id ?? "sys-adv-recv-001",
            account_code: advancesReceivable?.code ?? "1150",
            account_name: advancesReceivable?.name ?? "Employee Cash Advances Receivable",
            debit: amount,
            credit: 0,
            description: `Cash advance disbursed — ${evoucherNumber}`,
          },
          {
            account_id: sourceAccountId,
            account_code: sourceAccountCode,
            account_name: sourceAccountName,
            debit: 0,
            credit: amount,
            description: `Cash advance disbursed — ${evoucherNumber}`,
          },
        ];
      }

      // 1. Create disbursement journal entry
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        entry_number: entryId,
        entry_date: disbDate,
        evoucher_id: evoucher.id,
        description: `Disbursement — ${evoucherNumber} via ${paymentMethod}${reference ? ` [${reference}]` : ""}`,
        lines,
        total_debit: amount,
        total_credit: amount,
        status: "posted",
        created_by: user.id,
        created_at: now,
        updated_at: now,
      });
      if (jeError) throw jeError;

      // 2. Update evoucher
      const newStatus = isReimb ? "posted" : "disbursed";
      const { error: evError } = await supabase
        .from("evouchers")
        .update({
          status: newStatus,
          disbursement_method: paymentMethod,
          disbursement_reference: reference.trim() || null,
          disbursement_date: disbDate,
          disbursement_source_account_id: sourceAccountId,
          disbursement_source_account_name: sourceAccountName,
          disbursement_journal_entry_id: entryId,
          disbursed_by_user_id: user.id,
          disbursed_by_name: user.name,
          disbursement_remarks: remarks.trim() || null,
          ...(isReimb ? { closing_journal_entry_id: entryId } : {}),
          updated_at: now,
        })
        .eq("id", evoucher.id);
      if (evError) throw evError;

      // 3. Write history
      const historyAction = isReimb
        ? `Reimbursement Disbursed & Posted — ${paymentMethod}${reference ? ` [${reference}]` : ""} via ${sourceAccountName}`
        : `Cash Disbursed by Accounting — ${paymentMethod}${reference ? ` [${reference}]` : ""} from ${sourceAccountName}`;
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
          disbursement_source: sourceAccountName,
          disbursement_date: disbDate,
        },
        created_at: now,
      });

      // 4. Notify requestor
      if (evoucher.requestor_id) {
        createWorkflowTicket({
          subject: isReimb
            ? `Reimbursement Processed: ${evoucherNumber}`
            : `Disbursed: ${evoucherNumber}`,
          body: isReimb
            ? `Your reimbursement ${evoucherNumber} has been processed and posted.`
            : `Your E-Voucher ${evoucherNumber} has been disbursed. Cash has been released via ${paymentMethod}.`,
          type: "fyi",
          recipientUserId: evoucher.requestor_id,
          linkedRecordType: "expense",
          linkedRecordId: evoucher.id,
          createdBy: user.id,
          createdByName: user.name,
          createdByDept: user.department || "Accounting",
          autoCreated: true,
        });
      }

      toast.success(
        isReimb
          ? "Reimbursement disbursed and posted to ledger"
          : "Cash disbursed — journal entry posted"
      );
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
              {PHP.format(amount)}
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

          {/* Journal entry ledger */}
          <div style={{ padding: "20px 24px", flex: 1 }}>
            <div style={{
              fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px",
            }}>
              Journal Entry Preview
            </div>

            <div style={{
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              overflow: "hidden",
            }}>
              {/* Ledger header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 76px 76px",
                padding: "8px 12px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                borderBottom: "1px solid var(--theme-border-default)",
                gap: "8px",
              }}>
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Account</span>
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Debit</span>
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Credit</span>
              </div>

              {/* DR row */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 76px 76px",
                padding: "12px",
                borderBottom: "1px solid var(--theme-border-default)",
                gap: "8px",
                alignItems: "start",
              }}>
                <div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>DR</div>
                  {isReimb ? (
                    <div style={{ fontSize: "12px", color: expenseAccountId ? "var(--theme-text-primary)" : "var(--theme-text-muted)", fontStyle: expenseAccountId ? "normal" : "italic" }}>
                      {expenseAccountId ? `${expenseAccountCode} — ${expenseAccountName}` : "Select expense account →"}
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "5px" }}>
                      <Lock size={10} style={{ color: "var(--theme-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", color: "var(--theme-text-primary)", lineHeight: 1.4 }}>
                        {advancesReceivable ? `${advancesReceivable.code} — ${advancesReceivable.name}` : "1150 — Employee Cash Advances Receivable"}
                      </span>
                    </div>
                  )}
                </div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", paddingTop: "18px" }}>{PHP.format(amount)}</span>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", textAlign: "right", paddingTop: "18px" }}>—</span>
              </div>

              {/* CR row */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 76px 76px",
                padding: "12px 12px 12px 24px",
                gap: "8px",
                alignItems: "start",
              }}>
                <div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>CR</div>
                  <div style={{ fontSize: "12px", color: sourceAccountId ? "var(--theme-text-primary)" : "var(--theme-text-muted)", fontStyle: sourceAccountId ? "normal" : "italic" }}>
                    {sourceAccountId ? `${sourceAccountCode} — ${sourceAccountName}` : "Select source account →"}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", textAlign: "right", paddingTop: "18px" }}>—</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", paddingTop: "18px" }}>{PHP.format(amount)}</span>
              </div>
            </div>

            {isReimb && (
              <p style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginTop: "12px", lineHeight: 1.6 }}>
                Reimbursement disburses and closes in one step — no liquidation required.
              </p>
            )}
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

            {loadingAccounts ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "64px" }}>
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {isReimb && (
                  <AccountSelect
                    label="Expense Account (DR) *"
                    id="disb-expense-account"
                    accounts={expenseAccounts}
                    value={expenseAccountId}
                    onChange={(id, acct) => {
                      setExpenseAccountId(id);
                      setExpenseAccountName(acct.name);
                      setExpenseAccountCode(acct.code);
                    }}
                    placeholder="Select expense account…"
                  />
                )}

                <AccountSelect
                  label="Source Account — Cash or Bank (CR) *"
                  id="disb-source-account"
                  accounts={sourceAccounts.length > 0 ? sourceAccounts : accounts}
                  value={sourceAccountId}
                  onChange={(id, acct) => {
                    setSourceAccountId(id);
                    setSourceAccountName(acct.name);
                    setSourceAccountCode(acct.code);
                  }}
                  placeholder="Select cash or bank account…"
                />

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
            )}
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
          {posting ? "Processing…" : isReimb ? "Disburse & Post to Ledger" : "Confirm Disbursement"}
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
