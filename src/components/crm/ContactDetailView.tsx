import { ArrowLeft, Mail, Phone, Building2, FileText, Edit2, Save, X, Plus } from "lucide-react";
import { useState } from "react";
import type { Contact } from "../../types/contact";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { usePermission } from "../../context/PermissionProvider";

interface ContactDetailViewProps {
  contact: Contact;
  onBack: () => void;
  onUpdate: (id: string, updates: Partial<Contact>) => Promise<void>;
  onViewQuotation?: (quotationId: string) => void;
  onCreateInquiry?: () => void;
}

export function ContactDetailView({ contact, onBack, onUpdate, onViewQuotation, onCreateInquiry }: ContactDetailViewProps) {
  const { can } = usePermission();

  const canActivities  = can("bd_contacts_activities_tab", "view");
  const canTasks       = can("bd_contacts_tasks_tab", "view");
  const canInquiries   = can("bd_contacts_inquiries_tab", "view");
  const canAttachments = can("bd_contacts_attachments_tab", "view");
  const canComments    = can("bd_contacts_comments_tab", "view");

  const defaultContactTab: "activities" | "tasks" | "inquiries" | "attachments" | "comments" =
    canInquiries   ? "inquiries" :
    canActivities  ? "activities" :
    canTasks       ? "tasks" :
    canAttachments ? "attachments" :
    canComments    ? "comments" :
    "inquiries";

  const [activeTab, setActiveTab] = useState<"activities" | "tasks" | "inquiries" | "attachments" | "comments">(defaultContactTab);
  const [isEditing, setIsEditing] = useState(false);
  const { isMobile } = useBreakpoint();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    status: contact.status,
    notes: contact.notes || ""
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(contact.id, formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating contact:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      status: contact.status,
      notes: contact.notes || ""
    });
    setIsEditing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Customer": return { bg: "var(--theme-status-success-bg)", text: "var(--theme-status-success-fg)" };
      case "MQL": return { bg: "var(--neuron-semantic-info-bg)", text: "var(--neuron-semantic-info)" };
      case "Prospect": return { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" };
      case "Lead": return { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)" };
      default: return { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)" };
    }
  };

  const statusColors = getStatusColor(isEditing ? formData.status : contact.status);

  const tabs = [
    { id: "activities" as const, label: "Activities" },
    { id: "tasks" as const, label: "Tasks" },
    { id: "inquiries" as const, label: "Inquiries" },
    { id: "attachments" as const, label: "Attachments" },
    { id: "comments" as const, label: "Comments" }
  ];

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100%",
      backgroundColor: "var(--theme-bg-surface)"
    }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? "16px 16px 0" : "32px 48px 0",
        borderBottom: "1px solid var(--neuron-ui-border)",
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-secondary)",
            marginBottom: isMobile ? "16px" : "24px",
            padding: "4px 0",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--neuron-brand-green)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--neuron-ink-secondary)";
          }}
        >
          <ArrowLeft size={16} />
          Back to Contacts
        </button>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: isMobile ? "20px" : "32px",
          gap: "12px",
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{
                  fontSize: isMobile ? "22px" : "28px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-primary)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  width: "100%",
                  maxWidth: "500px",
                  outline: "none",
                }}
              />
            ) : (
              <h1 style={{
                fontSize: isMobile ? "22px" : "28px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)",
                marginBottom: "4px",
                lineHeight: 1.2,
              }}>
                {contact.name}
              </h1>
            )}
            
            <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
              {isEditing ? (
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Contact["status"] })}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: statusColors.bg,
                    color: statusColors.text,
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                    textTransform: "uppercase"
                  }}
                >
                  <option value="Lead">Lead</option>
                  <option value="Prospect">Prospect</option>
                  <option value="MQL">MQL</option>
                  <option value="Customer">Customer</option>
                </select>
              ) : (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: statusColors.bg,
                    color: statusColors.text,
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase"
                  }}
                >
                  {contact.status}
                </span>
              )}
            </div>

            {isEditing ? (
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                style={{
                  fontSize: "14px",
                  color: "var(--neuron-ink-secondary)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  outline: "none",
                  marginBottom: "8px"
                }}
              />
            ) : (
              <p style={{ fontSize: "14px", color: "var(--neuron-ink-secondary)", margin: "0 0 8px 0" }}>
                {contact.company}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-secondary)",
                    backgroundColor: "var(--theme-bg-surface)",
                    cursor: "pointer"
                  }}
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    backgroundColor: isSaving ? "#9CA3AF" : "var(--neuron-brand-green)",
                    cursor: isSaving ? "not-allowed" : "pointer"
                  }}
                >
                  <Save size={16} />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-secondary)",
                  backgroundColor: "var(--theme-bg-surface)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                }}
              >
                <Edit2 size={16} />
                Update Details
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: isMobile ? "20px" : "32px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          overflowX: isMobile ? "auto" : "visible",
          scrollbarWidth: "none",
        }}>
          {tabs.filter((tab) => {
            if (tab.id === "activities")  return canActivities;
            if (tab.id === "tasks")       return canTasks;
            if (tab.id === "inquiries")   return canInquiries;
            if (tab.id === "attachments") return canAttachments;
            if (tab.id === "comments")    return canComments;
            return true;
          }).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 0",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--neuron-brand-teal)" : "2px solid transparent",
                fontSize: "14px",
                fontWeight: 500,
                color: activeTab === tab.id ? "var(--neuron-brand-teal)" : "var(--neuron-ink-muted)",
                cursor: "pointer",
                transition: "all 0.2s",
                marginBottom: "-1px"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = "var(--neuron-ink-muted)";
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: isMobile ? "16px" : "32px 48px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
            gap: isMobile ? "24px" : "32px",
          }}>
            {/* Left Column - Tab Content */}
            <div>
              {activeTab === "inquiries" && canInquiries && (
                <>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "24px"
                  }}>
                    <h2 style={{ 
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "var(--neuron-ink-primary)",
                      margin: 0
                    }}>
                      Inquiries
                    </h2>
                    
                    {onCreateInquiry && (
                      <button
                        onClick={onCreateInquiry}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 16px",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "white",
                          backgroundColor: "var(--neuron-brand-green)",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-brand-teal)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
                        }}
                      >
                        <Plus size={16} />
                        Create Inquiry
                      </button>
                    )}
                  </div>

                  {contact.quotations && contact.quotations.length > 0 ? (
                    <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: "8px", overflow: "hidden" }}>
                      {/* Table Header */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1.5fr 1.5fr 1fr 1.5fr 1fr",
                        gap: "16px",
                        padding: "12px 16px",
                        backgroundColor: "var(--theme-bg-page)",
                        borderBottom: "1px solid var(--neuron-ui-border)"
                      }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase" }}>
                          INQUIRY #
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase" }}>
                          SERVICES
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase" }}>
                          MOVEMENT
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase" }}>
                          ROUTE
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase" }}>
                          CREATED
                        </div>
                      </div>

                      {/* Table Rows */}
                      {contact.quotations.map((quotation: any) => (
                        <div
                          key={quotation.id}
                          onClick={() => onViewQuotation?.(quotation.id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.5fr 1.5fr 1fr 1.5fr 1fr",
                            gap: "16px",
                            padding: "16px",
                            borderBottom: "1px solid var(--neuron-ui-border)",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                          }}
                        >
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-brand-teal)" }}>
                            {quotation.quote_number}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--neuron-ink-primary)" }}>
                            {quotation.services?.join(", ") || "—"}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--neuron-ink-primary)" }}>
                            {quotation.movement || "—"}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--neuron-ink-primary)" }}>
                            {quotation.origin && quotation.destination 
                              ? `${quotation.origin} → ${quotation.destination}` 
                              : "—"}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--neuron-ink-secondary)" }}>
                            {formatDate(quotation.created_date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      padding: "64px 24px",
                      textAlign: "center",
                      border: "1px dashed var(--neuron-ui-border)",
                      borderRadius: "8px",
                      color: "var(--neuron-ink-muted)"
                    }}>
                      <FileText size={48} style={{ opacity: 0.2, marginBottom: "16px" }} />
                      <p style={{ fontSize: "14px", margin: "0 0 4px 0", color: "var(--neuron-ink-primary)" }}>
                        No inquiries yet
                      </p>
                      <p style={{ fontSize: "13px", margin: 0 }}>
                        Inquiries from E-Quotation system will appear here
                      </p>
                    </div>
                  )}
                </>
              )}

              {activeTab === "activities" && canActivities && (
                <div style={{
                  padding: "56px 24px",
                  textAlign: "center",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  color: "var(--neuron-ink-muted)",
                }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 4px 0" }}>
                    No activities logged
                  </p>
                  <p style={{ fontSize: "12px", margin: 0 }}>
                    Calls, emails, and meetings with this contact will appear here
                  </p>
                </div>
              )}

              {activeTab === "tasks" && canTasks && (
                <div style={{
                  padding: "56px 24px",
                  textAlign: "center",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  color: "var(--neuron-ink-muted)",
                }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 4px 0" }}>
                    No open tasks
                  </p>
                  <p style={{ fontSize: "12px", margin: 0 }}>
                    Follow-up tasks assigned to this contact will appear here
                  </p>
                </div>
              )}

              {activeTab === "attachments" && canAttachments && (
                <div style={{
                  padding: "56px 24px",
                  textAlign: "center",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  color: "var(--neuron-ink-muted)",
                }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 4px 0" }}>
                    No attachments
                  </p>
                  <p style={{ fontSize: "12px", margin: 0 }}>
                    Documents shared with or from this contact will be stored here
                  </p>
                </div>
              )}

              {activeTab === "comments" && canComments && (
                <div style={{
                  padding: "56px 24px",
                  textAlign: "center",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px",
                  color: "var(--neuron-ink-muted)",
                }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 4px 0" }}>
                    No comments yet
                  </p>
                  <p style={{ fontSize: "12px", margin: 0 }}>
                    Internal notes about this contact will appear here
                  </p>
                </div>
              )}
            </div>

            {/* Right Column - Contact Details */}
            <div>
              <h2 style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--neuron-ink-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                marginBottom: "20px",
              }}>
                Contact Details
              </h2>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* First Name */}
                <div style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--neuron-ui-border)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>First Name</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={(formData.name ?? "").split(" ")[0] || ""}
                      onChange={(e) => {
                        const lastName = (formData.name ?? "").split(" ").slice(1).join(" ");
                        setFormData({ ...formData, name: `${e.target.value} ${lastName}`.trim() });
                      }}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        fontSize: "13px",
                        outline: "none",
                        color: "var(--neuron-ink-primary)",
                        backgroundColor: "var(--theme-bg-surface)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                    />
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                      {(contact.name ?? "").split(" ")[0] || "—"}
                    </span>
                  )}
                </div>

                {/* Last Name */}
                <div style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--neuron-ui-border)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>Last Name</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={(formData.name ?? "").split(" ").slice(1).join(" ") || ""}
                      onChange={(e) => {
                        const firstName = (formData.name ?? "").split(" ")[0];
                        setFormData({ ...formData, name: `${firstName} ${e.target.value}`.trim() });
                      }}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        fontSize: "13px",
                        outline: "none",
                        color: "var(--neuron-ink-primary)",
                        backgroundColor: "var(--theme-bg-surface)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                    />
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                      {(contact.name ?? "").split(" ").slice(1).join(" ") || "—"}
                    </span>
                  )}
                </div>

                {/* Email */}
                <div style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--neuron-ui-border)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", gap: "5px" }}>
                    <Mail size={12} />
                    Email
                  </span>
                  {isEditing ? (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        fontSize: "13px",
                        outline: "none",
                        color: "var(--neuron-ink-primary)",
                        backgroundColor: "var(--theme-bg-surface)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                    />
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                      {contact.email || "—"}
                    </span>
                  )}
                </div>

                {/* Phone */}
                <div style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--neuron-ui-border)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", gap: "5px" }}>
                    <Phone size={12} />
                    Mobile
                  </span>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        fontSize: "13px",
                        outline: "none",
                        color: "var(--neuron-ink-primary)",
                        backgroundColor: "var(--theme-bg-surface)",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
                    />
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                      {contact.phone || "—"}
                    </span>
                  )}
                </div>

                {/* Company */}
                <div style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--neuron-ui-border)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", gap: "5px" }}>
                    <Building2 size={12} />
                    Company
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                    {contact.company || "—"}
                  </span>
                </div>

                {/* Lifecycle Stage */}
                <div style={{
                  padding: "14px 0",
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>Stage</span>
                  <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)", fontWeight: 500 }}>
                    {contact.status || "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
