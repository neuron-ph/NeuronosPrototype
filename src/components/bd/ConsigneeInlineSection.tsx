/**
 * ConsigneeInlineSection — Multi-consignee list with inline add/edit.
 *
 * View mode: read-only list, "None" if empty
 * Edit mode: hover actions, ghost "Add consignee..." row, inline inputs
 */

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Building2, User, Check, X, Pencil, Trash2 } from "lucide-react";
import { useConsignees } from "../../hooks/useConsignees";
import { toast } from "../ui/toast-utils";

interface ConsigneeInlineSectionProps {
  customerId: string;
  isEditing?: boolean;
}

/**
 * Imperative handle so a parent's Save button can commit a consignee the user
 * typed but didn't confirm with the per-row ✓ — otherwise the pending text is
 * silently discarded when edit mode closes.
 */
export interface ConsigneeInlineSectionHandle {
  /** Persist any pending inline add/edit. Rejects if the write fails. */
  flushPendingAdd: () => Promise<void>;
}

export const ConsigneeInlineSection = forwardRef<
  ConsigneeInlineSectionHandle,
  ConsigneeInlineSectionProps
>(function ConsigneeInlineSection({ customerId, isEditing = false }, ref) {
  const {
    consignees,
    isLoading,
    createConsignee,
    updateConsignee,
    deleteConsignee,
  } = useConsignees(customerId);

  const [isAdding, setIsAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus inputs
  useEffect(() => {
    if (isAdding) addInputRef.current?.focus();
  }, [isAdding]);
  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  // Reset add/edit state when leaving edit mode
  useEffect(() => {
    if (!isEditing) {
      setIsAdding(false);
      setAddValue("");
      setEditingId(null);
      setEditValue("");
    }
  }, [isEditing]);

  // ---- Add handlers ----
  const startAdding = () => {
    setIsAdding(true);
    setAddValue("");
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddValue("");
  };

  const confirmAdd = async () => {
    const trimmed = addValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createConsignee({ name: trimmed });
      toast.success("Consignee added");
      setIsAdding(false);
      setAddValue("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add consignee");
    } finally {
      setSaving(false);
    }
  };

  // ---- Edit handlers ----
  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const confirmEdit = async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateConsignee(editingId, { name: trimmed });
      toast.success("Consignee updated");
      setEditingId(null);
      setEditValue("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update consignee");
    } finally {
      setSaving(false);
    }
  };

  // ---- Flush pending input (called by the customer-level Save button) ----
  // Commits any consignee the user typed but didn't confirm with the ✓, so
  // "Save" persists it instead of discarding it on edit-mode close.
  const flushPendingAdd = async () => {
    const pendingEdit = editingId ? editValue.trim() : "";
    if (editingId && pendingEdit) {
      await updateConsignee(editingId, { name: pendingEdit });
      setEditingId(null);
      setEditValue("");
    }
    const pendingAdd = addValue.trim();
    if (pendingAdd) {
      await createConsignee({ name: pendingAdd });
      setIsAdding(false);
      setAddValue("");
    }
  };

  useImperativeHandle(ref, () => ({ flushPendingAdd }), [
    editingId,
    editValue,
    addValue,
  ]);

  // ---- Delete handler ----
  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      await deleteConsignee(id);
      toast.success("Consignee removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove consignee");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    action: "add" | "edit"
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action === "add" ? confirmAdd() : confirmEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      action === "add" ? cancelAdd() : cancelEdit();
    }
  };

  const hasConsignees = consignees.length > 0;

  return (
    <div>
      {/* Section header */}
      {!isEditing ? (
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={14} style={{ color: "var(--neuron-ink-muted)" }} />
          <label
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: "var(--neuron-ink-muted)" }}
          >
            Consignees / Shippers
          </label>
        </div>
      ) : (
        <label
          className="block text-[11px] font-medium uppercase tracking-wide mb-1.5"
          style={{ color: "var(--neuron-ink-muted)" }}
        >
          Consignees / Shippers
        </label>
      )}

      <div className={!isEditing ? "pl-6 space-y-0.5" : "space-y-1.5"}>
        {isLoading ? (
          <p
            className="text-[13px] italic"
            style={{ color: "var(--neuron-ink-muted)" }}
          >
            Loading...
          </p>
        ) : !isEditing ? (
          /* ── View mode ── */
          hasConsignees ? (
            consignees.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 py-1"
              >
                <User
                  size={13}
                  style={{ color: "var(--neuron-ink-muted)" }}
                  className="shrink-0"
                />
                <span
                  className="text-[13px]"
                  style={{ color: "var(--neuron-ink-primary)" }}
                >
                  {c.name}
                </span>
              </div>
            ))
          ) : (
            <p
              className="text-[13px] italic"
              style={{ color: "var(--neuron-ink-muted)" }}
            >
              None
            </p>
          )
        ) : (
          /* ── Edit mode ── */
          <>
            {/* Consignee list */}
            {hasConsignees &&
              consignees.map((c) =>
                editingId === c.id ? (
                  /* Editing row */
                  <div key={c.id} className="flex items-center gap-1.5">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, "edit")}
                      disabled={saving}
                      placeholder="Consignee Name..."
                      className="flex-1 px-2.5 py-1.5 text-[13px] rounded-lg border outline-none"
                      style={{
                        borderColor: "var(--theme-action-primary-bg)",
                        boxShadow: "0 0 0 1px var(--theme-action-primary-bg)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                    <button
                      onClick={confirmEdit}
                      disabled={saving || !editValue.trim()}
                      className="p-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-40"
                      title="Save"
                    >
                      <Check size={14} className="text-emerald-600" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="p-1 rounded hover:bg-[var(--theme-status-danger-bg)] transition-colors"
                      title="Cancel"
                    >
                      <X size={14} className="text-[var(--theme-status-danger-fg)]" />
                    </button>
                  </div>
                ) : (
                  /* Display row — individual bordered entry */
                  <div
                    key={c.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                    }}
                  >
                    <User
                      size={13}
                      style={{ color: "var(--neuron-ink-muted)" }}
                      className="shrink-0"
                    />
                    <span
                      className="flex-1 text-[13px]"
                      style={{ color: "var(--neuron-ink-primary)" }}
                    >
                      {c.name}
                    </span>
                    {/* Hover actions */}
                    <button
                      onClick={() => startEditing(c.id, c.name)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--theme-bg-surface-subtle)] transition-all"
                      title="Edit"
                    >
                      <Pencil size={12} style={{ color: "var(--neuron-ink-muted)" }} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--theme-status-danger-bg)] transition-all"
                      title="Delete"
                    >
                      <Trash2 size={12} className="text-red-400" />
                    </button>
                  </div>
                )
              )}

            {/* Inline add input */}
            {isAdding ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={addInputRef}
                  type="text"
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "add")}
                  disabled={saving}
                  placeholder="Consignee Name..."
                  className="flex-1 px-2.5 py-1.5 text-[13px] rounded-lg border outline-none"
                  style={{
                    borderColor: "#0F766E",
                    boxShadow: "0 0 0 1px #0F766E",
                    color: "var(--neuron-ink-primary)",
                  }}
                />
                <button
                  onClick={confirmAdd}
                  disabled={saving || !addValue.trim()}
                  className="p-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-40"
                  title="Save"
                >
                  <Check size={14} className="text-emerald-600" />
                </button>
                <button
                  onClick={cancelAdd}
                  disabled={saving}
                  className="p-1 rounded hover:bg-[var(--theme-status-danger-bg)] transition-colors"
                  title="Cancel"
                >
                  <X size={14} className="text-[var(--theme-status-danger-fg)]" />
                </button>
              </div>
            ) : (
              /* Ghost row — subtle "Add consignee..." trigger */
              <div
                onClick={startAdding}
                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                style={{
                  border: "1px dashed var(--neuron-ui-border)",
                  backgroundColor: "transparent",
                }}
              >
                <User size={13} className="shrink-0 opacity-30" style={{ color: "var(--neuron-ink-muted)" }} />
                <span
                  className="text-[13px] italic opacity-40"
                  style={{ color: "var(--neuron-ink-muted)" }}
                >
                  Add consignee/shipper...
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});