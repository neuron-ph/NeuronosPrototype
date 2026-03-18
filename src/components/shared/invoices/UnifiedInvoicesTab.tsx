import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, Filter, ArrowLeft, Loader2, X, FileText } from "lucide-react";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { FinancialContainer } from "../../../types/financials";
import { Invoice } from "../../../types/accounting";
import { InvoiceBuilder } from "../../../components/projects/invoices/InvoiceBuilder";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { SidePanel } from "../../common/SidePanel";
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
        <span className="text-[12px] text-[#0A1D4D] font-medium">
          {formatDate(item.invoice_date || item.created_at)}
        </span>
      )
    },
    {
      header: "Invoice No.",
      width: "120px",
      cell: (item) => (
        <span className="text-[12px] font-mono text-[#0F766E] font-medium group-hover:underline decoration-[#0F766E] underline-offset-2">
          {item.invoice_number}
        </span>
      )
    },
    {
      header: "Customer",
      cell: (item) => (
        <span className="text-[12px] text-[#344054] font-medium max-w-[200px] truncate block">
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
            <div className="text-[#12332B] font-medium">
              {lineage.bookingIds.length > 0 ? `${lineage.bookingIds.length} booking${lineage.bookingIds.length === 1 ? "" : "s"}` : "No bookings"}
            </div>
            <div className="text-[#667085]">
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
        const dueDate = new Date(item.due_date || item.created_at);
        if (!item.due_date) dueDate.setDate(dueDate.getDate() + 30);
        return (
          <span className="text-[12px] text-[#667085]">
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
            <span className="text-[12px] text-[#98A2B3]">
              â€”
            </span>
          );
        }
        const { balance } = calculateInvoiceBalance(item, collections);
        return (
          <span className="text-[12px] text-[#667085]">
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
        <span className="text-[12px] font-bold text-[#12332B]">
          {formatCurrency(item.total_amount || item.amount, item.currency)}
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
          styles = "bg-[#FEF3C7] text-[#B45309] border-[#FCD34D]";
          label = "Reversal Draft";
        } else if (status === 'reversed') {
          styles = "bg-[#F3F4F6] text-[#475467] border-[#D0D5DD]";
          label = "Reversed";
        } else if (status === 'paid') {
          styles = "bg-[#ECFDF5] text-[#059669] border-[#A6F4C5]"; // Green
          label = "Paid";
        } else if (status === 'overdue') {
          styles = "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"; // Red
          label = "Overdue";
        } else if (status === 'partial') {
           styles = "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]"; // Orange
           label = "Partial";
        } else {
          styles = "bg-[#EFF6FF] text-[#2563EB] border-[#B2DDFF]"; // Blue
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

  // SidePanel Header
  const PanelHeader = (
    <div className="flex items-center justify-between w-full">
         <div>
            <h2 className="text-xl font-bold text-[#12332B]">
                {interfaceMode === 'create' ? "Invoice Creator" : "Invoice Viewer"}
            </h2>
            <p className="text-[13px] text-[#667085]">
                {interfaceMode === 'create' 
                    ? `Drafting for ${project.customer_name}` 
                    : selectedInvoice?.invoice_number || "Viewing Invoice"
                }
            </p>
         </div>
         <button
            onClick={handleClose}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#667085] hover:bg-[#F3F4F6] transition-colors"
         >
            <X size={20} />
         </button>
    </div>
  );

  return (
    <div className="flex flex-col bg-white">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[#12332B] mb-1 tracking-tight">
            {title || "Project Invoices"}
          </h1>
          <p className="text-[14px] text-[#667085]">
            {subtitle || "Generate, track, and manage official invoices for this project."}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
           {!readOnly && (
             <button
               onClick={() => setInterfaceMode('create')}
               className="flex items-center gap-2 px-4 py-2 bg-[#0F766E] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3]" />
          <input
            type="text"
            placeholder="Search by Invoice # or Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E] text-[13px] border border-[#E5E9F0] bg-white text-[#101828] placeholder-[#98A2B3]"
          />
        </div>

        {/* Date Range */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        <span className="text-[13px] text-[#6B7280] font-medium">to</span>
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
             value: <span className="text-[#DC2626]">{formatCurrency(totalOutstanding)}</span> 
          },
          { 
             label: "Total Invoiced", 
             value: <span className="text-[#374151]">{formatCurrency(totalInvoiced)}</span>
          }
        ]}
      />

      {/* Invoice Interface Side Panel (Unified) */}
      <SidePanel
        isOpen={interfaceMode !== 'none'}
        onClose={handleClose}
        width="85vw"
        title={PanelHeader}
        showCloseButton={false}
      >
        <div className="h-full bg-white">
             {interfaceMode !== 'none' && (
                 <InvoiceBuilder 
                    mode={interfaceMode === 'create' ? 'create' : 'view'}
                    project={project}
                    billingItems={billingItems} 
                    linkedBookings={resolvedLinkedBookings}
                    invoice={selectedInvoice || undefined}
                    onSuccess={handleCreateSuccess}
                    onRefreshData={refresh}
                    onBack={handleClose}
                 />
             )}
        </div>
      </SidePanel>
    </div>
  );
}
