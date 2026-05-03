/**
 * ReceivablesAgingBar — Zone 4 of the Financial Dashboard
 *
 * Horizontal row-based aging chart: each bucket gets its own row with a
 * proportional bar, amount, count, and percentage. Replaces the old stacked
 * bar + 5 legend cards, which were unreadable when one bucket dominated.
 *
 * Features:
 *  - "As of today" date chip (scope-independence clarity)
 *  - Prominent total outstanding callout
 *  - DSO severity coloring (teal/amber/red)
 *  - Click any row → inline drill-down expands below it (accordion)
 *  - Trend arrows from previous-period comparison
 */

import { useState, useMemo } from "react";
import { ChevronRight, Calendar } from "lucide-react";
import { formatCurrencyCompact } from "../aggregate/types";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";
import { formatMoney } from "../../../utils/accountingCurrency";

interface AgingSegment {
  label: string;
  days: string;
  amount: number;
  count: number;
  color: string;
  bgLight: string;
  invoices: any[];
}

interface ReceivablesAgingBarProps {
  invoices: any[];
  collections?: any[];
  dso: number;
  onBucketClick: (bucketLabel: string | null) => void;
  /** Optional "View →" navigation */
  onNavigate?: () => void;
  /** Previous-period invoices for trend indicators */
  previousInvoices?: any[];
  previousCollections?: any[];
  /** Unbilled billing items (services rendered but not yet invoiced) */
  unbilledItems?: any[];
  /** Navigate to billings tab when unbilled row is clicked */
  onUnbilledClick?: () => void;
  /** Record payment against an invoice */
  onRecordPayment?: (invoiceId: string) => void;
  /** Send payment reminder for an invoice */
  onSendReminder?: (invoice: any) => void;
  /** Create invoice from an unbilled booking */
  onCreateInvoice?: (bookingId: string) => void;
}

const AGING_CONFIG: { label: string; days: string; min: number; max: number; color: string; bgLight: string }[] = [
  { label: "Current",  days: "Not yet due",   min: -Infinity, max: 0,   color: "var(--theme-action-primary-bg)", bgLight: "var(--theme-status-success-bg)" },
  { label: "1–30d",    days: "1–30 days",      min: 1,         max: 30,  color: "var(--theme-status-warning-fg)", bgLight: "var(--theme-status-warning-bg)" },
  { label: "31–60d",   days: "31–60 days",     min: 31,        max: 60,  color: "var(--theme-status-warning-fg)", bgLight: "var(--theme-bg-surface-subtle)" },
  { label: "61–90d",   days: "61–90 days",     min: 61,        max: 90,  color: "var(--theme-status-danger-fg)", bgLight: "var(--theme-status-danger-bg)" },
  { label: "90d+",     days: "Over 90 days",   min: 91,        max: Infinity, color: "var(--theme-status-danger-fg)", bgLight: "var(--theme-status-danger-bg)" },
];

function getAgingDaysForInvoice(inv: any): number {
  const dueDate = inv.due_date ? new Date(inv.due_date) : null;
  if (!dueDate) return 0;
  return Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getBalance(inv: any, collections: any[] = []): number {
  return calculateInvoiceBalance(inv, collections).balance;
}

/** DSO severity: teal ≤30, amber 31–60, red 61+ */
function getDsoStyle(dso: number): { bg: string; color: string } {
  if (dso <= 30) return { bg: "var(--theme-status-success-bg)", color: "var(--theme-action-primary-bg)" };
  if (dso <= 60) return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" };
  return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" };
}

/** Format date as "Mar 8, 2026" */
function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format PHP currency for drill-down rows */
const fmtPHP = (amount: number) => formatMoney(amount, "PHP");

// ── Inline Drill-Down Panel ──

function InvoiceDrillDown({
  segment,
  onViewAll,
  onRecordPayment,
  onSendReminder,
}: {
  segment: AgingSegment;
  onViewAll: () => void;
  onRecordPayment?: (invoiceId: string) => void;
  onSendReminder?: (invoice: any) => void;
}) {
  const MAX_ROWS = 5;
  const sorted = useMemo(
    () => [...segment.invoices].sort((a, b) => getBalance(b) - getBalance(a)),
    [segment.invoices]
  );
  const displayed = sorted.slice(0, MAX_ROWS);
  const remaining = sorted.length - MAX_ROWS;

  return (
    <div
      className="rounded-lg overflow-hidden ml-[88px]"
      style={{ border: `1px solid ${segment.color}25`, background: segment.bgLight }}
    >
      {/* Invoice rows */}
      <div className="divide-y" style={{ borderColor: `${segment.color}15` }}>
        {displayed.map((inv, idx) => {
          const balance = getBalance(inv);
          const agingDays = getAgingDaysForInvoice(inv);
          const invNumber = inv.invoice_number || `INV-${idx + 1}`;
          const customer = (inv.customer_name || inv.customerName || "").trim() || "Unknown Customer";
          const dueDate = inv.due_date ? new Date(inv.due_date) : null;

          return (
            <div
              key={inv.id || idx}
              className="px-4 py-2 flex items-center justify-between group/row hover:bg-[var(--theme-bg-surface)]/50 transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <span
                  className="text-[11px] font-semibold tabular-nums flex-shrink-0"
                  style={{ color: "var(--theme-text-primary)", minWidth: "90px" }}
                >
                  {invNumber}
                </span>
                <span
                  className="text-[11px] font-medium truncate"
                  style={{ color: "var(--theme-text-muted)", maxWidth: "200px" }}
                >
                  {customer}
                </span>
                {dueDate && (
                  <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "var(--theme-text-muted)" }}>
                    Due: {formatShortDate(dueDate)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {agingDays > 0 && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded tabular-nums"
                    style={{ backgroundColor: `${segment.color}15`, color: segment.color }}
                  >
                    {agingDays}d overdue
                  </span>
                )}
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  {fmtPHP(balance)}
                </span>
                {/* Micro-actions — appear on row hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
                  {onRecordPayment && (
                    <button
                      className="px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface)]/80"
                      style={{ color: "var(--theme-action-primary-bg)", border: "1px solid var(--theme-border-default)" }}
                      onClick={(e) => { e.stopPropagation(); onRecordPayment(inv.id || invNumber); }}
                    >
                      Record Payment
                    </button>
                  )}
                  {onSendReminder && (
                    <button
                      className="px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface)]/80"
                      style={{ color: "var(--theme-action-primary-bg)", border: "1px solid var(--theme-border-default)" }}
                      onClick={(e) => { e.stopPropagation(); onSendReminder(inv); }}
                    >
                      Send Reminder
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* "More" footer */}
      {remaining > 0 && (
        <div className="px-4 py-1.5 text-center" style={{ borderTop: `1px solid ${segment.color}15` }}>
          <button
            className="text-[10px] font-medium cursor-pointer hover:underline"
            style={{ color: segment.color }}
            onClick={onViewAll}
          >
            +{remaining} more — View all in Invoices →
          </button>
        </div>
      )}

      {/* Always show "View all" if only a few */}
      {remaining <= 0 && segment.count > 0 && (
        <div className="px-4 py-1.5 text-right" style={{ borderTop: `1px solid ${segment.color}15` }}>
          <button
            className="text-[10px] font-medium cursor-pointer hover:underline"
            style={{ color: segment.color }}
            onClick={onViewAll}
          >
            View all in Invoices →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Unbilled Drill-Down Panel ──

interface UnbilledBooking {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  unbilledAmount: number;
  itemCount: number;
}

/** Check if an ID looks like a project number (not a booking) */
function isProjectId(id: string): boolean {
  const upper = id.toUpperCase();
  return upper.startsWith("PROJ-") || upper.startsWith("PRJ-");
}

/** Group unbilled billing items by booking, aggregating amounts.
 *  Excludes items that only have a project number (no real booking link) —
 *  projects are containers, billings are made from bookings. */
function groupByBooking(items: any[]): UnbilledBooking[] {
  const map = new Map<string, UnbilledBooking>();
  for (const item of items) {
    // Use the real booking_id; skip if it's actually a project number fallback
    const rawBookingId = item.booking_id || item.bookingId || "";
    const projectNumber = item.project_number || item.projectNumber || "";

    // If booking_id equals project_number, the server enrichment fell back —
    // there's no real booking link. Also skip if booking_id looks like a project.
    let bid = rawBookingId;
    if (!bid || isProjectId(bid)) {
      // No real booking association — skip this item from the booking drill-down
      // (it will still count in the unbilled total bar, just won't appear in drill-down rows)
      continue;
    }

    const existing = map.get(bid);
    const amount = Number(item.amount) || 0;
    const customer = (item.customer_name || item.customerName || "").trim() || "Unknown Customer";
    const bookingNumber = item.booking_number || item.bookingNumber || "—";
    if (existing) {
      existing.unbilledAmount += amount;
      existing.itemCount += 1;
      if (existing.bookingNumber === "—" && bookingNumber !== "—") {
        existing.bookingNumber = bookingNumber;
      }
      if (existing.customerName === "Unknown Customer" && customer !== "Unknown Customer") {
        existing.customerName = customer;
      }
    } else {
      map.set(bid, {
        bookingId: bid,
        bookingNumber,
        customerName: customer,
        unbilledAmount: amount,
        itemCount: 1,
      });
    }
  }
  return Array.from(map.values());
}

function UnbilledDrillDown({
  items,
  color,
  bgLight,
  onViewAll,
  onCreateInvoice,
}: {
  items: any[];
  color: string;
  bgLight: string;
  onViewAll: () => void;
  onCreateInvoice?: (bookingId: string) => void;
}) {
  const MAX_ROWS = 5;
  const bookings = useMemo(
    () => groupByBooking(items).sort((a, b) => b.unbilledAmount - a.unbilledAmount),
    [items]
  );
  const displayed = bookings.slice(0, MAX_ROWS);
  const remaining = bookings.length - MAX_ROWS;

  return (
    <div
      className="rounded-lg overflow-hidden ml-[88px]"
      style={{ border: `1px solid ${color}25`, background: bgLight }}
    >
      {/* Booking rows */}
      <div className="divide-y" style={{ borderColor: `${color}15` }}>
        {displayed.map((booking, idx) => (
          <div
            key={booking.bookingId || idx}
            className="px-4 py-2 flex items-center justify-between group/row hover:bg-[var(--theme-bg-surface)]/50 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <span
                className="text-[11px] font-semibold tabular-nums flex-shrink-0"
                style={{ color: "var(--theme-text-primary)", minWidth: "90px" }}
              >
                {booking.bookingNumber}
              </span>
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: "var(--theme-text-muted)", maxWidth: "200px" }}
              >
                {booking.customerName}
              </span>
              {booking.itemCount > 1 && (
                <span
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded tabular-nums flex-shrink-0"
                  style={{ backgroundColor: `${color}12`, color }}
                >
                  {booking.itemCount} charges
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color: "var(--theme-text-primary)" }}
              >
                {fmtPHP(booking.unbilledAmount)}
              </span>
              {/* Micro-action — appears on row hover */}
              {onCreateInvoice && (
                <div className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
                  <button
                    className="px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface)]/80"
                    style={{ color: "var(--theme-action-primary-bg)", border: "1px solid var(--theme-border-default)" }}
                    onClick={(e) => { e.stopPropagation(); onCreateInvoice(booking.bookingId); }}
                  >
                    Create Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* "More" footer */}
      {remaining > 0 && (
        <div className="px-4 py-1.5 text-center" style={{ borderTop: `1px solid ${color}15` }}>
          <button
            className="text-[10px] font-medium cursor-pointer hover:underline"
            style={{ color: color }}
            onClick={onViewAll}
          >
            +{remaining} more bookings — View all in Billings →
          </button>
        </div>
      )}

      {/* Always show "View all" if only a few */}
      {remaining <= 0 && bookings.length > 0 && (
        <div className="px-4 py-1.5 text-right" style={{ borderTop: `1px solid ${color}15` }}>
          <button
            className="text-[10px] font-medium cursor-pointer hover:underline"
            style={{ color: color }}
            onClick={onViewAll}
          >
            View all in Billings →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function ReceivablesAgingBar({ invoices, collections = [], dso, onBucketClick, onNavigate, previousInvoices, previousCollections = [], unbilledItems, onUnbilledClick, onRecordPayment, onSendReminder, onCreateInvoice }: ReceivablesAgingBarProps) {
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);

  // Filter to unpaid invoices only
  const openInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        return getBalance(inv, collections) > 0.01;
      }),
    [invoices, collections]
  );

  // Unbilled totals
  const unbilledAmount = useMemo(
    () => (unbilledItems || []).reduce((s, b) => s + (Number(b.amount) || 0), 0),
    [unbilledItems]
  );
  const unbilledCount = (unbilledItems || []).length;
  const hasUnbilled = unbilledCount > 0 && unbilledAmount > 0;

  // Count unique bookings for display (accounting sees bookings, not raw charges)
  const unbilledBookingCount = useMemo(
    () => groupByBooking(unbilledItems || []).length,
    [unbilledItems]
  );

  // Build segments WITH matched invoices for drill-down
  const segments: AgingSegment[] = useMemo(() => {
    return AGING_CONFIG.map((cfg) => {
      const matched = openInvoices.filter((inv) => {
        const days = getAgingDaysForInvoice(inv);
        return days >= cfg.min && days <= cfg.max;
      });
      return {
        label: cfg.label,
        days: cfg.days,
        amount: matched.reduce((s, inv) => s + getBalance(inv, collections), 0),
        count: matched.length,
        color: cfg.color,
        bgLight: cfg.bgLight,
        invoices: matched,
      };
    });
  }, [openInvoices, collections]);

  const totalAmount = segments.reduce((s, seg) => s + seg.amount, 0);
  const totalCount = segments.reduce((s, seg) => s + seg.count, 0);

  // Only show buckets that have data
  const activeSegments = useMemo(() => segments.filter((s) => s.count > 0), [segments]);

  // Max bucket amount — include unbilled in the scale so bars are honest
  const maxBucketAmount = Math.max(...activeSegments.map((s) => s.amount), hasUnbilled ? unbilledAmount : 0, 1);

  // Previous-period aging for trend indicators
  const prevSegmentAmounts: Record<string, number> = useMemo(() => {
    if (!previousInvoices || previousInvoices.length === 0) return {};
    const prevOpen = previousInvoices.filter((inv: any) => getBalance(inv, previousCollections) > 0.01);
    const result: Record<string, number> = {};
    for (const cfg of AGING_CONFIG) {
      const matched = prevOpen.filter((inv: any) => {
        const days = getAgingDaysForInvoice(inv);
        return days >= cfg.min && days <= cfg.max;
      });
      result[cfg.label] = matched.reduce((s: number, inv: any) => s + getBalance(inv, previousCollections), 0);
    }
    return result;
  }, [previousInvoices, previousCollections]);

  // DSO styling
  const dsoStyle = getDsoStyle(dso);

  // Toggle bucket expansion (accordion)
  const handleRowClick = (label: string, count: number) => {
    if (count === 0) return;
    setExpandedBucket((prev) => (prev === label ? null : label));
  };

  // Today's date for "As of" chip
  const todayStr = formatShortDate(new Date());

  // ── Empty state ──
  if (totalAmount === 0 && !hasUnbilled) {
    return (
      <div
        className="rounded-xl px-5 py-3"
        style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3
              className="text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--theme-text-muted)" }}
            >
              Receivables Aging
            </h3>
            <span
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md"
              style={{ background: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" }}
            >
              <Calendar size={10} />
              As of {todayStr}
            </span>
          </div>
        </div>
        <p className="text-[13px] mt-2" style={{ color: "var(--theme-text-muted)" }}>
          No outstanding receivables
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl px-5 py-3"
      style={{ border: "1px solid var(--theme-border-default)", background: "var(--theme-bg-surface)" }}
    >
      {/* ── Header Row ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: title + "As of" chip */}
        <div className="flex items-center gap-3">
          <h3
            className="text-[13px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Receivables Aging
          </h3>
          <span
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md"
            style={{ background: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" }}
          >
            <Calendar size={10} />
            As of {todayStr}
          </span>
        </div>

        {/* Right: total outstanding + View */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
              Billed:
            </span>
            <span className="text-[18px] font-bold tabular-nums" style={{ color: "var(--theme-text-primary)" }}>
              {formatCurrencyCompact(totalAmount)}
            </span>
            <span className="text-[11px] font-medium ml-0.5 tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
              ({totalCount})
            </span>
          </div>
          {hasUnbilled && (
            <div className="flex items-center gap-1.5 pl-2" style={{ borderLeft: "1px solid var(--theme-border-default)" }}>
              <span className="text-[11px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
                Unbilled:
              </span>
              <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
                {formatCurrencyCompact(unbilledAmount)}
              </span>
              <span className="text-[11px] font-medium ml-0.5 tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
                ({unbilledBookingCount} {unbilledBookingCount === 1 ? "bkg" : "bkgs"})
              </span>
            </div>
          )}
          {onNavigate && (
            <button
              className="text-[12px] font-medium cursor-pointer hover:underline"
              style={{ color: "var(--theme-action-primary-bg)" }}
              onClick={onNavigate}
            >
              View →
            </button>
          )}
        </div>
      </div>

      {/* ── Horizontal Row Chart ── */}
      <div className="flex flex-col gap-0">
        {/* Unbilled row — pre-invoice stage, visually distinct */}
        {hasUnbilled && (() => {
          const unbilledBarPct = maxBucketAmount > 0 ? (unbilledAmount / maxBucketAmount) * 100 : 0;
          const isExpanded = expandedBucket === "__unbilled__";
          const UNBILLED_COLOR = "var(--theme-text-muted)";
          const UNBILLED_BG = "var(--theme-bg-surface-subtle)";

          return (
            <div>
              <button
                className="w-full flex items-center gap-3 py-1 px-1 rounded-md transition-colors group"
                style={{
                  cursor: "pointer",
                  background: isExpanded ? UNBILLED_BG : "transparent",
                }}
                onClick={() => {
                  if (unbilledCount > 0) {
                    setExpandedBucket((prev) => (prev === "__unbilled__" ? null : "__unbilled__"));
                  }
                }}
              >
                {/* Label */}
                <div className="flex items-center gap-1.5 flex-shrink-0" style={{ width: "72px" }}>
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ border: `2px solid ${UNBILLED_COLOR}`, background: "transparent" }}
                  />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: UNBILLED_COLOR }}
                  >
                    Unbilled
                  </span>
                </div>

                {/* Bar — simple solid color to distinguish from aging bars */}
                <div className="flex-1 h-[18px] rounded overflow-hidden relative" style={{ background: "var(--theme-bg-surface-subtle)" }}>
                  <div
                    className="h-full rounded transition-all duration-300 flex items-center px-1.5 min-w-[24px]"
                    style={{
                      width: `${Math.max(unbilledBarPct, 3)}%`,
                      backgroundColor: UNBILLED_COLOR,
                      opacity: isExpanded ? 1 : 0.8,
                    }}
                  >
                    {unbilledBarPct > 20 && (
                      <span className="text-white text-[9px] font-semibold truncate leading-none">
                        {formatCurrencyCompact(unbilledAmount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="flex-shrink-0 text-right" style={{ width: "80px" }}>
                  <span
                    className="text-[12px] font-bold tabular-nums whitespace-nowrap"
                    style={{ color: "var(--theme-text-primary)" }}
                  >
                    {formatCurrencyCompact(unbilledAmount)}
                  </span>
                </div>

                {/* Count — "jobs" instead of "inv" */}
                <div className="flex-shrink-0 text-right" style={{ width: "40px" }}>
                  <span
                    className="text-[10px] tabular-nums"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {unbilledBookingCount} {unbilledBookingCount === 1 ? "bkg" : "bkgs"}
                  </span>
                </div>

                {/* Empty share % slot (unbilled isn't part of AR share) */}
                <div className="flex-shrink-0 text-right" style={{ width: "36px" }}>
                  <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--theme-text-muted)" }}>
                    —
                  </span>
                </div>

                {/* Empty trend slot */}
                <div className="flex-shrink-0" style={{ width: "14px" }} />

                {/* Expand chevron */}
                <div className="flex-shrink-0" style={{ width: "14px" }}>
                  <ChevronRight
                    size={12}
                    className="transition-transform duration-200"
                    style={{
                      color: isExpanded ? UNBILLED_COLOR : "var(--neuron-ui-muted)",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
              </button>

              {/* Unbilled drill-down */}
              {isExpanded && unbilledCount > 0 && (
                <div className="py-0.5">
                  <UnbilledDrillDown
                    items={unbilledItems!}
                    color={UNBILLED_COLOR}
                    bgLight={UNBILLED_BG}
                    onViewAll={() => onUnbilledClick?.()}
                    onCreateInvoice={onCreateInvoice}
                  />
                </div>
              )}

              {/* Dashed divider between unbilled and aging rows */}
              <div
                className="mx-1 my-1"
                style={{
                  borderBottom: "1px dashed var(--neuron-ui-muted)",
                }}
              />
            </div>
          );
        })()}

        {activeSegments.map((seg) => {
          const barPct = maxBucketAmount > 0 ? (seg.amount / maxBucketAmount) * 100 : 0;
          const sharePct = totalAmount > 0 ? (seg.amount / totalAmount) * 100 : 0;
          const isExpanded = expandedBucket === seg.label;

          // Trend calculation
          const prevAmt = prevSegmentAmounts[seg.label];
          const hasPrevData = prevAmt !== undefined && prevAmt > 0;
          const isCurrentBucket = seg.label === "Current";
          let trendArrow: string | null = null;
          let trendColor: string | null = null;

          if (hasPrevData && seg.amount > 0) {
            const pctChange = ((seg.amount - prevAmt) / prevAmt) * 100;
            if (Math.abs(pctChange) >= 5) {
              const isUp = pctChange > 0;
              trendArrow = isUp ? "↑" : "↓";
              const isGood = isCurrentBucket ? isUp : !isUp;
              trendColor = isGood ? "var(--theme-status-success-fg)" : "var(--theme-status-danger-fg)";
            }
          }

          return (
            <div key={seg.label}>
              {/* Row */}
              <button
                className="w-full flex items-center gap-3 py-1 px-1 rounded-md transition-colors group"
                style={{
                  cursor: "pointer",
                  background: isExpanded ? seg.bgLight : "transparent",
                }}
                onClick={() => handleRowClick(seg.label, seg.count)}
              >
                {/* Bucket label — fixed width for alignment */}
                <div className="flex items-center gap-1.5 flex-shrink-0" style={{ width: "72px" }}>
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: seg.color }}
                  >
                    {seg.label}
                  </span>
                </div>

                {/* Bar area */}
                <div className="flex-1 h-[18px] rounded overflow-hidden relative" style={{ background: "var(--theme-bg-surface-subtle)" }}>
                  <div
                    className="h-full rounded transition-all duration-300 flex items-center px-1.5 min-w-[24px]"
                    style={{
                      width: `${Math.max(barPct, 3)}%`,
                      backgroundColor: seg.color,
                      opacity: isExpanded ? 1 : 0.85,
                    }}
                  >
                    {barPct > 20 && (
                      <span className="text-white text-[9px] font-semibold truncate leading-none">
                        {formatCurrencyCompact(seg.amount)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount — fixed width for alignment */}
                <div className="flex-shrink-0 text-right" style={{ width: "80px" }}>
                  <span
                    className="text-[12px] font-bold tabular-nums whitespace-nowrap"
                    style={{ color: "var(--theme-text-primary)" }}
                  >
                    {formatCurrencyCompact(seg.amount)}
                  </span>
                </div>

                {/* Count */}
                <div className="flex-shrink-0 text-right" style={{ width: "40px" }}>
                  <span
                    className="text-[10px] tabular-nums"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {seg.count} inv
                  </span>
                </div>

                {/* Share % */}
                <div className="flex-shrink-0 text-right" style={{ width: "36px" }}>
                  <span
                    className="text-[10px] font-medium tabular-nums"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {sharePct.toFixed(sharePct < 1 && sharePct > 0 ? 1 : 0)}%
                  </span>
                </div>

                {/* Trend arrow */}
                <div className="flex-shrink-0" style={{ width: "14px" }}>
                  {trendArrow && trendColor ? (
                    <span className="text-[10px] font-bold" style={{ color: trendColor }}>
                      {trendArrow}
                    </span>
                  ) : null}
                </div>

                {/* Expand chevron */}
                <div className="flex-shrink-0" style={{ width: "14px" }}>
                  <ChevronRight
                    size={12}
                    className="transition-transform duration-200"
                    style={{
                      color: isExpanded ? seg.color : "var(--neuron-ui-muted)",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
              </button>

              {/* Drill-down panel — appears directly below the clicked row */}
              {isExpanded && seg.count > 0 && (
                <div className="py-0.5">
                  <InvoiceDrillDown
                    segment={seg}
                    onViewAll={() => onBucketClick(seg.label)}
                    onRecordPayment={onRecordPayment}
                    onSendReminder={onSendReminder}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
