// CatalogManagementPage — Admin page for managing the Expense & Charge Catalog (Item Master)
// Lives under Accounting Department → Admin → Item Catalog

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Pencil, X, Check, RotateCcw, ChevronDown, Database } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { toast } from "../ui/toast-utils";

// ==================== TYPES ====================

interface CatalogItem {
  id: string;
  name: string;
  type: "expense" | "charge" | "both";
  category: string;
  service_types: string[];
  default_currency: string;
  default_amount: number | null;
  is_taxable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CatalogCategory {
  id: string;
  name: string;
}

// ==================== COMPONENT ====================

export function CatalogManagementPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterServiceType, setFilterServiceType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CatalogItem>>({});

  // Add new
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Partial<CatalogItem>>({
    name: "",
    type: "expense",
    category: "",
    service_types: [],
    default_currency: "PHP",
    is_taxable: false,
  });

  // ==================== DATA FETCHING ====================

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus === "all") params.set("include_inactive", "true");
      const res = await apiFetch(`/catalog/items?${params}`);
      const json = await res.json();
      if (json.success) setItems(json.data || []);
    } catch (err) {
      console.error("Error fetching catalog items:", err);
    }
  }, [filterStatus]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch(`/catalog/categories`);
      const json = await res.json();
      if (json.success) setCategories(json.data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchItems(), fetchCategories()]).finally(() => setIsLoading(false));
  }, [fetchItems, fetchCategories]);

  // ==================== ACTIONS ====================

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const res = await apiFetch(`/catalog/seed`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Seeded ${json.data.created} items (${json.data.skipped} already existed)`);
        fetchItems();
        fetchCategories();
      }
    } catch (err) {
      toast.error("Error seeding catalog");
      console.error(err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSave = async (id: string) => {
    try {
      const updates = { ...editForm };
      const res = await apiFetch(`/catalog/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Item updated");
        setEditingId(null);
        fetchItems();
        fetchCategories();
      } else {
        toast.error(json.error || "Error updating item");
      }
    } catch (err) {
      toast.error("Error updating item");
      console.error(err);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await apiFetch(`/catalog/items/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Item deactivated");
        fetchItems();
      }
    } catch (err) {
      toast.error("Error deactivating item");
      console.error(err);
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const item = { is_active: true };
      const res = await apiFetch(`/catalog/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(item),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Item reactivated");
        fetchItems();
      }
    } catch (err) {
      toast.error("Error reactivating item");
      console.error(err);
    }
  };

  const handleAdd = async () => {
    if (!addForm.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const newItem = { ...addForm };
      const res = await apiFetch(`/catalog/items`, {
        method: "POST",
        body: JSON.stringify(newItem),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Created "${addForm.name}"`);
        setShowAddForm(false);
        setAddForm({ name: "", type: "expense", category: "", service_types: [], default_currency: "PHP", is_taxable: false });
        fetchItems();
        fetchCategories();
      } else {
        toast.error(json.error || "Error creating item");
      }
    } catch (err) {
      toast.error("Error creating item");
      console.error(err);
    }
  };

  // ==================== FILTERING ====================

  const uniqueCategories = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
  const allServiceTypes = ["Brokerage", "Trucking", "Forwarding", "Marine Insurance", "Others"];

  const filtered = items.filter((item) => {
    if (filterStatus === "active" && !item.is_active) return false;
    if (filterStatus === "inactive" && item.is_active) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (filterServiceType !== "all" && !item.service_types?.includes(filterServiceType)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // ==================== HELPERS ====================

  const typeBadge = (type: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      expense: { bg: "#FEF3C7", text: "#92400E" },
      charge: { bg: "#DBEAFE", text: "#1E40AF" },
      both: { bg: "#E0E7FF", text: "#4338CA" },
    };
    const c = colors[type] || colors.expense;
    return (
      <span style={{
        padding: "2px 8px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 500,
        backgroundColor: c.bg,
        color: c.text,
        textTransform: "capitalize",
      }}>
        {type}
      </span>
    );
  };

  const serviceTag = (s: string) => (
    <span
      key={s}
      style={{
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontWeight: 500,
        backgroundColor: "#F0FDFA",
        color: "#0F766E",
        border: "1px solid #CCFBF1",
      }}
    >
      {s}
    </span>
  );

  // ==================== RENDER ====================

  return (
    <div style={{ padding: "24px 32px", background: "var(--neuron-bg-page, #F8FAF9)", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#12332B", marginBottom: "4px" }}>
            Expense & Charge Catalog
          </h1>
          <p style={{ fontSize: "13px", color: "#667085" }}>
            Manage standard financial line items used across bookings.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
              border: "1px solid #E0E6E4",
              backgroundColor: "white",
              color: "#667085",
              cursor: isSeeding ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Database size={14} />
            {isSeeding ? "Seeding..." : "Seed Defaults"}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#0F766E",
              color: "white",
              cursor: "pointer",
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

      {/* Filter Bar */}
      <div style={{
        display: "flex",
        gap: "8px",
        marginBottom: "16px",
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "300px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            style={{
              width: "100%",
              padding: "7px 10px 7px 30px",
              fontSize: "13px",
              border: "1px solid #E0E6E4",
              borderRadius: "8px",
              color: "#2C3E38",
              outline: "none",
            }}
          />
        </div>

        {/* Type filter */}
        <FilterSelect
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: "all", label: "All Types" },
            { value: "expense", label: "Expense" },
            { value: "charge", label: "Charge" },
            { value: "both", label: "Both" },
          ]}
        />

        {/* Category filter */}
        <FilterSelect
          value={filterCategory}
          onChange={setFilterCategory}
          options={[
            { value: "all", label: "All Categories" },
            ...uniqueCategories.map((c) => ({ value: c, label: c })),
          ]}
        />

        {/* Service Type filter */}
        <FilterSelect
          value={filterServiceType}
          onChange={setFilterServiceType}
          options={[
            { value: "all", label: "All Services" },
            ...allServiceTypes.map((s) => ({ value: s, label: s })),
          ]}
        />

        {/* Status filter */}
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ]}
        />

        <span style={{ fontSize: "12px", color: "#9CA3AF", marginLeft: "auto" }}>
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Add Form (inline, above table) */}
      {showAddForm && (
        <div style={{
          backgroundColor: "white",
          border: "1px solid #0F766E",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "12px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ fontSize: "11px", color: "#667085", display: "block", marginBottom: "3px" }}>Name *</label>
            <input
              type="text"
              value={addForm.name || ""}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              autoFocus
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={{ fontSize: "11px", color: "#667085", display: "block", marginBottom: "3px" }}>Type</label>
            <select
              value={addForm.type || "expense"}
              onChange={(e) => setAddForm({ ...addForm, type: e.target.value as any })}
              style={inputStyle}
            >
              <option value="expense">Expense</option>
              <option value="charge">Charge</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ fontSize: "11px", color: "#667085", display: "block", marginBottom: "3px" }}>Category</label>
            <input
              type="text"
              value={addForm.category || ""}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              placeholder="e.g. Government Fees"
              list="add-category-datalist"
              style={inputStyle}
            />
            <datalist id="add-category-datalist">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: "11px", color: "#667085", display: "block", marginBottom: "3px" }}>Service Types</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {allServiceTypes.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "11px", color: "#2C3E38", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={addForm.service_types?.includes(s) || false}
                    onChange={() => {
                      const current = addForm.service_types || [];
                      const updated = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
                      setAddForm({ ...addForm, service_types: updated });
                    }}
                    style={{ accentColor: "#0F766E" }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div style={{ flex: "0 0 70px" }}>
            <label style={{ fontSize: "11px", color: "#667085", display: "block", marginBottom: "3px" }}>Currency</label>
            <select
              value={addForm.default_currency || "PHP"}
              onChange={(e) => setAddForm({ ...addForm, default_currency: e.target.value })}
              style={inputStyle}
            >
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#2C3E38", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={addForm.is_taxable || false}
                onChange={() => setAddForm({ ...addForm, is_taxable: !addForm.is_taxable })}
                style={{ accentColor: "#0F766E" }}
              />
              Taxable
            </label>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => setShowAddForm(false)} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleAdd} style={saveBtnStyle}>Create</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{
        backgroundColor: "white",
        border: "1px solid #E0E6E4",
        borderRadius: "8px",
        overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>Loading catalog...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
            {items.length === 0
              ? 'No catalog items yet. Click "Seed Defaults" to add common items.'
              : "No items match your filters."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#F9FAFB", borderBottom: "1px solid #E0E6E4" }}>
                <th style={thStyle}>Name</th>
                <th style={{ ...thStyle, width: "80px" }}>Type</th>
                <th style={{ ...thStyle, width: "140px" }}>Category</th>
                <th style={thStyle}>Services</th>
                <th style={{ ...thStyle, width: "60px" }}>Curr.</th>
                <th style={{ ...thStyle, width: "50px", textAlign: "center" }}>Tax</th>
                <th style={{ ...thStyle, width: "60px", textAlign: "center" }}>Status</th>
                <th style={{ ...thStyle, width: "80px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                editingId === item.id ? (
                  <EditRow
                    key={item.id}
                    item={item}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    categories={categories}
                    allServiceTypes={allServiceTypes}
                    onSave={() => handleSave(item.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #F0F0F0",
                      opacity: item.is_active ? 1 : 0.5,
                    }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500, color: "#2C3E38" }}>{item.name}</span>
                    </td>
                    <td style={tdStyle}>{typeBadge(item.type)}</td>
                    <td style={{ ...tdStyle, color: "#667085" }}>{item.category}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {item.service_types?.map((s) => serviceTag(s))}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px" }}>{item.default_currency}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {item.is_taxable && <Check size={14} style={{ color: "#0F766E" }} />}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: item.is_active ? "#ECFDF5" : "#FEF2F2",
                        color: item.is_active ? "#065F46" : "#991B1B",
                      }}>
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                        <button
                          onClick={() => {
                            setEditingId(item.id);
                            setEditForm({ ...item });
                          }}
                          title="Edit"
                          style={iconBtnStyle}
                        >
                          <Pencil size={13} />
                        </button>
                        {item.is_active ? (
                          <button
                            onClick={() => handleDeactivate(item.id)}
                            title="Deactivate"
                            style={{ ...iconBtnStyle, color: "#DC2626" }}
                          >
                            <X size={13} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(item.id)}
                            title="Reactivate"
                            style={{ ...iconBtnStyle, color: "#0F766E" }}
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "7px 10px",
        fontSize: "12px",
        border: "1px solid #E0E6E4",
        borderRadius: "8px",
        color: "#2C3E38",
        backgroundColor: "white",
        cursor: "pointer",
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function EditRow({
  item,
  editForm,
  setEditForm,
  categories,
  allServiceTypes,
  onSave,
  onCancel,
}: {
  item: CatalogItem;
  editForm: Partial<CatalogItem>;
  setEditForm: (f: Partial<CatalogItem>) => void;
  categories: CatalogCategory[];
  allServiceTypes: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr style={{ borderBottom: "1px solid #E0E6E4", backgroundColor: "#FAFFFE" }}>
      <td style={tdStyle}>
        <input
          type="text"
          value={editForm.name || ""}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          style={{ ...inputStyle, fontWeight: 500 }}
          autoFocus
        />
      </td>
      <td style={tdStyle}>
        <select
          value={editForm.type || "expense"}
          onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
          style={{ ...inputStyle, fontSize: "11px", padding: "4px 6px" }}
        >
          <option value="expense">Expense</option>
          <option value="charge">Charge</option>
          <option value="both">Both</option>
        </select>
      </td>
      <td style={tdStyle}>
        <input
          type="text"
          value={editForm.category || ""}
          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
          list="edit-category-datalist"
          style={{ ...inputStyle, fontSize: "11px" }}
        />
        <datalist id="edit-category-datalist">
          {categories.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </td>
      <td style={tdStyle}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {allServiceTypes.map((s) => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "10px", cursor: "pointer", color: "#2C3E38" }}>
              <input
                type="checkbox"
                checked={editForm.service_types?.includes(s) || false}
                onChange={() => {
                  const current = editForm.service_types || [];
                  const updated = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
                  setEditForm({ ...editForm, service_types: updated });
                }}
                style={{ accentColor: "#0F766E", width: "12px", height: "12px" }}
              />
              {s}
            </label>
          ))}
        </div>
      </td>
      <td style={tdStyle}>
        <select
          value={editForm.default_currency || "PHP"}
          onChange={(e) => setEditForm({ ...editForm, default_currency: e.target.value })}
          style={{ ...inputStyle, fontSize: "11px", padding: "4px 6px", width: "60px" }}
        >
          <option value="PHP">PHP</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <input
          type="checkbox"
          checked={editForm.is_taxable || false}
          onChange={() => setEditForm({ ...editForm, is_taxable: !editForm.is_taxable })}
          style={{ accentColor: "#0F766E" }}
        />
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <span style={{ fontSize: "10px", color: "#9CA3AF" }}>—</span>
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
          <button onClick={onSave} title="Save" style={{ ...iconBtnStyle, color: "#0F766E" }}>
            <Check size={14} />
          </button>
          <button onClick={onCancel} title="Cancel" style={{ ...iconBtnStyle, color: "#9CA3AF" }}>
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ==================== SHARED STYLES ====================

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#667085",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "13px",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "13px",
  border: "1px solid #E0E6E4",
  borderRadius: "6px",
  color: "#2C3E38",
  outline: "none",
};

const iconBtnStyle: React.CSSProperties = {
  padding: "4px",
  border: "none",
  backgroundColor: "transparent",
  cursor: "pointer",
  color: "#667085",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "6px",
  border: "1px solid #E0E6E4",
  backgroundColor: "white",
  color: "#667085",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "6px",
  border: "none",
  backgroundColor: "#0F766E",
  color: "white",
  cursor: "pointer",
};

// Type re-export for EditRow (needed since it's a separate function component)
interface CatalogItem {
  id: string;
  name: string;
  type: "expense" | "charge" | "both";
  category: string;
  service_types: string[];
  default_currency: string;
  default_amount: number | null;
  is_taxable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CatalogCategory {
  id: string;
  name: string;
}