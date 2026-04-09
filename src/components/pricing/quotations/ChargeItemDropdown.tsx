import { useState, useRef, useEffect } from "react";
import { getChargeItemsForCategory } from "../../../constants/quotation-charges";

interface ChargeItemDropdownProps {
  categoryName: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  hasStartedEditing: boolean;
  inputId?: string;
}

export function ChargeItemDropdown({
  categoryName,
  value,
  onChange,
  onKeyDown,
  hasStartedEditing,
  inputId,
}: ChargeItemDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const predefinedCharges = getChargeItemsForCategory(categoryName);
  const filteredCharges = predefinedCharges.filter((charge) =>
    charge.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sync searchTerm with value when value changes externally
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    onChange(newValue);
    if (!isOpen && predefinedCharges.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelectCharge = (charge: string) => {
    setSearchTerm(charge);
    onChange(charge);
    setIsOpen(false);
    // Don't refocus to avoid reopening the dropdown
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && filteredCharges.length > 0) {
      e.preventDefault();
      setIsOpen(true);
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    } else if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handleFocus = () => {
    // Only auto-open if field is empty
    if (predefinedCharges.length > 0 && !searchTerm) {
      setIsOpen(true);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onFocus={handleFocus}
        placeholder="Select or type description..."
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "13px",
          border: hasStartedEditing ? "1px solid var(--theme-status-warning-fg)" : "1px solid var(--theme-border-default)",
          borderRadius: "4px",
          backgroundColor: "var(--theme-bg-surface)",
          outline: "none",
          fontFamily: "inherit",
          color: "var(--neuron-ink-primary)",
        }}
      />

      {/* Dropdown */}
      {isOpen && filteredCharges.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: "200px",
            overflowY: "auto",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
          }}
        >
          {filteredCharges.map((charge, index) => (
            <button
              key={index}
              onClick={() => handleSelectCharge(charge)}
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "none",
                borderBottom:
                  index < filteredCharges.length - 1
                    ? "1px solid var(--theme-border-subtle)"
                    : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F0FDF4";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }}
            >
              {charge}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}