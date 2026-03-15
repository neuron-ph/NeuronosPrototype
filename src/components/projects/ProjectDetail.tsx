import type { Project, ProjectStatus } from "../../types/pricing";
import { apiFetch } from "../../utils/api";
import { toast } from "../ui/toast-utils";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";

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
  department: "BD" | "Operations";
  onCreateTicket?: (entity: { type: string; id: string; name: string }) => void;
  initialTab?: string | null;
  highlightId?: string | null;
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
  const [activeTab, setActiveTab] = useState<ProjectTab>(
    (initialTab as ProjectTab) || "financial_overview"
  );
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
      // Use the server API instead of direct table access
      // FIX: Prioritize project.quotation_id (FK) over project.quotation.id (embedded) to ensure we update the linked record
      const response = await apiFetch(`/quotations/${project.quotation_id || project.quotation?.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to update quotation");
      }
      
      toast.success("Quotation updated successfully");
      // await the update to ensure the parent component has refreshed the data before we return
      // This prevents the "flash of old content" when the modal closes
      await onUpdate(); 
    } catch (err: any) {
      console.error("Error saving quotation:", err);
      toast.error("Failed to save changes");
    }
  };

  // BD and PD users see the actions menu (not Operations)
  const showActions = department === "BD";

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
      const response = await apiFetch(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error("Failed to update project status");
      }
      
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
      backgroundColor: "white",
      display: "flex",
      flexDirection: "column",
      height: "100vh"
    }}>
      {/* Header Bar */}
      <div style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "white",
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
            Back to Projects
          </button>
          
          <h1 style={{ 
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            marginBottom: "4px"
          }}>
            {project.quotation_name || project.project_number}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted, #6B7280)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="font-mono">{project.project_number}</span>
            <span className="text-[#D1D5DB]">•</span>
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
                backgroundColor: "white",
                border: "1.5px solid #D1D5DB",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#D1D5DB";
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
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
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
                      color: "var(--neuron-ink-primary)",
                      transition: "background-color 0.15s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
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
                      color: "var(--neuron-ink-primary)",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
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
                      color: "var(--neuron-ink-primary)",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Archive size={16} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
                    Archive Project
                  </button>
                  <div style={{ height: "1px", backgroundColor: "#E5E7EB", margin: "4px 0" }} />
                  <button
                    onClick={handleDelete}
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      fontSize: "14px",
                      color: "#DC2626",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#FEF2F2";
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
      <div className="px-12 bg-white flex gap-8 border-b border-[#E5E9F0]">
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
                        color: isActive ? "#0F766E" : "#6B7280",
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
                            backgroundColor: "#0F766E",
                            borderRadius: "2px 2px 0 0" 
                        }} />
                    )}
                </button>
            )
        })}
      </div>

      {/* Tabs Tier 2: Sub-tabs (Conditional Render) */}
      <div className="px-12 py-3 bg-white border-b border-[#E5E9F0] flex gap-2 overflow-x-auto min-h-[57px]">
        {TAB_STRUCTURE[activeCategory].map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all whitespace-nowrap"
                    style={{
                        backgroundColor: isActive ? "rgba(15, 118, 110, 0.05)" : "transparent",
                        color: isActive ? "#0F766E" : "#6B7280",
                        boxShadow: "none",
                        border: isActive ? "1px solid #0F766E" : "1px solid transparent",
                    }}
                >
                    <Icon size={14} />
                    <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500 }}>{tab.label}</span>
                </button>
            )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", backgroundColor: "white" }}>
        {activeTab === "financial_overview" && (
          <div className="max-w-7xl mx-auto">
            <ProjectFinancialOverview financials={financials} />
          </div>
        )}
        
        {activeTab === "quotation" && (
          <ProjectOverviewTab 
            project={project} 
            currentUser={currentUser}
            onUpdate={onUpdate}
            onViewBooking={handleViewBooking}
            onSaveQuotation={handleSaveQuotation}
          />
        )}
        
        {/* PDF Studio Tab Removed - Rendered as Full Screen Module */}

        {activeTab === "bookings" && (
          <ProjectBookingsTab 
            project={project} 
            currentUser={currentUser}
            selectedBookingId={selectedBookingId}
          />
        )}
        
        {activeTab === "expenses" && (
          <div className="max-w-7xl mx-auto">
            <ProjectExpensesTab project={project} currentUser={currentUser} />
          </div>
        )}
        
        {activeTab === "billings" && (
          <div className="max-w-7xl mx-auto">
            <ProjectBillings financials={financials} project={project} highlightId={highlightId} />
          </div>
        )}
        
        {activeTab === "invoices" && (
          <div className="max-w-7xl mx-auto">
            <ProjectInvoices financials={financials} project={project} currentUser={currentUser} highlightId={highlightId} />
          </div>
        )}
        
        {activeTab === "collections" && (
          <div className="max-w-7xl mx-auto">
            <ProjectCollectionsTab 
              financials={financials}
              project={project} 
              currentUser={currentUser}
              highlightId={highlightId}
            />
          </div>
        )}
        
        {activeTab === "attachments" && (
          <ProjectAttachmentsTab 
            project={project} 
            currentUser={currentUser}
          />
        )}
        
        {activeTab === "comments" && (
          <CommentsTab 
            inquiryId={project.quotation_id}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserDepartment={currentUserDepartment}
          />
        )}
      </div>
    </div>
  );
}