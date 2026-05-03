import { useState, useEffect } from "react";
import { X, ExternalLink, AlertTriangle, CheckCircle, User, Clock, Loader2, Send } from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import type { JournalEntry } from "./GeneralJournal";
import { getSource } from "./GeneralJournal";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntryDetailPanelProps {
  entry: JournalEntry;
  onClose: () => void;
  onVoid: (entry: JournalEntry) => void;
  onPosted?: () => void;
  canAct: boolean;
  highlightAccountId?: string;
}

interface COAAccount {
  id: string;
  code: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: JournalEntry["status"] }) {
  const cfg = {
    posted: {
      bg: "var(--theme-status-success-bg)",
      color: "var(--theme-status-success-fg)",
      border: "var(--theme-status-success-border)",
      label: "Posted",
    },
    draft: {
      bg: "var(--theme-status-warning-bg)",
      color: "var(--theme-status-warning-fg)",
      border: "var(--theme-status-warning-border)",
      label: "Draft",
    },
    void: {
      bg: "var(--neuron-pill-inactive-bg)",
      color: "var(--neuron-pill-inactive-text)",
      border: "var(--neuron-pill-inactive-border)",
      label: "Void",
    },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
      letterSpacing: "0.03em", textTransform: "uppercase",
      backgroundColor: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function JournalEntryDetailPanel({
  entry,
  onClose,
  onVoid,
  onPosted,
  canAct,
  highlightAccountId,
}: JournalEntryDetailPanelProps) {
  const navigate = useNavigate();
  const { user } = useUser();
  const src = getSource(entry);
  const isBalanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01;
  const lines = entry.lines ?? [];
  const hasLines = lines.length > 0;

  // FX header. Legacy entries (pre-migration backfill) report PHP/1 here.
  const txnCurrency: AccountingCurrency =
    ((entry as any).transaction_currency as AccountingCurrency) ?? FUNCTIONAL_CURRENCY;
  const exchangeRate = Number((entry as any).exchange_rate ?? 1);
  const isUsdEntry = txnCurrency !== FUNCTIONAL_CURRENCY && exchangeRate > 0 && exchangeRate !== 1;

  // ── Posting state ──
  const [isPosting, setIsPosting] = useState(false);
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [drAccountId, setDrAccountId] = useState("");
  const [crAccountId, setCrAccountId] = useState("");

  // Load CoA accounts when this is a draft that needs account assignment
  useEffect(() => {
    if (entry.status === "draft" && canAct && !hasLines) {
      supabase
        .from("accounts")
        .select("id, code, name")
        .eq("is_active", true)
        .order("code")
        .then(({ data }) => setAccounts((data ?? []) as COAAccount[]));
    }
    // Reset selections when entry changes
    setDrAccountId("");
    setCrAccountId("");
  }, [entry.id, entry.status, canAct, hasLines]);

  // Navigate to source document
  const handleOpenSource = () => {
    if (src.type === "evoucher" && src.id) navigate(`/accounting/evouchers/${src.id}`);
    else if (src.type === "invoice"    && src.id) navigate(`/accounting/invoices`);
    else if (src.type === "collection" && src.id) navigate(`/accounting/collections`);
  };

  // ── Post handler ──
  const handlePost = async () => {
    if (!user) return;

    // For entries without lines, validate account selections
    if (!hasLines) {
      if (!drAccountId || !crAccountId) {
        toast.error("Select both a debit and credit account before posting");
        return;
      }
      if (drAccountId === crAccountId) {
        toast.error("Debit and credit accounts must be different");
        return;
      }
    } else if (!isBalanced) {
      toast.error("Entry is out of balance — cannot post");
      return;
    }

    setIsPosting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        status: "posted",
        updated_at: new Date().toISOString(),
      };

      // If no lines yet, build them from the account picker selections
      if (!hasLines) {
        const drAcct = accounts.find((a) => a.id === drAccountId);
        const crAcct = accounts.find((a) => a.id === crAccountId);
        updatePayload.lines = [
          {
            account_id: drAccountId,
            account_code: drAcct?.code ?? "",
            account_name: drAcct?.name ?? "",
            debit: entry.total_debit,
            credit: 0,
            description: entry.description ?? "",
          },
          {
            account_id: crAccountId,
            account_code: crAcct?.code ?? "",
            account_name: crAcct?.name ?? "",
            debit: 0,
            credit: entry.total_credit,
            description: entry.description ?? "",
          },
        ];
      }

      const { error } = await supabase
        .from("journal_entries")
        .update(updatePayload)
        .eq("id", entry.id);

      if (error) throw error;
      toast.success(`${entry.entry_number} posted to the General Ledger`);
      onPosted?.();
    } catch {
      toast.error("Failed to post journal entry");
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = hasLines
    ? isBalanced
    : (!!drAccountId && !!crAccountId && drAccountId !== crAccountId);

  return (
    <div style={{
      width: "520px",
      flexShrink: 0,
      borderLeft: "1px solid var(--theme-border-default)",
      backgroundColor: "var(--theme-bg-surface)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        padding: "16px 20px",
        borderBottom: "1px solid var(--theme-border-default)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "12px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {entry.entry_number}
            </span>
            <StatusChip status={entry.status} />
          </div>
          <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
            {new Date(entry.entry_date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-PH", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            })}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center border border-[var(--theme-border-default)] rounded-[6px] text-[var(--theme-text-muted)] hover:bg-[var(--theme-state-hover)] transition-colors cursor-pointer flex-shrink-0"
          style={{ width: "28px", height: "28px" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column" }}>

        {/* Source */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
            Source
          </label>
          {src.type !== "manual" && src.id ? (
            <button
              onClick={handleOpenSource}
              className="bg-[var(--theme-bg-page)] hover:bg-[var(--theme-state-hover)] transition-colors"
              style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                padding: "4px 8px", borderRadius: "5px",
                border: "1px solid var(--theme-border-default)",
                color: "var(--theme-action-primary-bg)", fontSize: "12px", fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {src.label} · {src.ref}
              <ExternalLink size={12} />
            </button>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Manual Entry</span>
          )}
        </div>

        {/* Currency / FX header */}
        {isUsdEntry && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
              Transaction Currency
            </label>
            <span style={{ fontSize: "12px", color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {txnCurrency} @ {exchangeRate} = {FUNCTIONAL_CURRENCY}
              {(entry as any).exchange_rate_date ? ` (rate date ${(entry as any).exchange_rate_date})` : ""}
            </span>
          </div>
        )}

        {/* Description */}
        {entry.description && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
              Description
            </label>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--theme-text-primary)", lineHeight: 1.5 }}>
              {entry.description}
            </p>
          </div>
        )}

        {/* Reference */}
        {entry.reference && entry.reference !== entry.evoucher_id && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
              Reference
            </label>
            <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", fontVariantNumeric: "tabular-nums" }}>{entry.reference}</span>
          </div>
        )}

        <div style={{ height: "1px", backgroundColor: "var(--theme-border-default)", margin: "4px 0 16px" }} />

        {/* Journal lines table */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
            Journal Lines
          </label>

          {hasLines ? (
            <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-page)" }}>
                    <th style={{ padding: "7px 10px", fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "left" }}>Account</th>
                    <th style={{ padding: "7px 10px", fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right" }}>DR</th>
                    <th style={{ padding: "7px 10px", fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right" }}>CR</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const isHighlighted = highlightAccountId && line.account_id === highlightAccountId;
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--theme-border-subtle)",
                          backgroundColor: isHighlighted ? "var(--theme-status-success-bg)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontSize: "12px", fontWeight: isHighlighted ? 600 : 500, color: "var(--theme-text-primary)" }}>
                            {line.account_code} — {line.account_name}
                          </div>
                          {line.description && (
                            <div style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginTop: "1px" }}>
                              {line.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: "12px", color: line.debit > 0 ? "var(--theme-text-primary)" : "var(--neuron-ui-muted)", fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {line.debit > 0 ? PHP.format(line.debit) : "—"}
                          {isUsdEntry && (line as any).foreign_debit > 0 && (
                            <div style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>
                              {formatMoney((line as any).foreign_debit, (line as any).currency ?? txnCurrency)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: "12px", color: line.credit > 0 ? "var(--theme-text-primary)" : "var(--neuron-ui-muted)", fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {line.credit > 0 ? PHP.format(line.credit) : "—"}
                          {isUsdEntry && (line as any).foreign_credit > 0 && (
                            <div style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>
                              {formatMoney((line as any).foreign_credit, (line as any).currency ?? txnCurrency)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-page)" }}>
                    <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)" }}>Totals</td>
                    <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {PHP.format(entry.total_debit)}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {PHP.format(entry.total_credit)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Balance indicator */}
              <div style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "7px 10px",
                borderTop: "1px solid " + (isBalanced ? "var(--theme-status-success-border)" : "var(--theme-status-warning-border)"),
                backgroundColor: isBalanced ? "var(--theme-status-success-bg)" : "var(--theme-status-warning-bg)",
              }}>
                {isBalanced ? (
                  <>
                    <CheckCircle size={12} style={{ color: "var(--theme-status-success-fg)" }} />
                    <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--theme-status-success-fg)" }}>Entry is balanced</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} style={{ color: "var(--theme-status-warning-fg)" }} />
                    <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--theme-status-warning-fg)" }}>
                      Out of balance — {PHP.format(Math.abs(entry.total_debit - entry.total_credit))} difference
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* No lines yet — show amount + unassigned state */
            <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{
                padding: "12px 14px",
                backgroundColor: "var(--theme-bg-page)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Amount</span>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {PHP.format(entry.total_debit)}
                </span>
              </div>
              <div style={{
                padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px",
                borderTop: "1px solid var(--theme-status-warning-border)",
                backgroundColor: "var(--theme-status-warning-bg)",
              }}>
                <AlertTriangle size={13} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--theme-status-warning-fg)", fontWeight: 500 }}>
                  No journal lines — assign accounts below to post
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Assign Accounts (draft + no lines) ── */}
        {entry.status === "draft" && canAct && !hasLines && (
          <div style={{ marginTop: "16px" }}>
            <div style={{
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              overflow: "hidden",
            }}>

              {/* Header */}
              <div style={{
                padding: "11px 14px",
                backgroundColor: "var(--theme-bg-page)",
                borderBottom: "1px solid var(--theme-border-default)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  Assign Accounts
                </span>
                <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>Both required to post</span>
              </div>

              {/* Debit row */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--theme-border-subtle)" }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: "7px",
                }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em",
                    color: "var(--theme-text-muted)", textTransform: "uppercase",
                  }}>Debit (DR)</span>
                  <span style={{
                    fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{PHP.format(entry.total_debit)}</span>
                </div>
                <select
                  value={drAccountId}
                  onChange={(e) => setDrAccountId(e.target.value)}
                  style={{
                    width: "100%", height: "34px", padding: "0 8px",
                    border: "1px solid " + (drAccountId ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"),
                    borderRadius: "6px", fontSize: "12px",
                    color: drAccountId ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                    backgroundColor: "var(--theme-bg-surface)",
                    outline: "none", cursor: "pointer",
                  }}
                >
                  <option value="">Select debit account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Credit row */}
              <div style={{ padding: "12px 14px" }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: "7px",
                }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em",
                    color: "var(--theme-text-muted)", textTransform: "uppercase",
                  }}>Credit (CR)</span>
                  <span style={{
                    fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{PHP.format(entry.total_credit)}</span>
                </div>
                <select
                  value={crAccountId}
                  onChange={(e) => setCrAccountId(e.target.value)}
                  style={{
                    width: "100%", height: "34px", padding: "0 8px",
                    border: "1px solid " + (crAccountId ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"),
                    borderRadius: "6px", fontSize: "12px",
                    color: crAccountId ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                    backgroundColor: "var(--theme-bg-surface)",
                    outline: "none", cursor: "pointer",
                  }}
                >
                  <option value="">Select credit account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>
        )}

        {/* Metadata */}
        <div style={{ marginTop: "auto", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {(entry.created_by_name ?? entry.created_by) && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <User size={12} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                Created by <strong style={{ color: "var(--theme-text-primary)" }}>{entry.created_by_name ?? entry.created_by}</strong>
              </span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={12} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
              {formatDateTime(entry.created_at)}
            </span>
          </div>
        </div>

      </div>

      {/* ── Footer actions ── */}
      {canAct && entry.status === "posted" && (
        <div style={{
          flexShrink: 0,
          padding: "14px 20px",
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-page)",
        }}>
          <button
            onClick={() => onVoid(entry)}
            className="w-full h-[34px] flex items-center justify-center gap-[6px] border border-[var(--theme-status-danger-border)] rounded-[6px] bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--theme-status-danger-fg)] hover:text-white hover:border-[var(--theme-status-danger-fg)] transition-colors"
          >
            <AlertTriangle size={13} />
            Void Entry
          </button>
        </div>
      )}

      {canAct && entry.status === "draft" && (
        <div style={{
          flexShrink: 0,
          padding: "14px 20px",
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-page)",
        }}>
          <button
            onClick={handlePost}
            disabled={isPosting || !canPost}
            style={{
              height: "40px", width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              borderRadius: "7px", fontSize: "13px", fontWeight: 600,
              cursor: isPosting || !canPost ? "not-allowed" : "pointer",
              border: "none",
              backgroundColor: canPost && !isPosting ? "var(--theme-action-primary-bg)" : "var(--theme-state-hover)",
              color: canPost && !isPosting ? "#fff" : "var(--theme-text-muted)",
              transition: "background-color 120ms ease",
            }}
          >
            {isPosting ? (
              <><Loader2 size={14} className="animate-spin" /> Posting…</>
            ) : (
              <><Send size={14} /> Post to General Ledger</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
