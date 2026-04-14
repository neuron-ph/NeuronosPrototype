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
import { Plus, Trash2, X, LayoutGrid } from "lucide-react";
import { PhilippinePeso } from "../../icons/PhilippinePeso";
import { ChargeTypeCombobox } from "./ChargeTypeCombobox";
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
  const rows = matrix.rows;
  const isTrucking = matrix.service_type === "Trucking";

  // Auto-migrate existing Trucking matrices to single "Cost" column
  useEffect(() => {
    if (isTrucking && (columns.length !== 1 || columns[0] !== "Cost")) {
      // Collapse all rate columns → single "Cost" column, taking the first non-zero value per row
      const migratedRows = rows.map((r) => {
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

  // Focus column rename input
  useEffect(() => {
    if (editingColumnIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingColumnIndex]);

  // ---- Emit changes ----
  const emit = useCallback(
    (updatedRows: ContractRateRow[], updatedColumns?: string[]) => {
      onChange({
        ...matrix,
        columns: updatedColumns || columns,
        rows: updatedRows,
      });
    },
    [matrix, onChange, columns]
  );

  // ---- Row CRUD ----

  const addRow = (particular?: string) => {
    const emptyRates: Record<string, number> = {};
    columns.forEach((col) => { emptyRates[col] = 0; });
    const newRow: ContractRateRow = {
      id: generateRowId(),
      particular: particular || "",
      rates: emptyRates,
      unit: "per_container",
      remarks: "",
    };
    emit([...rows, newRow]);
  };

  const updateRow = (rowId: string, updates: Partial<ContractRateRow>) => {
    emit(rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)));
  };

  const updateRowRate = (rowId: string, column: string, value: number) => {
    emit(
      rows.map((r) =>
        r.id === rowId ? { ...r, rates: { ...r.rates, [column]: value } } : r
      )
    );
  };

  const deleteRow = (rowId: string) => {
    emit(rows.filter((r) => r.id !== rowId));
  };

  const toggleSucceedingRule = (rowId: string) => {
    emit(
      rows.map((r) => {
        if (r.id !== rowId) return r;
        if (r.succeeding_rule) {
          const { succeeding_rule, ...rest } = r;
          return rest as ContractRateRow;
        }
        return { ...r, succeeding_rule: { rate: 0, after_qty: 1 } };
      })
    );
  };

  // ---- Column CRUD ----

  const addColumn = () => {
    const newName = `Mode ${columns.length + 1}`;
    const updatedRows = rows.map((r) => ({
      ...r,
      rates: { ...r.rates, [newName]: 0 },
    }));
    emit(updatedRows, [...columns, newName]);
    // Enter edit mode for the new column name
    setTimeout(() => {
      setEditingColumnIndex(columns.length);
      setEditingColumnValue(newName);
    }, 0);
  };

  const commitColumnRename = () => {
    if (editingColumnIndex === null) return;
    const oldName = columns[editingColumnIndex];
    const newName = editingColumnValue.trim();
    if (newName && newName !== oldName && !columns.includes(newName)) {
      const updatedCols = columns.map((c) => (c === oldName ? newName : c));
      const updatedRows = rows.map((r) => {
        const newRates = { ...r.rates };
        newRates[newName] = newRates[oldName] ?? 0;
        delete newRates[oldName];
        return { ...r, rates: newRates };
      });
      emit(updatedRows, updatedCols);
    }
    setEditingColumnIndex(null);
    setEditingColumnValue("");
  };

  const deleteColumn = (colName: string) => {
    if (columns.length <= 1) return;
    const updatedCols = columns.filter((c) => c !== colName);
    const updatedRows = rows.map((r) => {
      const newRates = { ...r.rates };
      delete newRates[colName];
      return { ...r, rates: newRates };
    });
    emit(updatedRows, updatedCols);
  };

  // ---- Format helpers ----

  const getUnitLabel = (unitValue: string) =>
    UNIT_OPTIONS.find((u) => u.value === unitValue)?.label || unitValue;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);

  // ---- Collect used charge_type_ids for duplicate prevention (Brokerage) ----
  const usedChargeTypeIds = useMemo(
    () => rows.map((r) => r.charge_type_id).filter(Boolean) as string[],
    [rows]
  );

  // ---- Trucking: New Destination Handling ----
  const [newTruckingDestination, setNewTruckingDestination] = useState<string | null>(null);

  // ============================================
  // RENDER
  // ============================================

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
          paddingBottom: "20px",
          borderBottom: "2px solid var(--neuron-ui-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <PhilippinePeso size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {displayLabel} Charges
          </h2>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--theme-text-muted)",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              padding: "2px 8px",
              borderRadius: "4px",
            }}
          >
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Add Charge / Add Destination button — top right */}
        {!viewMode && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Hide "Add Mode" for Trucking — fixed single-column layout */}
            {!isTrucking && (
              <button
                onClick={addColumn}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--theme-text-muted)",
                  backgroundColor: "transparent",
                  border: "1px dashed var(--neuron-ui-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                  e.currentTarget.style.color = "var(--theme-action-primary-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  e.currentTarget.style.color = "var(--theme-text-muted)";
                }}
              >
                <Plus size={14} />
                Add Mode
              </button>
            )}
            {isTrucking ? (
              <button
                onClick={() => {
                  // Create a new destination block immediately with a placeholder name
                  const placeholder = `New Destination`;
                  let finalName = placeholder;
                  let counter = 2;
                  const existingDests = new Set(rows.map((r) => r.remarks));
                  while (existingDests.has(finalName)) {
                    finalName = `New Destination ${counter}`;
                    counter++;
                  }
                  const TRUCKING_PRESETS = ["20ft_40ft", "back_to_back", "4wheeler", "6wheeler"];
                  const TRUCKING_LABELS = ["20ft / 40ft", "Back to back", "4Wheeler", "6Wheeler"];
                  const newRows: ContractRateRow[] = TRUCKING_PRESETS.map((id, i) => ({
                    id: generateRowId(),
                    particular: TRUCKING_LABELS[i],
                    charge_type_id: id,
                    rates: { Cost: 0 },
                    unit: "per_container",
                    remarks: finalName,
                    selection_group: finalName, // ✨ Auto-stamp for alternative row filtering
                  }));
                  emit([...rows, ...newRows]);
                  // Signal the TruckingDestinationBlocks to auto-edit this new block's name
                  setNewTruckingDestination(finalName);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--neuron-brand-green)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Plus size={14} />
                Add Destination
              </button>
            ) : (
            <button
              onClick={() => addRow()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--neuron-brand-green)",
                backgroundColor: "transparent",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Plus size={14} />
              Add Charge
            </button>
            )}
          </div>
        )}
      </div>

      {/* ── Trucking: Destination Blocks ── */}
      {isTrucking ? (
        <TruckingDestinationBlocks
          rows={rows}
          onChangeRows={(updatedRows) => emit(updatedRows)}
          viewMode={viewMode}
          newDestination={newTruckingDestination}
          onNewDestinationCleared={() => setNewTruckingDestination(null)}
        />
      ) : (
      <>
      {/* ── Empty State ── */}
      {rows.length === 0 && viewMode ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "10px",
          }}
        >
          <LayoutGrid
            size={48}
            strokeWidth={1.2}
            style={{
              color: "var(--neuron-ink-muted)",
              margin: "0 auto 12px auto",
              display: "block",
              opacity: 0.75,
            }}
          />
          <h3
            style={{
              color: "var(--neuron-ink-primary)",
              fontSize: "16px",
              fontWeight: 500,
              marginBottom: "4px",
            }}
          >
            No charges defined
          </h3>
          <p style={{ color: "var(--neuron-ink-muted)", fontSize: "14px", margin: 0 }}>
            No charge items have been added for this service.
          </p>
        </div>
      ) : (
        /* ── Rate Grid ── */
        <div
          style={{
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "10px",
            overflow: "visible",
            backgroundColor: "var(--theme-bg-surface)",
          }}
        >
          <div style={{ overflowX: "visible" as any }}>
            {/* Grid Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: buildGridTemplate(columns, viewMode, isTrucking),
                gap: "0",
                padding: "10px 16px",
                backgroundColor: "var(--theme-bg-surface)",
                borderBottom: "2px solid var(--neuron-ui-border)",
                borderRadius: "10px 10px 0 0",
                minWidth: "fit-content",
                alignItems: "center",
              }}
            >
              {/* Particular / Truck Config header */}
              <div style={gridHeaderCell}>{isTrucking ? "Truck Config" : "Particular"}</div>

              {/* Mode column headers */}
              {columns.map((col, colIdx) => (
                <div
                  key={col}
                  style={{
                    ...gridHeaderCell,
                    textAlign: "right",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "6px",
                  }}
                >
                  {!isTrucking && editingColumnIndex === colIdx ? (
                    <input
                      ref={editInputRef}
                      value={editingColumnValue}
                      onChange={(e) => setEditingColumnValue(e.target.value)}
                      onBlur={commitColumnRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitColumnRename();
                        if (e.key === "Escape") {
                          setEditingColumnIndex(null);
                          setEditingColumnValue("");
                        }
                      }}
                      style={{
                        width: "80px",
                        padding: "2px 6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        border: "1px solid var(--neuron-brand-green)",
                        borderRadius: "4px",
                        outline: "none",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--theme-action-primary-bg)",
                        textAlign: "right",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}
                    />
                  ) : (
                    <span
                      style={{ cursor: viewMode || isTrucking ? "default" : "pointer" }}
                      onDoubleClick={() => {
                        if (!viewMode && !isTrucking) {
                          setEditingColumnIndex(colIdx);
                          setEditingColumnValue(col);
                        }
                      }}
                      title={viewMode || isTrucking ? col : "Double-click to rename"}
                    >
                      {col} (PHP)
                    </span>
                  )}
                  {!viewMode && !isTrucking && columns.length > 1 && editingColumnIndex !== colIdx && (
                    <button
                      onClick={() => deleteColumn(col)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "1px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--theme-text-muted)",
                        opacity: 0.6,
                        lineHeight: 0,
                      }}
                      title={`Remove "${col}" mode`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}

              {/* Destination header (Trucking) or Unit header (other services) */}
              <div style={gridHeaderCell}>{isTrucking ? "Destination" : "Unit"}</div>

              {/* Delete header (empty) */}
              {!viewMode && <div style={gridHeaderCell}></div>}
            </div>

            {/* Rows */}
            {rows.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--neuron-ink-muted)",
                  fontSize: "13px",
                }}
              >
                No charge items yet. Click "+ Add Charge" above to get started.
              </div>
            ) : (
              rows.map((row, idx) => (
                <RateLineItem
                  key={row.id}
                  row={row}
                  columns={columns}
                  viewMode={viewMode}
                  isLast={idx === rows.length - 1}
                  isTrucking={isTrucking}
                  serviceType={matrix.service_type}
                  usedChargeTypeIds={usedChargeTypeIds}
                  onUpdate={(updates) => updateRow(row.id, updates)}
                  onUpdateRate={(col, val) => updateRowRate(row.id, col, val)}
                  onDelete={() => deleteRow(row.id)}
                  onToggleSucceeding={() => toggleSucceedingRule(row.id)}
                  formatCurrency={formatCurrency}
                  getUnitLabel={getUnitLabel}
                />
              ))
            )}

            {/* Footer */}
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--theme-bg-surface)",
                borderTop: "1px solid var(--neuron-ui-border)",
                borderRadius: "0 0 10px 10px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--neuron-ink-muted)",
              }}
            >
              {rows.length} {rows.length === 1 ? "charge item" : "charge items"}
              {!isTrucking && (
                <>
                  {" "}&middot; {columns.length} {columns.length === 1 ? "mode" : "modes"}
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
  padding: "6px 10px",
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
  usedChargeTypeIds,
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
  usedChargeTypeIds: string[];
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
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-primary)",
                padding: "6px 8px",
              }}
            >
              {row.particular || "\u2014"}
            </span>
          ) : (
            <ChargeTypeCombobox
              value={row.particular}
              chargeTypeId={row.charge_type_id}
              serviceType={serviceType}
              onChange={({ particular, charge_type_id, unit }) => {
                const updates: Partial<ContractRateRow> = {
                  particular,
                  charge_type_id,
                };
                if (unit) updates.unit = unit;
                onUpdate(updates);
              }}
              placeholder={isTrucking ? "e.g., 20ft/40ft, 4Wheeler" : "Select or type a charge..."}
              usedChargeTypeIds={usedChargeTypeIds}
              allowDuplicates={isTrucking}
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
                  fontSize: "13px",
                  color: "var(--neuron-ink-primary)",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  padding: "6px 8px",
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
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--theme-text-muted)",
                  fontStyle: "italic",
                  padding: "6px 8px",
                }}
              >
                &mdash;
              </span>
            ) : viewMode ? (
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--neuron-ink-primary)",
                  padding: "6px 8px",
                }}
              >
                {getUnitLabel(row.unit)}
              </span>
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
        {/* At Cost toggle */}
        {!viewMode && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
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
            }}
          >
            <input
              type="checkbox"
              checked={isAtCost}
              onChange={() => onUpdate({ is_at_cost: !isAtCost })}
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
        )}

        {/* Tiered toggle */}
        {!isAtCost && (
          viewMode ? (
            hasTiered && row.succeeding_rule ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--theme-action-primary-bg)",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  backgroundColor: "transparent",
                  flexShrink: 0,
                  letterSpacing: "0.3px",
                }}
              >
                TIERED: After first {row.succeeding_rule.after_qty} &rarr; {formatCurrency(row.succeeding_rule.rate)}/unit
              </span>
            ) : null
          ) : (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
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
              }}
            >
              <input
                type="checkbox"
                checked={hasTiered}
                onChange={onToggleSucceeding}
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
          )
        )}

        {/* Tiered config (when active) */}
        {hasTiered && row.succeeding_rule && !viewMode && (
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
              onChange={(e) =>
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
                onChange={(e) =>
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
            {viewMode ? (
              row.remarks ? (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--neuron-ink-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {row.remarks}
                </span>
              ) : null
            ) : (
              <input
                type="text"
                value={row.remarks || ""}
                onChange={(e) => onUpdate({ remarks: e.target.value })}
                placeholder="Remarks (optional)"
                style={{
                  ...cellInputStyle,
                  flex: 1,
                  minWidth: "120px",
                  fontSize: "12px",
                  color: "var(--neuron-ink-muted)",
                  fontStyle: "italic",
                }}
              />
            )}
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