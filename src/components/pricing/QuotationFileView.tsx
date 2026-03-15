import { ArrowLeft, Edit3, FileText, FolderPlus, Layout } from "lucide-react";
import { useState } from "react";
import type { QuotationNew, Project } from "../../types/pricing";
import { QuotationActionMenu } from "./QuotationActionMenu";
import { StatusChangeButton } from "./StatusChangeButton";
import { CreateProjectModal } from "../bd/CreateProjectModal";
import { CreateBookingsFromProjectModal } from "./CreateBookingsFromProjectModal";
import { apiFetch } from "../../utils/api";
import { toast } from "../ui/toast-utils";
import { CommentsTab } from "../shared/CommentsTab";
import { SegmentedToggle } from "../ui/SegmentedToggle";
import { QuotationPDFScreen } from "../projects/quotation/screen/QuotationPDFScreen";
import { QuotationFormView } from "../projects/quotation/QuotationFormView";

interface QuotationFileViewProps {
  quotation: QuotationNew;
  onBack: () => void;
  onEdit: () => void;
  userDepartment?: "Business Development" | "Pricing";
  onAcceptQuotation?: (quotation: QuotationNew) => void;
  onDelete?: () => void;
  onUpdate: (quotation: QuotationNew) => void;
  onDuplicate?: (quotation: QuotationNew) => void;
  onCreateTicket?: (quotation: QuotationNew) => void;
  onConvertToProject?: (projectId: string) => void;
  onConvertToContract?: (quotationId: string) => void;
  currentUser?: { id: string; name: string; email: string; department: string } | null;
}

type TabType = "details" | "comments";

export function QuotationFileView({ quotation, onBack, onEdit, userDepartment, onAcceptQuotation, onDelete, onUpdate, onDuplicate, onCreateTicket, onConvertToProject, onConvertToContract, currentUser }: QuotationFileViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [viewMode, setViewMode] = useState<"form" | "pdf">("form");
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showCreateBookingsModal, setShowCreateBookingsModal] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [isActivatingContract, setIsActivatingContract] = useState(false);
  
  // TODO: Replace with actual user data from context/auth
  const currentUserId = currentUser?.id || "user-123";
  const currentUserName = currentUser?.name || "John Doe";
  const currentUserDepartment = currentUser?.department || userDepartment || "BD";
  
  // Adapter function to convert QuotationNew to Project for compatibility with Project components
  const adaptQuotationToProject = (quotation: QuotationNew): Project => {
    return {
      id: quotation.project_id || "temp-project-id", // Use project ID if exists, otherwise placeholder
      project_number: quotation.project_number || quotation.quote_number, // Fallback to quote number
      quotation_id: quotation.id,
      quotation_number: quotation.quote_number,
      quotation_name: quotation.quotation_name,
      
      // Customer
      customer_id: quotation.customer_id,
      customer_name: quotation.customer_name,
      customer_department: quotation.customer_department,
      customer_role: quotation.customer_role,
      contact_person_id: quotation.contact_person_id,
      contact_person_name: quotation.contact_person_name,
      
      // Shipment
      movement: quotation.movement,
      services: quotation.services,
      service_mode: quotation.service_mode,
      services_metadata: quotation.services_metadata || [],
      charge_categories: quotation.charge_categories,
      currency: quotation.currency,
      total: quotation.financial_summary?.grand_total,
      
      category: quotation.category,
      pol_aol: quotation.pol_aol,
      pod_aod: quotation.pod_aod,
      commodity: quotation.commodity,
      packaging_type: quotation.packaging_type,
      incoterm: quotation.incoterm,
      carrier: quotation.carrier,
      volume: quotation.volume,
      gross_weight: quotation.gross_weight,
      chargeable_weight: quotation.chargeable_weight,
      dimensions: quotation.dimensions,
      transit_time: quotation.transit_time,
      routing_info: quotation.routing_info,
      collection_address: quotation.collection_address,
      pickup_address: quotation.pickup_address,
      
      // Status & Meta
      status: quotation.status === "Converted to Project" ? "Active" : "Active", // Placeholder
      booking_status: "No Bookings Yet",
      created_at: quotation.created_at,
      updated_at: quotation.updated_at,
      
      // Owner
      bd_owner_user_name: quotation.prepared_by, // Best guess for display
      
      quotation: quotation // Important: Nest the original quotation
    } as Project;
  };

  const adaptedProject = adaptQuotationToProject(quotation);

  // Check if pricing information should be visible
  // Visible if: user is PD, OR status indicates quotation has been priced
  const showPricing = userDepartment === "Pricing" || 
    quotation.status === "Priced" || 
    quotation.status === "Sent to Client" ||
    quotation.status === "Accepted by Client" ||
    quotation.status === "Rejected by Client" ||
    quotation.status === "Needs Revision" ||
    quotation.status === "Disapproved" ||
    quotation.status === "Cancelled" ||
    quotation.status === "Converted to Project" ||
    quotation.status === "Converted to Contract";

  // Calculate financial totals
  const subtotalTaxable = quotation.charge_categories?.reduce((total, category) => {
    return total + (category.subtotal || 0);
  }, 0) || 0;

  const financialSummary = {
    subtotal_non_taxed: quotation.financial_summary?.subtotal_non_taxed || 0,
    subtotal_taxable: quotation.financial_summary?.subtotal_taxable || subtotalTaxable,
    tax_rate: quotation.financial_summary?.tax_rate || 0.12,
    tax_amount: quotation.financial_summary?.tax_amount || (subtotalTaxable * (quotation.financial_summary?.tax_rate || 0.12)),
    other_charges: quotation.financial_summary?.other_charges || 0,
    grand_total: quotation.financial_summary?.grand_total || 0
  };

  // Calculate grand total if not provided
  if (!quotation.financial_summary?.grand_total) {
    financialSummary.grand_total = financialSummary.subtotal_non_taxed + financialSummary.subtotal_taxable + financialSummary.tax_amount + financialSummary.other_charges;
  }

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  const handleAcceptQuotation = () => {
    if (onAcceptQuotation) {
      onAcceptQuotation(quotation);
    }
  };

  const handleDuplicate = () => {
    console.log("Duplicating quotation:", quotation.quote_number);
    if (onDuplicate) {
      onDuplicate(quotation);
    } else {
      alert(`📋 Quotation ${quotation.quote_number} has been duplicated! (Preview only)`);
    }
  };

  const handleDelete = () => {
    console.log("Deleting quotation:", quotation.quote_number);
    if (onDelete) {
      onDelete();
    } else {
      onBack();
    }
  };

  const handleStatusChange = (newStatus: string, reason?: string) => {
    const updatedQuotation = { 
      ...quotation, 
      status: newStatus as QuotationNew["status"],
      disapproval_reason: reason,
      cancellation_reason: reason
    };
    onUpdate(updatedQuotation);
    
    // If status changed to "Approved", trigger project creation
    if (newStatus === "Approved") {
      handleAcceptQuotation();
    }
  };

  const handleCreateTicket = () => {
    if (onCreateTicket) {
      onCreateTicket(quotation);
    }
  };

  const handleConvertToProject = () => {
    setShowCreateProjectModal(true);
  };

  const handleProjectCreationSuccess = (projectId: string) => {
    // Update quotation status to "Converted to Project"
    const updatedQuotation = {
      ...quotation,
      status: "Converted to Project" as QuotationNew["status"]
    };
    onUpdate(updatedQuotation);
    
    // Close modal
    setShowCreateProjectModal(false);
    
    // Notify parent component
    if (onConvertToProject) {
      onConvertToProject(projectId);
    }
  };

  // New: Accept quotation and create project in one action
  const handleAcceptAndCreateProject = async () => {
    if (!currentUser) {
      toast.error("User information not available");
      return;
    }

    setIsCreatingProject(true);

    try {
      const response = await apiFetch(`/quotations/${quotation.id}/accept-and-create-project`, {
        method: 'POST',
        body: JSON.stringify({
          bd_owner_user_id: currentUser.id,
          bd_owner_user_name: currentUser.name,
          ops_assigned_user_id: null,
          ops_assigned_user_name: null,
          special_instructions: ""
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create project');
      }

      const { quotation: updatedQuotation, project } = result.data;

      // Update local quotation state
      onUpdate(updatedQuotation);

      // Show success message
      toast.success(`✓ Project ${project.project_number} created successfully!`);

      // Store created project
      setCreatedProject(project);

      // Different behavior for PD vs BD users
      if (userDepartment === "Pricing") {
        // PD users: Open booking creation modal
        setShowCreateBookingsModal(true);
      } else {
        // BD users: Navigate to project (existing behavior)
        if (onConvertToProject) {
          onConvertToProject(project.id);
        }
      }

    } catch (error) {
      console.error('Error accepting quotation and creating project:', error);
      toast.error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Activate contract quotation — parallel to handleAcceptAndCreateProject for contracts
  const handleActivateContract = async () => {
    if (!currentUser) {
      toast.error("User information not available");
      return;
    }

    setIsActivatingContract(true);

    try {
      const response = await apiFetch(`/quotations/${quotation.id}/activate-contract`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to activate contract');
      }

      const { quotation: updatedQuotation } = result.data;

      // Update local quotation state
      onUpdate(updatedQuotation);

      // Show success message
      toast.success(`✓ Contract ${quotation.quote_number} activated! View in Contracts module.`);

      // Notify parent
      if (onConvertToContract) {
        onConvertToContract(quotation.id);
      }

    } catch (error) {
      console.error('Error activating contract:', error);
      toast.error(`Failed to activate contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsActivatingContract(false);
    }
  };

  // Handle saving from PDF View
  const handlePDFSave = async (data: any) => {
    // TODO: Implement update logic if needed
    // For now, we might just toast or update local state
    // But since QuotationNew structure might be different from what PDF saves...
    // PDF saves signatory names and notes.
    
    // We can map this back to QuotationNew update
    const updatedQuotation = {
      ...quotation,
      prepared_by: data.prepared_by,
      prepared_by_title: data.prepared_by_title,
      approved_by: data.approved_by,
      notes: data.notes
    };
    
    onUpdate(updatedQuotation);
    toast.success("Quotation updated");
  };

  return (
    <div style={{ 
      backgroundColor: "white",
      display: "flex",
      flexDirection: "column",
      height: "100vh"
    }}>
      {/* Header Bar - Cleaned Up (Concept 2) */}
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
            Back to Quotations
          </button>
          
          <h1 style={{ 
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            marginBottom: "4px"
          }}>
            {quotation.quotation_name || "Untitled Quotation"}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>
            {quotation.quote_number}
          </p>
        </div>
        
        {/* No action buttons here anymore - moved to toolbar */}
      </div>

      {/* Merged Toolbar: Tabs + Actions */}
      <div style={{ 
        padding: "0 48px", 
        borderBottom: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: "56px"
      }}>
        {/* Tabs - Left Side */}
        <div style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button
            onClick={() => setActiveTab("details")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "details" ? "#0F766E" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "details" ? "2px solid #0F766E" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "comments" ? "#0F766E" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "comments" ? "2px solid #0F766E" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Comments
          </button>
        </div>

        {/* Action Controls - Right Side */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Edit Button (Ghost Style) — hidden when locked (converted to project or contract) */}
          {!quotation.project_id && quotation.status !== "Converted to Contract" && (
            <button
              onClick={onEdit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: "transparent",
                border: "1px solid #F2F4F7", // Very faint outline
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F9FAFB";
                e.currentTarget.style.borderColor = "#E5E7EB";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "#F2F4F7";
              }}
            >
              <Edit3 size={14} />
              Edit
            </button>
          )}

          <StatusChangeButton
            quotation={quotation}
            onStatusChange={handleStatusChange}
            userDepartment={userDepartment}
          />
          
          {/* Edit Pricing - PD Only, Pending Pricing Status */}
          {userDepartment === "Pricing" && quotation.status === "Pending Pricing" && (
            <button
              onClick={onEdit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: "var(--neuron-brand-green)",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0D5F58";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
              }}
            >
              <Edit3 size={14} />
              Add Pricing
            </button>
          )}

          {/* Create Project - BD and PD, Accepted by Client Status (Project quotations only) */}
          {(userDepartment === "Business Development" || userDepartment === "Pricing") && quotation.status === "Accepted by Client" && !quotation.project_id && quotation.quotation_type !== "contract" && (
            <button
              onClick={handleAcceptAndCreateProject}
              disabled={isCreatingProject}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: isCreatingProject ? "#E0E0E0" : "var(--neuron-brand-green)",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                cursor: isCreatingProject ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: isCreatingProject ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isCreatingProject) {
                  e.currentTarget.style.backgroundColor = "#0D5F58";
                }
              }}
              onMouseLeave={(e) => {
                if (!isCreatingProject) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                }
              }}
            >
              <FolderPlus size={14} />
              {isCreatingProject ? "Creating..." : "Create Project"}
            </button>
          )}

          {/* Activate Contract - BD and PD, Accepted by Client Status (Contract quotations only) */}
          {(userDepartment === "Business Development" || userDepartment === "Pricing") && quotation.status === "Accepted by Client" && quotation.quotation_type === "contract" && quotation.contract_status !== "Active" && (
            <button
              onClick={handleActivateContract}
              disabled={isActivatingContract}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: isActivatingContract ? "#E0E0E0" : "var(--neuron-brand-green)",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                cursor: isActivatingContract ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: isActivatingContract ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isActivatingContract) {
                  e.currentTarget.style.backgroundColor = "#0D5F58";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActivatingContract) {
                  e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                }
              }}
            >
              <FolderPlus size={14} />
              {isActivatingContract ? "Activating..." : "Activate Contract"}
            </button>
          )}
          
          {/* Locked Indicator — shown for converted projects or activated contracts */}
          {(quotation.project_id || quotation.status === "Converted to Contract") && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              backgroundColor: "#FEF3C7",
              border: "1px solid #FCD34D",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#92400E"
            }}>
              🔒 Locked
            </div>
          )}
          
          <QuotationActionMenu
            quotation={quotation}
            onEdit={onEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onCreateTicket={onCreateTicket}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        flex: 1,
        overflow: "auto"
      }}>
        {activeTab === "details" ? (
           <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto" }}>
             
             {/* View Switcher */}
             <div className="flex items-center justify-between mb-8">
               <SegmentedToggle
                   value={viewMode}
                   onChange={setViewMode}
                   options={[
                       { value: "form", label: "Form View", icon: <Layout size={16} /> },
                       { value: "pdf", label: "PDF View", icon: <FileText size={16} /> }
                   ]}
               />
             </div>

             {viewMode === "pdf" ? (
                <div className="h-[800px] border border-gray-200 rounded-xl overflow-hidden bg-white">
                    <QuotationPDFScreen 
                        project={adaptedProject}
                        onClose={() => setViewMode("form")}
                        onSave={handlePDFSave}
                        currentUser={currentUser}
                        isEmbedded={true}
                    />
                </div>
             ) : (
                <QuotationFormView project={adaptedProject} />
             )}
           </div>
        ) : (
          <div style={{ height: "100%" }}>
            <CommentsTab
              inquiryId={quotation.id}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserDepartment={currentUserDepartment}
            />
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <CreateProjectModal
          quotation={quotation}
          onClose={() => setShowCreateProjectModal(false)}
          onSuccess={handleProjectCreationSuccess}
          currentUser={currentUser}
        />
      )}

      {/* Create Bookings Modal */}
      {showCreateBookingsModal && createdProject && currentUser && (
        <CreateBookingsFromProjectModal
          isOpen={showCreateBookingsModal}
          onClose={() => {
            setShowCreateBookingsModal(false);
            setCreatedProject(null);
          }}
          project={createdProject}
          currentUser={currentUser}
          onSuccess={() => {
            setShowCreateBookingsModal(false);
            setCreatedProject(null);
            // Optionally refresh quotation view
            onUpdate(quotation);
          }}
        />
      )}
    </div>
  );
}