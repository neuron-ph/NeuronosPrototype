import { useState, useEffect } from "react";
import { X, ExternalLink, AlertTriangle, CheckCircle, User, Clock, Loader2, Send, Pencil, Save, History } from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import { logFieldUpdate } from "../../../utils/activityLog";
import type { JournalEntry } from "./GeneralJournal";
import { getSource, isReversalEntry, ReversalBadge, VoidBadge } from "./GeneralJournal";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";
import {
  JournalLineEditor,
  makeEmptyLine,
  computeJournalTotals,
  buildJournalLines,
  findSameSideDuplicate,
  parseAmount,
  type EditableLine,
  type COAAccount,
} from "./JournalLineEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntryDetailPanelProps {
  entry: JournalEntry;
  onClose: () => void;
  onVoid: (entry: JournalEntry) => void;
  onPosted?: () => void;
  canAct: boolean;
  highlightAccountId?: string;
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
  const [sourceRefLabel, setSourceRefLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSourceRefLabel(null);
    if (!src.id || src.type === "manual") return;
    const lookups: Record<string, { table: string; column: string }> = {
      evoucher: { table: "evouchers", column: "evoucher_number" },
      invoice: { table: "invoices", column: "invoice_number" },
      collection: { table: "collections", column: "collection_number" },
      booking: { table: "bookings", column: "booking_number" },
    };
    const cfg = lookups[src.type];
    if (!cfg) return;
    supabase
      .from(cfg.table)
      .select(cfg.column)
      .eq("id", src.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const val = (data as any)?.[cfg.column];
        if (val) setSourceRefLabel(val);
      });
    return () => { cancelled = true; };
  }, [src.id, src.type]);
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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [editLines, setEditLines] = useState<EditableLine[]>([]);
  const [editDate, setEditDate] = useState(entry.entry_date.slice(0, 10));
  const [editDescription, setEditDescription] = useState(entry.description ?? "");
  const needsAssignment = entry.status === "draft" && canAct && !hasLines;
  const canEdit =
    canAct &&
    (entry.status === "posted" || (entry.status === "draft" && hasLines)) &&
    !entry.id.startsWith("JE-VOID-");

  // Reset edit mode when switching to a different entry
  useEffect(() => {
    setIsEditing(false);
  }, [entry.id]);

  // Load CoA accounts when needed (assignment OR editing)
  useEffect(() => {
    if (needsAssignment) {
      setEditLines([makeEmptyLine(), makeEmptyLine()]);
    } else if (!isEditing) {
      setEditLines([]);
    }
    if (needsAssignment || isEditing) {
      if (accounts.length === 0) {
        setLoadingAccounts(true);
        supabase
          .from("accounts")
          .select("id, code, name, type")
          .eq("is_active", true)
          .order("code")
          .then(({ data }) => {
            setAccounts((data ?? []) as COAAccount[]);
            setLoadingAccounts(false);
          });
      }
    }
  }, [entry.id, needsAssignment, isEditing, accounts.length]);

  // Derived editor totals (when assigning)
  const editorTotals = computeJournalTotals(editLines, exchangeRate, entry.total_debit);
  const editorActiveLines = editLines.filter(
    (l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0,
  );
  const editorAllAccountsPicked = editorActiveLines.every((l) => l.account_id);
  const editorHasDup = findSameSideDuplicate(editLines) !== null;
  const editorReady =
    needsAssignment &&
    editorTotals.isBalanced &&
    editorActiveLines.length >= 2 &&
    editorAllAccountsPicked &&
    !editorHasDup;

  // ── Edit helpers ──
  const entryLinesToEditable = (): EditableLine[] =>
    lines.map((l) => {
      const fd = (l as any).foreign_debit ?? 0;
      const fc = (l as any).foreign_credit ?? 0;
      const drVal = fd > 0 ? fd : l.debit;
      const crVal = fc > 0 ? fc : l.credit;
      return {
        id: crypto.randomUUID(),
        account_id: l.account_id,
        description: l.description ?? "",
        debit: drVal > 0 ? String(drVal) : "",
        credit: crVal > 0 ? String(crVal) : "",
      };
    });

  const summarizeLine = (l: any): string => {
    const acct = `${l.account_code ?? "?"} ${l.account_name ?? ""}`.trim();
    const dr = l.debit > 0 ? `DR ${PHP.format(l.debit)}` : "";
    const cr = l.credit > 0 ? `CR ${PHP.format(l.credit)}` : "";
    return [acct, dr, cr, l.description].filter(Boolean).join(" · ");
  };

  const handleStartEdit = () => {
    setEditDate(entry.entry_date.slice(0, 10));
    setEditDescription(entry.description ?? "");
    setEditLines(entryLinesToEditable());
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditLines([]);
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    const editorActive = editLines.filter((l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0);
    if (editorActive.length < 2) { toast.error("Need at least one debit and one credit line"); return; }
    if (editorActive.some((l) => !l.account_id)) { toast.error("Every line must have an account"); return; }
    const dup = findSameSideDuplicate(editLines);
    if (dup) { toast.error(dup); return; }
    const t = computeJournalTotals(editLines, exchangeRate);
    if (!t.isBalanced) { toast.error("Entry is out of balance"); return; }

    setIsSavingEdit(true);
    try {
      const newLines = buildJournalLines({
        lines: editLines,
        accounts,
        transactionCurrency: txnCurrency,
        exchangeRate,
        defaultDescription: editDescription,
      });
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("journal_entries")
        .update({
          entry_date: editDate,
          description: editDescription.trim() || null,
          lines: newLines,
          total_debit: t.totalDebits,
          total_credit: t.totalCredits,
          updated_at: now,
        })
        .eq("id", entry.id);
      if (error) throw error;

      // ── Audit log: one row per changed attribute ──
      const actor = { id: user.id, name: user.name, department: user.department ?? "" };
      const entityName = entry.entry_number;
      const log = (field: string, oldV: string, newV: string) =>
        logFieldUpdate("journal_entry", entry.id, entityName, field, oldV, newV, actor);

      if (editDate !== entry.entry_date.slice(0, 10)) {
        log("Date", entry.entry_date.slice(0, 10), editDate);
      }
      if ((editDescription.trim() || "") !== (entry.description ?? "")) {
        log("Description", entry.description ?? "—", editDescription.trim() || "—");
      }
      // Per-line, per-attribute diff (paired by index)
      const oldLines = lines as any[];
      const maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        const oldL = oldLines[i];
        const newL = newLines[i];
        const lineLabel = `Line ${i + 1}`;
        if (!oldL && newL) {
          log(`${lineLabel} added`, "—", summarizeLine(newL));
        } else if (oldL && !newL) {
          log(`${lineLabel} removed`, summarizeLine(oldL), "—");
        } else if (oldL && newL) {
          if (oldL.account_id !== newL.account_id) {
            const oldAcct = `${oldL.account_code ?? "?"} ${oldL.account_name ?? ""}`.trim();
            const newAcct = `${newL.account_code ?? "?"} ${newL.account_name ?? ""}`.trim();
            log(`${lineLabel} account`, oldAcct, newAcct);
          }
          if (Math.abs((oldL.debit ?? 0) - (newL.debit ?? 0)) > 0.005) {
            log(`${lineLabel} debit`, PHP.format(oldL.debit ?? 0), PHP.format(newL.debit ?? 0));
          }
          if (Math.abs((oldL.credit ?? 0) - (newL.credit ?? 0)) > 0.005) {
            log(`${lineLabel} credit`, PHP.format(oldL.credit ?? 0), PHP.format(newL.credit ?? 0));
          }
          if ((oldL.description ?? "") !== (newL.description ?? "")) {
            log(`${lineLabel} note`, oldL.description ?? "—", newL.description ?? "—");
          }
        }
      }

      toast.success(`${entry.entry_number} updated`);
      setIsEditing(false);
      onPosted?.();
    } catch (err) {
      console.error("[JE edit] save failed:", err);
      toast.error("Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Navigate to source document
  const handleOpenSource = () => {
    if (src.type === "evoucher" && src.id) navigate(`/accounting/evouchers/${src.id}`);
    else if (src.type === "invoice"    && src.id) navigate(`/accounting/invoices`);
    else if (src.type === "collection" && src.id) navigate(`/accounting/collections`);
  };

  // ── Post handler ──
  const handlePost = async () => {
    if (!user) return;

    if (!hasLines) {
      if (editorActiveLines.length < 2) {
        toast.error("Add at least one debit and one credit line");
        return;
      }
      if (!editorAllAccountsPicked) {
        toast.error("Every line must have an account selected");
        return;
      }
      const dup = findSameSideDuplicate(editLines);
      if (dup) { toast.error(dup); return; }
      if (!editorTotals.matchesLockedTotal) {
        toast.error(`Each side must total ${PHP.format(entry.total_debit)}`);
        return;
      }
      if (!editorTotals.isBalanced) {
        toast.error("Entry is out of balance — debits must equal credits");
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

      if (!hasLines) {
        updatePayload.lines = buildJournalLines({
          lines: editLines,
          accounts,
          transactionCurrency: txnCurrency,
          exchangeRate,
          defaultDescription: entry.description ?? "",
          lockedTotal: entry.total_debit,
        });
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

  const canPost = hasLines ? isBalanced : editorReady;

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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {entry.entry_number}
            </span>
            {entry.status === "void" ? <VoidBadge size="md" /> : <StatusChip status={entry.status} />}
            {isReversalEntry(entry) && <ReversalBadge size="md" />}
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
              {src.label} · {sourceRefLabel || (src.ref && !/^(evoucher|invoice|collection|booking)-\d{10,}/i.test(String(src.ref)) ? src.ref : "—")}
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

        {/* Reversal / Void context banner */}
        {!isEditing && isReversalEntry(entry) && entry.reference && (
          <div style={{
            marginBottom: "16px",
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            display: "flex", alignItems: "center", gap: "8px",
            fontSize: "12px", color: "var(--theme-text-primary)",
          }}>
            <span style={{ color: "rgb(167, 139, 250)", fontWeight: 600 }}>↩</span>
            <span>
              Auto-generated reversal of <strong style={{ fontVariantNumeric: "tabular-nums" }}>{entry.reference}</strong>
            </span>
          </div>
        )}
        {!isEditing && entry.status === "void" && (
          <div style={{
            marginBottom: "16px",
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: "var(--theme-status-danger-bg)",
            border: "1px solid var(--theme-status-danger-border)",
            display: "flex", alignItems: "center", gap: "8px",
            fontSize: "12px", color: "var(--theme-status-danger-fg)",
            fontWeight: 500,
          }}>
            <AlertTriangle size={13} />
            <span>This entry was voided — an offsetting reversal has been posted to the ledger.</span>
          </div>
        )}

        {/* Description */}
        {isEditing ? (
          <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                Entry Date
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                style={{
                  height: "32px", padding: "0 8px", fontSize: "12px",
                  border: "1px solid var(--theme-border-default)", borderRadius: "6px",
                  backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                Description
              </label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Entry description"
                style={{
                  width: "100%", height: "32px", padding: "0 8px", fontSize: "12px",
                  border: "1px solid var(--theme-border-default)", borderRadius: "6px",
                  backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        ) : entry.description ? (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
              Description
            </label>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--theme-text-primary)", lineHeight: 1.5 }}>
              {entry.description}
            </p>
          </div>
        ) : null}

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

          {isEditing ? (
            <JournalLineEditor
              lines={editLines}
              onChange={setEditLines}
              accounts={accounts}
              transactionCurrency={txnCurrency}
              exchangeRate={exchangeRate}
              loading={loadingAccounts}
              compact
              hideDescriptionColumn
            />
          ) : hasLines ? (
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
        {needsAssignment && (
          <div style={{ marginTop: "16px" }}>
            <div style={{
              marginBottom: "10px",
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                Assign Accounts
              </span>
              <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>
                Split across multiple accounts if needed
              </span>
            </div>
            <JournalLineEditor
              lines={editLines}
              onChange={setEditLines}
              accounts={accounts}
              transactionCurrency={txnCurrency}
              exchangeRate={exchangeRate}
              lockedTotal={entry.total_debit}
              loading={loadingAccounts}
              compact
              hideDescriptionColumn
            />
          </div>
        )}

        {/* Edit history */}
        {!isEditing && <EditHistory entryId={entry.id} />}

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
      {isEditing && (
        <div style={{
          flexShrink: 0,
          padding: "14px 20px",
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-page)",
          display: "flex", gap: "8px",
        }}>
          <button
            onClick={handleCancelEdit}
            disabled={isSavingEdit}
            style={{
              flex: 1, height: "34px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              border: "1px solid var(--theme-border-default)", borderRadius: "6px",
              backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)",
              fontSize: "12px", fontWeight: 500,
              cursor: isSavingEdit ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={isSavingEdit}
            style={{
              flex: 1, height: "34px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              border: "none", borderRadius: "6px",
              backgroundColor: "var(--theme-action-primary-bg)", color: "#fff",
              fontSize: "12px", fontWeight: 600,
              cursor: isSavingEdit ? "not-allowed" : "pointer",
              opacity: isSavingEdit ? 0.7 : 1,
            }}
          >
            {isSavingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isSavingEdit ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* (footer continued below) */}
      {!isEditing && canAct && entry.status === "posted" && (
        <div style={{
          flexShrink: 0,
          padding: "14px 20px",
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-page)",
          display: "flex", gap: "8px",
        }}>
          {canEdit && (
            <button
              onClick={handleStartEdit}
              style={{
                flex: 1, height: "34px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                border: "1px solid var(--theme-border-default)", borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                fontSize: "12px", fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Pencil size={13} />
              Edit Entry
            </button>
          )}
          <button
            onClick={() => onVoid(entry)}
            className={(canEdit ? "flex-1" : "w-full") + " h-[34px] flex items-center justify-center gap-[6px] border border-[var(--theme-status-danger-border)] rounded-[6px] bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--theme-status-danger-fg)] hover:text-white hover:border-[var(--theme-status-danger-fg)] transition-colors"}
          >
            <AlertTriangle size={13} />
            Void Entry
          </button>
        </div>
      )}

      {!isEditing && canAct && entry.status === "draft" && (
        <div style={{
          flexShrink: 0,
          padding: "14px 20px",
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-page)",
          display: "flex", gap: "8px",
        }}>
          {canEdit && (
            <button
              onClick={handleStartEdit}
              style={{
                height: "40px", padding: "0 16px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                border: "1px solid var(--theme-border-default)", borderRadius: "7px",
                backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)",
                fontSize: "13px", fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Pencil size={13} />
              Edit
            </button>
          )}
          <button
            onClick={handlePost}
            disabled={isPosting || !canPost}
            style={{
              height: "40px", flex: 1,
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

// ─── Edit history ────────────────────────────────────────────────────────────

interface ActivityRow {
  id: string;
  created_at: string;
  user_name: string;
  metadata: { description?: string } | null;
  old_value: string | null;
  new_value: string | null;
}

function EditHistory({ entryId }: { entryId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("activity_log")
      .select("id, created_at, user_name, metadata, old_value, new_value")
      .eq("entity_type", "journal_entry")
      .eq("entity_id", entryId)
      .eq("action_type", "updated")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as ActivityRow[]);
      });
    return () => { cancelled = true; };
  }, [entryId]);

  if (!rows || rows.length === 0) return null;

  // Group rows by created_at (rounded to the minute) — one "edit session" produces multiple rows
  const groups = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const key = `${r.user_name}|${r.created_at.slice(0, 16)}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const sessions = Array.from(groups.entries()).slice(0, expanded ? undefined : 3);

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "none", border: "none", padding: 0,
          fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)",
          textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer",
          marginBottom: "8px",
        }}
      >
        <History size={12} />
        Edit History · {rows.length} change{rows.length === 1 ? "" : "s"}
      </button>
      <div style={{
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        overflow: "hidden",
      }}>
        {sessions.map(([key, sessionRows], idx) => {
          const first = sessionRows[0];
          const when = new Date(first.created_at).toLocaleString("en-PH", {
            month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true,
          });
          return (
            <div key={key} style={{
              padding: "12px 14px",
              borderBottom: idx < sessions.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
              backgroundColor: "var(--theme-bg-surface)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                  {first.user_name}
                </span>
                <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>{when}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {sessionRows.map((r) => {
                  const label = (r.metadata?.description ?? "")
                    .replace(/^Updated\s+/i, "")
                    .trim() || "Field";
                  return (
                    <ChangeRow
                      key={r.id}
                      label={label}
                      oldValue={r.old_value || "—"}
                      newValue={r.new_value || "—"}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {!expanded && groups.size > 3 && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              width: "100%", padding: "8px",
              background: "var(--theme-bg-page)", border: "none",
              borderTop: "1px solid var(--theme-border-subtle)",
              fontSize: "11px", color: "var(--theme-action-primary-bg)", fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Show {groups.size - 3} earlier change{groups.size - 3 === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}

function ChangeRow({ label, oldValue, newValue }: { label: string; oldValue: string; newValue: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <span style={{
        fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em",
        color: "var(--theme-text-muted)", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        fontSize: "12px", lineHeight: 1.4,
        fontVariantNumeric: "tabular-nums",
      }}>
        <span style={{
          textDecoration: "line-through",
          color: "var(--theme-text-muted)",
          opacity: 0.75,
        }}>{oldValue}</span>
        <span style={{ color: "var(--theme-text-muted)", fontSize: "11px" }}>→</span>
        <span style={{
          color: "var(--theme-status-success-fg)",
          fontWeight: 600,
        }}>{newValue}</span>
      </div>
    </div>
  );
}
