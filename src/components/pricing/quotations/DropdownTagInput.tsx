/**
 * DropdownTagInput
 *
 * Hybrid of TagInput and Dropdown — selected items appear as tag chips
 * that wrap downward, while a dropdown of predefined options lets you
 * pick from a list. You can also type to filter options.
 *
 * Features:
 *   - Click → opens dropdown with checkbox options
 *   - Selected items render as teal tag chips (flex-wrap, expand vertically)
 *   - Each chip has an × to remove
 *   - Inline text input filters the dropdown options
 *   - viewMode support (read-only chips)
 *   - Neuron design system styling
 *
 * @component DropdownTagInput
 * @since 2026-02-21
 */

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Plus } from "lucide-react";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownTagInputProps {
  value: string[];
  onChange: (values: string[]) => void;
  options: DropdownOption[];
  placeholder?: string;
  label?: string;
  viewMode?: boolean;
  disabled?: boolean;
  /** When true, the user can type and add custom values not in the options list */
  allowCustom?: boolean;
}

export function DropdownTagInput({
  value,
  onChange,
  options,
  placeholder = "Select or type to search...",
  label,
  viewMode = false,
  disabled = false,
  allowCustom = false,
}: DropdownTagInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilterText("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
    setFilterText("");
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(filterText.toLowerCase()) ||
    opt.value.toLowerCase().includes(filterText.toLowerCase())
  );

  // Check if the current filter text is a custom value (not matching any existing option exactly)
  const trimmedFilter = filterText.trim();
  const isCustomValue = allowCustom
    && trimmedFilter.length > 0
    && !options.some(o =>
      o.value.toLowerCase() === trimmedFilter.toLowerCase() ||
      o.label.toLowerCase() === trimmedFilter.toLowerCase()
    )
    && !value.some(v => v.toLowerCase() === trimmedFilter.toLowerCase());

  const addCustomValue = () => {
    if (!trimmedFilter || !allowCustom) return;
    if (!value.includes(trimmedFilter)) {
      onChange([...value, trimmedFilter]);
    }
    setFilterText("");
  };

  const getLabel = (v: string) => options.find(o => o.value === v)?.label || v;

  // View mode: read-only tags
  if (viewMode) {
    return (
      <div>
        {label && (
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-secondary)",
            marginBottom: "8px",
          }}>
            {label}
          </label>
        )}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          padding: "10px 12px",
          minHeight: "42px",
          backgroundColor: "var(--theme-bg-page)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "6px",
          alignItems: "center",
        }}>
          {value.length > 0 ? (
            value.map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-brand-green)",
                  backgroundColor: "var(--theme-bg-surface-tint)",
                  border: "1px solid #CCFBF1",
                  borderRadius: "14px",
                }}
              >
                {getLabel(tag)}
              </span>
            ))
          ) : (
            <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
              None specified
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Clickable tag area + input */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          padding: "8px 10px",
          paddingRight: "32px", // space for chevron
          minHeight: "42px",
          backgroundColor: disabled ? "#F9FAFB" : "white",
          border: `1px solid ${isOpen ? "#0F766E" : "var(--neuron-ui-border)"}`,
          borderRadius: "6px",
          cursor: disabled ? "default" : "text",
          transition: "border-color 0.15s ease",
          alignItems: "center",
          position: "relative",
        }}
      >
        {/* Selected tags */}
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-brand-green)",
              backgroundColor: "var(--theme-bg-surface-tint)",
              border: "1px solid #CCFBF1",
              borderRadius: "14px",
              whiteSpace: "nowrap",
            }}
          >
            {getLabel(tag)}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--neuron-brand-green)",
                  opacity: 0.6,
                  transition: "opacity 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}

        {/* Inline filter/search input */}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !filterText && value.length > 0) {
                removeTag(value.length - 1);
              }
              if (e.key === "Escape") {
                setIsOpen(false);
                setFilterText("");
              }
              if (e.key === "Enter" && isCustomValue) {
                addCustomValue();
              }
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            style={{
              flex: 1,
              minWidth: "80px",
              padding: "2px 4px",
              fontSize: "13px",
              color: "var(--neuron-ink-base)",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
            }}
          />
        )}

        {/* Chevron indicator */}
        <span
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: `translateY(-50%) rotate(${isOpen ? "180deg" : "0deg"})`,
            transition: "transform 0.2s",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <ChevronDown size={16} color="var(--theme-text-muted)" />
        </span>
      </div>

      {/* Dropdown menu */}
      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            maxHeight: "220px",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {filteredOptions.length === 0 && !isCustomValue ? (
            <div style={{
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--neuron-ink-muted)",
              textAlign: "center",
            }}>
              No matching options
            </div>
          ) : (
            <>
            {filteredOptions.map((option, index) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleOption(option.value)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    textAlign: "left",
                    backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                    color: isSelected ? "#0F766E" : "var(--neuron-ink-base)",
                    border: "none",
                    borderBottom: (index < filteredOptions.length - 1 || isCustomValue) ? "1px solid var(--theme-border-subtle)" : "none",
                    cursor: "pointer",
                    transition: "background-color 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                  }}
                >
                  {/* Checkbox */}
                  <span style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "3px",
                    border: isSelected ? "none" : "1.5px solid #D1D5DB",
                    backgroundColor: isSelected ? "#0F766E" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                  </span>
                  {option.label}
                </button>
              );
            })}

            {/* "Add custom value" option */}
            {isCustomValue && (
              <button
                type="button"
                onClick={addCustomValue}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 12px",
                  fontSize: "13px",
                  textAlign: "left",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-action-primary-bg)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background-color 0.1s ease",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F0FAF8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                }}
              >
                <Plus size={14} style={{ flexShrink: 0 }} />
                Add "{trimmedFilter}"
              </button>
            )}
            </>
          )}
        </div>
      )}
    </div>
  );
}