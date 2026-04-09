import { useState } from "react";
import { Search, Plus, Mail, Phone, Building2, Users, UserCheck, UserCircle, MoreHorizontal } from "lucide-react";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { supabase } from "../../utils/supabase/client";
import { useUsers } from "../../hooks/useUsers";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { useContacts } from "../../hooks/useContacts";
import { useCRMActivities } from "../../hooks/useCRMActivities";
import { AddContactPanel } from "../bd/AddContactPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { toast } from "sonner@2.0.3";
import type { Contact, LifecycleStage, LeadStatus } from "../../types/bd";
import { useDataScope } from "../../hooks/useDataScope";

interface BackendContact {
  id: string;
  name: string;
  title: string | null;
  customer_id: string | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  lifecycle_stage?: LifecycleStage;
  lead_status?: LeadStatus;
  owner_id?: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  created_date?: string;
  updated_at: string;
  status?: string;
  company?: string;
  last_activity?: string;
  customers?: { name: string } | null;
}

interface ContactsListWithFiltersProps {
  userDepartment: "Business Development" | "Pricing";
  onViewContact: (contact: Contact) => void;
}

export function ContactsListWithFilters({ userDepartment, onViewContact }: ContactsListWithFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleStage | "All">("All");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);

  const { user } = useUser();
  const { scope, isLoaded } = useDataScope();

  // Direct Supabase query for BD users (replaces Edge Function fetch)
  const { users: bdUsers } = useUsers({ department: 'Business Development' });

  const { contacts: allContacts, isLoading, invalidate: invalidateContacts } = useContacts({ enabled: isLoaded });
  const { activities } = useCRMActivities();

  // Apply scope + search client-side
  // Scope filtering only applies to BD's own CRM view — Pricing (and other
  // non-BD departments) need to see all contacts.
  const contacts = allContacts.filter((contact: BackendContact) => {
    if (userDepartment === "Business Development") {
      if (scope.type === 'userIds' && contact.owner_id && !scope.ids.includes(contact.owner_id)) return false;
      if (scope.type === 'own' && contact.owner_id !== scope.userId) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (contact.name || '').toLowerCase().includes(q) ||
        (contact.email || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    return true;
  });

  // Permissions based on department
  const permissions = {
    canCreate: userDepartment === "Business Development",
    canEdit: userDepartment === "Business Development",
    showKPIs: true, // Both BD and PD see KPIs
    showOwnerFilter: userDepartment === "Business Development",
  };

  const handleSaveContact = async (contactData: any) => {
    try {
      // AddContactPanel sends: first_name, last_name, title, email, phone, customer_id,
      //   owner_id, lifecycle_stage, lead_status, notes
      // These map directly to the backend POST /contacts handler field names.
      const customerId = contactData.customer_id || contactData.company_id || null;

      const firstName = contactData.first_name || '';
      const lastName = contactData.last_name || '';
      const transformedData = {
        name: `${firstName} ${lastName}`.trim() || 'Contact',
        first_name: firstName || null,
        last_name: lastName || null,
        title: contactData.title || null,
        email: contactData.email || null,
        phone: contactData.phone || contactData.mobile_number || null,
        customer_id: customerId,
        owner_id: contactData.owner_id || null,
        lifecycle_stage: contactData.lifecycle_stage || "Lead",
        lead_status: contactData.lead_status || "New",
        notes: contactData.notes || null,
        created_by: user?.id ?? null,
      };

      const { data, error } = await supabase.from('contacts').insert({
        ...transformedData,
        id: `contact-${Date.now()}`,
        created_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("contact", data.id, data.name ?? data.id, _actor);
      invalidateContacts();
      toast.success("Contact created.");
      setIsAddContactOpen(false);
    } catch (error) {
      console.error("Error creating contact:", error);
      toast.error("Failed to create contact. Please try again.");
    }
  };

  // Map backend status to lifecycle stage
  const mapStatusToLifecycle = (status: string): LifecycleStage => {
    switch (status) {
      case "Customer": return "Customer";
      case "MQL": return "MQL";
      case "Prospect": return "SQL";
      case "Lead": return "Lead";
      default: return "Lead";
    }
  };

  // Filter contacts - now using backend contacts
  const filteredContacts = contacts.filter(contact => {
    // Search is already handled by backend
    const lifecycle = mapStatusToLifecycle(contact.status || "");
    const matchesLifecycle = lifecycleFilter === "All" || lifecycle === lifecycleFilter;
    
    return matchesLifecycle;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  const formatPhoneNumber = (phone: string) => {
    return phone || "—";
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
        return "#0F766E";
      default:
        return "#0F766E";
    }
  };

  // Calculate KPIs with Quotas
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  // New Contacts Added this month
  const newContactsAdded = contacts.filter(contact => {
    const createdDate = new Date(contact.created_date || "");
    return createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
  }).length;
  const newContactsQuota = 25;
  const newContactsProgress = (newContactsAdded / newContactsQuota) * 100;
  const newContactsTrend = 15; // +15% vs last month (mock data)
  
  // Calls Made this month - now from backend activities
  const callsMade = activities.filter(activity => {
    const activityDate = new Date(activity.date);
    return activity.activity_type === "Call Logged" && 
           activityDate.getMonth() === currentMonth && 
           activityDate.getFullYear() === currentYear;
  }).length;
  const callsQuota = 100;
  const callsProgress = (callsMade / callsQuota) * 100;
  const callsTrend = -8; // -8% vs last month (mock data)
  
  // Emails Sent this month - now from backend activities
  const emailsSent = activities.filter(activity => {
    const activityDate = new Date(activity.date);
    return activity.activity_type === "Email Logged" && 
           activityDate.getMonth() === currentMonth && 
           activityDate.getFullYear() === currentYear;
  }).length;
  const emailsQuota = 150;
  const emailsProgress = (emailsSent / emailsQuota) * 100;
  const emailsTrend = 22; // +22% vs last month (mock data)
  
  // Meetings Booked this month - now from backend activities
  const meetingsBooked = activities.filter(activity => {
    const activityDate = new Date(activity.date);
    return activity.activity_type === "Meeting Logged" && 
           activityDate.getMonth() === currentMonth && 
           activityDate.getFullYear() === currentYear;
  }).length;
  const meetingsQuota = 20;
  const meetingsProgress = (meetingsBooked / meetingsQuota) * 100;
  const meetingsTrend = 10; // +10% vs last month (mock data)
  
  return (
    <div 
      className="h-full overflow-auto"
      style={{
        background: "var(--theme-bg-surface)",
      }}
    >
      <div style={{ padding: "32px 48px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Contacts
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              {userDepartment === "Business Development" 
                ? "Manage all customer and lead contacts" 
                : "View contacts and check inquiries"}
            </p>
          </div>
          {permissions.canCreate && (
            <button
              style={{
                height: "48px",
                padding: "0 24px",
                borderRadius: "16px",
                background: "var(--theme-action-primary-bg)",
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
              onClick={() => setIsAddContactOpen(true)}
            >
              <Plus size={20} />
              Add Contact
            </button>
          )}
        </div>

        {/* KPI Section */}
        {permissions.showKPIs && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <NeuronKPICard
              icon={Users}
              label="New Contacts Added"
              value={newContactsAdded}
              suffix={`/ ${newContactsQuota}`}
              trend={newContactsTrend}
              progress={newContactsProgress}
            />
            <NeuronKPICard
              icon={Phone}
              label="Calls Made"
              value={callsMade}
              suffix={`/ ${callsQuota}`}
              trend={callsTrend}
              progress={callsProgress}
            />
            <NeuronKPICard
              icon={Mail}
              label="Emails Sent"
              value={emailsSent}
              suffix={`/ ${emailsQuota}`}
              trend={emailsTrend}
              progress={emailsProgress}
            />
            <NeuronKPICard
              icon={UserCheck}
              label="Meetings Booked"
              value={meetingsBooked}
              suffix={`/ ${meetingsQuota}`}
              trend={meetingsTrend}
              progress={meetingsProgress}
            />
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
              style={{
                border: "1.5px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--neuron-ink-primary)"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              }}
            />
          </div>

          {/* BD sees filters, PD does not */}
          {userDepartment === "Business Development" && (
            <>
              <div style={{ minWidth: "140px" }}>
                <CustomDropdown
                  value={lifecycleFilter}
                  onChange={(value) => setLifecycleFilter(value as LifecycleStage | "All")}
                  options={[
                    { value: "All", label: "All Stages" },
                    { value: "Lead", label: "Lead" },
                    { value: "MQL", label: "MQL" },
                    { value: "SQL", label: "SQL" },
                    { value: "Customer", label: "Customer" }
                  ]}
                />
              </div>

              <div style={{ minWidth: "160px" }}>
                <CustomDropdown
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as LeadStatus | "All")}
                  options={[
                    { value: "All", label: "All Statuses" },
                    { value: "New", label: "New" },
                    { value: "Open", label: "Open" },
                    { value: "In Progress", label: "In Progress" },
                    { value: "Unqualified", label: "Unqualified" },
                    { value: "Attempted to contact", label: "Attempted to contact" },
                    { value: "Connected", label: "Connected" },
                    { value: "Bad timing", label: "Bad Timing" }
                  ]}
                />
              </div>
            </>
          )}

          {permissions.showOwnerFilter && (
            <div style={{ minWidth: "140px" }}>
              <CustomDropdown
                value={ownerFilter}
                onChange={(value) => setOwnerFilter(value)}
                options={[
                  { value: "All", label: "All Owners" },
                  ...bdUsers.map(user => ({ value: user.id, label: user.name }))
                ]}
              />
            </div>
          )}
        </div>

        {/* Contacts Table */}
        <div style={{ 
          border: "1.5px solid var(--neuron-ui-border)", 
          borderRadius: "16px", 
          overflow: "hidden",
          backgroundColor: "var(--theme-bg-surface)"
        }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--neuron-ui-border)" }}>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>CONTACT</th>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>COMPANY</th>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>PHONE</th>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>EMAIL</th>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>STAGE</th>
                <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>LAST ACTIVITY</th>
                <th className="text-center px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", backgroundColor: "var(--theme-bg-page)" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12" style={{ color: "var(--neuron-ink-muted)" }}>
                    Loading contacts...
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12" style={{ color: "var(--neuron-ink-muted)" }}>
                    No contacts found
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const lifecycle = mapStatusToLifecycle(contact.status || "");
                  return (
                    <tr 
                      key={contact.id} 
                      className="cursor-pointer hover:bg-[var(--theme-state-hover)] transition-colors"
                      style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}
                      onClick={() => onViewContact(contact as any)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)" }}
                          >
                            <UserCircle size={16} />
                          </div>
                          <span className="text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                            {(contact as any).name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                          <span className="text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>{contact.company}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                        {formatPhoneNumber(contact.phone || "")}
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                        {contact.email}
                      </td>
                      <td className="px-4 py-3">
                        <span 
                          className="px-2 py-1 rounded text-xs"
                          style={{ 
                            backgroundColor: `${getLifecycleStageColor(lifecycle)}15`,
                            color: getLifecycleStageColor(lifecycle)
                          }}
                        >
                          {lifecycle}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
                        {contact.last_activity ? formatDate(contact.last_activity) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button 
                          className="p-1 rounded hover:bg-[var(--theme-state-selected)] transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreHorizontal size={16} style={{ color: "var(--neuron-ink-muted)" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Contact Panel - Only for BD */}
      {permissions.canCreate && (
        <AddContactPanel
          isOpen={isAddContactOpen}
          onSave={handleSaveContact}
          onClose={() => setIsAddContactOpen(false)}
        />
      )}
    </div>
  );
}