import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePermission } from "../../../context/PermissionProvider";
import {
  BookOpen, Plus, Download, Search, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, Loader2, RefreshCw,
  FileText, Receipt, CreditCard, Wallet, RotateCcw,
} from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import { NewJournalEntryScreen } from "./NewJournalEntryScreen";
import { JournalEntryDetailPanel } from "./JournalEntryDetailPanel";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  evoucher_id: string | null;
  invoice_id: string | null;
  collection_id: string | null;
  booking_id: string | null;
  project_number: string | null;
  customer_name: string | null;
  description: string | null;
  reference: string | null;
  lines: JournalLine[];
  total_debit: number;
  total_credit: number;
  status: "draft" | "posted" | "void";
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  // FX header (PHP-only entries report PHP/1).
  transaction_currency?: "PHP" | "USD";
  exchange_rate?: number;
  base_currency?: "PHP" | "USD";
  source_amount?: number;
  base_amount?: number;
  exchange_rate_date?: string | null;
}

type SourceType = "all" | "evoucher" | "invoice" | "collection" | "manual";
type StatusFilter = "all" | "draft" | "posted" | "void";

type CurrencyFilter = "all" | "PHP" | "USD";

interface Filters {
  dateFrom: string;
  dateTo: string;
  sourceType: SourceType;
  statusFilter: StatusFilter;
  accountId: string;
  search: string;
  currency: CurrencyFilter;
}

interface COAAccount {
  id: string;
  code: string;
  name: string;
}

interface SummaryData {
  count: number;
  totalDebit: number;
  totalCredit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function getSource(entry: JournalEntry) {
  if (entry.evoucher_id) return { type: "evoucher" as const, label: "E-Voucher", ref: entry.reference || entry.evoucher_id, id: entry.evoucher_id };
  if (entry.invoice_id)  return { type: "invoice"  as const, label: "Invoice",   ref: entry.reference || entry.invoice_id,  id: entry.invoice_id };
  if (entry.collection_id) return { type: "collection" as const, label: "Collection", ref: entry.reference || entry.collection_id, id: entry.collection_id };
  if (entry.booking_id) return { type: "booking" as const, label: "Booking", ref: entry.booking_id, id: entry.booking_id };
  return { type: "manual" as const, label: "Manual", ref: null, id: null };
}

function formatDateGroupLabel(dateStr: string) {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const d = new Date(dateStr + "T12:00:00");
  const formatted = d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  if (dateStr === today) return `Today — ${formatted}`;
  if (dateStr === yesterday) return `Yesterday — ${formatted}`;
  return formatted;
}

function groupEntriesByDate(entries: JournalEntry[]) {
  const groups: { dateKey: string; label: string; rows: JournalEntry[] }[] = [];
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = e.entry_date.slice(0, 10);
    if (map.has(key)) {
      groups[map.get(key)!].rows.push(e);
    } else {
      map.set(key, groups.length);
      groups.push({ dateKey: key, label: formatDateGroupLabel(key), rows: [e] });
    }
  }
  return groups;
}

function exportCSV(entries: JournalEntry[], dateFrom: string, dateTo: string) {
  const rows: string[][] = [
    ["Date", "Entry #", "Source", "Description", "Lines", "Total Debit", "Total Credit", "Status"],
    ...entries.map((e) => {
      const src = getSource(e);
      return [
        e.entry_date.slice(0, 10),
        e.entry_number,
        src.ref ? `${src.label} · ${src.ref}` : src.label,
        e.description || "",
        String(e.lines?.length ?? 0),
        e.total_debit.toFixed(2),
        e.total_credit.toFixed(2),
        e.status,
      ];
    }),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `general-journal-${dateFrom}-to-${dateTo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Source tabs config ───────────────────────────────────────────────────────

const SOURCE_TABS: { id: SourceType; label: string; icon: React.ElementType }[] = [
  { id: "all",        label: "All Sources", icon: BookOpen   },
  { id: "evoucher",  label: "E-Voucher",   icon: Wallet     },
  { id: "invoice",   label: "Invoice",     icon: Receipt    },
  { id: "collection",label: "Collection",  icon: CreditCard },
  { id: "manual",    label: "Manual",      icon: FileText   },
];

// ─── Status chip ──────────────────────────────────────────────────────────────

export function isReversalEntry(entry: Pick<JournalEntry, "id">): boolean {
  return entry.id.startsWith("JE-VOID-");
}

export function StatusChip({ status, isReversal }: { status: JournalEntry["status"]; isReversal?: boolean }) {
  const cfg = isReversal && status === "posted"
    ? {
        bg: "var(--theme-status-success-bg)",
        color: "var(--theme-status-success-fg)",
        border: "var(--theme-status-success-border)",
        label: "Reversal",
        icon: <RotateCcw size={10} strokeWidth={2.5} />,
      }
    : {
        posted: {
          bg: "var(--theme-status-success-bg)",
          color: "var(--theme-status-success-fg)",
          border: "var(--theme-status-success-border)",
          label: "Posted",
          icon: null,
        },
        draft: {
          bg: "var(--theme-status-warning-bg)",
          color: "var(--theme-status-warning-fg)",
          border: "var(--theme-status-warning-border)",
          label: "Draft",
          icon: null,
        },
        void: {
          bg: "var(--neuron-pill-inactive-bg)",
          color: "var(--neuron-pill-inactive-text)",
          border: "var(--neuron-pill-inactive-border)",
          label: "Voided",
          icon: null,
        },
      }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "1px 7px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
      letterSpacing: "0.02em", textTransform: "uppercase",
      backgroundColor: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Source chip ─────────────────────────────────────────────────────────────

function SourceChip({ entry }: { entry: JournalEntry }) {
  const src = getSource(entry);
  const isLinked = src.type !== "manual";
  return (
    <span style={{
      fontSize: "12px",
      color: isLinked ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
      fontWeight: isLinked ? 500 : 400,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: "100%", display: "block",
    }}>
      {src.ref ? `${src.label} · ${src.ref}` : src.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GeneralJournal() {
  const { user } = useUser();
  const { can } = usePermission();
  const canAllSources = can("accounting_journal_all_sources_tab", "view");
  const canEvoucher = can("accounting_journal_evoucher_tab", "view");
  const canInvoice = can("accounting_journal_invoice_tab", "view");
  const canCollection = can("accounting_journal_collection_tab", "view");
  const canManual = can("accounting_journal_manual_tab", "view");
  const canCreateJournal = can("acct_journal", "view") && (can("accounting_journal_manual_tab", "view") || can("accounting_journal_all_sources_tab", "view"));

  // ── Data state ──
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [summary, setSummary] = useState<SummaryData>({ count: 0, totalDebit: 0, totalCredit: 0 });
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [accounts, setAccounts] = useState<COAAccount[]>([]);

  // ── Filter & pagination state ──
  const [filters, setFilters] = useState<Filters>({
    dateFrom: startOfMonthISO(),
    dateTo: endOfMonthISO(),
    sourceType: canAllSources ? "all" : canEvoucher ? "evoucher" : canInvoice ? "invoice" : canCollection ? "collection" : canManual ? "manual" : "all",
    statusFilter: "all",
    accountId: "",
    search: "",
    currency: "all",
  });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── UI state ──
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "new-entry">("list");
  const [voidTarget, setVoidTarget] = useState<JournalEntry | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  // ── Load accounts once ──
  useEffect(() => {
    supabase.from("accounts").select("id, code, name").eq("is_active", true).order("code")
      .then(({ data }) => setAccounts((data ?? []) as COAAccount[]));
  }, []);

  // ── Fetch summary (full filtered set, no pagination) ──
  const fetchSummary = useCallback(async (f: Filters) => {
    setLoadingSummary(true);
    try {
      let q = supabase.from("journal_entries").select("total_debit, total_credit");
      q = applyFiltersToQuery(q, f);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as { total_debit: number; total_credit: number }[];
      setSummary({
        count: rows.length,
        totalDebit: rows.reduce((s, r) => s + (r.total_debit ?? 0), 0),
        totalCredit: rows.reduce((s, r) => s + (r.total_credit ?? 0), 0),
      });
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // ── Fetch page ──
  const fetchEntries = useCallback(async (f: Filters, pg: number) => {
    setLoadingEntries(true);
    try {
      let q = supabase.from("journal_entries").select("*, users!created_by(name)")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1);
      q = applyFiltersToQuery(q, f);
      const { data, error } = await q;
      if (error) throw error;
      const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        created_by_name: (row.users as { name?: string } | null)?.name ?? null,
        users: undefined,
      })) as unknown as JournalEntry[];
      setEntries(mapped);
    } catch {
      toast.error("Failed to load journal entries");
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  // ── React to filter / page changes ──
  useEffect(() => {
    fetchEntries(filters, page);
  }, [filters, page, fetchEntries]);

  useEffect(() => {
    setPage(0);
    fetchSummary(filters);
  }, [filters, fetchSummary]);

  // ── Debounce search ──
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value }));
    }, 300);
  };

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  // ── Refresh after new entry ──
  const handleEntryCreated = () => {
    fetchEntries(filters, page);
    fetchSummary(filters);
  };

  // ── Void ──
  const handleVoidConfirm = async () => {
    if (!voidTarget || !user) return;
    setIsVoiding(true);
    try {
      const reversalId = `JE-VOID-${Date.now()}`;
      const reversalLines = (voidTarget.lines ?? []).map((l) => ({
        ...l,
        debit: l.credit,
        credit: l.debit,
        description: `REVERSAL: ${l.description}`,
      }));
      const { error: revErr } = await supabase.from("journal_entries").insert({
        id: reversalId,
        entry_date: new Date().toISOString(),
        evoucher_id: voidTarget.evoucher_id,
        invoice_id: voidTarget.invoice_id,
        collection_id: voidTarget.collection_id,
        booking_id: voidTarget.booking_id,
        description: `REVERSAL of ${voidTarget.entry_number}`,
        reference: voidTarget.entry_number,
        lines: reversalLines,
        total_debit: voidTarget.total_credit,
        total_credit: voidTarget.total_debit,
        status: "posted",
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (revErr) throw revErr;
      const { error: voidErr } = await supabase.from("journal_entries")
        .update({ status: "void", updated_at: new Date().toISOString() })
        .eq("id", voidTarget.id);
      if (voidErr) throw voidErr;
      toast.success("Entry voided — reversal recorded");
      setVoidTarget(null);
      if (selectedEntry?.id === voidTarget.id) setSelectedEntry(null);
      handleEntryCreated();
    } catch {
      toast.error("Failed to void entry");
    } finally {
      setIsVoiding(false);
    }
  };

  // ── CSV export (fetches full set) ──
  const handleExportCSV = async () => {
    toast.info("Preparing export…");
    try {
      let q = supabase.from("journal_entries").select("*")
        .order("entry_date", { ascending: false });
      q = applyFiltersToQuery(q, filters);
      const { data, error } = await q;
      if (error) throw error;
      exportCSV((data ?? []) as JournalEntry[], filters.dateFrom, filters.dateTo);
    } catch {
      toast.error("Export failed");
    }
  };

  // ── Derived ──
  const totalPages = Math.max(1, Math.ceil(summary.count / PAGE_SIZE));
  const isBalanced = Math.abs(summary.totalDebit - summary.totalCredit) < 0.01;
  const grouped = groupEntriesByDate(entries);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (viewMode === "new-entry") {
    return (
      <NewJournalEntryScreen
        onBack={() => setViewMode("list")}
        onCreated={() => {
          setViewMode("list");
          handleEntryCreated();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="px-12 pt-8 pb-0 border-b border-[var(--theme-border-default)]">

        {/* Title row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
              General Journal
            </h1>
            <p className="text-[14px] text-[var(--theme-text-muted)]">
              Track and review all posted accounting entries
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Refresh */}
            <button
              onClick={() => handleEntryCreated()}
              title="Refresh"
              className="h-10 w-10 flex items-center justify-center border border-[var(--theme-border-default)] rounded-lg bg-[var(--theme-bg-surface)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-state-hover)] transition-colors"
            >
              <RefreshCw size={15} className={loadingEntries ? "animate-spin" : ""} />
            </button>
            {/* Export */}
            <button
              onClick={handleExportCSV}
              className="h-10 px-4 flex items-center gap-2 border border-[var(--theme-border-default)] rounded-lg bg-[var(--theme-bg-surface)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-state-hover)] transition-colors font-medium text-[14px]"
            >
              <Download size={15} />
              Export
            </button>
            {/* New Entry */}
            {canCreateJournal && (
              <button
                onClick={() => setViewMode("new-entry")}
                className="h-10 px-4 flex items-center gap-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[var(--theme-action-primary-border)] transition-colors font-medium text-[14px]"
              >
                <Plus size={16} />
                New Entry
              </button>
            )}
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search entry #, description…"
              className="h-9 pl-9 pr-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] placeholder:text-[var(--theme-text-muted)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)] w-56"
            />
          </div>
          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilter("dateFrom", e.target.value)}
              className="h-9 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)]"
            />
            <span className="text-[13px] text-[var(--theme-text-muted)]">to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilter("dateTo", e.target.value)}
              className="h-9 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)]"
            />
          </div>
          {/* Status filter */}
          <select
            value={filters.statusFilter}
            onChange={(e) => setFilter("statusFilter", e.target.value as StatusFilter)}
            className="h-9 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)] cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="void">Void</option>
          </select>
          {/* Account filter */}
          <select
            value={filters.accountId}
            onChange={(e) => setFilter("accountId", e.target.value)}
            className="h-9 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)] cursor-pointer max-w-[200px]"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
          {/* Currency filter */}
          <select
            value={filters.currency}
            onChange={(e) => setFilter("currency", e.target.value as CurrencyFilter)}
            className="h-9 px-3 border border-[var(--theme-border-default)] rounded-lg text-[13px] text-[var(--theme-text-primary)] bg-[var(--theme-bg-page)] outline-none focus:ring-2 focus:ring-[var(--theme-state-focus-ring)] cursor-pointer"
          >
            <option value="all">All Currencies</option>
            <option value="PHP">PHP only</option>
            <option value="USD">USD only</option>
          </select>
        </div>

        {/* Source tabs */}
        <div className="flex items-center gap-8" role="tablist">
          {SOURCE_TABS.map((tab) => {
            const tabCanMap: Record<SourceType, boolean> = {
              all: canAllSources,
              evoucher: canEvoucher,
              invoice: canInvoice,
              collection: canCollection,
              manual: canManual,
            };
            if (!tabCanMap[tab.id]) return null;
            const isActive = filters.sourceType === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter("sourceType", tab.id)}
                className={`flex items-center gap-2 py-4 relative transition-colors ${isActive ? "text-[var(--theme-action-primary-bg)]" : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"}`}
              >
                <TabIcon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[14px] ${isActive ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--theme-action-primary-bg)] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main area (table + detail panel) ────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Table area */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Table scroll region */}
          <div className="flex-1 overflow-y-auto bg-[var(--theme-bg-page)]">
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "96px" }} />
                <col style={{ width: "148px" }} />
                <col style={{ width: "168px" }} />
                <col />
                <col style={{ width: "64px" }} />
                <col style={{ width: "124px" }} />
                <col style={{ width: "124px" }} />
                <col style={{ width: "124px" }} />
              </colgroup>

              <thead>
                <tr style={{ borderBottom: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface)", position: "sticky", top: 0, zIndex: 1 }}>
                  {["DATE", "ENTRY #", "SOURCE", "DESCRIPTION", "LINES", "DEBIT", "CREDIT", "STATUS"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 12px",
                      fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)",
                      letterSpacing: "0.04em", textTransform: "uppercase",
                      textAlign: i >= 5 && i <= 6 ? "right" : "left",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loadingEntries ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} style={{ padding: "12px" }}>
                          <div style={{ height: "12px", borderRadius: "4px", backgroundColor: "var(--theme-state-hover)", width: j === 3 ? "80%" : "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "64px 24px", textAlign: "center" }}>
                      <BookOpen size={32} style={{ color: "var(--theme-text-muted)", margin: "0 auto 12px", opacity: 0.4 }} />
                      <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: "0 0 4px" }}>No journal entries found for this period.</p>
                      <button
                        onClick={() => {
                          setFilters({ dateFrom: startOfMonthISO(), dateTo: endOfMonthISO(), sourceType: "all", statusFilter: "all", accountId: "", search: "", currency: "all" });
                          setSearchInput("");
                          setPage(0);
                        }}
                        style={{ fontSize: "12px", color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: "4px" }}
                      >
                        Clear filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  grouped.map((group) => (
                    <React.Fragment key={group.dateKey}>
                      {/* Date group header */}
                      <tr>
                        <td colSpan={8} style={{
                          padding: "8px 12px 4px",
                          backgroundColor: "var(--theme-bg-page)",
                          borderBottom: "1px solid var(--theme-border-subtle)",
                          fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)",
                          letterSpacing: "0.04em", textTransform: "uppercase",
                          position: "sticky", top: "38px", zIndex: 1,
                        }}>
                          {group.label}
                        </td>
                      </tr>

                      {/* Entry rows */}
                      {group.rows.map((entry) => {
                        const isSelected = selectedEntry?.id === entry.id;
                        const isVoid = entry.status === "void";
                        const isReversal = isReversalEntry(entry);
                        return (
                          <tr
                            key={entry.id}
                            onClick={() => setSelectedEntry(isSelected ? null : entry)}
                            style={{
                              borderBottom: "1px solid var(--theme-border-subtle)",
                              backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                              cursor: "pointer",
                              transition: "background-color 80ms ease",
                              opacity: isVoid ? 0.6 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--theme-state-hover)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--theme-bg-surface)";
                            }}
                          >
                            <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--theme-text-muted)", whiteSpace: "nowrap" }}>
                              {new Date(entry.entry_date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.entry_number}
                            </td>
                            <td style={{ padding: "10px 12px", overflow: "hidden" }}>
                              <SourceChip entry={entry} />
                            </td>
                            <td style={{ padding: "10px 12px", overflow: "hidden" }}>
                              <span style={{
                                fontSize: "12px", color: "var(--theme-text-primary)",
                                display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                textDecoration: isVoid ? "line-through" : "none",
                              }}>
                                {entry.description || "—"}
                              </span>
                              {entry.transaction_currency && entry.transaction_currency !== "PHP" && (
                                <span style={{ fontSize: "10px", color: "var(--theme-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  {entry.transaction_currency} @ {entry.exchange_rate ?? "—"}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: "12px", color: "var(--theme-text-muted)" }}>
                              {entry.lines?.length ?? 0}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                              {entry.total_debit > 0 ? PHP.format(entry.total_debit) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                              {entry.total_credit > 0 ? PHP.format(entry.total_credit) : "—"}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <StatusChip status={entry.status} isReversal={isReversal} />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loadingEntries && summary.count > 0 && (
            <div style={{
              flexShrink: 0, height: "44px",
              backgroundColor: "var(--theme-bg-surface)",
              borderTop: "1px solid var(--theme-border-default)",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "12px", padding: "0 24px",
            }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ height: "28px", width: "28px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--theme-border-default)", borderRadius: "5px", backgroundColor: page === 0 ? "var(--theme-bg-page)" : "var(--theme-bg-surface)", color: page === 0 ? "var(--neuron-ui-muted)" : "var(--theme-text-muted)", cursor: page === 0 ? "not-allowed" : "pointer" }}
              >
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                Page <strong style={{ color: "var(--theme-text-primary)" }}>{page + 1}</strong> of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ height: "28px", width: "28px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--theme-border-default)", borderRadius: "5px", backgroundColor: page >= totalPages - 1 ? "var(--theme-bg-page)" : "var(--theme-bg-surface)", color: page >= totalPages - 1 ? "var(--neuron-ui-muted)" : "var(--theme-text-muted)", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedEntry && (
          <JournalEntryDetailPanel
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
            onVoid={(e) => setVoidTarget(e)}
            onPosted={() => {
              setSelectedEntry(null);
              handleEntryCreated();
            }}
            canAct={canCreateJournal}
            highlightAccountId={filters.accountId || undefined}
          />
        )}
      </div>

      {/* ── Summary Bar ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: "44px",
        backgroundColor: "var(--theme-bg-surface)",
        borderTop: "1px solid var(--theme-border-default)",
        display: "flex", alignItems: "center",
        padding: "0 24px", gap: "24px",
      }}>
        <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
          {loadingSummary ? "Loading…" : `${summary.count} entries`}
        </span>
        <div style={{ width: "1px", height: "14px", backgroundColor: "var(--theme-border-default)" }} />
        <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
          Debits: <strong style={{ color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>{PHP.format(summary.totalDebit)}</strong>
        </span>
        <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
          Credits: <strong style={{ color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>{PHP.format(summary.totalCredit)}</strong>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {loadingSummary ? (
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--theme-text-muted)" }} />
          ) : isBalanced ? (
            <>
              <CheckCircle size={13} style={{ color: "var(--theme-status-success-fg)" }} />
              <span style={{ fontSize: "11px", color: "var(--theme-status-success-fg)", fontWeight: 600 }}>Balanced</span>
            </>
          ) : (
            <>
              <AlertTriangle size={13} style={{ color: "var(--theme-status-warning-fg)" }} />
              <span style={{ fontSize: "11px", color: "var(--theme-status-warning-fg)", fontWeight: 600 }}>
                Difference: {PHP.format(Math.abs(summary.totalDebit - summary.totalCredit))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Void Confirmation ────────────────────────────────────────────────── */}
      {voidTarget && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "var(--theme-overlay-backdrop, rgba(0,0,0,0.45))",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "var(--theme-bg-surface)", borderRadius: "10px",
            padding: "24px", maxWidth: "400px", width: "calc(100% - 32px)",
            border: "1px solid var(--theme-border-default)",
            boxShadow: "var(--elevation-3, 0 20px 40px rgba(0,0,0,0.15))",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "var(--theme-status-danger-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} style={{ color: "var(--theme-status-danger-fg)" }} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                  Void Journal Entry?
                </h3>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--theme-text-muted)", lineHeight: 1.5 }}>
                  <strong>{voidTarget.entry_number}</strong> — {PHP.format(voidTarget.total_debit)}
                </p>
              </div>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "var(--theme-text-muted)", lineHeight: 1.6, padding: "10px 12px", backgroundColor: "var(--theme-status-danger-bg)", borderRadius: "6px", border: "1px solid var(--theme-status-danger-border)" }}>
              This will permanently void this entry and record an automatic reversal. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setVoidTarget(null)}
                disabled={isVoiding}
                style={{ flex: 1, height: "36px", border: "1px solid var(--theme-border-default)", borderRadius: "7px", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleVoidConfirm}
                disabled={isVoiding}
                style={{ flex: 1, height: "36px", border: "none", borderRadius: "7px", backgroundColor: "var(--theme-status-danger-fg)", color: "var(--theme-text-inverse)", fontSize: "13px", fontWeight: 600, cursor: isVoiding ? "not-allowed" : "pointer", opacity: isVoiding ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                {isVoiding && <Loader2 size={13} className="animate-spin" />}
                {isVoiding ? "Voiding…" : "Void Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Filter application helper (shared between data + summary queries) ────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFiltersToQuery(query: any, f: Filters) {
  if (f.dateFrom) query = query.gte("entry_date", f.dateFrom);
  if (f.dateTo)   query = query.lte("entry_date", f.dateTo + "T23:59:59");
  if (f.sourceType === "evoucher")   query = query.not("evoucher_id",   "is", null);
  else if (f.sourceType === "invoice")    query = query.not("invoice_id",    "is", null);
  else if (f.sourceType === "collection") query = query.not("collection_id", "is", null);
  else if (f.sourceType === "manual") {
    query = query.is("evoucher_id", null).is("invoice_id", null).is("collection_id", null).is("booking_id", null);
  }
  if (f.statusFilter !== "all") query = query.eq("status", f.statusFilter);
  if (f.currency === "PHP") {
    // PHP-only: include legacy rows where transaction_currency is null.
    query = query.or("transaction_currency.eq.PHP,transaction_currency.is.null");
  } else if (f.currency === "USD") {
    query = query.eq("transaction_currency", "USD");
  }
  if (f.accountId) query = query.contains("lines", [{ account_id: f.accountId }]);
  if (f.search.trim()) {
    const s = f.search.trim();
    query = query.or(`entry_number.ilike.%${s}%,description.ilike.%${s}%,reference.ilike.%${s}%`);
  }
  return query;
}
