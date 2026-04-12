import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

type DropdownSize = "sm" | "md" | "lg";

interface CustomDropdownProps {
  label?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: React.ReactNode;
  fullWidth?: boolean;
  size?: DropdownSize;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  /** Accessible label for the trigger button when no visible label is rendered above the dropdown.
   *  Maps to aria-label on the trigger button so screen readers can identify the field. */
  triggerAriaLabel?: string;
  // Multi-select support
  multiSelect?: boolean;
  multiValue?: string[];
  onMultiChange?: (values: string[]) => void;
}

export function CustomDropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  helperText,
  fullWidth = false,
  size = "md",
  buttonClassName,
  buttonStyle,
  triggerAriaLabel,
  multiSelect = false,
  multiValue = [],
  onMultiChange,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  // Compute position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside (check both trigger and portal menu)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Reposition menu on scroll so it stays anchored to the button
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
      }
    };
    window.addEventListener("scroll", updatePosition, true);
    return () => window.removeEventListener("scroll", updatePosition, true);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = multiSelect
    ? (multiValue.length > 0 
        ? multiValue.map(v => options.find(o => o.value === v)?.label || v).join(", ")
        : placeholder || "Select...")
    : (selectedOption?.label || placeholder || "Select...");
  const displayIcon = multiSelect ? undefined : selectedOption?.icon;

  // Multi-select toggle handler
  const handleMultiToggle = (optionValue: string) => {
    if (!onMultiChange) return;
    const newValues = multiValue.includes(optionValue)
      ? multiValue.filter(v => v !== optionValue)
      : [...multiValue, optionValue];
    onMultiChange(newValues);
  };

  // Size-based styling
  const sizeStyles = {
    sm: {
      padding: "px-2 py-1.5",
      fontSize: "text-[11px]",
      gap: "gap-1",
      iconSize: 14,
      minWidth: "" // No min-width for small
    },
    md: {
      padding: "px-4 py-2.5",
      fontSize: "text-[13px]",
      gap: "gap-2",
      iconSize: 16,
      minWidth: "min-w-[160px]"
    },
    lg: {
      padding: "px-5 py-3",
      fontSize: "text-[14px]",
      gap: "gap-2",
      iconSize: 18,
      minWidth: "min-w-[180px]"
    }
  };

  const currentSize = sizeStyles[size];

  // Inline label version (original)
  if (!label) {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          ref={buttonRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          type="button"
          aria-label={triggerAriaLabel}
          className={`${currentSize.padding} rounded-lg ${currentSize.fontSize} transition-all flex items-center ${currentSize.gap} ${fullWidth ? "w-full" : currentSize.minWidth} ${buttonClassName || ""}`}
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
            color: "var(--theme-text-primary)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
            width: size === "sm" ? "100%" : undefined,
            ...buttonStyle
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
            }
          }}
        >
          <span style={{ 
            color: buttonStyle?.color
              ? "inherit"
              : (multiSelect ? multiValue.length > 0 : value) ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
            flex: 1, 
            textAlign: "left", 
            display: "flex", 
            alignItems: "center", 
            gap: size === "sm" ? "4px" : "6px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0
          }}>
            {displayIcon && <span style={{ display: "flex", alignItems: "center" }}>{displayIcon}</span>}
            {displayValue}
          </span>
          <ChevronDown 
            size={currentSize.iconSize} 
            style={{ 
              color: buttonStyle?.color ? "inherit" : "var(--theme-text-muted)",
              transition: "transform 0.2s",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0
            }} 
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && !disabled && menuPos && (
          createPortal(
            <div
              ref={menuRef}
              className="rounded-lg overflow-hidden min-w-full"
              style={{
                position: "fixed",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
                maxHeight: "240px",
                overflowY: "auto",
                zIndex: 9999,
                top: menuPos.top,
                left: menuPos.left,
                minWidth: menuPos.minWidth,
                width: "max-content"
              }}
            >
              {options.map((option) => {
                const isSelected = multiSelect
                  ? multiValue.includes(option.value)
                  : value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (multiSelect) {
                        handleMultiToggle(option.value);
                      } else {
                        onChange(option.value);
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full ${currentSize.padding} text-left ${currentSize.fontSize} transition-colors flex items-center ${currentSize.gap}`}
                    style={{
                      backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                      color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                      borderBottom: "1px solid var(--theme-border-subtle)"
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--theme-state-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                    }}
                  >
                    {multiSelect && (
                      <span style={{
                        width: "16px", height: "16px",
                        borderRadius: "3px",
                        border: isSelected ? "none" : "1.5px solid var(--theme-border-default)",
                        backgroundColor: isSelected ? "var(--theme-action-primary-bg)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                      </span>
                    )}
                    {option.icon && <span style={{ display: "flex", alignItems: "center" }}>{option.icon}</span>}
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        )}
      </div>
    );
  }

  // Form field version with external label
  return (
    <div className={fullWidth ? "w-full" : ""}>
      {/* Label */}
      <label className="block text-sm font-['Inter:Medium',sans-serif] font-medium text-[var(--theme-text-primary)] mb-1.5">
        {label} {required && <span className="text-[var(--theme-status-danger-fg)]">*</span>}
        {helperText && <span className="ml-2">{helperText}</span>}
      </label>

      {/* Dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          ref={buttonRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          type="button"
          className={`${fullWidth ? 'w-full' : ''} px-3.5 py-2.5 rounded-lg transition-all flex items-center justify-between gap-2 ${buttonClassName || ""}`}
          style={{
            border: "1px solid var(--theme-border-default)",
            backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
            color: (multiSelect ? multiValue.length > 0 : value) ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
            cursor: disabled ? "not-allowed" : "pointer",
            ...buttonStyle
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
            }
          }}
        >
          <span style={{ flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: "6px" }}>
            {displayIcon && <span style={{ display: "flex", alignItems: "center" }}>{displayIcon}</span>}
            {displayValue}
          </span>
          <ChevronDown 
            size={16} 
            style={{ 
              color: "var(--theme-text-muted)",
              transition: "transform 0.2s",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)"
            }} 
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && !disabled && menuPos && (
          createPortal(
            <div
              ref={menuRef}
              className="rounded-lg overflow-hidden"
              style={{
                position: "fixed",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
                maxHeight: "240px",
                overflowY: "auto",
                zIndex: 9999,
                top: menuPos.top,
                left: menuPos.left,
                minWidth: menuPos.minWidth,
                width: "max-content"
              }}
            >
              {options.map((option, index) => {
                const isSelected = multiSelect
                  ? multiValue.includes(option.value)
                  : value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (multiSelect) {
                        handleMultiToggle(option.value);
                      } else {
                        onChange(option.value);
                        setIsOpen(false);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-sm transition-colors flex items-center gap-2"
                    style={{
                      backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                      color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                      borderBottom: index < options.length - 1 ? "1px solid var(--theme-border-subtle)" : "none"
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = "var(--theme-state-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                    }}
                  >
                    {multiSelect && (
                      <span style={{
                        width: "16px", height: "16px",
                        borderRadius: "3px",
                        border: isSelected ? "none" : "1.5px solid var(--theme-border-default)",
                        backgroundColor: isSelected ? "var(--theme-action-primary-bg)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                      </span>
                    )}
                    {option.icon && <span style={{ display: "flex", alignItems: "center" }}>{option.icon}</span>}
                    {option.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        )}
      </div>
    </div>
  );
}