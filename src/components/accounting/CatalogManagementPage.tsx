// CatalogManagementPage — Catalog auditing tool for Accounting
// Lives under Accounting → Auditing → Item Catalog tab
//
// Tab structure:
//   [Items]  |  [Rate Matrix]
//
// Items sub-tabs:
//   [All]  |  [Billing]  |  [Expense]
//
// Catalog is a pure taxonomy: Category → Item Name.
// Items flow in from billing & expense transactions automatically.
// This page is for auditing, organizing, and maintaining the taxonomy.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Search, Plus, Pencil, X, Check, AlertTriangle,
  Tag, Grid3X3, ChevronDown, ChevronRight, MoreHorizontal,
  FolderOpen, ArrowRightLeft,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { ChargeExpenseMatrix } from "./ChargeExpenseMatrix";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CatalogItem, CatalogCategory } from "../shared/pricing/CatalogItemCombobox";

// ==================== TYPES ====================

type PrimaryTab = "items" | "matrix";
type SideFilter = "all" | "billing" | "expense";

interface CatalogCategoryWithSide extends CatalogCategory {
  side?: "revenue" | "expense" | "both";
}

// ==================== MAIN COMPONENT ====================

export function CatalogManagementPage() {
  const [activeTab, setActiveTab] = useState<PrimaryTab>("items");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--theme-bg-page)" }}>
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

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* ── Primary Tab Bar ── */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--theme-border-default)", marginBottom: "20px", flexShrink: 0 }}>
            <TabButton active={activeTab === "items"} onClick={() => setActiveTab("items")}>
              Items
            </TabButton>
            <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-default)", margin: "0 8px" }} />
            <TabButton active={activeTab === "matrix"} onClick={() => setActiveTab("matrix")} icon={<Grid3X3 size={14} />}>
              Rate Matrix
            </TabButton>
          </div>

          {/* ── Tab Content ── */}
          {activeTab === "items" && <ItemsTab />}
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

// ==================== TAB BUTTON ====================

function TabButton({ active, onClick, children, icon }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "10px 20px", fontSize: "13px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
        background: "none", border: "none",
        borderBottom: active ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
        cursor: "pointer", marginBottom: "-1px",
        transition: "color 150ms",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ==================== ITEMS TAB ====================

function ItemsTab() {
  const queryClient = useQueryClient();

  // ── State ──
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogItem>>({});
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; category_id: string | null }>({ name: "", category_id: null });
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState("");

  // ── Scroll fade state ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setShowTopFade(false); setShowBottomFade(false); return; }
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    setShowTopFade(canScroll && el.scrollTop > 8);
    setShowBottomFade(canScroll && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(updateScrollFade);
    return () => cancelAnimationFrame(raf);
  }, [updateScrollFade]);

  // ── Delete side panel state ──
  const [deletePanel, setDeletePanel] = useState<{
    item: CatalogItem;
    counts: { billing: number; expenses: number } | null;
    loading: boolean;
    relinkTarget: string;
  } | null>(null);

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
    staleTime: 0,
  });

  // ── Query 2: categories (with side) ──
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.catalog.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CatalogCategoryWithSide[];
    },
    staleTime: 0,
  });

  // ── Query 3: usage counts via RPC ──
  const { data: usageRows = [] } = useQuery({
    queryKey: queryKeys.catalog.usageCounts(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_catalog_usage_counts");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  // ── Derived data ──
  const usageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of usageRows) {
      if ((row as any).catalog_item_id) map[(row as any).catalog_item_id] = Number((row as any).usage_count);
    }
    return map;
  }, [usageRows]);

  const categoriesWithCount = useMemo(() => {
    const catCountMap: Record<string, number> = {};
    for (const item of items) {
      if (item.category_id) catCountMap[item.category_id] = (catCountMap[item.category_id] ?? 0) + 1;
    }
    return categories.map((c: any) => ({ ...c, item_count: catCountMap[c.id] ?? 0 }));
  }, [categories, items]);

  const invalidateCatalog = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all() });
  }, [queryClient]);

  // ── Side-filtered categories ──
  const visibleCategories = useMemo(() => {
    if (sideFilter === "all") return categoriesWithCount;
    const targetSide = sideFilter === "billing" ? "revenue" : "expense";
    return categoriesWithCount.filter((c: CatalogCategoryWithSide) =>
      c.side === targetSide || c.side === "both" || !c.side
    );
  }, [categoriesWithCount, sideFilter]);

  // ── Filtering ──
  const filtered = useMemo(() => {
    const visibleCatIds = new Set(visibleCategories.map((c: any) => c.id));
    return items.filter(item => {
      // Side filter: only show items in visible categories
      if (sideFilter !== "all" && item.category_id && !visibleCatIds.has(item.category_id)) return false;
      // Category filter
      if (filterCategory !== "all" && item.category_id !== filterCategory) return false;
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          ((item as any).category_name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, visibleCategories, sideFilter, filterCategory, searchQuery]);

  // ── Group filtered items by category ──
  const grouped = useMemo(() => {
    if (filterCategory !== "all") return null;
    const map = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      const key = item.category_id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const result: { key: string; category: CatalogCategoryWithSide | null; items: CatalogItem[] }[] = [];
    for (const cat of visibleCategories) {
      if (map.has(cat.id)) result.push({ key: cat.id, category: cat as CatalogCategoryWithSide, items: map.get(cat.id)! });
    }
    if (map.has("__none__")) result.push({ key: "__none__", category: null, items: map.get("__none__")! });
    return result;
  }, [filtered, visibleCategories, filterCategory]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allCollapsed = !!grouped && grouped.length > 0 && grouped.every(g => collapsedGroups.has(g.key));
  const collapseAll = () => setCollapsedGroups(new Set(grouped?.map(g => g.key) ?? []));
  const expandAll = () => setCollapsedGroups(new Set());

  // ── CRUD Handlers ──

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
    const maxOrder = Math.max(0, ...categoriesWithCount.map((c: any) => c.sort_order ?? 0));
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
      id: `ci-${Date.now()}`,
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

  const openDeletePanel = async (item: CatalogItem) => {
    setDeletePanel({ item, counts: null, loading: true, relinkTarget: "" });
    try {
      const [{ count: billing }, { count: expenses }] = await Promise.all([
        supabase.from("billing_line_items").select("id", { count: "exact", head: true }).eq("catalog_item_id", item.id),
        supabase.from("evoucher_line_items").select("id", { count: "exact", head: true }).eq("catalog_item_id", item.id),
      ]);
      setDeletePanel(prev => prev ? { ...prev, counts: { billing: billing ?? 0, expenses: expenses ?? 0 }, loading: false } : null);
    } catch {
      setDeletePanel(prev => prev ? { ...prev, counts: { billing: 0, expenses: 0 }, loading: false } : null);
    }
  };

  const confirmDelete = async () => {
    if (!deletePanel) return;
    const { item, relinkTarget } = deletePanel;
    if (relinkTarget) {
      await Promise.all([
        supabase.from("billing_line_items").update({ catalog_item_id: relinkTarget }).eq("catalog_item_id", item.id),
        supabase.from("evoucher_line_items").update({ catalog_item_id: relinkTarget }).eq("catalog_item_id", item.id),
      ]);
    }
    const { error } = await supabase.from("catalog_items").delete().eq("id", item.id);
    if (!error) {
      toast.success(`"${item.name}" deleted`);
      setDeletePanel(null);
      invalidateCatalog();
    } else {
      toast.error(error.message || "Error deleting item");
    }
  };

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

  const otherItems = items.filter(i => i.id !== deletePanel?.item.id);

  // ── Sub-tab counts ──
  const tabCounts = useMemo(() => {
    const allCatIds = new Set(categoriesWithCount.map((c: any) => c.id));
    const revCatIds = new Set(categoriesWithCount.filter((c: CatalogCategoryWithSide) => c.side === "revenue" || c.side === "both" || !c.side).map((c: any) => c.id));
    const expCatIds = new Set(categoriesWithCount.filter((c: CatalogCategoryWithSide) => c.side === "expense" || c.side === "both").map((c: any) => c.id));
    return {
      all: items.length,
      billing: items.filter(i => i.category_id && revCatIds.has(i.category_id)).length,
      expense: items.filter(i => i.category_id && expCatIds.has(i.category_id)).length,
    };
  }, [items, categoriesWithCount]);

  const isLoading = itemsLoading;

  // ── Render ──
  return (
    <>
      {/* ── Delete Side Panel ── */}
      {deletePanel && (
        <DeleteSidePanel
          item={deletePanel.item}
          counts={deletePanel.counts}
          loading={deletePanel.loading}
          relinkTarget={deletePanel.relinkTarget}
          onRelinkChange={(val) => setDeletePanel(prev => prev ? { ...prev, relinkTarget: val } : null)}
          otherItems={otherItems}
          onConfirm={confirmDelete}
          onClose={() => setDeletePanel(null)}
        />
      )}

      {/* ── Sub-tabs: All | Billing | Expense ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "16px", flexShrink: 0 }}>
        <SubTabPill active={sideFilter === "all"} onClick={() => setSideFilter("all")} count={tabCounts.all}>
          All
        </SubTabPill>
        <SubTabPill active={sideFilter === "billing"} onClick={() => setSideFilter("billing")} count={tabCounts.billing}>
          Billing
        </SubTabPill>
        <SubTabPill active={sideFilter === "expense"} onClick={() => setSideFilter("expense")} count={tabCounts.expense}>
          Expense
        </SubTabPill>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
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

        {/* Expand/Collapse all */}
        {grouped && grouped.length > 1 && (
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            style={ghostBtnStyle}
            title={allCollapsed ? "Expand all" : "Collapse all"}
          >
            {allCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            {allCollapsed ? "Expand" : "Collapse"}
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => { setShowAddCategoryForm(true); setShowAddForm(false); }}
            style={ghostBtnStyle}
          >
            <Plus size={14} />
            Category
          </button>
          <button
            onClick={() => { setShowAddForm(true); setShowAddCategoryForm(false); }}
            style={ghostBtnStyle}
          >
            <Plus size={14} />
            Item
          </button>
        </div>
      </div>

      {/* ── Add Category Inline Form ── */}
      {showAddCategoryForm && (
        <div style={inlineFormStyle}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Category Name</label>
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

      {/* ── Add Item Inline Form ── */}
      {showAddForm && (
        <div style={inlineFormStyle}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={labelStyle}>Name</label>
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

      {/* ── Column Header ── */}
      {!isLoading && filtered.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center",
          padding: "0 16px", height: "28px", flexShrink: 0,
          fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)",
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: "48px", textAlign: "right", flexShrink: 0 }}>Usage</span>
          <span style={{ width: "32px", flexShrink: 0 }} />
        </div>
      )}

      {/* ── Category Cards ── */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={scrollRef}
        onScroll={updateScrollFade}
        className="scrollbar-hide"
        style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "24px" }}
      >
        {isLoading ? (
          // Skeleton cards
          <>
            {[1, 2, 3].map(i => (
              <div key={i} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={{ height: "14px", width: "120px", backgroundColor: "var(--theme-border-default)", borderRadius: "4px" }} />
                  <div style={{ height: "14px", width: "28px", backgroundColor: "var(--theme-border-default)", borderRadius: "8px", marginLeft: "8px" }} />
                </div>
                {[1, 2, 3].map(j => (
                  <div key={j} style={{ padding: "10px 16px", borderTop: "1px solid var(--theme-border-subtle)", display: "flex", alignItems: "center" }}>
                    <div style={{ height: "13px", width: `${80 + j * 30}px`, backgroundColor: "var(--theme-border-default)", borderRadius: "3px" }} />
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: "64px 24px", textAlign: "center",
            border: "1px solid var(--theme-border-default)", borderRadius: "var(--neuron-radius-m)",
            backgroundColor: "var(--theme-bg-surface)",
          }}>
            <FolderOpen size={32} style={{ color: "var(--theme-border-default)", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginBottom: "4px", fontWeight: 500 }}>
              {items.length === 0
                ? "No catalog items yet"
                : `No items match "${searchQuery}"`}
            </p>
            {items.length === 0 && (
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                Items are added automatically from billing and expense transactions.
              </p>
            )}
          </div>
        ) : grouped ? (
          // ── Grouped by category (card layout) ──
          grouped.map(group => (
            <div key={group.key} style={cardStyle}>
              {/* Card Header */}
              <div
                style={cardHeaderStyle}
                onClick={() => toggleGroup(group.key)}
              >
                <ChevronDown
                  size={14}
                  style={{
                    color: "var(--theme-text-muted)",
                    transform: collapsedGroups.has(group.key) ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 150ms",
                    flexShrink: 0,
                  }}
                />

                {renamingCatId === group.key && group.category ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }} onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={e => setRenamingValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleCategoryRename(group.category!.id);
                        if (e.key === "Escape") setRenamingCatId(null);
                      }}
                      style={{
                        fontSize: "13px", fontWeight: 600, padding: "2px 8px",
                        border: "1px solid var(--theme-action-primary-bg)",
                        borderRadius: "var(--neuron-radius-s)", outline: "none",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--theme-text-primary)",
                      }}
                    />
                    <button onClick={() => handleCategoryRename(group.category!.id)} style={{ ...iconBtnStyle, color: "var(--theme-action-primary-bg)" }} title="Save"><Check size={14} /></button>
                    <button onClick={() => setRenamingCatId(null)} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <span style={{
                      fontSize: "13px", fontWeight: 600,
                      color: group.category ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                    }}>
                      {group.category?.name ?? "Uncategorized"}
                    </span>
                    <span style={countBadgeStyle}>
                      {group.items.length}
                    </span>
                    {group.category && ((group.category as CatalogCategoryWithSide).side === "revenue" || (group.category as CatalogCategoryWithSide).side === "expense") && (
                      <SideBadge side={(group.category as CatalogCategoryWithSide).side as "revenue" | "expense"} />
                    )}
                  </>
                )}

                <div style={{ flex: 1 }} />

                {group.category && !renamingCatId && (
                  <div onClick={e => e.stopPropagation()}>
                    <CategoryGroupMenu
                      category={group.category}
                      onRename={() => { setRenamingCatId(group.key); setRenamingValue(group.category!.name); }}
                      onDelete={() => handleCategoryDelete(group.category!)}
                    />
                  </div>
                )}
              </div>

              {/* Item Rows */}
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
                    onDelete={() => openDeletePanel(item)}
                    onMove={() => { setEditingId(item.id); setEditForm({ ...item }); }}
                  />
                )
              ))}
            </div>
          ))
        ) : (
          // ── Flat view (category filter active) ──
          <div style={cardStyle}>
            <div style={{ ...cardHeaderStyle, cursor: "default" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                {categoriesWithCount.find((c: any) => c.id === filterCategory)?.name ?? "Items"}
              </span>
              <span style={countBadgeStyle}>{filtered.length}</span>
              <div style={{ flex: 1 }} />
            </div>
            {filtered.map(item => (
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
                  onDelete={() => openDeletePanel(item)}
                  onMove={() => { setEditingId(item.id); setEditForm({ ...item }); }}
                />
              )
            ))}
          </div>
        )}
      </div>

      {showTopFade && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-8" style={{ background: "linear-gradient(to top, transparent, var(--theme-bg-page) 88%)" }} />
      )}
      {showBottomFade && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: "linear-gradient(to bottom, transparent, var(--theme-bg-page) 78%)" }} />
      )}
      </div>
    </>
  );
}

// ==================== SUB-TAB PILL ====================

function SubTabPill({ active, onClick, children, count }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "6px 14px", fontSize: "13px", fontWeight: active ? 600 : 400,
        color: active ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
        backgroundColor: active ? "var(--theme-bg-surface-tint)" : "transparent",
        border: active ? "1px solid var(--theme-action-primary-bg)" : "1px solid transparent",
        borderRadius: "20px",
        cursor: "pointer",
        transition: "all 150ms",
      }}
    >
      {children}
      <span style={{
        fontSize: "11px", fontWeight: 500,
        color: active ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
        opacity: 0.7,
      }}>
        {count}
      </span>
    </button>
  );
}

// ==================== SIDE BADGE ====================

function SideBadge({ side }: { side: "revenue" | "expense" }) {
  const isRevenue = side === "revenue";
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600, letterSpacing: "0.03em",
      padding: "2px 8px", borderRadius: "10px",
      color: isRevenue ? "var(--theme-action-primary-bg)" : "var(--theme-status-warning-fg)",
      backgroundColor: isRevenue ? "var(--theme-bg-surface-tint)" : "var(--theme-status-warning-bg)",
      textTransform: "uppercase",
    }}>
      {isRevenue ? "Revenue" : "Expense"}
    </span>
  );
}

// ==================== ITEM VIEW ROW ====================

function ItemViewRow({
  item, usage, hovered, onMouseEnter, onMouseLeave, onEdit, onDelete, onMove,
}: {
  item: CatalogItem;
  usage: number;
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        padding: "0 16px",
        height: "36px",
        borderTop: "1px solid var(--theme-border-subtle)",
        backgroundColor: hovered ? "var(--theme-state-hover)" : "transparent",
        transition: "background-color 100ms",
        cursor: "default",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Item name */}
      <span style={{
        flex: 1, fontSize: "13px", fontWeight: 400,
        color: "var(--theme-text-primary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        minWidth: 0,
      }}>
        {item.name}
      </span>

      {/* Usage count */}
      <span style={{
        fontSize: "12px", fontWeight: usage > 0 ? 600 : 400,
        color: usage > 0 ? "var(--theme-text-secondary)" : "var(--theme-border-default)",
        width: "48px", textAlign: "right", flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
      }}>
        {usage > 0 ? usage : "—"}
      </span>

      {/* Actions (visible on hover) */}
      <div style={{
        width: "32px", flexShrink: 0,
        display: "flex", justifyContent: "center",
        opacity: hovered ? 1 : 0,
        transition: "opacity 100ms",
      }}>
        <RowActionsMenu onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
      </div>
    </div>
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
    <div style={{
      display: "flex", gap: "8px", alignItems: "center",
      padding: "6px 16px",
      borderTop: "1px solid var(--theme-border-subtle)",
      backgroundColor: "var(--theme-bg-surface-subtle)",
    }}>
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
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        <button onClick={onSave} title="Save" style={{ ...iconBtnStyle, color: "var(--theme-action-primary-bg)" }}><Check size={14} /></button>
        <button onClick={onCancel} title="Cancel" style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }}><X size={14} /></button>
      </div>
    </div>
  );
}

// ==================== ROW ACTIONS MENU ====================

function RowActionsMenu({
  onEdit, onDelete, onMove,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 160 });
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

  const menuItemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    width: "100%", padding: "7px 12px",
    fontSize: "13px", color: "var(--theme-text-primary)",
    background: "none", border: "none", cursor: "pointer", textAlign: "left",
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
        style={{
          padding: "2px 4px", border: "none", background: "none",
          cursor: "pointer", color: "var(--theme-text-muted)", borderRadius: "4px",
          display: "flex", alignItems: "center",
        }}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left,
            width: 160,
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "var(--neuron-radius-s)",
            zIndex: 9999,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-state-hover)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            onClick={() => { onMove(); setOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-state-hover)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <ArrowRightLeft size={13} /> Move to Category
          </button>
          <div style={{ height: "1px", backgroundColor: "var(--theme-border-subtle)", margin: "2px 0" }} />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            style={{ ...menuItemStyle, color: "var(--theme-status-danger-fg)" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)")}
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

  const hasItems = (category.item_count ?? 0) > 0;

  const menuItemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px",
    width: "100%", padding: "7px 12px",
    fontSize: "13px", background: "none", border: "none", textAlign: "left",
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.right - 160 });
          }
          setOpen(o => !o);
        }}
        style={{ padding: "2px 6px", border: "none", background: "none", cursor: "pointer", color: "var(--theme-text-muted)", borderRadius: "4px", display: "flex", alignItems: "center" }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left,
            width: 160,
            background: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "var(--neuron-radius-s)",
            zIndex: 9999,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => { onRename(); setOpen(false); }}
            style={{ ...menuItemStyle, color: "var(--theme-text-primary)", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-state-hover)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Pencil size={13} /> Rename
          </button>
          <div style={{ height: "1px", backgroundColor: "var(--theme-border-subtle)" }} />
          <button
            onClick={() => { if (!hasItems) { onDelete(); setOpen(false); } }}
            style={{
              ...menuItemStyle,
              color: hasItems ? "var(--theme-text-muted)" : "var(--theme-status-danger-fg)",
              cursor: hasItems ? "not-allowed" : "pointer",
            }}
            title={hasItems ? "Remove all items from this category first" : "Delete category"}
            onMouseEnter={e => { if (!hasItems) e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)"; }}
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

// ==================== DELETE SIDE PANEL ====================

function DeleteSidePanel({
  item, counts, loading, relinkTarget, onRelinkChange, otherItems, onConfirm, onClose,
}: {
  item: CatalogItem;
  counts: { billing: number; expenses: number } | null;
  loading: boolean;
  relinkTarget: string;
  onRelinkChange: (val: string) => void;
  otherItems: CatalogItem[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasRefs = counts && (counts.billing > 0 || counts.expenses > 0);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.25)",
        }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "420px", maxWidth: "90vw",
        zIndex: 9999,
        backgroundColor: "var(--theme-bg-surface)",
        borderLeft: "1px solid var(--theme-border-default)",
        display: "flex", flexDirection: "column",
        animation: "slideInPanel 200ms ease-out",
      }}>
        {/* Panel Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--theme-border-default)",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <AlertTriangle size={20} style={{ color: "var(--theme-status-danger-fg)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>
              Delete "{item.name}"
            </h2>
          </div>
          <button onClick={onClose} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Panel Body */}
        <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
          {loading ? (
            <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Checking references...</p>
          ) : hasRefs ? (
            <div>
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "16px" }}>
                This item is referenced by:
              </p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
                {counts!.billing > 0 && (
                  <span style={impactChipStyle}>
                    {counts!.billing} billing line{counts!.billing !== 1 ? "s" : ""}
                  </span>
                )}
                {counts!.expenses > 0 && (
                  <span style={impactChipStyle}>
                    {counts!.expenses} expense{counts!.expenses !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <label style={{ ...labelStyle, marginBottom: "6px" }}>
                Re-link existing records to another item (optional)
              </label>
              <select
                value={relinkTarget}
                onChange={e => onRelinkChange(e.target.value)}
                style={{ ...inputStyle, fontSize: "13px" }}
              >
                <option value="">— Keep as-is —</option>
                {otherItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
              No records reference this item. Safe to delete.
            </p>
          )}
        </div>

        {/* Panel Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--theme-border-default)",
          display: "flex", justifyContent: "flex-end", gap: "8px",
        }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              ...saveBtnStyle,
              backgroundColor: "var(--theme-status-danger-fg)",
              opacity: loading ? 0.5 : 1,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </>,
    document.body
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
          border: `1px solid ${isFiltered ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"}`,
          borderRadius: "var(--neuron-radius-s)",
          color: isFiltered ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
          backgroundColor: isFiltered ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-surface)",
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
            borderRadius: "var(--neuron-radius-m)",
            zIndex: 9999, overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 12px 7px", borderBottom: "1px solid var(--theme-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Categories</span>
            <span style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>{categories.length} total</span>
          </div>

          <div
            onClick={() => { onFilterChange("all"); setOpen(false); }}
            style={{
              padding: "8px 12px", cursor: "pointer",
              backgroundColor: filterValue === "all" ? "var(--theme-bg-surface-tint)" : "transparent",
              display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            <span style={{ flex: 1, fontSize: "13px", fontWeight: filterValue === "all" ? 600 : 400, color: filterValue === "all" ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)" }}>
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
                style={{
                  display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px",
                  backgroundColor: filterValue === cat.id ? "var(--theme-bg-surface-tint)" : "transparent",
                  minHeight: 34,
                }}
              >
                {renamingId === cat.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleRename(cat.id); if (e.key === "Escape") setRenamingId(null); }}
                      style={{ flex: 1, fontSize: "13px", padding: "3px 6px", border: "1px solid var(--theme-action-primary-bg)", borderRadius: "4px", outline: "none", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                    />
                    <button onClick={() => handleRename(cat.id)} style={{ ...iconBtnStyle, color: "var(--theme-action-primary-bg)" }} title="Save"><Check size={13} /></button>
                    <button onClick={() => setRenamingId(null)} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span
                      onClick={() => { onFilterChange(cat.id); setOpen(false); }}
                      style={{ flex: 1, fontSize: "13px", cursor: "pointer", fontWeight: filterValue === cat.id ? 600 : 400, color: filterValue === cat.id ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)" }}
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
                  style={{ flex: 1, fontSize: "12px", padding: "4px 8px", border: "1px solid var(--theme-action-primary-bg)", borderRadius: "5px", outline: "none", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)" }}
                />
                <button onClick={handleAddNew} style={{ ...iconBtnStyle, color: "var(--theme-action-primary-bg)" }} title="Create"><Check size={13} /></button>
                <button onClick={() => { setAddingNew(false); setNewName(""); }} style={{ ...iconBtnStyle, color: "var(--theme-text-muted)" }} title="Cancel"><X size={13} /></button>
              </div>
            ) : (
              <button
                onClick={() => setAddingNew(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--theme-action-primary-bg)", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", padding: "2px 0" }}
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

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--theme-border-default)",
  borderRadius: "var(--neuron-radius-m)",
  backgroundColor: "var(--theme-bg-surface)",
  overflow: "hidden",
  flexShrink: 0,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "10px 16px",
  backgroundColor: "var(--theme-bg-surface-subtle)",
  cursor: "pointer",
  userSelect: "none",
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--theme-text-muted)",
  backgroundColor: "var(--theme-bg-page)",
  border: "1px solid var(--theme-border-default)",
  padding: "1px 8px",
  borderRadius: "10px",
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
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
  borderRadius: "var(--neuron-radius-s)",
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

const ghostBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  padding: "7px 12px",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--theme-text-muted)",
  background: "none",
  border: "1px solid var(--theme-border-default)",
  borderRadius: "var(--neuron-radius-s)",
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: "var(--neuron-radius-s)",
  border: "1px solid var(--theme-border-default)",
  backgroundColor: "var(--theme-bg-surface)",
  color: "var(--theme-text-muted)",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: "var(--neuron-radius-s)",
  border: "none",
  backgroundColor: "var(--theme-action-primary-bg)",
  color: "var(--theme-action-primary-text)",
  cursor: "pointer",
};

const inlineFormStyle: React.CSSProperties = {
  backgroundColor: "var(--theme-bg-surface)",
  border: "1px solid var(--theme-action-primary-bg)",
  borderRadius: "var(--neuron-radius-m)",
  padding: "16px",
  marginBottom: "12px",
  flexShrink: 0,
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
