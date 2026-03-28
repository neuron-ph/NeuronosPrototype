import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface GroupedOption {
  label: string;
  items: string[];
}

interface GroupedDropdownProps {
  options: GroupedOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function GroupedDropdown({ options = [], value, onChange, placeholder = "Select option", disabled = false }: GroupedDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = (item: string) => {
    onChange(item);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: "14px",
          border: "1.5px solid #E5E7EB",
          borderRadius: "6px",
          backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
          color: value ? "#12332B" : "#9CA3AF",
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          outline: "none",
          transition: "all 0.2s",
          opacity: disabled ? 0.6 : 1
        }}
        onFocus={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.1)";
          }
        }}
        onBlur={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = "var(--theme-border-default)";
            e.currentTarget.style.boxShadow = "none";
          }
        }}
      >
        <span style={{ 
          textAlign: "left", 
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: "nowrap",
          flex: 1
        }}>
          {value || placeholder}
        </span>
        <ChevronDown 
          size={16} 
          style={{ 
            color: "var(--theme-text-muted)", 
            marginLeft: "8px",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)"
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
            border: "1.5px solid #E5E7EB",
            borderRadius: "8px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            zIndex: 1000,
            maxHeight: "320px",
            overflowY: "auto",
            animation: "slideDown 0.2s ease-out",
          }}
        >
          {(options || []).map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Group Header */}
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--theme-action-primary-bg)",
                  backgroundColor: "var(--theme-bg-page)",
                  borderTop: groupIndex > 0 ? "1px solid var(--theme-border-default)" : "none",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
              >
                {group.label}
              </div>
              
              {/* Group Items */}
              {(group.items || []).map((item, itemIndex) => (
                <button
                  key={itemIndex}
                  type="button"
                  onClick={() => handleSelect(item)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 28px",
                    fontSize: "14px",
                    color: value === item ? "#0F766E" : "#374151",
                    backgroundColor: value === item ? "#F0FDFA" : "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontWeight: value === item ? 500 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (value !== item) {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== item) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}