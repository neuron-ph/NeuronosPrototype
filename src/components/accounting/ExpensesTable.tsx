import { Receipt, FileText, ArrowRightLeft, CheckCircle } from "lucide-react";
import { useRef, useEffect } from "react";
import { SkeletonTable } from "../shared/NeuronSkeleton";

export interface ExpenseTableItem {
  id: string;
  date: string;       // ISO string or display string
  reference: string;  // ID or Voucher Number
  category: string;
  payee: string;      // Vendor
  description?: string; // Description of the expense
  status?: string;    // 'approved', 'posted', 'pending', 'rejected', 'draft'
  amount: number;
  currency?: string;
  originalData?: any; // Pass back the full object on click
}

interface ExpensesTableProps {
  data: ExpenseTableItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: any) => void;
  showBookingColumn?: boolean; 
  footerSummary?: {
    label: string;
    amount: number;
    currency?: string;
  };
  grossSummary?: {
    label: string;
    amount: number;
    currency?: string;
  };
  highlightId?: string | null;
  /** IDs of billable expenses not yet converted — shows Convert button on matching rows */
  convertibleIds?: Set<string>;
  /** Called when user clicks Convert on a row */
  onConvertItem?: (item: any) => void;
}

const formatCurrency = (amount: number, currency: string = "PHP") => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function ExpensesTable({
  data,
  isLoading = false,
  emptyMessage = "No expenses found.",
  onRowClick,
  showBookingColumn = false,
  footerSummary,
  grossSummary,
  highlightId = null,
  convertibleIds,
  onConvertItem,
}: ExpensesTableProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId]);

  // Visual helper for status - Matches Neuron badge system
  const getStatusBadge = (status: string = "pending") => {
    const s = status.toLowerCase();
    
    let styles = "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)]"; // Default
    
    // Exact colors from design system
    if (s === "posted" || s === "paid") styles = "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)]"; // Green
    else if (s === "approved") styles = "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)]"; // Blue
    else if (s === "rejected" || s === "cancelled") styles = "bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)]"; // Red
    else if (s === "pending" || s === "draft") styles = "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]"; // Amber

    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles}`}>
        {status}
      </span>
    );
  };

  // Matches ActivitiesList "System Update" / "Note" style for neutral categories
  const getCategoryColor = (category: string) => {
    // We use the "Sage" style from ActivitiesList for general categories to look clean
    return "bg-[var(--theme-bg-surface-tint)] text-[var(--theme-text-muted)]";
  };

  const hasConvertCol = !!(convertibleIds && onConvertItem);

  // Layout: Icon | Category/Date | Reference | Description | Payee | [Booking] | Status | Amount | [Action]
  const gridClass = showBookingColumn
    ? `grid grid-cols-[32px_140px_120px_minmax(200px,1fr)_150px_120px_100px_120px${hasConvertCol ? "_100px" : ""}]`
    : `grid grid-cols-[32px_140px_120px_minmax(200px,1fr)_150px_100px_120px${hasConvertCol ? "_100px" : ""}]`;

  if (isLoading) {
    return <SkeletonTable rows={8} cols={7} />;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-[10px] overflow-hidden" style={{ 
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)" // #E5E9F0
      }}>
        <div className="px-6 py-12 text-center">
          <Receipt className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
          <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No expenses found</h3>
          <p style={{ color: "var(--neuron-ink-muted)" }}>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] overflow-hidden bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)]">
      {/* Header - Matches var(--neuron-bg-page) which is #F7FAF8 */}
      <div className={`${gridClass} gap-3 px-4 py-2 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-page)]`}>
        <div></div> {/* Icon Placeholder */}
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Category / Date</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Reference</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Description</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Payee</div>
        {showBookingColumn && (
           <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Booking</div>
        )}
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Status</div>
        <div className="text-right text-[11px] font-semibold uppercase tracking-[0.002em] text-[var(--theme-text-muted)]">Amount</div>
        {hasConvertCol && <div></div>}
      </div>

      {/* Rows */}
      <div className="divide-y divide-[var(--theme-border-default)]">
        {data.map((item, index) => {
          const isHighlighted = highlightId === item.id;
          return (
          <div
            key={item.id || index}
            className={`${gridClass} gap-3 px-4 py-3 transition-colors ${onRowClick ? "cursor-pointer hover:bg-[var(--theme-state-hover)]" : ""} ${isHighlighted ? "ring-2 ring-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/5 rounded-md" : ""}`}
            onClick={() => onRowClick && onRowClick(item.originalData || item)}
            ref={isHighlighted ? highlightRef : undefined}
          >
            {/* Icon - Muted gray to match phone icon */}
            <div className="flex items-center justify-center">
              <Receipt className="w-4 h-4 text-[var(--theme-text-muted)]" /> 
            </div>

            {/* Category & Date (Stacked) */}
            <div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getCategoryColor(item.category)}`}>
                {item.category || "General"}
              </span>
              <div className="text-[10px] mt-1 text-[var(--theme-text-muted)]">
                {formatDate(item.date)}
              </div>
            </div>

            {/* Reference - Teal link color */}
            <div className="flex items-center">
              <span className="text-[12px] font-medium text-[var(--theme-action-primary-bg)]">
                {item.reference}
              </span>
            </div>

             {/* Description - Dark gray primary text */}
             <div className="flex items-center">
               <span className="text-[12px] text-[var(--theme-text-primary)] font-medium line-clamp-2" title={item.description || item.payee}>
                 {item.description || "—"}
               </span>
            </div>

            {/* Payee - Secondary Gray Text or Regular Text */}
            <div className="flex items-center">
               <span className="text-[12px] text-[var(--theme-text-secondary)] font-medium truncate" title={item.payee}>
                 {item.payee}
               </span>
            </div>

            {/* Booking (Optional) */}
            {showBookingColumn && (
               <div className="flex items-center">
                 <span className="text-[12px] text-[var(--theme-text-muted)]">
                    {item.originalData?.bookingId || "—"}
                 </span>
               </div>
            )}

            {/* Status */}
            <div className="flex items-center">
              {getStatusBadge(item.status)}
            </div>

            {/* Amount - Bold right aligned */}
            <div className="flex items-center justify-end">
              <span className="text-[12px] font-bold text-[#111827]">
                {formatCurrency(item.amount, item.currency)}
              </span>
            </div>

            {/* Convert action (only when convertibleIds provided) */}
            {hasConvertCol && (
              <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {convertibleIds!.has(item.id) ? (
                  <button
                    onClick={() => onConvertItem!(item.originalData || item)}
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "4px 8px", fontSize: "11px", fontWeight: 600,
                      border: "1px solid var(--theme-status-success-border)", borderRadius: "6px",
                      backgroundColor: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)", cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="Convert this billable expense to an unbilled billing item"
                  >
                    <ArrowRightLeft size={11} />
                    Convert
                  </button>
                ) : item.originalData?.isBillable ? (
                  <span
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)",
                    }}
                    title="Already converted to billing item"
                  >
                    <CheckCircle size={11} />
                    Billed
                  </span>
                ) : null}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Footer Summary Row */}
      {(footerSummary || grossSummary) && (
        <div className="bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)] px-4 py-3 flex items-center justify-end gap-8">
          {grossSummary && (
             <div className="flex items-center gap-2">
               <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.002em]">
                 {grossSummary.label}
               </span>
               <span className="text-[13px] font-bold text-[var(--theme-text-secondary)]">
                 {formatCurrency(grossSummary.amount, grossSummary.currency)}
               </span>
             </div>
          )}
          {footerSummary && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.002em]">
                {footerSummary.label}
              </span>
              <span className="text-[13px] font-bold text-[#991B1B]">
                {formatCurrency(footerSummary.amount, footerSummary.currency)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}