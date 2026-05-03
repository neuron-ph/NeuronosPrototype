/**
 * FinancialDashboard — Company-wide financial dashboard
 *
 * Replaces the old ProjectFinancialOverview + AgingStrip in the Financials
 * dashboard tab. 6-zone layout with progressive disclosure.
 *
 * Receives raw data from FinancialsModule, computes all derived metrics here.
 */

import { useMemo, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Banknote,
  FileStack,
  Clock,
  AlertTriangle,
  FileWarning,
  CheckCircle,
} from "lucide-react";
import type { DateScope } from "../aggregate/types";
import { ScopeBar } from "../aggregate/ScopeBar";
import { createDateScope, isInScope, formatCurrencyCompact } from "../aggregate/types";
import { VitalSignsStrip } from "./VitalSignsStrip";
import type { VitalSign } from "./VitalSignsStrip";
import { AttentionPanel } from "./AttentionPanel";
import type { AttentionItem } from "./AttentionPanel";
import { ReceivablesAgingBar } from "./ReceivablesAgingBar";
import { PLTrendCard } from "./PLTrendCard";
import { toast } from "sonner@2.0.3";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";
import { isCollectionAppliedToInvoice } from "../../../utils/collectionResolution";
import { pickReportingAmount, formatMoney } from "../../../utils/accountingCurrency";

interface FinancialDashboardProps {
  billingItems: any[];
  invoices: any[];
  collections: any[];
  expenses: any[];
  scope: DateScope;
  onScopeChange: (scope: DateScope) => void;
  isLoading: boolean;
  /** Navigate to a specific Financials tab */
  onNavigateTab: (tab: "billings" | "invoices" | "collections" | "expenses") => void;
}

// ── Helpers ──

/** Create a "previous period" scope of the same duration, shifted back. */
function createPreviousScope(scope: DateScope): DateScope {
  const durationMs = scope.to.getTime() - scope.from.getTime();
  const prevTo = new Date(scope.from.getTime() - 1); // day before current from
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { preset: "custom", from: prevFrom, to: prevTo };
}

function getAgingDays(inv: any): number {
  const dueDate = inv.due_date ? new Date(inv.due_date) : null;
  if (!dueDate) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
}

const fmt = (amount: number) => formatMoney(amount, "PHP");

function normalizeRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectContainerRefs(row: any): string[] {
  const projectRefs = [
    normalizeRef(row.project_number),
    normalizeRef(row.projectNumber),
    ...(Array.isArray(row.project_refs) ? row.project_refs.map(normalizeRef) : []),
    ...(Array.isArray(row.project_numbers) ? row.project_numbers.map(normalizeRef) : []),
  ].filter((entry): entry is string => Boolean(entry));

  if (projectRefs.length > 0) return [...new Set(projectRefs)];

  const contractRefs = [
    normalizeRef(row.contract_number),
    normalizeRef(row.contractNumber),
    normalizeRef(row.quotation_number),
    normalizeRef(row.quote_number),
    ...(Array.isArray(row.contract_refs) ? row.contract_refs.map(normalizeRef) : []),
    ...(Array.isArray(row.contract_ids) ? row.contract_ids.map(normalizeRef) : []),
  ].filter((entry): entry is string => Boolean(entry));

  if (contractRefs.length > 0) {
    return [...new Set(contractRefs.map((ref) => `Contract: ${ref}`))];
  }

  return [];
}

export function FinancialDashboard({
  billingItems,
  invoices,
  collections,
  expenses,
  scope,
  onScopeChange,
  isLoading,
  onNavigateTab,
}: FinancialDashboardProps) {
  const previousScope = useMemo(() => createPreviousScope(scope), [scope]);

  // ── Scope-filtered data ──
  const scopedInvoices = useMemo(
    () => invoices.filter((inv: any) => isInScope(inv.invoice_date || inv.created_at, scope)),
    [invoices, scope]
  );
  const scopedBillings = useMemo(
    () => billingItems.filter((b: any) => isInScope(b.created_at, scope)),
    [billingItems, scope]
  );
  const scopedCollections = useMemo(
    () => collections.filter((c: any) => isInScope(c.collection_date || c.created_at, scope)),
    [collections, scope]
  );
  const scopedExpenses = useMemo(
    () => expenses.filter((e: any) => isInScope(e.expenseDate || e.createdAt, scope)),
    [expenses, scope]
  );

  // ── Previous-period data ──
  const prevInvoices = useMemo(
    () => invoices.filter((inv: any) => isInScope(inv.invoice_date || inv.created_at, previousScope)),
    [invoices, previousScope]
  );
  const prevCollections = useMemo(
    () => collections.filter((c: any) => isInScope(c.collection_date || c.created_at, previousScope)),
    [collections, previousScope]
  );
  const prevExpenses = useMemo(
    () => expenses.filter((e: any) => isInScope(e.expenseDate || e.createdAt, previousScope)),
    [expenses, previousScope]
  );
  const prevBillings = useMemo(
    () => billingItems.filter((b: any) => isInScope(b.created_at, previousScope)),
    [billingItems, previousScope]
  );

  // ── Computed metrics ──

  // Revenue = invoiced + unbilled
  const invoicedRevenue = useMemo(
    () => scopedInvoices.reduce((s, inv: any) => s + pickReportingAmount(inv), 0),
    [scopedInvoices]
  );
  const unbilledRevenue = useMemo(
    () =>
      scopedBillings
        .filter((b: any) => (b.status || "").toLowerCase() === "unbilled")
        .reduce((s, b: any) => s + pickReportingAmount(b), 0),
    [scopedBillings]
  );
  const netRevenue = invoicedRevenue + unbilledRevenue;

  const prevInvoicedRevenue = useMemo(
    () => prevInvoices.reduce((s, inv: any) => s + pickReportingAmount(inv), 0),
    [prevInvoices]
  );
  const prevUnbilledRevenue = useMemo(
    () =>
      prevBillings
        .filter((b: any) => (b.status || "").toLowerCase() === "unbilled")
        .reduce((s, b: any) => s + pickReportingAmount(b), 0),
    [prevBillings]
  );
  const prevNetRevenue = prevInvoicedRevenue + prevUnbilledRevenue;

  // Expenses
  const totalExpenses = useMemo(
    () => scopedExpenses.reduce((s, e: any) => s + pickReportingAmount(e), 0),
    [scopedExpenses]
  );
  const prevTotalExpenses = useMemo(
    () => prevExpenses.reduce((s, e: any) => s + pickReportingAmount(e), 0),
    [prevExpenses]
  );

  // Profit
  const netProfit = netRevenue - totalExpenses;
  const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
  const prevNetProfit = prevNetRevenue - prevTotalExpenses;

  // Cash Collected
  const totalCollected = useMemo(
    () => scopedCollections.filter((c: any) => isCollectionAppliedToInvoice(c)).reduce((s, c: any) => s + pickReportingAmount(c), 0),
    [scopedCollections]
  );
  const prevTotalCollected = useMemo(
    () => prevCollections.filter((c: any) => isCollectionAppliedToInvoice(c)).reduce((s, c: any) => s + pickReportingAmount(c), 0),
    [prevCollections]
  );
  const collectionRate = invoicedRevenue > 0 ? (totalCollected / invoicedRevenue) * 100 : 0;

  // Outstanding AR (across ALL invoices, not scope-filtered — it's a balance sheet metric)
  const outstandingAR = useMemo(() => {
    return invoices
      .map((inv: any) => calculateInvoiceBalance(inv, collections).balanceBase)
      .filter((balance: number) => balance > 0.01)
      .reduce(
        (s, balance: number) => s + balance,
        0
      );
  }, [invoices, collections]);

  // DSO = (Outstanding AR / Net Revenue) * Days in period
  const daysInPeriod = useMemo(() => {
    const ms = scope.to.getTime() - scope.from.getTime();
    return Math.max(Math.ceil(ms / (1000 * 60 * 60 * 24)), 1);
  }, [scope]);
  const dso = netRevenue > 0 ? Math.round((outstandingAR / netRevenue) * daysInPeriod) : 0;

  // ── Zone 1: Vital Signs ──

  const vitalSigns: VitalSign[] = useMemo(
    () => [
      {
        label: "Net Revenue",
        value: formatCurrencyCompact(netRevenue),
        rawValue: netRevenue,
        previousValue: prevNetRevenue,
        subtext: `vs prev period`,
        icon: DollarSign,
        polarity: "positive" as const,
        hero: true,
        onCardClick: () => onNavigateTab("billings"),
        clickHint: "View billings →",
      },
      {
        label: netProfit >= 0 ? "Net Profit" : "Net Loss",
        value: formatCurrencyCompact(netProfit),
        rawValue: netProfit,
        previousValue: prevNetProfit,
        subtext: `${profitMargin.toFixed(1)}% margin`,
        icon: TrendingUp,
        polarity: "positive" as const,
        hero: true,
        darkHero: true,
        onCardClick: () => onNavigateTab("billings"),
        clickHint: "View revenue & costs →",
      },
      {
        label: "Cash Collected",
        value: formatCurrencyCompact(totalCollected),
        rawValue: totalCollected,
        previousValue: prevTotalCollected,
        subtext: `${collectionRate.toFixed(0)}% of invoiced`,
        icon: Banknote,
        polarity: "positive" as const,
        onCardClick: () => onNavigateTab("collections"),
        clickHint: "View collections →",
      },
      {
        label: "Outstanding AR",
        value: formatCurrencyCompact(outstandingAR),
        rawValue: outstandingAR,
        previousValue: outstandingAR, // Balance sheet — no meaningful prev comparison
        subtext: `DSO: ${dso}d`,
        icon: FileStack,
        polarity: "negative" as const,
        onCardClick: () => onNavigateTab("invoices"),
        clickHint: "View unpaid invoices →",
      },
      {
        label: "Total Expenses",
        value: formatCurrencyCompact(totalExpenses),
        rawValue: totalExpenses,
        previousValue: prevTotalExpenses,
        subtext: `${scopedExpenses.length} expense${scopedExpenses.length !== 1 ? "s" : ""} this period`,
        icon: Clock,
        polarity: "negative" as const,
        onCardClick: () => onNavigateTab("expenses"),
        clickHint: "View expenses →",
      },
    ],
    [
      netRevenue, prevNetRevenue, netProfit, prevNetProfit, profitMargin,
      totalCollected, prevTotalCollected, collectionRate,
      outstandingAR, dso, totalExpenses, prevTotalExpenses, scopedExpenses.length,
      onNavigateTab,
    ]
  );

  // ── Zone 6: Attention Panel ──

  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];

    // 1. Overdue invoices (30+ days)
    const overdueInvoices = invoices.filter((inv: any) => {
      return calculateInvoiceBalance(inv, collections).balance > 0.01 && getAgingDays(inv) > 30;
    });
    const overdueAmount = overdueInvoices.reduce(
      (s, inv: any) => s + calculateInvoiceBalance(inv, collections).balance,
      0
    );
    if (overdueInvoices.length > 0) {
      // Find oldest overdue invoice for detail line
      const oldest = overdueInvoices.reduce((best: any, inv: any) => {
        const days = getAgingDays(inv);
        const bestDays = best ? getAgingDays(best) : 0;
        return days > bestDays ? inv : best;
      }, null);
      const oldestDays = oldest ? getAgingDays(oldest) : 0;
      const oldestNumber = oldest?.invoice_number || "Unknown";
      const oldestCustomer = (oldest?.customer_name || oldest?.customerName || "").trim() || "Unknown";

      items.push({
        severity: overdueAmount > 100000 ? "danger" : "warning",
        icon: AlertTriangle,
        label: `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? "s" : ""} overdue 30+ days`,
        detail: fmt(overdueAmount),
        detailLine: `Oldest: ${oldestNumber} — ${oldestCustomer} — ${oldestDays}d overdue`,
        actionLabel: "Follow Up",
        onAction: () => onNavigateTab("invoices"),
        dismissKey: "overdue-invoices",
      });
    }

    // 2. Unbilled charges (revenue leakage)
    const unbilledItems = billingItems.filter(
      (b: any) => (b.status || "").toLowerCase() === "unbilled"
    );
    const unbilledTotal = unbilledItems.reduce(
      (s, b: any) => s + (Number(b.amount) || 0),
      0
    );
    if (unbilledItems.length > 0) {
      // Find largest unbilled booking for detail line
      const bookingMap = new Map<string, { label: string; customer: string; amount: number }>();
      for (const b of unbilledItems) {
        const bid = b.booking_id || b.bookingId || "unknown";
        const label = b.booking_number || b.bookingNumber || "—";
        const existing = bookingMap.get(bid);
        const amt = Number(b.amount) || 0;
        const customer = (b.customer_name || b.customerName || "").trim() || "Unknown";
        if (existing) {
          existing.amount += amt;
        } else {
          bookingMap.set(bid, { label, customer, amount: amt });
        }
      }
      const largest = Array.from(bookingMap.values()).sort((a, b) => b.amount - a.amount)[0];

      items.push({
        severity: unbilledTotal > 50000 ? "warning" : "info",
        icon: FileWarning,
        label: `${unbilledItems.length} unbilled charge${unbilledItems.length > 1 ? "s" : ""} — potential revenue leakage`,
        detail: fmt(unbilledTotal),
        detailLine: largest ? `Largest: ${largest.label} — ${fmt(largest.amount)} — ${largest.customer}` : undefined,
        actionLabel: "Create Invoice",
        onAction: () => onNavigateTab("billings"),
        dismissKey: "unbilled-charges",
      });
    }

    // 3. Collection rate
    const collRate = invoicedRevenue > 0 ? (totalCollected / invoicedRevenue) * 100 : 100;
    if (collRate >= 80) {
      items.push({
        severity: "success",
        icon: CheckCircle,
        label: `Collection rate: ${collRate.toFixed(0)}%`,
        detail: "Above 80% target",
      });
    } else {
      const uncollected = invoicedRevenue - totalCollected;
      const unpaidCount = invoices.filter((inv: any) => {
        return calculateInvoiceBalance(inv, collections).balance > 0.01;
      }).length;

      items.push({
        severity: collRate < 50 ? "danger" : "warning",
        icon: Banknote,
        label: `Collection rate: ${collRate.toFixed(0)}% — below 80% target`,
        detail: fmt(uncollected) + " uncollected",
        detailLine: `${fmt(uncollected)} uncollected from ${unpaidCount} invoice${unpaidCount !== 1 ? "s" : ""}`,
        actionLabel: "View Uncollected",
        onAction: () => onNavigateTab("collections"),
        dismissKey: "low-collection-rate",
      });
    }

    return items;
  }, [
    invoices, billingItems, collections,
    invoicedRevenue, totalCollected, onNavigateTab,
  ]);

  // ── Contextual Summary ──
  const summaryLine = useMemo(() => {
    const containerSet = new Set<string>();
    const customerSet = new Set<string>();

    for (const b of scopedBillings) {
      collectContainerRefs(b).forEach((ref) => containerSet.add(ref));
      const cn = (b.customer_name || b.customerName || "").trim();
      if (cn && cn !== "Unknown Customer") customerSet.add(cn);
    }
    for (const inv of scopedInvoices) {
      collectContainerRefs(inv).forEach((ref) => containerSet.add(ref));
      const cn = (inv.customer_name || inv.customerName || "").trim();
      if (cn && cn !== "Unknown Customer") customerSet.add(cn);
    }

    const parts: string[] = [];
    parts.push(formatCurrencyCompact(netRevenue) + " revenue");
    if (containerSet.size > 0) parts.push(`${containerSet.size} container${containerSet.size !== 1 ? "s" : ""}`);
    if (customerSet.size > 0) parts.push(`${customerSet.size} customer${customerSet.size !== 1 ? "s" : ""}`);
    if (collectionRate > 0) parts.push(`${collectionRate.toFixed(0)}% collection rate`);

    return `This period: ${parts.join(" · ")}`;
  }, [scopedBillings, scopedInvoices, netRevenue, collectionRate]);

  return (
    <div className="flex flex-col gap-6">
      {/* Scope selector + summary inline */}
      <div className="flex items-center justify-between gap-4">
        <ScopeBar scope={scope} onScopeChange={onScopeChange} standalone />
        <p
          className="text-[13px] shrink-0"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {summaryLine}
        </p>
      </div>

      {/* Zone 1: Vital Signs */}
      <VitalSignsStrip signs={vitalSigns} isLoading={isLoading} />

      {/* Zone 2: Attention Panel (promoted from Zone 6 — actionable items above the fold) */}
      <AttentionPanel items={attentionItems} />

      {/* Zone 3: P&L Trend (unified Revenue + Expenses + Collections) */}
      <PLTrendCard
        invoices={invoices}
        expenses={expenses}
        collections={collections}
        invoicedRevenue={invoicedRevenue}
        totalCollected={totalCollected}
        outstandingAR={outstandingAR}
        totalExpenses={totalExpenses}
      />

      {/* Zone 4: Receivables Aging */}
      <ReceivablesAgingBar
        invoices={invoices}
        collections={collections}
        dso={dso}
        onBucketClick={() => onNavigateTab("invoices")}
        onNavigate={() => onNavigateTab("invoices")}
        previousInvoices={prevInvoices}
        previousCollections={prevCollections}
        unbilledItems={billingItems.filter(
          (b: any) => (b.status || "").toLowerCase() === "unbilled"
        )}
        onUnbilledClick={() => onNavigateTab("billings")}
        onRecordPayment={() => onNavigateTab("collections")}
        onSendReminder={(inv: any) => {
          const invNumber = inv.invoice_number || "Invoice";
          const customer = (inv.customer_name || inv.customerName || "").trim() || "Customer";
          const balance = calculateInvoiceBalance(inv, collections).balance;
          const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
          const message = `Hi, this is a friendly reminder regarding ${invNumber} for ${fmt(balance)} due ${dueDate}. Please arrange payment at your earliest convenience. Thank you! — ${customer}`;
          navigator.clipboard.writeText(message).then(
            () => toast.success("Reminder copied to clipboard"),
            () => toast.error("Failed to copy reminder")
          );
        }}
        onCreateInvoice={() => onNavigateTab("billings")}
      />
    </div>
  );
}
