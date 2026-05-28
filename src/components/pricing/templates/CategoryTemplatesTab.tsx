import { useState, useRef } from "react";
import {
  Plus, Trash2, Pencil, ChevronDown, ChevronRight,
  FileText, X, Check, Search, Package,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../../../utils/categoryTemplates";
import type { CategoryTemplate, TemplateItemEntry } from "../../../types/categoryTemplates";
import { toast } from "../../ui/toast-utils";
import { NeuronModal } from "../../ui/NeuronModal";
import { useUser } from "../../../hooks/useUser";
import { supabase } from "../../../utils/supabase/client";
import { CatalogItemCombobox } from "../../shared/pricing/CatalogItemCombobox";

export function CategoryTemplatesTab() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: queryKeys.catalog.templates(),
    queryFn: fetchTemplates,
  });

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteTemplate(pendingDeleteId);
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.templates() });
      toast.success("Template deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
    setPendingDeleteId(null);
  };

  const handleSaveEdit = async (template: CategoryTemplate) => {
    try {
      await updateTemplate(template.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        updated_by: user?.id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.templates() });
      toast.success("Template updated");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  // Group by category_name
  const grouped = filtered.reduce<Record<string, CategoryTemplate[]>>((acc, t) => {
    const key = t.category_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexShrink: 0 }}>
        <div style={{ position: "relative", width: "280px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              fontSize: "13px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              backgroundColor: "var(--theme-bg-surface)",
              boxSizing: "border-box",
            }}
          />
        </div>
        {!showBuilder && (
          <button
            onClick={() => setShowBuilder(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              color: "white",
              backgroundColor: "var(--neuron-brand-green)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <Plus size={16} />
            Create Template
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── Inline Builder ── */}
        {showBuilder && (
          <InlineTemplateBuilder
            onClose={() => setShowBuilder(false)}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.catalog.templates() });
              setShowBuilder(false);
            }}
          />
        )}

        {/* ── Template list ── */}
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
            Loading templates...
          </div>
        ) : Object.keys(grouped).length === 0 && !showBuilder ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
            {templates.length === 0
              ? "No templates yet. Create one above or save from a quotation's category menu."
              : "No matching templates."}
          </div>
        ) : (
          Object.entries(grouped).map(([categoryName, catTemplates]) => (
            <div key={categoryName}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
                {categoryName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {catTemplates.map((t) => {
                  const isExpanded = expandedId === t.id;
                  const isEditing = editingId === t.id;
                  return (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "10px",
                        backgroundColor: "var(--theme-bg-surface)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{ display: "flex", alignItems: "center", padding: "10px 16px", gap: "12px", cursor: "pointer" }}
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      >
                        {isExpanded ? <ChevronDown size={16} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />}
                        <FileText size={16} style={{ color: "var(--neuron-brand-green)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus style={{ flex: 1, padding: "4px 8px", fontSize: "14px", border: "1px solid var(--neuron-ui-border)", borderRadius: "4px" }} />
                              <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description..." style={{ width: "180px", padding: "4px 8px", fontSize: "13px", border: "1px solid var(--neuron-ui-border)", borderRadius: "4px" }} />
                              <button onClick={() => handleSaveEdit(t)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--neuron-brand-green)" }}><Check size={16} /></button>
                              <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--neuron-ink-muted)" }}><X size={16} /></button>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>{t.name}</div>
                              {t.description && <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "1px" }}>{t.description}</div>}
                            </>
                          )}
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", flexShrink: 0 }}>{t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <IconBtn icon={<Pencil size={14} />} onClick={() => { setEditingId(t.id); setEditName(t.name); setEditDescription(t.description || ""); }} />
                          <IconBtn icon={<Trash2 size={14} />} danger onClick={() => setPendingDeleteId(t.id)} />
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid var(--theme-border-default)", padding: "12px 16px", backgroundColor: "var(--theme-bg-surface-subtle)" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {t.items.map((item, idx) => (
                              <span key={idx} style={{ padding: "4px 10px", fontSize: "12px", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--theme-border-default)", borderRadius: "6px", color: "var(--theme-text-primary)" }}>
                                {item.description}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <NeuronModal
        isOpen={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="Delete Template"
        description="This template will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        confirmIcon={<Trash2 size={15} />}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}

// ── Small icon button helper ──

function IconBtn({ icon, onClick, danger }: { icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: "6px", color: "var(--theme-text-muted)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = danger ? "#FEE2E2" : "var(--theme-bg-surface-subtle)";
        if (danger) e.currentTarget.style.color = "#DC2626";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--theme-text-muted)";
      }}
    >
      {icon}
    </button>
  );
}

// ── Inline Template Builder (looks like a quotation category card) ──

function InlineTemplateBuilder({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<TemplateItemEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<{ id: string; name: string }[]>([]);
  const [loadedCats, setLoadedCats] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const categoryBtnRef = useRef<HTMLButtonElement>(null);

  if (!loadedCats) {
    supabase
      .from("catalog_categories")
      .select("id, name")
      .in("side", ["revenue", "both"])
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCatalogCategories(data);
        setLoadedCats(true);
      });
  }

  const addItem = (catalogItemId: string, desc: string) => {
    if (items.some((i) => i.catalog_item_id === catalogItemId)) return;
    setItems((prev) => [...prev, { catalog_item_id: catalogItemId, description: desc }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedCategory || items.length === 0) return;
    setSaving(true);
    try {
      await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        category_name: selectedCategory.name,
        catalog_category_id: selectedCategory.id,
        items,
        created_by: user?.id,
        created_by_name: user?.name,
      });
      toast.success("Template created");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim() && selectedCategory && items.length > 0 && !saving;

  return (
    <div style={{
      border: "2px solid var(--neuron-brand-green)",
      borderRadius: "10px",
      backgroundColor: "var(--theme-bg-surface)",
      overflow: "hidden",
    }}>
      {/* ── Card header (like a category header) ── */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface-subtle)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        borderBottom: "1px solid var(--theme-border-default)",
      }}>
        <Package size={16} style={{ color: "var(--neuron-brand-green)", flexShrink: 0 }} />

        {/* Category selector — looks like a clickable header label */}
        {selectedCategory ? (
          <button
            ref={categoryBtnRef}
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 0",
            }}
          >
            {selectedCategory.name}
            <ChevronDown size={14} style={{ color: "var(--theme-text-muted)" }} />
          </button>
        ) : (
          <button
            ref={categoryBtnRef}
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--neuron-brand-green)",
              background: "none",
              border: "1px dashed var(--neuron-brand-green)",
              borderRadius: "6px",
              cursor: "pointer",
              padding: "4px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Select Category
            <ChevronDown size={14} />
          </button>
        )}

        {/* Category picker dropdown */}
        {showCategoryPicker && (
          <CategoryPickerDropdown
            categories={catalogCategories}
            selected={selectedCategory?.id}
            onSelect={(cat) => {
              setSelectedCategory(cat);
              if (!name.trim()) setName(cat.name);
              setShowCategoryPicker(false);
            }}
            onClose={() => setShowCategoryPicker(false)}
            anchorRef={categoryBtnRef}
          />
        )}

        <div style={{ flex: 1 }} />

        {/* Save / Cancel in header */}
        <button
          onClick={onClose}
          style={{
            padding: "5px 10px",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--theme-text-muted)",
            backgroundColor: "transparent",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: "5px 12px",
            fontSize: "12px",
            fontWeight: 600,
            color: "white",
            backgroundColor: canSave ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
            border: "none",
            borderRadius: "6px",
            cursor: canSave ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Check size={14} />
          {saving ? "Saving..." : "Save Template"}
        </button>
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: "16px" }}>
        {/* Name + Description row */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard LCL Origin Charges"
              autoFocus
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "13px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "13px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Items list (like quotation line items) */}
        {selectedCategory ? (
          <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
            {/* Items header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 12px",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              borderBottom: "1px solid var(--theme-border-default)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--theme-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}>
              <span style={{ flex: 1 }}>Line Items</span>
              <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Item rows */}
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--theme-border-default)",
                  gap: "10px",
                  fontSize: "13px",
                  color: "var(--theme-text-primary)",
                }}
              >
                <span style={{ width: "24px", fontSize: "11px", color: "var(--theme-text-muted)", textAlign: "center", flexShrink: 0 }}>
                  {idx + 1}
                </span>
                <span style={{ flex: 1 }}>{item.description}</span>
                <button
                  onClick={() => removeItem(idx)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "var(--theme-text-muted)",
                    borderRadius: "4px",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#DC2626"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Add item row */}
            <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "24px", fontSize: "11px", color: "var(--theme-text-muted)", textAlign: "center", flexShrink: 0 }}>
                <Plus size={12} />
              </span>
              <div style={{ flex: 1 }}>
                <CatalogItemCombobox
                  value=""
                  onChange={(desc: string, catalogItemId?: string) => {
                    if (catalogItemId && desc) addItem(catalogItemId, desc);
                  }}
                  side="revenue"
                  categoryId={selectedCategory.id}
                  placeholder="Type to add item from catalog..."
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            padding: "32px",
            textAlign: "center",
            border: "1px dashed var(--theme-border-default)",
            borderRadius: "8px",
            color: "var(--theme-text-muted)",
            fontSize: "13px",
          }}>
            Select a category above to start adding line items.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category Picker Dropdown ──

function CategoryPickerDropdown({
  categories,
  selected,
  onSelect,
  onClose,
  anchorRef,
}: {
  categories: { id: string; name: string }[];
  selected?: string;
  onSelect: (cat: { id: string; name: string }) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Position below anchor
  const rect = anchorRef.current?.getBoundingClientRect();
  const top = rect ? rect.bottom + 4 : 100;
  const left = rect ? rect.left : 100;

  // Click outside
  useState(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  });

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top,
        left,
        width: "260px",
        maxHeight: "300px",
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        zIndex: 100,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ padding: "8px", borderBottom: "1px solid var(--theme-border-default)" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          autoFocus
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: "13px",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "4px",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: selected === c.id ? 600 : 400,
              color: selected === c.id ? "var(--neuron-brand-green)" : "var(--theme-text-primary)",
              backgroundColor: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
