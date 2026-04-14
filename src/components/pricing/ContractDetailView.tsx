/**
 * ContractDetailView
 *
 * Dedicated detail view for Contract Quotations.
 * Categorized tabs matching ProjectDetail pattern:
 *   Dashboard (Financial Overview, Rate Card) |
 *   Operations (Bookings) |
 *   Accounting (Billings, Invoices, Collections, Expenses) |
 *   Collaboration (Attachments, Comments)
 *
 * @see /docs/blueprints/CONTRACT_PARITY_BLUEPRINT.md
 * @see /docs/blueprints/CONTRACT_QUOTATION_BLUEPRINT.md - Phase 3, Task 3.3
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { ArrowLeft, Edit3, RefreshCw, FileText, Calendar, Building2, Briefcase, Ship, Shield, Truck, Clock, Zap, Plus, ChevronDown, Layout, Layers, Users, Receipt, FileStack, DollarSign, TrendingUp, Paperclip, MessageSquare, Eye, MoreVertical } from "lucide-react";
import type { QuotationNew, ContractRateMatrix } from "../../types/pricing";
import type { FinancialContainer } from "../../types/financials";
import { ContractRateCardV2 as ContractRateMatrixEditor } from "./quotations/ContractRateCardV2";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { logCreation, logStatusChange } from "../../utils/activityLog";
import { CreateBookingFromContractPanel } from "../contracts/CreateBookingFromContractPanel";
import type { InquiryService } from "../../types/pricing";
import { useContractFinancials } from "../../hooks/useContractFinancials";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { ProjectFinancialOverview } from "../projects/tabs/ProjectFinancialOverview";
import { UnifiedInvoicesTab } from "../shared/invoices/UnifiedInvoicesTab";
import { UnifiedCollectionsTab } from "../shared/collections/UnifiedCollectionsTab";
import { ProjectExpensesTab } from "../projects/ProjectExpensesTab";
import { ProjectBookingReadOnlyView } from "../projects/ProjectBookingReadOnlyView";
import { EntityAttachmentsTab } from "../shared/EntityAttachmentsTab";
import { CommentsTab } from "../shared/CommentsTab";
import { ContractStatusSelector } from "../contracts/ContractStatusSelector";
import { getServiceIcon as getServiceIconShared, formatShortDate } from "../../utils/quotation-helpers";
import { BookingsTable } from "../shared/BookingsTable";
import {
  getNormalizedContractStatus,
  getNormalizedQuotationStatus,
} from "../../utils/quotationStatus";

// ============================================
// TYPES
// ============================================

interface ContractDetailViewProps {
  quotation: QuotationNew;
  onBack: () => void;
  onEdit: () => void;
  onUpdate?: (quotation: QuotationNew) => void;
  currentUser?: { name: string; email: string; department: string } | null;
  initialTab?: string | null;
  highlightId?: string | null;
}

type ContractTab = "financial_overview" | "rate-card" | "bookings" | "billings" | "invoices" | "collections" | "expenses" | "attachments" | "comments" | "activity";

type TabCategory = "dashboard" | "operations" | "accounting" | "collaboration";

// ============================================
// HELPERS
// ============================================

/** Alias shared formatShortDate — same format as original local formatDate */
const formatDate = formatShortDate;

const getStatusColor = (status: string) => {
  switch (status) {
    case "Draft": return { text: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" };
    case "Sent": return { text: "var(--neuron-semantic-info)", bg: "var(--neuron-semantic-info-bg)" };
    case "Active": return { text: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" };
    case "Expiring": return { text: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" };
    case "Expired": return { text: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" };
    case "Renewed": return { text: "var(--neuron-status-accent-fg)", bg: "var(--neuron-status-accent-bg)" };
    default: return { text: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" };
  }
};

/** Contract uses teal icons at size 15 */
const getServiceIcon = (service: string) => getServiceIconShared(service, { size: 15, color: "var(--theme-action-primary-bg)" });

const getDaysRemaining = (endDate?: string) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
};

// ============================================
// MAIN COMPONENT
// ============================================

export function ContractDetailView({
  quotation,
  onBack,
  onEdit,
  onUpdate,
  currentUser,
  initialTab,
  highlightId,
}: ContractDetailViewProps) {
  const [activeTab, setActiveTab] = useState<ContractTab>(
    (initialTab as ContractTab) || "financial_overview"
  );
  const [activeCategory, setActiveCategory] = useState<TabCategory>("dashboard");
  const bookingsTabActive = ["bookings", "billings", "expenses", "invoices", "collections"].includes(activeTab);

  // ✨ CONTRACT PARITY Phase 5: Activity log
  const { data: activityEvents = [], isFetching: isLoadingActivity } = useQuery({
    queryKey: ["contract_activity", quotation.id],
    queryFn: async () => {
      const { data } = await supabase.from('contract_activity').select('*').eq('contract_id', quotation.id).order('created_at', { ascending: false });
      return data && data.length > 0 ? data : [];
    },
    enabled: activeTab === "activity" && !!quotation.id,
    staleTime: 30_000,
  });

  // Linked bookings (fetched when financial/ops tabs active)
  const { data: linkedBookings = [], isFetching: isLoadingBookings } = useQuery({
    queryKey: ["bookings", "contract_linked", quotation.id],
    queryFn: async () => {
      const tables = ['forwarding_bookings', 'brokerage_bookings', 'trucking_bookings', 'marine_insurance_bookings', 'others_bookings'];
      const allBookings: any[] = [];
      for (const table of tables) {
        const { data } = await supabase.from(table).select('*').eq('contract_id', quotation.id);
        if (data) allBookings.push(...data);
      }
      if (allBookings.length > 0) return allBookings;
      return (quotation as any).linkedBookings || [];
    },
    enabled: bookingsTabActive && !!quotation.id,
    staleTime: 30_000,
  });

  // Contract financial data is resolved through the shared booking-first container hook.
  const linkedBookingIds = linkedBookings.map((b: any) => b.bookingId || b.id).filter(Boolean);
  const contractFinancials = useContractFinancials(
    quotation.quote_number,
    linkedBookingIds,
    quotation.id
  );

  // Renewal modal state
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewStart, setRenewStart] = useState("");
  const [renewEnd, setRenewEnd] = useState("");
  const [isRenewing, setIsRenewing] = useState(false);

  // ✨ PHASE 3: Create Booking from Contract state
  const [showCreateBooking, setShowCreateBooking] = useState(false);
  const [createBookingService, setCreateBookingService] = useState<InquiryService | null>(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  // ✨ CONTRACTS MODULE: Activate contract state
  const [isActivating, setIsActivating] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // ✨ CONTRACT PARITY Phase 3: Booking drill-down + Generate Billing state
  const [selectedBooking, setSelectedBooking] = useState<{ bookingId: string; bookingType: string } | null>(null);
  const [generatingBillingId, setGeneratingBillingId] = useState<string | null>(null);

  const financialContainer = useMemo<FinancialContainer>(
    () => ({
      id: quotation.id,
      project_number: quotation.quote_number,
      customer_id: quotation.customer_id,
      customer_name: quotation.customer_name,
      currency: quotation.currency,
      commodity: quotation.commodity,
      linkedBookings,
      quotation,
    }),
    [quotation, linkedBookings],
  );

  const handleActivateContract = async () => {
    setIsActivating(true);
    try {
      const activationPayload = {
        contract_status: "Active" as QuotationNew["contract_status"],
        status: "Converted to Contract" as QuotationNew["status"],
        updated_at: new Date().toISOString(),
      };
      const updatedQuotation: QuotationNew = {
        ...quotation,
        ...activationPayload,
      };

      const { error } = await supabase.from('quotations').update(activationPayload).eq('id', quotation.id);
      if (!error) {
        const _actorAct = { id: "current-user", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
        logStatusChange("contract", quotation.id, quotation.quote_number ?? quotation.id, quotation.contract_status ?? "", "Active", _actorAct);
        toast.success("Contract activated successfully! Operations can now link bookings.");
        if (onUpdate) {
          onUpdate(updatedQuotation);
        }
      } else {
        toast.error(error.message || "Failed to activate contract");
      }
    } catch (err) {
      console.error("Error activating contract:", err);
      toast.error("Failed to activate contract");
    } finally {
      setIsActivating(false);
    }
  };

  const normalizedStatus = getNormalizedQuotationStatus(quotation);
  const contractStatus = getNormalizedContractStatus(quotation) || "Draft";
  const statusStyle = getStatusColor(contractStatus);
  const daysRemaining = getDaysRemaining(quotation.contract_validity_end);
  const rateMatrices = quotation.rate_matrices || [];

  // Determine if the "Activate Contract" CTA should show
  // Show when: quotation status is "Accepted by Client" AND contract_status is not yet "Active"
  const showActivateCTA = normalizedStatus === "Accepted by Client" && contractStatus !== "Active";

  // ✨ PHASE 5: Renew contract
  const handleRenewContract = async () => {
    if (!renewStart || !renewEnd) {
      toast.error("Please specify both start and end dates");
      return;
    }
    setIsRenewing(true);
    try {
      // Create a renewed copy of this contract
      const newQuoteNumber = `${quotation.quote_number}-R${Date.now().toString().slice(-4)}`;
      const renewedContract = {
        ...quotation,
        id: `quot-${Date.now()}`,
        quote_number: newQuoteNumber,
        contract_validity_start: renewStart,
        contract_validity_end: renewEnd,
        contract_status: 'Active',
        status: 'Converted to Contract',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      delete (renewedContract as any).project_id;
      const { data: newContract, error: renewError } = await supabase.from('quotations').insert(renewedContract).select().single();
      if (!renewError && newContract) {
        const _actorRen = { id: "current-user", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
        logCreation("contract", newContract.id, newContract.quote_number ?? newContract.id, _actorRen);
        toast.success(`Contract renewed as ${newContract.quote_number}`);
        setShowRenewModal(false);
        setRenewStart("");
        setRenewEnd("");
        if (onUpdate) {
          onUpdate({ ...quotation, contract_status: "Renewed" });
        }
      } else {
        toast.error(renewError?.message || "Failed to renew contract");
      }
    } catch (err) {
      console.error("Error renewing contract:", err);
      toast.error("Failed to renew contract");
    } finally {
      setIsRenewing(false);
    }
  };

  // ✨ CONTRACT PARITY Phase 3: Generate billing for a specific booking
  const handleGenerateBilling = async (bookingId: string, serviceType: string) => {
    try {
      setGeneratingBillingId(bookingId);
      toast.loading(`Generating billing for ${serviceType}...`, { id: "gen-billing" });

      // Generate billing: create an evoucher for this booking
      const billingData = {
        id: `ev-${Date.now()}`,
        contract_id: quotation.id,
        booking_id: bookingId,
        service_type: serviceType,
        transaction_type: 'billing',
        status: 'Draft',
        created_at: new Date().toISOString(),
      };
      const { error: billingError } = await supabase.from('evouchers').insert(billingData);

      if (!billingError) {
        toast.success("Billing generated successfully!", { id: "gen-billing" });
        contractFinancials.refresh();
      } else {
        toast.error(billingError.message || "Failed to generate billing", { id: "gen-billing" });
      }
    } catch (error) {
      console.error("Error generating billing:", error);
      toast.error("An error occurred", { id: "gen-billing" });
    } finally {
      setGeneratingBillingId(null);
    }
  };

  // ✨ PHASE 3: Get contract services as InquiryService array
  // Contracts only support Brokerage, Trucking, and Others — exclude Forwarding & Marine Insurance
  const CONTRACT_ELIGIBLE_SERVICES = ["Brokerage", "Trucking", "Others"];
  const contractServices: InquiryService[] = (quotation.services || [])
    .filter((s: string) => CONTRACT_ELIGIBLE_SERVICES.includes(s))
    .map((s: string) => {
      const meta = quotation.services_metadata?.find(m => m.service_type === s);
      return meta || { service_type: s as any, service_details: {} };
    });

  const handleCreateBookingForService = (service: InquiryService) => {
    setCreateBookingService(service);
    setShowCreateBooking(true);
    setShowServiceDropdown(false);
  };

  const handleBookingCreated = () => {
    setShowCreateBooking(false);
    setCreateBookingService(null);
    fetchLinkedBookings(); // Refresh the list
  };

  // ============================================
  // TAB CONTENT RENDERERS
  // ============================================

  const renderRateCardTab = () => (
    <div style={{ padding: "24px 0" }}>
      {rateMatrices.length === 0 ? (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--neuron-ink-muted)",
          fontSize: "14px",
        }}>
          No rate matrices configured for this contract.
        </div>
      ) : (
        rateMatrices.map((matrix) => (
          <ContractRateMatrixEditor
            key={matrix.id}
            matrix={matrix}
            onChange={() => {}} // Read-only
            viewMode={true}
          />
        ))
      )}
    </div>
  );

  const renderBookingsTab = () => (
    <div style={{ padding: "24px 0" }}>
      {/* ✨ PHASE 3: Create Booking button — only when contract is Active */}
      {["Active", "Expiring"].includes(contractStatus) && contractServices.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px", position: "relative" }}>
          {contractServices.length === 1 ? (
            <button
              onClick={() => handleCreateBookingForService(contractServices[0])}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                color: "white", backgroundColor: "var(--theme-action-primary-bg)",
                border: "none", borderRadius: "6px", cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Create {contractServices[0].service_type} Booking
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowServiceDropdown(!showServiceDropdown)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                  color: "white", backgroundColor: "var(--theme-action-primary-bg)",
                  border: "none", borderRadius: "6px", cursor: "pointer",
                }}
              >
                <Plus size={14} />
                Create Booking
                <ChevronDown size={14} />
              </button>
              {showServiceDropdown && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: "4px",
                  backgroundColor: "var(--theme-bg-surface)", borderRadius: "8px",
                  border: "1px solid var(--neuron-ui-border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10,
                  minWidth: "200px", overflow: "hidden",
                }}>
                  {contractServices.map(svc => (
                    <button
                      key={svc.service_type}
                      onClick={() => handleCreateBookingForService(svc)}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        width: "100%", padding: "10px 16px", fontSize: "13px",
                        color: "var(--theme-text-primary)", backgroundColor: "var(--theme-bg-surface)",
                        border: "none", borderBottom: "1px solid var(--theme-border-subtle)",
                        cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"}
                    >
                      {getServiceIcon(svc.service_type)}
                      {svc.service_type}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <BookingsTable
        bookings={linkedBookings}
        isLoading={isLoadingBookings}
        onViewBooking={(bookingId, bookingType) => setSelectedBooking({ bookingId, bookingType })}
        onGenerateBilling={handleGenerateBilling}
        generatingBillingId={generatingBillingId}
        emptyState={
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--neuron-ink-muted)" }}>
            <FileText size={40} style={{ marginBottom: "12px", opacity: 0.3, margin: "0 auto 12px" }} />
            <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 4px" }}>No bookings linked yet</p>
            <p style={{ fontSize: "13px", margin: 0 }}>
              {["Active", "Expiring"].includes(contractStatus)
                ? 'Click "Create Booking" above to create a booking directly from this contract.'
                : "When Operations creates bookings for this client, they'll appear here automatically."
              }
            </p>
          </div>
        }
      />
    </div>
  );

  const renderBillingsTab = () => (
    <div style={{ padding: "24px 0" }}>
      {/* ✨ PHASE 5C: Read-only aggregate view — billing items live on bookings, this is a rollup */}
      <UnifiedBillingsTab
        items={contractFinancials.billingItems}
        projectId={quotation.quote_number || quotation.id}
        bookingId=""
        onRefresh={contractFinancials.refresh}
        isLoading={contractFinancials.isLoading}
        readOnly={true}
        title="Contract Billings"
        subtitle={`Read-only aggregate across ${linkedBookingIds.length} linked booking${linkedBookingIds.length !== 1 ? "s" : ""} — ${quotation.quote_number} · ${quotation.customer_name}`}
        enableGroupByToggle={true}
        linkedBookings={linkedBookings}
      />
    </div>
  );

  const renderInvoicesTab = () => {
    const currentUserWithId = currentUser ? { id: "current-user", ...currentUser } : null;
    return (
      <UnifiedInvoicesTab
        financials={contractFinancials}
        project={financialContainer}
        currentUser={currentUserWithId}
        onRefresh={contractFinancials.refresh}
        linkedBookings={linkedBookings}
        title="Contract Invoices"
        subtitle={`Generate, track, and manage official invoices — ${quotation.quote_number} · ${quotation.customer_name}`}
        highlightId={activeTab === "invoices" ? highlightId : undefined}
      />
    );
  };

  const renderCollectionsTab = () => {
    const currentUserWithId = currentUser ? { id: "current-user", ...currentUser } : null;
    return (
      <div style={{ padding: "24px 0" }}>
        <UnifiedCollectionsTab
          financials={contractFinancials}
          project={financialContainer}
          currentUser={currentUserWithId}
          onRefresh={contractFinancials.refresh}
          title="Contract Collections"
          subtitle={`Track payments received from ${quotation.customer_name} — ${quotation.quote_number}`}
          highlightId={activeTab === "collections" ? highlightId : undefined}
        />
      </div>
    );
  };

  const renderExpensesTab = () => {
    const currentUserWithId = currentUser ? { id: "current-user", ...currentUser } : null;
    return (
      <div style={{ padding: "24px 0" }}>
        <ProjectExpensesTab
          project={financialContainer}
          currentUser={currentUserWithId}
          title="Contract Expenses"
          subtitle={`Manage, track, and approve expenses across ${linkedBookingIds.length} linked booking${linkedBookingIds.length !== 1 ? "s" : ""} — ${quotation.quote_number} · ${quotation.customer_name}`}
        />
      </div>
    );
  };

  const renderActivityTab = () => {
    // Event type → dot color mapping
    const getEventColor = (eventType: string) => {
      switch (eventType) {
        case "contract_activated": return "var(--theme-status-success-fg)";
        case "status_changed": return "var(--theme-status-warning-fg)";
        case "booking_linked": return "var(--neuron-semantic-info)";
        case "billing_generated": return "var(--neuron-status-accent-fg)";
        case "contract_renewed": return "var(--neuron-status-accent-fg)";
        default: return "var(--theme-text-muted)";
      }
    };

    return (
      <div style={{ padding: "24px 0" }}>
        <div style={{
          borderLeft: "2px solid var(--neuron-ui-border)",
          paddingLeft: "20px",
          marginLeft: "8px",
        }}>
          {/* Always show: Contract created event (from quotation data) */}
          <div style={{ position: "relative", marginBottom: "24px" }}>
            <div style={{
              position: "absolute", left: "-27px", top: "4px",
              width: "12px", height: "12px", borderRadius: "50%",
              backgroundColor: "var(--theme-action-primary-bg)", border: "2px solid white",
            }} />
            <div>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 2px" }}>
                Contract created
              </p>
              <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", margin: "0 0 2px" }}>
                {formatDate(quotation.created_at)} by {quotation.created_by || "Unknown"}
              </p>
              <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", margin: 0 }}>
                {quotation.quotation_name || quotation.quote_number} for {quotation.customer_name}
              </p>
            </div>
          </div>

          {/* Dynamic events from activity log API */}
          {isLoadingActivity ? (
            <div style={{ padding: "12px 0", fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
              Loading activity...
            </div>
          ) : activityEvents.length > 0 ? (
            [...activityEvents].reverse().map((event: any) => (
              <div key={event.id} style={{ position: "relative", marginBottom: "24px" }}>
                <div style={{
                  position: "absolute", left: "-27px", top: "4px",
                  width: "12px", height: "12px", borderRadius: "50%",
                  backgroundColor: getEventColor(event.event_type),
                  border: "2px solid white",
                }} />
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 2px" }}>
                    {event.description}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", margin: 0 }}>
                    {formatDate(event.created_at)}{event.user && event.user !== "System" ? ` by ${event.user}` : ""}
                  </p>
                </div>
              </div>
            ))
          ) : contractStatus !== "Draft" ? (
            <div style={{ position: "relative", marginBottom: "24px" }}>
              <div style={{
                position: "absolute", left: "-27px", top: "4px",
                width: "12px", height: "12px", borderRadius: "50%",
                backgroundColor: statusStyle.text, border: "2px solid white",
              }} />
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 2px" }}>
                  Status changed to {contractStatus}
                </p>
                <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", margin: 0 }}>
                  {formatDate(quotation.updated_at)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // ============================================
  // TAB STRUCTURE (mirrors ProjectDetail.tsx pattern)
  // ============================================

  const PhilippinePeso = ({ size = 24, ...props }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 11H4"/><path d="M20 7H4"/><path d="M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7"/>
    </svg>
  );

  const TAB_STRUCTURE = {
    dashboard: [
      { id: "financial_overview", label: "Financial Overview", icon: Layout },
      { id: "rate-card", label: "Rate Card", icon: FileText },
    ],
    operations: [
      { id: "bookings", label: "Bookings", icon: Briefcase },
    ],
    accounting: [
      { id: "billings", label: "Billings", icon: Receipt },
      { id: "invoices", label: "Invoices", icon: FileStack },
      { id: "collections", label: "Collections", icon: DollarSign },
      { id: "expenses", label: "Expenses", icon: TrendingUp },
    ],
    collaboration: [
      { id: "attachments", label: "Attachments", icon: Paperclip },
      { id: "comments", label: "Comments", icon: MessageSquare },
      { id: "activity", label: "Activity", icon: Clock },
    ],
  } as const;

  // Sync category when activeTab changes
  useEffect(() => {
    for (const [category, tabs] of Object.entries(TAB_STRUCTURE)) {
      if (tabs.some(t => t.id === activeTab)) {
        setActiveCategory(category as TabCategory);
        break;
      }
    }
  }, [activeTab]);

  const handleCategoryClick = (category: TabCategory) => {
    setActiveCategory(category);
    const firstTab = TAB_STRUCTURE[category][0].id as ContractTab;
    setActiveTab(firstTab);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--theme-bg-surface)" }}>
      {/* Header Bar — matches ProjectDetail pattern */}
      <div style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <button
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "none",
              border: "none",
              color: "var(--neuron-ink-secondary)",
              cursor: "pointer",
              fontSize: "13px",
              marginBottom: "12px",
              padding: "0"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--neuron-brand-green)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--neuron-ink-secondary)";
            }}
          >
            <ArrowLeft size={16} />
            Back to Contracts
          </button>
          
          <h1 style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            marginBottom: "4px"
          }}>
            {quotation.quotation_name || (quotation.customer_name ? `${quotation.customer_name} Contract` : quotation.quote_number)}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="font-mono">{quotation.quote_number}</span>
            <span className="text-[var(--neuron-ui-muted)]">•</span>
            <span>{quotation.customer_name}</span>
          </p>
        </div>

        {/* Actions Area */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* ✨ Activate Contract CTA — prominent primary action */}
            {showActivateCTA && (
              <button
                onClick={handleActivateContract}
                disabled={isActivating}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "white",
                  backgroundColor: isActivating ? "var(--theme-text-muted)" : "var(--neuron-brand-green)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: isActivating ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActivating) e.currentTarget.style.backgroundColor = "#0D5F58";
                }}
                onMouseLeave={(e) => {
                  if (!isActivating) e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                }}
              >
                <Zap size={14} />
                {isActivating ? "Activating..." : "Activate Contract"}
              </button>
            )}

            <ContractStatusSelector
              status={contractStatus as any}
              onUpdateStatus={async (newStatus) => {
                try {
                  const { error: statusError } = await supabase.from('quotations').update({
                    contract_status: newStatus,
                    updated_at: new Date().toISOString(),
                  }).eq('id', quotation.id);
                  if (!statusError) {
                    const _actorSC = { id: "current-user", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
                    logStatusChange("contract", quotation.id, quotation.quote_number ?? quotation.id, contractStatus, newStatus, _actorSC);
                    toast.success(`Status changed to ${newStatus}`);
                    if (onUpdate) onUpdate({ ...quotation, contract_status: newStatus });
                  } else {
                    toast.error(statusError.message || "Failed to update status");
                  }
                } catch (err) {
                  console.error("Error updating contract status:", err);
                  toast.error("Failed to update status");
                }
              }}
              className="mr-2"
            />

            {/* Actions Menu (⋮) — Edit, Renew, etc. */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1.5px solid var(--neuron-ui-muted)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-border-default)";
                }}
              >
                <MoreVertical size={18} color="var(--neuron-ink-secondary)" />
              </button>

              {showActionsMenu && (
                <>
                  <div 
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 10
                    }}
                    onClick={() => setShowActionsMenu(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      backgroundColor: "var(--theme-bg-surface)",
                      border: "1px solid var(--theme-border-default)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      minWidth: "180px",
                      zIndex: 20,
                      overflow: "hidden"
                    }}
                  >
                    <button
                      onClick={() => {
                        onEdit();
                        setShowActionsMenu(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        textAlign: "left",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "var(--neuron-ink-primary)",
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Edit3 size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                      Edit Contract
                    </button>
                    {["Active", "Expiring", "Expired"].includes(contractStatus) && (
                      <button
                        onClick={() => {
                          setShowRenewModal(true);
                          setShowActionsMenu(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "10px 16px",
                          textAlign: "left",
                          border: "none",
                          background: "none",
                          fontSize: "14px",
                          color: "var(--neuron-status-accent-fg)",
                          cursor: "pointer",
                          transition: "background-color 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-status-accent-bg)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <RefreshCw size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                        Renew Contract
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Tabs Tier 1: Categories */}
      <div className="px-12 bg-[var(--theme-bg-surface)] flex gap-8 border-b border-[var(--theme-border-default)]">
        {[
          { id: "dashboard", label: "Dashboard", icon: Layout },
          { id: "operations", label: "Operations", icon: Layers },
          { id: "accounting", label: "Accounting", icon: PhilippinePeso },
          { id: "collaboration", label: "Collaboration", icon: Users },
        ].map((cat) => {
          const isActive = activeCategory === cat.id;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id as TabCategory)}
              className="flex items-center gap-2 py-4 relative group"
              style={{
                color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              <span style={{ fontSize: "14px", fontWeight: isActive ? 600 : 500 }}>{cat.label}</span>
              {isActive && (
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "2px",
                  backgroundColor: "var(--theme-action-primary-bg)",
                  borderRadius: "2px 2px 0 0",
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tabs Tier 2: Sub-tabs */}
      <div className="px-12 py-3 bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)] flex gap-2 overflow-x-auto min-h-[57px]">
        {TAB_STRUCTURE[activeCategory].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ContractTab)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all whitespace-nowrap"
              style={{
                backgroundColor: isActive ? "rgba(15, 118, 110, 0.05)" : "transparent",
                color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                border: isActive ? "1px solid var(--theme-action-primary-bg)" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <Icon size={14} />
              <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto", backgroundColor: "var(--theme-bg-surface)" }}>
        {activeTab === "financial_overview" && (
          <div className="max-w-7xl mx-auto">
            <ProjectFinancialOverview financials={contractFinancials} />
          </div>
        )}
        {activeTab === "rate-card" && (
          <div style={{ padding: "0 48px" }}>{renderRateCardTab()}</div>
        )}
        {activeTab === "bookings" && (
          <div style={{ padding: "0 48px" }}>{renderBookingsTab()}</div>
        )}
        {activeTab === "billings" && (
          <div className="max-w-7xl mx-auto" style={{ padding: "0 48px" }}>{renderBillingsTab()}</div>
        )}
        {activeTab === "invoices" && renderInvoicesTab()}
        {activeTab === "collections" && (
          <div className="max-w-7xl mx-auto" style={{ padding: "0 48px" }}>{renderCollectionsTab()}</div>
        )}
        {activeTab === "expenses" && (
          <div className="max-w-7xl mx-auto" style={{ padding: "0 48px" }}>{renderExpensesTab()}</div>
        )}
        {activeTab === "attachments" && (
          <div className="max-w-7xl mx-auto">
            <EntityAttachmentsTab
              entityId={quotation.id}
              entityType="contracts"
              currentUser={currentUser}
            />
          </div>
        )}
        {activeTab === "comments" && (
          <div className="max-w-7xl mx-auto" style={{ padding: "32px 48px" }}>
            <CommentsTab
              entityId={quotation.id}
              entityType="contract"
              currentUserId={currentUser?.email || "unknown"}
              currentUserName={currentUser?.name || "Unknown User"}
              currentUserDepartment={currentUser?.department || ""}
            />
          </div>
        )}
        {activeTab === "activity" && (
          <div style={{ padding: "0 48px" }}>{renderActivityTab()}</div>
        )}
      </div>

      {/* ✨ PHASE 5: Renewal Modal */}
      {showRenewModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "var(--theme-bg-surface)",
            borderRadius: "12px",
            padding: "32px",
            width: "440px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--theme-text-primary)", margin: "0 0 4px" }}>
              Renew Contract
            </h2>
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: "0 0 24px" }}>
              Create a new contract from <strong>{quotation.quote_number}</strong> with updated validity dates. The current contract will be marked as "Renewed" and all rate matrices will be copied.
            </p>

            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: "6px" }}>
                  New Start Date
                </label>
                <input
                  type="date"
                  value={renewStart}
                  onChange={(e) => setRenewStart(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--neuron-ui-border)",
                    fontSize: "13px",
                    color: "var(--theme-text-primary)",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: "6px" }}>
                  New End Date
                </label>
                <input
                  type="date"
                  value={renewEnd}
                  onChange={(e) => setRenewEnd(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--neuron-ui-border)",
                    fontSize: "13px",
                    color: "var(--theme-text-primary)",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => { setShowRenewModal(false); setRenewStart(""); setRenewEnd(""); }}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-muted)",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRenewContract}
                disabled={isRenewing || !renewStart || !renewEnd}
                style={{
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "white",
                  backgroundColor: isRenewing ? "#9b8fcc" : "var(--neuron-status-accent-fg)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: isRenewing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <RefreshCw size={14} />
                {isRenewing ? "Renewing..." : "Renew Contract"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✨ PHASE 3: Create Booking from Contract Panel */}
      {showCreateBooking && createBookingService && (
        <CreateBookingFromContractPanel
          isOpen={showCreateBooking}
          onClose={() => { setShowCreateBooking(false); setCreateBookingService(null); }}
          contract={quotation}
          service={createBookingService}
          currentUser={currentUser ? { id: "current-user", ...currentUser } : null}
          onBookingCreated={handleBookingCreated}
        />
      )}

      {/* ✨ CONTRACT PARITY Phase 3: Booking Drill-down via ProjectBookingReadOnlyView */}
      {selectedBooking && (
        <ProjectBookingReadOnlyView
          bookingId={selectedBooking.bookingId}
          bookingType={selectedBooking.bookingType as any}
          onBack={() => setSelectedBooking(null)}
          currentUser={currentUser ? { id: "current-user", ...currentUser } : null}
          onBookingUpdated={fetchLinkedBookings}
        />
      )}
    </div>
  );
}
