/**
 * EditableSectionCard — Section-level edit mode wrapper for booking detail views.
 *
 * Provides a card container with a header that toggles between:
 *   - View mode: title + subtitle + "Edit" button
 *   - Edit mode: title + "Editing" badge + "Cancel" / "Save" buttons
 *
 * Pair with `useSectionEdit` hook to manage per-section draft state.
 *
 * @example
 * const section = useSectionEdit(booking);
 * <EditableSectionCard
 *   title="General Information"
 *   isEditing={section.isEditing}
 *   onEdit={section.startEditing}
 *   onSave={() => { const draft = section.save(); persist(draft); }}
 *   onCancel={section.cancel}
 * >
 *   <EditableField
 *     label="Carrier"
 *     value={section.draft.carrier || ""}
 *     mode={section.isEditing ? "edit" : "view"}
 *     onChange={(v) => section.updateField("carrier", v)}
 *   />
 * </EditableSectionCard>
 */

import React, { useState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";

// ── Hook: useSectionEdit ──────────────────────────────────────────────

export function useSectionEdit<T extends Record<string, any>>(currentData: T) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<T>({ ...currentData });
  const snapshotRef = useRef<T>(currentData);

  // Keep draft in sync with external data when NOT editing
  useEffect(() => {
    if (!isEditing) {
      setDraft({ ...currentData });
      snapshotRef.current = currentData;
    }
  }, [currentData, isEditing]);

  const startEditing = () => {
    snapshotRef.current = { ...currentData };
    setDraft({ ...currentData });
    setIsEditing(true);
  };

  const cancel = () => {
    setDraft({ ...snapshotRef.current });
    setIsEditing(false);
  };

  /** Exits edit mode and returns the final draft for the caller to persist. */
  const save = (): T => {
    setIsEditing(false);
    return { ...draft };
  };

  const updateField = <K extends keyof T>(field: K, value: T[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return { isEditing, draft, startEditing, cancel, save, updateField };
}

// ── Component: EditableSectionCard ────────────────────────────────────

interface EditableSectionCardProps {
  title: string;
  subtitle?: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  children: React.ReactNode;
}

export function EditableSectionCard({
  title,
  subtitle,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  isSaving = false,
  children,
}: EditableSectionCardProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: `1px solid var(--neuron-ui-border)`,
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "24px",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        {/* Left: title + editing badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              margin: 0,
            }}
          >
            {title}
          </h2>
          {isEditing && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                padding: "2px 8px",
                backgroundColor: "var(--theme-state-selected)",
                color: "var(--theme-action-primary-bg)",
                borderRadius: "4px",
              }}
            >
              Editing
            </span>
          )}
        </div>

        {/* Right: action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                style={{
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: 500,
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  color: "var(--neuron-ink-secondary)",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                style={{
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: 500,
                  backgroundColor: "var(--theme-action-primary-bg)",
                  border: "1px solid var(--theme-action-primary-bg)",
                  borderRadius: "6px",
                  color: "white",
                  cursor: isSaving ? "wait" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              {subtitle && (
                <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                  {subtitle}
                </span>
              )}
              <button
                type="button"
                onClick={onEdit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  fontSize: "13px",
                  fontWeight: 500,
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  color: "var(--neuron-ink-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                  e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-border-default)";
                  e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                }}
              >
                <Pencil size={13} />
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {children}
    </div>
  );
}