import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Plus, Trash2, BookOpen, Loader2, ChevronDown,
  CheckCircle, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { logCreation } from "../../../utils/activityLog";
import { toast } from "sonner@2.0.3";

// ─── Types ────────────────────────────────────────────────────────────────────

interface COAAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LineItem {
  id: string;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
}

export interface NewJournalEntryScreenProps {
  onBack: () => void;
  onCreated?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLine(): LineItem {
  return { id: crypto.randomUUID(), account_id: "", description: "", debit: "", credit: "" };
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// ─── AccountSelect ────────────────────────────────────────────────────────────

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
          height: "36px",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          padding: "0 28px 0 10px",
          fontSize: "13px",
          color: value ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
          backgroundColor: "var(--theme-bg-surface)",
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
        size={13}
        style={{
          position: "absolute", right: "8px", top: "50%",
          transform: "translateY(-50%)",
          color: "var(--theme-text-muted)", pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NewJournalEntryScreen({ onBack, onCreated }: NewJournalEntryScreenProps) {
  const { user } = useUser();

  const [entryDate, setEntryDate] = useState<string>(today());
  const [memo, setMemo] = useState<string>("");
  const [lines, setLines] = useState<LineItem[]>([makeLine(), makeLine()]);

  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingAccounts(true);
    supabase
      .from("accounts")
      .select("id, code, name, type")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Failed to load chart of accounts");
        else setAccounts((data ?? []) as COAAccount[]);
        setLoadingAccounts(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ─── Totals ──────────────────────────────────────────────────────────────

  const totalDebits  = lines.reduce((s, l) => s + parseAmount(l.debit),  0);
  const totalCredits = lines.reduce((s, l) => s + parseAmount(l.credit), 0);
  const runningBalance = totalDebits - totalCredits; // positive = debits ahead
  const difference = Math.abs(runningBalance);
  const isBalanced = totalDebits > 0 && totalCredits > 0 && difference < 0.005;

  // ─── Enforcement logic ────────────────────────────────────────────────────
  //
  // A line's debit field is disabled when:
  //   (a) the line already has a credit amount — mutual exclusion
  //   (b) the line has no debit yet AND debits are ahead of credits
  //       → you must add credits to catch up before entering another debit
  //
  // Existing debit amounts are always editable (allows correction).
  // Credit fields are never disabled by the balance rule.

  const isDebitDisabled = (line: LineItem): boolean => {
    if (parseAmount(line.credit) > 0)  return true; // already a credit line
    if (parseAmount(line.debit) === 0 && runningBalance > 0.005) return true;
    return false;
  };

  const isCreditDisabled = (line: LineItem): boolean => {
    return parseAmount(line.debit) > 0; // already a debit line
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  const updateLine = useCallback(
    (id: string, patch: Partial<Omit<LineItem, "id">>) => {
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    []
  );

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, makeLine()]);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.id !== id)));
  }, []);

  // ─── Submit ───────────────────────────────────────────────────────────────

  const buildLines = () =>
    lines
      .filter((l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0)
      .map((l) => {
        const acct = accounts.find((a) => a.id === l.account_id);
        return {
          account_id:   l.account_id,
          account_code: acct?.code ?? "",
          account_name: acct?.name ?? "",
          debit:        parseAmount(l.debit),
          credit:       parseAmount(l.credit),
          description:  l.description.trim() || memo.trim() || "",
        };
      });

  const validate = () => {
    if (!user?.id)    { toast.error("Cannot determine current user"); return false; }
    if (!isBalanced)  { toast.error("Entry is out of balance"); return false; }
    const active = lines.filter((l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0);
    if (active.some((l) => !l.account_id)) {
      toast.error("All non-zero lines must have an account selected");
      return false;
    }
    return true;
  };

  const persist = async (status: "draft" | "posted") => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const id = `JE-MAN-${Date.now()}`;
      const { error } = await supabase.from("journal_entries").insert({
        id, entry_number: id, entry_date: entryDate,
        description: memo.trim() || null,
        lines: buildLines(),
        total_debit: totalDebits, total_credit: totalCredits,
        status, created_by: user!.id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      logCreation("journal_entry", id, memo.trim() || id, {
        id: user!.id, name: user!.name, department: user!.department ?? "",
      });
      toast.success(
        status === "posted"
          ? "Journal entry posted to the general ledger"
          : "Draft saved — entry not yet posted to the ledger"
      );
      onCreated?.();
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSubmitting(false);
      setConfirmPost(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-12 pt-8 pb-6 border-b border-[var(--theme-border-default)]">
        <div className="flex items-start justify-between">

          <div className="flex items-start gap-4">
            <button
              onClick={onBack}
              className="mt-1 h-8 w-8 flex items-center justify-center rounded-lg border border-[var(--theme-border-default)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-state-hover)] transition-colors flex-shrink-0"
            >
              <ArrowLeft size={15} />
            </button>
            <div>
              <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
                New Journal Entry
              </h1>
              <p className="text-[14px] text-[var(--theme-text-muted)]">
                Manual double-entry — debits must equal credits before posting
              </p>
            </div>
          </div>

          {(totalDebits > 0 || totalCredits > 0) && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium mt-1 ${
              isBalanced
                ? "bg-[var(--theme-status-success-bg)] border-[var(--theme-status-success-border)] text-[var(--theme-status-success-fg)]"
                : "bg-[var(--theme-status-warning-bg)] border-[var(--theme-status-warning-border)] text-[var(--theme-status-warning-fg)]"
            }`}>
              {isBalanced
                ? <><CheckCircle size={14} /> Balanced</>
                : <><AlertTriangle size={14} /> {PHP.format(difference)} out of balance</>
              }
            </div>
          )}
        </div>

        {/* Date + Memo */}
        <div className="flex gap-6 mt-6 ml-12">
          <div className="flex flex-col gap-1.5" style={{ minWidth: "180px" }}>
            <label className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
              Entry Date
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="h-10 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)]"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
              Description / Memo
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Period-end accrual adjustment"
              className="h-10 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-surface)] placeholder:text-[var(--theme-text-muted)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)]"
            />
          </div>
        </div>
      </div>

      {/* ── Line items ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-12 py-8 bg-[var(--theme-bg-page)]">
        <div>

          {/* Table */}
          <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>

            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 3fr 124px 124px 36px",
              gap: "8px",
              padding: "8px 12px",
              backgroundColor: "var(--theme-bg-surface)",
              borderBottom: "1px solid var(--theme-border-default)",
            }}>
              {["Account", "Description", "Debit (DR)", "Credit (CR)", ""].map((h, i) => (
                <span key={i} style={{
                  fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                  textAlign: i >= 2 && i <= 3 ? "right" : "left",
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {loadingAccounts ? (
              <div className="flex items-center justify-center gap-2 py-8 bg-[var(--theme-bg-surface)]">
                <Loader2 size={18} className="animate-spin text-[var(--theme-text-muted)]" />
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Loading accounts…</span>
              </div>
            ) : (
              lines.map((line, idx) => {
                const debitDisabled  = isDebitDisabled(line);
                const creditDisabled = isCreditDisabled(line);

                return (
                  <div
                    key={line.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 3fr 124px 124px 36px",
                      gap: "8px",
                      padding: "8px 12px",
                      backgroundColor: "var(--theme-bg-surface)",
                      borderBottom: idx < lines.length - 1
                        ? "1px solid var(--theme-border-subtle)"
                        : "none",
                      alignItems: "center",
                    }}
                  >
                    {/* Account */}
                    <AccountSelect
                      accounts={accounts}
                      value={line.account_id}
                      onChange={(id) => updateLine(line.id, { account_id: id })}
                    />

                    {/* Description */}
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      placeholder="Optional note"
                      style={{
                        height: "36px",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        padding: "0 10px",
                        fontSize: "13px",
                        color: "var(--theme-text-primary)",
                        backgroundColor: "var(--theme-bg-surface)",
                        outline: "none",
                        width: "100%",
                      }}
                    />

                    {/* Debit */}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      disabled={debitDisabled}
                      onChange={(e) =>
                        updateLine(line.id, {
                          debit: e.target.value,
                          credit: e.target.value ? "" : line.credit,
                        })
                      }
                      placeholder="0.00"
                      style={{
                        height: "36px",
                        border: `1px solid ${debitDisabled ? "var(--theme-border-subtle)" : "var(--theme-border-default)"}`,
                        borderRadius: "6px",
                        padding: "0 10px",
                        fontSize: "13px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: debitDisabled ? "var(--theme-text-muted)" : "var(--theme-text-primary)",
                        backgroundColor: line.debit
                          ? "var(--theme-state-selected)"
                          : debitDisabled
                          ? "var(--theme-bg-page)"
                          : "var(--theme-bg-surface)",
                        outline: "none",
                        width: "100%",
                        cursor: debitDisabled ? "not-allowed" : "text",
                        opacity: debitDisabled && !line.debit ? 0.45 : 1,
                        transition: "background-color 150ms, opacity 150ms",
                      }}
                    />

                    {/* Credit */}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      disabled={creditDisabled}
                      onChange={(e) =>
                        updateLine(line.id, {
                          credit: e.target.value,
                          debit: e.target.value ? "" : line.debit,
                        })
                      }
                      placeholder="0.00"
                      style={{
                        height: "36px",
                        border: `1px solid ${creditDisabled ? "var(--theme-border-subtle)" : "var(--theme-border-default)"}`,
                        borderRadius: "6px",
                        padding: "0 10px",
                        fontSize: "13px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: creditDisabled ? "var(--theme-text-muted)" : "var(--theme-text-primary)",
                        backgroundColor: line.credit
                          ? "var(--theme-status-success-bg)"
                          : creditDisabled
                          ? "var(--theme-bg-page)"
                          : "var(--theme-bg-surface)",
                        outline: "none",
                        width: "100%",
                        cursor: creditDisabled ? "not-allowed" : "text",
                        opacity: creditDisabled ? 0.45 : 1,
                        transition: "background-color 150ms, opacity 150ms",
                      }}
                    />

                    {/* Remove */}
                    <button
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 2}
                      className="w-8 h-8 flex items-center justify-center rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-[var(--theme-text-muted)] disabled:hover:bg-transparent"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            )}

            {/* Add line */}
            <div style={{
              padding: "8px 12px",
              backgroundColor: "var(--theme-bg-page)",
              borderTop: "1px solid var(--theme-border-default)",
            }}>
              <button
                onClick={addLine}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "none", border: "none", padding: "4px 0",
                  fontSize: "13px", fontWeight: 500,
                  color: "var(--theme-action-primary-bg)",
                  cursor: "pointer",
                }}
              >
                <Plus size={14} />
                Add Line
              </button>
            </div>
          </div>

          {/* Totals + balance */}
          <div style={{
            marginTop: "12px",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            overflow: "hidden",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 3fr 124px 124px 36px",
              gap: "8px",
              padding: "10px 12px",
              backgroundColor: "var(--theme-bg-surface)",
              borderBottom: "1px solid var(--theme-border-default)",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Totals
              </span>
              <span />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {PHP.format(totalDebits)}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {PHP.format(totalCredits)}
              </span>
              <span />
            </div>

            <div style={{
              padding: "10px 14px",
              display: "flex", alignItems: "center", gap: "8px",
              backgroundColor: isBalanced
                ? "var(--theme-status-success-bg)"
                : totalDebits === 0 && totalCredits === 0
                ? "var(--theme-bg-page)"
                : "var(--theme-status-warning-bg)",
            }}>
              {isBalanced ? (
                <>
                  <CheckCircle size={14} style={{ color: "var(--theme-status-success-fg)", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--theme-status-success-fg)" }}>
                    Entry is balanced — debits equal credits ({PHP.format(totalDebits)})
                  </span>
                </>
              ) : totalDebits === 0 && totalCredits === 0 ? (
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                  Enter debit and credit amounts to validate balance.
                </span>
              ) : (
                <>
                  <AlertTriangle size={14} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--theme-status-warning-fg)" }}>
                    Out of balance — difference: {PHP.format(difference)}
                  </span>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: "1px solid var(--theme-border-default)",
        backgroundColor: "var(--theme-bg-surface)",
      }}>
        {/* Post confirmation banner */}
        {confirmPost && (
          <div style={{
            padding: "14px 48px",
            backgroundColor: "var(--theme-status-success-bg)",
            borderBottom: "1px solid var(--theme-status-success-border)",
          }}>
            <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 500, color: "var(--theme-status-success-fg)", lineHeight: 1.5 }}>
              Post to General Ledger? This entry is balanced ({PHP.format(totalDebits)}).{" "}
              Once posted, it is <strong>permanent and cannot be edited or deleted</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPost(false)}
                disabled={submitting}
                className="h-9 px-5 border border-[var(--theme-border-default)] rounded-lg bg-[var(--theme-bg-surface)] text-[var(--theme-text-muted)] text-[13px] font-medium hover:bg-[var(--theme-state-hover)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => persist("posted")}
                disabled={submitting}
                className="h-9 px-6 bg-[var(--theme-action-primary-bg)] text-white rounded-lg text-[13px] font-semibold hover:bg-[var(--theme-action-primary-border)] transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {submitting ? "Posting…" : "Confirm & Post"}
              </button>
            </div>
          </div>
        )}

        {!confirmPost && (
          <div className="flex items-center justify-between px-12 py-4">
            <button
              onClick={onBack}
              className="h-10 px-4 text-[var(--theme-text-muted)] text-[14px] font-medium hover:text-[var(--theme-text-primary)] transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => persist("draft")}
                disabled={!isBalanced || submitting}
                className="h-10 px-5 border border-[var(--theme-border-default)] rounded-lg bg-[var(--theme-bg-surface)] text-[var(--theme-text-secondary)] text-[14px] font-medium hover:bg-[var(--theme-state-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save as Draft
              </button>
              <button
                onClick={() => { if (isBalanced) setConfirmPost(true); }}
                disabled={!isBalanced || submitting}
                className="h-10 px-6 bg-[var(--theme-action-primary-bg)] text-white rounded-lg text-[14px] font-semibold hover:bg-[var(--theme-action-primary-border)] transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <BookOpen size={15} />
                Post Entry
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
