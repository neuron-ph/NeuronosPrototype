import { ArrowLeft, Mail, Phone, Building2, User, Edit, Trash2, Paperclip, Download, FileText, Image as ImageIcon, File, Upload, CheckCircle2, AlertCircle, MessageSquare, Send, Plus, Users, MessageCircle, Linkedin, StickyNote, Flag, CheckSquare, UserCheck } from "lucide-react";
import { useState, useRef } from "react";
import { usePermission } from "../../context/PermissionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { Contact, LifecycleStage, LeadStatus, Task, Activity, Customer, ActivityType, TaskType } from "../../types/bd";
import type { QuotationNew, QuotationType } from "../../types/pricing";
import { CustomDropdown } from "./CustomDropdown";
import { ActivityTimelineTable } from "./ActivityTimelineTable";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logActivity, logCreation } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { CreateQuotationMenu } from "../pricing/CreateQuotationMenu";

interface ContactDetailProps {
  contact: Contact;
  onBack: () => void;
  onCreateInquiry?: (customer: Customer, contact?: Contact, quotationType?: QuotationType) => void;
  variant?: "bd" | "pricing";
}

// Mock attachment data
interface Attachment {
  id: string;
  name: string;
  type: "pdf" | "image" | "document" | "spreadsheet";
  size: string;
  uploadedAt: string;
  source: "Task" | "Activity" | "Inquiry";
  sourceId: string;
  sourceName: string;
}

const mockAttachments: Attachment[] = [
  {
    id: "att-1",
    name: "Q1_2025_Forecast.pdf",
    type: "pdf",
    size: "2.3 MB",
    uploadedAt: "2024-12-05T10:30:00Z",
    source: "Task",
    sourceId: "task-1",
    sourceName: "Follow up on Q1 2025 forecast"
  },
  {
    id: "att-2",
    name: "Meeting_Notes_Nov_2024.pdf",
    type: "pdf",
    size: "1.8 MB",
    uploadedAt: "2024-11-28T14:20:00Z",
    source: "Activity",
    sourceId: "act-1",
    sourceName: "Meeting Logged"
  },
  {
    id: "att-3",
    name: "Shipment_Schedule.xlsx",
    type: "spreadsheet",
    size: "456 KB",
    uploadedAt: "2024-11-25T09:15:00Z",
    source: "Task",
    sourceId: "task-2",
    sourceName: "Review shipment schedule"
  },
  {
    id: "att-4",
    name: "Product_Catalog_2024.pdf",
    type: "pdf",
    size: "5.2 MB",
    uploadedAt: "2024-11-20T11:00:00Z",
    source: "Inquiry",
    sourceId: "inq-1",
    sourceName: "General Merchandise Inquiry"
  },
  {
    id: "att-5",
    name: "Warehouse_Photo.jpg",
    type: "image",
    size: "3.1 MB",
    uploadedAt: "2024-11-15T16:45:00Z",
    source: "Activity",
    sourceId: "act-2",
    sourceName: "Site Visit Logged"
  }
];

interface Comment {
  id: string;
  user_name: string;
  user_department: "BD" | "Pricing";
  message: string;
  created_at: string;
}

// Mock comments for demo
const mockComments: Comment[] = [
  {
    id: "cm1",
    user_name: "Ana Reyes",
    user_department: "BD",
    message: "Hi Pricing team, this client needs urgent quotation for the Shanghai shipment. They're requesting cold storage throughout.",
    created_at: "2025-12-10T10:15:00"
  },
  {
    id: "cm2",
    user_name: "Juan Dela Cruz",
    user_department: "Pricing",
    message: "Got it! I'll prioritize this. Do we have their preferred vendor for cold chain?",
    created_at: "2025-12-10T10:45:00"
  },
  {
    id: "cm3",
    user_name: "Ana Reyes",
    user_department: "BD",
    message: "They usually work with Manila Cold Chain Solutions. Also mentioned they need delivery by Dec 15.",
    created_at: "2025-12-10T11:20:00"
  }
];

export function ContactDetail({ contact, onBack, onCreateInquiry, variant = "bd" }: ContactDetailProps) {
  const { can } = usePermission();
  const canViewActivitiesTab  = can("bd_contacts_activities_tab", "view");
  const canViewTasksTab       = can("bd_contacts_tasks_tab", "view");
  const canViewInquiriesTab   = can("bd_contacts_inquiries_tab", "view");
  const canViewAttachmentsTab = can("bd_contacts_attachments_tab", "view");
  const canViewCommentsTab    = can("bd_contacts_comments_tab", "view");

  const [activeTab, setActiveTab] = useState<"activities" | "tasks" | "inquiries" | "attachments" | "comments">(() => {
    if (variant === "pricing") {
      if (canViewInquiriesTab) return "inquiries";
      if (canViewAttachmentsTab) return "attachments";
      return "comments";
    }
    if (canViewActivitiesTab)  return "activities";
    if (canViewTasksTab)       return "tasks";
    if (canViewInquiriesTab)   return "inquiries";
    if (canViewAttachmentsTab) return "attachments";
    return "comments";
  });
  const [newComment, setNewComment] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState(contact);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [taskAttachments, setTaskAttachments] = useState<Attachment[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    type: "Call",
    priority: "Medium",
    status: "Pending",
    contact_id: contact.id
  });
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);
  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    type: "Call",
    contact_id: contact.id
  });
  const [activityAttachments, setActivityAttachments] = useState<Attachment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>(mockAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newAttachment: Attachment = {
      id: `att-${Date.now()}`,
      name: file.name,
      type: file.name.endsWith('.pdf') ? 'pdf' : file.name.match(/\.(jpg|jpeg|png|gif)$/i) ? 'image' : file.name.endsWith('.xlsx') ? 'spreadsheet' : 'document',
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      uploadedAt: new Date().toISOString(),
      source: "Activity", // Defaulting to Activity for manual uploads
      sourceId: "manual-upload",
      sourceName: "Manual Upload"
    };

    setAttachments([newAttachment, ...attachments]);
  };
  
  const { user, effectiveRole, effectiveDepartment } = useUser();
  const canAssignOwner = effectiveDepartment === "Executive" || effectiveRole === "manager" || effectiveRole === "executive";

  // Backend uses 'customer_id', frontend alias is 'company_id' — support both
  const effectiveCustomerId = contact.customer_id || contact.company_id;
  const queryClient = useQueryClient();

  // Fetch customer (company) data
  const { data: customer = null } = useQuery({
    queryKey: queryKeys.customers.detail(effectiveCustomerId || ""),
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', effectiveCustomerId).maybeSingle();
      return (data || null) as Customer | null;
    },
    enabled: !!effectiveCustomerId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch activities for this contact
  const { data: activities = [] } = useQuery({
    queryKey: ["crm_activities", "contact", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_activities').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false });
      if (error) { console.error("Failed to fetch activities:", error); return []; }
      return (data || []) as Activity[];
    },
    enabled: !!contact.id && variant === "bd",
    staleTime: 30_000,
  });

  // Fetch tasks for this contact
  const { data: tasks = [], isLoading: isLoadingData } = useQuery({
    queryKey: ["tasks", "contact", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false });
      if (error) { console.error("Error fetching tasks:", error); return []; }
      return (data || []) as Task[];
    },
    enabled: !!contact.id && variant === "bd",
    staleTime: 30_000,
  });

  // Fetch quotations for this contact
  const { data: quotations = [] } = useQuery({
    queryKey: [...queryKeys.quotations.list(), { contact_id: contact.id }],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false });
      if (error) { console.error("Error fetching quotations:", error); return []; }
      return (data || []) as QuotationNew[];
    },
    enabled: !!contact.id,
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

  // Helper function to determine if proof is required for a task type
  const isProofRequired = (taskType: string): boolean => {
    const requiredTypes = ["Email", "Meeting"];
    return requiredTypes.includes(taskType);
  };

  const isProofOptional = (taskType: string): boolean => {
    const optionalTypes = ["Call", "SMS", "Viber", "WeChat", "WhatsApp", "LinkedIn"];
    return optionalTypes.includes(taskType);
  };

  const getCompany = () => {
    return customer;
  };

  const getContactActivities = () => {
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getContactTasks = () => {
    return tasks.sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  };

  const getContactInquiries = () => {
    // Get inquiries for this contact's customer or inquiries with this contact_id
    const custId = contact.customer_id || contact.company_id;
    return quotations.filter(q => 
        (custId && q.customer_id === custId) ||
        q.contact_id === contact.id
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

  const formatCommentDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSendComment = () => {
    if (newComment.trim()) {
      // TODO: Add comment to database
      console.log("New comment:", newComment);
      setNewComment("");
    }
  };

  const getLifecycleStageColor = (stage: LifecycleStage) => {
    switch (stage) {
      case "Lead":
        return "#C88A2B";
      case "MQL":
        return "#6B7A76";
      case "SQL":
        return "#C94F3D";
      case "Customer":
        return "var(--theme-action-primary-bg)";
      default:
        return "var(--theme-action-primary-bg)";
    }
  };

  const getLeadStatusColor = (status: string) => {
    switch (status) {
      case "New":
        return "#C88A2B";
      case "Open":
        return "#6B7A76";
      case "In Progress":
        return "#C94F3D";
      case "Connected":
        return "var(--theme-action-primary-bg)";
      case "Attempted to contact":
        return "#C88A2B";
      case "Unqualified":
        return "var(--theme-text-muted)";
      case "Bad timing":
        return "var(--theme-text-muted)";
      default:
        return "var(--theme-action-primary-bg)";
    }
  };

  const handleSave = async () => {
    try {
      // Map frontend field names to backend field names
      const firstName = editedContact.first_name ?? (contact.name || '').split(' ')[0];
      const lastName = editedContact.last_name ?? (contact.name || '').split(' ').slice(1).join(' ');
      const updatePayload: any = {
        first_name: firstName || null,
        last_name: lastName || null,
        name: `${firstName || ''} ${lastName || ''}`.trim() || contact.name,
        title: editedContact.title ?? editedContact.job_title ?? null,
        email: editedContact.email,
        phone: editedContact.phone ?? editedContact.mobile_number ?? null,
        customer_id: editedContact.customer_id ?? editedContact.company_id ?? null,
        lifecycle_stage: editedContact.lifecycle_stage,
        lead_status: editedContact.lead_status,
        owner_id: editedContact.owner_id || null,
        notes: editedContact.notes,
      };

      const { data: updatedData, error: updateError } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contact.id)
        .select()
        .single();

      if (!updateError && updatedData) {
        const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };

        // Detect which fields changed and summarise old → new
        const fieldLabels: Record<string, string> = {
          name: "Name", title: "Title", email: "Email", phone: "Phone",
          lifecycle_stage: "Stage", lead_status: "Lead Status", owner_id: "Account Owner", notes: "Notes",
        };
        const changedFields = Object.keys(fieldLabels).filter(f => {
          const oldVal = (contact as Record<string, unknown>)[f];
          const newVal = (updatedData as Record<string, unknown>)[f];
          return oldVal !== newVal && (oldVal || newVal);
        });
        const details = changedFields.length === 1
          ? {
              oldValue: String((contact as Record<string, unknown>)[changedFields[0]] ?? ""),
              newValue: String((updatedData as Record<string, unknown>)[changedFields[0]] ?? ""),
              description: `Updated ${fieldLabels[changedFields[0]]}`,
            }
          : changedFields.length > 1
            ? { description: `Updated ${changedFields.map(f => fieldLabels[f]).join(", ")}` }
            : undefined;

        logActivity("contact", contact.id, updatedData.name ?? contact.name ?? contact.id, "updated", _actor, details);
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
        Object.assign(contact, updatedData, {
          job_title: updatedData.title,
          mobile_number: updatedData.phone,
          company_id: updatedData.customer_id,
        });
        setEditedContact({ ...contact });
        toast.success("Contact updated successfully");
        setIsEditing(false);
      } else {
        console.error("Failed to update contact:", updateError?.message);
        toast.error(`Failed to save: ${updateError?.message ?? "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error saving contact:", error);
      toast.error("Unable to save contact. Please try again.");
    }
  };

  const handleCancel = () => {
    setEditedContact(contact);
    setIsEditing(false);
  };

  const handleConvertToCustomer = async () => {
    if (isConverting) return;
    setIsConverting(true);
    try {
      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.name || "Unnamed Contact";
      const customerId = `customer-${Date.now()}`;
      const { error: createError } = await supabase.from("customers").insert({
        id: customerId,
        name: fullName,
        email: contact.email ?? null,
        phone: contact.phone ?? contact.mobile_number ?? null,
        status: "Active",
        client_type: "Local",
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (createError) throw createError;

      const { error: linkError } = await supabase
        .from("contacts")
        .update({ customer_id: customerId, lifecycle_stage: "Customer", updated_at: new Date().toISOString() })
        .eq("id", contact.id);
      if (linkError) throw linkError;

      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
      queryClient.invalidateQueries({ queryKey: ["bd_contacts"] });
      toast.success(`${fullName} is now a Customer Account.`);
    } catch (err: any) {
      toast.error("Failed to convert: " + (err.message ?? "Unknown error"));
    } finally {
      setIsConverting(false);
    }
  };

  const company = getCompany();
  const inquiries = getContactInquiries();

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
          Back to Contacts
        </button>
      </div>

      {/* Two Column Layout */}
      <div className="flex-1 overflow-auto" style={{ padding: "0 48px 48px 48px" }}>
        <div className="grid grid-cols-[35%_1fr] gap-8 h-full">
          {/* Left Column - Contact Profile Card */}
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
                    {/* Profile Picture */}
                    <div 
                      className="rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: "64px",
                        height: "64px",
                        backgroundColor: "var(--theme-bg-surface-subtle)",
                        border: "2px solid var(--neuron-ui-divider)"
                      }}
                    >
                      <User size={32} style={{ color: "var(--theme-text-muted)" }} />
                    </div>

                    {/* Name and Badges */}
                    <div>
                      <h1 style={{ fontSize: "28px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "8px", letterSpacing: "-0.5px" }}>
                        {contact.first_name} {contact.last_name}
                      </h1>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium text-white uppercase tracking-wide"
                          style={{ backgroundColor: getLifecycleStageColor(contact.lifecycle_stage ?? 'Lead') }}
                        >
                          {contact.lifecycle_stage}
                        </span>
                        <span
                          className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium text-white uppercase tracking-wide"
                          style={{ backgroundColor: getLeadStatusColor(contact.lead_status ?? '') }}
                        >
                          {contact.lead_status}
                        </span>
                      </div>
                      {variant === "bd" && (
                        <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
                          {contact.title || contact.job_title}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                {variant === "bd" && (
                  <div className="flex items-center gap-2">
                    {!isEditing ? (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--theme-text-primary)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                        }}
                      >
                        <Edit size={14} />
                        Update Details
                      </button>
                      {!effectiveCustomerId && (
                        <button
                          onClick={handleConvertToCustomer}
                          disabled={isConverting}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
                          style={{
                            border: "1px solid var(--theme-action-primary-bg)",
                            backgroundColor: "var(--theme-bg-surface)",
                            color: "var(--theme-action-primary-bg)",
                            opacity: isConverting ? 0.6 : 1,
                            cursor: isConverting ? "not-allowed" : "pointer"
                          }}
                          onMouseEnter={(e) => {
                            if (!isConverting) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                          }}
                        >
                          <UserCheck size={14} />
                          {isConverting ? "Converting..." : "Convert to Customer"}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
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
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--theme-text-primary)"
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
                    </>
                  )}
                  </div>
                )}
              </div>

              {/* Contact Details Section */}
              {variant === "bd" && (
              <>
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "20px" }}>
                Contact Details
              </h2>

              <div className="space-y-4">
                {/* First Name */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <User size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      First Name
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedContact.first_name ?? (contact.name || '').split(' ')[0]}
                      onChange={(e) => setEditedContact({ ...editedContact, first_name: e.target.value })}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-text-primary)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                      {(contact.name || '').split(' ')[0] || '—'}
                    </div>
                  )}
                </div>

                {/* Last Name */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <User size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Last Name
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedContact.last_name ?? (contact.name || '').split(' ').slice(1).join(' ')}
                      onChange={(e) => setEditedContact({ ...editedContact, last_name: e.target.value })}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-text-primary)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                      {(contact.name || '').split(' ').slice(1).join(' ') || '—'}
                    </div>
                  )}
                </div>

                {/* Job Title */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <User size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Job Title
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedContact.title ?? editedContact.job_title ?? ""}
                      onChange={(e) => setEditedContact({ ...editedContact, title: e.target.value, job_title: e.target.value })}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-text-primary)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                      {contact.title || contact.job_title}
                    </div>
                  )}
                </div>

                {/* Email */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Mail size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Email
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      type="email"
                      value={editedContact.email || ""}
                      onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-action-primary-bg)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <a 
                      href={`mailto:${contact.email}`}
                      className="text-[14px] transition-colors"
                      style={{ color: "var(--theme-action-primary-bg)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--theme-action-primary-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                      }}
                    >
                      {contact.email}
                    </a>
                  )}
                </div>

                {/* Mobile Number */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Phone size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Mobile Number
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editedContact.phone ?? editedContact.mobile_number ?? ""}
                      onChange={(e) => setEditedContact({ ...editedContact, phone: e.target.value, mobile_number: e.target.value })}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-action-primary-bg)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <a 
                      href={`tel:${contact.phone || contact.mobile_number}`}
                      className="text-[14px] transition-colors"
                      style={{ color: "var(--theme-action-primary-bg)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--theme-action-primary-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                      }}
                    >
                      {contact.phone || contact.mobile_number}
                    </a>
                  )}
                </div>
              </div>
              </>
              )}

              <div className="space-y-4">
                {/* Company */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Building2 size={12} style={{ color: "var(--theme-text-muted)" }} />
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Company
                    </span>
                  </div>
                  <div>
                    {company ? (
                      <>
                        <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>{company.name}</div>
                        {company.industry && (
                          <div className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>{company.industry}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[13px] italic" style={{ color: "var(--theme-text-muted)" }}>No company — standalone contact</div>
                    )}
                  </div>
                </div>

                {/* Lifecycle Stage */}
                <div>
                  <div className="mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Lifecycle Stage
                    </span>
                  </div>
                  {isEditing ? (
                    <CustomDropdown
                      value={editedContact.lifecycle_stage ?? ''}
                      onChange={(value) => setEditedContact({ ...editedContact, lifecycle_stage: value as LifecycleStage })}
                      options={[
                        { value: "Lead", label: "Lead" },
                        { value: "MQL", label: "MQL" },
                        { value: "SQL", label: "SQL" },
                        { value: "Customer", label: "Customer" }
                      ]}
                    />
                  ) : (
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium text-white uppercase tracking-wide"
                      style={{ backgroundColor: getLifecycleStageColor(contact.lifecycle_stage ?? 'Lead') }}
                    >
                      {contact.lifecycle_stage}
                    </span>
                  )}
                </div>

                {/* Lead Status */}
                <div>
                  <div className="mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Lead Status
                    </span>
                  </div>
                  {isEditing ? (
                    <CustomDropdown
                      value={editedContact.lead_status ?? ''}
                      onChange={(value) => setEditedContact({ ...editedContact, lead_status: value as LeadStatus })}
                      options={[
                        { value: "New", label: "New" },
                        { value: "Open", label: "Open" },
                        { value: "In Progress", label: "In Progress" },
                        { value: "Unqualified", label: "Unqualified" },
                        { value: "Attempted to contact", label: "Attempted to contact" },
                        { value: "Connected", label: "Connected" },
                        { value: "Bad timing", label: "Bad timing" }
                      ]}
                    />
                  ) : (
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium text-white uppercase tracking-wide"
                      style={{ backgroundColor: getLeadStatusColor(contact.lead_status ?? '') }}
                    >
                      {contact.lead_status}
                    </span>
                  )}
                </div>

                {/* Account Owner */}
                <div>
                  <div className="mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Account Owner
                    </span>
                  </div>
                  {isEditing && canAssignOwner ? (
                    <CustomDropdown
                      value={editedContact.owner_id || ""}
                      options={[
                        { value: "", label: "Unassigned" },
                        ...users.filter(u => u.department === "Business Development" || u.department === "Pricing").map(u => ({ value: u.id, label: u.name }))
                      ]}
                      onChange={(value) => setEditedContact({ ...editedContact, owner_id: value || null })}
                    />
                  ) : (
                    <span className="text-[14px]" style={{ color: contact.owner_id ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}>
                      {contact.owner_id ? (users.find(u => u.id === contact.owner_id)?.name ?? "—") : "Unassigned"}
                    </span>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div className="mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                      Notes
                    </span>
                  </div>
                  {isEditing ? (
                    <textarea
                      value={editedContact.notes || ""}
                      onChange={(e) => setEditedContact({ ...editedContact, notes: e.target.value })}
                      placeholder="Add important details about this contact..."
                      rows={6}
                      className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors resize-none"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        color: "var(--theme-text-primary)",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      }}
                    />
                  ) : (
                    <div 
                      className="text-[14px]"
                      style={{ 
                        color: contact.notes ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                        whiteSpace: "pre-wrap",
                        lineHeight: "1.6"
                      }}
                    >
                      {contact.notes || "No notes added yet"}
                    </div>
                  )}
                </div>
              </div>

              {/* Delete Button at Bottom */}
              {!isEditing && (
                <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                  <button
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
                    style={{
                      border: "1px solid var(--theme-status-danger-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--theme-status-danger-fg)"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                    }}
                  >
                    <Trash2 size={14} />
                    Delete Contact
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Tabs Content */}
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex items-center gap-6 mb-6" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}>
              {variant === "bd" && (
                <>
                  {canViewActivitiesTab && (
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
                  {canViewTasksTab && (
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
                </>
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
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
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
                              contact_id: contact.id
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

                        <div className="flex items-center justify-between mb-6">
                          <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                            Log Activity
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
                            {/* Activity Name */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Activity Name *
                                </span>
                              </div>
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
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Activity Description *
                                </span>
                              </div>
                              <textarea
                                value={newActivity.description || ""}
                                onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                                placeholder="What did you do? (e.g., Called client to discuss Q1 forecast)"
                                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)",
                                  minHeight: "100px"
                                }}
                              />
                            </div>

                            {/* Type */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Type *
                                </span>
                              </div>
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
                                onChange={(value) => setNewActivity({ ...newActivity, type: value as ActivityType })}
                              />
                            </div>

                            {/* Date/Time */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Activity Date & Time *
                                </span>
                              </div>
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

                            {/* Contact/Customer */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Contact/Customer *
                                </span>
                              </div>
                              <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {contact.first_name} {contact.last_name}
                              </div>
                              {company && (
                                <div className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                                  {company.name}
                                </div>
                              )}
                            </div>

                            {/* Attachments Section */}
                            <div className="pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Attachments (Proof)
                                </span>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                                  style={{
                                    border: "1px solid var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)",
                                    color: "var(--theme-action-primary-bg)"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                  }}
                                >
                                  <Upload size={14} />
                                  Upload File
                                </button>
                              </div>

                              {activityAttachments.length === 0 ? (
                                <div 
                                  className="text-center py-8 rounded-lg"
                                  style={{ 
                                    border: "1px dashed var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)"
                                  }}
                                >
                                  <Paperclip size={24} style={{ color: "var(--theme-border-default)", margin: "0 auto 8px" }} />
                                  <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                                    No attachments yet - upload proof of this completed activity
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {activityAttachments.map((attachment) => (
                                    <div 
                                      key={attachment.id}
                                      className="flex items-center justify-between p-3 rounded-lg"
                                      style={{
                                        border: "1px solid var(--neuron-ui-border)",
                                        backgroundColor: "var(--theme-bg-surface)"
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0">
                                          {attachment.type === "pdf" && <FileText size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "image" && <ImageIcon size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "document" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "spreadsheet" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                        </div>
                                        <div>
                                          <div className="text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>
                                            {attachment.name}
                                          </div>
                                          <div className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
                                            {attachment.size}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setActivityAttachments(activityAttachments.filter(a => a.id !== attachment.id));
                                        }}
                                        className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
                                        style={{
                                          color: "var(--theme-status-danger-fg)"
                                        }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                              <button
                                onClick={async () => {
                                  // Validate required fields
                                  if (!newActivity.title || !newActivity.description || !newActivity.type || !newActivity.date) {
                                    // alert("Please fill in all required fields (Activity Name, Description, Type, Date & Time)");
                                    // using toast instead
                                    return;
                                  }
                                  
                                  try {
                                    const activityToSave = {
                                      ...newActivity,
                                      contact_id: contact.id,
                                      customer_id: contact.customer_id || contact.company_id || undefined, // Attach customer ID if available
                                      user_id: contact.owner_id || 'user-1' // Fallback to current user or owner
                                    };

                                    const { error: actErr } = await supabase.from('crm_activities').insert({
                                      ...activityToSave,
                                      id: `act-${Date.now()}`,
                                      created_at: new Date().toISOString(),
                                    });

                                    if (!actErr) {
                                      // In real app, this would save to backend
                                      // toast.success("Activity logged successfully");
                                      setIsLoggingActivity(false);
                                      setNewActivity({
                                        type: "Call",
                                        contact_id: contact.id
                                      });
                                      setActivityAttachments([]);
                                      // Refresh activities list
                                      queryClient.invalidateQueries({ queryKey: ["crm_activities", "contact", contact.id] });
                                    } else {
                                      console.error("Error saving activity:", actErr);
                                    }
                                  } catch (error) {
                                    console.error("Error saving activity:", error);
                                  }
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
                                Save Activity
                              </button>
                              <button
                                onClick={() => {
                                  setIsLoggingActivity(false);
                                  setNewActivity({
                                    type: "Call",
                                    contact_id: contact.id
                                  });
                                  setActivityAttachments([]);
                                }}
                                className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
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
                            setNewActivity({
                              type: "Call",
                              contact_id: contact.id,
                              date: new Date().toISOString()
                            });
                            setActivityAttachments([]);
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

                      {isLoadingData ? (
                        <div className="text-center py-12">
                          <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>Loading activities...</p>
                        </div>
                      ) : (
                        <ActivityTimelineTable 
                          activities={activities}
                          onViewActivity={(activity) => {
                            if (activity.task_id) {
                              const linkedTask = tasks.find(t => t.id === activity.task_id);
                              if (linkedTask) {
                                setSelectedTask(linkedTask);
                                setActiveTab("tasks");
                              }
                            } else {
                              setSelectedActivity(activity);
                            }
                          }}
                          contacts={[contact]}
                          users={users}
                        />
                      )}
                    </>
                  ) : (
                    // Activity Detail View
                    <div>
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-6">
                        <button
                          onClick={() => setSelectedActivity(null)}
                          className="p-2 rounded-lg transition-colors"
                          style={{
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--theme-bg-surface)"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                          }}
                        >
                          <ArrowLeft size={16} style={{ color: "var(--theme-text-primary)" }} />
                        </button>
                        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                          Activity Details
                        </h3>
                      </div>

                      {/* Activity Info Card */}
                      <div
                        className="rounded-lg p-6 mb-6"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)"
                        }}
                      >
                        <div className="space-y-6">
                          {/* Type */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Type
                              </span>
                            </div>
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--theme-bg-surface-tint)" }}>
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--theme-action-primary-bg)" }} />
                              <span className="text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-action-primary-bg)" }}>
                                {selectedActivity.type}
                              </span>
                            </div>
                          </div>

                          {/* Date */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Date
                              </span>
                            </div>
                            <span className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                              {formatDateTime(selectedActivity.date)}
                            </span>
                          </div>

                          {/* Description */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Description
                              </span>
                            </div>
                            <p className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                              {selectedActivity.description}
                            </p>
                          </div>

                          {/* Logged By */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Logged By
                              </span>
                            </div>
                            <span className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                              {users.find(u => u.id === selectedActivity.user_id)?.name || "Unknown User"}
                            </span>
                          </div>

                          {/* Contact */}
                          {selectedActivity.contact_id && (
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Related Contact
                                </span>
                              </div>
                              <span className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {contact.first_name} {contact.last_name}
                              </span>
                            </div>
                          )}

                          {/* Customer */}
                          {selectedActivity.customer_id && (
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Related Customer
                                </span>
                              </div>
                              <span className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {customer?.name || "Unknown Company"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "tasks" && canViewTasksTab && (
                <div>
                  {!selectedTask && !isCreatingTask ? (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                          Tasks
                        </h3>
                        <button
                          onClick={() => {
                            setIsCreatingTask(true);
                            setSelectedTask(null);
                            setNewTask({
                              type: "Call",
                              priority: "Medium",
                              status: "Pending",
                              contact_id: contact.id
                            });
                            setTaskAttachments([]);
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
                        <div className="space-y-3">
                          {tasks.map((task) => (
                            <div 
                              key={task.id}
                              onClick={() => {
                                setSelectedTask(task);
                                setEditedTask(task);
                                setIsEditingTask(false);
                              }}
                              className="p-4 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
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
                              <div>
                                <div className="text-[14px] font-medium mb-1" style={{ color: "var(--theme-text-primary)" }}>
                                  {task.title}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span 
                                    className="text-[11px] px-2 py-0.5 rounded font-medium"
                                    style={{
                                      backgroundColor: task.status === "Completed" ? "var(--theme-bg-surface-tint)" : "var(--theme-status-warning-bg)",
                                      color: task.status === "Completed" ? "var(--theme-action-primary-bg)" : "var(--theme-status-warning-fg)"
                                    }}
                                  >
                                    {task.status}
                                  </span>
                                  <span className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                                    Due: {formatDate(task.due_date)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : isCreatingTask ? (
                    <>
                      {/* Create Task Form */}
                      <div className="mb-6">
                        <button
                          onClick={() => {
                            setIsCreatingTask(false);
                            setNewTask({
                              type: "Call",
                              priority: "Medium",
                              status: "Pending",
                              contact_id: contact.id
                            });
                            setTaskAttachments([]);
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
                          Back to Tasks
                        </button>

                        <div className="flex items-center justify-between mb-6">
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
                            {/* Task Name/Title */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Task Name *
                                </span>
                              </div>
                              <input
                                type="text"
                                value={newTask.title || ""}
                                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                                placeholder="Enter task name..."
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>

                            {/* Description */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Description *
                                </span>
                              </div>
                              <textarea
                                value={newTask.description || ""}
                                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                                placeholder="Enter task description..."
                                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)",
                                  minHeight: "100px"
                                }}
                              />
                            </div>

                            {/* Type */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Type *
                                </span>
                              </div>
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
                                  { value: "To-do", label: "To-do", icon: <CheckSquare size={16} /> },
                                  { value: "Marketing Email", label: "Marketing Email", icon: <MessageSquare size={16} /> }
                                ]}
                                value={newTask.type || "Call"}
                                onChange={(value) => setNewTask({ ...newTask, type: value as TaskType })}
                              />
                            </div>

                            {/* Due Date */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Due Date *
                                </span>
                              </div>
                              <input
                                type="date"
                                value={newTask.due_date || ""}
                                onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
                                }}
                              />
                            </div>

                            {/* Remarks */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Remarks
                                </span>
                              </div>
                              <textarea
                                value={newTask.remarks || ""}
                                onChange={(e) => setNewTask({ ...newTask, remarks: e.target.value })}
                                placeholder="Add any additional notes..."
                                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)",
                                  minHeight: "80px"
                                }}
                              />
                            </div>

                            {/* Priority */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Priority *
                                </span>
                              </div>
                              <CustomDropdown
                                options={[
                                  { value: "High", label: "High", icon: <Flag size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> },
                                  { value: "Medium", label: "Medium", icon: <Flag size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                                  { value: "Low", label: "Low", icon: <Flag size={16} style={{ color: "var(--theme-status-success-fg)" }} /> }
                                ]}
                                value={newTask.priority || "Medium"}
                                onChange={(value) => setNewTask({ ...newTask, priority: value as "High" | "Medium" | "Low" })}
                              />
                            </div>

                            {/* Contact/Customer */}
                            <div>
                              <div className="mb-2">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Contact/Customer *
                                </span>
                              </div>
                              <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {contact.first_name} {contact.last_name}
                              </div>
                              {company && (
                                <div className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                                  {company.name}
                                </div>
                              )}
                            </div>

                            {/* Attachments Section */}
                            <div className="pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                  Attachments
                                </span>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                                  style={{
                                    border: "1px solid var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)",
                                    color: "var(--theme-action-primary-bg)"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                  }}
                                >
                                  <Upload size={14} />
                                  Upload File
                                </button>
                              </div>

                              {taskAttachments.length === 0 ? (
                                <div 
                                  className="text-center py-8 rounded-lg"
                                  style={{ 
                                    border: "1px dashed var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)"
                                  }}
                                >
                                  <Paperclip size={24} style={{ color: "var(--theme-border-default)", margin: "0 auto 8px" }} />
                                  <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                                    No attachments yet - upload files to attach to this task
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {taskAttachments.map((attachment) => (
                                    <div 
                                      key={attachment.id}
                                      className="flex items-center justify-between p-3 rounded-lg"
                                      style={{
                                        border: "1px solid var(--neuron-ui-border)",
                                        backgroundColor: "var(--theme-bg-surface)"
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0">
                                          {attachment.type === "pdf" && <FileText size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "image" && <ImageIcon size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "document" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                          {attachment.type === "spreadsheet" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                        </div>
                                        <div>
                                          <div className="text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>
                                            {attachment.name}
                                          </div>
                                          <div className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
                                            {attachment.size}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setTaskAttachments(taskAttachments.filter(a => a.id !== attachment.id));
                                        }}
                                        className="px-2 py-1 rounded text-[11px] font-medium transition-colors"
                                        style={{
                                          color: "var(--theme-status-danger-fg)"
                                        }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                              <button
                                onClick={async () => {
                                  // Validate required fields
                                  if (!newTask.title || !newTask.description || !newTask.type || !newTask.due_date || !newTask.priority) {
                                    // toast.error("Please fill in all required fields (Task Name, Description, Type, Due Date, Priority)");
                                    return;
                                  }
                                  
                                  try {
                                    const taskToSave = {
                                      ...newTask,
                                      contact_id: contact.id,
                                      customer_id: contact.customer_id || contact.company_id || undefined,
                                      owner_id: contact.owner_id || 'user-1',
                                      status: newTask.status || "Pending"
                                    };

                                    const { error: taskErr } = await supabase.from('tasks').insert({
                                      ...taskToSave,
                                      id: `task-${Date.now()}`,
                                      created_at: new Date().toISOString(),
                                    });

                                    if (!taskErr) {
                                      setIsCreatingTask(false);
                                      setNewTask({
                                        type: "Call",
                                        priority: "Medium",
                                        status: "Pending",
                                        contact_id: contact.id
                                      });
                                      setTaskAttachments([]);
                                      // Refresh tasks list
                                      queryClient.invalidateQueries({ queryKey: ["tasks", "contact", contact.id] });
                                    } else {
                                      console.error("Error saving task:", taskErr);
                                    }
                                  } catch (error) {
                                    console.error("Error creating task:", error);
                                  }
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
                              <button
                                onClick={() => {
                                  setIsCreatingTask(false);
                                  setNewTask({
                                    type: "Call",
                                    priority: "Medium",
                                    status: "Pending",
                                    contact_id: contact.id
                                  });
                                  setTaskAttachments([]);
                                }}
                                className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  backgroundColor: "var(--theme-bg-surface)",
                                  color: "var(--theme-text-primary)"
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
                    </>
                  ) : (
                    <>
                      {/* Task Detail View */}
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setSelectedTask(null);
                              setEditedTask(null);
                              setIsEditingTask(false);
                            }}
                            className="p-2 rounded-lg transition-colors"
                            style={{
                              border: "1px solid var(--neuron-ui-border)",
                              backgroundColor: "var(--theme-bg-surface)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            }}
                          >
                            <ArrowLeft size={16} style={{ color: "var(--theme-text-primary)" }} />
                          </button>
                          <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                            Task Details
                          </h3>
                        </div>
                        {!isEditingTask && (
                          <button
                            onClick={() => setIsEditingTask(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-[13px]"
                            style={{
                              border: "1px solid var(--neuron-ui-border)",
                              backgroundColor: "var(--theme-bg-surface)",
                              color: "var(--theme-text-primary)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            }}
                          >
                            <Edit size={14} />
                            Update Task
                          </button>
                        )}
                      </div>

                      <div 
                        className="rounded-lg p-6"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)"
                        }}
                      >
                        <div className="space-y-6">
                          {/* Task Description */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Task Description
                              </span>
                            </div>
                            {isEditingTask && editedTask ? (
                              <textarea
                                value={editedTask.title || ""}
                                onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                                placeholder="Enter task description..."
                                rows={3}
                                className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors resize-none"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  color: "var(--theme-text-primary)",
                                  outline: "none"
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                }}
                              />
                            ) : (
                              <div
                                className="text-[14px]"
                                style={{
                                  color: "var(--theme-text-primary)",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: "1.6"
                                }}
                              >
                                {selectedTask?.title}
                              </div>
                            )}
                          </div>

                          {/* Type */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Type
                              </span>
                            </div>
                            {isEditingTask && editedTask ? (
                              <CustomDropdown
                                value={editedTask.type}
                                onChange={(value) => setEditedTask({ ...editedTask, type: value as any })}
                                options={[
                                  { value: "To-do", label: "To-do", icon: <CheckSquare size={16} /> },
                                  { value: "Call", label: "Call", icon: <Phone size={16} /> },
                                  { value: "Email", label: "Email", icon: <Mail size={16} /> },
                                  { value: "Marketing Email", label: "Marketing Email", icon: <MessageSquare size={16} /> },
                                  { value: "Meeting", label: "Meeting", icon: <Users size={16} /> },
                                  { value: "SMS", label: "SMS", icon: <Send size={16} /> },
                                  { value: "Viber", label: "Viber", icon: <MessageCircle size={16} /> },
                                  { value: "WeChat", label: "WeChat", icon: <MessageSquare size={16} /> },
                                  { value: "WhatsApp", label: "WhatsApp", icon: <MessageSquare size={16} /> },
                                  { value: "LinkedIn", label: "LinkedIn", icon: <Linkedin size={16} /> }
                                ]}
                              />
                            ) : (
                              <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {selectedTask?.type}
                              </div>
                            )}
                          </div>

                          {/* Date */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Date
                              </span>
                            </div>
                            {isEditingTask && editedTask ? (
                              <input
                                type="date"
                                value={editedTask.due_date || ""}
                                onChange={(e) => setEditedTask({ ...editedTask, due_date: e.target.value })}
                                className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  color: "var(--theme-text-primary)",
                                  outline: "none"
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                }}
                              />
                            ) : (
                              <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                                {formatDate(selectedTask?.due_date ?? '')}
                              </div>
                            )}
                          </div>

                          {/* Remarks */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Remarks
                              </span>
                            </div>
                            {isEditingTask && editedTask ? (
                              <textarea
                                value={editedTask.notes || ""}
                                onChange={(e) => setEditedTask({ ...editedTask, notes: e.target.value })}
                                placeholder="Add remarks about this task..."
                                rows={4}
                                className="w-full px-3 py-2 text-[14px] rounded-lg transition-colors resize-none"
                                style={{
                                  border: "1px solid var(--neuron-ui-border)",
                                  color: "var(--theme-text-primary)",
                                  outline: "none"
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                }}
                              />
                            ) : (
                              <div 
                                className="text-[14px]"
                                style={{
                                  color: selectedTask?.notes ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: "1.6"
                                }}
                              >
                                {selectedTask?.notes || "No remarks added"}
                              </div>
                            )}
                          </div>

                          {/* Priority */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Priority
                              </span>
                            </div>
                            {isEditingTask && editedTask ? (
                              <CustomDropdown
                                value={editedTask.priority}
                                onChange={(value) => setEditedTask({ ...editedTask, priority: value as any })}
                                options={[
                                  { value: "Low", label: "Low", icon: <Flag size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                                  { value: "Medium", label: "Medium", icon: <Flag size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                                  { value: "High", label: "High", icon: <Flag size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> }
                                ]}
                              />
                            ) : (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium uppercase tracking-wide"
                                style={{
                                  backgroundColor: selectedTask?.priority === "High" ? "var(--theme-status-danger-bg)" : selectedTask?.priority === "Medium" ? "var(--theme-status-warning-bg)" : "var(--neuron-pill-inactive-bg)",
                                  color: selectedTask?.priority === "High" ? "#C94F3D" : selectedTask?.priority === "Medium" ? "#C88A2B" : "#667085"
                                }}
                              >
                                {selectedTask?.priority}
                              </span>
                            )}
                          </div>

                          {/* Contact/Customer */}
                          <div>
                            <div className="mb-2">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Contact/Customer
                              </span>
                            </div>
                            <div className="text-[14px]" style={{ color: "var(--theme-text-primary)" }}>
                              {contact.first_name} {contact.last_name}
                            </div>
                            {company && (
                              <div className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                                {company.name}
                              </div>
                            )}
                          </div>

                          {/* Attachments Section */}
                          <div className="pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--theme-text-muted)" }}>
                                Attachments
                              </span>
                              {isEditingTask && (
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                                  style={{
                                    border: "1px solid var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)",
                                    color: "var(--theme-action-primary-bg)"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                  }}
                                >
                                  <Upload size={14} />
                                  Upload File
                                </button>
                              )}
                            </div>

                            {taskAttachments.length === 0 ? (
                              <div 
                                className="text-center py-8 rounded-lg"
                                style={{ 
                                  border: "1px dashed var(--neuron-ui-border)",
                                  backgroundColor: "var(--neuron-pill-inactive-bg)"
                                }}
                              >
                                <Paperclip size={24} style={{ color: "var(--theme-border-default)", margin: "0 auto 8px" }} />
                                <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                                  {isEditingTask ? "No attachments yet - upload proof of completion" : "No attachments"}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {taskAttachments.map((attachment) => (
                                  <div 
                                    key={attachment.id}
                                    className="flex items-center justify-between p-3 rounded-lg"
                                    style={{
                                      border: "1px solid var(--neuron-ui-border)",
                                      backgroundColor: "var(--neuron-pill-inactive-bg)"
                                    }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="flex-shrink-0">
                                        {attachment.type === "pdf" && <FileText size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                        {attachment.type === "image" && <ImageIcon size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                        {attachment.type === "document" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                        {attachment.type === "spreadsheet" && <File size={18} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                      </div>
                                      <div>
                                        <div className="text-[13px] font-medium" style={{ color: "var(--theme-text-primary)" }}>
                                          {attachment.name}
                                        </div>
                                        <div className="text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
                                          {attachment.size}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors"
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
                                      <Download size={12} />
                                      Download
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-6" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
                            {isEditingTask ? (
                              <>
                                <button
                                  onClick={() => {
                                    // Save task logic here
                                    if (editedTask) {
                                      setSelectedTask(editedTask);
                                    }
                                    setIsEditingTask(false);
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
                                  Save and Continue
                                </button>
                                <button
                                  onClick={() => {
                                    setEditedTask(selectedTask);
                                    setIsEditingTask(false);
                                  }}
                                  className="px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                                  style={{
                                    border: "1px solid var(--neuron-ui-border)",
                                    backgroundColor: "var(--theme-bg-surface)",
                                    color: "var(--theme-text-primary)"
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
                              </>
                            ) : (
                              <>
                                {selectedTask && selectedTask.status !== "Completed" && (
                                  <button
                                    onClick={() => {
                                      // Check if proof is required
                                      if (isProofRequired(selectedTask.type) && taskAttachments.length === 0) {
                                        alert("This task requires proof to be marked as complete. Please upload an attachment.");
                                        return;
                                      }
                                      // Mark task as complete
                                      setSelectedTask({ ...selectedTask, status: "Completed" });
                                    }}
                                    disabled={isProofRequired(selectedTask.type) && taskAttachments.length === 0}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                                    style={{
                                      backgroundColor: (isProofRequired(selectedTask.type) && taskAttachments.length === 0) ? "var(--theme-border-default)" : "var(--theme-action-primary-bg)",
                                      color: (isProofRequired(selectedTask.type) && taskAttachments.length === 0) ? "var(--theme-text-muted)" : "#FFFFFF",
                                      cursor: (isProofRequired(selectedTask.type) && taskAttachments.length === 0) ? "not-allowed" : "pointer"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!(isProofRequired(selectedTask.type) && taskAttachments.length === 0)) {
                                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!(isProofRequired(selectedTask.type) && taskAttachments.length === 0)) {
                                        e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
                                      }
                                    }}
                                  >
                                    <CheckCircle2 size={16} />
                                    Mark as Complete
                                  </button>
                                )}
                                {selectedTask && selectedTask.status === "Completed" && (
                                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg" style={{ backgroundColor: "var(--theme-bg-surface-tint)" }}>
                                    <CheckCircle2 size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                                    <span className="text-[13px] font-medium" style={{ color: "var(--theme-action-primary-bg)" }}>
                                      Task Completed
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "inquiries" && canViewInquiriesTab && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                      Inquiries
                    </h3>
                    {onCreateInquiry && company && (
                      <CreateQuotationMenu
                        buttonText="Create Inquiry"
                        entityWord="Inquiry"
                        onSelect={(quotationType) => onCreateInquiry(company, contact, quotationType)}
                      />
                    )}
                  </div>

                  {inquiries.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
                      <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No inquiries yet</p>
                      <p className="text-[12px] mt-2" style={{ color: "var(--theme-text-muted)" }}>
                        Inquiries from E-Quotation system will appear here
                      </p>
                    </div>
                  ) : (
                    <div 
                      className="rounded-lg overflow-hidden"
                      style={{ 
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)"
                      }}
                    >
                      {/* Table Header */}
                      <div 
                        className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-4 py-3"
                        style={{ 
                          backgroundColor: "var(--theme-bg-page)",
                          borderBottom: "1px solid var(--neuron-ui-divider)"
                        }}
                      >
                        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                          Inquiry #
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                          Services
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                          Movement
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                          Route
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                          Created
                        </div>
                      </div>

                      {/* Table Rows */}
                      <div>
                        {inquiries.map(inquiry => (
                          <div
                            key={inquiry.id}
                            className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 px-4 py-4 cursor-pointer transition-colors"
                            style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                            }}
                          >
                            {/* Inquiry Number */}
                            <div>
                              <div className="text-[13px] font-medium mb-0.5" style={{ color: "var(--theme-text-primary)" }}>
                                {inquiry.quotation_name || inquiry.quote_number}
                              </div>
                              <div className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                                {inquiry.quote_number}
                              </div>
                            </div>

                            {/* Services */}
                            <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                              {inquiry.services.join(", ")}
                            </div>

                            {/* Movement */}
                            <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                              {inquiry.movement}
                            </div>

                            {/* Route */}
                            <div className="text-[12px]" style={{ color: "var(--theme-text-secondary)" }}>
                              {inquiry.pol_aol} → {inquiry.pod_aod}
                            </div>

                            {/* Created Date */}
                            <div className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                              {formatDate(inquiry.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "attachments" && canViewAttachmentsTab && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                      Attachments
                    </h3>
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
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
                        <Upload size={14} />
                        Upload File
                      </button>
                    </div>
                  </div>

                  {attachments.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-[14px]" style={{ color: "var(--theme-text-muted)" }}>No attachments yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {attachments.map((attachment) => (
                        <div 
                          key={attachment.id}
                          className="p-4 rounded-lg"
                          style={{
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--theme-bg-surface)"
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1">
                              <div className="flex-shrink-0 mt-1">
                                {attachment.type === "pdf" && <FileText size={20} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                {attachment.type === "image" && <ImageIcon size={20} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                {attachment.type === "document" && <File size={20} style={{ color: "var(--theme-action-primary-bg)" }} />}
                                {attachment.type === "spreadsheet" && <File size={20} style={{ color: "var(--theme-action-primary-bg)" }} />}
                              </div>
                              <div className="flex-1">
                                <div className="text-[14px] font-medium mb-1" style={{ color: "var(--theme-text-primary)" }}>
                                  {attachment.name}
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                                    {attachment.size}
                                  </span>
                                  <span className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                                    • Uploaded: {formatDate(attachment.uploadedAt)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="text-[11px] px-2 py-0.5 rounded font-medium uppercase tracking-wide"
                                    style={{
                                      backgroundColor: attachment.source === "Task" ? "var(--theme-status-warning-bg)" : attachment.source === "Activity" ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                                      color: attachment.source === "Task" ? "#C88A2B" : attachment.source === "Activity" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)"
                                    }}
                                  >
                                    {attachment.source}
                                  </span>
                                  <span className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
                                    {attachment.sourceName}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ml-4"
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
                              <Download size={14} />
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "comments" && canViewCommentsTab && (
                <div>
                  {/* Comments List */}
                  <div className="space-y-4 mb-6">
                    {mockComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-4 rounded-lg"
                        style={{
                          background: comment.user_department === "BD" 
                            ? "var(--theme-bg-surface-tint)" 
                            : "var(--neuron-bg-card)",
                          border: comment.user_department === "BD"
                            ? "1.5px solid var(--theme-action-primary-bg)"
                            : "1.5px solid var(--neuron-ui-border)",
                          marginLeft: comment.user_department === "BD" ? "40px" : "0",
                          marginRight: comment.user_department === "Pricing" ? "40px" : "0"
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span style={{ 
                            fontSize: "13px", 
                            fontWeight: 600, 
                            color: comment.user_department === "BD" 
                              ? "var(--neuron-brand-green)" 
                              : "var(--neuron-ink-primary)" 
                          }}>
                            {comment.user_name}
                          </span>
                          <span 
                            className="px-2 py-0.5 rounded text-[11px]"
                            style={{ 
                              background: comment.user_department === "BD" ? "var(--theme-action-primary-bg)" : "#6B7A76",
                              color: "#FFFFFF",
                              fontWeight: 500
                            }}
                          >
                            {comment.user_department}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                            {formatCommentDateTime(comment.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: "14px", color: "var(--neuron-ink-secondary)" }}>
                          {comment.message}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comment Input */}
                  <div 
                    className="sticky bottom-0 p-4 rounded-lg"
                    style={{
                      background: "var(--neuron-bg-card)",
                      border: "1.5px solid var(--neuron-ui-border)"
                    }}
                  >
                    <div className="flex gap-3">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment for Pricing team..."
                        rows={3}
                        className="flex-1 px-3 py-2 rounded-lg resize-none"
                        style={{
                          border: "1.5px solid var(--neuron-ui-border)",
                          background: "var(--neuron-bg-input)",
                          color: "var(--neuron-ink-primary)",
                          fontSize: "14px",
                          outline: "none"
                        }}
                      />
                      <button
                        onClick={handleSendComment}
                        disabled={!newComment.trim()}
                        className="px-4 py-2 rounded-lg transition-all flex items-center gap-2"
                        style={{
                          background: newComment.trim() ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)",
                          color: newComment.trim() ? "#FFFFFF" : "var(--theme-text-muted)",
                          border: "none",
                          cursor: newComment.trim() ? "pointer" : "not-allowed",
                          height: "fit-content"
                        }}
                      >
                        <Send size={16} />
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
