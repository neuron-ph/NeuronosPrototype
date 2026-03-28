import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { useNavigate } from "react-router";
import { Plus, FileText, Search, Filter, Calendar, DollarSign, CreditCard, Banknote, Building2 } from "lucide-react";
import type { Collection } from "../../types/accounting";
import { supabase } from "../../utils/supabase/client";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CollectionDetailsSheet } from "./collections/CollectionDetailsSheet";

export function CollectionsContentNew() {
  const navigate = useNavigate();

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

  const { data: rawEvouchers = [], isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.evouchers.list("collections"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evouchers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load collections') : null;

  // Map E-Vouchers to Collection interface
  const collections: Collection[] = useMemo(() => {
    return rawEvouchers
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
          status: ev.status,
        };
      });
  }, [rawEvouchers]);

  const fetchCollections = () => { refetch(); };

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
      new Date(b.collection_date || "").getTime() - new Date(a.collection_date || "").getTime()
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
        return "bg-[var(--theme-bg-surface-tint)] text-[var(--theme-action-primary-bg)]";
      case "Check":
        return "bg-[#DBEAFE] text-[#1D4ED8]";
      case "Credit Card":
        return "bg-[#F3E8FF] text-[#7C3AED]";
      default:
        return "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)]";
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

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--theme-bg-surface)"
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
                color: "var(--theme-text-primary)",
                marginBottom: "4px",
                letterSpacing: "-1.2px"
              }}
            >
              Collections
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
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
                e.currentTarget.style.background = "var(--theme-action-primary-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--theme-action-primary-bg)";
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
                backgroundColor: "var(--theme-bg-surface)",
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
              ...paymentMethods.map(method => ({ value: method || "", label: method || "" }))
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
              { value: "today", label: "Today", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-action-primary-bg)" }} /> },
              { value: "this-week", label: "This Week", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "this-month", label: "This Month", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} /> }
            ]}
          />
        </div>
      </div>

      {/* Collections Table */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-6">
        {loading ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div className="px-6 py-12 text-center" style={{ color: "var(--theme-text-muted)" }}>
              Loading collections...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
              <div style={{ 
                width: "64px", 
                height: "64px", 
                borderRadius: "50%", 
                backgroundColor: "var(--theme-status-danger-bg)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: "32px"
              }}>
                ⚠️
              </div>
              <p style={{ fontSize: "16px", color: "var(--theme-status-danger-fg)", marginBottom: "8px", fontWeight: 500 }}>
                Error loading collections
              </p>
              <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginBottom: "16px" }}>{error}</p>
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
            backgroundColor: "var(--theme-bg-surface)",
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
            backgroundColor: "var(--theme-bg-surface)",
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
                    {getPaymentMethodIcon(collection.payment_method || "")}
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
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getPaymentMethodColor(collection.payment_method || "")}`}>
                      {collection.payment_method}
                    </span>
                    <div className="text-[10px] mt-1" style={{ color: "var(--neuron-ink-muted)" }}>
                      {formatDate(collection.collection_date || "")}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-[13px] font-semibold text-right" style={{ color: "var(--neuron-ink-primary)" }}>
                    {formatCurrency(collection.amount)}
                  </div>

                  {/* Reference */}
                  <div className="text-[11px] pl-8" style={{ color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
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
          onSuccess={async () => {
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