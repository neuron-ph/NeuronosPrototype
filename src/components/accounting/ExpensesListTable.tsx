import { useNavigate } from "react-router";
import { Package, Truck, Briefcase, Home, Coffee, Wallet, Clock, CheckCircle, AlertCircle, FileText, XCircle } from "lucide-react";
import { useState } from "react";
import type { Expense } from "../../types/accounting";
import { ExpenseDetailsSheet } from "./expenses/ExpenseDetailsSheet";
import { SkeletonTable } from "../shared/NeuronSkeleton";

interface ExpensesListTableProps {
  expenses: Expense[];
  isLoading?: boolean;
  onRowClick?: (expense: Expense) => void;
}

export function ExpensesListTable({ expenses, isLoading, onRowClick }: ExpensesListTableProps) {
  const navigate = useNavigate();
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const handleRowClick = (expense: Expense) => {
    console.log(`[ExpensesListTable] Row clicked: ${expense.id} (${expense.evoucher_number})`);
    if (onRowClick) {
      onRowClick(expense);
    } else {
      setSelectedExpenseId(expense.id);
      setIsSheetOpen(true);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
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

  const getCategoryIcon = (category: string) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (category?.toLowerCase()) {
      case "forwarding":
      case "shipping":
        return <Package {...iconProps} />;
      case "trucking":
      case "transportation":
        return <Truck {...iconProps} />;
      case "office":
      case "supplies":
        return <Briefcase {...iconProps} />;
      case "rent":
      case "utilities":
        return <Home {...iconProps} />;
      case "meals":
      case "entertainment":
        return <Coffee {...iconProps} />;
      default:
        return <Wallet {...iconProps} />;
    }
  };

  const getCategoryColor = (category: string) => {
    // All expenses get expense/payment styling
    return "bg-[#FEF3E7] text-[#C88A2B]";
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || "pending";
    
    switch (s) {
      case "draft":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)]">
            <FileText size={10} />
            Draft
          </span>
        );
      case "pending":
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-700">
            <Clock size={10} />
            Pending Approval
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
            <CheckCircle size={10} />
            Approved
          </span>
        );
      case "posted":
      case "paid":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)]">
            <CheckCircle size={10} />
            Posted
          </span>
        );
      case "rejected":
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--theme-status-danger-bg)] text-red-700">
            <XCircle size={10} />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)]">
            {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return <SkeletonTable rows={8} cols={6} />;
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-[10px] overflow-hidden" style={{ 
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)"
      }}>
        <div className="px-6 py-12 text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
          <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">
            No expenses found
          </h3>
          <p style={{ color: "var(--neuron-ink-muted)" }}>
            Expenses will appear here once payment E-Vouchers are created.
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
      <div className="grid grid-cols-[32px_minmax(240px,1fr)_160px_140px_140px_120px] gap-3 px-4 py-2 border-b" style={{ 
        backgroundColor: "var(--neuron-bg-page)",
        borderColor: "var(--neuron-ui-divider)"
      }}>
        <div></div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Description</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Category</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Vendor</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-right" style={{ color: "var(--neuron-ink-muted)" }}>Amount</div>
      </div>

      {/* Expense Rows */}
      <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
        {expenses.map(expense => (
          <div
            key={expense.id}
            className="grid grid-cols-[32px_minmax(240px,1fr)_160px_140px_140px_120px] gap-3 px-4 py-3 transition-colors cursor-pointer"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onClick={() => handleRowClick(expense)}
          >
            {/* Icon Column */}
            <div className="flex items-center justify-center">
              {getCategoryIcon(expense.category || "")}
            </div>

            {/* Description */}
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
                {expense.description}
              </div>
              {expense.evoucher_number && (
                <div className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--neuron-brand-green)" }}>
                  {expense.evoucher_number}
                </div>
              )}
            </div>

            {/* Category Badge + Date */}
            <div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getCategoryColor(expense.category || "")}`}>
                {expense.category || "Uncategorized"}
              </span>
              <div className="text-[10px] mt-1" style={{ color: "var(--neuron-ink-muted)" }}>
                {formatDate(expense.date || "")}
              </div>
            </div>

            {/* Vendor */}
            <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
              {expense.vendor || "—"}
            </div>

            {/* Status */}
            <div className="flex items-center">
              {getStatusBadge(expense.status)}
            </div>

            {/* Amount */}
            <div className="text-[13px] font-semibold text-right" style={{ color: "var(--neuron-ink-primary)" }}>
              {formatCurrency(expense.amount)}
            </div>
          </div>
        ))}
      </div>

      <ExpenseDetailsSheet 
        isOpen={isSheetOpen} 
        onClose={() => setIsSheetOpen(false)} 
        expenseId={selectedExpenseId} 
      />
    </div>
  );
}
