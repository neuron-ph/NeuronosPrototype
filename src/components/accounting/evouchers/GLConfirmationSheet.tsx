import { useState, useEffect } from "react";
import { Loader2, ChevronDown, CheckCircle } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { logActivity } from "../../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { SidePanel } from "../../common/SidePanel";
import type { EVoucherAPType } from "../../../types/evoucher";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  normalizeCurrency,
  resolvePostingRate,
  roundMoney,
  toBaseAmount,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";
import { resolveExchangeRate } from "../../../utils/exchangeRates";

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
/**
 * Suggests GL accounts for the CLOSING journal entry (Verify & Post step).
 * By this point, a disbursement JE has already credited the source bank account
 * and debited Employee Cash Advances Receivable. The closing entry retires that
 * receivable and replaces it with the actual expense account(s).
 */
function getSuggestedAccounts(type: EVoucherAPType): { debitHint: string; creditHint: string } {
  switch (type) {
    case "expense":
    case "cash_advance":
    case "budget_request":
    case "direct_expense":
      return { debitHint: "Expense", creditHint: "Employee Cash Advances Receivable" };
    case "reimbursement":
      // Reimbursements are closed at disbursement — this sheet should not be
      // reached for reimbursement, but keep a fallback.
      return { debitHint: "Expense", creditHint: "Cash" };
  }
}

function AccountSelect({
  label,
  id,
  accounts,
  value,
  onChange,
}: {
  label: string;
  id: string;
  accounts: GLAccount[];
  value: string;
  onChange: (id: string, account: GLAccount) => void;
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
            width: "100%",
            height: "36px",
            border: "1px solid var(--theme-border-default)",
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

  // Multi-currency. Defaults to PHP unless the evoucher row carries USD.
  const [voucherCurrency, setVoucherCurrency] =
    useState<AccountingCurrency>(FUNCTIONAL_CURRENCY);
  const [exchangeRateInput, setExchangeRateInput] = useState<string>("");

  const hints = getSuggestedAccounts(transactionType);

  const parsedRate = parseFloat(exchangeRateInput);
  const isPhpVoucher = voucherCurrency === FUNCTIONAL_CURRENCY;
  const previewRate = isPhpVoucher
    ? 1
    : Number.isFinite(parsedRate) && parsedRate > 0
      ? parsedRate
      : NaN;
  const hasUsableRate = Number.isFinite(previewRate) && previewRate > 0;
  const previewBase = hasUsableRate ? roundMoney(amount * previewRate) : 0;

  // Load evoucher FX metadata when the sheet opens.
  useEffect(() => {
    if (!isOpen || !evoucherId) return;
    let cancelled = false;
    supabase
      .from("evouchers")
      .select("currency, original_currency, exchange_rate, exchange_rate_date")
      .eq("id", evoucherId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return;
        const currency = normalizeCurrency(
          (data as any)?.original_currency ?? (data as any)?.currency ?? FUNCTIONAL_CURRENCY,
          FUNCTIONAL_CURRENCY,
        );
        setVoucherCurrency(currency);
        if (currency !== FUNCTIONAL_CURRENCY) {
          const existing = (data as any)?.exchange_rate;
          if (existing && existing > 0) {
            setExchangeRateInput(String(existing));
          } else {
            try {
              const row = await resolveExchangeRate({
                fromCurrency: currency,
                toCurrency: FUNCTIONAL_CURRENCY,
                rateDate: (data as any)?.exchange_rate_date ?? new Date().toISOString(),
              });
              if (!cancelled) setExchangeRateInput((cur) => cur || String(row.rate));
            } catch {
              // user must enter manually
            }
          }
        }
      });
    return () => { cancelled = true; };
  }, [isOpen, evoucherId]);

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

    // Closing entry runs at the voucher's locked carrying rate (auto-loaded
    // from `evoucher.exchange_rate` in the open effect). This clears Advances
    // Receivable at its exact carrying value — no FX delta here. Any realized
    // FX between AP carrying rate and cash settlement rate is booked by
    // DisburseEVoucherPage at disbursement time.
    let lockedRate: number;
    try {
      lockedRate = resolvePostingRate(voucherCurrency, parseFloat(exchangeRateInput));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid exchange rate");
      return;
    }
    const baseAmount = toBaseAmount({
      amount,
      currency: voucherCurrency,
      exchangeRate: lockedRate,
    });
    const rateDate = new Date().toISOString().slice(0, 10);

    setPosting(true);
    try {
      const isForeign = voucherCurrency !== FUNCTIONAL_CURRENCY;
      const fxLineFields = isForeign
        ? {
            currency: voucherCurrency,
            exchange_rate: lockedRate,
            base_currency: FUNCTIONAL_CURRENCY,
          }
        : {};
      const lines: JournalLine[] = [
        {
          account_id: debitAccountId,
          account_code: debitAccountCode,
          account_name: debitAccountName,
          debit: baseAmount,
          credit: 0,
          description,
          ...(isForeign
            ? { foreign_debit: roundMoney(amount), foreign_credit: 0, ...fxLineFields }
            : {}),
        } as JournalLine,
        {
          account_id: creditAccountId,
          account_code: creditAccountCode,
          account_name: creditAccountName,
          debit: 0,
          credit: baseAmount,
          description,
          ...(isForeign
            ? { foreign_debit: 0, foreign_credit: roundMoney(amount), ...fxLineFields }
            : {}),
        } as JournalLine,
      ];

      const entryId = `JE-${Date.now()}`;

      // Create PHP-balanced journal entry with FX metadata.
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        entry_date: new Date().toISOString(),
        evoucher_id: evoucherId,
        description,
        lines,
        total_debit: baseAmount,
        total_credit: baseAmount,
        transaction_currency: voucherCurrency,
        exchange_rate: lockedRate,
        base_currency: FUNCTIONAL_CURRENCY,
        source_amount: roundMoney(amount),
        base_amount: baseAmount,
        exchange_rate_date: rateDate,
        status: "draft",
        created_by: currentUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (jeError) throw jeError;

      // Transition EV to posted + link closing JE + persist FX metadata.
      const { error: evError } = await supabase
        .from("evouchers")
        .update({
          status: "posted",
          closing_journal_entry_id: entryId,
          currency: voucherCurrency,
          original_currency: voucherCurrency,
          exchange_rate: lockedRate,
          base_currency: FUNCTIONAL_CURRENCY,
          base_amount: baseAmount,
          exchange_rate_date: rateDate,
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
        action: `Closing GL Entry Posted — DR ${debitAccountName} / CR ${creditAccountName}`,
        status: "posted",
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.department,
        metadata: {
          previous_status: "pending_verification",
          new_status: "posted",
        },
        created_at: new Date().toISOString(),
      });

      toast.success("Closing journal entry posted — E-Voucher complete");
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
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--theme-border-default)", display: "flex", justifyContent: "space-between", backgroundColor: "var(--theme-bg-surface)" }}>
      <button
        onClick={onClose}
        style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
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
          disabled={posting || !debitAccountId || !creditAccountId || !hasUsableRate}
          style={{ height: "40px", padding: "0 24px", borderRadius: "8px", backgroundColor: "var(--theme-action-primary-bg)", border: "none", color: "var(--theme-action-primary-text)", fontSize: "13px", fontWeight: 600, cursor: posting || !debitAccountId || !creditAccountId || !hasUsableRate ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "8px", opacity: posting || !debitAccountId || !creditAccountId || !hasUsableRate ? 0.6 : 1 }}
        >
          {posting && <Loader2 size={16} className="animate-spin" />}
          {posting ? "Posting…" : "Confirm & Post to Ledger"}
        </button>
      )}
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="GL Journal Entry" footer={footer} width="520px">
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        {/* EV summary */}
        <div style={{ padding: "12px 16px", borderRadius: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", border: "1px solid var(--theme-border-default)", marginBottom: "24px" }}>
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
              {formatMoney(amount, voucherCurrency)}
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
            <div style={{ padding: "16px", borderRadius: "8px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Debit (DR)</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  {formatMoney(previewBase, FUNCTIONAL_CURRENCY)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                id="gl-debit-account"
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
            <div style={{ padding: "16px", borderRadius: "8px", border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Credit (CR)</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  {formatMoney(previewBase, FUNCTIONAL_CURRENCY)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                id="gl-credit-account"
                accounts={accounts}
                value={creditAccountId}
                onChange={(id, acct) => {
                  setCreditAccountId(id);
                  setCreditAccountName(acct.name);
                  setCreditAccountCode(acct.code);
                }}
              />
            </div>

            {/* Currency + rate (visible only when USD) */}
            {!isPhpVoucher && (
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ minWidth: "120px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Currency</label>
                  <input
                    type="text"
                    value={voucherCurrency}
                    readOnly
                    style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", backgroundColor: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-secondary)" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>
                    {voucherCurrency} → {FUNCTIONAL_CURRENCY} Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={exchangeRateInput}
                    onChange={(e) => setExchangeRateInput(e.target.value)}
                    placeholder="e.g. 58.25"
                    style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)", fontFamily: "monospace" }}
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="gl-je-description" style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "6px" }}>Journal Entry Description</label>
              <input
                id="gl-je-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: "100%", height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "6px", padding: "0 10px", fontSize: "13px", outline: "none", boxSizing: "border-box", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
              />
            </div>

            {/* Balance check */}
            <div style={{ padding: "10px 14px", borderRadius: "6px", backgroundColor: "var(--theme-status-success-bg)", border: "1px solid var(--theme-status-success-border)", display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle size={13} style={{ color: "var(--theme-status-success-fg)", flexShrink: 0 }} />
              <p style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500, margin: 0 }}>
                Balanced (PHP) — DR {formatMoney(previewBase, FUNCTIONAL_CURRENCY)} = CR {formatMoney(previewBase, FUNCTIONAL_CURRENCY)}
                {!isPhpVoucher && hasUsableRate && (
                  <> · from {formatMoney(amount, voucherCurrency)} @ {previewRate}</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
