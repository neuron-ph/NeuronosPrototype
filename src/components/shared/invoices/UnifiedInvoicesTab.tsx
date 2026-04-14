import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, FileText } from "lucide-react";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { FinancialContainer } from "../../../types/financials";
import { Invoice } from "../../../types/accounting";
import { InvoiceCreatorPage } from "../../../components/projects/invoices/InvoiceCreatorPage";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { DataTable, ColumnDef } from "../../common/DataTable";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";
import { getInvoiceLifecycleStatus, isInvoiceFinanciallyActive } from "../../../utils/invoiceReversal";
import { useBillingMerge } from "../../../hooks/useBillingMerge";

interface UnifiedInvoicesTabProps {
  financials: FinancialData;
  project: FinancialContainer;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  onRefresh?: () => void;
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  linkedBookings?: any[];
  highlightId?: string | null;
}

export function UnifiedInvoicesTab({ 
  financials, 
  project, 
  currentUser,
  onRefresh,
  title,
  subtitle,
  readOnly = false,
  linkedBookings,
  highlightId,
}: UnifiedInvoicesTabProps) {
  const { invoices, collections, billingItems: rawBillingItems, refresh } = financials;

  const invoiceLineage = useMemo(() => {
    return invoices.reduce((map, invoice: any) => {
      const bookingIds = Array.isArray(invoice.booking_ids)
        ? invoice.booking_ids.filter(Boolean)
        : invoice.booking_id
          ? [invoice.booking_id]
          : [];
      const projectRefs = Array.isArray(invoice.project_refs)
        ? invoice.project_refs.filter(Boolean)
        : invoice.project_number
          ? [invoice.project_number]
          : [];
      const contractRefs = Array.isArray(invoice.contract_refs)
        ? invoice.contract_refs.filter(Boolean)
        : (invoice.contract_number || invoice.quotation_number)
          ? [invoice.contract_number || invoice.quotation_number]
          : [];

      map.set(invoice.id, {
        bookingIds,
        projectRefs,
        contractRefs,
      });
      return map;
    }, new Map<string, { bookingIds: string[]; projectRefs: string[]; contractRefs: string[] }>());
  }, [invoices]);

  // -- Merge Virtual Items from Quotation --
  const resolvedLinkedBookings = linkedBookings || project.linkedBookings || [];
  const billingItems = useBillingMerge({
    items: rawBillingItems,
    quotation: project.quotation,
    projectId: project.id,
    linkedBookings: resolvedLinkedBookings,
  });
  
  // -- State --
  const [interfaceMode, setInterfaceMode] = useState<'none' | 'create' | 'view'>('none');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [highlightConsumed, setHighlightConsumed] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Deep-link: auto-open invoice if highlightId matches
  useEffect(() => {
    if (!highlightId || highlightConsumed || invoices.length === 0) return;
    const match = invoices.find((inv: Invoice) => inv.id === highlightId || inv.invoice_number === highlightId);
    if (match) {
      setSelectedInvoice(match);
      setInterfaceMode('view');
      setHighlightConsumed(true);
    }
  }, [highlightId, invoices, highlightConsumed]);

  // -- Helpers --
  const formatCurrency = (amount: number, currency: string = "PHP") => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const summarizeRefs = (refs: string[]) => {
    if (refs.length === 0) return "—";
    if (refs.length === 1) return refs[0];
    return `${refs[0]} +${refs.length - 1}`;
  };

  const getInvoiceDisplayStatus = (invoice: any) => {
    const lifecycleStatus = getInvoiceLifecycleStatus(invoice);
    if (lifecycleStatus) return lifecycleStatus;
    return calculateInvoiceBalance(invoice, collections).status;
  };

  // -- Filtering Logic --
  const filteredInvoices = useMemo(() => {
    return invoices.filter(item => {
      const status = getInvoiceDisplayStatus(item);

      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchInvoiceNo = item.invoice_number?.toLowerCase().includes(query);
        const matchCustomer = item.customer_name?.toLowerCase().includes(query);
        if (!matchInvoiceNo && !matchCustomer) return false;
      }

      // 2. Status Filter
      if (filterStatus && filterStatus !== "all") {
        if (filterStatus !== status) return false;
      }

      // 3. Date Range (Based on Invoice Date)
      if (dateFrom) {
        const itemDate = new Date(item.invoice_date || item.created_at);
        const fromDate = new Date(dateFrom);
        if (itemDate < fromDate) return false;
      }
      if (dateTo) {
        const itemDate = new Date(item.invoice_date || item.created_at);
        const toDate = new Date(dateTo);
        // Set to end of day
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }

      return true;
    });
  }, [invoices, collections, searchQuery, filterStatus, dateFrom, dateTo]);

  const activeFilteredInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => isInvoiceFinanciallyActive(invoice)),
    [filteredInvoices],
  );

  // -- Totals Calculation --
  const totalInvoiced = useMemo(() => {
    return activeFilteredInvoices.reduce((sum, item) => sum + (item.total_amount || item.amount || 0), 0);
  }, [activeFilteredInvoices]);

  const totalOutstanding = useMemo(() => {
    return activeFilteredInvoices.reduce((sum, item) => {
       const { balance } = calculateInvoiceBalance(item, collections);
       return sum + balance;
    }, 0);
  }, [activeFilteredInvoices, collections]);

  // -- Table Columns --
  const columns: ColumnDef<Invoice>[] = [
    {
      header: "Date",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-primary)] font-medium">
          {formatDate(item.invoice_date || item.created_at || "")}
        </span>
      )
    },
    {
      header: "Invoice No.",
      width: "120px",
      cell: (item) => (
        <span className="text-[12px] font-mono text-[var(--theme-action-primary-bg)] font-medium group-hover:underline decoration-[var(--theme-action-primary-bg)] underline-offset-2">
          {item.invoice_number}
        </span>
      )
    },
    {
      header: "Customer",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-secondary)] font-medium max-w-[200px] truncate block">
          {item.customer_name}
        </span>
      )
    },
    {
      header: "Lineage",
      width: "180px",
      cell: (item) => {
        const lineage = invoiceLineage.get(item.id) || { bookingIds: [], projectRefs: [], contractRefs: [] };
        return (
          <div className="text-[11px] leading-4">
            <div className="text-[var(--theme-text-primary)] font-medium">
              {lineage.bookingIds.length > 0 ? `${lineage.bookingIds.length} booking${lineage.bookingIds.length === 1 ? "" : "s"}` : "No bookings"}
            </div>
            <div className="text-[var(--theme-text-muted)]">
              {summarizeRefs(lineage.projectRefs.length > 0 ? lineage.projectRefs : lineage.contractRefs)}
            </div>
          </div>
        );
      }
    },
    {
      header: "Due Date",
      width: "120px",
      cell: (item) => {
        const dueDate = new Date(item.due_date || item.created_at || "");
        if (!item.due_date) dueDate.setDate(dueDate.getDate() + 30);
        return (
          <span className="text-[12px] text-[var(--theme-text-muted)]">
            {formatDate(dueDate.toISOString())}
          </span>
        );
      }
    },
    {
      header: "Balance",
      width: "120px",
      align: "right",
      cell: (item) => {
        if (!isInvoiceFinanciallyActive(item)) {
          return (
            <span className="text-[12px] text-[var(--theme-text-muted)]">
              â€”
            </span>
          );
        }
        const { balance } = calculateInvoiceBalance(item, collections);
        return (
          <span className="text-[12px] text-[var(--theme-text-muted)]">
            {formatCurrency(balance, item.currency)}
          </span>
        );
      }
    },
    {
      header: "Total",
      width: "120px",
      align: "right",
      cell: (item) => (
        <span className="text-[12px] font-bold text-[var(--theme-text-primary)]">
          {formatCurrency(item.total_amount ?? item.amount ?? 0, item.currency)}
        </span>
      )
    },
    {
      header: "Status",
      width: "100px",
      cell: (item) => {
        const status = getInvoiceDisplayStatus(item);
        
        let styles = "";
        let label = "";

        if (status === 'reversal_draft') {
          styles = "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)] border-[var(--theme-status-warning-border)]";
          label = "Reversal Draft";
        } else if (status === 'reversed') {
          styles = "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)] border-[var(--theme-border-default)]";
          label = "Reversed";
        } else if (status === 'paid') {
          styles = "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)] border-[var(--theme-status-success-border)]"; // Green
          label = "Paid";
        } else if (status === 'overdue') {
          styles = "bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)] border-[var(--theme-status-danger-border)]"; // Red
          label = "Overdue";
        } else if (status === 'partial') {
           styles = "bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)] border-[var(--theme-status-warning-border)]"; // Orange
           label = "Partial";
        } else {
          styles = "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)] border-[var(--neuron-semantic-info-border)]"; // Blue
          label = "Open";
        }

        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles}`}>
            {label}
          </span>
        );
      }
    }
  ];

  // -- Handlers --
  const handleCreateSuccess = () => {
    refresh();
    if (onRefresh) onRefresh();
    setInterfaceMode('none');
  };

  const handleClose = () => {
      setInterfaceMode('none');
      setSelectedInvoice(null);
  };

  // -- Invoice Creator / Viewer: full-page replacement (Disbursement-style) --
  if (interfaceMode !== 'none') {
    return (
      <InvoiceCreatorPage
        mode={interfaceMode === 'create' ? 'create' : 'view'}
        project={project}
        billingItems={billingItems as any[]}
        linkedBookings={resolvedLinkedBookings}
        invoice={selectedInvoice}
        onClose={handleClose}
        onSuccess={handleCreateSuccess}
        onRefreshData={refresh}
      />
    );
  }

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
            {title || "Project Invoices"}
          </h1>
          <p className="text-[14px] text-[var(--theme-text-muted)]">
            {subtitle || "Generate, track, and manage official invoices for this project."}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
           {!readOnly && (
             <button
               onClick={() => setInterfaceMode('create')}
               className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
             >
               <Plus size={16} />
               New Invoice
             </button>
           )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder="Search by Invoice # or Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] text-[13px] border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
          />
        </div>

        {/* Date Range */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        <span className="text-[13px] text-[var(--theme-text-muted)] font-medium">to</span>
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        
        {/* Status Filter */}
        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "", label: "All Status" },
              { value: "open", label: "Open" },
              { value: "partial", label: "Partial" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
              { value: "reversal_draft", label: "Reversal Draft" },
              { value: "reversed", label: "Reversed" }
            ]}
            placeholder="Status"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={filteredInvoices}
        columns={columns}
        emptyMessage="No invoices found matching your filters."
        onRowClick={(item) => {
            setSelectedInvoice(item);
            setInterfaceMode('view');
        }}
        rowClassName={() => "group"}
        icon={FileText}
        footerSummary={[
          { 
             label: "Total Outstanding", 
             value: <span className="text-[var(--theme-status-danger-fg)]">{formatCurrency(totalOutstanding)}</span> 
          },
          { 
             label: "Total Invoiced", 
             value: <span className="text-[var(--theme-text-secondary)]">{formatCurrency(totalInvoiced)}</span>
          }
        ]}
      />

    </div>
  );
}
