import { useState, useMemo } from "react";
import { Search, Plus, Filter, Receipt } from "lucide-react";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { Project } from "../../../types/pricing";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { CollectionCreatorPanel } from "../../projects/collections/CollectionCreatorPanel";
import { DataTable, ColumnDef } from "../../common/DataTable";
import { Collection } from "../../../types/accounting";

interface UnifiedCollectionsTabProps {
  financials: FinancialData;
  project: Project;
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
  highlightId?: string | null;
}

export function UnifiedCollectionsTab({ 
  financials, 
  project, 
  currentUser,
  onRefresh,
  title,
  subtitle,
  readOnly = false,
  highlightId,
}: UnifiedCollectionsTabProps) {
  const { collections, invoices, refresh, isLoading } = financials;
  
  // -- State --
  const [interfaceMode, setInterfaceMode] = useState<'none' | 'create' | 'view'>('none');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [highlightConsumed, setHighlightConsumed] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Deep-link: auto-select collection if highlightId matches
  // Using useMemo + state check since collections may load async
  if (highlightId && !highlightConsumed && collections.length > 0) {
    const match = collections.find((c: Collection) => c.id === highlightId);
    if (match) {
      setSelectedCollection(match);
      setInterfaceMode('view');
      setHighlightConsumed(true);
    }
  }

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

  // -- Filtering Logic --
  const filteredCollections = useMemo(() => {
    return collections.filter(item => {
      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchRef = item.collection_number?.toLowerCase().includes(query);
        const matchCustomer = item.customer_name?.toLowerCase().includes(query);
        const matchMethod = item.payment_method?.toLowerCase().includes(query);

        if (!matchRef && !matchCustomer && !matchMethod) return false;
      }

      // 2. Status Filter
      if (filterStatus && filterStatus !== "all") {
        const status = (item.status || "").toLowerCase();
        if (filterStatus !== status) return false;
      }

      // 3. Date Range (Based on Collection Date)
      if (dateFrom) {
        const itemDate = new Date(item.collection_date || item.created_at);
        const fromDate = new Date(dateFrom);
        if (itemDate < fromDate) return false;
      }
      if (dateTo) {
        const itemDate = new Date(item.collection_date || item.created_at);
        const toDate = new Date(dateTo);
        // Set to end of day
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }

      return true;
    });
  }, [collections, searchQuery, filterStatus, dateFrom, dateTo]);

  // -- Totals --
  const totalCollections = useMemo(() => {
    return filteredCollections.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [filteredCollections]);

  // -- Table Columns --
  const columns: ColumnDef<any>[] = [
    {
      header: "Date",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[#0A1D4D] font-medium">
          {formatDate(item.collection_date || item.created_at)}
        </span>
      )
    },
    {
      header: "Reference",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] font-mono text-[#0F766E] font-medium">
          {item.collection_number}
        </span>
      )
    },
    {
      header: "Received From",
      cell: (item) => (
        <span className="text-[12px] text-[#344054] font-medium max-w-[200px] truncate block">
          {item.customer_name || "—"}
        </span>
      )
    },
    {
      header: "Method",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[#667085]">
          {item.payment_method || "—"}
        </span>
      )
    },
    {
      header: "Applied To",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[#667085]">
          {item.invoice_id ? "1 Invoice" : "Unallocated"}
        </span>
      )
    },
    {
      header: "Amount",
      width: "120px",
      align: "right",
      cell: (item) => (
        <span className="text-[12px] font-bold text-[#059669]">
          {formatCurrency(item.amount)}
        </span>
      )
    },
    {
      header: "Status",
      width: "100px",
      cell: (item) => {
        const status = (item.status || "pending").toLowerCase();
        const isCleared = status === 'cleared' || status === 'deposited' || status === 'posted';
        
        const styles = isCleared
          ? "bg-[#ECFDF5] text-[#027A48] border-[#A6F4C5]" 
          : "bg-[#EFF6FF] text-[#175CD3] border-[#B2DDFF]";
        
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider capitalize ${styles}`}>
            {item.status || "Pending"}
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
    setSelectedCollection(null);
  };

  const EmptyState = (
    <div className="flex flex-col items-center justify-center">
      <div className="w-12 h-12 bg-[#F3F4F6] rounded-full flex items-center justify-center mb-3">
          <Receipt className="text-[#98A2B3]" size={20} />
      </div>
      <p className="text-[14px] font-medium text-[#101828]">No collections found</p>
      <p className="text-[13px] text-[#667085] mt-1">Record a payment to get started.</p>
    </div>
  );

  return (
    <div className="flex flex-col bg-white">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[#12332B] mb-1 tracking-tight">
            {title || "Project Collections"}
          </h1>
          <p className="text-[14px] text-[#667085]">
            {subtitle || `Track payments received from ${project.customer_name}`}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
           {!readOnly && (
             <button
               onClick={() => setInterfaceMode('create')}
               className="flex items-center gap-2 px-4 py-2 bg-[#0F766E] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
             >
               <Plus size={16} />
               Record Collection
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
            placeholder="Search by Reference, Customer, or Method..."
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
              { value: "cleared", label: "Cleared" },
              { value: "deposited", label: "Deposited" },
              { value: "pending", label: "Pending" }
            ]}
            placeholder="Status"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={filteredCollections}
        columns={columns}
        isLoading={isLoading}
        emptyMessage={EmptyState}
        onRowClick={(item) => {
            setSelectedCollection(item);
            setInterfaceMode('view');
        }}
        rowClassName={() => "group"}
        icon={Receipt}
        footerSummary={[
          {
            label: "Total Collections",
            value: <span className="text-[#374151]">{formatCurrency(totalCollections)}</span>
          }
        ]}
      />

      {/* Collection Creator/Viewer Panel */}
      <CollectionCreatorPanel
        isOpen={interfaceMode !== 'none'}
        onClose={handleClose}
        project={project}
        existingInvoices={invoices} // Inject invoices here
        initialData={selectedCollection}
        mode={interfaceMode === 'create' ? 'create' : 'view'}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}