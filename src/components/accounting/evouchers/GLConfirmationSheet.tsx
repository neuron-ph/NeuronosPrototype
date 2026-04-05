import { useState, useEffect } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { logActivity } from "../../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { SidePanel } from "../../common/SidePanel";
import type { EVoucherAPType } from "../../../types/evoucher";

interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface JournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

interface GLConfirmationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  evoucherId: string;
  evoucherNumber: string;
  transactionType: EVoucherAPType;
  amount: number;
  glCategory?: string;
  journalEntryId?: string | null;
  currentUser: { id: string; name: string; department?: string };
  onPosted?: () => void;
}

/**
 * Returns the suggested GL account name to query for based on EV type.
 * These are searched by name substring in the accounts table.
 */
function getSuggestedAccounts(type: EVoucherAPType): { debitHint: string; creditHint: string } {
  switch (type) {
    case "expense":
      return { debitHint: "Expense", creditHint: "Accounts Payable" };
    case "cash_advance":
    case "budget_request":
      return { debitHint: "Advances to Employees", creditHint: "Cash" };
    case "reimbursement":
      return { debitHint: "Expense", creditHint: "Cash" };
  }
}

function AccountSelect({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: GLAccount[];
  value: string;
  onChange: (id: string, account: GLAccount) => void;
}) {
  return (
    <div>
      <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>{label}</p>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => {
            const acct = accounts.find((a) => a.id === e.target.value);
            if (acct) onChange(acct.id, acct);
          }}
          style={{
            width: "100%",
            height: "36px",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            padding: "0 32px 0 10px",
            fontSize: "13px",
            backgroundColor: "var(--theme-bg-surface)",
            color: "var(--theme-text-primary)",
            appearance: "none",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="">Select account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

export function GLConfirmationSheet({
  isOpen,
  onClose,
  evoucherId,
  evoucherNumber,
  transactionType,
  amount,
  glCategory,
  journalEntryId,
  currentUser,
  onPosted,
}: GLConfirmationSheetProps) {
  const isAlreadyPosted = !!journalEntryId;
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [debitAccountId, setDebitAccountId] = useState("");
  const [debitAccountName, setDebitAccountName] = useState("");
  const [debitAccountCode, setDebitAccountCode] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [creditAccountName, setCreditAccountName] = useState("");
  const [creditAccountCode, setCreditAccountCode] = useState("");
  const [description, setDescription] = useState(
    `${transactionType.replace(/_/g, " ")} — ${evoucherNumber}`
  );
  const [posting, setPosting] = useState(false);

  const hints = getSuggestedAccounts(transactionType);

  useEffect(() => {
    if (!isOpen) return;
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (error) {
        toast.error("Failed to load accounts");
      } else {
        const accts = (data || []) as GLAccount[];
        setAccounts(accts);

        // Pre-fill suggested accounts by name hint
        const debitSuggestion = accts.find((a) =>
          a.name.toLowerCase().includes(hints.debitHint.toLowerCase())
        );
        const creditSuggestion = accts.find((a) =>
          a.name.toLowerCase().includes(hints.creditHint.toLowerCase())
        );

        if (debitSuggestion) {
          setDebitAccountId(debitSuggestion.id);
          setDebitAccountName(debitSuggestion.name);
          setDebitAccountCode(debitSuggestion.code);
        }
        if (creditSuggestion) {
          setCreditAccountId(creditSuggestion.id);
          setCreditAccountName(creditSuggestion.name);
          setCreditAccountCode(creditSuggestion.code);
        }
      }
      setLoadingAccounts(false);
    };
    loadAccounts();
  }, [isOpen]);

  const handlePost = async () => {
    if (!debitAccountId || !creditAccountId) {
      toast.error("Select both a debit and credit account");
      return;
    }
    if (debitAccountId === creditAccountId) {
      toast.error("Debit and credit accounts must be different");
      return;
    }

    setPosting(true);
    try {
      const lines: JournalLine[] = [
        {
          account_id: debitAccountId,
          account_code: debitAccountCode,
          account_name: debitAccountName,
          debit: amount,
          credit: 0,
          description,
        },
        {
          account_id: creditAccountId,
          account_code: creditAccountCode,
          account_name: creditAccountName,
          debit: 0,
          credit: amount,
          description,
        },
      ];

      const entryId = `JE-${Date.now()}`;

      // Create journal entry
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        entry_number: entryId,
        entry_date: new Date().toISOString(),
        evoucher_id: evoucherId,
        description,
        lines,
        total_debit: amount,
        total_credit: amount,
        status: "posted",
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (jeError) throw jeError;

      // Transition EV to disbursed + link journal entry
      const { error: evError } = await supabase
        .from("evouchers")
        .update({
          status: "disbursed",
          journal_entry_id: entryId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", evoucherId);

      if (evError) throw evError;

      const actor = { id: currentUser.id, name: currentUser.name, department: currentUser.department ?? "" };
      logActivity("evoucher", evoucherId, evoucherNumber ?? evoucherId, "posted", actor);

      // Write history
      await supabase.from("evoucher_history").insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucherId,
        action: `GL Entry Posted — DR ${debitAccountName} / CR ${creditAccountName}`,
        previous_status: "pending_accounting",
        new_status: "disbursed",
        performed_by: currentUser.id,
        performed_by_name: currentUser.name,
        performed_by_role: currentUser.department,
        created_at: new Date().toISOString(),
      });

      toast.success("Journal entry posted — awaiting Treasury disbursement");
      onPosted?.();
      onClose();
    } catch (error) {
      console.error("GL posting error:", error);
      toast.error("Failed to post journal entry");
    } finally {
      setPosting(false);
    }
  };

  const footer = (
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", justifyContent: "space-between", backgroundColor: "var(--neuron-bg-elevated)" }}>
      <button
        onClick={onClose}
        style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--neuron-ink-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
      >
        Cancel
      </button>
      {isAlreadyPosted ? (
        <span style={{ fontSize: "13px", color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
          Already posted to GL
        </span>
      ) : (
        <button
          onClick={handlePost}
          disabled={posting || !debitAccountId || !creditAccountId}
          style={{ height: "40px", padding: "0 24px", borderRadius: "8px", backgroundColor: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: "13px", fontWeight: 600, cursor: posting || !debitAccountId || !creditAccountId ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: posting || !debitAccountId || !creditAccountId ? 0.6 : 1 }}
        >
          {posting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {posting ? "Posting…" : "Confirm & Post to Ledger"}
        </button>
      )}
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="GL Journal Entry" footer={footer} width="520px">
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        {/* EV summary */}
        <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", border: "1px solid var(--neuron-ui-border)", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Voucher</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>{evoucherNumber}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Type</span>
            <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>{transactionType.replace(/_/g, " ")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Amount</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
              {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)}
            </span>
          </div>
        </div>

        {/* Already-posted notice */}
        {isAlreadyPosted && (
          <div style={{ padding: "10px 14px", borderRadius: "6px", backgroundColor: "var(--theme-status-success-bg)", border: "1px solid var(--theme-status-success-border)", marginBottom: "20px" }}>
            <p style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
              This e-voucher already has a linked journal entry and cannot be posted again.
            </p>
          </div>
        )}

        {/* Suggested accounts label */}
        {!isAlreadyPosted && (
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", lineHeight: "1.5" }}>
            Suggested: <strong>DR {hints.debitHint}</strong> / <strong>CR {hints.creditHint}</strong>. Override the accounts below if needed before posting.
          </p>
        </div>
        )}

        {loadingAccounts ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Debit row */}
            <div style={{ padding: "16px", borderRadius: "8px", border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Debit (DR)</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                accounts={accounts}
                value={debitAccountId}
                onChange={(id, acct) => {
                  setDebitAccountId(id);
                  setDebitAccountName(acct.name);
                  setDebitAccountCode(acct.code);
                }}
              />
            </div>

            {/* Credit row */}
            <div style={{ padding: "16px", borderRadius: "8px", border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Credit (CR)</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                accounts={accounts}
                value={creditAccountId}
                onChange={(id, acct) => {
                  setCreditAccountId(id);
                  setCreditAccountName(acct.name);
                  setCreditAccountCode(acct.code);
                }}
              />
            </div>

            {/* Description */}
            <div>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Journal Entry Description</p>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: "100%", height: "36px", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Balance check */}
            <div style={{ padding: "10px 14px", borderRadius: "6px", backgroundColor: "var(--theme-status-success-bg)", border: "1px solid var(--theme-status-success-border)" }}>
              <p style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
                ✓ Balanced — DR {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)} = CR {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount)}
              </p>
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
