import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import {
  TrendingUp, Scale, Banknote, ChevronLeft, ChevronRight,
  RefreshCw, Loader2, Printer, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, Download, CheckCircle2,
  Clock, CircleDot, FileCheck, FileLock2, X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "income_statement" | "balance_sheet" | "cash_flow";
type BalanceLayout = "report" | "account";
type FilingStatus = "draft" | "reviewed" | "approved" | "filed";

interface JournalLine {
  account_id: string;
  account_name: string;
  account_code: string;
  debit: number;
  credit: number;
}

interface AccountBalance {
  id: string;
  name: string;
  code: string;
  type: string;
  sub_type: string;
  category: string;
  normal_balance: string;
  net_balance: number;
  period_debit: number;
  period_credit: number;
}

interface Filing {
  id: string;
  status: FilingStatus;
  prepared_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  prepared_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  filed_at: string | null;
  notes: string | null;
}

interface KPIs {
  netIncome: number;
  totalAssets: number;
  netCashChange: number | null;
  balanced: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CASH_ACCOUNT_PREFIXES = ["1000","1010","1020","1030"];
const AR_ACCOUNTS  = ["1100","1110","1120","1130","1150","1160","1170","1180"];
const AP_ACCOUNTS  = ["2000","2010","2020","2030","2040","2050","2060","2070","2080","2090","2100","2110","2120"];
const DEPRECIATION_ACCOUNT = "6600";

const FILING_STATUS_META: Record<FilingStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: "Draft",       color: "var(--neuron-ink-muted)",           icon: CircleDot   },
  reviewed: { label: "Under Review",color: "var(--neuron-semantic-warn)", icon: Clock  },
  approved: { label: "Approved",    color: "var(--neuron-brand-green)",          icon: CheckCircle2 },
  filed:    { label: "Filed",       color: "var(--neuron-ink-primary)",         icon: FileLock2   },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const php = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

const phpDelta = (n: number) => {
  const abs = php(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `(${abs})`;
  return abs;
};

function formatAsOf(year: number, month: number): string {
  return new Date(year, month + 1, 0).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)  return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

/**
 * Classify an account purely from its numeric code — no CoA join needed.
 *
 * Standard PH chart-of-accounts ranges:
 *  1000–1999  Assets      (1000–1499 current, 1500–1999 non-current)
 *  2000–2999  Liabilities (2000–2499 current, 2500–2999 non-current)
 *  3000–3999  Equity
 *  4000–4999  Revenue     (4000–4499 service, 4500–4999 other income)
 *  5000–5999  Cost of Services
 *  6000–6999  Operating expenses (6000–6299 selling, 6300–6999 G&A)
 *  7000–7499  Other Income
 *  7500–7999  Other Expenses
 *  8000–8999  Income Tax
 */
function classifyByCode(code: string): {
  type: string; sub_type: string; normal_balance: "debit" | "credit";
} {
  const n = parseInt(code, 10);
  if (isNaN(n)) return { type: "expense", sub_type: "General & Administrative", normal_balance: "debit" };

  if (n >= 1000 && n <= 1999) return {
    type: "asset",
    sub_type: n <= 1499 ? "Current Assets" : "Non-Current Assets",
    normal_balance: "debit",
  };
  if (n >= 2000 && n <= 2999) return {
    type: "liability",
    sub_type: n <= 2499 ? "Current Liabilities" : "Non-Current Liabilities",
    normal_balance: "credit",
  };
  if (n >= 3000 && n <= 3999) return { type: "equity",   sub_type: "Equity",                   normal_balance: "credit" };
  if (n >= 4000 && n <= 4499) return { type: "revenue",  sub_type: "Service Revenue",           normal_balance: "credit" };
  if (n >= 4500 && n <= 4999) return { type: "revenue",  sub_type: "Other Income",              normal_balance: "credit" };
  if (n >= 5000 && n <= 5999) return { type: "expense",  sub_type: "Cost of Services",          normal_balance: "debit"  };
  if (n >= 6000 && n <= 6299) return { type: "expense",  sub_type: "Selling Expenses",          normal_balance: "debit"  };
  if (n >= 6300 && n <= 6999) return { type: "expense",  sub_type: "General & Administrative",  normal_balance: "debit"  };
  if (n >= 7000 && n <= 7499) return { type: "revenue",  sub_type: "Other Income",              normal_balance: "credit" };
  if (n >= 7500 && n <= 7999) return { type: "expense",  sub_type: "Other Expenses",            normal_balance: "debit"  };
  if (n >= 8000 && n <= 8999) return { type: "expense",  sub_type: "Income Tax",                normal_balance: "debit"  };

  return { type: "expense", sub_type: "General & Administrative", normal_balance: "debit" };
}

/**
 * Aggregate account balances from posted journal entries only.
 * Classification is derived from account codes — no Chart of Accounts join.
 *
 * cumulative=true : all entries up to end of period (Balance Sheet)
 * cumulative=false: entries within the period only (Income Statement, Cash Flow)
 */
async function fetchBalances(
  from: string,
  to: string,
  cumulative: boolean
): Promise<AccountBalance[]> {
  let q = supabase
    .from("journal_entries")
    .select("lines")
    .eq("status", "posted");

  q = cumulative
    ? q.lte("entry_date", to)
    : q.gte("entry_date", from).lte("entry_date", to);

  const { data: entries, error } = await q;
  if (error) throw new Error(error.message);
  if (!entries?.length) return [];

  // Aggregate debit/credit totals per account_id directly from journal lines
  const totals = new Map<string, {
    debit: number; credit: number; name: string; code: string;
  }>();

  for (const entry of entries) {
    for (const line of ((entry.lines ?? []) as JournalLine[])) {
      if (!line.account_id || !line.account_code) continue;
      const prev = totals.get(line.account_id) ?? {
        debit: 0, credit: 0, name: line.account_name, code: line.account_code,
      };
      prev.debit  += Number(line.debit)  || 0;
      prev.credit += Number(line.credit) || 0;
      totals.set(line.account_id, prev);
    }
  }
  if (!totals.size) return [];

  // Classify each account from its code — no second DB call
  return Array.from(totals.entries()).map(([id, agg]) => {
    const { type, sub_type, normal_balance } = classifyByCode(agg.code);
    const isDebitNormal = normal_balance === "debit";
    return {
      id,
      name:           agg.name,
      code:           agg.code,
      type,
      sub_type,
      category:       "",
      normal_balance,
      period_debit:   agg.debit,
      period_credit:  agg.credit,
      net_balance:    isDebitNormal ? agg.debit - agg.credit : agg.credit - agg.debit,
    };
  });
}

async function fetchFiling(
  statementType: Tab,
  year: number,
  month: number
): Promise<Filing | null> {
  const { data, error } = await supabase
    .from("financial_statement_filings")
    .select("*")
    .eq("statement_type", statementType)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  // Table may not exist yet if migration hasn't been applied
  if (error) return null;
  return data ?? null;
}

function computeKPIs(
  balances: AccountBalance[],
  priorBalances: AccountBalance[],
  beginBalances: AccountBalance[]
): KPIs {
  const revenue  = balances.filter((a) => a.type === "revenue").reduce((s, a) => s + a.net_balance, 0);
  const expenses = balances.filter((a) => a.type === "expense").reduce((s, a) => s + a.net_balance, 0);
  const netIncome = revenue - expenses;

  const assets      = balances.filter((a) => a.type === "asset").reduce((s, a) => s + a.net_balance, 0);
  const liabilities = balances.filter((a) => a.type === "liability").reduce((s, a) => s + a.net_balance, 0);
  const equity      = balances.filter((a) => a.type === "equity").reduce((s, a) => s + a.net_balance, 0);
  const totalLiabEq = liabilities + equity + netIncome;
  const balanced    = balances.length > 0 ? Math.abs(assets - totalLiabEq) < 0.01 : null;

  // Cash flow operating estimate
  const getBalance = (arr: AccountBalance[], code: string) =>
    arr.find((a) => a.code === code)?.net_balance ?? 0;
  const arChange = AR_ACCOUNTS.reduce((s, code) => {
    return s + -1 * (getBalance(balances, code) - getBalance(beginBalances, code));
  }, 0);
  const apChange = AP_ACCOUNTS.reduce((s, code) => {
    return s + 1 * (getBalance(balances, code) - getBalance(beginBalances, code));
  }, 0);
  const depreciation = balances.find((a) => a.code === DEPRECIATION_ACCOUNT)?.net_balance ?? 0;
  const netCashChange = balances.length > 0
    ? netIncome + depreciation + arChange + apChange
    : null;

  return { netIncome, totalAssets: assets, netCashChange, balanced };
}

function exportCSV(rows: { label: string; amount: number; indent?: boolean }[], filename: string) {
  const lines = [["Description", "Amount (PHP)"]];
  for (const r of rows) {
    lines.push([r.label, r.amount.toFixed(2)]);
  }
  const csv = lines.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  label, onToggle, open,
}: { label: string; onToggle?: () => void; open?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      className="w-full flex items-center justify-between px-6 pt-5 pb-2 group"
      style={{ cursor: onToggle ? "pointer" : "default" }}
    >
      <span className="text-[11px] font-bold tracking-widest uppercase"
        style={{ color: "var(--neuron-brand-green)" }}>
        {label}
      </span>
      {onToggle && (
        open
          ? <ChevronUp size={13} style={{ color: "var(--neuron-ink-muted)" }} />
          : <ChevronDown size={13} style={{ color: "var(--neuron-ink-muted)" }} />
      )}
    </button>
  );
}

function SubLabel({ label }: { label: string }) {
  return (
    <div className="px-6 pt-3 pb-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--neuron-ink-muted)" }}>
        {label}
      </span>
    </div>
  );
}

function AccountRow({
  name, code, amount, priorAmount, showPrior, indent = 2,
}: {
  name: string; code: string; amount: number;
  priorAmount?: number; showPrior?: boolean; indent?: number;
}) {
  const isNegative = amount < 0;
  const warnNegative =
    isNegative && (code.startsWith("11") || code.startsWith("15") || code.startsWith("16"));
  const delta = showPrior && priorAmount !== undefined ? amount - priorAmount : null;

  return (
    <div
      className="flex items-center justify-between px-6 py-[5px] hover:bg-[var(--neuron-state-hover)] transition-colors"
      style={{ paddingLeft: `${indent * 16}px` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-mono tabular-nums w-10 shrink-0"
          style={{ color: "var(--neuron-ink-muted)" }}>
          {code}
        </span>
        <span className="text-[13px] truncate" style={{ color: "var(--neuron-ink-primary)" }}>
          {name}
        </span>
        {warnNegative && (
          <span title="Negative balance — verify GL postings">
            <AlertTriangle size={11} style={{ color: "var(--neuron-semantic-warn)" }} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {showPrior && priorAmount !== undefined && (
          <span className="text-[12px] tabular-nums w-28 text-right"
            style={{ color: "var(--neuron-ink-muted)" }}>
            {priorAmount < 0 ? `(${php(Math.abs(priorAmount))})` : php(priorAmount)}
          </span>
        )}
        <span className="text-[13px] tabular-nums w-28 text-right"
          style={{ color: isNegative ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-primary)" }}>
          {isNegative ? `(${php(Math.abs(amount))})` : php(amount)}
        </span>
        {showPrior && delta !== null && (
          <span className="text-[11px] tabular-nums w-20 text-right"
            style={{ color: delta > 0 ? "var(--neuron-brand-green)" : delta < 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-muted)" }}>
            {delta === 0 ? "—" : phpDelta(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function SubtotalRow({
  label, amount, priorAmount, showPrior,
}: { label: string; amount: number; priorAmount?: number; showPrior?: boolean }) {
  const delta = showPrior && priorAmount !== undefined ? amount - priorAmount : null;
  return (
    <div className="flex items-center justify-between px-6 py-2.5 mt-1"
      style={{ borderTop: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-page)" }}>
      <span className="text-[12px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
        {label}
      </span>
      <div className="flex items-center gap-4 shrink-0">
        {showPrior && priorAmount !== undefined && (
          <span className="text-[12px] font-semibold tabular-nums w-28 text-right"
            style={{ color: "var(--neuron-ink-muted)" }}>
            {priorAmount < 0 ? `(${php(Math.abs(priorAmount))})` : php(priorAmount)}
          </span>
        )}
        <span className="text-[13px] font-semibold tabular-nums w-28 text-right"
          style={{ color: amount < 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-primary)" }}>
          {amount < 0 ? `(${php(Math.abs(amount))})` : php(amount)}
        </span>
        {showPrior && delta !== null && (
          <span className="text-[11px] font-semibold tabular-nums w-20 text-right"
            style={{ color: delta > 0 ? "var(--neuron-brand-green)" : delta < 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-muted)" }}>
            {delta === 0 ? "—" : phpDelta(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function TotalRow({
  label, amount, highlight = false, double = false,
}: { label: string; amount: number; highlight?: boolean; double?: boolean }) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5"
      style={{
        borderTop: double ? "3px double var(--neuron-ui-border)" : "2px solid var(--neuron-ui-border)",
        backgroundColor: highlight ? "var(--neuron-bg-page)" : undefined,
      }}>
      <span className="text-[13px] font-bold tracking-wide uppercase"
        style={{ color: "var(--neuron-ink-primary)" }}>
        {label}
      </span>
      <span className="text-[14px] font-bold tabular-nums"
        style={{ color: amount < 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-primary)" }}>
        {amount < 0 ? `(${php(Math.abs(amount))})` : php(amount)}
      </span>
    </div>
  );
}

function NetIncomeRow({ label, amount }: { label: string; amount: number }) {
  const positive = amount >= 0;
  return (
    <div className="flex items-center justify-between px-6 py-4"
      style={{
        borderTop: "2px solid var(--neuron-ui-border)",
        backgroundColor: positive ? "var(--neuron-brand-green-100)" : "var(--neuron-semantic-danger-bg)",
      }}>
      <span className="text-[14px] font-bold tracking-wide uppercase"
        style={{ color: "var(--neuron-ink-primary)" }}>
        {label}
      </span>
      <span className="text-[16px] font-bold tabular-nums"
        style={{ color: positive ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)" }}>
        {amount < 0 ? `(${php(Math.abs(amount))})` : php(amount)}
      </span>
    </div>
  );
}

function StatementHeading({
  title, subtitle, showPrior, currentLabel, priorLabel,
}: {
  title: string; subtitle: string;
  showPrior?: boolean; currentLabel?: string; priorLabel?: string;
}) {
  return (
    <div className="px-6 pt-6 pb-4 text-center"
      style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}>
      <p className="text-[10px] font-bold tracking-widest uppercase"
        style={{ color: "var(--neuron-ink-muted)" }}>
        {title}
      </p>
      <p className="text-[12px] mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
        {subtitle}
      </p>
      {showPrior && currentLabel && priorLabel && (
        <div className="flex justify-end gap-4 mt-3 pr-6">
          <span className="text-[10px] font-semibold uppercase tracking-wider w-28 text-right"
            style={{ color: "var(--neuron-ink-muted)" }}>
            {priorLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider w-28 text-right"
            style={{ color: "var(--neuron-ink-primary)" }}>
            {currentLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider w-20 text-right"
            style={{ color: "var(--neuron-ink-muted)" }}>
            Change
          </span>
        </div>
      )}
    </div>
  );
}

function SectionDivider() {
  return <div style={{ borderBottom: "1px solid var(--neuron-ui-border)" }} />;
}

function EmptyState({
  message, hasEverPosted,
}: { message: string; hasEverPosted?: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>{message}</p>
      {!hasEverPosted ? (
        <p className="text-[12px] mt-1 opacity-70" style={{ color: "var(--neuron-ink-muted)" }}>
          No journal entries have ever been posted. Go to Chart of Accounts → post a journal entry to get started.
        </p>
      ) : (
        <p className="text-[12px] mt-1 opacity-70" style={{ color: "var(--neuron-ink-muted)" }}>
          No posted entries found for this period. Navigate to another period or post new entries.
        </p>
      )}
    </div>
  );
}

function SignatureBlock() {
  return (
    <div className="hidden print:grid grid-cols-3 gap-8 px-6 py-8 mt-2"
      style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
      {["Prepared By", "Reviewed By", "Approved By"].map((role) => (
        <div key={role} className="flex flex-col items-center gap-2">
          <div className="w-full" style={{ borderBottom: "1px solid var(--neuron-ink-primary)", paddingBottom: "2px" }} />
          <span className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--neuron-ink-muted)" }}>
            {role}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatementSkeleton() {
  return (
    <div className="animate-pulse px-6 py-4 space-y-3">
      <div className="h-4 rounded w-40 mx-auto mb-6" style={{ backgroundColor: "var(--neuron-ui-border)" }} />
      {[1,2,3].map((s) => (
        <div key={s} className="space-y-2">
          <div className="h-3 rounded w-32" style={{ backgroundColor: "var(--neuron-ui-border)" }} />
          {[1,2,3].map((r) => (
            <div key={r} className="flex justify-between">
              <div className="h-3 rounded w-48" style={{ backgroundColor: "var(--neuron-bg-subtle, var(--neuron-ui-border))", opacity: 0.6 }} />
              <div className="h-3 rounded w-24" style={{ backgroundColor: "var(--neuron-bg-subtle, var(--neuron-ui-border))", opacity: 0.6 }} />
            </div>
          ))}
          <div className="h-3 rounded w-full" style={{ backgroundColor: "var(--neuron-ui-border)" }} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Strip
// ─────────────────────────────────────────────────────────────────────────────

function KPIStrip({ kpis, loading }: { kpis: KPIs | null; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="flex gap-3 px-8 py-4">
        {[1,2,3,4].map((i) => (
          <div key={i} className="flex-1 h-16 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)" }} />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Net Income",
      value: php(kpis.netIncome),
      positive: kpis.netIncome >= 0,
      color: kpis.netIncome >= 0 ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)",
    },
    {
      label: "Total Assets",
      value: php(kpis.totalAssets),
      positive: true,
      color: "var(--neuron-ink-primary)",
    },
    {
      label: "Net Cash Change",
      value: kpis.netCashChange !== null ? php(kpis.netCashChange) : "—",
      positive: (kpis.netCashChange ?? 0) >= 0,
      color: (kpis.netCashChange ?? 0) >= 0 ? "var(--neuron-ink-primary)" : "var(--neuron-semantic-danger)",
    },
    {
      label: "Balance Check",
      value: kpis.balanced === null ? "No data" : kpis.balanced ? "Balanced" : "Out of balance",
      positive: kpis.balanced !== false,
      color: kpis.balanced === null
        ? "var(--neuron-ink-muted)"
        : kpis.balanced
          ? "var(--neuron-brand-green)"
          : "var(--neuron-semantic-danger)",
      icon: kpis.balanced === null
        ? null
        : kpis.balanced
          ? CheckCircle2
          : AlertCircle,
    },
  ];

  return (
    <div className="flex gap-3 px-8 py-4">
      {cards.map((card) => (
        <div key={card.label}
          className="flex-1 px-4 py-3 rounded-lg"
          style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--neuron-ink-muted)" }}>
            {card.label}
          </p>
          <div className="flex items-center gap-1.5">
            {card.icon && <card.icon size={13} style={{ color: card.color }} />}
            <p className="text-[14px] font-bold tabular-nums" style={{ color: card.color }}>
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Period Picker
// ─────────────────────────────────────────────────────────────────────────────

function PeriodPicker({
  year, month, maxYear, maxMonth,
  onSelect, onClose,
}: {
  year: number; month: number;
  maxYear: number; maxMonth: number;
  onSelect: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const [pickerYear, setPickerYear] = useState(year);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const canGoNext = pickerYear < maxYear;
  const isMonthDisabled = (m: number) =>
    pickerYear > maxYear || (pickerYear === maxYear && m > maxMonth);

  return (
    <div ref={ref}
      className="absolute top-full mt-2 z-50 rounded-lg shadow-lg p-3"
      style={{
        backgroundColor: "var(--neuron-bg-elevated)",
        border: "1px solid var(--neuron-ui-border)",
        minWidth: "240px",
      }}>
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button onClick={() => setPickerYear((y) => y - 1)}
          className="p-1 rounded hover:bg-[var(--neuron-state-hover)] transition-colors">
          <ChevronLeft size={14} style={{ color: "var(--neuron-ink-muted)" }} />
        </button>
        <span className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
          {pickerYear}
        </span>
        <button onClick={() => canGoNext && setPickerYear((y) => y + 1)}
          disabled={!canGoNext}
          className="p-1 rounded hover:bg-[var(--neuron-state-hover)] transition-colors disabled:opacity-30">
          <ChevronRight size={14} style={{ color: "var(--neuron-ink-muted)" }} />
        </button>
      </div>
      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((m, i) => {
          const disabled = isMonthDisabled(i);
          const selected = pickerYear === year && i === month;
          return (
            <button key={m}
              disabled={disabled}
              onClick={() => { onSelect(pickerYear, i); onClose(); }}
              className="py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-30"
              style={{
                backgroundColor: selected ? "var(--neuron-brand-green)" : "transparent",
                color: selected ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-primary)",
              }}
              onMouseEnter={(e) => { if (!selected && !disabled) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--neuron-state-hover)"; }}
              onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = selected ? "var(--neuron-brand-green)" : "transparent"; }}
            >
              {m.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filing Workflow
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ORDER: FilingStatus[] = ["draft", "reviewed", "approved", "filed"];

function FilingWorkflowBar({
  filing, onAdvance, onRetract, advancing,
}: {
  filing: Filing | null;
  onAdvance: () => void;
  onRetract: () => void;
  advancing: boolean;
}) {
  const status: FilingStatus = filing?.status ?? "draft";
  const meta = FILING_STATUS_META[status];
  const StatusIcon = meta.icon;
  const currentIdx = STATUS_ORDER.indexOf(status);
  const canAdvance = currentIdx < STATUS_ORDER.length - 1;
  const canRetract = currentIdx > 0;

  const nextStatus = canAdvance ? STATUS_ORDER[currentIdx + 1] : null;
  const nextMeta   = nextStatus ? FILING_STATUS_META[nextStatus] : null;

  const ADVANCE_LABELS: Partial<Record<FilingStatus, string>> = {
    draft:    "Mark as Reviewed",
    reviewed: "Approve",
    approved: "Mark as Filed",
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 mb-4 rounded-lg"
      style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)" }}>
      {/* Status pipeline */}
      <div className="flex items-center gap-3">
        {STATUS_ORDER.map((s, i) => {
          const m = FILING_STATUS_META[s];
          const Icon = m.icon;
          const done  = STATUS_ORDER.indexOf(status) >= i;
          const isNow = status === s;
          return (
            <div key={s} className="flex items-center gap-1.5">
              <Icon size={13} style={{ color: done ? m.color : "var(--neuron-ink-muted)", opacity: done ? 1 : 0.4 }} />
              <span className="text-[11px] font-medium"
                style={{ color: done ? m.color : "var(--neuron-ink-muted)", opacity: done ? 1 : 0.4, fontWeight: isNow ? 700 : 500 }}>
                {m.label}
              </span>
              {i < STATUS_ORDER.length - 1 && (
                <span style={{ color: "var(--neuron-ui-border)", marginLeft: 4, marginRight: 4 }}>›</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {canRetract && status !== "filed" && (
          <button onClick={onRetract} disabled={advancing}
            className="px-3 py-1 rounded text-[12px] font-medium transition-colors hover:bg-[var(--neuron-state-hover)] disabled:opacity-40"
            style={{ color: "var(--neuron-ink-muted)", border: "1px solid var(--neuron-ui-border)" }}>
            Undo
          </button>
        )}
        {canAdvance && (
          <button onClick={onAdvance} disabled={advancing}
            className="px-3 py-1.5 rounded text-[12px] font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--neuron-brand-green)",
              color: "var(--neuron-action-primary-text)",
              border: "none",
            }}>
            {advancing && <Loader2 size={11} className="animate-spin" />}
            {ADVANCE_LABELS[status]}
          </button>
        )}
        {status === "filed" && (
          <div className="flex items-center gap-1.5 px-3 py-1"
            style={{ color: "var(--neuron-ink-muted)" }}>
            <FileLock2 size={12} />
            <span className="text-[11px]">
              Filed {filing?.filed_at ? new Date(filing.filed_at).toLocaleDateString("en-PH") : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparative column header toggle
// ─────────────────────────────────────────────────────────────────────────────

function ComparativeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
      style={{
        border: "1px solid var(--neuron-ui-border)",
        backgroundColor: active ? "var(--neuron-brand-green)" : "transparent",
        color: active ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
      }}>
      Compare prior month
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Income Statement
// ─────────────────────────────────────────────────────────────────────────────

function IncomeStatement({
  balances, priorBalances, period, priorPeriod, showPrior, showEmpty, onExport,
}: {
  balances: AccountBalance[];
  priorBalances: AccountBalance[];
  period: string;
  priorPeriod: string;
  showPrior: boolean;
  showEmpty: boolean;
  onExport: (rows: { label: string; amount: number }[]) => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    revenue: true, other_income: true, cos: true,
    selling: true, ga: true, other_exp: true, tax: true,
  });
  const toggle = (key: string) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const getPrior = (code: string) =>
    priorBalances.find((a) => a.code === code)?.net_balance ?? 0;

  const filter = (type: string, sub: string) =>
    balances.filter((a) => a.type === type && a.sub_type === sub);
  const priorFilter = (type: string, sub: string) =>
    priorBalances.filter((a) => a.type === type && a.sub_type === sub);
  const priorSum = (arr: AccountBalance[]) => arr.reduce((s, a) => s + a.net_balance, 0);

  const revenue  = filter("revenue", "Service Revenue");
  const otherInc = filter("revenue", "Other Income");
  const cos      = filter("expense", "Cost of Services");
  const selling  = filter("expense", "Selling Expenses");
  const ga       = filter("expense", "General & Administrative");
  const otherExp = filter("expense", "Other Expenses");
  const taxExp   = filter("expense", "Income Tax");

  const totalRevenue  = revenue.reduce((s, a) => s + a.net_balance, 0);
  const totalOtherInc = otherInc.reduce((s, a) => s + a.net_balance, 0);
  const totalCos      = cos.reduce((s, a) => s + a.net_balance, 0);
  const grossProfit   = totalRevenue - totalCos;
  const totalSelling  = selling.reduce((s, a) => s + a.net_balance, 0);
  const totalGA       = ga.reduce((s, a) => s + a.net_balance, 0);
  const totalOpex     = totalSelling + totalGA;
  const operatingInc  = grossProfit - totalOpex;
  const totalOtherExp = otherExp.reduce((s, a) => s + a.net_balance, 0);
  const incBeforeTax  = operatingInc + totalOtherInc - totalOtherExp;
  const totalTax      = taxExp.reduce((s, a) => s + a.net_balance, 0);
  const netIncome     = incBeforeTax - totalTax;

  const priorTotalRevenue = priorSum(priorFilter("revenue", "Service Revenue"));
  const priorTotalCos     = priorSum(priorFilter("expense", "Cost of Services"));
  const priorGrossProfit  = priorTotalRevenue - priorTotalCos;
  const priorSelling      = priorSum(priorFilter("expense", "Selling Expenses"));
  const priorGA           = priorSum(priorFilter("expense", "General & Administrative"));
  const priorOpex         = priorSelling + priorGA;
  const priorOperatingInc = priorGrossProfit - priorOpex;
  const priorOtherInc     = priorSum(priorFilter("revenue", "Other Income"));
  const priorOtherExp     = priorSum(priorFilter("expense", "Other Expenses"));
  const priorIncBeforeTax = priorOperatingInc + priorOtherInc - priorOtherExp;
  const priorTax          = priorSum(priorFilter("expense", "Income Tax"));
  const priorNetIncome    = priorIncBeforeTax - priorTax;

  const hasData = balances.some((a) => a.type === "revenue" || a.type === "expense");
  if (!hasData) return <EmptyState message={`No revenue or expense entries for ${period}.`} hasEverPosted={priorBalances.length > 0} />;

  const exportRows = [
    { label: "Service Revenue", amount: totalRevenue },
    ...revenue.map((a) => ({ label: `  ${a.code} ${a.name}`, amount: a.net_balance })),
    { label: "Cost of Services", amount: totalCos },
    { label: "Gross Profit", amount: grossProfit },
    { label: "Operating Expenses", amount: totalOpex },
    { label: "Operating Income", amount: operatingInc },
    { label: "Other Income", amount: totalOtherInc },
    { label: "Other Expenses", amount: totalOtherExp },
    { label: "Income Before Tax", amount: incBeforeTax },
    { label: "Income Tax", amount: totalTax },
    { label: "Net Income", amount: netIncome },
  ];

  const renderSection = (
    key: string,
    label: string,
    items: AccountBalance[],
    subtotalLabel: string,
    subtotal: number,
    priorSubtotal: number,
  ) => {
    if (!showEmpty && items.length === 0) return null;
    return (
      <>
        <SectionDivider />
        <SectionHeader label={label} onToggle={() => toggle(key)} open={openSections[key]} />
        {openSections[key] && (
          items.length === 0
            ? <p className="px-10 pb-3 text-[12px] italic" style={{ color: "var(--neuron-ink-muted)" }}>No entries</p>
            : items.map((a) => (
                <AccountRow key={a.id} name={a.name} code={a.code} amount={a.net_balance}
                  priorAmount={getPrior(a.code)} showPrior={showPrior} />
              ))
        )}
        <SubtotalRow label={subtotalLabel} amount={subtotal}
          priorAmount={priorSubtotal} showPrior={showPrior} />
      </>
    );
  };

  return (
    <div>
      <StatementHeading title="Income Statement" subtitle={`For the month ended ${period}`}
        showPrior={showPrior} currentLabel={period} priorLabel={priorPeriod} />

      {renderSection("revenue", "Service Revenue", revenue, "Total Service Revenue", totalRevenue, priorTotalRevenue)}
      {renderSection("cos", "Cost of Services", cos, "Total Cost of Services", totalCos, priorTotalCos)}
      <TotalRow label="Gross Profit" amount={grossProfit} highlight />
      {renderSection("selling", "Selling Expenses", selling, "Total Selling Expenses", totalSelling, priorSelling)}
      {renderSection("ga", "General & Administrative", ga, "Total G&A Expenses", totalGA, priorGA)}
      {(showEmpty || selling.length > 0 || ga.length > 0) && (
        <SubtotalRow label="Total Operating Expenses" amount={totalOpex} priorAmount={priorOpex} showPrior={showPrior} />
      )}
      <TotalRow label="Operating Income" amount={operatingInc} highlight />
      {renderSection("other_income", "Other Income", otherInc, "Total Other Income", totalOtherInc, priorOtherInc)}
      {renderSection("other_exp", "Other Expenses", otherExp, "Total Other Expenses", totalOtherExp, priorOtherExp)}
      <TotalRow label="Income Before Tax" amount={incBeforeTax} highlight />
      {renderSection("tax", "Income Tax Expense", taxExp, "Total Income Tax", totalTax, priorTax)}

      <div className="relative">
        <NetIncomeRow label="Net Income" amount={netIncome} />
        {showPrior && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[12px] tabular-nums"
            style={{ color: "var(--neuron-ink-muted)" }}>
            <span>vs prior: </span>
            <span style={{ color: netIncome - priorNetIncome >= 0 ? "var(--neuron-brand-green)" : "var(--neuron-semantic-danger)" }}>
              {phpDelta(netIncome - priorNetIncome)}
            </span>
          </div>
        )}
      </div>
      <SignatureBlock />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance Sheet
// ─────────────────────────────────────────────────────────────────────────────

function BalanceSheetReport({
  balances, asOf, layout, showEmpty,
}: { balances: AccountBalance[]; asOf: string; layout: BalanceLayout; showEmpty: boolean }) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    current_assets: true, noncurrent_assets: true,
    current_liab: true, noncurrent_liab: true, equity: true,
  });
  const toggle = (key: string) => setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const assets      = balances.filter((a) => a.type === "asset");
  const liabilities = balances.filter((a) => a.type === "liability");
  const equity      = balances.filter((a) => a.type === "equity");

  const totalRevenue        = balances.filter((a) => a.type === "revenue").reduce((s, a) => s + a.net_balance, 0);
  const totalExpenses       = balances.filter((a) => a.type === "expense").reduce((s, a) => s + a.net_balance, 0);
  const currentYearEarnings = totalRevenue - totalExpenses;

  const currentAssets    = assets.filter((a) => a.sub_type === "Current Assets");
  const nonCurrentAssets = assets.filter((a) => a.sub_type === "Non-Current Assets");
  const currentLiab      = liabilities.filter((a) => a.sub_type === "Current Liabilities");
  const nonCurrentLiab   = liabilities.filter((a) => a.sub_type === "Non-Current Liabilities");

  const totalCurrentAssets    = currentAssets.reduce((s, a) => s + a.net_balance, 0);
  const totalNonCurrentAssets = nonCurrentAssets.reduce((s, a) => s + a.net_balance, 0);
  const totalAssets           = totalCurrentAssets + totalNonCurrentAssets;
  const totalCurrentLiab      = currentLiab.reduce((s, a) => s + a.net_balance, 0);
  const totalNonCurrentLiab   = nonCurrentLiab.reduce((s, a) => s + a.net_balance, 0);
  const totalLiabilities      = totalCurrentLiab + totalNonCurrentLiab;
  const totalEquity           = equity.reduce((s, a) => s + a.net_balance, 0) + currentYearEarnings;
  const totalLiabEquity       = totalLiabilities + totalEquity;

  if (!balances.length) return <EmptyState message={`No balance sheet entries as of ${asOf}.`} />;

  const renderSection = (key: string, label: string, items: AccountBalance[], subtotalLabel: string, subtotal: number) => {
    if (!showEmpty && items.length === 0) return null;
    return (
      <>
        <SectionDivider />
        <SectionHeader label={label} onToggle={() => toggle(key)} open={openSections[key]} />
        {openSections[key] && (
          items.length === 0
            ? <p className="px-10 pb-3 text-[12px] italic" style={{ color: "var(--neuron-ink-muted)" }}>No entries</p>
            : items.map((a) => <AccountRow key={a.id} name={a.name} code={a.code} amount={a.net_balance} />)
        )}
        <SubtotalRow label={subtotalLabel} amount={subtotal} />
      </>
    );
  };

  const AssetsSection = (
    <div>
      <SectionHeader label="Assets" />
      {renderSection("current_assets", "Current Assets", currentAssets, "Total Current Assets", totalCurrentAssets)}
      {renderSection("noncurrent_assets", "Non-Current Assets", nonCurrentAssets, "Total Non-Current Assets", totalNonCurrentAssets)}
      <TotalRow label="Total Assets" amount={totalAssets} highlight />
    </div>
  );

  const LiabEquitySection = (
    <div>
      <SectionHeader label="Liabilities & Equity" />
      {renderSection("current_liab", "Current Liabilities", currentLiab, "Total Current Liabilities", totalCurrentLiab)}
      {renderSection("noncurrent_liab", "Non-Current Liabilities", nonCurrentLiab, "Total Non-Current Liabilities", totalNonCurrentLiab)}
      <TotalRow label="Total Liabilities" amount={totalLiabilities} />

      {(showEmpty || equity.length > 0 || currentYearEarnings !== 0) && (
        <>
          <SectionDivider />
          <SectionHeader label="Equity" onToggle={() => toggle("equity")} open={openSections.equity} />
          {openSections.equity && (
            <>
              {equity.map((a) => <AccountRow key={a.id} name={a.name} code={a.code} amount={a.net_balance} />)}
              {currentYearEarnings !== 0 && (
                <AccountRow name="Current Year Earnings" code="3200" amount={currentYearEarnings} />
              )}
              {equity.length === 0 && currentYearEarnings === 0 && (
                <p className="px-10 pb-3 text-[12px] italic" style={{ color: "var(--neuron-ink-muted)" }}>No entries</p>
              )}
            </>
          )}
          <TotalRow label="Total Equity" amount={totalEquity} />
        </>
      )}

      <TotalRow label="Total Liabilities & Equity" amount={totalLiabEquity} highlight double />

      {Math.abs(totalAssets - totalLiabEquity) > 0.01 && (
        <div className="px-6 py-3 flex items-start gap-2"
          style={{ borderTop: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-semantic-warn-bg)" }}>
          <AlertTriangle size={13} style={{ color: "var(--neuron-semantic-warn)", flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px]" style={{ color: "var(--neuron-semantic-warn)" }}>
            Balance sheet is out of balance by {php(Math.abs(totalAssets - totalLiabEquity))}.
            This typically indicates unposted period-closing entries.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <StatementHeading title="Balance Sheet" subtitle={`As of ${asOf}`} />
      {layout === "account" ? (
        <div className="grid grid-cols-2" style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
          <div style={{ borderRight: "1px solid var(--neuron-ui-border)" }}>{AssetsSection}</div>
          <div>{LiabEquitySection}</div>
        </div>
      ) : (
        <>
          {AssetsSection}
          <SectionDivider />
          {LiabEquitySection}
        </>
      )}
      {layout === "report" && <SignatureBlock />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Flow Statement
// ─────────────────────────────────────────────────────────────────────────────

function CashFlowStatement({
  periodBalances, beginBalances, period, showEmpty,
}: { periodBalances: AccountBalance[]; beginBalances: AccountBalance[]; period: string; showEmpty: boolean }) {
  const totalRevenue  = periodBalances.filter((a) => a.type === "revenue").reduce((s, a) => s + a.net_balance, 0);
  const totalExpenses = periodBalances.filter((a) => a.type === "expense").reduce((s, a) => s + a.net_balance, 0);
  const netIncome     = totalRevenue - totalExpenses;

  const depreciationExp = periodBalances.find((a) => a.code === DEPRECIATION_ACCOUNT);
  const depreciation    = depreciationExp?.net_balance ?? 0;

  function getBalance(arr: AccountBalance[], code: string) {
    return arr.find((a) => a.code === code)?.net_balance ?? 0;
  }
  function getNetChange(codes: string[], sign: 1 | -1) {
    return codes.reduce((s, code) => {
      return s + sign * (getBalance(periodBalances, code) - getBalance(beginBalances, code));
    }, 0);
  }

  const arChange  = getNetChange(AR_ACCOUNTS, -1);
  const apChange  = getNetChange(AP_ACCOUNTS, 1);
  const operatingCashFlow = netIncome + depreciation + arChange + apChange;

  const investingCodes = ["1500","1520","1540","1600"];
  const investingFlow  = getNetChange(investingCodes, -1);

  const loanChange     = getNetChange(["2500"], 1);
  const drawingsChange = -(getBalance(periodBalances, "3300"));
  const capitalChange  = getBalance(periodBalances, "3000");
  const financingFlow  = loanChange + drawingsChange + capitalChange;

  const netCashChange = operatingCashFlow + investingFlow + financingFlow;

  if (!periodBalances.length) return <EmptyState message={`No journal entries found for ${period}.`} />;

  const CashRow = ({ label, amount, indent = false }: { label: string; amount: number; indent?: boolean }) => (
    <div className="flex items-center justify-between py-[5px] hover:bg-[var(--neuron-state-hover)] transition-colors"
      style={{ paddingLeft: indent ? "40px" : "24px", paddingRight: "24px" }}>
      <span className="text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>{label}</span>
      <span className="text-[13px] tabular-nums"
        style={{ color: amount < 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-primary)" }}>
        {amount < 0 ? `(${php(Math.abs(amount))})` : php(amount)}
      </span>
    </div>
  );

  const hasInvesting  = showEmpty || investingFlow !== 0;
  const hasFinancing  = showEmpty || loanChange !== 0 || capitalChange !== 0 || drawingsChange !== 0;

  return (
    <div>
      <StatementHeading title="Statement of Cash Flows" subtitle={`For the month ended ${period}`} />

      <SectionDivider />
      <SectionHeader label="Operating Activities" />
      <CashRow label="Net Income" amount={netIncome} indent />
      <SubLabel label="Adjustments for non-cash items" />
      <CashRow label="Depreciation & Amortization" amount={depreciation} indent />
      <SubLabel label="Changes in working capital" />
      <CashRow label="(Increase)/Decrease in Receivables" amount={arChange} indent />
      <CashRow label="Increase/(Decrease) in Payables" amount={apChange} indent />
      <SubtotalRow label="Net Cash from Operating Activities" amount={operatingCashFlow} />

      {hasInvesting && (
        <>
          <SectionDivider />
          <SectionHeader label="Investing Activities" />
          {investingFlow !== 0
            ? <CashRow label="Purchase of Fixed Assets" amount={investingFlow} indent />
            : <p className="px-10 pb-3 text-[12px] italic" style={{ color: "var(--neuron-ink-muted)" }}>No entries</p>
          }
          <SubtotalRow label="Net Cash from Investing Activities" amount={investingFlow} />
        </>
      )}

      {hasFinancing && (
        <>
          <SectionDivider />
          <SectionHeader label="Financing Activities" />
          {loanChange !== 0    && <CashRow label="Proceeds from / Repayment of Loans" amount={loanChange} indent />}
          {capitalChange !== 0 && <CashRow label="Capital Contributions" amount={capitalChange} indent />}
          {drawingsChange !== 0&& <CashRow label="Owner's Drawings" amount={drawingsChange} indent />}
          {loanChange === 0 && capitalChange === 0 && drawingsChange === 0 && (
            <p className="px-10 pb-3 text-[12px] italic" style={{ color: "var(--neuron-ink-muted)" }}>No entries</p>
          )}
          <SubtotalRow label="Net Cash from Financing Activities" amount={financingFlow} />
        </>
      )}

      <NetIncomeRow label="Net Increase / (Decrease) in Cash" amount={netCashChange} />
      <SignatureBlock />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "income_statement", label: "Income Statement", icon: TrendingUp },
  { id: "balance_sheet",    label: "Balance Sheet",    icon: Scale      },
  { id: "cash_flow",        label: "Cash Flow",        icon: Banknote   },
];

export function FinancialStatementsPage() {
  const { user } = useUser();
  const now = new Date();

  const [tab, setTab]             = useState<Tab>("income_statement");
  const [layout, setLayout]       = useState<BalanceLayout>("report");
  const [year, setYear]           = useState(now.getFullYear());
  const [month, setMonth]         = useState(now.getMonth());
  const [balances, setBalances]   = useState<AccountBalance[]>([]);
  const [priorBals, setPriorBals] = useState<AccountBalance[]>([]);
  const [beginBals, setBeginBals] = useState<AccountBalance[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt]   = useState<Date | null>(null);
  const [showPrior, setShowPrior] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filing, setFiling]       = useState<Filing | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const periodLabel  = `${MONTHS[month]} ${year}`;
  const asOfLabel    = formatAsOf(year, month);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Prior month
  const priorMonth = month === 0 ? 11 : month - 1;
  const priorYear  = month === 0 ? year - 1 : year;
  const priorPeriodLabel = `${MONTHS[priorMonth]} ${priorYear}`;

  const periodFrom = useMemo(() => new Date(year, month, 1).toISOString(),                      [year, month]);
  const periodTo   = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString(), [year, month]);
  const beginTo    = useMemo(() => new Date(year, month, 0, 23, 59, 59, 999).toISOString(),     [year, month]);
  const priorFrom  = useMemo(() => new Date(priorYear, priorMonth, 1).toISOString(),             [priorYear, priorMonth]);
  const priorTo    = useMemo(() => new Date(priorYear, priorMonth + 1, 0, 23, 59, 59, 999).toISOString(), [priorYear, priorMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const isCumulative = tab === "balance_sheet";
      const [period, prior, begin, fil] = await Promise.all([
        fetchBalances(periodFrom, periodTo, isCumulative),
        showPrior ? fetchBalances(priorFrom, priorTo, isCumulative) : Promise.resolve([]),
        tab === "cash_flow" ? fetchBalances(periodFrom, beginTo, true) : Promise.resolve([]),
        fetchFiling(tab, year, month),
      ]);
      setBalances(period);
      setPriorBals(prior);
      setBeginBals(begin);
      setFiling(fil);
      setLoadedAt(new Date());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load GL data.");
    } finally {
      setLoading(false);
    }
  }, [year, month, tab, showPrior, periodFrom, periodTo, priorFrom, priorTo, beginTo]);

  useEffect(() => { load(); }, [load]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target !== document.body && (e.target as HTMLElement).tagName !== "MAIN") return;
      if (e.key === "ArrowLeft")  handlePrevMonth();
      if (e.key === "ArrowRight" && !isCurrentMonth) handleNextMonth();
      if (e.key === "1") setTab("income_statement");
      if (e.key === "2") setTab("balance_sheet");
      if (e.key === "3") setTab("cash_flow");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCurrentMonth, month, year]);

  const handlePrevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const kpis = useMemo(
    () => computeKPIs(balances, priorBals, beginBals),
    [balances, priorBals, beginBals]
  );

  // Filing workflow
  const advanceFiling = async () => {
    if (!user) return;
    setAdvancing(true);
    try {
      const STATUS_ORDER: FilingStatus[] = ["draft", "reviewed", "approved", "filed"];
      const currentStatus: FilingStatus = filing?.status ?? "draft";
      const nextIdx = STATUS_ORDER.indexOf(currentStatus) + 1;
      if (nextIdx >= STATUS_ORDER.length) return;
      const nextStatus = STATUS_ORDER[nextIdx];

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status: nextStatus,
        statement_type: tab,
        period_year: year,
        period_month: month,
      };
      if (nextStatus === "reviewed") { updates.reviewed_by = user.id; updates.reviewed_at = now; }
      if (nextStatus === "approved") { updates.approved_by = user.id; updates.approved_at = now; }
      if (nextStatus === "filed")    { updates.filed_at = now; }
      if (!filing)                   { updates.prepared_by = user.id; updates.prepared_at = now; }

      const { data, error } = filing
        ? await supabase.from("financial_statement_filings").update(updates).eq("id", filing.id).select().single()
        : await supabase.from("financial_statement_filings").insert(updates).select().single();

      if (error) { console.warn("Filing write skipped (migration not applied):", error.message); return; }
      setFiling(data);
    } catch (err) {
      console.error("Filing error:", err);
    } finally {
      setAdvancing(false);
    }
  };

  const retractFiling = async () => {
    if (!filing) return;
    setAdvancing(true);
    try {
      const STATUS_ORDER: FilingStatus[] = ["draft", "reviewed", "approved", "filed"];
      const currentIdx = STATUS_ORDER.indexOf(filing.status);
      if (currentIdx <= 0) return;
      const prevStatus = STATUS_ORDER[currentIdx - 1];

      const resets: Record<string, unknown> = { status: prevStatus };
      if (filing.status === "reviewed") { resets.reviewed_by = null; resets.reviewed_at = null; }
      if (filing.status === "approved") { resets.approved_by = null; resets.approved_at = null; }
      if (filing.status === "filed")    { resets.filed_at = null; }

      const { data, error } = await supabase
        .from("financial_statement_filings").update(resets).eq("id", filing.id).select().single();
      if (error) throw new Error(error.message);
      setFiling(data);
    } finally {
      setAdvancing(false);
    }
  };

  const handleExport = (rows: { label: string; amount: number }[]) => {
    exportCSV(rows, `${tab}_${year}_${String(month + 1).padStart(2, "0")}.csv`);
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--neuron-bg-elevated)" }}>
      {/* ── Page Header ── */}
      <div className="px-10 pt-8 pb-0" style={{ backgroundColor: "var(--neuron-bg-elevated)" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="tracking-tight mb-1"
              style={{ fontSize: "28px", fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-0.8px" }}>
              Financial Statements
            </h1>
            <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              Posted GL entries · PFRS-compliant
              {loadedAt && (
                <span className="ml-3" style={{ opacity: 0.6 }}>
                  · Updated {timeAgo(loadedAt)}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Comparative toggle */}
            <ComparativeToggle active={showPrior} onToggle={() => setShowPrior((v) => !v)} />

            {/* Show empty toggle */}
            <button onClick={() => setShowEmpty((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: showEmpty ? "var(--neuron-bg-page)" : "transparent",
                color: "var(--neuron-ink-muted)",
              }}>
              {showEmpty ? "Hide empty sections" : "Show empty sections"}
            </button>

            <div style={{ width: "1px", height: 24, backgroundColor: "var(--neuron-ui-border)" }} />

            {/* Period navigator */}
            <div className="relative flex items-center gap-1">
              <button onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-[var(--neuron-state-hover)] transition-colors"
                style={{ border: "1px solid var(--neuron-ui-border)" }}>
                <ChevronLeft size={14} style={{ color: "var(--neuron-ink-muted)" }} />
              </button>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="text-[13px] font-medium min-w-[140px] text-center px-2 py-1 rounded-lg hover:bg-[var(--neuron-state-hover)] transition-colors"
                style={{ color: "var(--neuron-ink-primary)", border: "1px solid var(--neuron-ui-border)" }}>
                {periodLabel}
              </button>
              <button onClick={handleNextMonth} disabled={isCurrentMonth}
                className="p-1.5 rounded-lg hover:bg-[var(--neuron-state-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ border: "1px solid var(--neuron-ui-border)" }}>
                <ChevronRight size={14} style={{ color: "var(--neuron-ink-muted)" }} />
              </button>
              {pickerOpen && (
                <PeriodPicker year={year} month={month}
                  maxYear={now.getFullYear()} maxMonth={now.getMonth()}
                  onSelect={(y, m) => { setYear(y); setMonth(m); }}
                  onClose={() => setPickerOpen(false)} />
              )}
            </div>

            <div style={{ width: "1px", height: 24, backgroundColor: "var(--neuron-ui-border)" }} />

            {/* Balance sheet layout toggle */}
            {tab === "balance_sheet" && (
              <>
                <div className="flex items-center gap-1 p-1 rounded-lg"
                  style={{ backgroundColor: "var(--neuron-bg-page)", border: "1px solid var(--neuron-ui-border)" }}>
                  {(["report", "account"] as BalanceLayout[]).map((l) => (
                    <button key={l} onClick={() => setLayout(l)}
                      className="px-3 py-1 rounded text-[12px] font-medium transition-colors capitalize"
                      style={{
                        backgroundColor: layout === l ? "var(--neuron-bg-elevated)" : "transparent",
                        color: layout === l ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
                        border: layout === l ? "1px solid var(--neuron-ui-border)" : "1px solid transparent",
                      }}>
                      {l === "report" ? "Report Form" : "Account Form"}
                    </button>
                  ))}
                </div>
                <div style={{ width: "1px", height: 24, backgroundColor: "var(--neuron-ui-border)" }} />
              </>
            )}

            {/* Export CSV */}
            <button onClick={() => handleExport([])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium hover:bg-[var(--neuron-state-hover)] transition-colors"
              style={{ color: "var(--neuron-ink-muted)", border: "1px solid var(--neuron-ui-border)" }}>
              <Download size={14} />
              Export
            </button>

            {/* Print */}
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium hover:bg-[var(--neuron-state-hover)] transition-colors"
              style={{ color: "var(--neuron-ink-muted)", border: "1px solid var(--neuron-ui-border)" }}>
              <Printer size={14} />
              Print
            </button>

            {/* Refresh */}
            <button onClick={load}
              className="p-2 rounded-lg hover:bg-[var(--neuron-state-hover)] transition-colors"
              title="Refresh (or press ← → to navigate)">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""}
                style={{ color: "var(--neuron-ink-muted)" }} />
            </button>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex items-center" style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="relative flex items-center gap-2 px-5 py-3 text-[13px] transition-colors"
                style={{
                  color: isActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                  fontWeight: isActive ? 600 : 500,
                }}>
                <Icon size={14} />
                {label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                    style={{ backgroundColor: "var(--neuron-brand-green)" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Statement Body ── */}
      <div className="flex-1 overflow-y-auto px-8 pt-4 pb-8">
        {/* Error banner */}
        {fetchError && (
          <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-lg"
            style={{ backgroundColor: "var(--neuron-semantic-danger-bg)", border: "1px solid var(--neuron-semantic-danger)" }}>
            <AlertCircle size={15} style={{ color: "var(--neuron-semantic-danger)", flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-semantic-danger)" }}>
                Failed to load GL data
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>{fetchError}</p>
            </div>
            <button onClick={load} className="text-[12px] font-semibold px-3 py-1 rounded"
              style={{ color: "var(--neuron-semantic-danger)", border: "1px solid var(--neuron-semantic-danger)" }}>
              Retry
            </button>
            <button onClick={() => setFetchError(null)}>
              <X size={14} style={{ color: "var(--neuron-ink-muted)" }} />
            </button>
          </div>
        )}

        {/* Filing workflow bar */}
        {!loading && !fetchError && (
          <FilingWorkflowBar
            filing={filing}
            onAdvance={advanceFiling}
            onRetract={retractFiling}
            advancing={advancing}
          />
        )}

        <div className="max-w-5xl mx-auto rounded-lg overflow-hidden"
          style={{ backgroundColor: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)" }}>
          {loading ? (
            <StatementSkeleton />
          ) : tab === "income_statement" ? (
            <IncomeStatement
              balances={balances}
              priorBalances={priorBals}
              period={periodLabel}
              priorPeriod={priorPeriodLabel}
              showPrior={showPrior}
              showEmpty={showEmpty}
              onExport={handleExport}
            />
          ) : tab === "balance_sheet" ? (
            <BalanceSheetReport
              balances={balances}
              asOf={asOfLabel}
              layout={layout}
              showEmpty={showEmpty}
            />
          ) : (
            <CashFlowStatement
              periodBalances={balances}
              beginBalances={beginBals}
              period={periodLabel}
              showEmpty={showEmpty}
            />
          )}
        </div>
      </div>
    </div>
  );
}
