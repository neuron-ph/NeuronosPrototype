import { useState, useMemo } from "react";
import { Search, Plus, Mail, Phone, Building2, User, CircleDot } from "lucide-react";
import type { Contact } from "../../types/contact";
import { ContactCreationModal } from "./ContactCreationModal";
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

type View = "list" | "detail" | "builder";

interface ContactsModuleWithBackendProps {
  onViewQuotation?: (quotationId: string) => void;
  contactId?: string;
}

export function ContactsModuleWithBackend({ onViewQuotation, contactId }: ContactsModuleWithBackendProps) {
  const [view, setView] = useState<View>("list");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [quotation, setQuotation] = useState<QuotationNew | null>(null);

  const { user } = useUser();
  const queryClient = useQueryClient();
  const { contacts: allContacts, isLoading } = useContacts();

  // Client-side filtering (replaces server-side search + status filter)
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

  // Create new contact
  const handleCreateContact = async (contactData: Partial<Contact>) => {
    try {
      const newId = `contact-${Date.now()}`;
      const { error } = await supabase.from('contacts').insert({
        ...contactData,
        id: newId,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("contact", newId, contactData.name ?? newId, _actor);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
      setIsCreating(false);
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

  // View contact detail — use the already-fetched contact object directly
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
          // customer_id will need to be looked up from the customer database
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
          padding: "32px 48px 24px 48px",
          borderBottom: "1px solid var(--neuron-ui-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)",
                marginBottom: "4px",
              }}
            >
              Contacts
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--neuron-ink-muted)",
                margin: 0,
              }}
            >
              Manage your contacts and customers
            </p>
          </div>

          <button
            onClick={() => setIsCreating(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor: "var(--neuron-brand-green)",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#0F544A";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                "var(--neuron-brand-green)";
            }}
          >
            <Plus size={18} />
            Add Contact
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={18}
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
                padding: "10px 12px 10px 40px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor =
                  "var(--neuron-brand-green)";
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
              { value: "All Statuses", label: "All Statuses", icon: <CircleDot size={16} /> },
              { value: "Lead", label: "Lead", icon: <CircleDot size={16} style={{ color: "var(--theme-text-muted)" }} /> },
              { value: "Prospect", label: "Prospect", icon: <CircleDot size={16} style={{ color: "#F59E0B" }} /> },
              { value: "MQL", label: "MQL", icon: <CircleDot size={16} style={{ color: "#3B82F6" }} /> },
              { value: "Customer", label: "Customer", icon: <CircleDot size={16} style={{ color: "#10B981" }} /> }
            ]}
            placeholder="Filter by status"
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 48px" }}>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              color: "var(--neuron-ink-muted)",
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
              padding: "60px 20px",
              color: "var(--neuron-ink-muted)",
            }}
          >
            <User size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
            <p style={{ fontSize: "16px", fontWeight: 500 }}>
              No contacts found
            </p>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>
              {searchQuery || statusFilter !== "All Statuses"
                ? "Try adjusting your filters"
                : "Add your first contact to get started"}
            </p>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            {/* Table Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1.5fr 1fr 1fr",
                gap: "16px",
                padding: "12px 24px",
                backgroundColor: "transparent",
                borderBottom: "1px solid var(--theme-border-default)",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
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
                    padding: "16px 24px",
                    backgroundColor: index % 2 === 0 ? "var(--theme-bg-surface)" : "var(--neuron-pill-inactive-bg)",
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      index % 2 === 0 ? "var(--theme-bg-surface)" : "var(--neuron-pill-inactive-bg)";
                  }}
                >
                  {/* Name */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <User size={16} style={{ color: "var(--neuron-brand-green)" }} />
                    </div>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--neuron-ink-primary)",
                      }}
                    >
                      {contact.name}
                    </span>
                  </div>

                  {/* Company */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "14px",
                        color: "var(--neuron-ink-secondary)",
                      }}
                    >
                      {contact.company}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Mail size={12} style={{ color: "var(--neuron-ink-muted)" }} />
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--neuron-ink-secondary)",
                        }}
                      >
                        {contact.email}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Phone size={12} style={{ color: "var(--neuron-ink-muted)" }} />
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--neuron-ink-secondary)",
                        }}
                      >
                        {contact.phone}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        backgroundColor: statusColors.bg,
                        color: statusColors.text,
                        fontSize: "12px",
                        fontWeight: 500,
                      }}
                    >
                      {contact.status}
                    </span>
                  </div>

                  {/* Last Activity */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--neuron-ink-muted)",
                      }}
                    >
                      {formatDate(contact.last_activity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isCreating && (
        <ContactCreationModal
          onClose={() => setIsCreating(false)}
          onSave={handleCreateContact}
        />
      )}
    </div>
  );
}