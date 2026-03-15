import { useState, useEffect, useRef } from "react";
import { Search, Plus, Building2, ChevronDown } from "lucide-react";
import type { Contact } from "../../types/contact";
import { apiFetch } from "../../utils/api";

interface CustomerAutocompleteProps {
  value: string; // customer_name
  customerId?: string; // customer_id
  onChange: (customerName: string, customerId: string) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  error?: string;
}

export function CustomerAutocomplete({
  value,
  customerId,
  onChange,
  onCreateNew,
  placeholder = "Select or search customer...",
  error,
}: CustomerAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch contacts from backend
  const fetchContacts = async (search: string = "") => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.append("search", search);
      }

      const response = await apiFetch(`/contacts?${params.toString()}`);

      const result = await response.json();
      if (result.success) {
        setContacts(result.data);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch contacts when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchContacts(searchQuery);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchContacts(searchQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (contact: Contact) => {
    onChange(contact.name, contact.id);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < contacts.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (contacts[highlightedIndex]) {
          handleSelect(contacts[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
        break;
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {/* Input Field */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : value || ""}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: "10px 40px 10px 14px",
            border: `1px solid ${error ? "#EF4444" : "var(--neuron-ui-border)"}`,
            borderRadius: "8px",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.2s",
            backgroundColor: "white",
            cursor: "text",
          }}
        />
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            right: "14px",
            top: "50%",
            transform: `translateY(-50%) ${isOpen ? "rotate(180deg)" : ""}`,
            color: "var(--neuron-ink-muted)",
            pointerEvents: "none",
            transition: "transform 0.2s",
          }}
        />
      </div>

      {error && (
        <p style={{ color: "#EF4444", fontSize: "12px", marginTop: "4px" }}>
          {error}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "white",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            maxHeight: "320px",
            overflow: "auto",
            zIndex: 1000,
          }}
        >
          {/* Search Header */}
          <div
            style={{
              padding: "12px",
              borderBottom: "1px solid var(--neuron-ui-border)",
              position: "sticky",
              top: 0,
              backgroundColor: "white",
              zIndex: 1,
            }}
          >
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--neuron-ink-muted)",
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 34px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                }}
              />
            </div>
          </div>

          {/* Create New Option */}
          {onCreateNew && (
            <button
              onClick={() => {
                setIsOpen(false);
                onCreateNew();
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                border: "none",
                borderBottom: "1px solid var(--neuron-ui-border)",
                backgroundColor: "#F9FAFB",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                textAlign: "left",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F3F4F6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#F9FAFB";
              }}
            >
              <Plus size={16} />
              Create New Customer
            </button>
          )}

          {/* Loading State */}
          {isLoading && (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                fontSize: "13px",
                color: "var(--neuron-ink-muted)",
              }}
            >
              Loading...
            </div>
          )}

          {/* Empty State */}
          {!isLoading && contacts.length === 0 && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontSize: "13px",
                color: "var(--neuron-ink-muted)",
              }}
            >
              <Building2
                size={32}
                style={{ opacity: 0.3, marginBottom: "8px" }}
              />
              <p style={{ margin: 0 }}>
                {searchQuery
                  ? "No customers found"
                  : "No customers available"}
              </p>
            </div>
          )}

          {/* Contact List */}
          {!isLoading &&
            contacts.map((contact, index) => (
              <div
                key={contact.id}
                onClick={() => handleSelect(contact)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  backgroundColor:
                    highlightedIndex === index ? "#F3F4F6" : "white",
                  borderBottom:
                    index < contacts.length - 1
                      ? "1px solid #F3F4F6"
                      : "none",
                  transition: "background-color 0.1s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      backgroundColor: "#E8F4F3",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Building2
                      size={18}
                      style={{ color: "var(--neuron-brand-green)" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--neuron-ink-primary)",
                        marginBottom: "2px",
                      }}
                    >
                      {contact.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--neuron-ink-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span>{contact.company}</span>
                      {contact.email && (
                        <>
                          <span style={{ opacity: 0.5 }}>•</span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {contact.email}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        backgroundColor:
                          contact.status === "Customer"
                            ? "#D1FAE5"
                            : "#F3F4F6",
                        color:
                          contact.status === "Customer" ? "#10B981" : "#6B7280",
                        fontSize: "11px",
                        fontWeight: 500,
                      }}
                    >
                      {contact.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}