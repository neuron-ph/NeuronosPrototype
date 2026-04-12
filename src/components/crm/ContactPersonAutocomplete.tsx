import { useState, useEffect, useRef, useMemo } from "react";
import { Search, User, ChevronDown } from "lucide-react";
import type { Contact } from "../../types/contact";
import { useContacts } from "../../hooks/useContacts";

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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { contacts: allContacts, isLoading } = useContacts({ customerId });

  // Client-side search filtering
  const contacts = useMemo(() => {
    if (!searchQuery) return allContacts;
    const q = searchQuery.toLowerCase();
    return allContacts.filter((c: any) =>
      ((c as any).name || `${c.first_name || ""} ${c.last_name || ""}`.trim())
        .toLowerCase()
        .includes(q)
    );
  }, [allContacts, searchQuery]);

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
    const fullName = (contact as any).name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown Contact';
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
            backgroundColor: disabled ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
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
        <p style={{ color: "var(--theme-status-danger-fg)", fontSize: "12px", marginTop: "4px" }}>
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
            backgroundColor: "var(--theme-bg-surface)",
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
              backgroundColor: "var(--theme-bg-surface)",
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
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 34px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  outline: "none",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--neuron-ink-base)",
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
                    highlightedIndex === index ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                  borderBottom:
                    index < contacts.length - 1
                      ? "1px solid var(--theme-border-subtle)"
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
                  {(contact as any).name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown Contact'}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}