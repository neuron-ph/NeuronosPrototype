/**
 * EditableMultiInputField — Inline-editable multi-value field for detail views.
 *
 * Supports two usage patterns:
 *   1. Standalone (legacy): click-to-edit with auto-save on blur
 *   2. Section-controlled: `mode` prop controls view/edit, `onChange` for live updates
 *
 * @see /docs/blueprints/MULTI_INPUT_FIELDS_BLUEPRINT.md — Phase 3
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";

interface EditableMultiInputFieldProps {
  /** Field name for lock-status checks */
  fieldName: string;
  /** Display label */
  label: string;
  /** Current value as comma-separated string */
  value: string;
  /** Booking status (used for field locking in the future) */
  status: string;
  /** Placeholder when no values exist */
  placeholder?: string;
  /** Called with the new comma-separated string on save (legacy standalone mode) */
  onSave?: (value: string) => void;
  /** Called on every change when mode is provided (section-controlled mode) */
  onChange?: (value: string) => void;
  /** Text for the add button */
  addButtonText?: string;
  /** Whether this field is required */
  required?: boolean;
  /**
   * When provided, disables internal edit toggle:
   *   - "view": always read-only stacked rows
   *   - "edit": always show editable input rows
   * When omitted, uses legacy click-to-toggle behaviour.
   */
  mode?: "view" | "edit";
}

/** Split comma-separated string into trimmed entries, at least one empty row */
function parseEntries(value: string): string[] {
  if (!value || value.trim() === "") return [""];
  return value.split(",").map((s) => s.trim());
}

/** Join entries back to comma-separated, filtering empties */
function joinEntries(entries: string[]): string {
  return entries
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

export function EditableMultiInputField({
  fieldName,
  label,
  value,
  status,
  placeholder = "Click to add...",
  onSave,
  onChange,
  addButtonText = "Add",
  required = false,
  mode,
}: EditableMultiInputFieldProps) {
  // Determine effective editing state
  const isControlled = mode !== undefined;
  const [internalEditing, setInternalEditing] = useState(false);
  const isEditing = isControlled ? mode === "edit" : internalEditing;
  const setIsEditing = isControlled ? () => {} : setInternalEditing;

  const [entries, setEntries] = useState<string[]>(() => parseEntries(value));
  const [saveSuccess, setSaveSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lastAddedRef = useRef<number | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse the display values for view mode (non-empty only)
  const displayValues = value
    ? value.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const isEmpty = displayValues.length === 0;

  // Reset entries when value changes externally (e.g., after save/refresh)
  useEffect(() => {
    if (!isEditing) {
      setEntries(parseEntries(value));
    }
  }, [value, isEditing]);

  // Focus newly added input
  useEffect(() => {
    if (lastAddedRef.current !== null) {
      inputRefs.current[lastAddedRef.current]?.focus();
      lastAddedRef.current = null;
    }
  }, [entries.length]);

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const handleStartEditing = () => {
    setEntries(parseEntries(value));
    setIsEditing(true);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleSave = useCallback(() => {
    const joined = joinEntries(entries);
    // Only save if value actually changed
    const currentJoined = value
      ? value.split(",").map((s) => s.trim()).filter(Boolean).join(", ")
      : "";
    if (joined !== currentJoined && onSave) {
      onSave(joined);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
    setIsEditing(false);
  }, [entries, value, onSave]);

  // Auto-save when focus leaves the entire field group
  const handleFieldBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        handleSave();
      }
    }, 150);
  }, [handleSave]);

  const handleFieldFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const handleEntryChange = (index: number, newValue: string) => {
    const updated = [...entries];
    updated[index] = newValue;
    setEntries(updated);
    if (isControlled && onChange) {
      onChange(joinEntries(updated));
    }
  };

  const handleAdd = () => {
    const updated = [...entries, ""];
    lastAddedRef.current = updated.length - 1;
    setEntries(updated);
  };

  const handleRemove = (index: number) => {
    if (entries.length <= 1) return;
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    if (isControlled && onChange) {
      onChange(joinEntries(updated));
    }
    const prevIdx = Math.max(0, index - 1);
    setTimeout(() => inputRefs.current[prevIdx]?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEntries(parseEntries(value));
      setIsEditing(false);
    } else if (e.key === "Backspace" && entries[index] === "" && entries.length > 1) {
      e.preventDefault();
      handleRemove(index);
    }
  };

  const isLastRow = (index: number) => index === entries.length - 1;
  const canRemove = entries.length > 1;

  // ── Edit Mode ──
  if (isEditing) {
    return (
      <div ref={containerRef} onBlur={handleFieldBlur} onFocus={handleFieldFocus}>
        <label
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-base, #12332B)",
            marginBottom: "6px",
          }}
        >
          {label} {required && <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>}
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {entries.map((entry, index) => (
            <div
              key={index}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                value={entry}
                onChange={(e) => handleEntryChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                placeholder={placeholder}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "var(--neuron-ink-primary, #12332B)",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                  e.currentTarget.style.boxShadow = "var(--neuron-state-focus-ring)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-border-default)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {isLastRow(index) && (
                <button
                  type="button"
                  onClick={handleAdd}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--theme-action-primary-bg)",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-state-selected)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  title="Add row"
                >
                  <Plus size={14} />
                </button>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--theme-text-muted)",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                    e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--theme-text-muted)";
                  }}
                  title="Remove"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── View Mode ──
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--neuron-ink-base, #12332B)",
          marginBottom: "6px",
        }}
      >
        {label} {required && <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>}
      </label>

      {isEmpty ? (
        /* Single empty-state row */
        <div
          onClick={isControlled ? undefined : handleStartEditing}
          style={{
            padding: "7px 10px",
            backgroundColor: "var(--theme-bg-surface)",
            border: `1px solid ${required ? "var(--theme-status-warning-border)" : "var(--theme-border-default)"}`,
            borderRadius: "6px",
            fontSize: "13px",
            color: "var(--theme-text-muted)",
            cursor: isControlled ? "default" : "pointer",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={isControlled ? undefined : (e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; }}
          onMouseLeave={isControlled ? undefined : (e) => { e.currentTarget.style.borderColor = required ? "var(--theme-status-warning-border)" : "var(--theme-border-default)"; }}
        >
          {isEmpty ? "—" : placeholder}
        </div>
      ) : (
        /* Stacked read-only rows — one per value */
        <div
          style={{ display: "flex", flexDirection: "column", gap: "6px", position: "relative" }}
          onClick={isControlled ? undefined : handleStartEditing}
          onMouseEnter={isControlled ? undefined : (e) => {
            const inputs = e.currentTarget.querySelectorAll<HTMLElement>("[data-view-row]");
            inputs.forEach((el) => { el.style.borderColor = "var(--theme-action-primary-bg)"; });
          }}
          onMouseLeave={isControlled ? undefined : (e) => {
            const inputs = e.currentTarget.querySelectorAll<HTMLElement>("[data-view-row]");
            inputs.forEach((el) => { el.style.borderColor = "var(--theme-border-default)"; });
          }}
        >
          {displayValues.map((val, i) => (
            <div
              key={i}
              data-view-row
              style={{
                padding: "7px 10px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "13px",
                color: "var(--neuron-ink-primary, #12332B)",
                cursor: isControlled ? "default" : "pointer",
                transition: "border-color 0.15s",
              }}
            >
              {val}
            </div>
          ))}
          {saveSuccess && (
            <span
              style={{
                position: "absolute",
                right: "10px",
                top: "7px",
                fontSize: "11px",
                color: "var(--theme-action-primary-bg)",
                fontWeight: 500,
              }}
            >
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}