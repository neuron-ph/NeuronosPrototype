import { useState, useEffect, useRef } from "react";
import { Search, User, ChevronDown } from "lucide-react";
import type { Contact } from "../../types/contact";
import { apiFetch } from "../../utils/api";

interface ContactPersonAutocompleteProps {
  value: string; // contact_name
  contactId?: string; // contact_id
  customerId?: string; // ✅ Filter by customer_id instead of company name
  onChange: (contactName: string, contactId: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export function ContactPersonAutocomplete({
  value,
  contactId,
  customerId,
  onChange,
  placeholder = "Select contact person...",
  error,
  disabled = false,
}: ContactPersonAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch contacts from backend, filtered by customer_id
  const fetchContacts = async (search: string = "", customer_id?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.append("search", search);
      }
      // ✅ Filter by customer_id on backend
      if (customer_id) {
        params.append("customer_id", customer_id);
      }

      const response = await apiFetch(`/contacts?${params.toString()}`);
      const result = await response.json();
      if (result.success) {
        // Backend already filtered by customer_id
        setContacts(result.data);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch contacts when dropdown opens or customerId changes
  useEffect(() => {
    if (isOpen) {
      fetchContacts(searchQuery, customerId);
    }
  }, [isOpen, customerId]);

  // Debounced search
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchContacts(searchQuery, customerId); // ✅ Pass customerId to debounced search too
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
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    onChange(fullName, contact.id);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
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
            if (!disabled) {
              setIsOpen(true);
              setSearchQuery("");
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Select a customer first..." : placeholder}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "10px 40px 10px 14px",
            border: `1px solid ${error ? "#EF4444" : "var(--neuron-ui-border)"}`,
            borderRadius: "8px",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.2s",
            backgroundColor: disabled ? "#F9FAFB" : "white",
            cursor: disabled ? "not-allowed" : "text",
            opacity: disabled ? 0.6 : 1,
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
      {isOpen && !disabled && (
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
                placeholder="Search contacts..."
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
              <User
                size={32}
                style={{ opacity: 0.3, marginBottom: "8px" }}
              />
              <p style={{ margin: 0 }}>
                {customerId
                  ? `No contacts found for customer ${customerId}`
                  : searchQuery
                  ? "No contacts found"
                  : "No contacts available"}
              </p>
            </div>
          )}

          {/* Contact List - NAMES ONLY */}
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
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                  }}
                >
                  {`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}