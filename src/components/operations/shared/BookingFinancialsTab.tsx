/**
 * BookingFinancialsTab — per-booking financial dashboard
 *
 * Cumulative, all-time financial snapshot for a single booking: revenue, cost,
 * gross profit/margin, collections + collection rate, and AR aging. Read-only.
 *
 * Reuses the canonical accounting math (`calculateFinancialTotals`) so the
 * numbers reconcile to the peso with the booking's own Billings / Invoices /
 * Collections tabs, and reuses `ReceivablesAgingBar` from the company dashboard
 * for the aging buckets + drill-down.
 *
 * Deliberately does NOT use VitalSignsStrip (its period-over-period deltas are
 * meaningless for a cumulative booking view) or AttentionPanel (it fetches
 * Accounting-department-wide tickets, which would leak into a booking scope).
 */

import { useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Banknote,
  Receipt,
  Clock,
  AlertTriangle,
  FileWarning,
  CheckCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { calculateFinancialTotals } from "../../../utils/financialCalculations";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";
import { formatMoney } from "../../../utils/accountingCurrency";
import { ReceivablesAgingBar } from "../../accounting/dashboard/ReceivablesAgingBar";

type SiblingTab = "billings" | "invoices" | "collections" | "expenses";

interface BookingFinancialsTabProps {
  /** Booking-scoped billing line items (already filtered to this booking). */
  billingItems: any[];
  /** Booking-scoped invoices. */
  invoices: any[];
  /** Booking-scoped collections. */
  collections: any[];
  /** Booking-scoped expenses (evoucher-derived). */
  expenses: any[];
  isLoading?: boolean;
  /** Jump to a sibling tab (KPI / aging click-through). */
  onNavigateTab?: (tab: SiblingTab) => void;
}

const fmt = (n: number) => formatMoney(n, "PHP");

function agingDays(inv: any): number {
  const due = inv.due_date ? new Date(inv.due_date) : null;
  if (!due) return 0;
  return Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
}

// ── KPI tile ──

interface Kpi {
  label: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
  /** Dark green hero treatment (used for gross profit). */
  hero?: boolean;
  /** Loss state — red hero. */
  loss?: boolean;
  onClick?: () => void;
  clickHint?: string;
}

function KpiTile({ kpi, big }: { kpi: Kpi; big?: boolean }) {
  const Icon = kpi.icon;
  const isHero = kpi.hero;
  const isLoss = kpi.loss;
  const clickable = !!kpi.onClick;

  const bg = isLoss ? "#9F2323" : isHero ? "var(--theme-action-primary-bg)" : "var(--theme-bg-surface)";
  const border = isLoss ? "#9F2323" : isHero ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)";
  const labelColor = isHero || isLoss ? "rgba(255,255,255,0.6)" : "var(--theme-text-muted)";
  const valueColor = isHero || isLoss ? "#FFFFFF" : "var(--theme-text-primary)";
  const subColor = isHero || isLoss ? "rgba(255,255,255,0.55)" : "var(--theme-text-muted)";
  const iconBg = isHero || isLoss ? "rgba(255,255,255,0.12)" : "var(--theme-status-success-bg)";
  const iconColor = isLoss ? "#FCA5A5" : isHero ? "#5EEAD4" : "var(--theme-action-primary-bg)";

  return (
    <div
      className={`rounded-xl flex flex-col justify-between transition-all duration-200 ${big ? "p-6" : "p-5"}`}
      style={{
        border: `1px solid ${border}`,
        background: bg,
        minHeight: big ? "148px" : "112px",
        cursor: clickable ? "pointer" : "default",
      }}
      onClick={kpi.onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && kpi.onClick?.() : undefined}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={`font-semibold uppercase tracking-wider ${big ? "text-[12px]" : "text-[11px]"}`}
          style={{ color: labelColor }}
        >
          {kpi.label}
        </span>
        <div
          className={`rounded-lg flex items-center justify-center ${big ? "w-8 h-8" : "w-7 h-7"}`}
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={big ? 16 : 14} style={{ color: iconColor }} />
        </div>
      </div>

      <div
        className={`font-bold leading-none ${big ? "text-[36px]" : "text-[22px]"}`}
        style={{ color: valueColor, letterSpacing: big ? "-1px" : "-0.5px" }}
      >
        {kpi.value}
      </div>

      <div className="flex items-center gap-2 mt-2">
        {kpi.subtext && (
          <span className={big ? "text-[12px]" : "text-[11px]"} style={{ color: subColor }}>
            {kpi.subtext}
          </span>
        )}
        {clickable && kpi.clickHint && (
          <span
            className={`font-medium ml-auto ${big ? "text-[11px]" : "text-[10px]"}`}
            style={{ color: isHero || isLoss ? "rgba(255,255,255,0.7)" : "var(--theme-action-primary-bg)" }}
          >
            {kpi.clickHint}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cost vs Revenue vs Profit breakdown ──

function ProfitBreakdown({ revenue, cost, profit }: { revenue: number; cost: number; profit: number }) {
  const max = Math.max(revenue, cost, Math.abs(profit), 1);
  const rows = [
    { label: "Revenue", value: revenue, color: "var(--theme-action-primary-bg)" },
    { label: "Cost", value: cost, color: "var(--theme-status-danger-fg)" },
    {
      label: "Gross Profit",
      value: profit,
      color: profit >= 0 ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)",
    },
  ];

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--theme-text-muted)" }}>
        Cost vs Revenue vs Profit
      </h3>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const pct = (Math.abs(r.value) / max) * 100;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="text-[11px] font-medium flex-shrink-0 text-right" style={{ width: "84px", color: "var(--theme-text-muted)" }}>
                {r.label}
              </span>
              <div className="flex-1 h-[18px] rounded overflow-hidden" style={{ background: "var(--theme-bg-surface-subtle)" }}>
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: r.color, opacity: 0.85 }}
                />
              </div>
              <span className="text-[12px] font-bold tabular-nums flex-shrink-0 text-right" style={{ width: "110px", color: "var(--theme-text-primary)" }}>
                {fmt(r.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Collection rate card ──

function CollectionRateCard({ rate, collected, invoiced }: { rate: number; collected: number; invoiced: number }) {
  const capped = Math.max(0, Math.min(100, rate));
  const color =
    rate >= 80 ? "var(--theme-status-success-fg)" : rate >= 50 ? "var(--theme-status-warning-fg)" : "var(--theme-status-danger-fg)";

  return (
    <div
      className="rounded-xl px-5 py-4 flex flex-col justify-between"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--theme-text-muted)" }}>
        Collection Rate
      </h3>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-[32px] font-bold leading-none tabular-nums" style={{ color }}>
          {invoiced > 0 ? `${Math.round(rate)}%` : "—"}
        </span>
      </div>
      <div className="h-[10px] rounded-full overflow-hidden mb-2" style={{ background: "var(--theme-bg-surface-subtle)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${capped}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
        {fmt(collected)} collected of {fmt(invoiced)} invoiced
      </span>
    </div>
  );
}

// ── Booking-scoped action items (self-contained, no global fetch) ──

interface ActionItem {
  severity: "danger" | "warning" | "success";
  icon: LucideIcon;
  label: string;
  detail: string;
  onClick?: () => void;
}

function ActionItems({ items }: { items: ActionItem[] }) {
  const COLORS: Record<string, { dot: string; bg: string }> = {
    danger: { dot: "var(--theme-status-danger-fg)", bg: "var(--theme-status-danger-bg)" },
    warning: { dot: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" },
    success: { dot: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      <div
        className="px-5 py-3 flex items-center gap-2.5"
        style={{ borderBottom: "1px solid var(--theme-border-default)", background: "var(--neuron-pill-inactive-bg)" }}
      >
        <AlertTriangle size={14} style={{ color: "var(--theme-text-muted)" }} />
        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
          Action Items
        </span>
      </div>
      {items.map((item, idx) => {
        const c = COLORS[item.severity];
        const Icon = item.icon;
        const clickable = !!item.onClick;
        return (
          <div
            key={idx}
            className={`group px-5 py-3 flex items-center gap-3 transition-colors ${clickable ? "cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)]" : ""}`}
            style={{ borderBottom: idx < items.length - 1 ? "1px solid var(--theme-border-subtle)" : "none" }}
            onClick={item.onClick}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: c.bg }}>
              <Icon size={14} style={{ color: c.dot }} />
            </div>
            <span className="text-[13px] font-medium flex-1" style={{ color: "var(--theme-text-primary)" }}>
              {item.label}
            </span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: c.dot }}>
              {item.detail}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──

export function BookingFinancialsTab({
  billingItems,
  invoices,
  collections,
  expenses,
  isLoading,
  onNavigateTab,
}: BookingFinancialsTabProps) {
  const totals = useMemo(
    () => calculateFinancialTotals(invoices, billingItems, expenses, collections),
    [invoices, billingItems, expenses, collections],
  );

  const revenue = totals.bookedCharges;
  const cost = totals.directCost;
  const profit = totals.grossProfit;
  const margin = totals.grossMargin;
  const collected = totals.collectedAmount;
  const invoiced = totals.invoicedAmount;
  const outstanding = totals.outstandingAmount;
  const overdue = totals.overdueAmount;
  const collectionRate = invoiced > 0 ? (collected / invoiced) * 100 : 0;

  // Unbilled billing items (services rendered but not yet invoiced) for the aging bar.
  const unbilledItems = useMemo(
    () => billingItems.filter((b) => String(b.status || "").toLowerCase() === "unbilled"),
    [billingItems],
  );

  // Booking-level DSO proxy: balance-weighted average days past due of open invoices.
  const dso = useMemo(() => {
    let bal = 0;
    let weighted = 0;
    for (const inv of invoices) {
      const b = calculateInvoiceBalance(inv, collections).balanceBase;
      if (b > 0.01) {
        bal += b;
        weighted += b * Math.max(0, agingDays(inv));
      }
    }
    return bal > 0 ? weighted / bal : 0;
  }, [invoices, collections]);

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    if (overdue > 0.01) {
      items.push({
        severity: "danger",
        icon: Clock,
        label: "Overdue receivables",
        detail: fmt(overdue),
        onClick: () => onNavigateTab?.("invoices"),
      });
    }
    const unbilledTotal = unbilledItems.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    if (unbilledTotal > 0.01) {
      items.push({
        severity: "warning",
        icon: FileWarning,
        label: "Unbilled charges — not yet invoiced",
        detail: fmt(unbilledTotal),
        onClick: () => onNavigateTab?.("billings"),
      });
    }
    if (invoiced > 0.01 && collectionRate < 50) {
      items.push({
        severity: "warning",
        icon: Banknote,
        label: "Low collection rate",
        detail: `${Math.round(collectionRate)}%`,
        onClick: () => onNavigateTab?.("collections"),
      });
    }
    if (profit < 0) {
      items.push({
        severity: "danger",
        icon: TrendingDown,
        label: "Booking is running at a loss",
        detail: fmt(profit),
      });
    }
    if (items.length === 0) {
      items.push({ severity: "success", icon: CheckCircle, label: "No outstanding financial issues", detail: "All clear" });
    }
    return items;
  }, [overdue, unbilledItems, invoiced, collectionRate, profit, onNavigateTab]);

  if (isLoading) {
    return (
      <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl h-[148px] animate-pulse" style={{ background: "var(--theme-bg-surface-subtle)" }} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl h-[112px] animate-pulse" style={{ background: "var(--theme-bg-surface-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  const heroKpis: Kpi[] = [
    { label: "Revenue", value: fmt(revenue), subtext: `${fmt(invoiced)} invoiced · ${fmt(totals.unbilledCharges)} unbilled`, icon: DollarSign },
    {
      label: "Gross Profit",
      value: fmt(profit),
      subtext: `${margin >= 0 ? "" : "−"}${Math.abs(Math.round(margin))}% margin`,
      icon: profit >= 0 ? TrendingUp : TrendingDown,
      hero: profit >= 0,
      loss: profit < 0,
    },
  ];

  const compactKpis: Kpi[] = [
    { label: "Direct Cost", value: fmt(cost), subtext: "Approved expenses", icon: Receipt, onClick: () => onNavigateTab?.("expenses"), clickHint: "View →" },
    { label: "Collected", value: fmt(collected), subtext: `${invoiced > 0 ? Math.round(collectionRate) : 0}% of invoiced`, icon: Banknote, onClick: () => onNavigateTab?.("collections"), clickHint: "View →" },
    { label: "Outstanding AR", value: fmt(outstanding), subtext: overdue > 0.01 ? `${fmt(overdue)} overdue` : "None overdue", icon: Clock, onClick: () => onNavigateTab?.("invoices"), clickHint: "View →" },
  ];

  return (
    <div className="flex flex-col gap-4 bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
      {/* KPI strip — 2 hero + 3 compact */}
      <div className="grid grid-cols-2 gap-4">
        {heroKpis.map((k) => (
          <KpiTile key={k.label} kpi={k} big />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {compactKpis.map((k) => (
          <KpiTile key={k.label} kpi={k} />
        ))}
      </div>

      {/* Breakdown + collection rate */}
      <div className="grid grid-cols-2 gap-4">
        <ProfitBreakdown revenue={revenue} cost={cost} profit={profit} />
        <CollectionRateCard rate={collectionRate} collected={collected} invoiced={invoiced} />
      </div>

      {/* AR aging — reused from the company dashboard */}
      <ReceivablesAgingBar
        invoices={invoices}
        collections={collections}
        dso={dso}
        unbilledItems={unbilledItems}
        onBucketClick={() => onNavigateTab?.("invoices")}
        onNavigate={() => onNavigateTab?.("invoices")}
        onUnbilledClick={() => onNavigateTab?.("billings")}
      />

      {/* Booking-scoped action items */}
      <ActionItems items={actionItems} />
    </div>
  );
}
