import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface CustomSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}

export function CustomSelect({ 
  id, 
  value, 
  onChange, 
  options, 
  placeholder = "Select...",
  required = false 
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] flex items-center justify-between transition-colors"
        style={{
          border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-surface)",
          color: value ? "var(--neuron-ink-primary)" : "var(--theme-text-muted)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
        }}
        onBlur={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
          }
        }}
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown 
          size={16} 
          style={{ 
            color: "var(--neuron-ink-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease"
          }} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            maxHeight: "240px",
            overflowY: "auto",
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
              className="w-full px-3.5 py-2.5 text-left text-[13px] transition-colors"
              style={{
                backgroundColor: value === option.value ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                color: value === option.value ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-primary)",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = "var(--theme-state-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (value !== option.value) {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                } else {
                  e.currentTarget.style.backgroundColor = "var(--theme-state-selected)";
                }
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
