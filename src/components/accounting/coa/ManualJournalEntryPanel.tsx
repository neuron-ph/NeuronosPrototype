import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, BookOpen, Loader2, ChevronDown } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface COAAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LineItem {
  id: string; // client-side only key
  account_id: string;
  description: string;
  debit: string; // string so the input stays controlled without numeric quirks
  credit: string;
}

export interface ManualJournalEntryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });


function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLineItem(): LineItem {
  return { id: crypto.randomUUID(), account_id: "", description: "", debit: "", credit: "" };
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Sub-component: account combobox (native select for consistency with GL sheet)
// ---------------------------------------------------------------------------

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: COAAccount[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: "34px",
          border: "1px solid #E5E9F0",
          borderRadius: "6px",
          padding: "0 28px 0 8px",
          fontSize: "13px",
          color: value ? "#12332B" : "#667085",
          backgroundColor: "#FFFFFF",
          appearance: "none",
          cursor: "pointer",
          outline: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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
        size={13}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "#667085",
          pointerEvents: "none",
          flexShrink: 0,
        }}
      />
    </div>
  );
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
  const [lines, setLines] = useState<LineItem[]>([makeLineItem(), makeLineItem()]);
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
      setLines([makeLineItem(), makeLineItem()]);
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
  // Line item mutations
  // ---------------------------------------------------------------------------

  const updateLine = useCallback(
    (id: string, patch: Partial<Omit<LineItem, "id">>) => {
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
      );
    },
    []
  );

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, makeLineItem()]);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      if (prev.length <= 2) return prev; // keep minimum of 2 rows
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------

  // Inputs are in `transactionCurrency`; PHP base totals drive GL balancing.
  const parsedRate = parseFloat(exchangeRateInput);
  const isPhp = transactionCurrency === FUNCTIONAL_CURRENCY;
  const lockedRate = isPhp
    ? 1
    : Number.isFinite(parsedRate) && parsedRate > 0
      ? parsedRate
      : NaN;
  const hasUsableRate = Number.isFinite(lockedRate) && lockedRate > 0;

  const foreignTotalDebits = lines.reduce((sum, l) => sum + parseAmount(l.debit), 0);
  const foreignTotalCredits = lines.reduce((sum, l) => sum + parseAmount(l.credit), 0);
  const totalDebits = hasUsableRate ? roundMoney(foreignTotalDebits * lockedRate) : 0;
  const totalCredits = hasUsableRate ? roundMoney(foreignTotalCredits * lockedRate) : 0;
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced =
    hasUsableRate &&
    totalDebits > 0 &&
    totalCredits > 0 &&
    difference < 0.005;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const buildJsonbLines = () => {
    const activeLines = lines.filter((l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0);
    return activeLines.map((l) => {
      const acct = accounts.find((a) => a.id === l.account_id);
      const foreignDebit = parseAmount(l.debit);
      const foreignCredit = parseAmount(l.credit);
      return {
        account_id: l.account_id,
        account_code: acct?.code ?? "",
        account_name: acct?.name ?? "",
        debit: roundMoney(foreignDebit * lockedRate),
        credit: roundMoney(foreignCredit * lockedRate),
        foreign_debit: foreignDebit,
        foreign_credit: foreignCredit,
        currency: transactionCurrency,
        exchange_rate: lockedRate,
        base_currency: FUNCTIONAL_CURRENCY,
        description: l.description.trim() || memo.trim() || "",
      };
    });
  };

  const validateBeforeSubmit = () => {
    if (!user?.id) { toast.error("Cannot determine current user"); return false; }
    if (!isPhp && !hasUsableRate) {
      toast.error(`Enter a positive ${transactionCurrency}→${FUNCTIONAL_CURRENCY} rate`);
      return false;
    }
    if (!isBalanced) { toast.error("Entry is out of balance"); return false; }
    if (lines.some((l) => !l.account_id)) { toast.error("All line items must have an account selected"); return false; }
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

  const handleSaveDraft = async () => {
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const entryId = `JE-MAN-${Date.now()}`;
      const { error } = await supabase.from("journal_entries").insert({
        id: entryId, entry_date: entryDate,
        description: memo.trim() || null, lines: buildJsonbLines(),
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
        description: memo.trim() || null, lines: buildJsonbLines(),
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

        {/* Line items section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 110px 110px 32px",
              gap: "8px",
              padding: "8px 10px",
              backgroundColor: "#F9FAFB",
              borderRadius: "6px 6px 0 0",
              border: "1px solid #E5E9F0",
              borderBottom: "none",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>Account</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>Description</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right" }}>Debit ({transactionCurrency})</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right" }}>Credit ({transactionCurrency})</span>
            <span />
          </div>

          {/* Loading state */}
          {loadingAccounts ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "32px",
                border: "1px solid #E5E9F0",
                borderTop: "none",
              }}
            >
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#667085" }} />
              <span style={{ marginLeft: "8px", fontSize: "13px", color: "#667085" }}>Loading accounts…</span>
            </div>
          ) : (
            <>
              {/* Line rows */}
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 110px 110px 32px",
                    gap: "8px",
                    padding: "8px 10px",
                    border: "1px solid #E5E9F0",
                    borderTop: idx === 0 ? "1px solid #E5E9F0" : "none",
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                  }}
                >
                  {/* Account picker */}
                  <AccountSelect
                    accounts={accounts}
                    value={line.account_id}
                    onChange={(id) => updateLine(line.id, { account_id: id })}
                  />

                  {/* Line description */}
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="Optional note"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: "#FFFFFF",
                    }}
                  />

                  {/* Debit */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit}
                    onChange={(e) => {
                      updateLine(line.id, { debit: e.target.value, credit: e.target.value ? "" : line.credit });
                    }}
                    placeholder="0.00"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      textAlign: "right",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: line.debit ? "#F7FAF8" : "#FFFFFF",
                    }}
                  />

                  {/* Credit */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit}
                    onChange={(e) => {
                      updateLine(line.id, { credit: e.target.value, debit: e.target.value ? "" : line.debit });
                    }}
                    placeholder="0.00"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      textAlign: "right",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: line.credit ? "#F7FAF8" : "#FFFFFF",
                    }}
                  />

                  {/* Remove button */}
                  <button
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 2}
                    title={lines.length <= 2 ? "Minimum 2 lines required" : "Remove line"}
                    style={{
                      width: "28px",
                      height: "28px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      cursor: lines.length <= 2 ? "not-allowed" : "pointer",
                      color: lines.length <= 2 ? "#D1D5DB" : "#667085",
                      padding: 0,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (lines.length > 2) {
                        (e.currentTarget as HTMLButtonElement).style.color = "#DC2626";
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FEF2F2";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = lines.length <= 2 ? "#D1D5DB" : "#667085";
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Add line button row */}
              <div
                style={{
                  border: "1px solid #E5E9F0",
                  borderTop: "none",
                  borderRadius: "0 0 6px 6px",
                  padding: "8px 10px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <button
                  onClick={addLine}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    padding: "4px 0",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#0F766E",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  Add Line
                </button>
              </div>
            </>
          )}
        </div>

        {/* Totals footer */}
        <div
          style={{
            borderRadius: "8px",
            border: "1px solid #E5E9F0",
            overflow: "hidden",
          }}
        >
          {/* Totals row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 110px 40px",
              gap: "8px",
              padding: "10px 10px 10px 10px",
              backgroundColor: "#F9FAFB",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Totals ({transactionCurrency})
            </span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B", textAlign: "right" }}>
              {formatMoney(foreignTotalDebits, transactionCurrency)}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B", textAlign: "right" }}>
              {formatMoney(foreignTotalCredits, transactionCurrency)}
            </span>
            <span />
          </div>
          {!isPhp && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 110px 40px",
                gap: "8px",
                padding: "8px 10px",
                backgroundColor: "#FFFFFF",
                borderTop: "1px solid #E5E9F0",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "11px", color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Posted in PHP @ {hasUsableRate ? lockedRate : "—"}
              </span>
              <span style={{ fontSize: "12px", color: "#12332B", textAlign: "right" }}>
                {formatMoney(totalDebits, FUNCTIONAL_CURRENCY)}
              </span>
              <span style={{ fontSize: "12px", color: "#12332B", textAlign: "right" }}>
                {formatMoney(totalCredits, FUNCTIONAL_CURRENCY)}
              </span>
              <span />
            </div>
          )}

          {/* Balance status bar */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid #E5E9F0",
              backgroundColor: isBalanced ? "#F0FDF4" : totalDebits === 0 && totalCredits === 0 ? "#F9FAFB" : "#FFF7ED",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {isBalanced ? (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#15803D" }}>
                Entry is balanced — debits equal credits.
              </span>
            ) : totalDebits === 0 && totalCredits === 0 ? (
              <span style={{ fontSize: "12px", color: "#667085" }}>
                Enter debit and credit amounts to validate balance.
              </span>
            ) : !hasUsableRate && !isPhp ? (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#B45309" }}>
                Enter a positive {transactionCurrency}→{FUNCTIONAL_CURRENCY} rate to balance in PHP.
              </span>
            ) : (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#B45309" }}>
                Out of balance — difference: {formatMoney(difference, FUNCTIONAL_CURRENCY)}
              </span>
            )}
          </div>
        </div>

      </div>
    </SidePanel>
  );
}
