import { useNavigate } from "react-router";
import { FileText, Calendar, Receipt, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import type { Billing } from "../../types/accounting";
import { BillingDetailsSheet } from "./billings/BillingDetailsSheet";
import { SkeletonTable } from "../shared/NeuronSkeleton";

interface BillingsListTableProps {
  billings: Billing[];
  isLoading?: boolean;
  onRowClick?: (billing: Billing) => void;
}

export function BillingsListTable({ billings, isLoading, onRowClick }: BillingsListTableProps) {
  const navigate = useNavigate();
  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleRowClick = (billing: Billing) => {
    if (onRowClick) {
      onRowClick(billing);
    } else {
      setSelectedBillingId(billing.id);
      setIsSheetOpen(true);
    }
  };

  const formatCurrency = (amount: number, currency: string = "PHP") => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return "—";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)]";
      case "partial":
        return "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]";
      case "unpaid":
        return "bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)]";
      case "overdue":
        return "bg-[var(--theme-status-danger-bg)] text-[#991B1B]";
      case "invoiced":
        return "bg-blue-50 text-blue-700";
      case "pending":
        return "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)]";
      default:
        return "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)]";
    }
  };

  const getStatusIcon = (status: string) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (status?.toLowerCase()) {
      case "paid":
        return <CheckCircle2 {...iconProps} style={{ color: "var(--theme-status-success-fg)" }} />;
      case "partial":
        return <Clock {...iconProps} style={{ color: "#C88A2B" }} />;
      case "unpaid":
        return <AlertCircle {...iconProps} style={{ color: "var(--theme-status-danger-fg)" }} />;
      case "overdue":
        return <AlertCircle {...iconProps} style={{ color: "#991B1B" }} />;
      default:
        return <Receipt {...iconProps} />;
    }
  };

  const isOverdue = (billing: Billing) => {
    if (billing.payment_status === "paid" || billing.payment_status === "Paid") return false;
    if (!billing.due_date) return false;
    const dueDate = new Date(billing.due_date);
    const today = new Date();
    return dueDate < today;
  };

  // Helper to normalize status for display
  const normalizeStatus = (status: string) => {
    if (!status) return "Unknown";
    // Map legacy/other statuses to standard ones if needed
    if (status === "Invoiced") return "unpaid"; 
    return status;
  };

  if (isLoading) {
    return <SkeletonTable rows={8} cols={6} />;
  }

  if (billings.length === 0) {
    return (
      <div className="rounded-[10px] overflow-hidden" style={{ 
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)"
      }}>
        <div className="px-6 py-12 text-center">
          <Receipt className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
          <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">
            No invoices found
          </h3>
          <p style={{ color: "var(--neuron-ink-muted)" }}>
            Invoices will appear here once billing E-Vouchers are posted to the ledger
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] overflow-hidden" style={{ 
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)"
    }}>
      {/* Table Header */}
      <div className="grid grid-cols-[32px_minmax(240px,1fr)_180px_140px_120px_1fr] gap-3 px-4 py-2 border-b" style={{ 
        backgroundColor: "var(--neuron-bg-page)",
        borderColor: "var(--neuron-ui-divider)"
      }}>
        <div></div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Description</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Customer</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-right" style={{ color: "var(--neuron-ink-muted)" }}>Amount</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] pl-8" style={{ color: "var(--neuron-ink-muted)" }}>Invoice #</div>
      </div>

      {/* Billing Rows */}
      <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
        {billings.map(billing => {
            const status = billing.payment_status || (billing as any).status || "pending";
            return (
                <div
                  key={billing.id || billing.invoice_number}
                  className="grid grid-cols-[32px_minmax(240px,1fr)_180px_140px_120px_1fr] gap-3 px-4 py-3 transition-colors cursor-pointer"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => handleRowClick(billing)}
                >
                  {/* Icon Column */}
                  <div className="flex items-center justify-center">
                    {getStatusIcon(status)}
                  </div>

                  {/* Description */}
                  <div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
                      {billing.description}
                    </div>
                    {billing.project_number && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                        Project: {billing.project_number}
                      </div>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                    {billing.customer_name || "—"}
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <div className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
                      {formatCurrency(billing.total_amount || (billing as any).amount || 0, (billing as any).currency || "PHP")}
                    </div>
                    {(billing.amount_due ?? 0) > 0 && status !== "unpaid" && status !== "Paid" && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--theme-status-danger-fg)" }}>
                        {formatCurrency(billing.amount_due ?? 0, (billing as any).currency || "PHP")} due
                      </div>
                    )}
                  </div>

                  {/* Status Badge + Due Date */}
                  <div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getPaymentStatusColor(status)}`}>
                      {status}
                    </span>
                    <div className="text-[10px] mt-1" style={{ color: isOverdue(billing) ? "var(--theme-status-danger-fg)" : "var(--neuron-ink-muted)" }}>
                      Due: {formatDate(billing.due_date || "")}
                    </div>
                  </div>

                  {/* Invoice # */}
                  <div className="text-[11px] pl-8" style={{ color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
                    {billing.invoice_number || (billing as any).invoiceNumber || "—"}
                  </div>
                </div>
            );
        })}
      </div>

      <BillingDetailsSheet 
        isOpen={isSheetOpen} 
        onClose={() => setIsSheetOpen(false)} 
        billingId={selectedBillingId} 
      />
    </div>
  );
}