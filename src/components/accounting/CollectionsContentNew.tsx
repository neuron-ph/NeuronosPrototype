import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Plus, FileText, Search, Filter, Calendar, DollarSign, CreditCard, Banknote, Building2 } from "lucide-react";
import type { Collection } from "../../types/accounting";
import { apiFetch } from "../../utils/api";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CollectionDetailsSheet } from "./collections/CollectionDetailsSheet";

export function CollectionsContentNew() {
  const navigate = useNavigate();

  // State for data
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for UI
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  
  // Get current user
  const userData = localStorage.getItem("neuron_user");
  const currentUser = userData ? JSON.parse(userData) : null;

  // Check if user has collection access
  const hasCollectionAccess = 
    currentUser?.department === "Accounting" || 
    currentUser?.department === "Executive";

  // Fetch collections from API
  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // PHASE 4 FIX: Fetch from Universal E-Vouchers table
      const response = await apiFetch(`/evouchers`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();
      const evouchers = result.data || [];
      
      // Map E-Vouchers to Collection interface
      const mappedCollections = evouchers
        .filter((ev: any) => ev.transaction_type === 'collection')
        .map((ev: any) => {
          const isPosted = ev.status === 'posted' || ev.status === 'Posted';
          const primaryId = (isPosted && ev.ledger_entry_id) ? ev.ledger_entry_id : ev.id;
          
          return {
            id: primaryId,
            reference_number: ev.voucher_number,
            evoucher_number: ev.voucher_number,
            customer_name: ev.customer_name || ev.vendor_name || "Unknown Customer",
            description: ev.purpose || ev.description,
            project_number: ev.project_number,
            amount: ev.amount,
            collection_date: ev.request_date,
            payment_method: ev.payment_method || "Cash",
            received_by_name: ev.requestor_name,
            evoucher_id: ev.id,
            created_at: ev.created_at,
            // Extra fields that might be in EVoucher but mapped for UI
            status: ev.status
          };
        });

      console.log('✅ Fetched collections from E-Vouchers:', mappedCollections);
      setCollections(mappedCollections);
    } catch (err) {
      console.error('❌ Error fetching collections:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load collections';
      setError(errorMessage);
      
      // If it's a network error, show a more helpful message
      if (errorMessage.includes('Failed to fetch')) {
        setError('Unable to connect to server. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredCollections = useMemo(() => {
    let filtered = collections;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(collection =>
        collection.description?.toLowerCase().includes(query) ||
        collection.customer_name?.toLowerCase().includes(query) ||
        collection.evoucher_number?.toLowerCase().includes(query) ||
        collection.reference_number?.toLowerCase().includes(query) ||
        collection.project_number?.toLowerCase().includes(query)
      );
    }

    // Payment method filter
    if (paymentMethodFilter && paymentMethodFilter !== "all") {
      filtered = filtered.filter(collection => collection.payment_method === paymentMethodFilter);
    }

    // Sort by collection date descending
    filtered.sort((a, b) => 
      new Date(b.collection_date).getTime() - new Date(a.collection_date).getTime()
    );

    return filtered;
  }, [collections, searchQuery, paymentMethodFilter]);

  // Get unique payment methods for filter dropdown
  const paymentMethods = useMemo(() => {
    const methods = new Set(collections.map(c => c.payment_method).filter(Boolean));
    return Array.from(methods).sort();
  }, [collections]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case "Cash":
        return "bg-[#FEF3E7] text-[#C88A2B]";
      case "Bank Transfer":
        return "bg-[#E8F5F3] text-[#0F766E]";
      case "Check":
        return "bg-[#DBEAFE] text-[#1D4ED8]";
      case "Credit Card":
        return "bg-[#F3E8FF] text-[#7C3AED]";
      default:
        return "bg-[#F3F4F6] text-[#6B7280]";
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (method) {
      case "Cash":
        return <Banknote {...iconProps} />;
      case "Bank Transfer":
        return <Building2 {...iconProps} />;
      case "Check":
        return <FileText {...iconProps} />;
      case "Credit Card":
        return <CreditCard {...iconProps} />;
      default:
        return <DollarSign {...iconProps} />;
    }
  };

  // Define table columns
  const columns: ColumnDef<Collection>[] = [
    {
      key: "reference",
      label: "Reference #",
      width: "140px",
      sortable: true,
      render: (collection) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            {collection.reference_number || collection.evoucher_number}
          </span>
          {collection.evoucher_id && (
            <span
              style={{
                fontSize: "11px",
                color: "#0F766E",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <FileText size={10} />
              E-Voucher
            </span>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      width: "200px",
      sortable: true,
      render: (collection) => (
        <span style={{ fontWeight: 500 }}>{collection.customer_name || "N/A"}</span>
      ),
    },
    {
      key: "description",
      label: "Description",
      width: "1fr",
      render: (collection) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span>{collection.description}</span>
          {collection.project_number && (
            <span style={{ fontSize: "12px", color: "#0F766E", fontWeight: 500 }}>
              {collection.project_number}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: "140px",
      align: "right",
      sortable: true,
      render: (collection) => (
        <span style={{ fontWeight: 600, fontSize: "15px" }}>
          {formatCurrency(collection.amount)}
        </span>
      ),
    },
    {
      key: "collection_date",
      label: "Date",
      width: "110px",
      sortable: true,
      render: (collection) => (
        <span style={{ fontSize: "13px" }}>{formatDate(collection.collection_date)}</span>
      ),
    },
    {
      key: "payment_method",
      label: "Method",
      width: "130px",
      render: (collection) => {
        const methodStyle = getPaymentMethodColor(collection.payment_method);
        return (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              background: methodStyle.bg,
              color: methodStyle.color,
              display: "inline-block",
            }}
          >
            {collection.payment_method}
          </span>
        );
      },
    },
    {
      key: "received_by",
      label: "Received By",
      width: "140px",
      render: (collection) => (
        <span style={{ fontSize: "13px", color: "#667085" }}>
          {collection.received_by_name}
        </span>
      ),
    },
  ];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF"
      }}
    >
      {/* Header */}
      <div style={{ padding: "32px 48px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px"
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 600,
                color: "#12332B",
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}
            >
              Collections
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Track customer payments and receipt transactions
            </p>
          </div>

          {/* Action Buttons */}
          {hasCollectionAccess && (
            <button
              onClick={() => setShowAddPanel(true)}
              style={{
                height: "48px",
                padding: "0 24px",
                borderRadius: "16px",
                background: "#0F766E",
                border: "none",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#0D6560";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#0F766E";
              }}
            >
              <Plus size={20} />
              Record Collection
            </button>
          )}
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input
              type="text"
              placeholder="Search collections by customer, reference, or E-Voucher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "#FFFFFF",
                color: "var(--neuron-ink-primary)"
              }}
            />
          </div>

          {/* Payment Method Filter */}
          <CustomDropdown
            label=""
            value={paymentMethodFilter}
            onChange={(value) => setPaymentMethodFilter(value)}
            options={[
              { value: "all", label: "All Payment Methods" },
              ...paymentMethods.map(method => ({ value: method, label: method }))
            ]}
          />

          {/* Date Range Filter */}
          <CustomDropdown
            label=""
            value="all"
            onChange={(value) => {
              // TODO: Implement date range filtering logic
            }}
            options={[
              { value: "all", label: "All Time", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "today", label: "Today", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#0F766E" }} /> },
              { value: "this-week", label: "This Week", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "this-month", label: "This Month", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#6B7A76" }} /> }
            ]}
          />
        </div>
      </div>

      {/* Collections Table */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-6">
        {loading ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div className="px-6 py-12 text-center" style={{ color: "#667085" }}>
              Loading collections...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <div style={{ 
                width: "64px", 
                height: "64px", 
                borderRadius: "50%", 
                backgroundColor: "#FEE2E2", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: "32px"
              }}>
                ⚠️
              </div>
              <p style={{ fontSize: "16px", color: "#EF4444", marginBottom: "8px", fontWeight: 500 }}>
                Error loading collections
              </p>
              <p style={{ fontSize: "14px", color: "#667085", marginBottom: "16px" }}>{error}</p>
              <button
                onClick={fetchCollections}
                style={{
                  padding: "10px 20px",
                  background: "#0F766E",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div className="px-6 py-12 text-center">
              <DollarSign className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
              <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">
                {searchQuery ? "No collections found" : "No collections recorded yet"}
              </h3>
              <p style={{ color: "var(--neuron-ink-muted)" }}>
                {searchQuery 
                  ? "Try adjusting your search query or filters"
                  : "Collections will appear here once customer payments are recorded and posted"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "#FFFFFF",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            {/* Table Header */}
            <div className="grid grid-cols-[32px_minmax(240px,1fr)_180px_160px_140px_1fr] gap-3 px-4 py-2 border-b" style={{ 
              backgroundColor: "var(--neuron-bg-page)",
              borderColor: "var(--neuron-ui-divider)"
            }}>
              <div></div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Description</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Customer</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Payment Method</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em] text-right" style={{ color: "var(--neuron-ink-muted)" }}>Amount</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.002em] pl-8" style={{ color: "var(--neuron-ink-muted)" }}>Reference</div>
            </div>

            {/* Collection Rows */}
            <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
              {filteredCollections.map(collection => (
                <div
                  key={collection.id}
                  className="grid grid-cols-[32px_minmax(240px,1fr)_180px_160px_140px_1fr] gap-3 px-4 py-3 transition-colors cursor-pointer"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => {
                    setSelectedCollectionId(collection.id);
                    setIsSheetOpen(true);
                  }}
                >
                  {/* Icon Column */}
                  <div className="flex items-center justify-center">
                    {getPaymentMethodIcon(collection.payment_method)}
                  </div>

                  {/* Description */}
                  <div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
                      {collection.description}
                    </div>
                    {collection.project_number && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                        Project: {collection.project_number}
                      </div>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                    {collection.customer_name || "—"}
                  </div>

                  {/* Payment Method Badge + Date */}
                  <div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getPaymentMethodColor(collection.payment_method)}`}>
                      {collection.payment_method}
                    </span>
                    <div className="text-[10px] mt-1" style={{ color: "var(--neuron-ink-muted)" }}>
                      {formatDate(collection.collection_date)}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-[13px] font-semibold text-right" style={{ color: "var(--neuron-ink-primary)" }}>
                    {formatCurrency(collection.amount)}
                  </div>

                  {/* Reference */}
                  <div className="text-[11px] pl-8" style={{ color: "#0F766E", fontWeight: 500 }}>
                    {collection.reference_number || collection.evoucher_number || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Collection Panel */}
      {showAddPanel && (
        <AddRequestForPaymentPanel
          context="collection"
          isOpen={showAddPanel}
          onClose={() => setShowAddPanel(false)}
          onSave={async () => {
            await fetchCollections();
            setShowAddPanel(false);
          }}
          defaultRequestor={currentUser?.name || "Current User"}
        />
      )}
      
      {/* View Collection Details Sheet */}
      <CollectionDetailsSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        collectionId={selectedCollectionId}
      />
    </div>
  );
}