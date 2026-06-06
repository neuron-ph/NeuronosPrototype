import { useState } from "react";
import { BookmarkPlus, Check, X } from "lucide-react";
import type { SellingPriceCategory } from "../../../types/pricing";
import { sellingCategoryToTemplateItems, createTemplate } from "../../../utils/categoryTemplates";
import { toast } from "../../ui/toast-utils";
import { useUser } from "../../../hooks/useUser";
import { usePermission } from "../../../context/PermissionProvider";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";

interface SaveAsTemplateInlineProps {
  category: SellingPriceCategory;
  onClose: () => void;
}

export function SaveAsTemplateInline({ category, onClose }: SaveAsTemplateInlineProps) {
  const { user } = useUser();
  // NEU-019 WG-13: templates are catalog data — creating one from the builder
  // needs the same knob as creating one in Catalog Management.
  const { can } = usePermission();
  const canCreateTemplates = can("acct_catalog", "create");
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.category_name);
  const [saving, setSaving] = useState(false);

  const catalogItems = category.line_items.filter((i) => i.catalog_item_id);

  const handleSave = async () => {
    if (!canCreateTemplates) return; // WG-13 backstop
    if (!name.trim() || catalogItems.length === 0) return;
    setSaving(true);
    try {
      const items = sellingCategoryToTemplateItems(category);
      await createTemplate({
        name: name.trim(),
        category_name: category.category_name,
        catalog_category_id: category.catalog_category_id,
        items,
        created_by: user?.id,
        created_by_name: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.templates() });
      toast.success("Template saved");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  if (catalogItems.length === 0) {
    return (
      <div style={{
        padding: "10px 16px",
        backgroundColor: "#FEF3C7",
        borderBottom: "1px solid var(--theme-border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "12px",
        color: "#92400E",
      }}>
        <span>No catalog-linked items to save as template.</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "#92400E" }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "10px 16px",
      backgroundColor: "var(--theme-bg-surface-tint, #F0FDFA)",
      borderBottom: "1px solid var(--theme-border-default)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    }}>
      <BookmarkPlus size={14} style={{ color: "var(--neuron-brand-green)", flexShrink: 0 }} />
      <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", flexShrink: 0 }}>
        Save {catalogItems.length} item{catalogItems.length !== 1 ? "s" : ""} as
      </span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        placeholder="Template name..."
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onClose();
        }}
        style={{
          flex: 1,
          padding: "5px 8px",
          fontSize: "13px",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          backgroundColor: "var(--theme-bg-surface)",
          minWidth: "120px",
        }}
      />
      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        style={{
          padding: "5px 10px",
          fontSize: "12px",
          fontWeight: 600,
          color: "white",
          backgroundColor: !name.trim() || saving ? "var(--neuron-ui-muted)" : "var(--neuron-brand-green)",
          border: "none",
          borderRadius: "6px",
          cursor: !name.trim() || saving ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        <Check size={13} />
        {saving ? "Saving..." : "Save"}
      </button>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          color: "var(--theme-text-muted)",
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
