// CatalogManagementPage — Admin page for managing the line-item Catalog
// Lives under Accounting → Auditing → Item Catalog tab
//
// Tab structure:
//   [Items]  |  [Rate Matrix]
//
// Catalog is a pure taxonomy: Category → Item Name.
// No type (charge/expense), no price defaults, no service types.
// Context (charge vs expense) is determined by where the line item lives.

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import {
  Search, Plus, Pencil, X, Check, RotateCcw, AlertTriangle,
  Tag, Info, Grid3X3, ChevronDown, MoreHorizontal,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { ChargeExpenseMatrix } from "./ChargeExpenseMatrix";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CatalogItem, CatalogCategory } from "../shared/pricing/CatalogItemCombobox";

// ==================== TYPES ====================

type Tab = "items" | "matrix";

// ==================== CONSTANTS ====================

const TEAL = "var(--theme-action-primary-bg)";

// ==================== MAIN COMPONENT ====================

export function CatalogManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--theme-bg-surface)" }}>
      <div style={{ padding: "32px 48px", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

        {/* ── Page Header ── */}
        <div style={{ marginBottom: "24px", flexShrink: 0 }}>
          <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
            Catalog
          </h1>
          <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
            Registry of line item names used across quotations, billing, and expenses.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: activeTab === "matrix" ? "hidden" : "visible" }}>

          {/* ── Tab Bar ── */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--theme-border-default)", marginBottom: "20px" }}>
            <button
              onClick={() => setActiveTab("items")}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", fontSize: "13px",
                fontWeight: activeTab === "items" ? 600 : 400,
                color: activeTab === "items" ? TEAL : "var(--theme-text-muted)",
                background: "none", border: "none",
                borderBottom: activeTab === "items" ? `2px solid ${TEAL}` : "2px solid transparent",
                cursor: "pointer", marginBottom: "-1px",
              }}
            >
              Items
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-default)", margin: "0 8px" }} />

            <button
              onClick={() => setActiveTab("matrix")}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", fontSize: "13px",
                fontWeight: activeTab === "matrix" ? 600 : 400,
                color: activeTab === "matrix" ? TEAL : "var(--theme-text-muted)",
                background: "none", border: "none",
                borderBottom: activeTab === "matrix" ? `2px solid ${TEAL}` : "2px solid transparent",
                cursor: "pointer", marginBottom: "-1px",
              }}
            >
              <Grid3X3 size={14} />
              Rate Matrix
            </button>
          </div>

          {/* ── Tab Content ── */}
          {activeTab === "items" && (
            <ItemsTab
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
            />
          )}
          {activeTab === "matrix" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <ChargeExpenseMatrix />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== ITEMS TAB ====================

function ItemsTab({
  filterCategory,
  setFilterCategory,
}: {
  filterCategory: string;
  setFilterCategory: (v: string) => void;
}) {
  const queryClient = useQueryClient();

  // ── Query 1: catalog items with category join ──
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: queryKeys.catalog.items(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_items")
        .select("id, name, category_id, created_at, updated_at, catalog_categories(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((i: any) => ({
        id: i.id,
        name: i.name,
        category_id: i.category_id,
        category_name: i.catalog_categories?.name ?? null,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })) as CatalogItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Query 2: categories ──
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Query 3: usage counts via RPC ──
  const { data: usageRows = [] } = useQuery({
    queryKey: queryKeys.catalog.usageCounts(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_usage_counts");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived data ──
  const usageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of usageRows) {
      if ((row as any).catalog_item_id) map[(row as any).catalog_item_id] = Number((row as any).usage_count);
    }
    return map;
  }, [usageRows]);

  const stats = useMemo(() => {
    const catCountMap: Record<string, number> = {};
    for (const item of items) {
      if (item.category_id) catCountMap[item.category_id] = (catCountMap[item.category_id] ?? 0) + 1;
    }
    const totalBilling = usageRows.reduce((sum, r) => sum + Number((r as any).usage_count), 0);
    const linkedBilling = usageRows.reduce((sum, r) => sum + Number((r as any).usage_count), 0);
    return {
      totalItems: items.length,
      categories: categories.length,
      linkedPct: totalBilling > 0 ? Math.round((linkedBilling / totalBilling) * 100) : null,
      catCountMap,
    };
  }, [items, categories, usageRows]);

  const categoriesWithCount = useMemo(
    () => (categories as any[]).map((c: any) => ({ ...c, item_count: stats.catCountMap[c.id] ?? 0 })),
    [categories, stats.catCountMap],
  );

  const isLoading = itemsLoading;

  const invalidateCatalog = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all() });
  }, [queryClient]);

  const [searchQuery, setSearchQuery] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogItem>>({});
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // ── Category grouping ──
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; category_id: string | null }>({
    name: "",
    category_id: null,
  });

  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState("");

  const [impactItem, setImpactItem] = useState<CatalogItem | null>(null);
  const [impactCounts, setImpactCounts] = useState<{ billing: number; expenses: number } | null>(null);
  const [relinkTarget, setRelinkTarget] = useState<string>("");
  const [impactLoading, setImpactLoading] = useState(false);

  // ── Actions ──

  const handleSave = async (id: string) => {
    const { catalog_categories: _cc, category_name: _cn, ...updates } = editForm as any;
    const { error } = await supabase.from("catalog_items").update({
      name: updates.name,
      category_id: updates.category_id ?? null,
    }).eq("id", id);
    if (!error) {
      toast.success("Item updated");
      setEditingId(null);
      invalidateCatalog();
    } else {
      toast.error(error.message || "Error updating item");
    }
  };

  const handleAddCategory = async () => {
    if (!addCategoryName.trim()) { toast.error("Category name is required"); return; }
    const maxOrder = Math.max(0, ...(categoriesWithCount as any[]).map((c: any) => c.sort_order ?? 0));
    const { error } = await supabase.from("catalog_categories").insert({
      id: `cat-${Date.now()}`,
      name: addCategoryName.trim(),
      sort_order: maxOrder + 1,
      is_default: false,
    });
    if (!error) {
      toast.success(`Category "${addCategoryName}" created`);
      setAddCategoryName("");
      setShowAddCategoryForm(false);
      invalidateCatalog();
    } else toast.error(error.message || "Error creating category");
  };

  const handleAdd = async () => {
    if (!addForm.name?.trim()) { toast.error("Name is required"); return; }
    const { error } = await supabase.from("catalog_items").insert({
      name: addForm.name.trim(),
      category_id: addForm.category_id || null,
    });
    if (!error) {
      toast.success(`Created "${addForm.name}"`);
      setShowAddForm(false);
      setAddForm({ name: "", category_id: null });
      invalidateCatalog();
    } else {
      toast.error(error.message || "Error creating item");
    }
  };

  const openDeactivateModal = async (item: CatalogItem) => {
    setImpactItem(item);
    setImpactCounts(null);
    setRelinkTarget("");
    setImpactLoading(true);
    try {
      const [{ count: billing }, { count: expenses }] = await Promise.all([
        supabase.from("billing_line_items").select("id", { count: "exact", head: true }).eq("catalog_item_id", item.id),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("catalog_item_id", item.id),
      ]);
      setImpactCounts({ billing: billing ?? 0, expenses: expenses ?? 0 });
    } catch {
      setImpactCounts({ billing: 0, expenses: 0 });
    } finally {
      setImpactLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!impactItem) return;
    if (relinkTarget) {
      await Promise.all([
        supabase.from("billing_line_items").update({ catalog_item_id: relinkTarget }).eq("catalog_item_id", impactItem.id),
        supabase.from("expenses").update({ catalog_item_id: relinkTarget }).eq("catalog_item_id", impactItem.id),
      ]);
    }
    const { error } = await supabase.from("catalog_items").delete().eq("id", impactItem.id);
    if (!error) {
      toast.success(`"${impactItem.name}" deleted`);
      setImpactItem(null);
      invalidateCatalog();
    } else {
      toast.error(error.message || "Error deleting item");
    }
  };

  // ── Filtering ──

  const filtered = items.filter(item => {
    if (filterCategory !== "all" && item.category_id !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        ((item as any).category_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group filtered items by category when no category filter is active
  const grouped = useMemo(() => {
    if (filterCategory !== "all") return null;
    const map = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      const key = item.category_id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const result: { key: string; category: CatalogCategory | null; items: CatalogItem[] }[] = [];
    for (const cat of categoriesWithCount) {
      if (map.has((cat as any).id)) result.push({ key: (cat as any).id, category: cat as any, items: map.get((cat as any).id)! });
    }
    if (map.has("__none__")) result.push({ key: "__none__", category: null, items: map.get("__none__")! });
    return result;
  }, [filtered, categoriesWithCount, filterCategory]);

  const allCollapsed = !!grouped && grouped.length > 0 && collapsedGroups.size === grouped.length;
  const collapseAll = () => setCollapsedGroups(new Set(grouped?.map(g => g.key) ?? []));
  const expandAll = () => setCollapsedGroups(new Set());

  const handleCategoryRename = async (id: string) => {
    if (!renamingValue.trim()) return;
    const { error } = await supabase.from("catalog_categories").update({ name: renamingValue.trim() }).eq("id", id);
    if (!error) { toast.success("Category renamed"); setRenamingCatId(null); invalidateCatalog(); }
    else toast.error(error.message || "Error renaming");
  };

  const handleCategoryDelete = async (cat: CatalogCategory) => {
    if ((cat.item_count ?? 0) > 0) {
      toast.error(`${cat.item_count} item${cat.item_count !== 1 ? "s" : ""} in this category — reassign them first`);
      return;
    }
    const { error } = await supabase.from("catalog_categories").delete().eq("id", cat.id);
    if (!error) {
      if (filterCategory === cat.id) setFilterCategory("all");
      toast.success(`"${cat.name}" deleted`);
      invalidateCatalog();
    } else toast.error(error.message || "Error deleting");
  };

  const otherItems = items.filter(i => i.id !== impactItem?.id);

  const { linkedPct } = stats;

  // ── Render ──

  return (
    <>
      {/* Delete Impact Modal */}
      {impactItem && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--theme-bg-surface)", borderRadius: "12px",
            width: "480px", padding: "24px", boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <AlertTriangle size={20} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0 }} />
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                Delete "{impactItem.name}"?
              </h2>
            </div>
            {impactLoading ? (
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "20px" }}>Checking references...</p>
            ) : impactCounts && (impactCounts.billing > 0 || impactCounts.expenses > 0) ? (
              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "12px" }}>This item is referenced by:</p>
                <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                  {impactCounts.billing > 0 && (
                    <span style={impactChipStyle}>{impactCounts.billing} billing line{impactCounts.billing !== 1 ? "s" : ""}</span>
                  )}
                  {impactCounts.expenses > 0 && (
                    <span style={impactChipStyle}>{impactCounts.expenses} expense{impactCounts.expenses !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <label style={{ fontSize: "12px", color: "var(--theme-text-muted)", display: "block", marginBottom: "6px" }}>
                  Re-link existing records to another item (optional):
                </label>
                <select
                  value={relinkTarget}
                  onChange={e => setRelinkTarget(e.target.value)}
                  style={{ ...inputStyle, fontSize: "12px" }}
                >
                  <option value="">— Keep as-is (records stay linked to this item) —</option>
                  {otherItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "20px" }}>
                No billing lines or expenses reference this item. Safe to delete.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={() => setImpactItem(null)} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={impactLoading}
                style={{ ...saveBtnStyle, backgroundColor: "var(--theme-status-danger-fg)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {isLoading ? (
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
          <div style={{ height: "13px", width: "72px", backgroundColor: "var(--theme-border-default)", borderRadius: "4px" }} />
          <div style={{ height: "13px", width: "72px", backgroundColor: "var(--theme-border-default)", borderRadius: "4px" }} />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", fontSize: "13px", color: "var(--theme-text-muted)" }}>
          <span><strong style={{ color: TEAL, fontWeight: 600 }}>{stats.totalItems}</strong> items</span>
          <span style={{ color: "var(--theme-border-default)" }}>·</span>
          <span><strong style={{ color: "var(--theme-text-primary)", fontWeight: 600 }}>{stats.categories}</strong> categories</span>
          {linkedPct !== null && (
            <>
              <span style={{ color: "var(--theme-border-default)" }}>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <strong style={{
                  fontWeight: 600,
                  color: linkedPct >= 90 ? "var(--theme-status-success-fg)" : linkedPct >= 50 ? "var(--theme-status-warning-fg)" : "var(--theme-status-danger-fg)",
                }}>{linkedPct}%</strong>
                linked
                <span
                  title="% of billing lines linked to a catalog item. Low rates mean freetext entries are bypassing the catalog."
                  style={{ cursor: "help", color: "var(--theme-text-muted)", display: "flex", alignItems: "center" }}
                >
                  <Info size={11} />
                </span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "280px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            style={{ ...inputStyle, paddingLeft: "30px" }}
          />
        </div>

        <CategoryFilterPopover
          filterValue={filterCategory}
          onFilterChange={setFilterCategory}
          categories={categoriesWithCount as CatalogCategory[]}
          onMutate={invalidateCatalog}
        />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => { setShowAddCategoryForm(true); setShowAddForm(false); }}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "7px 14px", fontSize: "13px", fontWeight: 500,
              color: TEAL, background: "none",
              border: "1px solid var(--theme-border-default)", borderRadius: "7px", cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Add Category
          </button>
          <button
            onClick={() => { setShowAddForm(true); setShowAddCategoryForm(false); }}
            style={{
              ...saveBtnStyle,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>
      </div>

      {/* Add Category Form */}
      {showAddCategoryForm && (
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: `1px solid ${TEAL}`,
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "12px",
        }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Category Name *</label>
              <input
                type="text"
                value={addCategoryName}
                onChange={e => setAddCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") { setShowAddCategoryForm(false); setAddCategoryName(""); } }}
                autoFocus
                placeholder="e.g. Destination Charges"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => { setShowAddCategoryForm(false); setAddCategoryName(""); }} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleAddCategory} style={saveBtnStyle}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: `1px solid ${TEAL}`,
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "12px",
        }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Name *</label>
              <input
                type="text"
                value={addForm.name}
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAddForm(false); }}
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ flex: "0 0 180px" }}>
              <label style={labelStyle}>Category</label>
              <CustomDropdown
                value={addForm.category_id || ""}
                options={[
                  { value: "", label: "— None —" },
                  ...(categoriesWithCount as any[]).map((c: any) => ({ value: c.id, label: c.name })),
                ]}
                onChange={val => setAddForm({ ...addForm, category_id: val || null })}
                placeholder="— None —"
                size="sm"
              />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => setShowAddForm(false)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={handleAdd} style={saveBtnStyle}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "10px",
        overflow: "hidden",
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
      }}>
        {isLoading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--theme-text-muted)", fontSize: "13px" }}>
            {items.length === 0 ? (
              <span>
                No items yet.{" "}
                <button onClick={() => setShowAddForm(true)} style={{ color: TEAL, background: "none", border: "none", cursor: "pointer", fontSize: "13px", textDecoration: "underline" }}>
                  Add the first one
                </button>
              </span>
            ) : "No items match your filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col />
              <col style={{ width: "56px" }} />
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: "sticky", top: 0, backgroundColor: "var(--theme-bg-surface-subtle)", zIndex: 2, boxShadow: "0 1px 0 var(--theme-border-default)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {grouped && grouped.length > 0 && (
                      <button
                        onClick={allCollapsed ? expandAll : collapseAll}
                        title={allCollapsed ? "Expand all" : "Collapse all"}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", lineHeight: 1 }}
                      >
                        <ChevronDown size={13} style={{ transform: allCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 150ms" }} />
                      </button>
                    )}
                    Name
                  </div>
                </th>
                <th style={{ ...thStyle, position: "sticky", top: 0, backgroundColor: "var(--theme-bg-surface-subtle)", zIndex: 2, boxShadow: "0 1px 0 var(--theme-border-default)", width: "56px", textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                    Usage
                    <span title="Number of billing lines referencing this item" style={{ cursor: "help", color: "var(--theme-text-muted)", display: "flex" }}>
                      <Info size={11} />
                    </span>
                  </div>
                </th>
                <th style={{ ...thStyle, position: "sticky", top: 0, backgroundColor: "var(--theme-bg-surface-subtle)", zIndex: 2, boxShadow: "0 1px 0 var(--theme-border-default)", width: "44px" }} />
              </tr>
            </thead>
            <tbody>
              {grouped ? (
                // ── Grouped by category ──
                grouped.map(group => (
                  <Fragment key={group.key}>
                    {/* Category header row */}
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          position: "sticky",
                          top: "43px",
                          zIndex: 1,
                          backgroundColor: "var(--theme-bg-surface-tint)",
                          padding: "6px 16px",
                          borderBottom: "1px solid var(--theme-border-default)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            onClick={() => toggleGroup(group.key)}
                            style={{ padding: 0, border: "none", background: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", lineHeight: 1 }}
                          >
                            <ChevronDown size={13} style={{ transform: collapsedGroups.has(group.key) ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 150ms" }} />
                          </button>

                          {renamingCatId === group.key && group.category ? (
                            <>
                              <input
                                autoFocus
                                value={renamingValue}
                                onChange={e => setRenamingValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") handleCategoryRename(group.category!.id);
                                  if (e.key === "Escape") setRenamingCatId(null);
                                }}
                                style={{ fontSize: "11px", fontWeight: 600, padding: "2px 6px", border: `1px solid ${TEAL}`, borderRadius: "4px", outline: "none", letterSpacing: "0.04em", textTransform: "uppercase" }}
                              />
                              <button onClick={() => handleCategoryRename(group.category!.id)} style={{ ...iconBtnStyle, color: TEAL }} title="Save"><Check size={12} /></button>
                              <button onClick={() => setRenamingCatId(null)} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={12} /></button>
                            </>
                          ) : (
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {group.category?.name ?? "Uncategorized"}
                            </span>
                          )}

                          <span style={{ fontSize: "10px", color: "var(--theme-text-muted)", backgroundColor: "var(--theme-bg-surface-subtle)", padding: "1px 7px", borderRadius: "8px", fontWeight: 500 }}>
                            {group.items.length}
                          </span>

                          <div style={{ flex: 1 }} />

                          {group.category && !renamingCatId && (
                            <CategoryGroupMenu
                              category={group.category}
                              onRename={() => { setRenamingCatId(group.key); setRenamingValue(group.category!.name); }}
                              onDelete={() => handleCategoryDelete(group.category!)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Item rows */}
                    {!collapsedGroups.has(group.key) && group.items.map(item => (
                      editingId === item.id ? (
                        <ItemEditRow
                          key={item.id}
                          item={item}
                          editForm={editForm}
                          setEditForm={setEditForm}
                          categories={categoriesWithCount as CatalogCategory[]}
                          onSave={() => handleSave(item.id)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <ItemViewRow
                          key={item.id}
                          item={item}
                          usage={usageCounts[item.id] ?? 0}
                          hovered={hoveredRow === item.id}
                          onMouseEnter={() => setHoveredRow(item.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          onEdit={() => { setEditingId(item.id); setEditForm({ ...item }); }}
                          onDelete={() => openDeactivateModal(item)}
                          indent
                        />
                      )
                    ))}
                  </Fragment>
                ))
              ) : (
                // ── Flat view (category filter active) ──
                filtered.map(item => (
                  editingId === item.id ? (
                    <ItemEditRow
                      key={item.id}
                      item={item}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      categories={categoriesWithCount as CatalogCategory[]}
                      onSave={() => handleSave(item.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <ItemViewRow
                      key={item.id}
                      item={item}
                      usage={usageCounts[item.id] ?? 0}
                      hovered={hoveredRow === item.id}
                      onMouseEnter={() => setHoveredRow(item.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      onEdit={() => { setEditingId(item.id); setEditForm({ ...item }); }}
                      onDelete={() => openDeactivateModal(item)}
                      indent={false}
                    />
                  )
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ==================== ITEM VIEW ROW ====================

function ItemViewRow({
  item, usage, hovered, onMouseEnter, onMouseLeave, onEdit, onDelete, indent,
}: {
  item: CatalogItem;
  usage: number;
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  indent: boolean;
}) {
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--theme-border-default)",
        backgroundColor: hovered ? "var(--theme-state-hover)" : "transparent",
        transition: "background-color 150ms",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <td style={{ ...tdStyle, overflow: "hidden", maxWidth: 0, paddingLeft: indent ? "36px" : "16px" }}>
        <div style={{ fontWeight: 500, color: "var(--theme-text-primary)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.name}
        </div>
        {!indent && (item as any).category_name && (
          <div style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(item as any).category_name}
          </div>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        {usage > 0
          ? <span style={{ fontSize: "12px", fontWeight: 600, color: TEAL }}>{usage}</span>
          : <span style={{ fontSize: "12px", color: "var(--theme-border-default)" }}>—</span>}
      </td>
      <td style={{ ...tdStyle, textAlign: "center", padding: "12px 8px" }}>
        <RowActionsMenu
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

// ==================== ITEM EDIT ROW ====================

function ItemEditRow({
  item, editForm, setEditForm, categories, onSave, onCancel,
}: {
  item: CatalogItem;
  editForm: Partial<CatalogItem>;
  setEditForm: (f: Partial<CatalogItem>) => void;
  categories: CatalogCategory[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const categoryOptions = [
    { value: "", label: "— No category —" },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  return (
    <tr style={{ borderBottom: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-surface-subtle)" }}>
      <td style={{ ...tdStyle, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            value={editForm.name || ""}
            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            style={{ ...inputStyle, fontWeight: 500, flex: 1 }}
            autoFocus
          />
          <div style={{ flex: "0 0 160px" }}>
            <CustomDropdown
              value={(editForm as any).category_id || ""}
              options={categoryOptions}
              onChange={val => setEditForm({ ...editForm, category_id: val || null } as any)}
              placeholder="— No category —"
              size="sm"
            />
          </div>
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <span style={{ fontSize: "12px", color: "var(--theme-border-default)" }}>—</span>
      </td>
      <td style={{ ...tdStyle, textAlign: "center", padding: "12px 8px" }}>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
          <button onClick={onSave} title="Save" style={{ ...iconBtnStyle, color: TEAL }}><Check size={14} /></button>
          <button onClick={onCancel} title="Cancel" style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }}><X size={14} /></button>
        </div>
      </td>
    </tr>
  );
}

// ==================== ROW ACTIONS MENU ====================

function RowActionsMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 148 });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={open ? () => setOpen(false) : openMenu}
        style={{
          padding: "4px 6px", border: "none", background: "none",
          cursor: "pointer", color: "var(--theme-text-muted)", borderRadius: "6px",
          display: "flex", alignItems: "center",
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left,
            width: 148,
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 9999,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              width: "100%", padding: "8px 12px",
              fontSize: "13px", color: "var(--theme-text-primary)",
              background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Pencil size={13} /> Edit
          </button>
          <div style={{ height: "1px", backgroundColor: "var(--theme-bg-surface-subtle)", margin: "2px 0" }} />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              width: "100%", padding: "8px 12px",
              fontSize: "13px", color: "var(--theme-status-danger-fg)",
              background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <X size={13} /> Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ==================== CATEGORY GROUP MENU ====================

function CategoryGroupMenu({
  category, onRename, onDelete,
}: {
  category: CatalogCategory;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.right - 140 });
          }
          setOpen(o => !o);
        }}
        style={{ padding: "2px 4px", border: "none", background: "none", cursor: "pointer", color: "var(--theme-text-muted)", borderRadius: "4px", display: "flex", alignItems: "center" }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <MoreHorizontal size={13} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left,
            width: 140,
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 9999,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => { onRename(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", fontSize: "12px", color: "var(--theme-text-primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Pencil size={12} /> Rename
          </button>
          <div style={{ height: "1px", backgroundColor: "var(--theme-bg-surface-subtle)" }} />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", fontSize: "12px", color: (category.item_count ?? 0) > 0 ? "var(--theme-text-muted)" : "var(--theme-status-danger-fg)", background: "none", border: "none", cursor: (category.item_count ?? 0) > 0 ? "not-allowed" : "pointer", textAlign: "left" }}
            onMouseEnter={e => { if ((category.item_count ?? 0) === 0) e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)"; }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <X size={12} /> Delete category
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ==================== CATEGORY FILTER POPOVER ====================

function CategoryFilterPopover({
  filterValue, onFilterChange, categories, onMutate,
}: {
  filterValue: string;
  onFilterChange: (v: string) => void;
  categories: CatalogCategory[];
  onMutate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const selectedLabel = filterValue === "all"
    ? "All Categories"
    : categories.find(c => c.id === filterValue)?.name ?? "All Categories";

  const isFiltered = filterValue !== "all";

  const openPopover = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 230) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setRenamingId(null);
        setAddingNew(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    const { error } = await supabase.from("catalog_categories").update({ name: renameValue.trim() }).eq("id", id);
    if (!error) { toast.success("Category renamed"); setRenamingId(null); onMutate(); }
    else toast.error(error.message || "Error renaming");
  };

  const handleDelete = async (cat: CatalogCategory) => {
    if ((cat.item_count ?? 0) > 0) {
      toast.error(`${cat.item_count} item${cat.item_count !== 1 ? "s" : ""} use this category — reassign them first`);
      return;
    }
    const { error } = await supabase.from("catalog_categories").delete().eq("id", cat.id);
    if (!error) {
      if (filterValue === cat.id) onFilterChange("all");
      toast.success(`"${cat.name}" deleted`);
      onMutate();
    } else toast.error(error.message || "Error deleting");
  };

  const handleAddNew = async () => {
    if (!newName.trim()) return;
    const maxOrder = Math.max(0, ...categories.map(c => c.sort_order ?? 0));
    const { error } = await supabase.from("catalog_categories").insert({
      id: `cat-${Date.now()}`,
      name: newName.trim(),
      sort_order: maxOrder + 1,
      is_default: false,
    });
    if (!error) {
      toast.success(`Category "${newName}" created`);
      setNewName("");
      setAddingNew(false);
      onMutate();
    } else toast.error(error.message || "Error creating category");
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={open ? () => setOpen(false) : openPopover}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "7px 10px", fontSize: "12px",
          border: `1px solid ${isFiltered ? TEAL : "var(--theme-border-default)"}`,
          borderRadius: "8px",
          color: isFiltered ? TEAL : "var(--theme-text-primary)",
          backgroundColor: isFiltered ? "var(--theme-status-success-bg)" : "var(--theme-bg-surface)",
          cursor: "pointer", outline: "none", whiteSpace: "nowrap",
          fontWeight: isFiltered ? 600 : 400,
        }}
      >
        <Tag size={12} style={{ flexShrink: 0 }} />
        {selectedLabel}
        {isFiltered && (
          <span
            onMouseDown={e => { e.stopPropagation(); onFilterChange("all"); }}
            style={{ display: "flex", alignItems: "center", color: "var(--theme-text-muted)", marginLeft: "1px", cursor: "pointer" }}
          >
            <X size={11} />
          </span>
        )}
        <ChevronDown size={11} style={{ color: "var(--theme-text-muted)", marginLeft: "2px", flexShrink: 0 }} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left,
            width: pos.width, minWidth: 230,
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            zIndex: 9999, overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 12px 7px", borderBottom: "1px solid var(--theme-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Categories</span>
            <span style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>{categories.length} total</span>
          </div>

          <div
            onClick={() => { onFilterChange("all"); setOpen(false); }}
            style={{ padding: "8px 12px", cursor: "pointer", backgroundColor: filterValue === "all" ? "var(--theme-status-success-bg)" : "transparent", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <span style={{ flex: 1, fontSize: "13px", fontWeight: filterValue === "all" ? 600 : 400, color: filterValue === "all" ? TEAL : "var(--theme-text-primary)" }}>
              All Categories
            </span>
            <span style={{ fontSize: "11px", color: "var(--theme-text-muted)" }}>
              {categories.reduce((s, c) => s + (c.item_count ?? 0), 0)}
            </span>
          </div>

          <div style={{ borderTop: "1px solid var(--theme-border-subtle)" }} />

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {categories.map(cat => (
              <div
                key={cat.id}
                style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", backgroundColor: filterValue === cat.id ? "var(--theme-status-success-bg)" : "transparent", minHeight: 34 }}
              >
                {renamingId === cat.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(cat.id); if (e.key === "Escape") setRenamingId(null); }}
                      style={{ flex: 1, fontSize: "13px", padding: "3px 6px", border: `1px solid ${TEAL}`, borderRadius: "4px", outline: "none" }}
                    />
                    <button onClick={() => handleRename(cat.id)} style={{ ...iconBtnStyle, color: TEAL }} title="Save"><Check size={13} /></button>
                    <button onClick={() => setRenamingId(null)} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span
                      onClick={() => { onFilterChange(cat.id); setOpen(false); }}
                      style={{ flex: 1, fontSize: "13px", cursor: "pointer", fontWeight: filterValue === cat.id ? 600 : 400, color: filterValue === cat.id ? TEAL : "var(--theme-text-primary)" }}
                    >
                      {cat.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", minWidth: 18, textAlign: "right" }}>{cat.item_count ?? 0}</span>
                    <button onClick={e => { e.stopPropagation(); setRenamingId(cat.id); setRenameValue(cat.name); }} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Rename"><Pencil size={12} /></button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(cat); }} style={{ ...iconBtnStyle, color: (cat.item_count ?? 0) > 0 ? "var(--theme-border-default)" : "var(--theme-status-danger-fg)" }} title={(cat.item_count ?? 0) > 0 ? `${cat.item_count} items — reassign first` : "Delete"}><X size={12} /></button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--theme-border-subtle)", padding: "8px 12px" }}>
            {addingNew ? (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddNew(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }}
                  placeholder="Category name..."
                  style={{ flex: 1, fontSize: "12px", padding: "4px 8px", border: `1px solid ${TEAL}`, borderRadius: "5px", outline: "none" }}
                />
                <button onClick={handleAddNew} style={{ ...iconBtnStyle, color: TEAL }} title="Create"><Check size={13} /></button>
                <button onClick={() => { setAddingNew(false); setNewName(""); }} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={13} /></button>
              </div>
            ) : (
              <button
                onClick={() => setAddingNew(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: TEAL, fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", padding: "2px 0" }}
              >
                <Plus size={13} />
                New category
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ==================== SHARED STYLES ====================

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--theme-text-muted)",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.002em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "13px",
  verticalAlign: "middle",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--theme-text-muted)",
  display: "block",
  marginBottom: "3px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "13px",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "6px",
  color: "var(--theme-text-primary)",
  outline: "none",
  backgroundColor: "var(--theme-bg-surface)",
};

const iconBtnStyle: React.CSSProperties = {
  padding: "4px",
  border: "none",
  backgroundColor: "transparent",
  cursor: "pointer",
  color: "var(--theme-text-muted)",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "6px",
  border: "1px solid var(--theme-border-default)",
  backgroundColor: "var(--theme-bg-surface)",
  color: "var(--theme-text-muted)",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "6px",
  border: "none",
  backgroundColor: TEAL,
  color: "white",
  cursor: "pointer",
};

const impactChipStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 500,
  backgroundColor: "var(--theme-status-warning-bg)",
  color: "var(--theme-status-warning-fg)",
  border: "1px solid var(--theme-status-warning-border)",
};
