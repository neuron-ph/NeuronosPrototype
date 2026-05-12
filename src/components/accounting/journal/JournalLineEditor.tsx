import { useCallback } from "react";
import { Plus, Trash2, ChevronDown, Loader2 } from "lucide-react";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  roundMoney,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditableLine {
  id: string;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
}

export interface COAAccount {
  id: string;
  code: string;
  name: string;
  type?: string;
}

export interface JsonbJournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  foreign_debit: number;
  foreign_credit: number;
  currency: AccountingCurrency;
  exchange_rate: number;
  base_currency: AccountingCurrency;
  description: string;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function makeEmptyLine(): EditableLine {
  return { id: crypto.randomUUID(), account_id: "", description: "", debit: "", credit: "" };
}

export function parseAmount(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

export interface JournalTotals {
  foreignTotalDebits: number;
  foreignTotalCredits: number;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  hasUsableRate: boolean;
  isBalanced: boolean;
  /** Only meaningful when lockedTotal is provided. */
  matchesLockedTotal: boolean;
}

export function computeJournalTotals(
  lines: EditableLine[],
  lockedRate: number,
  lockedTotal?: number,
): JournalTotals {
  const hasUsableRate = Number.isFinite(lockedRate) && lockedRate > 0;
  const foreignTotalDebits = lines.reduce((s, l) => s + parseAmount(l.debit), 0);
  const foreignTotalCredits = lines.reduce((s, l) => s + parseAmount(l.credit), 0);
  const totalDebits = hasUsableRate ? roundMoney(foreignTotalDebits * lockedRate) : 0;
  const totalCredits = hasUsableRate ? roundMoney(foreignTotalCredits * lockedRate) : 0;
  const difference = Math.abs(totalDebits - totalCredits);
  const drCrBalanced = hasUsableRate && totalDebits > 0 && totalCredits > 0 && difference < 0.005;
  const matchesLockedTotal =
    typeof lockedTotal === "number"
      ? Math.abs(totalDebits - lockedTotal) < 0.005
      : true;
  return {
    foreignTotalDebits,
    foreignTotalCredits,
    totalDebits,
    totalCredits,
    difference,
    hasUsableRate,
    isBalanced: drCrBalanced && matchesLockedTotal,
    matchesLockedTotal,
  };
}

/**
 * Build JSONB journal lines for insertion. Skips empty rows.
 * If `lockedTotal` is provided, applies plug-to-last so sum(DR) === sum(CR) === lockedTotal
 * exactly (absorbs PHP rounding drift into the last non-zero line on each side).
 */
export function buildJournalLines(opts: {
  lines: EditableLine[];
  accounts: COAAccount[];
  transactionCurrency: AccountingCurrency;
  exchangeRate: number;
  defaultDescription?: string;
  lockedTotal?: number;
}): JsonbJournalLine[] {
  const { lines, accounts, transactionCurrency, exchangeRate, defaultDescription, lockedTotal } = opts;
  const active = lines.filter(
    (l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0,
  );

  const built: JsonbJournalLine[] = active.map((l) => {
    const acct = accounts.find((a) => a.id === l.account_id);
    const foreignDebit = parseAmount(l.debit);
    const foreignCredit = parseAmount(l.credit);
    return {
      account_id: l.account_id,
      account_code: acct?.code ?? "",
      account_name: acct?.name ?? "",
      debit: roundMoney(foreignDebit * exchangeRate),
      credit: roundMoney(foreignCredit * exchangeRate),
      foreign_debit: foreignDebit,
      foreign_credit: foreignCredit,
      currency: transactionCurrency,
      exchange_rate: exchangeRate,
      base_currency: FUNCTIONAL_CURRENCY,
      description: (l.description.trim() || defaultDescription || "").trim(),
    };
  });

  if (typeof lockedTotal === "number") {
    const drIndices = built.map((l, i) => (l.debit > 0 ? i : -1)).filter((i) => i >= 0);
    const crIndices = built.map((l, i) => (l.credit > 0 ? i : -1)).filter((i) => i >= 0);
    if (drIndices.length > 0) {
      const sumDr = built.reduce((s, l) => s + l.debit, 0);
      const plug = roundMoney(lockedTotal - sumDr);
      if (plug !== 0) {
        const last = drIndices[drIndices.length - 1];
        built[last] = { ...built[last], debit: roundMoney(built[last].debit + plug) };
      }
    }
    if (crIndices.length > 0) {
      const sumCr = built.reduce((s, l) => s + l.credit, 0);
      const plug = roundMoney(lockedTotal - sumCr);
      if (plug !== 0) {
        const last = crIndices[crIndices.length - 1];
        built[last] = { ...built[last], credit: roundMoney(built[last].credit + plug) };
      }
    }
  }

  return built;
}

/**
 * Detect duplicate account on the same side (DR or CR). Returns the first dup
 * description, or null when clean.
 */
export function findSameSideDuplicate(lines: EditableLine[]): string | null {
  const drSeen = new Set<string>();
  const crSeen = new Set<string>();
  for (const l of lines) {
    if (!l.account_id) continue;
    if (parseAmount(l.debit) > 0) {
      if (drSeen.has(l.account_id)) return "Same account appears twice on the debit side";
      drSeen.add(l.account_id);
    }
    if (parseAmount(l.credit) > 0) {
      if (crSeen.has(l.account_id)) return "Same account appears twice on the credit side";
      crSeen.add(l.account_id);
    }
  }
  return null;
}

// ─── Account select ──────────────────────────────────────────────────────────

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
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          padding: "0 24px 0 8px",
          fontSize: "12px",
          color: value ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
          backgroundColor: "var(--theme-bg-surface)",
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
        size={12}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--theme-text-muted)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export interface JournalLineEditorProps {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  accounts: COAAccount[];
  transactionCurrency: AccountingCurrency;
  /** PHP-per-foreign-unit. 1 for PHP entries. NaN/0 disables totals. */
  exchangeRate: number;
  /** When set, sum(DR) and sum(CR) in PHP must equal this. Used for source-locked entries. */
  lockedTotal?: number;
  minLines?: number;
  loading?: boolean;
  /** Compact layout (narrow side panels). Reduces column widths. */
  compact?: boolean;
  /** Hide the description column (compact contexts). */
  hideDescriptionColumn?: boolean;
}

export function JournalLineEditor({
  lines,
  onChange,
  accounts,
  transactionCurrency,
  exchangeRate,
  lockedTotal,
  minLines = 2,
  loading = false,
  compact = false,
  hideDescriptionColumn = false,
}: JournalLineEditorProps) {
  const isPhp = transactionCurrency === FUNCTIONAL_CURRENCY;
  const totals = computeJournalTotals(lines, exchangeRate, lockedTotal);
  const { foreignTotalDebits, foreignTotalCredits, totalDebits, totalCredits, difference, hasUsableRate, isBalanced, matchesLockedTotal } = totals;

  const gridTemplate = hideDescriptionColumn
    ? compact
      ? "1fr 100px 100px 28px"
      : "1fr 120px 120px 32px"
    : compact
      ? "1fr 140px 100px 100px 28px"
      : "1fr 180px 110px 110px 32px";

  const updateLine = useCallback(
    (id: string, patch: Partial<Omit<EditableLine, "id">>) => {
      onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    [lines, onChange],
  );

  const addLine = useCallback(() => {
    onChange([...lines, makeEmptyLine()]);
  }, [lines, onChange]);

  const removeLine = useCallback(
    (id: string) => {
      if (lines.length <= minLines) return;
      onChange(lines.filter((l) => l.id !== id));
    },
    [lines, minLines, onChange],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Locked-total banner */}
      {typeof lockedTotal === "number" && (
        <div
          style={{
            padding: "8px 10px",
            backgroundColor: matchesLockedTotal ? "var(--theme-status-success-bg)" : "var(--theme-status-warning-bg)",
            border: "1px solid " + (matchesLockedTotal ? "var(--theme-status-success-border)" : "var(--theme-status-warning-border)"),
            borderRadius: "6px 6px 0 0",
            borderBottom: "none",
            fontSize: "11px",
            color: matchesLockedTotal ? "var(--theme-status-success-fg)" : "var(--theme-status-warning-fg)",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            {matchesLockedTotal
              ? "Allocation matches source amount"
              : `Allocate exactly ${formatMoney(lockedTotal, FUNCTIONAL_CURRENCY)} on each side`}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(totalDebits, FUNCTIONAL_CURRENCY)} / {formatMoney(lockedTotal, FUNCTIONAL_CURRENCY)}
          </span>
        </div>
      )}

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          gap: "8px",
          padding: "8px 10px",
          backgroundColor: "var(--theme-bg-page)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: typeof lockedTotal === "number" ? 0 : "6px 6px 0 0",
          borderBottom: "none",
        }}
      >
        <span style={hdrStyle}>Account</span>
        {!hideDescriptionColumn && <span style={hdrStyle}>Description</span>}
        <span style={{ ...hdrStyle, textAlign: "right" }}>Debit ({transactionCurrency})</span>
        <span style={{ ...hdrStyle, textAlign: "right" }}>Credit ({transactionCurrency})</span>
        <span />
      </div>

      {/* Rows or loading */}
      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "28px",
            border: "1px solid var(--theme-border-default)",
            borderTop: "none",
          }}
        >
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }} />
          <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--theme-text-muted)" }}>Loading accounts…</span>
        </div>
      ) : (
        <>
          {lines.map((line) => (
            <div
              key={line.id}
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                gap: "8px",
                padding: "8px 10px",
                border: "1px solid var(--theme-border-default)",
                borderTop: "none",
                backgroundColor: "var(--theme-bg-surface)",
                alignItems: "center",
              }}
            >
              <AccountSelect
                accounts={accounts}
                value={line.account_id}
                onChange={(id) => updateLine(line.id, { account_id: id })}
              />
              {!hideDescriptionColumn && (
                <input
                  type="text"
                  value={line.description}
                  onChange={(e) => updateLine(line.id, { description: e.target.value })}
                  placeholder="Optional note"
                  style={textInputStyle}
                />
              )}
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.debit}
                onChange={(e) =>
                  updateLine(line.id, {
                    debit: e.target.value,
                    credit: e.target.value ? "" : line.credit,
                  })
                }
                placeholder="0.00"
                style={{ ...amountInputStyle, backgroundColor: line.debit ? "var(--theme-state-hover)" : "var(--theme-bg-surface)" }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.credit}
                onChange={(e) =>
                  updateLine(line.id, {
                    credit: e.target.value,
                    debit: e.target.value ? "" : line.debit,
                  })
                }
                placeholder="0.00"
                style={{ ...amountInputStyle, backgroundColor: line.credit ? "var(--theme-state-hover)" : "var(--theme-bg-surface)" }}
              />
              <button
                onClick={() => removeLine(line.id)}
                disabled={lines.length <= minLines}
                title={lines.length <= minLines ? `Minimum ${minLines} lines required` : "Remove line"}
                style={{
                  width: "26px",
                  height: "26px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  borderRadius: "4px",
                  cursor: lines.length <= minLines ? "not-allowed" : "pointer",
                  color: lines.length <= minLines ? "var(--theme-border-default)" : "var(--theme-text-muted)",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div
            style={{
              border: "1px solid var(--theme-border-default)",
              borderTop: "none",
              borderRadius: "0 0 6px 6px",
              padding: "6px 10px",
              backgroundColor: "var(--theme-bg-page)",
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
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Add Line
            </button>
          </div>
        </>
      )}

      {/* Totals + balance bar */}
      <div
        style={{
          marginTop: "10px",
          borderRadius: "8px",
          border: "1px solid var(--theme-border-default)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: hideDescriptionColumn
              ? "1fr 100px 100px 28px"
              : compact
                ? "1fr 100px 100px 28px"
                : "1fr 110px 110px 40px",
            gap: "8px",
            padding: "10px",
            backgroundColor: "var(--theme-bg-page)",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Totals ({transactionCurrency})
          </span>
          <span style={totalCellStyle}>{formatMoney(foreignTotalDebits, transactionCurrency)}</span>
          <span style={totalCellStyle}>{formatMoney(foreignTotalCredits, transactionCurrency)}</span>
          <span />
        </div>
        {!isPhp && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: hideDescriptionColumn
                ? "1fr 100px 100px 28px"
                : compact
                  ? "1fr 100px 100px 28px"
                  : "1fr 110px 110px 40px",
              gap: "8px",
              padding: "8px 10px",
              backgroundColor: "var(--theme-bg-surface)",
              borderTop: "1px solid var(--theme-border-default)",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "10px", color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Posted in PHP @ {hasUsableRate ? exchangeRate : "—"}
            </span>
            <span style={{ fontSize: "11px", color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatMoney(totalDebits, FUNCTIONAL_CURRENCY)}
            </span>
            <span style={{ fontSize: "11px", color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatMoney(totalCredits, FUNCTIONAL_CURRENCY)}
            </span>
            <span />
          </div>
        )}
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--theme-border-default)",
            backgroundColor: isBalanced
              ? "var(--theme-status-success-bg)"
              : totalDebits === 0 && totalCredits === 0
                ? "var(--theme-bg-page)"
                : "var(--theme-status-warning-bg)",
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          {isBalanced ? (
            <span style={{ color: "var(--theme-status-success-fg)" }}>Entry is balanced — debits equal credits.</span>
          ) : totalDebits === 0 && totalCredits === 0 ? (
            <span style={{ color: "var(--theme-text-muted)" }}>Enter debit and credit amounts to validate balance.</span>
          ) : !hasUsableRate && !isPhp ? (
            <span style={{ color: "var(--theme-status-warning-fg)" }}>
              Enter a positive {transactionCurrency}→{FUNCTIONAL_CURRENCY} rate to balance in PHP.
            </span>
          ) : typeof lockedTotal === "number" && !matchesLockedTotal ? (
            <span style={{ color: "var(--theme-status-warning-fg)" }}>
              Each side must total {formatMoney(lockedTotal, FUNCTIONAL_CURRENCY)} — currently {formatMoney(totalDebits, FUNCTIONAL_CURRENCY)} DR / {formatMoney(totalCredits, FUNCTIONAL_CURRENCY)} CR.
            </span>
          ) : (
            <span style={{ color: "var(--theme-status-warning-fg)" }}>
              Out of balance — difference: {formatMoney(difference, FUNCTIONAL_CURRENCY)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const hdrStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  color: "var(--theme-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
};

const textInputStyle: React.CSSProperties = {
  height: "34px",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "6px",
  padding: "0 8px",
  fontSize: "12px",
  color: "var(--theme-text-primary)",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
  backgroundColor: "var(--theme-bg-surface)",
};

const amountInputStyle: React.CSSProperties = {
  height: "34px",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "6px",
  padding: "0 8px",
  fontSize: "12px",
  color: "var(--theme-text-primary)",
  textAlign: "right",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
};

const totalCellStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--theme-text-primary)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
