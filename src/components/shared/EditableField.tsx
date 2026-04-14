/**
 * EditableField — Mode-aware field component for section-level edit mode.
 *
 * Two modes:
 *   - "view": read-only styled display (no click-to-edit, no hover effects)
 *   - "edit": active input (text, date, textarea, select), calls onChange on every change
 *
 * Designed to be controlled by a parent section via `useSectionEdit`.
 *
 * @see /components/shared/EditableSectionCard.tsx
 */

import React from "react";

interface EditableFieldProps {
  label: string;
  value: string;
  mode?: "view" | "edit";
  type?: "text" | "date" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--neuron-ink-base, #12332B)",
  marginBottom: "6px",
};

const viewValueStyle = (isEmpty: boolean, required: boolean, isTextarea: boolean): React.CSSProperties => ({
  padding: "8px 12px",
  backgroundColor: isEmpty ? "var(--theme-bg-surface)" : "var(--theme-bg-page)",
  border: `1px solid ${isEmpty && required ? "var(--theme-status-warning-border)" : "var(--theme-border-default)"}`,
  borderRadius: "6px",
  fontSize: "13px",
  color: isEmpty ? "var(--theme-text-muted)" : "var(--neuron-ink-primary, #12332B)",
  minHeight: isTextarea ? "60px" : "auto",
  whiteSpace: isTextarea ? ("pre-wrap" as const) : ("normal" as const),
});

const inputBaseStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  backgroundColor: "var(--theme-bg-surface)",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "6px",
  fontSize: "13px",
  color: "var(--neuron-ink-primary, #12332B)",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
  (e.currentTarget as HTMLElement).style.borderColor = "var(--theme-action-primary-bg)";
  (e.currentTarget as HTMLElement).style.boxShadow =
    "var(--neuron-state-focus-ring)";
};

const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
  (e.currentTarget as HTMLElement).style.borderColor = "var(--theme-border-default)";
  (e.currentTarget as HTMLElement).style.boxShadow = "none";
};

export function EditableField({
  label,
  value,
  mode = "view",
  type = "text",
  options = [],
  required = false,
  placeholder = "",
  onChange,
}: EditableFieldProps) {
  const isEmpty = !value || value.trim() === "";

  // ── View mode ──
  if (mode === "view") {
    const displayValue = isEmpty
      ? "—"
      : type === "date" && value
        ? (() => {
            try { return new Date(value).toLocaleDateString(); }
            catch { return value; }
          })()
        : value;

    return (
      <div>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>}
        </label>
        <div style={viewValueStyle(isEmpty, required, type === "textarea")}>
          {displayValue}
        </div>
      </div>
    );
  }

  // ── Edit mode ──
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>}
      </label>

      {type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ ...inputBaseStyle, resize: "vertical" }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      ) : type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={inputBaseStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          style={inputBaseStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      )}
    </div>
  );
}