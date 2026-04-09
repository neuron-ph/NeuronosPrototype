import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function FormSelect({ value, options, onChange, placeholder = "Select...", disabled = false }: FormSelectProps) {
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

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption?.label || placeholder;

  return (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
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
          opacity: disabled ? 0.6 : 1
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
        <span>{displayValue}</span>
        <ChevronDown 
          size={16} 
          style={{ 
            color: "var(--neuron-ink-muted)",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
            marginLeft: "8px"
          }} 
        />
      </button>

      {/* Dropdown Menu */}
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
            maxHeight: "240px",
            overflowY: "auto"
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "13px",
                color: value === option.value ? "var(--neuron-brand-teal)" : "var(--neuron-ink-base)",
                backgroundColor: value === option.value ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
                border: "none",
                borderBottom: "1px solid var(--theme-border-subtle)",
                textAlign: "left",
                cursor: "pointer",
                transition: "background-color 0.15s ease"
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = value === option.value ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)";
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}