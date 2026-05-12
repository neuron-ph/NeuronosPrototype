import { useState, useEffect } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { logCreation } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import { SidePanel } from "../../common/SidePanel";
import {
  FUNCTIONAL_CURRENCY,
  SUPPORTED_ACCOUNTING_CURRENCIES,
  formatMoney,
  resolvePostingRate,
  roundMoney,
  toBaseAmount,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";
import { resolveExchangeRate } from "../../../utils/exchangeRates";
import {
  JournalLineEditor,
  makeEmptyLine,
  computeJournalTotals,
  buildJournalLines,
  findSameSideDuplicate,
  type EditableLine,
  type COAAccount,
} from "../journal/JournalLineEditor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManualJournalEntryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ManualJournalEntryPanel({
  isOpen,
  onClose,
  onCreated,
}: ManualJournalEntryPanelProps) {
  const { user } = useUser();

  // Form state
  const [entryDate, setEntryDate] = useState<string>(today());
  const [memo, setMemo] = useState<string>("");
  const [lines, setLines] = useState<EditableLine[]>([makeEmptyLine(), makeEmptyLine()]);
  const [transactionCurrency, setTransactionCurrency] =
    useState<AccountingCurrency>(FUNCTIONAL_CURRENCY);
  const [exchangeRateInput, setExchangeRateInput] = useState<string>("");

  // Remote data
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [showPostConfirm, setShowPostConfirm] = useState(false);

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen) {
      setEntryDate(today());
      setMemo("");
      setLines([makeEmptyLine(), makeEmptyLine()]);
      setShowPostConfirm(false);
      setTransactionCurrency(FUNCTIONAL_CURRENCY);
      setExchangeRateInput("");
    }
  }, [isOpen]);

  // Default the rate from the master table when the user picks USD.
  useEffect(() => {
    if (!isOpen) return;
    if (transactionCurrency === FUNCTIONAL_CURRENCY) {
      setExchangeRateInput("");
      return;
    }
    let cancelled = false;
    resolveExchangeRate({
      fromCurrency: transactionCurrency,
      toCurrency: FUNCTIONAL_CURRENCY,
      rateDate: entryDate,
    })
      .then((row) => {
        if (cancelled) return;
        setExchangeRateInput((current) => current || String(row.rate));
      })
      .catch(() => {
        // Force the user to enter one explicitly.
      });
    return () => { cancelled = true; };
  }, [isOpen, transactionCurrency, entryDate]);

  // Load accounts when panel opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setLoadingAccounts(true);
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (cancelled) return;
      if (error) {
        toast.error("Failed to load chart of accounts");
      } else {
        setAccounts((data ?? []) as COAAccount[]);
      }
      setLoadingAccounts(false);
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------

  const parsedRate = parseFloat(exchangeRateInput);
  const isPhp = transactionCurrency === FUNCTIONAL_CURRENCY;
  const lockedRate = isPhp
    ? 1
    : Number.isFinite(parsedRate) && parsedRate > 0
      ? parsedRate
      : NaN;

  const totals = computeJournalTotals(lines, lockedRate);
  const { foreignTotalDebits, totalDebits, totalCredits, hasUsableRate, isBalanced } = totals;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const validateBeforeSubmit = () => {
    if (!user?.id) { toast.error("Cannot determine current user"); return false; }
    if (!isPhp && !hasUsableRate) {
      toast.error(`Enter a positive ${transactionCurrency}→${FUNCTIONAL_CURRENCY} rate`);
      return false;
    }
    if (!isBalanced) { toast.error("Entry is out of balance"); return false; }
    const activeLines = lines.filter(
      (l) => parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0,
    );
    if (activeLines.some((l) => !l.account_id)) {
      toast.error("All line items must have an account selected");
      return false;
    }
    const dup = findSameSideDuplicate(lines);
    if (dup) { toast.error(dup); return false; }
    return true;
  };

  const fxHeader = () => {
    const postingRate = resolvePostingRate(transactionCurrency, lockedRate);
    const sourceAmount = roundMoney(foreignTotalDebits);
    const baseAmount = toBaseAmount({
      amount: sourceAmount,
      currency: transactionCurrency,
      exchangeRate: postingRate,
    });
    return {
      transaction_currency: transactionCurrency,
      exchange_rate: postingRate,
      base_currency: FUNCTIONAL_CURRENCY,
      source_amount: sourceAmount,
      base_amount: baseAmount,
      exchange_rate_date: entryDate,
    };
  };

  const buildLines = () =>
    buildJournalLines({
      lines,
      accounts,
      transactionCurrency,
      exchangeRate: lockedRate,
      defaultDescription: memo,
    });

  const handleSaveDraft = async () => {
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const entryId = `JE-MAN-${Date.now()}`;
      const { error } = await supabase.from("journal_entries").insert({
        id: entryId, entry_date: entryDate,
        description: memo.trim() || null, lines: buildLines(),
        total_debit: totalDebits, total_credit: totalCredits,
        ...fxHeader(),
        status: "draft", created_by: user!.id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      const actor = { id: user!.id, name: user!.name, department: user!.department ?? "" };
      logCreation("journal_entry", entryId, memo.trim() || entryId, actor);
      toast.success("Draft saved — entry not yet posted to the ledger");
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const entryId = `JE-MAN-${Date.now()}`;
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId, entry_date: entryDate,
        description: memo.trim() || null, lines: buildLines(),
        total_debit: totalDebits, total_credit: totalCredits,
        ...fxHeader(),
        status: "posted", created_by: user!.id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (jeError) throw jeError;
      const actor = { id: user!.id, name: user!.name, department: user!.department ?? "" };
      logCreation("journal_entry", entryId, memo.trim() || entryId, actor);
      toast.success("Journal entry posted to the general ledger");
      setShowPostConfirm(false);
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      console.error("ManualJournalEntryPanel submit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to post journal entry");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const footer = (
    <div style={{ borderTop: "1px solid #E5E9F0", backgroundColor: "#FFFFFF" }}>
      {/* Post confirmation banner */}
      {showPostConfirm && (
        <div style={{
          padding: "14px 24px",
          backgroundColor: "#F0FDF4",
          borderBottom: "1px solid #BBF7D0",
          display: "flex", flexDirection: "column", gap: "10px",
        }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#15803D", fontWeight: 500, lineHeight: 1.5 }}>
            Post to General Ledger? This entry is balanced — Debits equal Credits ({formatMoney(totalDebits, FUNCTIONAL_CURRENCY)}).
            Once posted, this entry is <strong>permanent and cannot be edited or deleted</strong>.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowPostConfirm(false)}
              disabled={submitting}
              style={{ flex: 1, height: "32px", border: "1px solid #BBF7D0", borderRadius: "6px", backgroundColor: "#FFFFFF", color: "#667085", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ flex: 1, height: "32px", border: "none", borderRadius: "6px", backgroundColor: "#0F766E", color: "#FFFFFF", fontSize: "12px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              {submitting && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
              {submitting ? "Posting…" : "Confirm & Post"}
            </button>
          </div>
        </div>
      )}

      {/* Footer buttons */}
      {!showPostConfirm && (
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onClose}
            style={{ height: "36px", padding: "0 16px", background: "none", border: "none", color: "#667085", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
          >
            Cancel
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleSaveDraft}
              disabled={!isBalanced || submitting}
              style={{ height: "36px", padding: "0 16px", borderRadius: "8px", backgroundColor: "#F9FAFB", border: "1px solid #E5E9F0", color: "#12332B", fontSize: "13px", fontWeight: 500, cursor: !isBalanced || submitting ? "not-allowed" : "pointer", opacity: !isBalanced || submitting ? 0.55 : 1 }}
            >
              Save as Draft
            </button>
            <button
              onClick={() => { if (isBalanced) setShowPostConfirm(true); }}
              disabled={!isBalanced || submitting}
              style={{ height: "36px", padding: "0 20px", borderRadius: "8px", backgroundColor: "#0F766E", border: "none", color: "#FFFFFF", fontSize: "13px", fontWeight: 600, cursor: !isBalanced || submitting ? "not-allowed" : "pointer", opacity: !isBalanced || submitting ? 0.55 : 1, display: "flex", alignItems: "center", gap: "8px", transition: "opacity 150ms" }}
            >
              Post Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BookOpen size={18} style={{ color: "#0F766E" }} />
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#12332B" }}>
            New Journal Entry
          </span>
        </div>
      }
      footer={footer}
      width="760px"
    >
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", height: "100%" }}>

        {/* Header fields row */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {/* Date */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "150px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>
              Entry Date
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={{
                height: "36px",
                border: "1px solid #E5E9F0",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#12332B",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#FFFFFF",
              }}
            />
          </div>

          {/* Currency */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "110px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>Currency</label>
            <select
              value={transactionCurrency}
              onChange={(e) => setTransactionCurrency(e.target.value as AccountingCurrency)}
              style={{ height: "36px", border: "1px solid #E5E9F0", borderRadius: "6px", padding: "0 8px", fontSize: "13px", color: "#12332B", outline: "none", backgroundColor: "#FFFFFF" }}
            >
              {SUPPORTED_ACCOUNTING_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {!isPhp && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px" }}>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>
                {transactionCurrency} → {FUNCTIONAL_CURRENCY} Rate
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={exchangeRateInput}
                onChange={(e) => setExchangeRateInput(e.target.value)}
                placeholder="e.g. 58.25"
                style={{ height: "36px", border: "1px solid #E5E9F0", borderRadius: "6px", padding: "0 10px", fontSize: "13px", color: "#12332B", outline: "none", backgroundColor: "#FFFFFF", fontFamily: "monospace" }}
              />
            </div>
          )}

          {/* Memo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: "200px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>
              Description / Memo
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Period-end accrual adjustment"
              style={{
                height: "36px",
                border: "1px solid #E5E9F0",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#12332B",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#FFFFFF",
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* Line editor */}
        <JournalLineEditor
          lines={lines}
          onChange={setLines}
          accounts={accounts}
          transactionCurrency={transactionCurrency}
          exchangeRate={lockedRate}
          loading={loadingAccounts}
        />

      </div>
    </SidePanel>
  );
}
