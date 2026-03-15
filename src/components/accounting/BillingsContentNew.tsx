import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, Calendar } from "lucide-react";
import type { Billing } from "../../types/accounting";
import { apiFetch } from "../../utils/api";
import { AddRequestForPaymentPanel } from "./AddRequestForPaymentPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { BillingsListTable } from "./BillingsListTable";

export function BillingsContentNew() {
  const navigate = useNavigate();

  // State for data
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for UI
  const [showAddPanel, setShowAddPanel] = useState(false);
  
  // State for filters
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  
  // Get current user
  const userData = localStorage.getItem("neuron_user");
  const currentUser = userData ? JSON.parse(userData) : null;

  // Check if user has billing access
  const hasBillingAccess = 
    currentUser?.department === "Accounting" || 
    currentUser?.department === "Executive";

  // Fetch billings from API
  useEffect(() => {
    fetchBillings();
  }, []);

  const fetchBillings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // PHASE 1 FIX: Fetch from Universal E-Vouchers table
      const response = await apiFetch(`/evouchers`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();
      const evouchers = result.data || [];
      
      // Map E-Vouchers to Billing interface
      const mappedBillings = evouchers
        .filter((ev: any) => ev.transaction_type === 'billing')
        .map((ev: any) => {
          const isPosted = ev.status === 'posted' || ev.status === 'Posted';
          // Use ledger_entry_id as the primary ID if posted (this links to the real billing record)
          // Otherwise use evoucher ID (this links to the virtual billing record)
          const primaryId = (isPosted && ev.ledger_entry_id) ? ev.ledger_entry_id : ev.id;
          
          return {
            id: primaryId,
            invoice_number: ev.voucher_number,
            evoucher_number: ev.voucher_number,
            customer_name: ev.customer_name || ev.vendor_name || "Unknown Customer", // Fallback
            description: ev.purpose || ev.description,
            project_number: ev.project_number,
            total_amount: ev.amount,
            amount_due: ev.amount, // TODO: Calculate based on payments
            invoice_date: ev.request_date,
            due_date: ev.due_date || ev.request_date,
            payment_status: isPosted ? 'unpaid' : 'pending', // Default to unpaid if posted, pending otherwise
            evoucher_id: ev.id,
            created_at: ev.created_at
          };
        });

      console.log('✅ Fetched billings from E-Vouchers:', mappedBillings);
      setBillings(mappedBillings);
    } catch (err) {
      console.error('❌ Error fetching billings:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load billings';
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
  const filteredBillings = useMemo(() => {
    let filtered = billings;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(billing =>
        billing.description?.toLowerCase().includes(query) ||
        billing.customer_name?.toLowerCase().includes(query) ||
        billing.invoice_number?.toLowerCase().includes(query) ||
        billing.evoucher_number?.toLowerCase().includes(query) ||
        billing.project_number?.toLowerCase().includes(query)
      );
    }

    // Payment status filter
    if (paymentStatusFilter && paymentStatusFilter !== "all") {
      filtered = filtered.filter(billing => billing.payment_status === paymentStatusFilter);
    }

    // Sort by invoice date descending
    filtered.sort((a, b) => 
      new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
    );

    return filtered;
  }, [billings, searchQuery, paymentStatusFilter]);

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
              Billings
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Manage customer invoices and billing transactions
            </p>
          </div>

          {/* Action Buttons */}
          {hasBillingAccess && (
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
              Create Invoice
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
              placeholder="Search invoices by customer, invoice number, or E-Voucher..."
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

          {/* Payment Status Filter */}
          <CustomDropdown
            label=""
            value={paymentStatusFilter}
            onChange={(value) => setPaymentStatusFilter(value)}
            options={[
              { value: "all", label: "All Payment Status" },
              { value: "unpaid", label: "Unpaid" },
              { value: "partial", label: "Partially Paid" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
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

      {/* Billings Table */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-6">
        <BillingsListTable 
          billings={filteredBillings} 
          isLoading={loading} 
        />
      </div>

      {/* Add Billing Panel */}
      {showAddPanel && (
        <AddRequestForPaymentPanel
          context="billing"
          isOpen={showAddPanel}
          onClose={() => setShowAddPanel(false)}
          onSuccess={async () => {
            await fetchBillings();
            setShowAddPanel(false);
          }}
          defaultRequestor={currentUser?.name || "Current User"}
        />
      )}
    </div>
  );
}