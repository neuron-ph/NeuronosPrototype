/**
 * ContractRateCardV2
 *
 * Redesigned contract rate matrix editor matching SellingPriceSection's
 * outer shell: branded card, teal accent, outline-only (no shadows).
 *
 * Key design decisions:
 *   - Title: "{Service} Charges" (not "Rate Card")
 *   - Flat list (no categories) — charges are a short, focused list
 *   - 2-row line items: top row = data, bottom row = remarks + tiered config
 *   - Inline "+ Mode" column in the grid header
 *   - Rate engine reads `matrix.rows` — zero engine changes
 *
 * @see /docs/blueprints/RATE_MATRIX_REDESIGN_BLUEPRINT.md
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Plus, Trash2, X, LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";
import { PhilippinePeso } from "../../icons/PhilippinePeso";
import { CatalogItemCombobox } from "../../shared/pricing/CatalogItemCombobox";
import { CategoryDropdown } from "./CategoryDropdown";
import { TruckingDestinationBlocks } from "./TruckingDestinationBlocks";
import { CustomDropdown } from "../../bd/CustomDropdown";
import type {
  ContractRateMatrix,
  ContractRateRow,
  ContractRateCategory,
  ServiceType,
} from "../../../types/pricing";

// ============================================
// CONSTANTS
// ============================================

const UNIT_OPTIONS = [
  { value: "per_container", label: "Per Container" },
  { value: "per_shipment", label: "Per Shipment" },
  { value: "per_entry", label: "Per Entry" },
  { value: "per_bl", label: "Per B/L" },
  { value: "per_set", label: "Per Set" },
  { value: "per_kg", label: "Per KG" },
  { value: "per_cbm", label: "Per CBM" },
  { value: "flat", label: "Flat Fee" },
];

const DEFAULT_COLUMNS: Record<string, string[]> = {
  Brokerage: ["FCL", "LCL / AIR"],
  Forwarding: ["FCL", "LCL", "AIR"],
  Trucking: ["Cost"],
  "Marine Insurance": ["Standard"],
  Others: ["Standard"],
};

// ============================================
// ID GENERATOR
// ============================================

const generateRowId = () =>
  `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ============================================
// MIGRATION UTILITIES (kept for backward compat)
// ============================================

const generateCategoryId = () =>
  `crc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function migrateFlatRowsToCategories(
  rows: ContractRateRow[]
): ContractRateCategory[] {
  if (rows.length === 0) return [];
  return [
    {
      id: generateCategoryId(),
      category_name: "General",
      rows: rows.map((r) => ({ ...r })),
    },
  ];
}

export function flattenCategoriesToRows(
  categories: ContractRateCategory[]
): ContractRateRow[] {
  return categories.flatMap((cat) => cat.rows);
}

// ============================================
// PROPS
// ============================================

interface ContractRateCardV2Props {
  matrix: ContractRateMatrix;
  onChange: (matrix: ContractRateMatrix) => void;
  viewMode?: boolean;
  serviceLabel?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ContractRateCardV2({
  matrix,
  onChange,
  viewMode = false,
  serviceLabel,
}: ContractRateCardV2Props) {
  const displayLabel = serviceLabel || matrix.service_type;
  const columns = matrix.columns;
  const isTrucking = matrix.service_type === "Trucking";
  const isBrokerage = matrix.service_type === "Brokerage";

  // Derive active categories — auto-migrate flat rows for backward compat
  const activeCategories: ContractRateCategory[] = useMemo(() => {
    if (matrix.categories && matrix.categories.length > 0) return matrix.categories;
    if (matrix.rows && matrix.rows.length > 0) return migrateFlatRowsToCategories(matrix.rows);
    return [];
  }, [matrix.categories, matrix.rows]);

  // Trucking still reads flat rows
  const truckingRows = matrix.rows;

  // Auto-migrate existing Trucking matrices to single "Cost" column
  useEffect(() => {
    if (isTrucking && (columns.length !== 1 || columns[0] !== "Cost")) {
      const migratedRows = truckingRows.map((r) => {
        const firstNonZero = Object.values(r.rates).find((v) => v > 0) ?? 0;
        return { ...r, rates: { Cost: firstNonZero } };
      });
      onChange({ ...matrix, columns: ["Cost"], rows: migratedRows });
    }
  }, [isTrucking]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional one-time migration

  // Column editing
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [editingColumnValue, setEditingColumnValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Category expand/collapse (all expanded by default)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(activeCategories.map((c) => c.id))
  );
  const toggleCategory = (id: string) =>
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Add category dropdown
  const [showAddCategory, setShowAddCategory] = useState(false);
  const addCategoryBtnRef = useRef<HTMLButtonElement>(null);

  // Trucking: New Destination Handling
  const [newTruckingDestination, setNewTruckingDestination] = useState<string | null>(null);

  // Focus column rename input
  useEffect(() => {
    if (editingColumnIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingColumnIndex]);

  // ---- Emit helpers ----
  const emitCategories = useCallback(
    (updatedCategories: ContractRateCategory[], updatedColumns?: string[]) => {
      onChange({
        ...matrix,
        columns: updatedColumns || columns,
        categories: updatedCategories,
        rows: flattenCategoriesToRows(updatedCategories),
      });
    },
    [matrix, onChange, columns]
  );

  const emitTrucking = useCallback(
    (updatedRows: ContractRateRow[], updatedColumns?: string[]) => {
      onChange({ ...matrix, columns: updatedColumns || columns, rows: updatedRows });
    },
    [matrix, onChange, columns]
  );

  // ---- Category CRUD ----
  const handleAddCategory = (name: string, catalogCategoryId?: string) => {
    const newCat: ContractRateCategory = {
      id: generateCategoryId(),
      category_name: name,
      catalog_category_id: catalogCategoryId,
      rows: [],
    };
    setExpandedCategories((prev) => new Set([...prev, newCat.id]));
    emitCategories([...activeCategories, newCat]);
  };

  const handleDeleteCategory = (catId: string) => {
    if (!confirm("Remove this category and all its charges?")) return;
    emitCategories(activeCategories.filter((c) => c.id !== catId));
  };

  // ---- Row CRUD (per category) ----
  const handleAddRow = (catId: string) => {
    const emptyRates: Record<string, number> = {};
    columns.forEach((col) => { emptyRates[col] = 0; });
    const newRow: ContractRateRow = { id: generateRowId(), particular: "", rates: emptyRates, unit: "per_container", remarks: "" };
    emitCategories(activeCategories.map((c) => c.id === catId ? { ...c, rows: [...c.rows, newRow] } : c));
  };

  const handleUpdateRow = (catId: string, rowId: string, updates: Partial<ContractRateRow>) =>
    emitCategories(activeCategories.map((c) =>
      c.id === catId ? { ...c, rows: c.rows.map((r) => r.id === rowId ? { ...r, ...updates } : r) } : c
    ));

  const handleUpdateRowRate = (catId: string, rowId: string, col: string, val: number) =>
    emitCategories(activeCategories.map((c) =>
      c.id === catId ? { ...c, rows: c.rows.map((r) => r.id === rowId ? { ...r, rates: { ...r.rates, [col]: val } } : r) } : c
    ));

  const handleDeleteRow = (catId: string, rowId: string) =>
    emitCategories(activeCategories.map((c) =>
      c.id === catId ? { ...c, rows: c.rows.filter((r) => r.id !== rowId) } : c
    ));

  const handleToggleSucceeding = (catId: string, rowId: string) =>
    emitCategories(activeCategories.map((c) =>
      c.id === catId ? {
        ...c,
        rows: c.rows.map((r) => {
          if (r.id !== rowId) return r;
          if (r.succeeding_rule) { const { succeeding_rule, ...rest } = r; return rest as ContractRateRow; }
          return { ...r, succeeding_rule: { rate: 0, after_qty: 1 } };
        }),
      } : c
    ));

  // ---- Column CRUD (global — applies to all category rows) ----
  const addColumn = () => {
    const newName = `Mode ${columns.length + 1}`;
    const updatedCats = activeCategories.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r, rates: { ...r.rates, [newName]: 0 } })) }));
    emitCategories(updatedCats, [...columns, newName]);
    setTimeout(() => { setEditingColumnIndex(columns.length); setEditingColumnValue(newName); }, 0);
  };

  const commitColumnRename = () => {
    if (editingColumnIndex === null) return;
    const oldName = columns[editingColumnIndex];
    const newName = editingColumnValue.trim();
    if (newName && newName !== oldName && !columns.includes(newName)) {
      const updatedCols = columns.map((c) => (c === oldName ? newName : c));
      const updatedCats = activeCategories.map((c) => ({
        ...c,
        rows: c.rows.map((r) => { const nr = { ...r.rates }; nr[newName] = nr[oldName] ?? 0; delete nr[oldName]; return { ...r, rates: nr }; }),
      }));
      emitCategories(updatedCats, updatedCols);
    }
    setEditingColumnIndex(null);
    setEditingColumnValue("");
  };

  const deleteColumn = (colName: string) => {
    if (columns.length <= 1) return;
    const updatedCols = columns.filter((c) => c !== colName);
    const updatedCats = activeCategories.map((c) => ({
      ...c,
      rows: c.rows.map((r) => { const nr = { ...r.rates }; delete nr[colName]; return { ...r, rates: nr }; }),
    }));
    emitCategories(updatedCats, updatedCols);
  };

  // ---- Format helpers ----
  const getUnitLabel = (unitValue: string) => UNIT_OPTIONS.find((u) => u.value === unitValue)?.label || unitValue;
  const matrixCurrency = (matrix.currency || "PHP") as "PHP" | "USD";
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: matrixCurrency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val);

  const setMatrixCurrency = (next: "PHP" | "USD") => {
    onChange({ ...matrix, currency: next, exchange_rate: next === "PHP" ? 1 : (matrix.exchange_rate || undefined) });
  };
  const setMatrixRate = (rate: number) => {
    onChange({ ...matrix, exchange_rate: Number.isFinite(rate) && rate > 0 ? rate : undefined });
  };

  // ============================================
  // RENDER
  // ============================================

  const totalItems = isTrucking ? truckingRows.length : activeCategories.reduce((s, c) => s + c.rows.length, 0);

  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "12px",
        padding: "28px",
        marginBottom: "24px",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", paddingBottom: "20px", borderBottom: "2px solid var(--neuron-ui-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <PhilippinePeso size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <h2 style={{ fontSize: "17px", fontWeight: 600, color: "var(--neuron-brand-green)", margin: 0, letterSpacing: "-0.01em" }}>
            {displayLabel} Charges
          </h2>
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", backgroundColor: "var(--theme-bg-surface-subtle)", padding: "2px 8px", borderRadius: "4px" }}>
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
          {/* Matrix-level currency — every rate in this matrix is denominated in this currency. */}
          {!viewMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
              <CustomDropdown
                value={matrixCurrency}
                onChange={(v) => setMatrixCurrency(v as "PHP" | "USD")}
                options={[{ value: "PHP", label: "PHP" }, { value: "USD", label: "USD" }]}
                size="sm"
              />
              {matrixCurrency === "USD" && (
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="USD→PHP rate"
                  value={matrix.exchange_rate ?? ""}
                  onChange={(e) => setMatrixRate(parseFloat(e.target.value))}
                  title="Exchange rate locked at contract signing (USD → PHP)"
                  style={{ width: "100px", height: "26px", padding: "0 8px", fontSize: "11px", border: "1px solid var(--theme-border-default)", borderRadius: "4px", fontFamily: "monospace" }}
                />
              )}
            </div>
          ) : matrixCurrency !== "PHP" && (
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px", backgroundColor: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)", letterSpacing: "0.05em", marginLeft: "4px" }}>
              {matrixCurrency} @ {matrix.exchange_rate ?? "—"}
            </span>
          )}
        </div>

        {!viewMode && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Add Mode — non-trucking, non-brokerage only */}
            {!isTrucking && !isBrokerage && (
              <button onClick={addColumn} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", backgroundColor: "transparent", border: "1px dashed var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer", transition: "all 0.15s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)"; e.currentTarget.style.color = "var(--theme-action-primary-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; e.currentTarget.style.color = "var(--theme-text-muted)"; }}
              >
                <Plus size={14} /> Add Mode
              </button>
            )}

            {/* Trucking: Add Destination */}
            {isTrucking ? (
              <button
                onClick={() => {
                  let finalName = "New Destination";
                  let counter = 2;
                  const existingDests = new Set(truckingRows.map((r) => r.remarks));
                  while (existingDests.has(finalName)) { finalName = `New Destination ${counter}`; counter++; }
                  const TRUCKING_PRESETS = ["20ft_40ft", "back_to_back", "4wheeler", "6wheeler"];
                  const TRUCKING_LABELS = ["20ft / 40ft", "Back to back", "4Wheeler", "6Wheeler"];
                  const newRows: ContractRateRow[] = TRUCKING_PRESETS.map((id, i) => ({
                    id: generateRowId(), particular: TRUCKING_LABELS[i], charge_type_id: id,
                    rates: { Cost: 0 }, unit: "per_container", remarks: finalName, selection_group: finalName,
                  }));
                  emitTrucking([...truckingRows, ...newRows]);
                  setNewTruckingDestination(finalName);
                }}
                style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, color: "var(--neuron-brand-green)", backgroundColor: "transparent", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer", transition: "all 0.15s ease" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Plus size={14} /> Add Destination
              </button>
            ) : (
              /* Non-trucking: Add Category */
              <div style={{ position: "relative" }}>
                <button
                  ref={addCategoryBtnRef}
                  onClick={() => setShowAddCategory(true)}
                  style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, color: "var(--neuron-brand-green)", backgroundColor: "transparent", border: "1px solid var(--neuron-ui-border)", borderRadius: "6px", cursor: "pointer", transition: "all 0.15s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Plus size={14} /> Add Category
                </button>
                {showAddCategory && (
                  <CategoryDropdown
                    onAdd={(name, catalogCategoryId) => { handleAddCategory(name, catalogCategoryId); setShowAddCategory(false); }}
                    onClose={() => setShowAddCategory(false)}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Trucking: Destination Blocks ── */}
      {isTrucking ? (
        <TruckingDestinationBlocks
          rows={truckingRows}
          onChangeRows={(updatedRows) => emitTrucking(updatedRows)}
          viewMode={viewMode}
          newDestination={newTruckingDestination}
          onNewDestinationCleared={() => setNewTruckingDestination(null)}
        />
      ) : (
        <>
          {/* ── Empty state — no categories yet ── */}
          {activeCategories.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center", backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)", borderRadius: "10px" }}>
              <LayoutGrid size={48} strokeWidth={1.2} style={{ color: "var(--neuron-ink-muted)", margin: "0 auto 12px auto", display: "block", opacity: 0.75 }} />
              <h3 style={{ color: "var(--neuron-ink-primary)", fontSize: "16px", fontWeight: 500, marginBottom: "4px" }}>No charge categories</h3>
              <p style={{ color: "var(--neuron-ink-muted)", fontSize: "14px", margin: 0 }}>
                {viewMode ? "No charges have been defined for this service." : "Click \"+ Add Category\" to start defining charges."}
              </p>
            </div>
          )}

          {/* ── Category sections ── */}
          {activeCategories.map((cat) => {
            const isExpanded = expandedCategories.has(cat.id);
            const usedInCat = cat.rows.map((r) => r.catalog_item_id).filter(Boolean) as string[];
            return (
              <div key={cat.id} style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: "10px", marginBottom: "12px", overflow: "visible", backgroundColor: "var(--theme-bg-surface)" }}>

                {/* Category header */}
                <div
                  onClick={() => toggleCategory(cat.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", backgroundColor: "var(--theme-bg-surface-subtle)", borderRadius: isExpanded ? "10px 10px 0 0" : "10px", borderBottom: isExpanded ? "1px solid var(--neuron-ui-border)" : "none", cursor: "pointer", userSelect: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isExpanded ? <ChevronDown size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />}
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>{cat.category_name}</span>
                    <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", backgroundColor: "var(--theme-bg-surface)", padding: "1px 7px", borderRadius: "3px", border: "1px solid var(--neuron-ui-border)" }}>
                      {cat.rows.length} {cat.rows.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  {!viewMode && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleAddRow(cat.id)}
                        style={{ display: "flex", alignItems: "center", gap: "3px", padding: "4px 10px", fontSize: "12px", fontWeight: 600, color: "var(--theme-action-primary-bg)", backgroundColor: "transparent", border: "1px solid var(--theme-action-primary-bg)", borderRadius: "5px", cursor: "pointer", transition: "all 0.15s ease" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)"; e.currentTarget.style.color = "#fff"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--theme-action-primary-bg)"; }}
                      >
                        <Plus size={11} /> Add Charge
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        style={{ display: "flex", alignItems: "center", padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", opacity: 0.5, transition: "opacity 0.15s ease" }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--neuron-semantic-danger)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                        title="Remove category"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Category body — grid + rows */}
                {isExpanded && (
                  <div style={{ overflowX: "visible" as any }}>
                    {/* Grid Header */}
                    <div style={{ display: "grid", gridTemplateColumns: buildGridTemplate(columns, viewMode, false), gap: "0", padding: "10px 16px", backgroundColor: "var(--theme-bg-surface)", borderBottom: "2px solid var(--neuron-ui-border)", minWidth: "fit-content", alignItems: "center" }}>
                      <div style={gridHeaderCell}>Particular</div>
                      {columns.map((col, colIdx) => (
                        <div key={col} style={{ ...gridHeaderCell, textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                          {editingColumnIndex === colIdx ? (
                            <input ref={editInputRef} value={editingColumnValue} onChange={(e) => setEditingColumnValue(e.target.value)}
                              onBlur={commitColumnRename}
                              onKeyDown={(e) => { if (e.key === "Enter") commitColumnRename(); if (e.key === "Escape") { setEditingColumnIndex(null); setEditingColumnValue(""); } }}
                              style={{ width: "80px", padding: "2px 6px", fontSize: "11px", fontWeight: 600, border: "1px solid var(--neuron-brand-green)", borderRadius: "4px", outline: "none", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-action-primary-bg)", textAlign: "right", letterSpacing: "0.5px", textTransform: "uppercase" }}
                            />
                          ) : (
                            <span style={{ cursor: viewMode ? "default" : "pointer" }} onDoubleClick={() => { if (!viewMode) { setEditingColumnIndex(colIdx); setEditingColumnValue(col); } }} title={viewMode ? col : "Double-click to rename"}>
                              {col} (PHP)
                            </span>
                          )}
                          {!viewMode && columns.length > 1 && editingColumnIndex !== colIdx && (
                            <button onClick={() => deleteColumn(col)} style={{ display: "flex", alignItems: "center", padding: "1px", background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", opacity: 0.6, lineHeight: 0 }} title={`Remove "${col}" mode`}>
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                      <div style={gridHeaderCell}>Unit</div>
                      {!viewMode && <div style={gridHeaderCell} />}
                    </div>

                    {/* Empty category */}
                    {cat.rows.length === 0 ? (
                      <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--neuron-ink-muted)", fontSize: "13px" }}>
                        {viewMode ? "No charges defined." : "Click \"+ Add Charge\" above to add the first charge."}
                      </div>
                    ) : (
                      cat.rows.map((row, idx) => (
                        <RateLineItem
                          key={row.id}
                          row={row}
                          columns={columns}
                          viewMode={viewMode}
                          isLast={idx === cat.rows.length - 1}
                          isTrucking={false}
                          serviceType={matrix.service_type}
                          usedCatalogItemIds={usedInCat}
                          catalogCategoryId={cat.catalog_category_id}
                          onUpdate={(updates) => handleUpdateRow(cat.id, row.id, updates)}
                          onUpdateRate={(col, val) => handleUpdateRowRate(cat.id, row.id, col, val)}
                          onDelete={() => handleDeleteRow(cat.id, row.id)}
                          onToggleSucceeding={() => handleToggleSucceeding(cat.id, row.id)}
                          formatCurrency={formatCurrency}
                          getUnitLabel={getUnitLabel}
                        />
                      ))
                    )}

                    {/* Category footer */}
                    <div style={{ padding: "6px 16px", backgroundColor: "var(--theme-bg-surface)", borderTop: cat.rows.length > 0 ? "1px solid var(--neuron-ui-border)" : "none", borderRadius: "0 0 10px 10px", fontSize: "11px", fontWeight: 500, color: "var(--neuron-ink-muted)" }}>
                      {cat.rows.length} charge item{cat.rows.length !== 1 ? "s" : ""} · {columns.length} mode{columns.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

/** Build grid-template-columns for the data row */
function buildGridTemplate(columns: string[], viewMode: boolean, isTrucking: boolean = false): string {
  const parts: string[] = [];
  parts.push("minmax(160px, 2.5fr)"); // Particular / Truck Config
  columns.forEach(() => parts.push("minmax(100px, 1.2fr)")); // Rate columns
  if (isTrucking) {
    parts.push("minmax(140px, 2fr)"); // Destination
  } else {
    parts.push("minmax(120px, 1.2fr)"); // Unit
  }
  if (!viewMode) parts.push("36px"); // Delete
  return parts.join(" ");
}

const gridHeaderCell: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--neuron-ink-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  padding: "6px 12px",
};

const gridDataCell: React.CSSProperties = {
  padding: "10px 4px 2px",
};

/** Shared style for editable input cells — rounded outline like SellingPriceSection */
const cellInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--neuron-ink-primary)",
  backgroundColor: "var(--theme-bg-surface)",
  border: "1px solid var(--neuron-ui-border)",
  borderRadius: "6px",
  outline: "none",
  fontFamily: "inherit",
};

// CatalogCategoryPicker removed — category-first enforced via CategoryDropdown at section level.

// ============================================
// RATE LINE ITEM (2-row block)
// ============================================

function RateLineItem({
  row,
  columns,
  viewMode,
  isLast,
  isTrucking,
  serviceType,
  usedCatalogItemIds,
  catalogCategoryId,
  onUpdate,
  onUpdateRate,
  onDelete,
  onToggleSucceeding,
  formatCurrency,
  getUnitLabel,
}: {
  row: ContractRateRow;
  columns: string[];
  viewMode?: boolean;
  isLast?: boolean;
  isTrucking?: boolean;
  serviceType: ServiceType;
  usedCatalogItemIds: string[];
  catalogCategoryId?: string;
  onUpdate: (updates: Partial<ContractRateRow>) => void;
  onUpdateRate: (column: string, value: number) => void;
  onDelete: () => void;
  onToggleSucceeding: () => void;
  formatCurrency: (val: number) => string;
  getUnitLabel: (unit: string) => string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isAtCost = row.is_at_cost === true;
  const hasTiered = !isAtCost && row.succeeding_rule != null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--neuron-ui-border)",
        backgroundColor: isHovered && !viewMode ? "var(--theme-bg-surface-subtle)" : "transparent",
        transition: "background-color 0.1s ease",
      }}
    >
      {/* ── Row 1: Data Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: buildGridTemplate(columns, !!viewMode, isTrucking),
          gap: "0",
          padding: isTrucking ? "4px 16px 6px" : "0 16px",
          alignItems: "center",
          minWidth: "fit-content",
        }}
      >
        {/* Particular */}
        <div style={gridDataCell}>
          {viewMode ? (
            <div
              style={{
                ...cellInputStyle,
                fontWeight: 500,
                cursor: "default",
                color: row.particular ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
              }}
            >
              {row.particular || "\u2014"}
            </div>
          ) : (
            <CatalogItemCombobox
              value={row.particular}
              catalogItemId={row.catalog_item_id}
              categoryId={catalogCategoryId}
              side="revenue"
              onChange={(description, catalogItemId) => {
                onUpdate({ particular: description, catalog_item_id: catalogItemId ?? undefined });
              }}
              placeholder="Select or type a charge..."
            />
          )}
        </div>

        {/* Rate Columns */}
        {columns.map((col) => (
          <div key={col} style={gridDataCell}>
            {isAtCost ? (
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  fontStyle: "italic",
                  color: "var(--theme-text-muted)",
                  textAlign: "right",
                  padding: "6px 8px",
                }}
              >
                At Cost
              </div>
            ) : viewMode ? (
              <div
                style={{
                  ...cellInputStyle,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  cursor: "default",
                  color: (row.rates[col] ?? 0) > 0 ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
                }}
              >
                {(row.rates[col] ?? 0) > 0 ? formatCurrency(row.rates[col]) : "\u2014"}
              </div>
            ) : (
              <input
                type="number"
                min={0}
                step={100}
                value={row.rates[col] ?? ""}
                onChange={(e) => onUpdateRate(col, parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={{
                  ...cellInputStyle,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              />
            )}
          </div>
        ))}

        {/* Destination (Trucking) or Unit (other services) */}
        <div style={gridDataCell}>
          {isTrucking ? (
            /* Trucking: Destination input (maps to row.remarks) */
            viewMode ? (
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--neuron-ink-primary)",
                  padding: "6px 8px",
                }}
              >
                {row.remarks || "\u2014"}
              </span>
            ) : (
              <input
                type="text"
                value={row.remarks || ""}
                onChange={(e) => onUpdate({ remarks: e.target.value })}
                placeholder="e.g., Valenzuela City"
                style={{
                  ...cellInputStyle,
                }}
              />
            )
          ) : (
            /* Non-trucking: Unit selector */
            isAtCost ? (
              <span style={{ padding: "6px 8px" }} aria-hidden />
            ) : viewMode ? (
              <div
                style={{
                  ...cellInputStyle,
                  padding: "6px 8px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "default",
                  fontWeight: 500,
                }}
              >
                <span>{getUnitLabel(row.unit)}</span>
                <ChevronDown size={14} style={{ color: "var(--neuron-ink-muted)", opacity: 0.5, flexShrink: 0 }} />
              </div>
            ) : (
              <CustomDropdown
                value={row.unit}
                options={UNIT_OPTIONS}
                onChange={(val) => onUpdate({ unit: val })}
                size="sm"
                fullWidth
                buttonStyle={{
                  padding: "6px 8px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  fontWeight: 500,
                }}
              />
            )
          )}
        </div>

        {/* Delete */}
        {!viewMode && (
          <div
            style={{
              padding: "10px 4px 2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <button
              onClick={onDelete}
              style={{
                padding: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neuron-semantic-danger)",
                opacity: isHovered ? 0.8 : 0.12,
                transition: "opacity 0.15s ease",
                lineHeight: 0,
              }}
              title="Remove charge"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Row 2: Detail Row (toggles + tiered config) — hidden for Trucking ── */}
      {!isTrucking && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "2px 20px 6px",
          minWidth: "fit-content",
        }}
      >
        {/* At Cost toggle — rendered in both edit and view; non-interactive in viewMode */}
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            cursor: viewMode ? "default" : "pointer",
            fontSize: "11px",
            fontWeight: 600,
            color: isAtCost ? "#3B82F6" : "var(--neuron-ink-muted)",
            flexShrink: 0,
            padding: "3px 8px",
            borderRadius: "4px",
            backgroundColor: "transparent",
            border: "1px solid transparent",
            transition: "all 0.15s ease",
            letterSpacing: "0.3px",
            userSelect: "none",
            opacity: viewMode && !isAtCost ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={isAtCost}
            onChange={viewMode ? undefined : () => onUpdate({ is_at_cost: !isAtCost })}
            disabled={viewMode}
            style={{ display: "none" }}
          />
          <span
            style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              borderRadius: "3px",
              border: isAtCost ? "1.5px solid #3B82F6" : "1.5px solid var(--neuron-ui-border)",
              backgroundColor: isAtCost ? "#3B82F6" : "var(--theme-bg-surface)",
              position: "relative",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
          >
            {isAtCost && (
              <svg viewBox="0 0 12 12" width="12" height="12" style={{ position: "absolute", top: "-1px", left: "-1px" }}>
                <path d="M3 6.5L5 8.5L9 4" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          AT COST
        </label>

        {/* Tiered toggle — same checkbox UI in edit and view */}
        {!isAtCost && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              cursor: viewMode ? "default" : "pointer",
              fontSize: "11px",
              fontWeight: 600,
              color: hasTiered ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
              flexShrink: 0,
              padding: "3px 8px",
              borderRadius: "4px",
              backgroundColor: "transparent",
              border: "1px solid transparent",
              transition: "all 0.15s ease",
              letterSpacing: "0.3px",
              userSelect: "none",
              opacity: viewMode && !hasTiered ? 0.55 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={hasTiered}
              onChange={viewMode ? undefined : onToggleSucceeding}
              disabled={viewMode}
              style={{ display: "none" }}
            />
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                border: hasTiered ? "1.5px solid var(--neuron-brand-green)" : "1.5px solid var(--neuron-ui-border)",
                backgroundColor: hasTiered ? "var(--neuron-brand-green)" : "var(--theme-bg-surface)",
                position: "relative",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
            >
              {hasTiered && (
                <svg viewBox="0 0 12 12" width="12" height="12" style={{ position: "absolute", top: "-1px", left: "-1px" }}>
                  <path d="M3 6.5L5 8.5L9 4" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            TIERED
          </label>
        )}

        {/* Tiered config — rendered in both modes; inputs are read-only in viewMode */}
        {hasTiered && row.succeeding_rule && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--neuron-ink-muted)",
              flexShrink: 0,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>After first</span>
            <input
              type="number"
              min={1}
              value={row.succeeding_rule.after_qty}
              readOnly={viewMode}
              onChange={viewMode ? undefined : (e) =>
                onUpdate({
                  succeeding_rule: {
                    ...row.succeeding_rule!,
                    after_qty: parseInt(e.target.value) || 1,
                  },
                })
              }
              style={{
                width: "44px",
                padding: "3px 6px",
                fontSize: "12px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "4px",
                textAlign: "center",
                color: "var(--neuron-ink-primary)",
                outline: "none",
                fontFamily: "inherit",
                cursor: viewMode ? "default" : "text",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            />
            <span>&rarr;</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  padding: "3px 6px",
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)",
                  backgroundColor: "var(--theme-bg-surface-subtle)",
                  borderRight: "1px solid var(--neuron-ui-border)",
                }}
              >
                PHP
              </span>
              <input
                type="number"
                min={0}
                step={100}
                value={row.succeeding_rule.rate || ""}
                readOnly={viewMode}
                onChange={viewMode ? undefined : (e) =>
                  onUpdate({
                    succeeding_rule: {
                      ...row.succeeding_rule!,
                      rate: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                placeholder="0"
                style={{
                  width: "72px",
                  padding: "3px 6px",
                  fontSize: "12px",
                  border: "none",
                  outline: "none",
                  textAlign: "right",
                  color: "var(--neuron-ink-primary)",
                  fontFamily: "inherit",
                  cursor: viewMode ? "default" : "text",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              />
            </div>
            <span style={{ whiteSpace: "nowrap" }}>per succeeding</span>
          </div>
        )}

        {/* Inline remarks (short — ≤60 chars or empty) — skip for Trucking (remarks = Destination, already in grid) */}
        {!isTrucking && (row.remarks || "").length <= 60 && (
          <>
            <div
              style={{
                width: "1px",
                height: "16px",
                backgroundColor: "var(--neuron-ui-border)",
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              value={row.remarks || ""}
              readOnly={viewMode}
              onChange={viewMode ? undefined : (e) => onUpdate({ remarks: e.target.value })}
              placeholder="Remarks (optional)"
              style={{
                ...cellInputStyle,
                flex: 1,
                minWidth: "120px",
                fontSize: "12px",
                color: "var(--neuron-ink-muted)",
                fontStyle: "italic",
                cursor: viewMode ? "default" : "text",
              }}
            />
          </>
        )}
      </div>
      )}

      {/* ── Row 3: Expanded remarks (when text > 60 chars) — skip for Trucking */}
      {!isTrucking && (row.remarks || "").length > 60 && (
        <div style={{ padding: "0 20px 10px" }}>
          {viewMode ? (
            <p
              style={{
                fontSize: "12px",
                color: "var(--neuron-ink-muted)",
                fontStyle: "italic",
                margin: 0,
                padding: "6px 8px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {row.remarks}
            </p>
          ) : (
            <AutoGrowTextarea
              value={row.remarks || ""}
              onChange={(val) => onUpdate({ remarks: val })}
              placeholder="Remarks (optional)"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// AUTO-GROW TEXTAREA (for long remarks)
// ============================================

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{
        ...cellInputStyle,
        width: "100%",
        fontSize: "12px",
        color: "var(--neuron-ink-muted)",
        fontStyle: "italic",
        resize: "none",
        overflow: "auto",
        maxHeight: "120px",
        lineHeight: "1.5",
      }}
    />
  );
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createEmptyMatrixV2(serviceType: ServiceType): ContractRateMatrix {
  const cols = DEFAULT_COLUMNS[serviceType] || ["Standard"];
  return {
    id: `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    service_type: serviceType,
    columns: cols,
    rows: [],
  };
}