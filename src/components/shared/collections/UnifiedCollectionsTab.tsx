import { useMemo, useState } from "react";
import { Plus, Receipt, Search } from "lucide-react";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { FinancialContainer } from "../../../types/financials";
import { Collection } from "../../../types/accounting";
import { CollectionCreatorPanel } from "../../projects/collections/CollectionCreatorPanel";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { DataTable, ColumnDef } from "../../common/DataTable";
import { getCollectionResolutionLabel } from "../../../utils/collectionResolution";
import { formatMoney as formatMoneyHelper, pickReportingAmount } from "../../../utils/accountingCurrency";

interface UnifiedCollectionsTabProps {
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
  highlightId?: string | null;
}

const describeInvoiceApplication = (invoice: any) => {
  if (!invoice) return "1 Invoice";

  const bookingIds = Array.isArray(invoice.booking_ids)
    ? invoice.booking_ids.filter(Boolean)
    : invoice.booking_id
      ? [invoice.booking_id]
      : [];

  if (bookingIds.length === 0) return invoice.invoice_number || "1 Invoice";
  if (bookingIds.length === 1) return `${invoice.invoice_number || "Invoice"} | ${bookingIds[0]}`;
  return `${invoice.invoice_number || "Invoice"} | ${bookingIds.length} bookings`;
};

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

  const invoiceById = useMemo(() => {
    return invoices.reduce((map, invoice: any) => {
      map.set(invoice.id, invoice);
      return map;
    }, new Map<string, any>());
  }, [invoices]);

  const [interfaceMode, setInterfaceMode] = useState<"none" | "create" | "view">("none");
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [highlightConsumed, setHighlightConsumed] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  if (highlightId && !highlightConsumed && collections.length > 0) {
    const match = collections.find((collection: Collection) => collection.id === highlightId);
    if (match) {
      setSelectedCollection(match);
      setInterfaceMode("view");
      setHighlightConsumed(true);
    }
  }

  const formatCurrency = (amount: number, currency: string = "PHP") =>
    formatMoneyHelper(amount, currency as any);

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const describeApplication = (collection: any) => {
    const linkedInvoiceIds = Array.isArray(collection.linked_billings)
      ? collection.linked_billings
          .map((link: any) => link?.id)
          .filter(Boolean)
      : collection.invoice_id
        ? [collection.invoice_id]
        : [];

    if (linkedInvoiceIds.length === 0) return "Unallocated";

    const linkedInvoices = linkedInvoiceIds
      .map((invoiceId: string) => invoiceById.get(invoiceId))
      .filter(Boolean);

    if (linkedInvoices.length === 0) {
      return linkedInvoiceIds.length === 1 ? "1 Invoice" : `${linkedInvoiceIds.length} Invoices`;
    }

    if (linkedInvoices.length === 1) {
      return describeInvoiceApplication(linkedInvoices[0]);
    }

    const bookingCount = new Set(
      linkedInvoices.flatMap((invoice: any) =>
        Array.isArray(invoice.booking_ids)
          ? invoice.booking_ids.filter(Boolean)
          : invoice.booking_id
            ? [invoice.booking_id]
            : []
      )
    ).size;

    return bookingCount > 0
      ? `${linkedInvoices.length} Invoices | ${bookingCount} bookings`
      : `${linkedInvoices.length} Invoices`;
  };

  const filteredCollections = useMemo(() => {
    return collections.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchRef = item.collection_number?.toLowerCase().includes(query);
        const matchCustomer = item.customer_name?.toLowerCase().includes(query);
        const matchMethod = item.payment_method?.toLowerCase().includes(query);

        if (!matchRef && !matchCustomer && !matchMethod) return false;
      }

      if (filterStatus && filterStatus !== "all") {
        const status = (item.status || "").toLowerCase();
        if (filterStatus !== status) return false;
      }

      if (dateFrom) {
        const itemDate = new Date(item.collection_date || item.created_at);
        const fromDate = new Date(dateFrom);
        if (itemDate < fromDate) return false;
      }

      if (dateTo) {
        const itemDate = new Date(item.collection_date || item.created_at);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }

      return true;
    });
  }, [collections, searchQuery, filterStatus, dateFrom, dateTo]);

  // Aggregate in PHP base — collections may span USD and PHP.
  const totalCollections = useMemo(() => {
    return filteredCollections.reduce((sum, item) => sum + pickReportingAmount(item as any), 0);
  }, [filteredCollections]);

  const collectionsHaveMixedCurrency = useMemo(() => {
    const ccys = new Set(filteredCollections.map((c: any) => c.original_currency || c.currency || "PHP"));
    return ccys.size > 1;
  }, [filteredCollections]);

  const columns: ColumnDef<any>[] = [
    {
      header: "Date",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-primary)] font-medium">
          {formatDate(item.collection_date || item.created_at)}
        </span>
      ),
    },
    {
      header: "Reference",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] font-mono text-[var(--theme-action-primary-bg)] font-medium">
          {item.collection_number}
        </span>
      ),
    },
    {
      header: "Received From",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-secondary)] font-medium max-w-[200px] truncate block">
          {item.customer_name || "-"}
        </span>
      ),
    },
    {
      header: "Method",
      width: "140px",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-muted)]">
          {item.payment_method || "-"}
        </span>
      ),
    },
    {
      header: "Applied To",
      width: "180px",
      cell: (item) => (
        <span className="text-[12px] text-[var(--theme-text-muted)]">
          {describeApplication(item)}
        </span>
      ),
    },
    {
      header: "Amount",
      width: "120px",
      align: "right",
      cell: (item) => (
        <span className="text-[12px] font-bold text-[var(--theme-status-success-fg)]">
          {formatCurrency(item.amount, (item as any).original_currency || (item as any).currency || "PHP")}
        </span>
      ),
    },
    {
      header: "Status",
      width: "100px",
      cell: (item) => {
        const status = (item.status || "pending").toLowerCase();
        const isCleared = status === "cleared" || status === "deposited" || status === "posted";

        let styles = "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)] border-[var(--neuron-semantic-info-border)]";
        let label = item.status || "Pending";

        if (status === "credited") {
          styles = "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)] border-[var(--neuron-semantic-info-border)]";
          label = getCollectionResolutionLabel(item) || "Credited";
        } else if (status === "refunded") {
          styles = "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-secondary)] border-[var(--theme-border-default)]";
          label = getCollectionResolutionLabel(item) || "Refunded";
        } else if (isCleared) {
          styles = "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)] border-[var(--theme-status-success-border)]";
        }

        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider capitalize ${styles}`}>
            {label}
          </span>
        );
      },
    },
  ];

  const handleCreateSuccess = () => {
    refresh();
    if (onRefresh) onRefresh();
    setInterfaceMode("none");
  };

  const handleClose = () => {
    setInterfaceMode("none");
    setSelectedCollection(null);
  };

  const EmptyState = (
    <div className="flex flex-col items-center justify-center">
      <div className="w-12 h-12 bg-[var(--theme-bg-surface-subtle)] rounded-full flex items-center justify-center mb-3">
        <Receipt className="text-[var(--theme-text-muted)]" size={20} />
      </div>
      <p className="text-[14px] font-medium text-[var(--theme-text-primary)]">No collections found</p>
      <p className="text-[13px] text-[var(--theme-text-muted)] mt-1">Record a payment to get started.</p>
    </div>
  );

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)]">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
            {title || "Project Collections"}
          </h1>
          <p className="text-[14px] text-[var(--theme-text-muted)]">
            {subtitle || `Track payments received from ${project.customer_name}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!readOnly && (
            <button
              onClick={() => setInterfaceMode("create")}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
            >
              <Plus size={16} />
              Record Collection
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder="Search by Reference, Customer, or Method..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] text-[13px] border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
          />
        </div>

        <div style={{ minWidth: "140px" }}>
          <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>
        <span className="text-[13px] text-[var(--theme-text-muted)] font-medium">to</span>
        <div style={{ minWidth: "140px" }}>
          <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2.5" />
        </div>

        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "", label: "All Status" },
              { value: "cleared", label: "Cleared" },
              { value: "deposited", label: "Deposited" },
              { value: "pending", label: "Pending" },
              { value: "credited", label: "Customer Credit" },
              { value: "refunded", label: "Refunded" },
            ]}
            placeholder="Status"
          />
        </div>
      </div>

      <DataTable
        data={filteredCollections}
        columns={columns}
        isLoading={isLoading}
        emptyMessage={EmptyState}
        onRowClick={(item) => {
          setSelectedCollection(item);
          setInterfaceMode("view");
        }}
        rowClassName={() => "group"}
        icon={Receipt}
        footerSummary={[
          {
            label: collectionsHaveMixedCurrency ? "Total Collections (PHP base)" : "Total Collections",
            value: <span className="text-[var(--theme-text-secondary)]">{formatCurrency(totalCollections)}</span>,
          },
        ]}
      />

      <CollectionCreatorPanel
        isOpen={interfaceMode !== "none"}
        onClose={handleClose}
        project={project}
        existingInvoices={invoices}
        existingCollections={collections}
        initialData={selectedCollection}
        mode={interfaceMode === "create" ? "create" : "view"}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
