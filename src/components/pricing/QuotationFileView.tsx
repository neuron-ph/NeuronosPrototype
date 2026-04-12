import { ArrowLeft, Download, Edit3, FileText, FolderPlus, Layout, UserCircle } from "lucide-react";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuotationNew, Project } from "../../types/pricing";
import { useUser } from "../../hooks/useUser";
import { CustomDropdown } from "../bd/CustomDropdown";
import { QuotationActionMenu } from "./QuotationActionMenu";
import { StatusChangeButton } from "./StatusChangeButton";
import { CreateProjectModal } from "../bd/CreateProjectModal";
import { CreateBookingsFromProjectModal } from "./CreateBookingsFromProjectModal";
import { toast } from "../ui/toast-utils";
import { CommentsTab } from "../shared/CommentsTab";
import { SegmentedToggle } from "../ui/SegmentedToggle";
import { QuotationPDFScreen } from "../projects/quotation/screen/QuotationPDFScreen";
import { QuotationFormView } from "../projects/quotation/QuotationFormView";
import { downloadQuotationPDF } from "./QuotationPDFRenderer";
import type { QuotationPrintOptions } from "../projects/quotation/screen/useQuotationDocumentState";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { supabase } from "../../utils/supabase/client";
import { createWorkflowTicket, getOpenWorkflowTicket } from "../../utils/workflowTickets";
import { logActivity, logCreation, logStatusChange } from "../../utils/activityLog";
import { buildProjectInsertFromQuotation, normalizeProjectRow } from "../../utils/projectHydration";
import {
  getNormalizedContractStatus,
  getNormalizedQuotationStatus,
  isQuotationLocked,
  normalizeQuotationStatus,
} from "../../utils/quotationStatus";

interface QuotationFileViewProps {
  quotation: QuotationNew;
  onBack: () => void;
  onEdit: () => void;
  userDepartment?: "Business Development" | "Pricing";
  onAcceptQuotation?: (quotation: QuotationNew) => void;
  onDelete?: () => void;
  onUpdate: (quotation: QuotationNew) => void;
  onSaveQuotation?: (quotation: QuotationNew) => Promise<void>;
  onDuplicate?: (quotation: QuotationNew) => void;
  onCreateTicket?: (quotation: QuotationNew) => void;
  onConvertToProject?: (projectId: string) => void;
  onConvertToContract?: (quotationId: string) => void;
  currentUser?: { id: string; name: string; email: string; department: string; role?: string } | null;
}

type TabType = "details" | "comments";

export function QuotationFileView({ quotation, onBack, onEdit, userDepartment, onAcceptQuotation, onDelete, onUpdate, onSaveQuotation, onDuplicate, onCreateTicket, onConvertToProject, onConvertToContract, currentUser }: QuotationFileViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("details");
  const [viewMode, setViewMode] = useState<"form" | "pdf">("form");
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showCreateBookingsModal, setShowCreateBookingsModal] = useState(false);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [isActivatingContract, setIsActivatingContract] = useState(false);
  const [assignedToId, setAssignedToId] = useState<string>((quotation as any).assigned_to || "");
  const [isAssigning, setIsAssigning] = useState(false);
  const [pendingAssigneeId, setPendingAssigneeId] = useState<string | null>(null);
  const [pricingDeadline, setPricingDeadline] = useState<string>("");
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [localDeadline, setLocalDeadline] = useState<string>(() => (quotation as any).details?.pricing_deadline || "");

  // Keep localDeadline in sync when the prop updates (e.g. after parent re-fetch)
  useEffect(() => {
    setLocalDeadline((quotation as any).details?.pricing_deadline || "");
  }, [(quotation as any).details?.pricing_deadline]);
  const [isQuickDownloading, setIsQuickDownloading] = useState(false);
  const { settings: companySettings } = useCompanySettings();

  const normalizedStatus = getNormalizedQuotationStatus(quotation);
  const normalizedContractStatus = getNormalizedContractStatus(quotation);
  const isLocked = isQuotationLocked(quotation);

  const { effectiveRole } = useUser();

  // TODO: Replace with actual user data from context/auth
  const currentUserId = currentUser?.id || "user-123";
  const currentUserName = currentUser?.name || "John Doe";
  const currentUserDepartment = currentUser?.department || userDepartment || "BD";
  const activeUserRole = currentUser?.role || effectiveRole;

  // Can assign if user is a Pricing Manager only (handles both old "manager" and new "Manager" role values)
  const canAssign = userDepartment === "Pricing" && activeUserRole?.toLowerCase() === "manager";

  // Fetch all Pricing users for the assignment dropdown, filter out managers/above in JS
  // No 'enabled' guard — query always runs; the UI is already gated by canAssign
  const MANAGER_ROLES = ["manager", "Manager", "director", "Director", "Executive", "executive"];
  const { data: pricingUsers = [] } = useQuery({
    queryKey: ["users", "pricing-assignable"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, role")
        .eq("department", "Pricing")
        .order("name");
      return ((data || []) as { id: string; name: string; role: string }[])
        .filter(u => !MANAGER_ROLES.includes(u.role));
    },
    staleTime: 5 * 60 * 1000,
  });

  const confirmAssign = async (newUserId: string, deadline: string) => {
    if (isAssigning) return;
    setIsAssigning(true);
    try {
      const previousAssigneeId = (quotation as any).assigned_to as string | undefined;
      const newAssignee = pricingUsers.find(u => u.id === newUserId);

      const updatedDetails = newUserId && deadline
        ? { ...(quotation as any).details, pricing_deadline: deadline }
        : { ...(quotation as any).details, pricing_deadline: null };

      const { error } = await supabase
        .from("quotations")
        .update({ assigned_to: newUserId || null, details: updatedDetails, updated_at: new Date().toISOString() })
        .eq("id", quotation.id);
      if (error) throw error;

      setAssignedToId(newUserId);
      setPendingAssigneeId(null);
      // _localUpdate: true tells handleUpdateQuotation to skip the redundant second DB write —
      // confirmAssign already wrote assigned_to + details directly above.
      onUpdate({ ...quotation, assigned_to: newUserId, details: updatedDetails, _localUpdate: true } as QuotationNew);

      const quotationLabel = quotation.quote_number || quotation.quotation_name || quotation.id;
      const customerLabel = quotation.customer_name || "Unknown";
      const servicesLabel = (quotation.services || []).join(", ") || "N/A";

      // Notify newly assigned staff — include deadline in body.
      // resolutionAction: when the staff marks this ticket Done, the quotation status
      // automatically advances to "Pricing in Progress" (acknowledgement).
      if (newUserId) {
        const deadlineLine = deadline
          ? `\nDue: ${new Date(deadline + "T00:00:00").toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}`
          : "";
        createWorkflowTicket({
          subject: `Assigned to You: ${quotationLabel}`,
          body: `${currentUserName} assigned you to price this quotation.\n\nCustomer: ${customerLabel}\nServices: ${servicesLabel}${deadlineLine}`,
          type: "request",
          priority: "normal",
          recipientUserId: newUserId,
          linkedRecordType: "quotation",
          linkedRecordId: quotation.id,
          linkedRecordLabel: quotationLabel,
          resolutionAction: "set_quotation_pricing_in_progress",
          createdBy: currentUserId,
          createdByName: currentUserName,
          createdByDept: currentUserDepartment,
          autoCreated: true,
        }).catch(console.error);
      }

      // FYI to the BD rep who created the inquiry
      const bdRepId = (quotation as any).created_by as string | undefined;
      if (bdRepId && bdRepId !== currentUserId) {
        createWorkflowTicket({
          subject: `Pricing Started: ${customerLabel}`,
          body: `${newAssignee?.name || "A pricing staff member"} is now working on pricing for your inquiry.\n\nQuotation: ${quotationLabel}`,
          type: "fyi",
          priority: "normal",
          recipientUserId: bdRepId,
          linkedRecordType: "quotation",
          linkedRecordId: quotation.id,
          createdBy: currentUserId,
          createdByName: currentUserName,
          createdByDept: currentUserDepartment,
          autoCreated: true,
        }).catch(console.error);
      }

      // Notify previous assignee they've been unassigned
      if (previousAssigneeId && previousAssigneeId !== newUserId) {
        createWorkflowTicket({
          subject: `Reassigned: ${quotationLabel}`,
          body: `You've been unassigned from this quotation. No further action needed.\n\nCustomer: ${customerLabel}`,
          type: "fyi",
          priority: "normal",
          recipientUserId: previousAssigneeId,
          linkedRecordType: "quotation",
          linkedRecordId: quotation.id,
          createdBy: currentUserId,
          createdByName: currentUserName,
          createdByDept: currentUserDepartment,
          autoCreated: true,
        }).catch(console.error);
      }

      toast.success(newUserId ? `Assigned to ${newAssignee?.name || "staff"}` : "Assignment cleared");
    } catch (err: any) {
      toast.error("Failed to assign: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDropdownChange = (newUserId: string) => {
    if (!newUserId) {
      // Clearing assignment — no deadline needed, fire immediately
      confirmAssign("", "");
      return;
    }
    // Calculate default deadline: today + 3 business days
    const d = new Date();
    let count = 0;
    while (count < 3) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    setPendingAssigneeId(newUserId);
    setPricingDeadline(d.toISOString().split("T")[0]);
  };
  
  const handleDeadlineChange = async (newDeadline: string) => {
    if (isSavingDeadline || !newDeadline) return;
    const previousDeadline = localDeadline;
    setLocalDeadline(newDeadline); // optimistic update — date picker reflects change immediately
    setIsSavingDeadline(true);
    try {
      const updatedDetails = { ...(quotation as any).details, pricing_deadline: newDeadline };
      const { error } = await supabase
        .from("quotations")
        .update({ details: updatedDetails, updated_at: new Date().toISOString() })
        .eq("id", quotation.id);
      if (error) throw error;
      onUpdate({ ...quotation, details: updatedDetails, _localUpdate: true } as QuotationNew);
      toast.success("Deadline updated");
    } catch (err: any) {
      setLocalDeadline(previousDeadline); // revert on failure
      toast.error("Failed to update deadline: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsSavingDeadline(false);
    }
  };

  // Adapter function to convert QuotationNew to Project for compatibility with Project components.
  // IMPORTANT: Merge JSONB details first so any fields stored there (prepared_by_title,
  // addressed_to_name, custom_notes, etc.) are surfaced before explicit overrides replace them.
  const adaptQuotationToProject = (quotation: QuotationNew): Project => {
    const details = typeof quotation.details === 'object' && quotation.details !== null
      ? (quotation.details as Record<string, any>)
      : {};

    return {
      // Spread JSONB details first — explicit fields below take precedence
      ...details,

      id: quotation.project_id || "temp-project-id",
      project_number: quotation.project_number || quotation.quote_number,
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
      status: "Active",
      booking_status: "No Bookings Yet",
      created_at: quotation.created_at,
      updated_at: quotation.updated_at,

      // Owner — prefer display-name fields over raw IDs
      bd_owner_user_name: quotation.prepared_by,

      quotation: quotation, // Nest the original quotation for the PDF renderer
    } as Project;
  };

  const adaptedProject = adaptQuotationToProject(quotation);

  // Check if pricing information should be visible
  // Visible if: user is PD, OR status indicates quotation has been priced
  const showPricing = userDepartment === "Pricing" || 
    normalizedStatus === "Priced" || 
    normalizedStatus === "Sent to Client" ||
    normalizedStatus === "Accepted by Client" ||
    normalizedStatus === "Rejected by Client" ||
    normalizedStatus === "Needs Revision" ||
    normalizedStatus === "Disapproved" ||
    normalizedStatus === "Cancelled" ||
    normalizedStatus === "Converted to Project" ||
    normalizedStatus === "Converted to Contract";

  // Calculate financial totals
  const subtotalTaxable = quotation.charge_categories?.reduce((total, category) => {
    return total + (category.subtotal || 0);
  }, 0) || 0;

  const financialSummary = {
    subtotal_non_taxed: quotation.financial_summary?.subtotal_non_taxed || 0,
    subtotal_taxable: quotation.financial_summary?.subtotal_taxed || subtotalTaxable,
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
    if (onDuplicate) {
      onDuplicate(quotation);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
    } else {
      onBack();
    }
  };

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    // Contract expiry — update contract_status only, leave status untouched
    if (newStatus === "Mark as Expired") {
      onUpdate({ ...quotation, contract_status: "Expired" });
      return;
    }

    const _normalizedNew = normalizeQuotationStatus(newStatus, quotation);
    const updatedQuotation = {
      ...quotation,
      status: _normalizedNew,
      disapproval_reason: reason,
      cancellation_reason: reason
    };
    onUpdate(updatedQuotation);
    if (currentUser) {
      const _actorSC = { id: currentUser.id, name: currentUser.name, department: currentUser.department };
      logStatusChange("quotation", quotation.id, quotation.quote_number ?? quotation.id, quotation.status ?? "", _normalizedNew, _actorSC);
    }

    // BD → Pricing handoff: create workflow ticket when submitting for pricing
    if (normalizeQuotationStatus(newStatus, quotation) === "Pending Pricing" && currentUser) {
      const existing = await getOpenWorkflowTicket("quotation", quotation.id);
      if (!existing) {
        await createWorkflowTicket({
          subject: `Price This: ${quotation.quotation_name}${quotation.quote_number ? ` (${quotation.quote_number})` : ""}`,
          body: `${currentUser.name} submitted a quotation for pricing.\n\nCustomer: ${quotation.customer_name}`,
          type: "request",
          priority: "normal",
          recipientDept: "Pricing",
          linkedRecordType: "quotation",
          linkedRecordId: quotation.id,
          resolutionAction: "set_quotation_priced",
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          createdByDept: currentUser.department,
        });
      }
    }

    // Pricing → BD handoff: notify BD rep when quotation is priced and ready to send
    if (normalizeQuotationStatus(newStatus, quotation) === "Priced" && currentUser) {
      const bdRepId = (quotation as any).created_by as string | undefined;
      await createWorkflowTicket({
        subject: `Ready to Send: ${quotation.quotation_name}${quotation.quote_number ? ` (${quotation.quote_number})` : ""}`,
        body: `Pricing is complete. Please review and send this quotation to ${quotation.customer_name}.`,
        type: "request",
        priority: "normal",
        ...(bdRepId ? { recipientUserId: bdRepId } : { recipientDept: "Business Development" }),
        linkedRecordType: "quotation",
        linkedRecordId: quotation.id,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        createdByDept: currentUser.department,
        autoCreated: true,
      });
    }

    // Project cascade: cancel linked project when quotation is rejected/cancelled
    const normalizedNew = normalizeQuotationStatus(newStatus, quotation);
    const cancellingStatuses: string[] = ["Rejected by Client", "Disapproved", "Cancelled"];
    if (cancellingStatuses.includes(normalizedNew) && quotation.project_id) {
      const { error: projectError } = await supabase
        .from('projects')
        .update({ status: "Cancelled", updated_at: new Date().toISOString() })
        .eq('id', quotation.project_id);
      if (projectError) {
        console.error("Failed to cancel linked project:", projectError.message);
      }
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

  const handleProjectCreationSuccess = async (projectId: string) => {
    // Update quotation status to "Converted to Project"
    const updatedQuotation = {
      ...quotation,
      status: "Converted to Project" as QuotationNew["status"]
    };
    onUpdate(updatedQuotation);

    // Close modal
    setShowCreateProjectModal(false);

    // Notify Operations that a new project is ready for execution
    if (currentUser) {
      await createWorkflowTicket({
        subject: `New Project: ${quotation.customer_name}`,
        body: `A project has been created from quotation ${quotation.quotation_name}${quotation.quote_number ? ` (${quotation.quote_number})` : ""}.\n\nCustomer: ${quotation.customer_name}`,
        type: "fyi",
        priority: "normal",
        recipientDept: "Operations",
        linkedRecordType: "project",
        linkedRecordId: projectId,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        createdByDept: currentUser.department,
        autoCreated: true,
      });
    }

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
      // Create the project first, then persist the conversion markers on the quotation.
      const projectNumber = `PRJ-${Date.now().toString().slice(-6)}`;
      const projectData = buildProjectInsertFromQuotation(quotation, currentUser, {
        id: `proj-${Date.now()}`,
        projectNumber,
      });
      const { data: project, error: pError } = await supabase.from('projects').insert(projectData).select().single();
      if (pError) throw new Error(pError.message);
      const _actorProj = { id: currentUser.id, name: currentUser.name, department: currentUser.department };
      logCreation("project", project.id, project.project_number ?? project.id, _actorProj);

      const projectConversionPayload = {
        status: "Converted to Project" as QuotationNew["status"],
        project_id: project.id,
        updated_at: new Date().toISOString(),
        // accepted_at and project_number stored in details — not top-level columns
        details: {
          ...(typeof quotation.details === 'object' && quotation.details !== null ? quotation.details as object : {}),
          accepted_at: new Date().toISOString(),
          project_number: project.project_number,
        },
      };
      const { error: qError } = await supabase
        .from('quotations')
        .update(projectConversionPayload)
        .eq('id', quotation.id);
      if (qError) throw new Error(qError.message);
      logActivity("quotation", quotation.id, quotation.quote_number ?? quotation.id, "converted", _actorProj, { description: "Converted to project" });

      const updatedQuotation = { ...quotation, ...projectConversionPayload };
      onUpdate(updatedQuotation);

      toast.success(`✓ Project ${project.project_number} created successfully!`);

      setCreatedProject(normalizeProjectRow(project));

      if (userDepartment === "Pricing") {
        setShowCreateBookingsModal(true);
      } else {
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
      const contractActivationPayload = {
        status: "Converted to Contract" as QuotationNew["status"],
        contract_status: "Active" as QuotationNew["contract_status"],
        updated_at: new Date().toISOString(),
      };
      const { error: activateError } = await supabase
        .from('quotations')
        .update(contractActivationPayload)
        .eq('id', quotation.id);

      if (activateError) throw new Error(activateError.message);
      const _actorAct = { id: currentUser.id, name: currentUser.name, department: currentUser.department };
      logStatusChange("quotation", quotation.id, quotation.quote_number ?? quotation.id, quotation.status ?? "", "Active", _actorAct);

      const updatedContract = { ...quotation, ...contractActivationPayload };
      onUpdate(updatedContract);

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

  // Quick-download with default options — bypasses the PDF editor for one-click export
  const handleQuickDownload = async () => {
    if (isQuickDownloading) return;
    setIsQuickDownloading(true);
    try {
      const defaultOptions: QuotationPrintOptions = {
        signatories: {
          prepared_by: {
            name: currentUser?.name || quotation.prepared_by || "System User",
            title: "Sales Representative",
          },
          approved_by: { name: "Management", title: "Authorized Signatory" },
        },
        addressed_to: {
          name: quotation.contact_person_name || "",
          title: "",
        },
        validity_override: quotation.valid_until || "",
        payment_terms: "",
        custom_notes: "",
        display: { show_bank_details: true, show_tax_summary: true },
      };
      await downloadQuotationPDF(quotation, defaultOptions, companySettings);
    } catch (err: any) {
      toast.error("Download failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsQuickDownloading(false);
    }
  };

  // Handle saving PDF document settings — persists all signatory, validity, payment and notes
  // fields directly as explicit DB columns (migration 028 added them all).
  const handlePDFSave = async (data: any) => {
    try {
      const { error } = await supabase
        .from('quotations')
        .update({
          prepared_by: data.prepared_by || null,
          prepared_by_title: data.prepared_by_title || null,
          approved_by: data.approved_by || null,
          approved_by_title: data.approved_by_title || null,
          addressed_to_name: data.addressed_to_name || null,
          addressed_to_title: data.addressed_to_title || null,
          payment_terms: data.payment_terms || null,
          custom_notes: data.custom_notes || null,
          valid_until: data.valid_until || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotation.id);

      if (error) throw error;

      onUpdate({
        ...quotation,
        prepared_by: data.prepared_by ?? quotation.prepared_by,
        prepared_by_title: data.prepared_by_title ?? quotation.prepared_by_title,
        approved_by: data.approved_by ?? quotation.approved_by,
        approved_by_title: data.approved_by_title ?? quotation.approved_by_title,
        addressed_to_name: data.addressed_to_name ?? quotation.addressed_to_name,
        addressed_to_title: data.addressed_to_title ?? quotation.addressed_to_title,
        payment_terms: data.payment_terms ?? quotation.payment_terms,
        custom_notes: data.custom_notes ?? quotation.custom_notes,
        valid_until: data.valid_until ?? quotation.valid_until,
      });
      toast.success("PDF settings saved");
    } catch (err: any) {
      toast.error("Failed to save: " + (err?.message ?? "Unknown error"));
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
        padding: "20px clamp(20px, 4vw, 48px)",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px"
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
              marginBottom: "10px",
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
            fontSize: "24px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            margin: 0,
            lineHeight: 1.2
          }}>
            {quotation.quotation_name || "Untitled Quotation"}
            {quotation.quote_number && (
              <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--neuron-ink-muted)", marginLeft: "10px" }}>
                {quotation.quote_number}
              </span>
            )}
          </h1>
        </div>

        {/* Assign to — Pricing Manager only, top-right of header */}
        {canAssign && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserCircle size={14} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", whiteSpace: "nowrap" }}>
              Assign to:
            </span>
            <div style={{ minWidth: 160 }}>
              <CustomDropdown
                value={pendingAssigneeId ?? assignedToId}
                onChange={handleDropdownChange}
                options={[
                  { value: "", label: "Unassigned" },
                  ...pricingUsers.map(u => ({ value: u.id, label: u.name })),
                ]}
                placeholder={isAssigning ? "Saving…" : "Select staff"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Merged Toolbar: Tabs + Actions */}
      <div style={{
        padding: "0 clamp(20px, 4vw, 48px)",
        borderBottom: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: "56px",
        flexWrap: "wrap",
        gap: "8px"
      }}>
        {/* Tabs - Left Side */}
        <div role="tablist" aria-label="Quotation sections" style={{ display: "flex", gap: "24px", height: "100%" }}>
          <button
            role="tab"
            aria-selected={activeTab === "details"}
            aria-controls="tab-panel-details"
            id="tab-details"
            onClick={() => setActiveTab("details")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "details" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "details" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Details
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "comments"}
            aria-controls="tab-panel-comments"
            id="tab-comments"
            onClick={() => setActiveTab("comments")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "comments" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "comments" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
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

          {/* Deadline confirmation — shown in toolbar when a pending assignee is selected */}
          {canAssign && pendingAssigneeId && (
            <>
              <span style={{ fontSize: 13, color: "var(--neuron-ink-muted)", whiteSpace: "nowrap" }}>
                Price by:
              </span>
              <CustomDatePicker
                value={pricingDeadline}
                onChange={setPricingDeadline}
                placeholder="Pick a date"
                minWidth="140px"
              />
              <button
                onClick={() => { setPendingAssigneeId(null); setPricingDeadline(""); }}
                style={{
                  fontSize: 13,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--neuron-ui-border)",
                  background: "transparent",
                  color: "var(--neuron-ink-muted)",
                  cursor: "pointer",
                  height: 34,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAssign(pendingAssigneeId, pricingDeadline)}
                disabled={!pricingDeadline || isAssigning}
                style={{
                  fontSize: 13,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: pricingDeadline && !isAssigning ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)",
                  color: pricingDeadline && !isAssigning ? "#fff" : "var(--neuron-ink-muted)",
                  cursor: pricingDeadline && !isAssigning ? "pointer" : "not-allowed",
                  fontWeight: 500,
                  height: 34,
                  whiteSpace: "nowrap",
                }}
              >
                {isAssigning ? "Saving…" : "Confirm Assign"}
              </button>
              {/* Divider */}
              <div style={{ width: 1, height: 20, background: "var(--neuron-ui-border)" }} />
            </>
          )}

          {/* Deadline — visible to all Pricing users when a deadline is set */}
          {userDepartment === "Pricing" && !pendingAssigneeId && (() => {
            const deadline = localDeadline;
            if (!deadline) return null;
            const deadlineDate = new Date(deadline + "T00:00:00");
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isUrgent = daysLeft <= 2;
            const isOverdue = daysLeft < 0;
            const chipColor = isOverdue
              ? { bg: "var(--theme-status-danger-bg)", border: "var(--theme-status-danger-border)", text: "var(--theme-status-danger-fg)" }
              : isUrgent
              ? { bg: "var(--theme-status-warning-bg)", border: "var(--theme-status-warning-border)", text: "var(--theme-status-warning-fg)" }
              : { bg: "var(--neuron-ui-bg-subtle)", border: "var(--neuron-ui-border)", text: "var(--neuron-ink-muted)" };
            return (
              <>
                {canAssign ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: chipColor.text, whiteSpace: "nowrap", fontWeight: isUrgent ? 500 : 400 }}>
                      {isOverdue ? "Overdue:" : "Due:"}
                    </span>
                    <CustomDatePicker
                      value={deadline}
                      onChange={handleDeadlineChange}
                      placeholder="Pick a date"
                      minWidth="130px"
                    />
                  </div>
                ) : (
                  <span style={{
                    fontSize: 12,
                    color: chipColor.text,
                    background: chipColor.bg,
                    border: `1px solid ${chipColor.border}`,
                    borderRadius: 6,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                    fontWeight: isUrgent ? 500 : 400,
                  }}>
                    {isOverdue ? "Overdue: " : "Due: "}{deadlineDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <div style={{ width: 1, height: 20, background: "var(--neuron-ui-border)" }} />
              </>
            );
          })()}
          {/* Edit Button (Ghost Style) — hidden when locked, or when "Add Pricing" is shown (same action, better label) */}
          {!isLocked && !(userDepartment === "Pricing" && normalizedStatus === "Pending Pricing") && (
            <button
              onClick={onEdit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: "transparent",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
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
          {userDepartment === "Pricing" && normalizedStatus === "Pending Pricing" && (
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
                e.currentTarget.style.backgroundColor = "var(--neuron-brand-green-dark, #0D5F58)";
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
          {(userDepartment === "Business Development" || userDepartment === "Pricing") && normalizedStatus === "Accepted by Client" && !quotation.project_id && quotation.quotation_type !== "contract" && (
            <button
              onClick={handleAcceptAndCreateProject}
              disabled={isCreatingProject}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: isCreatingProject ? "var(--theme-border-default)" : "var(--neuron-brand-green)",
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
                  e.currentTarget.style.backgroundColor = "var(--neuron-brand-green-dark, #0D5F58)";
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
          {(userDepartment === "Business Development" || userDepartment === "Pricing") && normalizedStatus === "Accepted by Client" && quotation.quotation_type === "contract" && normalizedContractStatus !== "Active" && (
            <button
              onClick={handleActivateContract}
              disabled={isActivatingContract}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                backgroundColor: isActivatingContract ? "var(--theme-border-default)" : "var(--neuron-brand-green)",
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
                  e.currentTarget.style.backgroundColor = "var(--neuron-brand-green-dark, #0D5F58)";
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
          {isLocked && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              backgroundColor: "var(--theme-status-warning-bg)",
              border: "1px solid var(--theme-status-warning-border)",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--theme-status-warning-fg)"
            }}>
              🔒 Locked
            </div>
          )}
          
          {/* Quick Download PDF — one-click export with default settings */}
          <button
            onClick={handleQuickDownload}
            disabled={isQuickDownloading}
            title="Download PDF"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              backgroundColor: "transparent",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              color: isQuickDownloading ? "var(--neuron-ink-muted)" : "var(--neuron-ink-secondary)",
              cursor: isQuickDownloading ? "not-allowed" : "pointer",
              opacity: isQuickDownloading ? 0.6 : 1,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isQuickDownloading) {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
            }}
          >
            {isQuickDownloading ? (
              <div style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            ) : (
              <Download size={14} />
            )}
            PDF
          </button>

          <QuotationActionMenu
            quotation={quotation}
            onEdit={onEdit}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onCreateTicket={onCreateTicket ? handleCreateTicket : undefined}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div
        role="tabpanel"
        id={activeTab === "details" ? "tab-panel-details" : "tab-panel-comments"}
        aria-labelledby={activeTab === "details" ? "tab-details" : "tab-comments"}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {activeTab === "details" ? (
          viewMode === "pdf" ? (
            // PDF mode: same container as form view
            <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
              {/* View Switcher */}
              <div className="flex items-center justify-between mb-8">
                <SegmentedToggle
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "form", label: "Form View", icon: <Layout size={16} /> },
                    { value: "pdf", label: "PDF View", icon: <FileText size={16} /> },
                  ]}
                />
              </div>
              {/* PDF screen in a bounded card */}
              <div style={{ height: "calc(100vh - 260px)", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--neuron-ui-border)" }}>
                <QuotationPDFScreen
                  project={adaptedProject}
                  quotation={quotation}
                  onClose={() => setViewMode("form")}
                  onSave={handlePDFSave}
                  currentUser={currentUser}
                  isEmbedded={true}
                />
              </div>
            </div>
          ) : (
            // Form mode: padded, max-width constrained, scrollable
            <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
              {/* View Switcher */}
              <div className="flex items-center justify-between mb-8">
                <SegmentedToggle
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "form", label: "Form View", icon: <Layout size={16} /> },
                    { value: "pdf", label: "PDF View", icon: <FileText size={16} /> },
                  ]}
                />
              </div>

              <QuotationFormView
                project={adaptedProject}
                onSave={async (data: any) => {
                  if (onSaveQuotation) {
                    try {
                      await onSaveQuotation(data);
                      toast.success("Quotation saved successfully");
                    } catch (err: any) {
                      toast.error(err?.message || 'Save failed');
                    }
                  } else {
                    onUpdate(data);
                    toast.success("Quotation updated");
                  }
                }}
                onAmend={onEdit}
              />
            </div>
          )
        ) : (
          <div style={{ flex: 1 }}>
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
