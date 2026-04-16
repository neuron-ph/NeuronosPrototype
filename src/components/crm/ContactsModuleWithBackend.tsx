import { useState, useMemo } from "react";
import { Search, Plus, Mail, Phone, User, CircleDot } from "lucide-react";
import type { Contact } from "../../types/contact";
import { ContactDetailView } from "./ContactDetailView";
import { QuotationBuilderV3 } from "../pricing/quotations/QuotationBuilderV3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logActivity, logCreation } from "../../utils/activityLog";
import { toast } from "../ui/toast-utils";
import type { QuotationNew } from "../../types/pricing";
import { CustomDropdown } from "../bd/CustomDropdown";
import { useContacts } from "../../hooks/useContacts";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { AddContactPanel } from "../bd/AddContactPanel";
import { useBreakpoint } from "../../hooks/useBreakpoint";

type View = "list" | "detail" | "builder";

interface ContactsModuleWithBackendProps {
  onViewQuotation?: (quotationId: string) => void;
  contactId?: string;
}

export function ContactsModuleWithBackend({ onViewQuotation, contactId }: ContactsModuleWithBackendProps) {
  const [view, setView] = useState<View>("list");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [quotation, setQuotation] = useState<QuotationNew | null>(null);

  const { user } = useUser();
  const queryClient = useQueryClient();
  const { contacts: allContacts, isLoading } = useContacts();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;

  // Client-side filtering
  const contacts = useMemo(() => {
    return allContacts.filter((c: any) => {
      if (statusFilter !== "All Statuses" && c.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = ((c.first_name || "") + " " + (c.last_name || "")).toLowerCase();
        if (!name.includes(q) && !(c.email || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allContacts, statusFilter, searchQuery]);

  // Handle contactId prop - look up from cache or fetch once
  const [_contactIdHandled, setContactIdHandled] = useState(false);
  if (contactId && !_contactIdHandled) {
    setContactIdHandled(true);
    supabase.from('contacts').select('*').eq('id', contactId).maybeSingle().then(({ data, error }) => {
      if (!error && data) {
        setSelectedContact(data);
        setView("detail");
      } else {
        toast.error("Contact not found");
      }
    });
  }

  // Create new contact — adapts AddContactPanel's data format to the contacts table
  const handleCreateContact = async (contactData: any) => {
    try {
      const newId = `contact-${Date.now()}`;
      const firstName = contactData.first_name || "";
      const lastName = contactData.last_name || "";
      const transformedData = {
        name: `${firstName} ${lastName}`.trim() || contactData.name || "Contact",
        first_name: firstName || null,
        last_name: lastName || null,
        title: contactData.title || null,
        email: contactData.email || null,
        phone: contactData.phone || null,
        customer_id: contactData.customer_id || null,
        owner_id: contactData.owner_id || null,
        lifecycle_stage: contactData.lifecycle_stage || "Lead",
        lead_status: contactData.lead_status || "New",
        notes: contactData.notes || null,
        created_by: user?.id ?? null,
      };

      const { error } = await supabase.from('contacts').insert({
        ...transformedData,
        id: newId,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("contact", newId, transformedData.name, _actor);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      setIsAddContactOpen(false);
    } catch (error) {
      console.error("Error creating contact:", error);
      throw error;
    }
  };

  // Update contact
  const handleUpdateContact = async (id: string, updates: Partial<Contact>) => {
    try {
      const { error } = await supabase.from('contacts').update(updates).eq('id', id);
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logActivity("contact", id, updates.name ?? selectedContact?.name ?? id, "updated", _actor);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      if (selectedContact && selectedContact.id === id) {
        setSelectedContact({ ...selectedContact, ...updates });
      }
    } catch (error) {
      console.error("Error updating contact:", error);
      throw error;
    }
  };

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setView("detail");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Customer":
        return { bg: "var(--theme-status-success-bg)", text: "var(--theme-status-success-fg)" };
      case "MQL":
        return { bg: "var(--neuron-semantic-info-bg)", text: "var(--neuron-semantic-info)" };
      case "Prospect":
        return { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" };
      case "Lead":
        return { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)" };
      default:
        return { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)" };
    }
  };

  // Show detail view
  if (view === "detail" && selectedContact) {
    return (
      <ContactDetailView
        contact={selectedContact}
        onBack={() => {
          setView("list");
          setSelectedContact(null);
        }}
        onUpdate={handleUpdateContact}
        onViewQuotation={onViewQuotation}
        onCreateInquiry={() => {
          setView("builder");
        }}
      />
    );
  }

  // Show builder view
  if (view === "builder" && selectedContact) {
    return (
      <QuotationBuilderV3
        onClose={() => {
          setView("detail");
        }}
        onSave={async (newQuotation) => {
          try {
            const newQId = `quot-${Date.now()}`;
            const { error } = await supabase.from('quotations').insert({
              ...newQuotation,
              id: newQId,
              created_at: new Date().toISOString(),
            });

            if (error) throw error;
            const _actorQ = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
            logCreation("quotation", newQId, (newQuotation as any).quotation_number ?? newQId, _actorQ);
            toast.success("Inquiry created successfully!");
            queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
            setView("detail");
          } catch (error) {
            console.error("Error creating quotation:", error);
            toast.error("Failed to create inquiry");
          }
        }}
        builderMode="inquiry"
        initialData={{
          contact_person_name: selectedContact.name,
          contact_person_id: selectedContact.id,
          customer_name: selectedContact.company,
        }}
      />
    );
  }

  // Show list view
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: isMobile ? "16px 16px 16px 16px" : "32px 48px 24px 48px",
          borderBottom: "1px solid var(--neuron-ui-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: isMobile ? "16px" : "24px",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: isMobile ? "22px" : "28px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)",
                marginBottom: "4px",
                letterSpacing: "-0.8px",
                lineHeight: 1.2,
              }}
            >
              Contacts
            </h1>
            <p
              style={{
                fontSize: "13px",
                color: "var(--neuron-ink-muted)",
                margin: 0,
              }}
            >
              Manage your contacts and customers
            </p>
          </div>

          <button
            onClick={() => setIsAddContactOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              height: "40px",
              padding: "0 20px",
              backgroundColor: "var(--neuron-brand-green)",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#0F544A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
            }}
          >
            <Plus size={16} />
            Add Contact
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--neuron-ink-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px 9px 38px",
                border: "1.5px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                fontSize: "13px",
                color: "var(--neuron-ink-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              }}
            />
          </div>

          {/* Status Filter */}
          <CustomDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "All Statuses", label: "All Statuses", icon: <CircleDot size={14} /> },
              { value: "Lead", label: "Lead", icon: <CircleDot size={14} style={{ color: "var(--theme-text-muted)" }} /> },
              { value: "Prospect", label: "Prospect", icon: <CircleDot size={14} style={{ color: "#F59E0B" }} /> },
              { value: "MQL", label: "MQL", icon: <CircleDot size={14} style={{ color: "#3B82F6" }} /> },
              { value: "Customer", label: "Customer", icon: <CircleDot size={14} style={{ color: "#10B981" }} /> }
            ]}
            placeholder="Filter by status"
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px" : "24px 48px" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              color: "var(--neuron-ink-muted)",
              fontSize: "13px",
            }}
          >
            Loading contacts...
          </div>
        ) : contacts.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 20px",
              color: "var(--neuron-ink-muted)",
            }}
          >
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "var(--theme-bg-surface-tint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}>
              <User size={20} style={{ color: "var(--neuron-brand-green)" }} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: "0 0 6px 0" }}>
              {searchQuery || statusFilter !== "All Statuses" ? "No contacts match your filters" : "No contacts yet"}
            </p>
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>
              {searchQuery || statusFilter !== "All Statuses"
                ? "Try adjusting your search or filters"
                : "Add your first contact to start building your pipeline"}
            </p>
          </div>
        ) : (
          <div
            style={{
              border: "1.5px solid var(--theme-border-default)",
              borderRadius: "10px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            {isCompact ? (
              // ── Mobile / tablet: vertical card list ────────────────
              contacts.map((contact, index) => {
                const statusColors = getStatusColor(contact.status);
                return (
                  <div
                    key={contact.id}
                    onClick={() => handleViewContact(contact)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "14px 16px",
                      borderBottom: index < contacts.length - 1 ? "1px solid var(--theme-border-default)" : "none",
                      cursor: "pointer",
                      transition: "background-color 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
                      backgroundColor: "var(--theme-bg-surface-tint)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "14px", fontWeight: 700, color: "var(--neuron-brand-green)",
                    }}>
                      {(contact.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neuron-ink-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: contact.company ? "2px" : 0 }}>
                        {contact.name}
                      </div>
                      {contact.company && (
                        <div style={{ fontSize: "12px", color: "var(--neuron-ink-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {contact.company}
                        </div>
                      )}
                    </div>
                    <span style={{
                      padding: "3px 9px", borderRadius: "4px", flexShrink: 0,
                      backgroundColor: statusColors.bg, color: statusColors.text,
                      fontSize: "11px", fontWeight: 600,
                    }}>
                      {contact.status}
                    </span>
                  </div>
                );
              })
            ) : (
              // ── Desktop: grid table ────────────────────────────────
              <>
                {/* Table Header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 2fr 1.5fr 1fr 1fr",
                  gap: "16px",
                  padding: "10px 24px",
                  borderBottom: "1px solid var(--theme-border-default)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--theme-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}>
                  <div>Name</div>
                  <div>Company</div>
                  <div>Contact Info</div>
                  <div>Status</div>
                  <div>Last Activity</div>
                </div>

                {/* Table Rows */}
                {contacts.map((contact, index) => {
                  const statusColors = getStatusColor(contact.status);
                  return (
                    <div
                      key={contact.id}
                      onClick={() => handleViewContact(contact)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 2fr 1.5fr 1fr 1fr",
                        gap: "16px",
                        padding: "14px 24px",
                        borderBottom: index < contacts.length - 1 ? "1px solid var(--theme-border-default)" : "none",
                        cursor: "pointer",
                        transition: "background-color 0.1s",
                        backgroundColor: "transparent",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                          backgroundColor: "var(--theme-bg-surface-tint)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700, color: "var(--neuron-brand-green)", letterSpacing: "0.02em",
                        }}>
                          {(contact.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)" }}>
                          {contact.name}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "var(--neuron-ink-secondary)" }}>
                          {contact.company || "—"}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", justifyContent: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Mail size={11} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", color: "var(--neuron-ink-secondary)" }}>{contact.email || "—"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Phone size={11} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", color: "var(--neuron-ink-secondary)" }}>{contact.phone || "—"}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{
                          padding: "3px 9px", borderRadius: "4px",
                          backgroundColor: statusColors.bg, color: statusColors.text,
                          fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em",
                        }}>
                          {contact.status}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                          {contact.last_activity ? formatDate(contact.last_activity) : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Contact Side Panel */}
      <AddContactPanel
        isOpen={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        onSave={handleCreateContact}
      />
    </div>
  );
}
