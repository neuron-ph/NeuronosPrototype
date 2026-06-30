import { ArrowLeft, Download, Edit3, FileDown, FolderPlus, Lock, UserCircle } from "lucide-react";
import { usePermission } from "../../context/PermissionProvider";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuotationNew, Project } from "../../types/pricing";
import { CustomDropdown } from "../bd/CustomDropdown";
import { QuotationActionMenu } from "./QuotationActionMenu";
import { UnlockAmendButton } from "./UnlockAmendButton";
import { StatusChangeButton } from "./StatusChangeButton";
import { CreateProjectModal } from "../bd/CreateProjectModal";
import { toast } from "../ui/toast-utils";
import { CommentsTab } from "../shared/CommentsTab";
import { EntityAttachmentsTab } from "../shared/EntityAttachmentsTab";
import { PDFStudioOverlay } from "../projects/quotation/screen/PDFStudioOverlay";
import { QuotationFormView } from "../projects/quotation/QuotationFormView";
import { downloadQuotationPDF } from "./QuotationPDFRenderer";
import type { QuotationPrintOptions } from "../projects/quotation/screen/useQuotationDocumentState";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { supabase } from "../../utils/supabase/client";
import { createWorkflowTicket, getOpenWorkflowTicket } from "../../utils/workflowTickets";
import { recordNotificationEvent, fetchDeptManagerIds } from "../../utils/notifications";
import { useMarkEntityReadOnMount } from "../../hooks/useNotifications";
import { logActivity, logCreation, logStatusChange } from "../../utils/activityLog";
import { buildProjectInsertFromQuotation } from "../../utils/projectHydration";
import { canUseQuotationLens, canViewQuotationComments, canViewQuotationFile, quotationTabModules } from "../../utils/quotationAccess";
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

type TabType = "details" | "comments" | "attachments";

export function QuotationFileView({ quotation, onBack, onEdit, userDepartment, onAcceptQuotation, onDelete, onUpdate, onSaveQuotation, onDuplicate, onCreateTicket, onConvertToProject, onConvertToContract, currentUser }: QuotationFileViewProps) {
  const { can } = usePermission();
  // Clear unread for both possible entity types — quotations and inquiries share the same row
  useMarkEntityReadOnMount("quotation", quotation.id);
  useMarkEntityReadOnMount("inquiry", quotation.id);
  useMarkEntityReadOnMount("contract", quotation.id);
  const canViewDetailsTab = canViewQuotationFile(can, userDepartment);
  const canViewCommentsTab = canViewQuotationComments(can, userDepartment);
  const [activeTab, setActiveTab] = useState<TabType>(
    canViewDetailsTab ? "details" : canViewCommentsTab ? "comments" : "details"
  );
  useEffect(() => {
    if (activeTab === "details" && !canViewDetailsTab && canViewCommentsTab) {
      setActiveTab("comments");
    } else if (activeTab === "comments" && !canViewCommentsTab && canViewDetailsTab) {
      setActiveTab("details");
    }
  }, [activeTab, canViewDetailsTab, canViewCommentsTab]);
  const [isPDFStudioOpen, setIsPDFStudioOpen] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
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
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useCompanySettings();

  const normalizedStatus = getNormalizedQuotationStatus(quotation);
  const normalizedContractStatus = getNormalizedContractStatus(quotation);
  const isLocked = isQuotationLocked(quotation);

  // "Pricing has been entered" — any priced line item (legacy charge_categories or
  // the dual buying/selling format) or a computed grand total. Used to relabel the
  // pricing CTA: a quote that's priced but still sitting in "Pending Pricing"
  // (saved as draft, never submitted) reads "Review & Submit Pricing", not the
  // misleading "Add Pricing".
  const hasPricingEntered =
    [quotation.charge_categories, (quotation as any).selling_price, (quotation as any).buying_price]
      .some((cats: any) => Array.isArray(cats) && cats.some((c: any) => (c?.line_items?.length ?? 0) > 0))
    || ((quotation.financial_summary?.grand_total ?? 0) > 0);

  // TODO: Replace with actual user data from context/auth
  const currentUserId = currentUser?.id || "user-123";
  const currentUserName = currentUser?.name || "John Doe";
  const currentUserDepartment = currentUser?.department || userDepartment || "BD";

  // NEU-020 DD-10 (ruled): assignment is part of working quotations — edit-class.
  // DD-13: with assignment moved, pricing_quotations:approve retired (dashed).
  const canAssign = can("pricing_quotations", "edit");
  const canEditPricing = can("pricing_quotations", "edit");
  const canEditQuotation = canUseQuotationLens(can, userDepartment, "edit");
  // NEU-022: amend a converted/locked quotation — a manager capability distinct
  // from the normal edit lens. Project-quote amendment ships now; contract
  // amendment (rate versioning + live re-rate) ships in a later phase.
  const canAmendRates = quotation.quotation_type === "contract"
    ? can("pricing_contracts", "amend")
    : can("pricing_quotations", "amend");
  const canCreateQuotation = canUseQuotationLens(can, userDepartment, "create");
  const canDeleteQuotation = canUseQuotationLens(can, userDepartment, "delete");
  const canExportQuotation = canUseQuotationLens(can, userDepartment, "export");
  const canCreateProject = can("bd_projects", "create") || can("pricing_projects", "create");
  const canActivateContract = can("pricing_contracts", "edit");
  // NEU-019 WG-14/16: comment posting + attachment writes get their own knobs.
  // Resolved per door — BD opens read bd_inquiries_*_tab, Pricing opens read
  // pricing_quotations_*_tab (the inquiry/quotation mirror, like Projects).
  const quotationTabs = quotationTabModules(userDepartment);
  const canPostComments = can(quotationTabs.comments, "create");
  const canViewAttachmentsTab = can(quotationTabs.attachments, "view");
  const canUploadAttachments = can(quotationTabs.attachments, "create");
  const canDeleteAttachments = can(quotationTabs.attachments, "delete");

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

  // Pricing is visible to anyone who can edit it, or once status indicates the quotation has been priced
  const showPricing = canEditPricing ||
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
      if (currentUser) {
        const acctManagers = await fetchDeptManagerIds('Accounting');
        void recordNotificationEvent({
          actorUserId: currentUser.id,
          module: 'bd',
          subSection: 'contracts',
          entityType: 'contract',
          entityId: quotation.id,
          kind: 'status_changed',
          summary: {
            label: `Contract expired: ${quotation.quote_number ?? ''}`,
            reference: quotation.quote_number ?? undefined,
            customer_name: quotation.customer_name ?? undefined,
            to_status: 'Expired',
          },
          recipientIds: [(quotation as any).created_by, ...acctManagers],
        });
      }
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

      // Red-dot ping: notify assigned Pricing reviewer + Pricing managers
      const assignedPricingId = (quotation as any).assigned_to as string | undefined;
      const { data: pricingManagers } = await supabase
        .from('users')
        .select('id')
        .eq('department', 'Pricing')
        .in('role', ['manager', 'executive']);
      void recordNotificationEvent({
        actorUserId: currentUser.id,
        module: 'pricing',
        subSection: 'quotations',
        entityType: 'quotation',
        entityId: quotation.id,
        kind: 'submitted',
        summary: {
          label: `Quotation submitted for pricing`,
          reference: quotation.quote_number ?? undefined,
          customer_name: quotation.customer_name,
        },
        recipientIds: [assignedPricingId, ...(pricingManagers || []).map((u: any) => u.id)],
      });
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

      // Red-dot ping: notify BD creator
      void recordNotificationEvent({
        actorUserId: currentUser.id,
        module: 'pricing',
        subSection: 'quotations',
        entityType: 'quotation',
        entityId: quotation.id,
        kind: 'approved',
        summary: {
          label: `Quotation priced — ready to send`,
          reference: quotation.quote_number ?? undefined,
          customer_name: quotation.customer_name,
        },
        recipientIds: [bdRepId],
      });
    }

    // Accepted by Client (approved) → notify Pricing so they see the quote won and
    // can convert it to a project. P3: this transition previously fired NO inbox
    // ticket and NO bell — the approval never reflected in the inbox.
    if (normalizeQuotationStatus(newStatus, quotation) === "Accepted by Client" && currentUser) {
      const assignedPricingId = (quotation as any).assigned_to as string | undefined;
      const bdRepId = (quotation as any).created_by as string | undefined;
      const { data: pricingManagers } = await supabase
        .from('users')
        .select('id')
        .eq('department', 'Pricing')
        .in('role', ['manager', 'executive']);
      const managerIds = (pricingManagers || []).map((u: any) => u.id as string);

      // Inbox ticket → assigned pricer (else the Pricing dept), with Pricing managers
      // CC'd so the approval lands in both the pricer's and the managers' inboxes.
      await createWorkflowTicket({
        subject: `Approved: ${quotation.quotation_name}${quotation.quote_number ? ` (${quotation.quote_number})` : ""}`,
        body: `Quotation approved by client — ready to convert to project.\n\nCustomer: ${quotation.customer_name}`,
        type: "fyi",
        priority: "normal",
        ...(assignedPricingId ? { recipientUserId: assignedPricingId } : { recipientDept: "Pricing" }),
        ccUserIds: managerIds,
        linkedRecordType: "quotation",
        linkedRecordId: quotation.id,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        createdByDept: currentUser.department,
        autoCreated: true,
      });

      // Red-dot/bell ping: assigned pricer + Pricing managers + BD creator.
      void recordNotificationEvent({
        actorUserId: currentUser.id,
        module: 'pricing',
        subSection: 'quotations',
        entityType: 'quotation',
        entityId: quotation.id,
        kind: 'approved',
        summary: {
          label: `Quotation approved by client — ready to convert to project`,
          reference: quotation.quote_number ?? undefined,
          customer_name: quotation.customer_name,
        },
        recipientIds: [assignedPricingId, ...managerIds, bdRepId].filter((id): id is string => !!id),
      });
    }

    // Revision request → notify BD creator
    if (normalizeQuotationStatus(newStatus, quotation) === "Needs Revision" && currentUser) {
      const bdRepId = (quotation as any).created_by as string | undefined;
      void recordNotificationEvent({
        actorUserId: currentUser.id,
        module: 'pricing',
        subSection: 'quotations',
        entityType: 'quotation',
        entityId: quotation.id,
        kind: 'rejected',
        summary: {
          label: `Quotation needs revision`,
          reference: quotation.quote_number ?? undefined,
          customer_name: quotation.customer_name,
          to_status: 'Needs Revision',
        },
        recipientIds: [bdRepId],
      });
    }

    // Disapproved/Rejected/Cancelled → notify BD creator (when actor isn't them)
    {
      const _ns = normalizeQuotationStatus(newStatus, quotation);
      if ((_ns === 'Disapproved' || _ns === 'Rejected by Client' || _ns === 'Cancelled') && currentUser) {
        const bdRepId = (quotation as any).created_by as string | undefined;
        void recordNotificationEvent({
          actorUserId: currentUser.id,
          module: 'pricing',
          subSection: 'quotations',
          entityType: 'quotation',
          entityId: quotation.id,
          kind: 'rejected',
          summary: {
            label: `Quotation ${_ns.toLowerCase()}`,
            reference: quotation.quote_number ?? undefined,
            customer_name: quotation.customer_name,
            to_status: _ns,
          },
          recipientIds: [bdRepId],
        });
      }
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

      // Redirect straight to the created project file — no "Create Bookings"
      // modal. Bookings can be added later from the project's Bookings tab.
      if (onConvertToProject) {
        onConvertToProject(project.id);
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

      const acctManagers = await fetchDeptManagerIds('Accounting');
      const opsManagers = await fetchDeptManagerIds('Operations');
      void recordNotificationEvent({
        actorUserId: currentUser.id,
        module: 'bd',
        subSection: 'contracts',
        entityType: 'contract',
        entityId: quotation.id,
        kind: 'status_changed',
        summary: {
          label: `Contract activated: ${quotation.quote_number ?? ''}`,
          reference: quotation.quote_number ?? undefined,
          customer_name: quotation.customer_name ?? undefined,
          to_status: 'Active',
        },
        recipientIds: [(quotation as any).created_by, ...acctManagers, ...opsManagers],
      });

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
      const legacyDetails = (quotation as any).details && typeof (quotation as any).details === "object"
        ? (quotation as any).details
        : {};
      const defaultOptions: QuotationPrintOptions = {
        signatories: {
          prepared_by: {
            name: currentUser?.name || quotation.prepared_by || (quotation as any).pdf_prepared_by || legacyDetails.pdf_prepared_by || "System User",
            title: quotation.prepared_by_title || (quotation as any).pdf_prepared_by_title || legacyDetails.pdf_prepared_by_title || "Sales Representative",
          },
          approved_by: {
            name: quotation.approved_by || (quotation as any).pdf_approved_by || legacyDetails.pdf_approved_by || "Management",
            title: quotation.approved_by_title || (quotation as any).pdf_approved_by_title || legacyDetails.pdf_approved_by_title || "Authorized Signatory",
          },
        },
        addressed_to: {
          name: quotation.addressed_to_name || (quotation as any).pdf_addressed_to_name || legacyDetails.pdf_addressed_to_name || quotation.contact_person_name || "",
          title: quotation.addressed_to_title || (quotation as any).pdf_addressed_to_title || legacyDetails.pdf_addressed_to_title || "",
        },
        validity_override: quotation.valid_until || (quotation as any).expiry_date || "",
        payment_terms: quotation.payment_terms || (quotation as any).pdf_payment_terms || legacyDetails.pdf_payment_terms || "",
        custom_notes: quotation.custom_notes || (quotation as any).pdf_custom_notes || legacyDetails.pdf_custom_notes || quotation.notes || "",
        display: {
          show_bank_details: (quotation as any).pdf_show_bank_details ?? legacyDetails.pdf_show_bank_details ?? true,
          show_notes: (quotation as any).pdf_show_notes ?? legacyDetails.pdf_show_notes ?? true,
          show_tax_summary: (quotation as any).pdf_show_tax_summary ?? legacyDetails.pdf_show_tax_summary ?? true,
          show_letterhead: (quotation as any).pdf_show_letterhead ?? legacyDetails.pdf_show_letterhead ?? true,
          show_signatories: (quotation as any).pdf_show_signatories ?? legacyDetails.pdf_show_signatories ?? true,
          show_contact_footer: (quotation as any).pdf_show_contact_footer ?? legacyDetails.pdf_show_contact_footer ?? true,
        },
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
    // NEU-019 WG-24: PDF Studio is opened via the export knob, but saving its
    // settings WRITES the quotation — that's edit-class.
    if (!canEditQuotation) {
      toast.error("You don't have permission to save changes to this quotation.");
      return;
    }
    try {
      const updatedDetails = {
        ...((quotation as any).details || {}),
        pdf_show_bank_details: data.display?.show_bank_details ?? true,
        pdf_show_notes: data.display?.show_notes ?? true,
        pdf_show_tax_summary: data.display?.show_tax_summary ?? true,
        pdf_show_letterhead: data.display?.show_letterhead ?? true,
        pdf_show_signatories: data.display?.show_signatories ?? true,
        pdf_show_contact_footer: data.display?.show_contact_footer ?? true,
        ...(data.details?.bank_details_override
          ? { bank_details_override: data.details.bank_details_override }
          : {}),
        ...(data.details?.contact_footer_override
          ? { contact_footer_override: data.details.contact_footer_override }
          : {}),
      };
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
          expiry_date: data.valid_until || null,
          details: updatedDetails,
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
        expiry_date: data.valid_until ?? (quotation as any).expiry_date,
        details: updatedDetails,
        pdf_show_bank_details: updatedDetails.pdf_show_bank_details,
        pdf_show_notes: updatedDetails.pdf_show_notes,
        pdf_show_tax_summary: updatedDetails.pdf_show_tax_summary,
        pdf_show_letterhead: updatedDetails.pdf_show_letterhead,
        pdf_show_signatories: updatedDetails.pdf_show_signatories,
        pdf_show_contact_footer: updatedDetails.pdf_show_contact_footer,
      } as QuotationNew);
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
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        {/* Title floor: keep the title at least this wide so a tight header drops
            the status/assign cluster to its own row instead of squeezing the
            title into a thin column. */}
        <div style={{ flex: 1, minWidth: "min(100%, 460px)" }}>
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

          <h1
            title={quotation.quotation_name || "Untitled Quotation"}
            style={{
              fontSize: "24px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              margin: 0,
              lineHeight: 1.3,
              wordBreak: "break-word",
              // Cap the title at two lines so a long name can't push the header
              // (and the assign cluster beside it) into a tall stack.
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}>
            {quotation.quotation_name || "Untitled Quotation"}
          </h1>
          {quotation.quote_number && (
            <span style={{ display: "block", marginTop: "2px", fontSize: "13px", fontWeight: 400, color: "var(--neuron-ink-muted)", whiteSpace: "nowrap" }}>
              {quotation.quote_number}
            </span>
          )}
        </div>

        {/* Top-right cluster: Status, Locked, Assign to */}
        {/* marginLeft:auto keeps it right-aligned even when it wraps to its own row. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap", marginLeft: "auto" }}>
          <StatusChangeButton
            quotation={quotation}
            onStatusChange={handleStatusChange}
            userDepartment={userDepartment}
            userRole={currentUser?.role}
          />
          {/* NEU-022: the Locked badge IS the unlock control — same button. For a
              manager with the amend grant (project quotes for now; contracts in a
              later phase) it's an interactive lock→unlock toggle; otherwise it's a
              passive status badge. */}
          {isLocked && (
            canAmendRates && quotation.quotation_type !== "contract" ? (
              <UnlockAmendButton onUnlock={onEdit} />
            ) : (
              // P4 (UX): a locked quote the viewer can't unlock shows WHY it's
              // locked and what to do — unlocking stays a manager capability, so
              // the badge points them there instead of looking like a dead end.
              <span
                title={quotation.quotation_type === "contract"
                  ? "This contract is locked because it's active. Contract amendment isn't available yet."
                  : "This quotation is locked because it's been completed. Ask a Pricing manager to unlock it for editing."}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  height: "36px",
                  padding: "0 14px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--theme-status-warning-fg)",
                  whiteSpace: "nowrap",
                  cursor: "help",
                }}>
                <Lock size={14} />
                {quotation.quotation_type === "contract" ? "Locked" : "Locked — manager unlock to edit"}
              </span>
            )
          )}

          {/* Assign to — Pricing Manager only */}
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

          {/* Price-by + Confirm — lives in the HEADER beside "Assign to" so picking
              a staffer only reflows this header cluster. The toolbar below (tabs +
              pricing/export actions) is never touched by the assign flow. */}
          {canAssign && pendingAssigneeId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", whiteSpace: "nowrap" }}>
                Price by:
              </span>
              <CustomDatePicker
                value={pricingDeadline}
                onChange={setPricingDeadline}
                placeholder="Pick a date"
                minWidth="150px"
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
            </div>
          )}
        </div>
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
          {canViewDetailsTab && (
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
          )}
          {canViewCommentsTab && (
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
          )}
          {/* WG-16: attachments finally has a knob — was the only ungated tab */}
          {canViewAttachmentsTab && (
          <button
            role="tab"
            aria-selected={activeTab === "attachments"}
            aria-controls="tab-panel-attachments"
            id="tab-attachments"
            onClick={() => setActiveTab("attachments")}
            style={{
              padding: "0 4px",
              fontSize: "14px",
              fontWeight: 500,
              color: activeTab === "attachments" ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: activeTab === "attachments" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              height: "100%"
            }}
          >
            Attachments
          </button>
          )}
        </div>

        {/* Action Controls - Right Side */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>

          {/* Deadline — visible to anyone who can edit pricing when a deadline is set */}
          {canEditPricing && !pendingAssigneeId && (() => {
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
          {!isLocked && canEditQuotation && !(canEditPricing && normalizedStatus === "Pending Pricing") && (
            <button
              onClick={onEdit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 14px",
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

          {/* Edit Pricing — anyone with pricing edit grant, only at Pending Pricing status */}
          {canEditPricing && normalizedStatus === "Pending Pricing" && (
            <button
              onClick={onEdit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 14px",
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
              {hasPricingEntered ? "Review & Submit Pricing" : "Add Pricing"}
            </button>
          )}

          {/* Create Project — anyone with create grant, Accepted by Client status (Project quotations only) */}
          {canCreateProject && normalizedStatus === "Accepted by Client" && !quotation.project_id && quotation.quotation_type !== "contract" && (
            <button
              onClick={handleAcceptAndCreateProject}
              disabled={isCreatingProject}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 14px",
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

          {/* Activate Contract — anyone with contract edit grant, Accepted by Client status (Contract quotations only) */}
          {canActivateContract && normalizedStatus === "Accepted by Client" && quotation.quotation_type === "contract" && normalizedContractStatus !== "Active" && (
            <button
              onClick={handleActivateContract}
              disabled={isActivatingContract}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 14px",
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
          
          {/* Export PDF — primary; opens the full-screen PDF Studio overlay */}
          {canExportQuotation && (
            <button
              onClick={() => setIsPDFStudioOpen(true)}
              title="Open PDF Studio"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "36px",
                padding: "0 14px",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "1px solid var(--theme-action-primary-bg)",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              <FileDown size={14} />
              Export PDF
            </button>
          )}

          {/* Divider — separates primary action from icon-only utility cluster */}
          {canExportQuotation && <div style={{ width: 1, height: 24, background: "var(--neuron-ui-border)", margin: "0 4px" }} />}

          {/* Icon-only utility cluster: Quick Download + Action Menu */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {canExportQuotation && (
            <button
              onClick={handleQuickDownload}
              disabled={isQuickDownloading}
              title="Download PDF (default settings)"
              aria-label="Download PDF with default settings"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                backgroundColor: "transparent",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                color: isQuickDownloading ? "var(--neuron-ink-muted)" : "var(--neuron-ink-secondary)",
                cursor: isQuickDownloading ? "not-allowed" : "pointer",
                opacity: isQuickDownloading ? 0.6 : 1,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isQuickDownloading) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {isQuickDownloading ? (
                <div style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              ) : (
                <Download size={14} />
              )}
            </button>
            )}

            <QuotationActionMenu
              quotation={quotation}
              onEdit={onEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onCreateTicket={onCreateTicket ? handleCreateTicket : undefined}
              onConfidentialChanged={(next) => onUpdate({ ...quotation, confidential: next })}
              canDuplicate={canCreateQuotation}
              canDelete={canDeleteQuotation}
            />
          </div>
        </div>
      </div>

      {/* Confidential — exec-only, full-width block below the header (self-hides for non-execs) */}
      {/* Main Content Area — Form View is canonical; PDF Studio opens as overlay from header button */}
      <div
        ref={contentPanelRef}
        role="tabpanel"
        id={activeTab === "details" ? "tab-panel-details" : "tab-panel-comments"}
        aria-labelledby={activeTab === "details" ? "tab-details" : "tab-comments"}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {activeTab === "details" && canViewDetailsTab ? (
          <div style={{ padding: "32px 48px", maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
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
              // NEU-022: on a LOCKED quote the top-bar Unlock is the single amend
              // entry; keep the in-body amend only for un-locked edit (pre-conversion).
              onAmend={!isLocked && canEditQuotation ? onEdit : undefined} // WG-25
            />
          </div>
        ) : activeTab === "comments" && canViewCommentsTab ? (
          <div style={{ flex: 1 }}>
            <CommentsTab
              entityId={quotation.id}
              entityType="quotation"
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserDepartment={currentUserDepartment}
              canPost={canPostComments}
            />
          </div>
        ) : activeTab === "attachments" && canViewAttachmentsTab ? (
          <div style={{ flex: 1 }}>
            <EntityAttachmentsTab
              entityId={quotation.id}
              entityType="quotations"
              currentUser={currentUser}
              canUpload={canUploadAttachments}
              canDelete={canDeleteAttachments}
            />
          </div>
        ) : null}
      </div>

      {/* PDF Studio — full-screen overlay launched from the header Print PDF button */}
      <PDFStudioOverlay
        isOpen={isPDFStudioOpen}
        onClose={() => setIsPDFStudioOpen(false)}
        project={adaptedProject}
        quotation={quotation}
        onSave={handlePDFSave}
        currentUser={currentUser}
      />

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <CreateProjectModal
          quotation={quotation}
          onClose={() => setShowCreateProjectModal(false)}
          onSuccess={handleProjectCreationSuccess}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
