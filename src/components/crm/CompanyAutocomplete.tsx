import { useState, useEffect, useRef } from "react";
import { Search, Plus, Building2, ChevronDown } from "lucide-react";
import type { Customer } from "../../types/bd";
import { apiFetch } from "../../utils/api";

interface CompanyAutocompleteProps {
  value: string; // company_name
  companyId?: string; // customer_id
  onChange: (companyName: string, companyId: string) => void;
  placeholder?: string;
  error?: string;
}

export function CompanyAutocomplete({
  value,
  companyId,
  onChange,
  placeholder = "Select company...",
  error,
}: CompanyAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch customers from backend
  const fetchCustomers = async (search: string = "") => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) {
        params.append("search", search);
      }

      const response = await apiFetch(`/customers?${params.toString()}`);
      const result = await response.json();
      if (result.success) {
        setCustomers(result.data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch customers when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchCustomers(searchQuery);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchCustomers(searchQuery);
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

  const handleSelect = (customer: Customer) => {
    // Backend uses 'name' field consistently
    const displayName = customer.name || '';
    onChange(displayName, customer.id);
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
          prev < customers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (customers[highlightedIndex]) {
          handleSelect(customers[highlightedIndex]);
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
                placeholder="Search companies..."
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
          {!isLoading && customers.length === 0 && (
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
                  ? "No companies found"
                  : "No companies available"}
              </p>
            </div>
          )}

          {/* Customer List - NAMES ONLY */}
          {!isLoading &&
            customers.map((customer, index) => (
              <div
                key={customer.id}
                onClick={() => handleSelect(customer)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  backgroundColor:
                    highlightedIndex === index ? "#F3F4F6" : "white",
                  borderBottom:
                    index < customers.length - 1
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
                  {customer.name}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}