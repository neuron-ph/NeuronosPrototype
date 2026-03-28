import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check } from "lucide-react";

interface MultiSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface MultiSelectDropdownProps {
  label?: string;
  values: string[];
  options: MultiSelectOption[] | string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function MultiSelectDropdown({ 
  label, 
  values, 
  options, 
  onChange, 
  placeholder = "Select..." 
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Normalize options to always be MultiSelectOption[]
  const normalizedOptions: MultiSelectOption[] = options.map(opt => 
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const toggleOption = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onChange(values.filter(v => v !== optionValue));
    } else {
      onChange([...values, optionValue]);
    }
  };

  const removeValue = (valueToRemove: string) => {
    onChange(values.filter(v => v !== valueToRemove));
  };

  const getDisplayText = () => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      const option = normalizedOptions.find(opt => opt.value === values[0]);
      return option?.label || values[0];
    }
    return `${values.length} selected`;
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
      {/* Label */}
      {label && (
        <label style={{ 
          display: "block", 
          fontSize: "11px", 
          fontWeight: 600, 
          color: "var(--theme-text-muted)",
          marginBottom: "6px",
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          {label}
        </label>
      )}

      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: values.length > 0 ? "6px 12px" : "10px 12px",
          borderRadius: "8px",
          fontSize: "14px",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-surface)",
          color: values.length === 0 ? "#98A2B3" : "#12332B",
          cursor: "pointer",
          minHeight: "40px",
          flexWrap: "wrap",
          gap: "4px"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
        }}
      >
        {values.length === 0 ? (
          <span>{placeholder}</span>
        ) : values.length <= 2 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", flex: 1 }}>
            {values.map(value => {
              const option = normalizedOptions.find(opt => opt.value === value);
              return (
                <span
                  key={value}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 8px",
                    backgroundColor: "var(--theme-bg-surface-tint)",
                    color: "var(--theme-action-primary-bg)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 500
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeValue(value);
                  }}
                >
                  {option?.label || value}
                  <X size={12} />
                </span>
              );
            })}
          </div>
        ) : (
          <span>{values.length} selected</span>
        )}
        <ChevronDown 
          size={16} 
          style={{ 
            color: "var(--theme-text-muted)",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0
          }} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "4px",
            borderRadius: "8px",
            overflow: "hidden",
            zIndex: 50,
            width: "100%",
            maxHeight: "240px",
            overflowY: "auto",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
          }}
        >
          {normalizedOptions.map((option, index) => {
            const isSelected = values.includes(option.value);
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  fontSize: "14px",
                  transition: "background-color 0.15s ease",
                  backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                  color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                  borderBottom: index < normalizedOptions.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  border: "none",
                  gap: "8px"
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {option.icon && <span style={{ display: "flex", alignItems: "center" }}>{option.icon}</span>}
                  <span>{option.label}</span>
                </div>
                {isSelected && <Check size={16} style={{ color: "var(--theme-action-primary-bg)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}