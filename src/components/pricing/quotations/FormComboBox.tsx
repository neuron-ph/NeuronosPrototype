/**
 * FormComboBox — Generic combobox (text input + filtered dropdown).
 *
 * Supports both strict selection from options AND free-text entry.
 * When `contractDestinations` are provided, shows:
 *   - Teal checkmark + highlight when value matches an option (contract match)
 *   - Amber "Outside contract" indicator when value is free-typed and unmatched
 *
 * Visually matches FormSelect styling (Neuron design system).
 *
 * @see /docs/blueprints/DESTINATION_COMBOBOX_BLUEPRINT.md — Phase 2
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, AlertTriangle } from "lucide-react";

interface FormComboBoxOption {
  value: string;
  label: string;
}

interface FormComboBoxProps {
  value: string;
  options: FormComboBoxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** When true, shows match/mismatch indicators. Default: true */
  showMatchIndicator?: boolean;
}

export function FormComboBox({
  value,
  options,
  onChange,
  placeholder = "Type or select...",
  disabled = false,
  showMatchIndicator = true,
}: FormComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync inputValue when external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return options;
    const query = inputValue.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query)
    );
  }, [inputValue, options]);

  // Check if current value matches an option
  const isMatched = useMemo(() => {
    if (!value.trim()) return false;
    const lower = value.toLowerCase().trim();
    return options.some(
      (opt) =>
        opt.value.toLowerCase() === lower ||
        opt.label.toLowerCase() === lower
    );
  }, [value, options]);

  const hasValue = value.trim().length > 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setInputValue(newVal);
    onChange(newVal);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelect = (optionValue: string) => {
    setInputValue(optionValue);
    onChange(optionValue);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && filteredOptions.length === 1) {
      handleSelect(filteredOptions[0].value);
      e.preventDefault();
    }
  };

  // Determine indicator state
  const showIndicator = showMatchIndicator && hasValue && options.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Input + indicator row */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px 10px",
            paddingRight: showIndicator ? "58px" : "28px",
            fontSize: "13px",
            color: "var(--neuron-ink-base)",
            backgroundColor: disabled ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
            border: `1px solid ${isOpen ? "var(--neuron-brand-teal)" : "var(--neuron-ui-border)"}`,
            borderRadius: "6px",
            outline: "none",
            transition: "border-color 0.15s ease",
            cursor: disabled ? "default" : "text",
            opacity: disabled ? 0.6 : 1,
          }}
        />

        {/* Right-side icons */}
        <div
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            pointerEvents: "none",
          }}
        >
          {/* Match indicator */}
          {showIndicator && (
            isMatched ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: "var(--theme-bg-surface-tint)",
                }}
                title="Matched contract destination"
              >
                <Check size={11} style={{ color: "var(--theme-action-primary-bg)" }} />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: "var(--theme-status-warning-bg)",
                }}
                title="Outside contract — manual pricing required"
              >
                <AlertTriangle size={10} style={{ color: "var(--theme-status-warning-fg)" }} />
              </div>
            )
          )}

          {/* Chevron */}
          <ChevronDown
            size={14}
            style={{
              color: "var(--theme-text-muted)",
              transition: "transform 0.2s",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          />
        </div>
      </div>

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
            borderRadius: "6px",
            boxShadow:
              "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 1000,
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {/* Contract destinations header */}
          {options.length > 0 && (
            <div
              style={{
                padding: "6px 10px 4px",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid var(--theme-border-subtle)",
              }}
            >
              Contract destinations
            </div>
          )}

          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const isSelected =
                value.toLowerCase().trim() === option.value.toLowerCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "13px",
                    color: isSelected
                      ? "var(--neuron-brand-teal)"
                      : "var(--neuron-ink-base)",
                    backgroundColor: isSelected ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
                    border: "none",
                    borderBottom: "1px solid var(--theme-border-subtle)",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected
                      ? "var(--theme-bg-surface-tint)"
                      : "var(--theme-bg-surface)";
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && (
                    <Check size={13} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
                  )}
                </button>
              );
            })
          ) : (
            <div
              style={{
                padding: "10px",
                fontSize: "12px",
                color: "var(--theme-text-muted)",
                textAlign: "center",
              }}
            >
              {inputValue.trim()
                ? "No matching destinations — custom value will be used"
                : "No destinations available"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
