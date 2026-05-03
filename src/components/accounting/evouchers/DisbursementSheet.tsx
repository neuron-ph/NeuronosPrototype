import { useState, useEffect } from "react";
import { Loader2, ChevronDown, Lock } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { createWorkflowTicket } from "../../../utils/workflowTickets";
import { toast } from "sonner@2.0.3";
import { SidePanel } from "../../common/SidePanel";
import type { EVoucherAPType } from "../../../types/evoucher";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface DisbursementSheetProps {
  isOpen: boolean;
  onClose: () => void;
  evoucherId: string;
  evoucherNumber: string;
  transactionType: EVoucherAPType;
  amount: number;
  requestorId?: string;
  currentUser: { id: string; name: string; department?: string };
  onDisbursed: () => void;
}

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const PAYMENT_METHODS = ["Cash", "Check", "Bank Transfer", "Petty Cash"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const isReimbursement = (t: EVoucherAPType) => t === "reimbursement";

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
      <label htmlFor={id} style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const acct = accounts.find((a) => a.id === e.target.value);
            if (acct) onChange(acct.id, acct);
          }}
          style={{
            width: "100%", height: "36px",
            border: "1px solid var(--theme-border-default)", borderRadius: "6px",
            padding: "0 32px 0 10px", fontSize: "13px",
            backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
            appearance: "none", cursor: "pointer", outline: "none",
          }}
        >
          <option value="">{placeholder}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
        <ChevronDown size={14} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DisbursementSheet({
  isOpen,
  onClose,
  evoucherId,
  evoucherNumber,
  transactionType,
  amount,
  requestorId,
  currentUser,
  onDisbursed,
}: DisbursementSheetProps) {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [advancesReceivable, setAdvancesReceivable] = useState<GLAccount | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Source account (credit side — money leaves from here)
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [sourceAccountName, setSourceAccountName] = useState("");
  const [sourceAccountCode, setSourceAccountCode] = useState("");

  // Expense account (debit side for reimbursement only)
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [expenseAccountName, setExpenseAccountName] = useState("");
  const [expenseAccountCode, setExpenseAccountCode] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [disbursementDate, setDisbursementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [posting, setPosting] = useState(false);

  const isReimb = isReimbursement(transactionType);
  const refRequired = paymentMethod === "Check" || paymentMethod === "Bank Transfer";

  // Reset form when sheet opens/closes
  useEffect(() => {
    if (!isOpen) return;
    setSourceAccountId(""); setSourceAccountName(""); setSourceAccountCode("");
    setExpenseAccountId(""); setExpenseAccountName(""); setExpenseAccountCode("");
    setPaymentMethod(""); setReference(""); setRemarks("");
    setDisbursementDate(new Date().toISOString().slice(0, 10));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoadingAccounts(true);
      const { data } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });
      const all = (data || []) as GLAccount[];
      setAccounts(all);

      const adv = all.find((a) => a.code === "1150") ??
        all.find((a) => a.name.toLowerCase().includes("advances receivable")) ?? null;
      setAdvancesReceivable(adv);
      setLoadingAccounts(false);
    };
    load();
  }, [isOpen]);

  // Source accounts = asset / cash / bank accounts
  const sourceAccounts = accounts.filter((a) =>
    a.type === "asset" || a.type === "cash" || a.type === "bank"
  );
  // Expense accounts = all non-asset accounts (or specifically expense type)
  const expenseAccounts = accounts.filter((a) =>
    a.type === "expense" || a.type === "cost"
  ).length > 0
    ? accounts.filter((a) => a.type === "expense" || a.type === "cost")
    : accounts; // fallback to all if no expense accounts exist yet

  const canConfirm =
    !!sourceAccountId &&
    !!paymentMethod &&
    (!refRequired || !!reference.trim()) &&
    (!isReimb || !!expenseAccountId);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPosting(true);
    try {
      const entryId = `JE-DISB-${Date.now()}`;
      const now = new Date().toISOString();
      const disbDate = new Date(disbursementDate + "T12:00:00").toISOString();

      // Build journal lines
      let lines;
      if (isReimb) {
        // Dr. Expense Account / Cr. Source Account
        lines = [
          {
            account_id: expenseAccountId, account_code: expenseAccountCode,
            account_name: expenseAccountName, debit: amount, credit: 0,
            description: `Reimbursement — ${evoucherNumber}`,
          },
          {
            account_id: sourceAccountId, account_code: sourceAccountCode,
            account_name: sourceAccountName, debit: 0, credit: amount,
            description: `Reimbursement — ${evoucherNumber}`,
          },
        ];
      } else {
        // Dr. Employee Cash Advances Receivable / Cr. Source Account
        const advAcct = advancesReceivable;
        lines = [
          {
            account_id: advAcct?.id ?? "sys-adv-recv-001",
            account_code: advAcct?.code ?? "1150",
            account_name: advAcct?.name ?? "Employee Cash Advances Receivable",
            debit: amount, credit: 0,
            description: `Cash advance disbursed — ${evoucherNumber}`,
          },
          {
            account_id: sourceAccountId, account_code: sourceAccountCode,
            account_name: sourceAccountName, debit: 0, credit: amount,
            description: `Cash advance disbursed — ${evoucherNumber}`,
          },
        ];
      }

      // 1. Create disbursement journal entry
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        // entry_number filled by DB trigger (set_journal_entry_number)
        entry_date: disbDate,
        evoucher_id: evoucherId,
        description: `Disbursement — ${evoucherNumber} via ${paymentMethod}${reference ? ` [${reference}]` : ""}`,
        lines,
        total_debit: amount,
        total_credit: amount,
        status: "draft",
        created_by: currentUser.id,
        created_at: now,
        updated_at: now,
      });
      if (jeError) throw jeError;

      // 2. Update evoucher with metadata + transition status
      // For reimbursement: jump directly to "posted" (no liquidation needed)
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
          disbursed_by_user_id: currentUser.id,
          disbursed_by_name: currentUser.name,
          disbursement_remarks: remarks.trim() || null,
          ...(isReimb ? { closing_journal_entry_id: entryId } : {}),
          updated_at: now,
        })
        .eq("id", evoucherId);
      if (evError) throw evError;

      // 3. Write history
      const historyAction = isReimb
        ? `Reimbursement Disbursed & Posted — ${paymentMethod}${reference ? ` [${reference}]` : ""} via ${sourceAccountName}`
        : `Cash Disbursed by Accounting — ${paymentMethod}${reference ? ` [${reference}]` : ""} from ${sourceAccountName}`;
      await supabase.from("evoucher_history").insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucherId,
        action: historyAction,
        status: newStatus,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.department,
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
      if (requestorId) {
        createWorkflowTicket({
          subject: isReimb ? `Reimbursement Processed: ${evoucherNumber}` : `Disbursed: ${evoucherNumber}`,
          body: isReimb
            ? `Your reimbursement ${evoucherNumber} has been processed and posted.`
            : `Your E-Voucher ${evoucherNumber} has been disbursed. Cash has been released via ${paymentMethod}.`,
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

      toast.success(isReimb ? "Reimbursement disbursed and posted to ledger" : "Cash disbursed — journal entry posted");
      onDisbursed();
      onClose();
    } catch (err) {
      console.error("Disbursement error:", err);
      toast.error("Failed to process disbursement");
    } finally {
      setPosting(false);
    }
  };

  const footer = (
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--theme-border-default)", display: "flex", justifyContent: "space-between", backgroundColor: "var(--theme-bg-surface)" }}>
      <button
        onClick={onClose}
        style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
      >
        Cancel
      </button>
      <button
        onClick={handleConfirm}
        disabled={posting || !canConfirm}
        style={{
          height: "40px", padding: "0 24px", borderRadius: "8px",
          backgroundColor: "var(--theme-action-primary-bg)", border: "none",
          color: "var(--theme-action-primary-text)", fontSize: "13px", fontWeight: 600,
          cursor: posting || !canConfirm ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: "8px",
          opacity: posting || !canConfirm ? 0.6 : 1,
        }}
      >
        {posting && <Loader2 size={16} className="animate-spin" />}
        {posting ? "Processing…" : isReimb ? "Disburse & Post" : "Confirm Disbursement"}
      </button>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Disburse E-Voucher" footer={footer} width="520px">
      <div style={{ padding: "24px", overflowY: "auto", height: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* EV summary */}
        <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", border: "1px solid var(--theme-border-default)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Voucher</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>{evoucherNumber}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Type</span>
            <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
              {transactionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Amount</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>{PHP.format(amount)}</span>
          </div>
        </div>

        {loadingAccounts ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }} />
          </div>
        ) : (
          <>
            {/* GL Preview */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                Journal Entry Preview
              </div>
              <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
                {/* Debit row */}
                <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--theme-bg-surface)", borderBottom: "1px solid var(--theme-border-default)" }}>
                  <div>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>DR</span>
                    {isReimb ? (
                      <div style={{ fontSize: "12px", color: "var(--theme-text-secondary)", marginTop: "2px" }}>
                        {expenseAccountId ? `${expenseAccountCode} — ${expenseAccountName}` : <span style={{ color: "var(--theme-text-muted)", fontStyle: "italic" }}>Select expense account below</span>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
                        <Lock size={11} style={{ color: "var(--theme-text-muted)" }} />
                        <span style={{ fontSize: "12px", color: "var(--theme-text-secondary)" }}>
                          {advancesReceivable ? `${advancesReceivable.code} — ${advancesReceivable.name}` : "1150 — Employee Cash Advances Receivable"}
                        </span>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", whiteSpace: "nowrap", marginLeft: "12px" }}>{PHP.format(amount)}</span>
                </div>
                {/* Credit row */}
                <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--theme-bg-surface-subtle)" }}>
                  <div style={{ paddingLeft: "12px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>CR</span>
                    <div style={{ fontSize: "12px", color: "var(--theme-text-secondary)", marginTop: "2px" }}>
                      {sourceAccountId ? `${sourceAccountCode} — ${sourceAccountName}` : <span style={{ color: "var(--theme-text-muted)", fontStyle: "italic" }}>Select source account below</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", whiteSpace: "nowrap", marginLeft: "12px" }}>{PHP.format(amount)}</span>
                </div>
              </div>
              {isReimb && (
                <p style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginTop: "6px" }}>
                  Reimbursement disburses and closes in one step — no liquidation required.
                </p>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Expense account — reimbursement only */}
              {isReimb && (
                <AccountSelect
                  label="Expense Account (DR)"
                  id="disb-expense-account"
                  accounts={expenseAccounts}
                  value={expenseAccountId}
                  onChange={(id, acct) => { setExpenseAccountId(id); setExpenseAccountName(acct.name); setExpenseAccountCode(acct.code); }}
                  placeholder="Select expense account…"
                />
              )}

              {/* Source account */}
              <AccountSelect
                label="Source Account — Cash or Bank (CR)"
                id="disb-source-account"
                accounts={sourceAccounts.length > 0 ? sourceAccounts : accounts}
                value={sourceAccountId}
                onChange={(id, acct) => { setSourceAccountId(id); setSourceAccountName(acct.name); setSourceAccountCode(acct.code); }}
                placeholder="Select cash or bank account…"
              />

              {/* Payment method */}
              <div>
                <label htmlFor="disb-method" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Payment Method</label>
                <div style={{ position: "relative" }}>
                  <select
                    id="disb-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 32px 0 10px", fontSize: "13px", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)", appearance: "none", cursor: "pointer", outline: "none" }}
                  >
                    <option value="">Select payment method…</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)", pointerEvents: "none" }} />
                </div>
              </div>

              {/* Reference number */}
              <div>
                <label htmlFor="disb-ref" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                  Reference Number {refRequired ? <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span> : <span style={{ fontWeight: 400 }}>(optional)</span>}
                </label>
                <input
                  id="disb-ref"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={paymentMethod === "Check" ? "Check number…" : paymentMethod === "Bank Transfer" ? "Transfer reference…" : "Voucher or reference number…"}
                  style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                />
              </div>

              {/* Disbursement date */}
              <div>
                <label htmlFor="disb-date" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Disbursement Date</label>
                <input
                  id="disb-date"
                  type="date"
                  value={disbursementDate}
                  onChange={(e) => setDisbursementDate(e.target.value)}
                  style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                />
              </div>

              {/* Released by */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Released By</label>
                <div style={{ display: "flex", alignItems: "center", height: "36px", padding: "0 10px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", backgroundColor: "var(--theme-bg-surface-subtle)", fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                  <Lock size={12} style={{ color: "var(--theme-text-muted)", marginRight: "8px", flexShrink: 0 }} />
                  {currentUser.name}
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label htmlFor="disb-remarks" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Remarks <span style={{ fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  id="disb-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Notes about this disbursement…"
                  rows={2}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}
