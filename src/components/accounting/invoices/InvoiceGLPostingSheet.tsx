import { useState, useEffect } from "react";
import { Loader2, ChevronDown, BookOpen, Receipt } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { logActivity } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import { SidePanel } from "../../common/SidePanel";
import { useUser } from "../../../hooks/useUser";
import { fireInvoiceARTicket } from "../../../utils/workflowTickets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  journal_entry_id?: string | null;
  description?: string;
}

interface JournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

export interface InvoiceGLPostingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  onPosted?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AR_ACCOUNT_CODE = "1100";
const REVENUE_ACCOUNT_CODE = "4000";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccountSelect({
  label,
  accounts,
  value,
  onChange,
  disabled,
}: {
  label: string;
  accounts: GLAccount[];
  value: string;
  onChange: (id: string, account: GLAccount) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--theme-text-muted)",
          marginBottom: "6px",
        }}
      >
        {label}
      </p>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          disabled={disabled}
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
            backgroundColor: disabled
              ? "var(--theme-bg-surface-subtle)"
              : "var(--theme-bg-surface)",
            color: "var(--theme-text-primary)",
            appearance: "none",
            cursor: disabled ? "not-allowed" : "pointer",
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
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--theme-text-muted)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InvoiceGLPostingSheet({
  isOpen,
  onClose,
  invoiceId,
  onPosted,
}: InvoiceGLPostingSheetProps) {
  const { user } = useUser();

  // Invoice data
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Chart of accounts
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // DR account
  const [debitAccountId, setDebitAccountId] = useState("");
  const [debitAccountName, setDebitAccountName] = useState("");
  const [debitAccountCode, setDebitAccountCode] = useState("");

  // CR account
  const [creditAccountId, setCreditAccountId] = useState("");
  const [creditAccountName, setCreditAccountName] = useState("");
  const [creditAccountCode, setCreditAccountCode] = useState("");

  // Amount — editable, seeded from invoice total
  const [amount, setAmount] = useState<string>("");

  // Memo / description
  const [description, setDescription] = useState("");

  // Posting state
  const [posting, setPosting] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    fetchInvoice();
    fetchAccounts();
  }, [isOpen, invoiceId]);

  async function fetchInvoice() {
    setLoadingInvoice(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, invoice_date, total_amount, status, journal_entry_id, notes")
      .eq("id", invoiceId)
      .maybeSingle();

    if (error) {
      toast.error("Failed to load invoice");
    } else if (data) {
      const inv = data as InvoiceRecord;
      setInvoice(inv);
      setAmount(String(inv.total_amount ?? ""));
      setDescription(`Invoice ${inv.invoice_number} — ${inv.customer_name}`);
    }
    setLoadingInvoice(false);
  }

  async function fetchAccounts() {
    setLoadingAccounts(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("code", { ascending: true });

    if (error) {
      toast.error("Failed to load chart of accounts");
      setLoadingAccounts(false);
      return;
    }

    const accts = (data || []) as GLAccount[];
    setAccounts(accts);

    // Pre-fill by canonical account codes; fall back to name substring match
    const arAccount =
      accts.find((a) => a.code === AR_ACCOUNT_CODE) ??
      accts.find((a) =>
        a.name.toLowerCase().includes("accounts receivable")
      );
    const revenueAccount =
      accts.find((a) => a.code === REVENUE_ACCOUNT_CODE) ??
      accts.find((a) => a.name.toLowerCase().includes("revenue"));

    if (arAccount) {
      setDebitAccountId(arAccount.id);
      setDebitAccountName(arAccount.name);
      setDebitAccountCode(arAccount.code);
    }
    if (revenueAccount) {
      setCreditAccountId(revenueAccount.id);
      setCreditAccountName(revenueAccount.name);
      setCreditAccountCode(revenueAccount.code);
    }

    setLoadingAccounts(false);
  }

  // ---------------------------------------------------------------------------
  // Reset on close
  // ---------------------------------------------------------------------------

  function handleClose() {
    setInvoice(null);
    setAccounts([]);
    setDebitAccountId("");
    setDebitAccountName("");
    setDebitAccountCode("");
    setCreditAccountId("");
    setCreditAccountName("");
    setCreditAccountCode("");
    setAmount("");
    setDescription("");
    onClose();
  }

  // ---------------------------------------------------------------------------
  // Posting
  // ---------------------------------------------------------------------------

  async function handlePost() {
    if (!debitAccountId || !creditAccountId) {
      toast.error("Select both a debit and credit account");
      return;
    }
    if (debitAccountId === creditAccountId) {
      toast.error("Debit and credit accounts must be different");
      return;
    }

    const postingAmount = parseFloat(amount);
    if (!postingAmount || isNaN(postingAmount) || postingAmount <= 0) {
      toast.error("Enter a valid amount greater than zero");
      return;
    }

    setPosting(true);
    try {
      const entryId = `JE-${Date.now()}`;

      const lines: JournalLine[] = [
        {
          account_id: debitAccountId,
          account_code: debitAccountCode,
          account_name: debitAccountName,
          debit: postingAmount,
          credit: 0,
          description,
        },
        {
          account_id: creditAccountId,
          account_code: creditAccountCode,
          account_name: creditAccountName,
          debit: 0,
          credit: postingAmount,
          description,
        },
      ];

      // 1. Create journal entry
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        entry_number: entryId,
        entry_date: new Date().toISOString(),
        invoice_id: invoiceId,
        description,
        lines,
        total_debit: postingAmount,
        total_credit: postingAmount,
        status: "posted",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (jeError) throw jeError;

      if (user && invoice) {
        const actor = { id: user.id, name: user.name, department: user.department ?? "" };
        logActivity("invoice", invoice.id, invoice.invoice_number ?? invoice.id, "posted", actor);
      }

      // 2. Update invoice — link journal entry and set status to posted
      const { error: invError } = await supabase
        .from("invoices")
        .update({
          journal_entry_id: entryId,
          status: "posted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (invError) throw invError;

      toast.success("GL entry posted — Accounts Receivable recognised");

      // Auto-fire collections follow-up ticket
      if (user && invoice) {
        fireInvoiceARTicket({
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          totalAmount: invoice.total_amount,
          userId: user.id,
          userName: user.name,
          userDept: user.department,
        });
      }

      onPosted?.();
      handleClose();
    } catch (err) {
      console.error("Invoice GL posting error:", err);
      toast.error("Failed to post journal entry");
    } finally {
      setPosting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const isAlreadyPosted = !!invoice?.journal_entry_id;
  const postingAmount = parseFloat(amount) || 0;
  const canPost =
    !posting &&
    !isAlreadyPosted &&
    !!debitAccountId &&
    !!creditAccountId &&
    debitAccountId !== creditAccountId &&
    postingAmount > 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  const formatDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  // ---------------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------------

  const footer = (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "var(--neuron-bg-elevated)",
      }}
    >
      <button
        onClick={handleClose}
        style={{
          height: "40px",
          padding: "0 20px",
          background: "none",
          border: "none",
          color: "var(--neuron-ink-muted)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>

      {isAlreadyPosted ? (
        <span
          style={{
            fontSize: "13px",
            color: "var(--theme-status-success-fg)",
            fontWeight: 500,
          }}
        >
          Already posted to GL
        </span>
      ) : (
        <button
          onClick={handlePost}
          disabled={!canPost}
          style={{
            height: "40px",
            padding: "0 24px",
            borderRadius: "8px",
            backgroundColor: "#0F766E",
            border: "none",
            color: "#FFFFFF",
            fontSize: "13px",
            fontWeight: 600,
            cursor: canPost ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: canPost ? 1 : 0.5,
            transition: "opacity 0.15s",
          }}
        >
          {posting && (
            <Loader2
              size={16}
              style={{ animation: "spin 1s linear infinite" }}
            />
          )}
          <BookOpen size={15} />
          {posting ? "Posting…" : "Post to GL"}
        </button>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = loadingInvoice || loadingAccounts;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Post Invoice to GL"
      footer={footer}
      width="520px"
    >
      <div
        style={{ padding: "24px", overflowY: "auto", height: "100%" }}
      >
        {isLoading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "60px",
            }}
          >
            <Loader2
              size={24}
              style={{
                animation: "spin 1s linear infinite",
                color: "var(--theme-text-muted)",
              }}
            />
          </div>
        ) : !invoice ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "60px 24px",
              gap: "8px",
            }}
          >
            <Receipt size={32} style={{ color: "var(--theme-text-muted)" }} />
            <p
              style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}
            >
              Invoice not found.
            </p>
          </div>
        ) : (
          <>
            {/* Invoice summary card */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "8px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
                marginBottom: "24px",
              }}
            >
              {[
                { label: "Invoice", value: invoice.invoice_number },
                { label: "Customer", value: invoice.customer_name },
                {
                  label: "Date",
                  value: formatDate(invoice.invoice_date),
                },
                {
                  label: "Amount",
                  value: formatCurrency(invoice.total_amount),
                  bold: true,
                },
              ].map(({ label, value, bold }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--theme-text-muted)",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: bold ? "14px" : "13px",
                      fontWeight: bold ? 700 : 500,
                      color: "var(--theme-text-primary)",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Already-posted notice */}
            {isAlreadyPosted && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "var(--theme-status-success-bg)",
                  border: "1px solid var(--theme-status-success-border)",
                  marginBottom: "20px",
                }}
              >
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--theme-status-success-fg)",
                    fontWeight: 500,
                  }}
                >
                  This invoice already has a linked journal entry and cannot be posted again.
                </p>
              </div>
            )}

            {/* Suggested entry hint */}
            {!isAlreadyPosted && (
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--theme-text-muted)",
                    lineHeight: "1.5",
                  }}
                >
                  Default entry:{" "}
                  <strong>DR Accounts Receivable ({AR_ACCOUNT_CODE})</strong>
                  {" / "}
                  <strong>CR Revenue ({REVENUE_ACCOUNT_CODE})</strong>. Override below if needed.
                </p>
              </div>
            )}

            {/* Account selectors and amount */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Debit row */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Debit (DR)
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--theme-text-primary)",
                    }}
                  >
                    {postingAmount > 0 ? formatCurrency(postingAmount) : "—"}
                  </span>
                </div>
                <AccountSelect
                  label="Account"
                  accounts={accounts}
                  value={debitAccountId}
                  disabled={isAlreadyPosted}
                  onChange={(id, acct) => {
                    setDebitAccountId(id);
                    setDebitAccountName(acct.name);
                    setDebitAccountCode(acct.code);
                  }}
                />
              </div>

              {/* Credit row */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Credit (CR)
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--theme-text-primary)",
                    }}
                  >
                    {postingAmount > 0 ? formatCurrency(postingAmount) : "—"}
                  </span>
                </div>
                <AccountSelect
                  label="Account"
                  accounts={accounts}
                  value={creditAccountId}
                  disabled={isAlreadyPosted}
                  onChange={(id, acct) => {
                    setCreditAccountId(id);
                    setCreditAccountName(acct.name);
                    setCreditAccountCode(acct.code);
                  }}
                />
              </div>

              {/* Amount field */}
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--theme-text-muted)",
                    marginBottom: "6px",
                  }}
                >
                  Posting Amount (PHP)
                </p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  disabled={isAlreadyPosted}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: "100%",
                    height: "36px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    padding: "0 10px",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor: isAlreadyPosted
                      ? "var(--theme-bg-surface-subtle)"
                      : "var(--theme-bg-surface)",
                    color: "var(--theme-text-primary)",
                  }}
                />
              </div>

              {/* Memo / description */}
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--theme-text-muted)",
                    marginBottom: "6px",
                  }}
                >
                  Journal Entry Description
                </p>
                <input
                  type="text"
                  value={description}
                  disabled={isAlreadyPosted}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: "100%",
                    height: "36px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    padding: "0 10px",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor: isAlreadyPosted
                      ? "var(--theme-bg-surface-subtle)"
                      : "var(--theme-bg-surface)",
                    color: "var(--theme-text-primary)",
                  }}
                />
              </div>

              {/* Balance confirmation pill */}
              {!isAlreadyPosted && postingAmount > 0 && debitAccountId && creditAccountId && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-status-success-bg)",
                    border: "1px solid var(--theme-status-success-border)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--theme-status-success-fg)",
                      fontWeight: 500,
                    }}
                  >
                    Balanced — DR {formatCurrency(postingAmount)} = CR{" "}
                    {formatCurrency(postingAmount)}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SidePanel>
  );
}
