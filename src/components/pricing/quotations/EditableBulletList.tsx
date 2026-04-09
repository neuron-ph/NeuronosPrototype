/**
 * EditableBulletList
 *
 * Shared editable bullet-point list component used for:
 *   - Scope of Services (contract quotations)
 *   - Terms & Conditions (contract quotations)
 *
 * Supports add, remove, reorder (move up/down), and viewMode.
 * Neuron design system styling.
 */

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";

interface EditableBulletListProps {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  viewMode?: boolean;
  placeholder?: string;
  emptyMessage?: string;
}

export function EditableBulletList({
  title,
  items,
  onChange,
  viewMode = false,
  placeholder = "Enter item...",
  emptyMessage = "No items added yet.",
}: EditableBulletListProps) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setNewItem("");
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const updated = [...items];
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    onChange(updated);
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <h2 style={{
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--neuron-brand-green)",
        marginBottom: "16px",
        margin: 0,
      }}>
        {title}
      </h2>

      {/* Items List */}
      {items.length === 0 && viewMode && (
        <p style={{
          fontSize: "13px",
          color: "var(--neuron-ink-muted)",
          fontStyle: "italic",
          margin: "16px 0 0",
        }}>
          {emptyMessage}
        </p>
      )}

      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: viewMode ? "6px 0" : "0",
            }}
          >
            {/* Bullet number */}
            <span style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--neuron-ink-muted)",
              minWidth: "24px",
              textAlign: "right",
              paddingTop: viewMode ? "0" : "10px",
              flexShrink: 0,
            }}>
              {index + 1}.
            </span>

            {viewMode ? (
              <span style={{
                fontSize: "13px",
                color: "var(--neuron-ink-base)",
                lineHeight: "1.5",
                flex: 1,
              }}>
                {item}
              </span>
            ) : (
              <>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => updateItem(index, e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />

                {/* Reorder buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <button
                    type="button"
                    onClick={() => moveItem(index, "up")}
                    disabled={index === 0}
                    style={{
                      padding: "2px",
                      background: "none",
                      border: "none",
                      cursor: index === 0 ? "default" : "pointer",
                      color: index === 0 ? "var(--neuron-ui-muted)" : "var(--neuron-ink-muted)",
                      opacity: index === 0 ? 0.4 : 1,
                    }}
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, "down")}
                    disabled={index === items.length - 1}
                    style={{
                      padding: "2px",
                      background: "none",
                      border: "none",
                      cursor: index === items.length - 1 ? "default" : "pointer",
                      color: index === items.length - 1 ? "var(--neuron-ui-muted)" : "var(--neuron-ink-muted)",
                      opacity: index === items.length - 1 ? 0.4 : 1,
                    }}
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  style={{
                    padding: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--neuron-semantic-danger)",
                    opacity: 0.6,
                    transition: "opacity 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                  title="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      {!viewMode && (
        <div style={{
          display: "flex",
          gap: "8px",
          marginTop: items.length > 0 ? "12px" : "16px",
        }}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={placeholder}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: "13px",
              color: "var(--neuron-ink-base)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px dashed var(--neuron-ui-border)",
              borderRadius: "6px",
              outline: "none",
              transition: "border-color 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
              e.currentTarget.style.borderStyle = "solid";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              e.currentTarget.style.borderStyle = "dashed";
            }}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newItem.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 500,
              color: !newItem.trim() ? "var(--neuron-ink-muted)" : "var(--neuron-brand-green)",
              backgroundColor: !newItem.trim() ? "var(--neuron-pill-inactive-bg)" : "var(--neuron-brand-green-100)",
              border: `1px solid ${!newItem.trim() ? "var(--neuron-ui-border)" : "var(--neuron-brand-green)"}`,
              borderRadius: "6px",
              cursor: !newItem.trim() ? "default" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
