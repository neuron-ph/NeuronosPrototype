import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Plus, Building2, Users, UserCheck, MoreHorizontal, Phone, Mail, SlidersHorizontal, X, Check } from "lucide-react";
import { NeuronKPICard } from "../ui/NeuronKPICard";
import { supabase } from "../../utils/supabase/client";
import { useUsers } from "../../hooks/useUsers";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { recordNotificationEvent, fetchDeptManagerIds } from "../../utils/notifications";
import { useUnreadEntityIds } from "../../hooks/useNotifications";
import { useContacts } from "../../hooks/useContacts";
import { useCRMActivities } from "../../hooks/useCRMActivities";
import { usePermission } from "../../context/PermissionProvider";
import { AddContactPanel } from "../bd/AddContactPanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import { toast } from "sonner@2.0.3";
import type { ModuleId } from "../admin/permissionsConfig";
import type { Contact, LifecycleStage, LeadStatus } from "../../types/bd";
import { useDataScope } from "../../hooks/useDataScope";
import { useBreakpoint } from "../../hooks/useBreakpoint";

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
  /** Required — drives all create/edit/view permission checks. No fallback. */
  moduleId: ModuleId;
  onViewContact: (contact: Contact) => void;
}

export function ContactsListWithFilters({ userDepartment, moduleId, onViewContact }: ContactsListWithFiltersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleStage | "All">("All");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { user } = useUser();
  const { can } = usePermission();
  const { scope, isLoaded } = useDataScope('contacts');
  const { isMobile, isTablet } = useBreakpoint();

  const { users: bdUsers } = useUsers({ department: 'Business Development' });
  const { contacts: allContacts, isLoading, invalidate: invalidateContacts } = useContacts({ enabled: isLoaded });
  const { activities } = useCRMActivities();

  const canViewModule = can(moduleId, "view");
  const showAdvancedFilters = userDepartment === "Business Development" && canViewModule;

  // Apply scope + search client-side
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

  const permissions = {
    canCreate: can(moduleId, "create"),
    canEdit:   can(moduleId, "edit"),
    showKPIs: canViewModule,
    showOwnerFilter: showAdvancedFilters,
    showAdvancedFilters,
  };

  const handleSaveContact = async (contactData: any) => {
    try {
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

      const bdManagers = await fetchDeptManagerIds('Business Development');
      void recordNotificationEvent({
        actorUserId: user?.id ?? null,
        module: 'bd',
        subSection: 'contacts',
        entityType: 'user',
        entityId: data.id,
        kind: 'updated',
        summary: { label: `New contact ${data.name ?? data.id}` },
        recipientIds: [data.owner_id, ...bdManagers],
      });

      invalidateContacts();
      toast.success("Contact created.");
      setIsAddContactOpen(false);
    } catch (error) {
      console.error("Error creating contact:", error);
      toast.error("Failed to create contact. Please try again.");
    }
  };

  const mapStatusToLifecycle = (status: string): LifecycleStage => {
    switch (status) {
      case "Customer": return "Customer";
      case "MQL": return "MQL";
      case "Prospect": return "SQL";
      case "Lead": return "Lead";
      default: return "Lead";
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const lifecycle = mapStatusToLifecycle(contact.status || "");
    return lifecycleFilter === "All" || lifecycle === lifecycleFilter;
  });

  const unreadContactIds = useUnreadEntityIds("user", filteredContacts.map((c) => c.id));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatPhoneNumber = (phone: string) => phone || "—";

  const getLifecycleStageColor = (stage: LifecycleStage) => {
    switch (stage) {
      case "Lead":     return "#C88A2B";
      case "MQL":      return "#6B7A76";
      case "SQL":      return "#C94F3D";
      case "Customer": return "#0F766E";
      default:         return "#0F766E";
    }
  };

  // KPI computations — real month-over-month trends
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear  = currentMonth === 0 ? currentYear - 1 : currentYear;

  const computeTrend = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const newContactsAdded = contacts.filter(c => {
    const d = new Date(c.created_date || c.created_at || "");
    return !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const prevNewContactsAdded = contacts.filter(c => {
    const d = new Date(c.created_date || c.created_at || "");
    return !isNaN(d.getTime()) && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }).length;
  const newContactsQuota    = 25;
  const newContactsProgress = (newContactsAdded / newContactsQuota) * 100;
  const newContactsTrend    = computeTrend(newContactsAdded, prevNewContactsAdded);

  const callsMade = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Call Logged" && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const prevCallsMade = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Call Logged" && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }).length;
  const callsQuota    = 100;
  const callsProgress = (callsMade / callsQuota) * 100;
  const callsTrend    = computeTrend(callsMade, prevCallsMade);

  const emailsSent = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Email Logged" && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const prevEmailsSent = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Email Logged" && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }).length;
  const emailsQuota    = 150;
  const emailsProgress = (emailsSent / emailsQuota) * 100;
  const emailsTrend    = computeTrend(emailsSent, prevEmailsSent);

  const meetingsBooked = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Meeting Logged" && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const prevMeetingsBooked = activities.filter(a => {
    const d = new Date(a.date);
    return a.activity_type === "Meeting Logged" && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }).length;
  const meetingsQuota    = 20;
  const meetingsProgress = (meetingsBooked / meetingsQuota) * 100;
  const meetingsTrend    = computeTrend(meetingsBooked, prevMeetingsBooked);

  // ─── Derived layout values ───────────────────────────────────────────────
  const pad          = isMobile ? "20px 16px" : "32px 48px";
  const titleSize    = isMobile ? "24px" : "32px";
  const kpiCols      = isMobile ? "grid-cols-2 gap-3" : "grid-cols-4 gap-4";
  const isCompact    = isMobile || isTablet;
  const activeFilterCount = [
    lifecycleFilter !== "All",
    statusFilter !== "All",
    ownerFilter !== "All",
  ].filter(Boolean).length;

  return (
    <div className="h-full overflow-auto" style={{ background: "var(--theme-bg-surface)" }}>
      <div style={{ padding: pad }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: isMobile ? "20px" : "32px",
          gap: "12px",
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              fontSize: titleSize,
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              marginBottom: "4px",
              letterSpacing: "-1.2px",
              lineHeight: 1.15,
            }}>
              Contacts
            </h1>
            <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0 }}>
              {permissions.showAdvancedFilters
                ? "Manage all customer and lead contacts"
                : "View contacts and check inquiries"}
            </p>
          </div>

          {permissions.canCreate && (
            <button
              style={{
                height: "40px",
                padding: "0 20px",
                borderRadius: "8px",
                background: "var(--theme-action-primary-bg)",
                border: "none",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--theme-action-primary-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--theme-action-primary-bg)"; }}
              onClick={() => setIsAddContactOpen(true)}
            >
              <Plus size={16} />
              {isMobile ? "Add" : "Add Contact"}
            </button>
          )}
        </div>

        {/* ── KPI Section ─────────────────────────────────────────────── */}
        {permissions.showKPIs && (
          <div className={`grid ${kpiCols} mb-6`}>
            <NeuronKPICard icon={Users}     label="New Contacts Added" value={newContactsAdded} suffix={`/ ${newContactsQuota}`} trend={newContactsTrend} progress={newContactsProgress} />
            <NeuronKPICard icon={Phone}     label="Calls Made"         value={callsMade}        suffix={`/ ${callsQuota}`}        trend={callsTrend}        progress={callsProgress}        />
            <NeuronKPICard icon={Mail}      label="Emails Sent"        value={emailsSent}       suffix={`/ ${emailsQuota}`}       trend={emailsTrend}       progress={emailsProgress}       />
            <NeuronKPICard icon={UserCheck} label="Meetings Booked"    value={meetingsBooked}   suffix={`/ ${meetingsQuota}`}     trend={meetingsTrend}     progress={meetingsProgress}     />
          </div>
        )}

        {/* ── Search & Filters ─────────────────────────────────────────── */}
        {isMobile ? (
          <>
            {/* Search + Filters pill on one row */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} style={{
                  position: "absolute", left: "10px", top: "50%",
                  transform: "translateY(-50%)", color: "var(--neuron-ink-muted)",
                }} />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px 9px 32px",
                    border: "1.5px solid var(--neuron-ui-border)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    backgroundColor: "var(--theme-bg-surface)",
                    color: "var(--neuron-ink-primary)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                />
              </div>

              {permissions.showAdvancedFilters && (
                <button
                  onClick={() => setIsFilterSheetOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    height: "38px",
                    padding: "0 14px",
                    borderRadius: "8px",
                    border: activeFilterCount > 0
                      ? "1.5px solid var(--theme-action-primary-bg)"
                      : "1.5px solid var(--neuron-ui-border)",
                    background: activeFilterCount > 0
                      ? `color-mix(in oklch, var(--theme-action-primary-bg) 10%, transparent)`
                      : "var(--theme-bg-surface)",
                    color: activeFilterCount > 0
                      ? "var(--theme-action-primary-bg)"
                      : "var(--neuron-ink-primary)",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
                </button>
              )}
            </div>

            {/* Inline filter card — expands below the search bar */}
            {permissions.showAdvancedFilters && (
              <AnimatePresence>
                {isFilterSheetOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{
                      border: "1.5px solid var(--neuron-ui-border)",
                      borderRadius: "10px",
                      background: "var(--theme-bg-surface)",
                      padding: "16px",
                      marginBottom: "12px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Card header */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "14px",
                    }}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--neuron-ink-muted)",
                        letterSpacing: "0.5px",
                      }}>
                        FILTERS
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {activeFilterCount > 0 && (
                          <button
                            onClick={() => {
                              setLifecycleFilter("All");
                              setStatusFilter("All");
                              setOwnerFilter("All");
                            }}
                            style={{
                              fontSize: "12px",
                              color: "var(--theme-action-primary-bg)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 500,
                              padding: 0,
                            }}
                          >
                            Clear all
                          </button>
                        )}
                        <button
                          onClick={() => setIsFilterSheetOpen(false)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px",
                            color: "var(--neuron-ink-muted)",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Stage — horizontal pills */}
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--neuron-ink-muted)",
                        letterSpacing: "0.5px",
                        marginBottom: "8px",
                      }}>
                        STAGE
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {(["All", "Lead", "MQL", "SQL", "Customer"] as const).map((stage) => {
                          const isActive = lifecycleFilter === stage;
                          return (
                            <button
                              key={stage}
                              onClick={() => setLifecycleFilter(stage === "All" ? "All" : stage)}
                              style={{
                                padding: "5px 13px",
                                borderRadius: "8px",
                                fontSize: "12px",
                                fontWeight: isActive ? 600 : 500,
                                border: isActive
                                  ? "1.5px solid var(--theme-action-primary-bg)"
                                  : "1.5px solid var(--neuron-ui-border)",
                                background: isActive ? "var(--theme-action-primary-bg)" : "transparent",
                                color: isActive ? "#fff" : "var(--neuron-ink-primary)",
                                cursor: "pointer",
                                transition: "all 0.1s",
                              }}
                            >
                              {stage === "All" ? "All" : stage}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Status + Owner — two columns */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      {/* Status */}
                      <div>
                        <div style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--neuron-ink-muted)",
                          letterSpacing: "0.5px",
                          marginBottom: "6px",
                        }}>
                          STATUS
                        </div>
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          border: "1.5px solid var(--neuron-ui-border)",
                          borderRadius: "8px",
                          overflow: "hidden",
                        }}>
                          {(["All", "New", "Open", "In Progress", "Unqualified", "Connected", "Bad timing"] as const).map((status, i, arr) => {
                            const label = status === "All" ? "All" : status;
                            const isActive = statusFilter === status;
                            return (
                              <button
                                key={status}
                                onClick={() => setStatusFilter(status === "All" ? "All" : status as LeadStatus)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "7px 10px",
                                  borderRadius: 0,
                                  background: isActive
                                    ? `color-mix(in oklch, var(--theme-action-primary-bg) 10%, transparent)`
                                    : "none",
                                  borderTop: "none",
                                  borderLeft: "none",
                                  borderRight: "none",
                                  borderBottom: i < arr.length - 1 ? "1px solid var(--neuron-ui-border)" : "none",
                                  cursor: "pointer",
                                  fontSize: "13px",
                                  color: isActive ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-primary)",
                                  fontWeight: isActive ? 600 : 400,
                                  textAlign: "left",
                                  transition: "background 0.1s",
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                                {isActive && <Check size={13} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0, marginLeft: "4px" }} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Owner */}
                      {permissions.showOwnerFilter && (
                        <div>
                          <div style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--neuron-ink-muted)",
                            letterSpacing: "0.5px",
                            marginBottom: "6px",
                          }}>
                            OWNER
                          </div>
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            border: "1.5px solid var(--neuron-ui-border)",
                            borderRadius: "8px",
                            overflow: "hidden",
                          }}>
                            {[{ id: "All", name: "All" }, ...bdUsers].map((u, i, arr) => {
                              const isActive = ownerFilter === u.id;
                              return (
                                <button
                                  key={u.id}
                                  onClick={() => setOwnerFilter(u.id)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "7px 10px",
                                    borderRadius: 0,
                                    background: isActive
                                      ? `color-mix(in oklch, var(--theme-action-primary-bg) 10%, transparent)`
                                      : "none",
                                    borderTop: "none",
                                    borderLeft: "none",
                                    borderRight: "none",
                                    borderBottom: i < arr.length - 1 ? "1px solid var(--neuron-ui-border)" : "none",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    color: isActive ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-primary)",
                                    fontWeight: isActive ? 600 : 400,
                                    textAlign: "left",
                                    transition: "background 0.1s",
                                  }}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                                  {isActive && <Check size={13} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0, marginLeft: "4px" }} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none text-[13px]"
                style={{
                  border: "1.5px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--neuron-ink-primary)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
              />
            </div>

            {permissions.showAdvancedFilters && (
              <>
                <div style={{ minWidth: "140px" }}>
                  <CustomDropdown
                    value={lifecycleFilter}
                    onChange={(v) => setLifecycleFilter(v as LifecycleStage | "All")}
                    options={[
                      { value: "All", label: "All Stages" },
                      { value: "Lead", label: "Lead" },
                      { value: "MQL", label: "MQL" },
                      { value: "SQL", label: "SQL" },
                      { value: "Customer", label: "Customer" },
                    ]}
                  />
                </div>
                <div style={{ minWidth: "160px" }}>
                  <CustomDropdown
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as LeadStatus | "All")}
                    options={[
                      { value: "All", label: "All Statuses" },
                      { value: "New", label: "New" },
                      { value: "Open", label: "Open" },
                      { value: "In Progress", label: "In Progress" },
                      { value: "Unqualified", label: "Unqualified" },
                      { value: "Attempted to contact", label: "Attempted to contact" },
                      { value: "Connected", label: "Connected" },
                      { value: "Bad timing", label: "Bad Timing" },
                    ]}
                  />
                </div>
              </>
            )}

            {permissions.showOwnerFilter && (
              <div style={{ minWidth: "140px" }}>
                <CustomDropdown
                  value={ownerFilter}
                  onChange={(v) => setOwnerFilter(v)}
                  options={[
                    { value: "All", label: "All Owners" },
                    ...bdUsers.map(u => ({ value: u.id, label: u.name })),
                  ]}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Contacts: card list (mobile) or table (desktop) ─────────── */}
        <div style={{
          border: "1.5px solid var(--neuron-ui-border)",
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "var(--theme-bg-surface)",
        }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 16px", fontSize: "13px", color: "var(--neuron-ink-muted)" }}>
              Loading contacts...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 4px 0" }}>
                {searchQuery || lifecycleFilter !== "All" ? "No contacts match your filters" : "No contacts yet"}
              </p>
              <p style={{ fontSize: "12px", margin: 0, color: "var(--neuron-ink-muted)" }}>
                {searchQuery || lifecycleFilter !== "All"
                  ? "Try adjusting your search or filter criteria"
                  : "Add your first contact to start building the pipeline"}
              </p>
            </div>
          ) : isCompact ? (
            // ── Mobile / tablet: vertical card list ──────────────────
            filteredContacts.map((contact, index) => {
              const lifecycle = mapStatusToLifecycle(contact.status || "");
              const name = (contact as any).name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || "—";
              const company = contact.company || contact.customers?.name || null;
              return (
                <div
                  key={contact.id}
                  onClick={() => onViewContact(contact as any)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px 16px",
                    borderBottom: index < filteredContacts.length - 1 ? "1px solid var(--neuron-ui-border)" : "none",
                    cursor: "pointer",
                    transition: "background-color 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {/* Initial avatar + unread dot */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      backgroundColor: "var(--theme-bg-surface-tint)",
                      color: "var(--theme-action-primary-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    {unreadContactIds.has(contact.id) && (
                      <span aria-label="Unread" style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: "var(--theme-status-danger-fg)" }} />
                    )}
                  </div>

                  {/* Name + company */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--neuron-ink-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: company ? "2px" : 0,
                    }}>
                      {name}
                    </div>
                    {company && (
                      <div style={{
                        fontSize: "12px",
                        color: "var(--neuron-ink-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {company}
                      </div>
                    )}
                  </div>

                  {/* Stage pill */}
                  <span style={{
                    padding: "3px 9px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    backgroundColor: `${getLifecycleStageColor(lifecycle)}18`,
                    color: getLifecycleStageColor(lifecycle),
                    flexShrink: 0,
                    letterSpacing: "0.02em",
                  }}>
                    {lifecycle}
                  </span>
                </div>
              );
            })
          ) : (
            // ── Desktop: full table ───────────────────────────────────
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--neuron-ui-border)" }}>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>CONTACT</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>COMPANY</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>PHONE</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>EMAIL</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>STAGE</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>LAST ACTIVITY</th>
                  <th className="text-center px-4 py-3 text-xs" style={{ color: "var(--neuron-ink-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => {
                  const lifecycle = mapStatusToLifecycle(contact.status || "");
                  const name = (contact as any).name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
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
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: "var(--theme-bg-surface-tint)",
                              color: "var(--theme-action-primary-bg)",
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.02em",
                            }}
                          >
                            {(name || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px]" style={{ color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                            {name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} style={{ color: "var(--neuron-ink-muted)" }} />
                          <span className="text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                            {contact.company || contact.customers?.name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                        {formatPhoneNumber(contact.phone || "")}
                      </td>
                      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                        {contact.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-1 rounded text-xs"
                          style={{
                            backgroundColor: `${getLifecycleStageColor(lifecycle)}15`,
                            color: getLifecycleStageColor(lifecycle),
                            fontWeight: 600,
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
                          onClick={(e) => { e.stopPropagation(); }}
                        >
                          <MoreHorizontal size={16} style={{ color: "var(--neuron-ink-muted)" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Contact Panel — BD only */}
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
