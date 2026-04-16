import { useState } from "react";
import { Search, Phone, Mail, Send, Users, MessageSquare, MessageCircle, Linkedin, FileText, RefreshCw, Calendar, Paperclip } from "lucide-react";
import type { Activity, ActivityType, Contact } from "../../types/bd";
import { CustomDropdown } from "./CustomDropdown";

interface ActivityTimelineTableProps {
  activities: Activity[];
  onViewActivity?: (activity: Activity) => void;
  contacts?: Contact[]; // For resolving contact names
  users?: any[]; // For resolving owner names
}

export function ActivityTimelineTable({ 
  activities, 
  onViewActivity,
  contacts = [],
  users = []
}: ActivityTimelineTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityType | "All">("All");
  const [dateRangeFilter, setDateRangeFilter] = useState<"Today" | "This Week" | "This Month" | "All Time">("All Time");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");

  // Filter activities
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = 
      activity.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "All" || activity.type === typeFilter;
    const matchesOwner = ownerFilter === "All" || activity.user_id === ownerFilter;

    // Date range filtering
    let matchesDateRange = true;
    const activityDate = new Date(activity.date);
    const now = new Date();
    
    if (dateRangeFilter === "Today") {
      matchesDateRange = activityDate.toDateString() === now.toDateString();
    } else if (dateRangeFilter === "This Week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchesDateRange = activityDate >= weekAgo;
    } else if (dateRangeFilter === "This Month") {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      matchesDateRange = activityDate >= monthAgo;
    }

    return matchesSearch && matchesType && matchesOwner && matchesDateRange;
  });

  // Sort by date (most recent first)
  const sortedActivities = [...filteredActivities].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const getContactName = (contactId: string | null) => {
    if (!contactId) return null;
    const contact = contacts.find(c => c.id === contactId);
    return contact ? (contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()) : null;
  };

  const getOwnerName = (userId: string) => {
    if (!userId) return "—";
    const user = users.find(u => u.id === userId);
    return user ? user.name : userId;
  };

  const getLinkedEntity = (activity: Activity) => {
    const contactName = getContactName(activity.contact_id);
    
    if (contactName) {
      return contactName;
    }
    return "—";
  };

  const getActivityTypeIcon = (type: ActivityType) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (type) {
      case "Call Logged": return <Phone {...iconProps} />;
      case "Email Logged": return <Mail {...iconProps} />;
      case "Marketing Email Logged": return <Send {...iconProps} />;
      case "Meeting Logged": return <Users {...iconProps} />;
      case "SMS Logged": return <MessageSquare {...iconProps} />;
      case "Viber Logged": return <MessageCircle {...iconProps} />;
      case "WeChat Logged": return <MessageCircle {...iconProps} />;
      case "WhatsApp Logged": return <MessageCircle {...iconProps} />;
      case "LinkedIn Logged": return <Linkedin {...iconProps} />;
      case "Note": return <FileText {...iconProps} />;
      case "System Update": return <RefreshCw {...iconProps} />;
      default: return <FileText {...iconProps} />;
    }
  };

  const getActivityTypeColor = (type: ActivityType) => {
    // System activities get different styling
    if (type === "System Update" || type === "Note") {
      return "bg-[var(--theme-state-hover)] text-[var(--theme-text-muted)]";
    }
    // All logged activities get completed/success styling
    return "bg-[var(--theme-bg-surface-tint)] text-[var(--theme-action-primary-bg)]";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    // Check if today
    const isToday = date.toDateString() === now.toDateString();
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const formatted = date.toLocaleDateString('en-PH', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    if (isToday) return <span className="text-[var(--theme-action-primary-bg)]">{formatted} (Today)</span>;
    if (isYesterday) return <span className="text-[var(--theme-text-muted)]">{formatted} (Yesterday)</span>;
    
    return formatted;
  };

  // Group activities by date
  const groupedActivities = sortedActivities.reduce((groups, activity) => {
    const date = new Date(activity.date).toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, Activity[]>);

  return (
    <div>
      {/* Search and Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
          <input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-surface)",
              color: "var(--neuron-ink-primary)"
            }}
          />
        </div>

        <CustomDropdown
          label=""
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as ActivityType | "All")}
          options={[
            { value: "All", label: "All Types" },
            { value: "Call Logged", label: "Call", icon: <Phone className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Email Logged", label: "Email", icon: <Mail className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Marketing Email Logged", label: "Marketing Email", icon: <Send className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Meeting Logged", label: "Meeting", icon: <Users className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "SMS Logged", label: "SMS", icon: <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Viber Logged", label: "Viber", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "WeChat Logged", label: "WeChat", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "WhatsApp Logged", label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "LinkedIn Logged", label: "LinkedIn", icon: <Linkedin className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Note", label: "Note", icon: <FileText className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "System Update", label: "System Update", icon: <RefreshCw className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> }
          ]}
        />

        <CustomDropdown
          label=""
          value={dateRangeFilter}
          onChange={(value) => setDateRangeFilter(value as "Today" | "This Week" | "This Month" | "All Time")}
          options={[
            { value: "All Time", label: "All Time", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
            { value: "Today", label: "Today", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-action-primary-bg)" }} /> },
            { value: "This Week", label: "This Week", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-status-warning-fg)" }} /> },
            { value: "This Month", label: "This Month", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} /> }
          ]}
        />
      </div>

      {/* Activities Timeline */}
      <div>
        {sortedActivities.length === 0 ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div className="px-6 py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
              <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No activities found</h3>
              <p style={{ color: "var(--neuron-ink-muted)" }}>No activities match your filters</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, activities]) => (
              <div key={date}>
                <div className="mb-3">
                  <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-action-primary-bg)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {date}
                  </h3>
                </div>
                <div className="rounded-[10px] overflow-hidden" style={{ 
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_140px_minmax(200px,1fr)_140px_100px] gap-3 px-4 py-2 border-b" style={{ 
                    backgroundColor: "var(--neuron-bg-page)",
                    borderColor: "var(--neuron-ui-divider)"
                  }}>
                    <div></div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Type</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Description</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Contact</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Owner</div>
                  </div>

                  {/* Activity Rows */}
                  <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
                    {activities.map(activity => (
                      <div
                        key={activity.id}
                        className="grid grid-cols-[32px_140px_minmax(200px,1fr)_140px_100px] gap-3 px-4 py-3 transition-colors"
                        style={{ cursor: onViewActivity ? "pointer" : "default" }}
                        onMouseEnter={(e) => {
                          if (onViewActivity) {
                            e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => onViewActivity?.(activity)}
                      >
                        <div className="flex items-center justify-center">
                          {getActivityTypeIcon(activity.type)}
                        </div>

                        <div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getActivityTypeColor(activity.type)}`}>
                            {activity.type.replace(" Logged", "")}
                          </span>
                          <div className="text-[10px] mt-1" style={{ color: "var(--neuron-ink-muted)" }}>
                            {formatDate(activity.date)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[12px] line-clamp-2" style={{ color: "var(--neuron-ink-primary)" }}>
                            {activity.description}
                          </div>
                          {activity.attachments && activity.attachments.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Paperclip size={12} style={{ color: "var(--theme-text-muted)" }} />
                              <span className="text-[11px] text-[var(--theme-text-muted)]">
                                {activity.attachments.length} {activity.attachments.length === 1 ? 'Attachment' : 'Attachments'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getLinkedEntity(activity)}
                        </div>

                        <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getOwnerName(activity.user_id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
