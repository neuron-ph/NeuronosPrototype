import { useState, useEffect } from "react";
import { ArrowLeft, MoreVertical, Edit3, Copy, Archive, Trash2, Layout, FileText, Briefcase, Receipt, FileStack, DollarSign, TrendingUp, Paperclip, MessageSquare, Layers, Users } from "lucide-react";
import { usePermission } from "../../context/PermissionProvider";
import { PROJECT_MODULE_IDS, type ProjectDept } from "../../config/access/accessSchema";
import type { Project, ProjectStatus } from "../../types/pricing";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { logStatusChange } from "../../utils/activityLog";
import { recordNotificationEvent, fetchDeptManagerIds } from "../../utils/notifications";
import { useMarkEntityReadOnMount } from "../../hooks/useNotifications";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { ProjectStatusSelector } from "./ProjectStatusSelector";
import { ProjectBookingsTab } from "./ProjectBookingsTab";
import { ProjectFinancialOverview } from "./tabs/ProjectFinancialOverview";
import { ProjectOverviewTab } from "./ProjectOverviewTab";
import { ProjectExpensesTab } from "./ProjectExpensesTab";
import { ProjectBillings } from "./tabs/ProjectBillings";
import { ProjectInvoices } from "./tabs/ProjectInvoices";
import { ProjectCollectionsTab } from "./ProjectCollectionsTab";
import { ProjectAttachmentsTab } from "./ProjectAttachmentsTab";
import { CommentsTab } from "../shared/CommentsTab";

const PhilippinePeso = ({ size = 24, ...props }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 11H4"/><path d="M20 7H4"/><path d="M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7"/>
  </svg>
);

type ProjectTab = "financial_overview" | "quotation" | "bookings" | "expenses" | "billings" | "invoices" | "collections" | "attachments" | "comments";

type TabCategory = "dashboard" | "operations" | "accounting" | "collaboration";

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onUpdate: () => void;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  department: "BD" | "Operations" | "Accounting";
  onCreateTicket?: (entity: { type: string; id: string; name: string }) => void;
  initialTab?: string | null;
  highlightId?: string | null;
}

function buildQuotationUpdatePayload(data: any): Record<string, unknown> {
  const pricingFields: Record<string, unknown> = {};
  const pricingKeys = [
    'selling_price', 'buying_price', 'financial_summary',
    'movement', 'category', 'shipment_freight',
    'incoterm', 'carrier', 'transit_days', 'commodity',
    'pol_aol', 'pod_aod', 'charge_categories', 'currency',
    'credit_terms', 'validity_period',
  ];

  for (const key of pricingKeys) {
    if (data[key] !== undefined) pricingFields[key] = data[key];
  }

  const existingPricing = data.pricing && typeof data.pricing === 'object' ? data.pricing : {};
  const mergedPricing = { ...existingPricing, ...pricingFields };

  const payload: Record<string, unknown> = {
    quotation_name: data.quotation_name,
    quotation_number: data.quotation_number,
    customer_id: data.customer_id,
    customer_name: data.customer_name,
    contact_id: data.contact_id,
    contact_name: data.contact_name ?? data.contact_person_name,
    contact_person_id: data.contact_person_id,
    services: data.services,
    services_metadata: data.services_metadata,
    status: data.status,
    quotation_type: data.quotation_type,
    quotation_date: data.quotation_date ?? data.created_date,
    expiry_date: (() => {
      const raw = data.expiry_date ?? data.valid_until;
      if (!raw) return undefined;
      const days = Number(raw);
      if (!isNaN(days) && String(raw).trim() === String(days)) {
        const base = data.quotation_date ?? data.created_date;
        if (!base) return undefined;
        const dt = new Date(base);
        dt.setDate(dt.getDate() + days);
        return dt.toISOString();
      }
      return raw;
    })(),
    validity_date: data.validity_date,
    contract_start_date: data.contract_validity_start ?? data.contract_start_date,
    contract_end_date: data.contract_validity_end ?? data.contract_end_date,
    project_id: data.project_id,
    pricing: Object.keys(mergedPricing).length > 0 ? mergedPricing : undefined,
    details: data.rate_matrices !== undefined
      ? { ...(data.details ?? {}), rate_matrices: data.rate_matrices }
      : data.details ?? undefined,
  };

  const dateColumns = ['quotation_date', 'expiry_date', 'validity_date', 'contract_start_date', 'contract_end_date'];
  for (const col of dateColumns) {
    const value = payload[col];
    if (value === '' || (typeof value === 'string' && isNaN(Date.parse(value)))) {
      payload[col] = null;
    }
  }

  delete payload.project_id;

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export function ProjectDetail({
  project,
  onBack,
  onUpdate,
  currentUser,
  department,
  onCreateTicket,
  initialTab,
  highlightId
}: ProjectDetailProps) {
  const { can } = usePermission();
  useMarkEntityReadOnMount("project", project.id);
  const projectDept: ProjectDept = department === "Accounting" ? "accounting" : "ops";
  const ids = PROJECT_MODULE_IDS[projectDept];
  const canViewInfoTab        = can(ids.info,        "view");
  const canViewQuotationTab   = can(ids.quotation,   "view");
  const canViewBookingsTab    = can(ids.bookings,    "view");
  const canViewExpensesTab    = can(ids.expenses,    "view");
  const canViewBillingsTab    = can(ids.billings,    "view");
  const canViewInvoicesTab    = can(ids.invoices,    "view");
  const canViewCollectionsTab = can(ids.collections, "view");
  const canViewAttachmentsTab = can(ids.attachments, "view");
  const canViewCommentsTab    = can(ids.comments,    "view");

  const defaultTab: ProjectTab = (() => {
    if (initialTab) return initialTab as ProjectTab;
    if (canViewInfoTab) return "financial_overview";
    if (canViewQuotationTab) return "quotation";
    if (canViewBookingsTab) return "bookings";
    if (canViewExpensesTab) return "expenses";
    if (canViewBillingsTab) return "billings";
    if (canViewInvoicesTab) return "invoices";
    if (canViewCollectionsTab) return "collections";
    if (canViewAttachmentsTab) return "attachments";
    if (canViewCommentsTab) return "comments";
    return "financial_overview";
  })();

  const [activeTab, setActiveTab] = useState<ProjectTab>(defaultTab);
  const [activeCategory, setActiveCategory] = useState<TabCategory>("dashboard");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<ProjectStatus>(project.status as ProjectStatus);

  // Sync optimistic status when prop changes (e.g. initial load or external update)
  useEffect(() => {
    setOptimisticStatus(project.status as ProjectStatus);
  }, [project.status]);

  // Hook for financial data
  const financials = useProjectFinancials(
    project.project_number, 
    project.linkedBookings || [],
    project.quotation_id // Pass quotation ID to enable Virtual Items
  );

  const currentUserId = currentUser?.id || "user-123";
  const currentUserName = currentUser?.name || "John Doe";
  const currentUserDepartment = currentUser?.department || "BD";

  const handleSaveQuotation = async (updates: any) => {
    try {
      const quotationId = project.quotation_id || project.quotation?.id;
      const payload = buildQuotationUpdatePayload(updates);

      delete payload.quote_number;
      delete payload.created_by;
      delete payload.created_by_name;

      const { error } = await supabase
        .from('quotations')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', quotationId);

      if (error) throw new Error(error.message);
      
      toast.success("Quotation updated successfully");
      // await the update to ensure the parent component has refreshed the data before we return
      // This prevents the "flash of old content" when the modal closes
      await onUpdate(); 
    } catch (err: any) {
      console.error("Error saving quotation:", err);
      toast.error("Failed to save changes");
    }
  };

  const showActions = can("bd_projects", "edit") || can("pricing_projects", "edit");

  // Define the Tab Structure
  const TAB_STRUCTURE = {
    dashboard: [
      { id: "financial_overview", label: "Financial Overview", icon: Layout }
    ],
    operations: [
      { id: "quotation", label: "Quotation", icon: FileText },
      { id: "bookings", label: "Bookings", icon: Briefcase }
    ],
    accounting: [
      { id: "billings", label: "Billings", icon: Receipt },
      { id: "invoices", label: "Invoices", icon: FileStack },
      { id: "collections", label: "Collections", icon: DollarSign },
      { id: "expenses", label: "Expenses", icon: TrendingUp }
    ],
    collaboration: [
      { id: "attachments", label: "Attachments", icon: Paperclip },
      { id: "comments", label: "Comments", icon: MessageSquare }
    ]
  } as const;

  // When tab changes manually (e.g. from deep link or logic), update category
  useEffect(() => {
    // Find which category contains the active tab
    for (const [category, tabs] of Object.entries(TAB_STRUCTURE)) {
        if (tabs.some(t => t.id === activeTab)) {
            setActiveCategory(category as TabCategory);
            break;
        }
    }
  }, [activeTab]);

  const handleCategoryClick = (category: TabCategory) => {
      setActiveCategory(category);
      // Auto-select the first tab in that category
      const firstTab = TAB_STRUCTURE[category][0].id as ProjectTab;
      setActiveTab(firstTab);
  };

  // Handle viewing a booking from the Overview tab
  const handleViewBooking = (bookingId: string, serviceType: string) => {
    setSelectedBookingId(bookingId);
    setActiveTab("bookings");
    setActiveCategory("operations");
  };

  const handleUpdateProjectStatus = async (newStatus: ProjectStatus) => {
    // 1. Optimistic Update: Update local state immediately
    const previousStatus = optimisticStatus;
    setOptimisticStatus(newStatus);
    
    try {
      const { error } = await supabase.from('projects').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', project.id);
      if (error) throw new Error(error.message);

      const _actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
      logStatusChange("project", project.id, project.project_number ?? project.id, previousStatus, newStatus, _actor);

      const opsManagers = await fetchDeptManagerIds('Operations');
      void recordNotificationEvent({
        actorUserId: currentUser?.id ?? null,
        module: 'bd',
        subSection: 'projects',
        entityType: 'project',
        entityId: project.id,
        kind: 'status_changed',
        summary: {
          label: `Project ${project.project_number ?? ''} → ${newStatus}`,
          reference: project.project_number ?? undefined,
          from_status: previousStatus,
          to_status: newStatus,
        },
        recipientIds: [(project as any).owner_id, ...opsManagers],
      });

      toast.success(`Project status updated to ${newStatus}`);
      onUpdate(); // Refresh parent to show new status (server confirmation)
    } catch (error) {
      console.error("Error updating project status:", error);
      toast.error("Failed to update project status");
      
      // 2. Rollback on Error
      setOptimisticStatus(previousStatus);
    }
  };

  const handleEdit = () => {
    console.log("Edit project:", project.project_number);
    alert("Edit functionality coming soon!");
  };

  const handleDuplicate = () => {
    console.log("Duplicating project:", project.project_number);
    alert(`📋 Project ${project.project_number} has been duplicated!`);
    setShowActionsMenu(false);
  };

  const handleArchive = () => {
    console.log("Archiving project:", project.project_number);
    alert(`📦 Project ${project.project_number} has been archived!`);
    setShowActionsMenu(false);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete project ${project.project_number}?`)) {
      console.log("Deleting project:", project.project_number);
      alert(`🗑️ Project ${project.project_number} has been deleted!`);
      setShowActionsMenu(false);
      onBack();
    }
  };



  return (
    <div style={{ 
      backgroundColor: "var(--theme-bg-surface)",
      display: "flex",
      flexDirection: "column",
      height: "100vh"
    }}>
      {/* Header Bar */}
      <div style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--theme-border-default)",
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
              e.currentTarget.style.color = "var(--theme-action-primary-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--neuron-ink-secondary)";
            }}
          >
            <ArrowLeft size={16} />
            Back to Projects
          </button>
          
          <h1 style={{ 
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--theme-text-primary)",
            marginBottom: "4px"
          }}>
            {project.quotation_name || project.project_number}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="font-mono">{project.project_number}</span>
            <span className="text-[var(--theme-text-muted)]">•</span>
            <span>{project.customer_name}</span>
          </p>
        </div>

        {/* Actions Area */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ProjectStatusSelector
              status={optimisticStatus}
              onUpdateStatus={handleUpdateProjectStatus}
              className="mr-2"
            />

            {/* Actions Menu - Only for BD & PD */}
            {showActions && (
            <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1.5px solid var(--theme-border-default)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
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
                      handleEdit();
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
                      color: "var(--theme-text-primary)",
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
                    Edit Project
                  </button>
                  <button
                    onClick={handleDuplicate}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      fontSize: "14px",
                      color: "var(--theme-text-primary)",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Copy size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                    Duplicate Project
                  </button>
                  <button
                    onClick={handleArchive}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      fontSize: "14px",
                      color: "var(--theme-text-primary)",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Archive size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                    Archive Project
                  </button>
                  <div style={{ height: "1px", backgroundColor: "var(--theme-border-default)", margin: "4px 0" }} />
                  <button
                    onClick={handleDelete}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      fontSize: "14px",
                      color: "var(--theme-status-danger-fg)",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                    Delete Project
                  </button>
                </div>
              </>
            )}
            </div>
            )}
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
                    }}
                >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span style={{ fontSize: "14px", fontWeight: isActive ? 600 : 500 }}>{cat.label}</span>
                    
                    {/* Active Indicator Bar */}
                    {isActive && (
                        <div style={{ 
                            position: "absolute", 
                            bottom: 0, 
                            left: 0, 
                            right: 0, 
                            height: "2px", 
                            backgroundColor: "var(--theme-action-primary-bg)",
                            borderRadius: "2px 2px 0 0" 
                        }} />
                    )}
                </button>
            )
        })}
      </div>

      {/* Tabs Tier 2: Sub-tabs (Conditional Render) */}
      <div className="px-12 py-3 bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)] flex gap-2 overflow-x-auto min-h-[57px]">
        {TAB_STRUCTURE[activeCategory].filter((tab) => {
            const tabPermMap: Record<string, boolean> = {
              financial_overview: canViewInfoTab,
              quotation: canViewQuotationTab,
              bookings: canViewBookingsTab,
              expenses: canViewExpensesTab,
              billings: canViewBillingsTab,
              invoices: canViewInvoicesTab,
              collections: canViewCollectionsTab,
              attachments: canViewAttachmentsTab,
              comments: canViewCommentsTab,
            };
            return tabPermMap[tab.id] !== false;
          }).map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all whitespace-nowrap"
                    style={{
                        backgroundColor: isActive ? "rgba(15, 118, 110, 0.05)" : "transparent",
                        color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                        boxShadow: "none",
                        border: isActive ? "1px solid var(--theme-action-primary-bg)" : "1px solid transparent",
                    }}
                >
                    <Icon size={14} />
                    <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500 }}>{tab.label}</span>
                </button>
            )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", backgroundColor: "var(--theme-bg-surface)" }}>
        {activeTab === "financial_overview" && canViewInfoTab && (
          <div className="max-w-7xl mx-auto">
            <ProjectFinancialOverview financials={financials} />
          </div>
        )}

        {activeTab === "quotation" && canViewQuotationTab && (
          <ProjectOverviewTab
            project={project}
            currentUser={currentUser}
            onUpdate={onUpdate}
            onViewBooking={handleViewBooking}
            onSaveQuotation={handleSaveQuotation}
          />
        )}

        {/* PDF Studio Tab Removed - Rendered as Full Screen Module */}

        {activeTab === "bookings" && canViewBookingsTab && (
          <ProjectBookingsTab
            project={project}
            currentUser={currentUser}
            selectedBookingId={selectedBookingId}
          />
        )}

        {activeTab === "expenses" && canViewExpensesTab && (
          <div className="max-w-7xl mx-auto">
            <ProjectExpensesTab project={project} currentUser={currentUser} />
          </div>
        )}

        {activeTab === "billings" && canViewBillingsTab && (
          <div className="max-w-7xl mx-auto">
            <ProjectBillings financials={financials} project={project} highlightId={highlightId} />
          </div>
        )}

        {activeTab === "invoices" && canViewInvoicesTab && (
          <ProjectInvoices financials={financials} project={project} currentUser={currentUser} highlightId={highlightId} />
        )}

        {activeTab === "collections" && canViewCollectionsTab && (
          <div className="max-w-7xl mx-auto">
            <ProjectCollectionsTab
              financials={financials}
              project={project}
              currentUser={currentUser}
              highlightId={highlightId}
            />
          </div>
        )}

        {activeTab === "attachments" && canViewAttachmentsTab && (
          <ProjectAttachmentsTab
            project={project}
            currentUser={currentUser}
          />
        )}

        {activeTab === "comments" && canViewCommentsTab && (
          <CommentsTab
            entityId={project.id}
            entityType="project"
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserDepartment={currentUserDepartment}
          />
        )}
      </div>
    </div>
  );
}
