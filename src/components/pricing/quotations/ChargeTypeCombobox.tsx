/**
 * ChargeTypeCombobox
 *
 * A combobox (dropdown + custom text input) for selecting charge particulars.
 * Shows grouped presets from the ChargeTypeRegistry, allows typing custom values,
 * and optionally grays out already-used presets (for Brokerage — Trucking allows duplicates).
 *
 * When a preset is selected:
 *   - `particular` is set to the preset's label
 *   - `charge_type_id` is set to the preset's stable ID
 *   - `unit` is auto-filled from defaultUnit (if present)
 *
 * When a custom value is typed:
 *   - `particular` is set to the typed text
 *   - `charge_type_id` is cleared (undefined)
 *
 * @see /utils/chargeTypeRegistry.ts
 * @see /docs/blueprints/RATE_MATRIX_REDESIGN_BLUEPRINT.md
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  getPresetsGrouped,
  findPresetByLabel,
  type ChargeTypeOption,
} from "../../../utils/chargeTypeRegistry";

// ============================================
// TYPES
// ============================================

interface ChargeTypeComboboxProps {
  value: string;                        // Current particular text
  chargeTypeId?: string;                // Current charge_type_id (if from a preset)
  serviceType: string;                  // Filters presets by service type
  onChange: (update: {
    particular: string;
    charge_type_id?: string;
    unit?: string;
  }) => void;
  placeholder?: string;
  usedChargeTypeIds?: string[];         // Already-used IDs to gray out (Brokerage only)
  allowDuplicates?: boolean;            // Trucking = true, others = false
  disabled?: boolean;
  style?: React.CSSProperties;
}

// ============================================
// COMPONENT
// ============================================

export function ChargeTypeCombobox({
  value,
  chargeTypeId,
  serviceType,
  onChange,
  placeholder = "Select or type a charge...",
  usedChargeTypeIds = [],
  allowDuplicates = false,
  disabled = false,
  style,
}: ChargeTypeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync input value with external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Recompute dropdown position when open, and close on scroll
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    updatePosition();

    // Reposition on scroll in any ancestor (instead of closing)
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  // ── Get filtered options ──
  const groups = getPresetsGrouped(serviceType);

  // Flatten for keyboard navigation
  const flatOptions: ChargeTypeOption[] = groups.flatMap((g) => g.options);

  // Filter by typed text
  const filterText = inputValue.toLowerCase().trim();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((opt) =>
        opt.label.toLowerCase().includes(filterText)
      ),
    }))
    .filter((group) => group.options.length > 0);

  const filteredFlat = filteredGroups.flatMap((g) => g.options);

  // ── Handlers ──

  const selectPreset = useCallback(
    (preset: ChargeTypeOption) => {
      setInputValue(preset.label);
      onChange({
        particular: preset.label,
        charge_type_id: preset.id,
        unit: preset.defaultUnit,
      });
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Check if typed text matches a preset exactly
    const match = findPresetByLabel(val, serviceType);
    if (match) {
      onChange({
        particular: match.label,
        charge_type_id: match.id,
        unit: match.defaultUnit,
      });
    } else {
      onChange({
        particular: val,
        charge_type_id: undefined,
      });
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredFlat.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredFlat.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredFlat.length) {
          const selected = filteredFlat[highlightedIndex];
          const isUsed =
            !allowDuplicates && usedChargeTypeIds.includes(selected.id);
          if (!isUsed) {
            selectPreset(selected);
          }
        } else {
          setIsOpen(false);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // ── Track flat index across groups for highlighting ──
  let flatIdx = 0;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", ...style }}
    >
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--neuron-ink-primary)",
          backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "6px",
          outline: "none",
          fontFamily: "inherit",
        }}
      />

      {/* Dropdown */}
      {isOpen && filteredGroups.length > 0 && dropdownPos && (
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              width: `${dropdownPos.width}px`,
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid #E0E6E4",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              zIndex: 9999,
              maxHeight: "240px",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {filteredGroups.map((group) => (
              <div key={group.category}>
                {/* Group header */}
                <div
                  style={{
                    padding: "6px 12px 4px",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#8A9490",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    borderTop:
                      group.category !== filteredGroups[0].category
                        ? "1px solid #F0F2F1"
                        : "none",
                  }}
                >
                  {group.label}
                </div>

                {/* Options */}
                {group.options.map((option) => {
                  const currentFlatIdx = flatIdx++;
                  const isUsed =
                    !allowDuplicates &&
                    usedChargeTypeIds.includes(option.id);
                  const isHighlighted = currentFlatIdx === highlightedIndex;
                  const isSelected = chargeTypeId === option.id;

                  return (
                    <div
                      key={`${option.id}-${currentFlatIdx}`}
                      onClick={() => {
                        if (!isUsed) selectPreset(option);
                      }}
                      style={{
                        padding: "7px 12px",
                        fontSize: "13px",
                        fontWeight: isSelected ? 600 : 400,
                        color: isUsed
                          ? "#C8D0CD"
                          : isSelected
                          ? "#0F766E"
                          : "#2C3E38",
                        backgroundColor: isHighlighted
                          ? "#F0FAF8"
                          : "transparent",
                        cursor: isUsed ? "default" : "pointer",
                        transition: "background-color 0.1s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) => {
                        if (!isUsed) {
                          e.currentTarget.style.backgroundColor = "#F0FAF8";
                        }
                        setHighlightedIndex(currentFlatIdx);
                      }}
                      onMouseLeave={(e) => {
                        if (!isHighlighted) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <span>{option.label}</span>
                      {isUsed && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#C8D0CD",
                            fontStyle: "italic",
                          }}
                        >
                          in use
                        </span>
                      )}
                      {isSelected && !isUsed && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: "var(--theme-action-primary-bg)",
                            fontWeight: 600,
                          }}
                        >
                          &#10003;
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )
      )}
    </div>
  );
}