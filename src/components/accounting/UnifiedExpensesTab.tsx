import { useState, useMemo } from "react";
import { Search, X, CheckCircle2, Clock, User, Layers, Plus } from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { ExpensesTable } from "./ExpensesTable";
import { CreateEVoucherForm } from "./evouchers/CreateEVoucherForm";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { toast } from "../ui/toast-utils";
import type { Expense as OperationsExpense } from "../../types/operations";

interface UnifiedExpensesTabProps {
  expenses: OperationsExpense[];
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
    day: "2-digit",
    year: "numeric",
  });
};

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
}: UnifiedExpensesTabProps) {
  
  // -- Local State for Filters & UI --
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBooking, setSelectedBooking] = useState("");
  
  const [selectedExpense, setSelectedExpense] = useState<OperationsExpense | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // -- Derived Data --
  const categories = useMemo(() => 
    Array.from(new Set(expenses.map(e => e.expenseCategory).filter(Boolean))),
  [expenses]);

  const totalApprovedAmount = useMemo(() => {
    return expenses
      .filter(e => !deletedIds.includes(e.id) && (e.status === "approved" || e.status === "posted"))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, deletedIds]);

  const totalGrossAmount = useMemo(() => {
    return expenses
      .filter(e => !deletedIds.includes(e.id) && e.status !== "rejected" && e.status !== "cancelled")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, deletedIds]);

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
      if (deletedIds.includes(expense.id)) return false;

      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          expense.expenseName.toLowerCase().includes(query) ||
          (expense.vendorName || "").toLowerCase().includes(query) ||
          (expense.description || "").toLowerCase().includes(query) ||
          (expense.bookingId || "").toLowerCase().includes(query);
        
        if (!matchesSearch) return false;
      }

      // 2. Status Filter
      if (selectedStatus && expense.status !== selectedStatus) {
        if (selectedStatus === "pending" && (expense.status === "draft" || expense.status === "pending")) return true; 
        if (selectedStatus === "posted" && (expense.status === "paid")) return true;
        if (expense.status !== selectedStatus) return false;
      }

      // 3. Date Filter
      if (dateFrom) {
        const expenseDate = new Date(expense.expenseDate || expense.createdAt);
        const fromDate = new Date(dateFrom);
        if (expenseDate < fromDate) return false;
      }
      if (dateTo) {
        const expenseDate = new Date(expense.expenseDate || expense.createdAt);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (expenseDate > toDate) return false;
      }

      // 4. Dropdown Filters
      if (selectedCategory && expense.expenseCategory !== selectedCategory) return false;
      if (selectedBooking && expense.bookingId !== selectedBooking) return false;

      return true;
    });
  }, [expenses, searchQuery, selectedStatus, dateFrom, dateTo, selectedCategory, selectedBooking]);

  const hasActiveFilters = dateFrom || dateTo || selectedCategory || selectedBooking || selectedStatus || searchQuery;

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedCategory("");
    setSelectedBooking("");
    setSelectedStatus("");
    setSearchQuery("");
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
    <div className="flex flex-col bg-white">
      {/* Header Section (Conditional) */}
      {showHeader && (
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-[32px] font-semibold text-[#12332B] mb-1 tracking-tight">
              {title || (context === 'booking' ? 'Booking Expenses' : 'Project Expenses')}
            </h1>
            <p className="text-[14px] text-[#667085]">
              {subtitle || (context === 'booking' 
                ? 'Manage, track, and approve expenses for this booking.' 
                : 'Manage, track, and approve expenses across all linked bookings.')}
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            {!readOnly && (
              <button
                onClick={handleOpenAddExpense}
                className="flex items-center gap-2 px-4 py-2 bg-[#0F766E] text-white rounded-lg hover:bg-[#0D6559] transition-colors shadow-sm font-medium text-[14px]"
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
          <input
            type="text"
            placeholder="Search by Ref #, Vendor, or Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px] border-[1.5px] border-[var(--neuron-ui-border)] bg-white text-[var(--neuron-ink-primary)] focus:border-[#0F766E]"
          />
        </div>

        {/* Filters */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
        </div>
        <span className="text-[13px] text-[#6B7280] font-medium">to</span>
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
            className="flex items-center justify-center w-10 h-10 rounded-lg text-[#EF4444] hover:bg-[#FEF2F2] transition-colors shrink-0"
            title="Clear Filters"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Shared Table Component */}
      <ExpensesTable
        data={filteredExpenses.map(item => ({
          id: item.id,
          date: item.expenseDate || item.createdAt,
          reference: item.expenseName.replace('EVRN-', ''),
          category: item.expenseCategory,
          description: item.description,
          payee: item.vendorName !== "—" ? item.vendorName : "Unspecified",
          status: item.status,
          amount: item.amount,
          currency: item.currency,
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
      />

      {/* Detail Panel */}
      <AddRequestForPaymentPanel 
        isOpen={showDetailPanel}
        onClose={() => setShowDetailPanel(false)}
        mode="view"
        context="operations"
        onSuccess={() => {
          if (selectedExpense) {
            setDeletedIds(prev => [...prev, selectedExpense.id]);
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
          // Defaults for view mode
          transaction_type: "expense",
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
