import { useState, useMemo, useEffect } from "react";
import { Search, X, Plus } from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { ExpensesTable } from "./ExpensesTable";
import { CreateEVoucherForm } from "./evouchers/CreateEVoucherForm";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { toast } from "../ui/toast-utils";
import { supabase } from "../../utils/supabase/client";
// Expenses received here are raw Supabase evoucher rows, not the OperationsExpense type
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => Number(v ?? 0);

interface UnifiedExpensesTabProps {
  expenses: Record<string, unknown>[];
  isLoading: boolean;
  showHeader?: boolean;
  linkedBookings?: { bookingId: string; serviceType?: string }[];
  context?: "project" | "customer" | "booking";
  onRefresh?: () => void;
  projectNumber?: string;
  bookingId?: string;
  bookingType?: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  highlightId?: string | null;
  /** Billing items already saved for this booking/project — used to compute which billable expenses are not yet converted */
  existingBillingItems?: { source_id?: string | null; [key: string]: any }[];
  /** Called whenever the pending billable count changes — lets parent show a badge on the Billings tab */
  onPendingCountChange?: (count: number) => void;
}

export function UnifiedExpensesTab({
  expenses,
  isLoading,
  showHeader = true,
  linkedBookings = [],
  context = "project",
  onRefresh,
  projectNumber,
  bookingId,
  bookingType,
  title,
  subtitle,
  readOnly = false,
  highlightId = null,
  existingBillingItems = [],
  onPendingCountChange,
}: UnifiedExpensesTabProps) {
  
  // -- Local State for Filters & UI --
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBooking, setSelectedBooking] = useState("");
  
  const [selectedExpense, setSelectedExpense] = useState<Record<string, unknown> | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [showBillablePending, setShowBillablePending] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const BILLABLE_ELIGIBLE_STATUSES = ["approved", "posted", "paid", "partial"];

  // Set of source_ids already tracked in billing_line_items
  const billedSourceIds = useMemo(() => {
    return new Set(existingBillingItems.map(b => b.source_id).filter(Boolean) as string[]);
  }, [existingBillingItems]);

  // Set of expense IDs that are billable and not yet converted
  const convertibleIds = useMemo(() => {
    const ids = new Set<string>();
    expenses.forEach(e => {
      if (
        e.isBillable &&
        BILLABLE_ELIGIBLE_STATUSES.includes(str(e.status)) &&
        !billedSourceIds.has(str(e.id))
      ) {
        ids.add(str(e.id));
      }
    });
    return ids;
  }, [expenses, billedSourceIds]);

  const handleConvert = async (expenseData: any) => {
    const expenseId: string = expenseData?.id;
    if (!expenseId) return;
    if (convertingId === expenseId) return; // prevent double-click
    setConvertingId(expenseId);

    const resolvedBookingId = expenseData?.bookingId || expenseData?.booking_id || bookingId;
    if (!resolvedBookingId) {
      toast.error("Cannot convert: expense has no linked booking.");
      setConvertingId(null);
      return;
    }

    const { error } = await supabase.from("billing_line_items").insert({
      booking_id: resolvedBookingId,
      project_number: expenseData?.projectNumber || expenseData?.project_number || projectNumber,
      source_id: expenseData?.id,
      source_type: "billable_expense",
      description: expenseData?.description || expenseData?.expenseName || "Billable Expense",
      service_type: "Reimbursable Expense",
      amount: expenseData?.amount || 0,
      currency: expenseData?.currency || "PHP",
      status: "unbilled",
      category: expenseData?.expenseCategory || expenseData?.expense_category || "Billable Expenses",
    });

    setConvertingId(null);
    if (error) {
      // Unique index violation means auto-billing already created it on approval
      if (error.code === "23505") {
        toast.info("Already converted to a billing item");
        onRefresh?.();
        return;
      }
      toast.error("Failed to convert expense to billing item");
      return;
    }
    toast.success("Converted to billing item — visible in the Billings tab");
    onRefresh?.();
  };

  // -- Derived Data --
  const categories = useMemo(() => 
    Array.from(new Set(expenses.map(e => str(e.expenseCategory)).filter(Boolean))),
  [expenses]);

  const totalApprovedAmount = useMemo(() => {
    return expenses
      .filter(e => !deletedIds.includes(str(e.id)) && (str(e.status) === "approved" || str(e.status) === "posted"))
      .reduce((sum, e) => sum + num(e.amount), 0);
  }, [expenses, deletedIds]);

  const totalGrossAmount = useMemo(() => {
    return expenses
      .filter(e => !deletedIds.includes(str(e.id)) && str(e.status) !== "rejected" && str(e.status) !== "cancelled")
      .reduce((sum, e) => sum + num(e.amount), 0);
  }, [expenses, deletedIds]);

  // Notify parent of pending count changes (for Billings tab badge)
  useEffect(() => {
    onPendingCountChange?.(convertibleIds.size);
  }, [convertibleIds.size]);

  const resolvedCreateBookingId = useMemo(() => {
    if (context === "booking") return bookingId || "";
    if (context !== "project") return "";
    if (linkedBookings.length === 1) return linkedBookings[0]?.bookingId || "";
    return selectedBooking || "";
  }, [bookingId, context, linkedBookings, selectedBooking]);

  // -- Filter Logic --
  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      // 0. Exclude locally deleted items
      if (deletedIds.includes(str(expense.id))) return false;

      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          str(expense.expenseName).toLowerCase().includes(query) ||
          str(expense.vendorName).toLowerCase().includes(query) ||
          str(expense.description).toLowerCase().includes(query) ||
          str(expense.bookingId).toLowerCase().includes(query);
        
        if (!matchesSearch) return false;
      }

      // 2. Status Filter
      const eStatus = str(expense.status);
      if (selectedStatus && eStatus !== selectedStatus) {
        if (selectedStatus === "pending" && (eStatus === "draft" || eStatus === "pending")) return true;
        if (selectedStatus === "posted" && eStatus === "paid") return true;
        if (eStatus !== selectedStatus) return false;
      }

      // 3. Date Filter
      if (dateFrom) {
        const expenseDate = new Date(str(expense.expenseDate || expense.createdAt));
        const fromDate = new Date(dateFrom);
        if (expenseDate < fromDate) return false;
      }
      if (dateTo) {
        const expenseDate = new Date(str(expense.expenseDate || expense.createdAt));
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (expenseDate > toDate) return false;
      }

      // 4. Dropdown Filters
      if (selectedCategory && str(expense.expenseCategory) !== selectedCategory) return false;
      if (selectedBooking && str(expense.bookingId) !== selectedBooking) return false;

      // 5. Billable Pending filter
      if (showBillablePending && !convertibleIds.has(str(expense.id))) return false;

      return true;
    });
  }, [expenses, searchQuery, selectedStatus, dateFrom, dateTo, selectedCategory, selectedBooking, showBillablePending, convertibleIds]);

  const hasActiveFilters = dateFrom || dateTo || selectedCategory || selectedBooking || selectedStatus || searchQuery || showBillablePending;

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedCategory("");
    setSelectedBooking("");
    setSelectedStatus("");
    setSearchQuery("");
    setShowBillablePending(false);
  };

  const handleOpenAddExpense = () => {
    if (context !== "project" && context !== "booking") {
      setIsAddExpenseModalOpen(true);
      return;
    }

    if (!resolvedCreateBookingId) {
      toast.error(
        context === "project"
          ? "Select a booking before adding a project expense."
          : "A booking-linked expense requires a real booking."
      );
      return;
    }

    setIsAddExpenseModalOpen(true);
  };

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)]">
      {/* Header Section (Conditional) */}
      {showHeader && (
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
              {title || (context === 'booking' ? 'Booking Expenses' : 'Project Expenses')}
            </h1>
            {(subtitle || context !== 'booking') && (
              <p className="text-[14px] text-[var(--theme-text-muted)]">
                {subtitle || 'Manage, track, and approve expenses across all linked bookings.'}
              </p>
            )}
          </div>
          
          <div className="flex flex-col items-end">
            {!readOnly && (
              <button
                onClick={handleOpenAddExpense}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors shadow-sm font-medium text-[14px]"
              >
                <Plus size={16} />
                Add Expense
              </button>
            )}
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neuron-ink-muted)]" />
          <label htmlFor="expense-search" className="sr-only">Search expenses</label>
          <input
            id="expense-search"
            type="text"
            placeholder="Search by Ref #, Vendor, or Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px] border-[1.5px] border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)] focus:border-[var(--theme-action-primary-bg)]"
          />
        </div>

        {/* Filters */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
        </div>
        <span className="text-[13px] text-[var(--theme-text-muted)] font-medium">to</span>
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2" />
        </div>
        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={[
              { value: "", label: "Status" },
              { value: "draft", label: "Draft" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "posted", label: "Posted" },
              { value: "rejected", label: "Rejected" }
            ]}
            placeholder="Status"
          />
        </div>
        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[{ value: "", label: "Category" }, ...categories.map(c => ({ value: c, label: c }))]}
            placeholder="Category"
          />
        </div>
        
        {/* Billable Pending filter — shown when existingBillingItems context is available */}
        {existingBillingItems.length >= 0 && convertibleIds.size > 0 && (
          <button
            onClick={() => setShowBillablePending(v => !v)}
            title="Show only billable expenses not yet converted to billing items"
            className={`flex items-center gap-1.5 px-3 py-[7px] text-[12px] font-semibold rounded-lg border whitespace-nowrap transition-colors ${
              showBillablePending
                ? "border-[var(--theme-status-warning-border)] bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]"
                : "border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-[var(--neuron-pill-inactive-text)]"
            }`}
          >
            Billable: Pending
            <span className={`text-[10px] font-bold px-[5px] py-px rounded-full ${
              showBillablePending
                ? "bg-[var(--theme-status-warning-border)] text-[var(--theme-status-warning-fg)]"
                : "bg-[var(--neuron-pill-inactive-bg)] text-[var(--neuron-pill-inactive-text)]"
            }`}>
              {convertibleIds.size}
            </span>
          </button>
        )}

        {/* Booking Filter (Only show if we have linked bookings AND we are in project context) */}
        {linkedBookings.length > 0 && context === 'project' && (
          <div style={{ minWidth: "140px" }}>
            <CustomDropdown
              value={selectedBooking}
              onChange={setSelectedBooking}
              options={[{ value: "", label: "Booking" }, ...linkedBookings.map(b => ({ value: b.bookingId, label: b.bookingId }))]}
              placeholder="Booking"
            />
          </div>
        )}

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] transition-colors shrink-0"
            title="Clear Filters"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Shared Table Component */}
      <ExpensesTable
        data={filteredExpenses.map(item => ({
          id: str(item.id),
          date: str(item.expenseDate || item.createdAt),
          reference: str(item.expenseName).replace('EVRN-', ''),
          category: str(item.expenseCategory),
          description: str(item.description),
          payee: str(item.vendorName) !== "—" ? str(item.vendorName) : "Unspecified",
          status: str(item.status),
          amount: num(item.amount),
          currency: str(item.currency),
          originalData: item
        }))}
        isLoading={isLoading}
        emptyMessage="No expenses found matching your criteria."
        onRowClick={(item) => {
          setSelectedExpense(item);
          setShowDetailPanel(true);
        }}
        showBookingColumn={context === "project"}
        footerSummary={filteredExpenses.length > 0 ? {
          label: "Total Approved Expenses",
          amount: totalApprovedAmount
        } : undefined}
        grossSummary={filteredExpenses.length > 0 ? {
          label: "Total Gross Expenses",
          amount: totalGrossAmount
        } : undefined}
        highlightId={highlightId}
        convertibleIds={existingBillingItems.length >= 0 && convertibleIds.size > 0 ? convertibleIds : undefined}
        onConvertItem={!readOnly ? handleConvert : undefined}
      />

      {/* Detail Panel */}
      <AddRequestForPaymentPanel 
        isOpen={showDetailPanel}
        onClose={() => setShowDetailPanel(false)}
        mode="view"
        context="operations"
        onSuccess={() => {
          if (selectedExpense) {
            setDeletedIds(prev => [...prev, str(selectedExpense.id)]);
          }
          onRefresh?.();
          setShowDetailPanel(false);
        }}
        existingData={selectedExpense ? {
          id: selectedExpense.id,
          voucher_number: selectedExpense.expenseName,
          status: selectedExpense.status,
          amount: selectedExpense.amount,
          description: selectedExpense.description,
          vendor_name: selectedExpense.vendorName,
          request_date: selectedExpense.expenseDate || selectedExpense.createdAt,
          expense_category: selectedExpense.expenseCategory,
          project_number: selectedExpense.projectNumber || projectNumber || "",
          transaction_type: (selectedExpense.transactionType || selectedExpense.transaction_type || "expense") as string,
          is_billable: selectedExpense.isBillable,
          sub_category: "",
          line_items: [{
            id: "1",
            particular: selectedExpense.description || "Expense",
            description: "",
            amount: selectedExpense.amount
          }]
        } as any : undefined}
      />

      {/* Add Expense Modal */}
      {isAddExpenseModalOpen && (
        <CreateEVoucherForm
          isOpen={isAddExpenseModalOpen}
          onClose={() => setIsAddExpenseModalOpen(false)}
          context="operations" // Assuming operations context for projects
          bookingId={resolvedCreateBookingId || undefined}
          projectNumber={projectNumber}
          bookingType={bookingType} // Pass service type
          onSuccess={() => {
            onRefresh?.();
            setIsAddExpenseModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
