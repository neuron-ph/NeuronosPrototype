import { ArrowLeft, Building2, MapPin, Briefcase, Edit, Users, Plus, Mail, Phone, User, CheckCircle, Clock, AlertCircle, Calendar, Paperclip, Upload, MessageSquare, Send, FileText, MessageCircle, Linkedin, StickyNote, Image as ImageIcon, File, Download } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { Customer, Contact, Industry, CustomerStatus, Task, Activity } from "../../types/bd";
import type { QuotationNew, Project, QuotationType } from "../../types/pricing";
import { CustomDropdown } from "./CustomDropdown";
import { TaskDetailInline } from "./TaskDetailInline";
import { ActivityDetailInline } from "./ActivityDetailInline";
import { ActivityTimelineTable } from "./ActivityTimelineTable";
import { AddContactPanel } from "./AddContactPanel";
import { CustomerProjectsTab } from "./CustomerProjectsTab";
import { CustomerInquiriesTab } from "./CustomerInquiriesTab";
import { CustomerAssignmentProfilesSection } from "./CustomerAssignmentProfilesSection";
import { ConsigneeInlineSection } from "./ConsigneeInlineSection";
import { CommentsTab } from "../shared/CommentsTab";
import { EntityAttachmentsTab } from "../shared/EntityAttachmentsTab";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { useUser } from "../../hooks/useUser";
import { logActivity } from "../../utils/activityLog";
import { recordNotificationEvent, fetchDeptManagerIds } from "../../utils/notifications";
import { useMarkEntityReadOnMount } from "../../hooks/useNotifications";
import { usePermission } from "../../context/PermissionProvider";
import { CUSTOMER_MODULE_IDS, type CustomerDept } from "../../config/access/accessSchema";
import { useCustomerProfileOptions } from "../../hooks/useCustomerProfileOptions";

interface CustomerDetailProps {
  customer: Customer;
  onBack: () => void;
  onCreateInquiry?: (customer: Customer, quotationType?: QuotationType) => void;
  onViewInquiry?: (inquiryId: string) => void;
  onViewProject?: (project: Project) => void;
  variant?: CustomerDept;
}

export function CustomerDetail({ customer, onBack, onCreateInquiry, onViewInquiry, onViewProject, variant = "bd" }: CustomerDetailProps) {
  const navigate = useNavigate();
  const { can } = usePermission();
  useMarkEntityReadOnMount("customer", customer.id);
  const ids = CUSTOMER_MODULE_IDS[variant];
  const canViewContactsTab    = can(ids.contacts,    "view");
  const canViewActivitiesTab  = can(ids.activities,  "view");
  const canViewTasksTab       = can(ids.tasks,       "view");
  const canViewInquiriesTab   = can(ids.inquiries,   "view");
  const canViewProjectsTab    = can(ids.projects,    "view");
  const canViewContractsTab   = can(ids.contracts,   "view");
  const canViewCommentsTab    = can(ids.comments,    "view");
  const canViewAttachmentsTab = can(ids.attachments, "view");
  const canViewTeamsTab       = can(ids.teams,       "view");
  const canEditTeamsTab       = can(ids.teams,       "edit");
  const [activeTab, setActiveTab] = useState<"contacts" | "activities" | "tasks" | "inquiries" | "comments" | "attachments" | "projects" | "contracts" | "teams">(() => {
    if (variant === "pricing") {
      if (canViewInquiriesTab) return "inquiries";
      if (canViewProjectsTab)  return "projects";
      if (canViewContractsTab) return "contracts";
      if (canViewTeamsTab)     return "teams";
      if (canViewCommentsTab)  return "comments";
      return "attachments";
    }
    if (canViewContactsTab)   return "contacts";
    if (canViewActivitiesTab) return "activities";
    if (canViewTasksTab)      return "tasks";
    if (canViewInquiriesTab)  return "inquiries";
    if (canViewProjectsTab)   return "projects";
    if (canViewContractsTab)  return "contracts";
    if (canViewTeamsTab)      return "teams";
    if (canViewCommentsTab)   return "comments";
    return "attachments";
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [localCustomer, setLocalCustomer] = useState(customer);
  const [editedCustomer, setEditedCustomer] = useState(customer);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    type: "Call",
    customer_id: customer.id
  });
  const [activityAttachments, setActivityAttachments] = useState<File[]>([]);

  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    type: "Call",
    priority: "Medium",
    status: "Pending",
    customer_id: customer.id
  });
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [isAddContactPanelOpen, setIsAddContactPanelOpen] = useState(false);
  const { user, effectiveRole, effectiveDepartment } = useUser();
  const canAssignOwner = effectiveDepartment === "Executive" || effectiveRole === "manager" || effectiveRole === "executive";
  const queryClient = useQueryClient();
  const { industryOptions, leadSourceOptions } = useCustomerProfileOptions({
    currentIndustry: editedCustomer.industry,
    currentLeadSource: editedCustomer.lead_source,
  });

  // Fetch quotations for this customer
  const { data: quotations = [], isLoading: isLoadingQuotations } = useQuery({
    queryKey: [...queryKeys.quotations.list(), { customer_id: customer.id }],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as QuotationNew[];
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Fetch contacts for this customer.
  // NOTE: this previously shared `queryKeys.customers.consignees(...)` with the
  // useConsignees hook, causing the two queries (contacts table vs consignees
  // table) to clobber each other's cache — which made the CONSIGNEES section
  // render contact rows and made adding a consignee "delete" the others.
  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery({
    queryKey: queryKeys.customers.contacts(customer.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').eq('customer_id', customer.id);
      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Fetch activities for this customer
  const { data: activities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ["crm_activities", "customer", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_activities').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false });
      if (error) { console.error("Error fetching activities:", error); return []; }
      return (data || []) as Activity[];
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Fetch tasks for this customer
  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["tasks", "customer", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false });
      if (error) { console.error("Error fetching tasks:", error); return []; }
      return (data || []) as Task[];
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Create new task
  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.due_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const taskToCreate = {
        ...newTask,
        customer_id: customer.id,
        owner_id: customer.owner_id || user?.id,
        status: 'Pending'
      };

      const { error } = await supabase.from('tasks').insert({
        ...taskToCreate,
        id: `task-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tasks", "customer", customer.id] });
      toast.success('Task created successfully');
      setIsCreatingTask(false);
      setNewTask({ type: "Call", priority: "Medium", status: "Pending", customer_id: customer.id });
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Unable to create task. Please try again.');
    }
  };

  // Fetch projects for this customer
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: [...queryKeys.projects.list(), { customer_id: customer.id }],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*');
      if (error) throw error;
      return ((data || []) as Project[]).filter((p) =>
        p.customer_id === customer.id ||
        p.customer_name === (customer.name || customer.company_name)
      );
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Fetch users for lookups
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch customer contracts
  const { data: customerContracts = [], isLoading: isLoadingContracts } = useQuery({
    queryKey: [...queryKeys.quotations.list(), { customer_id: customer.id, quotation_type: "contract" }],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('quotation_type', 'contract').eq('customer_id', customer.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!customer.id,
    staleTime: 30_000,
  });

  // Get all contacts for this customer (now from backend state)
  const getCustomerContacts = () => {
    return contacts;
  };

  // Get all activities for this customer
  const getCustomerActivities = () => {
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Get all tasks for this customer
  const getCustomerTasks = () => {
    return tasks.sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  };

  // Get all inquiries for this customer
  const getCustomerInquiries = () => {
    return quotations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const getOwnerName = (ownerId: string) => {
    const owner = users.find(u => u.id === ownerId);
    return owner?.name || "—";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: CustomerStatus) => {
    switch (status) {
      case "Active": return "var(--theme-action-primary-bg)";
      case "Prospect": return "#C88A2B";
      case "Inactive": return "#6B7A76";
      default: return "#6B7A76";
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case "Completed": return "var(--theme-action-primary-bg)";
      case "Ongoing": return "#C88A2B";
      case "Pending": return "#6B7A76";
      case "Cancelled": return "#C94F3D";
      default: return "#6B7A76";
    }
  };

  const getTaskPriorityColor = (priority: string) => {
    switch (priority) {
      case "High": return "#C94F3D";
      case "Medium": return "#C88A2B";
      case "Low": return "#6B7A76";
      default: return "#6B7A76";
    }
  };

  const handleSave = async () => {
    setIsSavingCustomer(true);
    try {
      const updatePayload = {
        name: editedCustomer.name || editedCustomer.company_name,
        client_type: editedCustomer.client_type,
        industry: editedCustomer.industry,
        registered_address: editedCustomer.registered_address,
        status: editedCustomer.status,
        lead_source: editedCustomer.lead_source,
        owner_id: editedCustomer.owner_id || null,
        notes: editedCustomer.notes,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('customers').update(updatePayload).eq('id', customer.id);
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logActivity("customer", customer.id, customer.name ?? customer.id, "updated", _actor);

      // Red-dot ping: notify owner + BD managers when assignment changed; otherwise just managers
      const ownerChanged = (localCustomer as any).owner_id !== editedCustomer.owner_id;
      const bdManagers = await fetchDeptManagerIds('Business Development');
      void recordNotificationEvent({
        actorUserId: user?.id ?? null,
        module: 'bd',
        subSection: 'customers',
        entityType: 'customer',
        entityId: customer.id,
        kind: ownerChanged ? 'assigned' : 'updated',
        summary: { label: `Customer ${customer.name ?? customer.id} updated`, customer_name: customer.name ?? undefined },
        recipientIds: [editedCustomer.owner_id, ...bdManagers],
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      setLocalCustomer({ ...localCustomer, ...editedCustomer });
      toast.success("Customer saved successfully");
      setIsEditing(false);
    } catch (err: any) {
      console.error("Error saving customer:", err);
      toast.error(`Failed to save customer: ${err.message}`);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleCancel = () => {
    setEditedCustomer(localCustomer);
    setIsEditing(false);
  };

  // Generate company logo (initials from company name)
  const getCompanyInitials = (companyName: string) => {
    if (!companyName) return '??';
    const words = companyName.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return companyName.substring(0, 2).toUpperCase();
  };

  // Generate a consistent color for company logo
  const getCompanyLogoColor = (companyName: string) => {
    if (!companyName) return '#0F766E';
    const colors = [
      '#0F766E', '#2B8A6E', '#237F66', '#1E6D59',
      '#C88A2B', '#6B7A76', '#C94F3D'
    ];
    const index = companyName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const customerContacts = getCustomerContacts();
  const inquiries = getCustomerInquiries();
  const logoColor = getCompanyLogoColor(localCustomer.name || localCustomer.company_name || '');

  return (
    <div 
      className="h-full flex flex-col overflow-auto"
      style={{
        background: "var(--theme-bg-surface)",
      }}
    >
      {/* Back Button - Top Left */}
      <div style={{ padding: "32px 48px 24px 48px" }}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] transition-colors"
          style={{ color: "var(--theme-action-primary-bg)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--theme-action-primary-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--theme-action-primary-bg)";
          }}
        >
          <ArrowLeft size={16} />
          Back to Customers
        </button>
      </div>

      {/* Two Column Layout */}
      <div className="flex-1 overflow-auto" style={{ padding: "0 48px 48px 48px" }}>
        <div className="grid grid-cols-[35%_1fr] gap-8 min-h-full">
          {/* Left Column - Customer Profile Card */}
          <div>
            <div 
              className="rounded-lg p-6"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)"
              }}
            >
              {/* Profile Header */}
              <div className="mb-6 pb-6" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    {/* Company Logo */}
                    <div 
                      className="rounded-lg flex-shrink-0 flex items-center justify-center text-[20px] font-semibold"
                      style={{
                        width: "64px",
                        height: "64px",
                        backgroundColor: `${logoColor}15`,
                        color: logoColor,
                        border: `2px solid ${logoColor}30`
                      }}
                    >
                      {getCompanyInitials(localCustomer.name || localCustomer.company_name || '')}
                    </div>

                    {/* Company Name & Status */}
                    <div className="flex-1 min-w-0">
                      <h2 
                        className="text-[20px] font-semibold mb-2 break-words"
                        style={{ color: "var(--neuron-ink-primary)" }}
                      >
                        {localCustomer.name || localCustomer.company_name}
                      </h2>
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white"
                        style={{ backgroundColor: getStatusColor(localCustomer.status) }}
                      >
                        {localCustomer.status}
                      </span>
                    </div>
                  </div>
                  
                  {variant === "bd" && (
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="p-2 rounded-lg transition-colors flex-shrink-0"
                      style={{ 
                        color: "var(--neuron-ink-muted)",
                        backgroundColor: "transparent"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Edit size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Customer Details */}
              {!isEditing ? (
                <div className="space-y-5">
                  {/* Client Type */}
                  {variant === "bd" && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Client Type
                        </label>
                      </div>
                      <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                        {localCustomer.client_type || "Local"}
                      </p>
                    </div>
                  )}

                  {/* Industry */}
                  {variant === "bd" && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Industry
                        </label>
                      </div>
                      <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                        {localCustomer.industry}
                      </p>
                    </div>
                  )}

                  {/* Registered Address */}
                  {variant === "bd" && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Registered Address
                        </label>
                      </div>
                      <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                        {localCustomer.registered_address}
                      </p>
                    </div>
                  )}

                  {/* Lead Source */}
                  {variant === "bd" && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Lead Source
                        </label>
                      </div>
                      <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                        {localCustomer.lead_source}
                      </p>
                    </div>
                  )}

                  {/* Owner */}
                  {variant === "bd" && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Account Owner
                        </label>
                      </div>
                      <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                        {getOwnerName(localCustomer.owner_id || "")}
                      </p>
                    </div>
                  )}

                  {/* Contact Count */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                      <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                        Total Contacts
                      </label>
                    </div>
                    <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                      {customerContacts.length} {customerContacts.length === 1 ? 'contact' : 'contacts'}
                    </p>
                  </div>

                  {/* Created Date */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                      <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                        Created
                      </label>
                    </div>
                    <p className="text-[13px] pl-6" style={{ color: "var(--neuron-ink-primary)" }}>
                      {formatDate(customer.created_at)}
                    </p>
                  </div>

                  {/* Notes */}
                  {localCustomer.notes && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--neuron-ink-muted)" }}>
                          Notes
                        </label>
                      </div>
                      <p className="text-[13px] pl-6 whitespace-pre-wrap" style={{ color: "var(--neuron-ink-primary)" }}>
                        {localCustomer.notes}
                      </p>
                    </div>
                  )}

                  {/* Consignees — inline section */}
                  {variant === "bd" && (
                    <ConsigneeInlineSection customerId={customer.id} isEditing={false} />
                  )}
                </div>
              ) : (
                // Edit Mode
                <div className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={editedCustomer.name || editedCustomer.company_name || ""}
                      onChange={(e) => setEditedCustomer({ ...editedCustomer, name: e.target.value, company_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-2"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)"
                      }}
                    />
                  </div>

                  {/* Client Type */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Client Type
                    </label>
                    <CustomDropdown
                      value={editedCustomer.client_type || "Local"}
                      options={[
                        { value: "Local", label: "Local" },
                        { value: "International", label: "International" }
                      ]}
                      onChange={(val) => setEditedCustomer({ ...editedCustomer, client_type: val as "Local" | "International" })}
                      fullWidth
                    />
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Industry
                    </label>
                    <CustomDropdown
                      value={editedCustomer.industry || ""}
                      options={industryOptions}
                      onChange={(val) => setEditedCustomer({ ...editedCustomer, industry: val as Industry })}
                      fullWidth
                    />
                  </div>

                  {/* Registered Address */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Registered Address
                    </label>
                    <textarea
                      value={editedCustomer.registered_address || ""}
                      onChange={(e) => setEditedCustomer({ ...editedCustomer, registered_address: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-2 resize-none"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)"
                      }}
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Status
                    </label>
                    <CustomDropdown
                      value={editedCustomer.status || "Prospect"}
                      options={[
                        { value: "Prospect", label: "Prospect" },
                        { value: "Active", label: "Active" },
                        { value: "Inactive", label: "Inactive" }
                      ]}
                      onChange={(val) => setEditedCustomer({ ...editedCustomer, status: val as CustomerStatus })}
                      fullWidth
                    />
                  </div>

                  {/* Lead Source */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Lead Source
                    </label>
                    <CustomDropdown
                      value={editedCustomer.lead_source || ""}
                      options={[
                        { value: "", label: "No lead source" },
                        ...leadSourceOptions,
                      ]}
                      onChange={(val) => setEditedCustomer({ ...editedCustomer, lead_source: val })}
                      fullWidth
                    />
                  </div>

                  {/* Account Owner */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Account Owner
                    </label>
                    {canAssignOwner ? (
                      <CustomDropdown
                        value={editedCustomer.owner_id || ""}
                        options={[
                          { value: "", label: "Unassigned" },
                          ...users.filter(u => u.department === "Business Development" || u.department === "Pricing").map(u => ({ value: u.id, label: u.name }))
                        ]}
                        onChange={(val) => setEditedCustomer({ ...editedCustomer, owner_id: val || null })}
                        fullWidth
                      />
                    ) : (
                      <p className="text-[13px] pl-0" style={{ color: "var(--neuron-ink-primary)" }}>
                        {getOwnerName(editedCustomer.owner_id || "") || "Unassigned"}
                      </p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
                      Notes
                    </label>
                    <textarea
                      value={editedCustomer.notes || ''}
                      onChange={(e) => setEditedCustomer({ ...editedCustomer, notes: e.target.value })}
                      rows={12}
                      placeholder="Additional information about the customer..."
                      className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-2 resize-none"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)"
                      }}
                    />
                  </div>

                  {/* Consignees — inline section (edit mode) */}
                  {variant === "bd" && (
                    <ConsigneeInlineSection customerId={customer.id} isEditing={true} />
                  )}

                  {/* Save/Cancel Buttons */}
                  <div className="flex gap-2 pt-4">
                    <button
                      onClick={handleSave}
                      disabled={isSavingCustomer}
                      className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors disabled:opacity-60"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                      }}
                    >
                      {isSavingCustomer ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={isSavingCustomer}
                      className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--neuron-ink-secondary)",
                        backgroundColor: "var(--theme-bg-surface)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Tabs for Contacts, Activities, Tasks */}
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex items-center gap-6 mb-6" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}>
              {variant === "bd" && canViewContactsTab && (
                <button
                  onClick={() => setActiveTab("contacts")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "contacts" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Contacts
                  {activeTab === "contacts" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {variant === "bd" && canViewActivitiesTab && (
                  <button
                    onClick={() => setActiveTab("activities")}
                    className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                    style={{
                      color: activeTab === "activities" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                    }}
                  >
                    Activities
                    {activeTab === "activities" && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                      />
                    )}
                  </button>
              )}
              {variant === "bd" && canViewTasksTab && (
                  <button
                    onClick={() => setActiveTab("tasks")}
                    className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                    style={{
                      color: activeTab === "tasks" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                    }}
                  >
                    Tasks
                    {activeTab === "tasks" && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                      />
                    )}
                  </button>
              )}
              {canViewInquiriesTab && (
                <button
                  onClick={() => setActiveTab("inquiries")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "inquiries" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Inquiries
                  {activeTab === "inquiries" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {canViewProjectsTab && (
                <button
                  onClick={() => setActiveTab("projects")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "projects" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Projects
                  {activeTab === "projects" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {/* ✨ PHASE 5: Contracts tab */}
              {canViewContractsTab && (
                <button
                  onClick={() => setActiveTab("contracts")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "contracts" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Contracts
                  {activeTab === "contracts" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {canViewTeamsTab && (
                <button
                  onClick={() => setActiveTab("teams")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "teams" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Teams
                  {activeTab === "teams" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {canViewCommentsTab && (
                <button
                  onClick={() => setActiveTab("comments")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "comments" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Comments
                  {activeTab === "comments" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
              {canViewAttachmentsTab && (
                <button
                  onClick={() => setActiveTab("attachments")}
                  className="px-1 pb-3 text-[13px] font-medium transition-colors relative"
                  style={{
                    color: activeTab === "attachments" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                  }}
                >
                  Attachments
                  {activeTab === "attachments" && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                    />
                  )}
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
              {/* Contacts Tab */}
              {activeTab === "contacts" && variant === "bd" && canViewContactsTab && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                      Contact List
                    </h3>
                    <button
                      onClick={() => setIsAddContactPanelOpen(true)}
                      className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                      style={{
                        backgroundColor: "var(--theme-action-primary-bg)",
                        color: "#FFFFFF"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                      }}
                    >
                      Add Contact
                    </button>
                  </div>

                  {isLoadingContacts ? (
                    <div className="text-center py-12">
                      <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>Loading contacts...</p>
                    </div>
                  ) : customerContacts.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No contacts yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerContacts.map(contact => {
                        // Backend Contact format: name, email, phone, company, status
                        // Display name as-is (already combined first + last name)
                        const displayName = contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                        const displayEmail = contact.email;
                        const displayPhone = contact.phone || contact.mobile_number;
                        const displayStatus = (contact as any).status || contact.lifecycle_stage;
                        
                        return (
                        <div
                          key={contact.id}
                          className="p-4 rounded-lg cursor-pointer transition-all"
                          style={{
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--theme-bg-surface)"
                          }}
                          onClick={() => {
                            if (variant === "bd") {
                              navigate(`/bd/contacts/${contact.id}`);
                            } else {
                              navigate(`/pricing/contacts/${contact.id}`);
                            }
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                            e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                          }}
                        >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: Avatar and Contact Info */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Avatar */}
                            <div 
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: "var(--theme-bg-surface-subtle)",
                                border: "1px solid var(--neuron-ui-divider)"
                              }}
                            >
                              <User size={18} style={{ color: "var(--theme-text-muted)" }} />
                            </div>

                            {/* Contact Info */}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-medium mb-1" style={{ color: "var(--neuron-ink-primary)" }}>
                                {displayName}
                              </h4>
                              {(contact.title || contact.job_title) && (
                                <p className="text-[12px] mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
                                  {contact.title || contact.job_title}
                                </p>
                              )}
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                                  <Mail size={12} style={{ color: "var(--neuron-ink-muted)" }} />
                                  <span className="truncate">{displayEmail}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                                  <Phone size={12} style={{ color: "var(--neuron-ink-muted)" }} />
                                  {displayPhone}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Status Badge */}
                          <div className="flex-shrink-0">
                            <span 
                              className="text-[10px] px-2 py-0.5 rounded text-white font-medium"
                              style={{ 
                                backgroundColor: displayStatus === "Customer" ? "var(--theme-action-primary-bg)" :
                                                displayStatus === "Lead" ? "#C88A2B" :
                                                displayStatus === "MQL" ? "#6B7A76" :
                                                displayStatus === "Prospect" ? "#C94F3D" : "#6B7A76"
                              }}
                            >
                              {displayStatus}
                            </span>
                          </div>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Activities Tab */}
              {activeTab === "activities" && canViewActivitiesTab && (
                <div>
                  {isLoggingActivity ? (
                    /* Log Activity Form */
                    <div>
                      <div className="mb-6">
                        <button
                          onClick={() => {
                            setIsLoggingActivity(false);
                            setNewActivity({
                              type: "Call",
                              customer_id: customer.id
                            });
                            setActivityAttachments([]);
                          }}
                          className="flex items-center gap-2 text-[13px] transition-colors mb-4"
                          style={{ color: "var(--theme-action-primary-bg)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--theme-action-primary-border)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                          }}
                        >
                          <ArrowLeft size={16} />
                          Back to Activities
                        </button>

                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "24px" }}>
                          Log Activity
                        </h3>

                        <div 
                          className="p-6 rounded-xl"
                          style={{ 
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--neuron-pill-inactive-bg)"
                          }}
                        >
                          <div className="space-y-6">
                            {/* Activity Name */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Activity Name *
                              </label>
                              <input
                                type="text"
                                value={newActivity.title || ""}
                                onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                                placeholder="Enter activity name..."
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>

                            {/* Activity Description */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Activity Description *
                              </label>
                              <textarea
                                value={newActivity.description || ""}
                                onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                                placeholder="What did you do? (e.g., Called client to discuss Q1 forecast)"
                                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none"
                                rows={4}
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>

                            {/* Type */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Type *
                              </label>
                              <CustomDropdown
                                options={[
                                  { value: "Call", label: "Call", icon: <Phone size={16} /> },
                                  { value: "Email", label: "Email", icon: <Mail size={16} /> },
                                  { value: "Meeting", label: "Meeting", icon: <Users size={16} /> },
                                  { value: "SMS", label: "SMS", icon: <Send size={16} /> },
                                  { value: "Viber", label: "Viber", icon: <MessageCircle size={16} /> },
                                  { value: "WhatsApp", label: "WhatsApp", icon: <MessageSquare size={16} /> },
                                  { value: "WeChat", label: "WeChat", icon: <MessageSquare size={16} /> },
                                  { value: "LinkedIn", label: "LinkedIn", icon: <Linkedin size={16} /> },
                                  { value: "Note", label: "Note", icon: <StickyNote size={16} /> },
                                  { value: "Marketing Email", label: "Marketing Email", icon: <MessageSquare size={16} /> }
                                ]}
                                value={newActivity.type || "Call"}
                                onChange={(value) => setNewActivity({ ...newActivity, type: value as any })}
                              />
                            </div>

                            {/* Date/Time */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Activity Date & Time *
                              </label>
                              <input
                                type="datetime-local"
                                value={newActivity.date ? new Date(newActivity.date).toISOString().slice(0, 16) : ""}
                                onChange={(e) => setNewActivity({ ...newActivity, date: new Date(e.target.value).toISOString() })}
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>

                            {/* Contact Selection */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Related Contact (Optional)
                              </label>
                              <select
                                value={newActivity.contact_id || ""}
                                onChange={(e) => setNewActivity({ ...newActivity, contact_id: e.target.value })}
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              >
                                <option value="">Select a contact...</option>
                                {customerContacts.map(contact => (
                                  <option key={contact.id} value={contact.id}>
                                    {contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Attachments */}
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Attachments (Optional)
                              </label>
                              <div 
                                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
                                style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                }}
                              >
                                <Upload size={24} className="mx-auto mb-2" style={{ color: "var(--theme-text-muted)" }} />
                                <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                                  Click to upload or drag and drop files
                                </p>
                              </div>
                            </div>

                            {/* Submit Buttons */}
                            <div className="flex gap-3 pt-4">
                              <button
                                className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors"
                                style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                                }}
                              >
                                Log Activity
                              </button>
                              <button
                                onClick={() => {
                                  setIsLoggingActivity(false);
                                  setNewActivity({
                                    type: "Call",
                                    customer_id: customer.id
                                  });
                                }}
                                className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  color: "var(--neuron-ink-secondary)",
                                  backgroundColor: "var(--theme-bg-surface)"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : !selectedActivity ? (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                          Activity Timeline
                        </h3>
                        <button
                          onClick={() => {
                            setIsLoggingActivity(true);
                            setSelectedActivity(null);
                          }}
                          className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                          style={{
                            backgroundColor: "var(--theme-action-primary-bg)",
                            color: "#FFFFFF"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                          }}
                        >
                          Log Activity
                        </button>
                      </div>

                      {activities.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No activities yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {activities.map(activity => {
                            const activityContact = contacts.find(c => c.id === activity.contact_id);
                            
                            return (
                              <div
                                key={activity.id}
                                onClick={() => {
                                  // Always show activity detail view when clicking an activity
                                  setSelectedActivity(activity);
                                }}
                                className="p-4 rounded-lg cursor-pointer transition-all"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                }}
                              >
                              <div className="flex items-start gap-3">
                                <div 
                                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: "var(--theme-bg-surface-tint)" }}
                                >
                                  <CheckCircle size={14} style={{ color: "var(--theme-action-primary-bg)" }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <h4 className="text-[13px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
                                      {activity.type}
                                    </h4>
                                    <span className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                                      {formatDateTime(activity.date)}
                                    </span>
                                  </div>
                                  {activityContact && (
                                    <p className="text-[12px] mb-1" style={{ color: "var(--neuron-ink-muted)" }}>
                                      with {activityContact.first_name} {activityContact.last_name}
                                    </p>
                                  )}
                                  <p className="text-[13px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                                    {activity.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  // Activity Detail View
                  <ActivityDetailInline
                    activity={selectedActivity}
                    onBack={() => setSelectedActivity(null)}
                    onUpdate={async () => {
                      // Refresh activities list
                      queryClient.invalidateQueries({ queryKey: ["crm_activities", "customer", customer.id] });
                      setSelectedActivity(null);
                    }}
                    onDelete={async () => {
                      // Refresh activities list and go back
                      queryClient.invalidateQueries({ queryKey: ["crm_activities", "customer", customer.id] });
                      setSelectedActivity(null);
                    }}
                    contactInfo={selectedActivity.contact_id ? contacts.find(c => c.id === selectedActivity.contact_id) : null}
                    customerInfo={customer}
                    userName={selectedActivity.user_id ? users.find(u => u.id === selectedActivity.user_id)?.name : undefined}
                  />
                )}
              </div>
            )}

            {/* Tasks Tab */}
            {activeTab === "tasks" && canViewTasksTab && (
                <div className="h-full">
                  {!selectedTask && !isCreatingTask ? (
                    /* Task List */
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                          Tasks
                        </h3>
                        <button
                          onClick={() => {
                            setIsCreatingTask(true);
                            setSelectedTask(null);
                          }}
                          className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                          style={{
                            backgroundColor: "var(--theme-action-primary-bg)",
                            color: "#FFFFFF"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                          }}
                        >
                          Create Task
                        </button>
                      </div>

                      {tasks.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No tasks yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {tasks.map(task => {
                            const taskContact = contacts.find(c => c.id === task.contact_id);
                            
                            return (
                              <div
                                key={task.id}
                                onClick={() => {
                                  setSelectedTask(task);
                                  setEditedTask(task);
                                  setIsEditingTask(false);
                                }}
                                className="p-4 rounded-lg cursor-pointer transition-all"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <div 
                                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ 
                                      backgroundColor: task.status === "Completed" ? "var(--theme-bg-surface-tint)" :
                                                     task.status === "Cancelled" ? "var(--theme-status-danger-bg)" : "var(--theme-status-warning-bg)"
                                    }}
                                  >
                                    {task.status === "Completed" ? (
                                      <CheckCircle size={14} style={{ color: "var(--theme-action-primary-bg)" }} />
                                    ) : task.status === "Cancelled" ? (
                                      <AlertCircle size={14} style={{ color: "var(--theme-status-danger-fg)" }} />
                                    ) : (
                                      <Clock size={14} style={{ color: "#C88A2B" }} />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <h4 className="text-[13px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
                                        {task.title}
                                      </h4>
                                      <span 
                                        className="text-[10px] px-2 py-0.5 rounded font-medium"
                                        style={{ 
                                          backgroundColor: getTaskPriorityColor(task.priority) + "20",
                                          color: getTaskPriorityColor(task.priority)
                                        }}
                                      >
                                        {task.priority}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                                        Due: {formatDate(task.due_date)}
                                      </span>
                                      {taskContact && (
                                        <span className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                                          • with {taskContact.first_name} {taskContact.last_name}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : isCreatingTask ? (
                    // Create Task Form
                    <div>
                      <div className="mb-6">
                        <button
                          onClick={() => setIsCreatingTask(false)}
                          className="flex items-center gap-2 text-[13px] transition-colors mb-4"
                          style={{ color: "var(--theme-action-primary-bg)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--theme-action-primary-border)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                          }}
                        >
                          <ArrowLeft size={16} />
                          Back to Tasks
                        </button>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                          Create New Task
                        </h3>
                      </div>
                      
                      <div 
                        className="p-6 rounded-xl"
                        style={{ 
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--neuron-pill-inactive-bg)"
                        }}
                      >
                        <div className="space-y-6">
                          {/* Task Title */}
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                              Task Title *
                            </label>
                            <input
                              type="text"
                              value={newTask.title || ""}
                              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                              placeholder="Enter task title..."
                              className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                              style={{
                                border: "1px solid var(--neuron-ui-border)",
                                backgroundColor: "var(--theme-bg-surface)",
                                color: "var(--theme-text-primary)"
                              }}
                            />
                          </div>

                          {/* Due Date & Priority */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Due Date *
                              </label>
                              <input
                                type="datetime-local"
                                value={newTask.due_date ? new Date(newTask.due_date).toISOString().slice(0, 16) : ""}
                                onChange={(e) => setNewTask({ ...newTask, due_date: new Date(e.target.value).toISOString() })}
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                                Priority *
                              </label>
                              <select
                                value={newTask.priority || "Medium"}
                                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            </div>
                          </div>

                          {/* Related Contact */}
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                              Related Contact (Optional)
                            </label>
                            <select
                              value={newTask.contact_id || ""}
                              onChange={(e) => setNewTask({ ...newTask, contact_id: e.target.value })}
                              className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                              style={{
                                border: "1px solid var(--neuron-ui-border)",
                                backgroundColor: "var(--theme-bg-surface)",
                                color: "var(--theme-text-primary)"
                              }}
                            >
                              <option value="">Select a contact...</option>
                              {customerContacts.map(contact => (
                                <option key={contact.id} value={contact.id}>
                                  {contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                              Description
                            </label>
                            <textarea
                              value={newTask.description || ""}
                              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                              placeholder="Add details about this task..."
                              className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none"
                              rows={4}
                              style={{
                                border: "1px solid var(--neuron-ui-border)",
                                backgroundColor: "var(--theme-bg-surface)",
                                color: "var(--theme-text-primary)"
                              }}
                            />
                          </div>

                          {/* Submit Buttons */}
                          <div className="flex gap-3 pt-4">
                            <button
                              onClick={handleCreateTask}
                              className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors"
                              style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                              }}
                            >
                              Create Task
                            </button>
                            <button
                              onClick={() => setIsCreatingTask(false)}
                              className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                              style={{
                                border: "1px solid var(--neuron-ui-border)",
                                color: "var(--neuron-ink-secondary)",
                                backgroundColor: "var(--theme-bg-surface)"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : selectedTask ? (
                    // Task Detail View
                    <TaskDetailInline
                      task={selectedTask}
                      onBack={() => {
                        setSelectedTask(null);
                        setEditedTask(null);
                        setIsEditingTask(false);
                      }}
                      customers={customer ? [customer] : []}
                      contacts={contacts}
                    />
                  ) : null}
                </div>
            )}

            {/* Inquiries Tab */}
            {activeTab === "inquiries" && canViewInquiriesTab && (
              <div style={{ paddingBottom: "32px" }}>
                <CustomerInquiriesTab 
                  inquiries={inquiries}
                  onViewInquiry={onViewInquiry}
                  onCreateInquiry={(quotationType) => onCreateInquiry && onCreateInquiry(customer, quotationType)}
                  isLoading={isLoadingQuotations}
                />
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === "projects" && canViewProjectsTab && (
              <div style={{ paddingBottom: "32px" }}>
                <CustomerProjectsTab 
                  projects={projects}
                  onViewProject={(project) => onViewProject && onViewProject(project)}
                  isLoading={isLoadingProjects}
                />
              </div>
            )}

            {/* ✨ PHASE 5: Contracts Tab */}
            {activeTab === "contracts" && canViewContractsTab && (
              <div style={{ paddingBottom: "32px" }}>
                {isLoadingContracts ? (
                  <div style={{ padding: "48px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
                    Loading contracts...
                  </div>
                ) : customerContracts.length === 0 ? (
                  <div style={{
                    padding: "48px 24px",
                    textAlign: "center",
                    color: "var(--theme-text-muted)",
                  }}>
                    <FileText size={40} style={{ marginBottom: "12px", opacity: 0.3, margin: "0 auto 12px" }} />
                    <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 4px" }}>No contracts found</p>
                    <p style={{ fontSize: "13px", margin: 0 }}>
                      Contract quotations for this customer will appear here.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {customerContracts.map((contract: any) => {
                      const statusColors: Record<string, { text: string; bg: string }> = {
                        Draft: { text: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" },
                        Sent: { text: "var(--neuron-semantic-info)", bg: "var(--neuron-semantic-info-bg)" },
                        Active: { text: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
                        Expiring: { text: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" },
                        Expired: { text: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" },
                        Renewed: { text: "var(--neuron-status-accent-fg)", bg: "var(--neuron-status-accent-bg)" },
                      };
                      const sc = statusColors[contract.contract_status] || statusColors.Draft;
                      const validStart = contract.contract_validity_start
                        ? new Date(contract.contract_validity_start).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
                        : "—";
                      const validEnd = contract.contract_validity_end
                        ? new Date(contract.contract_validity_end).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
                        : "—";
                      return (
                        <div
                          key={contract.id}
                          style={{
                            padding: "16px 20px",
                            borderRadius: "8px",
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--theme-bg-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "8px",
                              backgroundColor: "var(--theme-bg-surface-tint)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <FileText size={18} style={{ color: "var(--theme-text-primary)" }} />
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                                  {contract.quotation_name || contract.quote_number}
                                </span>
                                <span style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "var(--theme-text-primary)",
                                  backgroundColor: "var(--theme-bg-surface-tint)",
                                  border: "1px solid #12332B",
                                  padding: "2px 6px",
                                  borderRadius: "3px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.3px",
                                }}>
                                  Contract
                                </span>
                                <span style={{
                                  fontSize: "10px",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  backgroundColor: sc.bg,
                                  color: sc.text,
                                }}>
                                  {contract.contract_status}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "var(--theme-text-muted)" }}>
                                <span style={{ fontFamily: "monospace" }}>{contract.quote_number}</span>
                                <span>•</span>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Calendar size={11} />
                                  {validStart} — {validEnd}
                                </span>
                                {contract.rate_matrices_count > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{contract.rate_matrices_count} rate {contract.rate_matrices_count === 1 ? "matrix" : "matrices"}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {(contract.services || []).map((s: string) => (
                              <span key={s} style={{
                                fontSize: "11px",
                                fontWeight: 500,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                backgroundColor: "var(--theme-bg-surface-tint)",
                                color: "var(--theme-action-primary-bg)",
                              }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "teams" && canViewTeamsTab && (
              <div style={{ paddingBottom: "32px" }}>
                <CustomerAssignmentProfilesSection customerId={customer.id} canEdit={canEditTeamsTab} />
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === "comments" && canViewCommentsTab && (
              <div className="h-[600px]">
                <CommentsTab
                  entityId={customer.id}
                  entityType="customer"
                  currentUserId={user?.id || ""}
                  currentUserName={user?.name || "Unknown"}
                  currentUserDepartment={user?.department || effectiveDepartment || "BD"}
                />
              </div>
            )}
            {activeTab === "attachments" && canViewAttachmentsTab && (
              <EntityAttachmentsTab
                entityId={customer.id}
                entityType="customers"
                currentUser={user ? { id: user.id, name: user.name || "", email: user.email || "", department: user.department || "" } : null}
              />
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Contact Panel */}
      <AddContactPanel
        isOpen={isAddContactPanelOpen}
        onClose={() => setIsAddContactPanelOpen(false)}
        prefilledCustomerId={customer.id}
        prefilledCustomerName={customer.company_name || customer.name}
        onSave={async (contactData) => {
          try {
            const firstName = contactData.first_name || '';
            const lastName = contactData.last_name || '';
            const newContactData = {
              ...contactData,
              name: `${firstName} ${lastName}`.trim() || 'Contact',
              customer_id: customer.id,
              created_by: user?.id,
            };

            const { error } = await supabase.from('contacts').insert({
              ...newContactData,
              id: `contact-${Date.now()}`,
              created_at: new Date().toISOString(),
            });
            if (!error) {
              queryClient.invalidateQueries({ queryKey: queryKeys.customers.contacts(customer.id) });
              toast.success('Contact created successfully');
              setIsAddContactPanelOpen(false);
            } else {
              console.error('Failed to create contact:', error.message);
              toast.error(`Unable to create contact: ${error.message}`);
            }
          } catch (error) {
            console.error('❌ Error creating contact:', error);
            toast.error('Unable to create contact. Please try again.');
          }
        }}
      />
    </div>
  );
}
