import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface SearchableFormSelectOption {
  value: string;
  label: string;
}

interface SearchableFormSelectProps {
  value: string;
  options: SearchableFormSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export function SearchableFormSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No options found",
  disabled = false,
}: SearchableFormSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || placeholder;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery)
    );
  }, [options, query]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setIsOpen((open) => !open);
          setQuery("");
        }}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: "13px",
          color: selectedOption ? "var(--neuron-ink-base)" : "var(--neuron-ink-muted)",
          backgroundColor: disabled ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "6px",
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          textAlign: "left",
          outline: "none",
          transition: "all 0.15s ease",
          opacity: disabled ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
          }
        }}
        disabled={disabled}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayValue}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--neuron-ink-muted)",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
            marginLeft: "8px",
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px", borderBottom: "1px solid var(--theme-border-subtle)" }}>
            <div style={{ position: "relative" }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--neuron-ink-muted)",
                  pointerEvents: "none",
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsOpen(false);
                    setQuery("");
                  }
                  if (event.key === "Enter" && filteredOptions.length > 0) {
                    event.preventDefault();
                    handleSelect(filteredOptions[0].value);
                  }
                }}
                placeholder={searchPlaceholder}
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 30px",
                  fontSize: "13px",
                  color: "var(--neuron-ink-base)",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ maxHeight: "220px", overflowY: "auto" }}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: isSelected ? "var(--neuron-brand-teal)" : "var(--neuron-ink-base)",
                      backgroundColor: isSelected ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
                      border: "none",
                      borderBottom: "1px solid var(--theme-border-subtle)",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                    onMouseEnter={(event) => {
                      if (!isSelected) {
                        event.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                      }
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = isSelected
                        ? "var(--theme-bg-surface-tint)"
                        : "var(--theme-bg-surface)";
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {option.label}
                    </span>
                    {isSelected && <Check size={13} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />}
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  padding: "12px",
                  fontSize: "12px",
                  color: "var(--theme-text-muted)",
                  textAlign: "center",
                }}
              >
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
