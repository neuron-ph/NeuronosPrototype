/**
 * ContractRateMatrixEditor
 * 
 * Editable rate matrix table for Contract Quotations.
 * Mirrors how clients actually see their rate agreements:
 *   Rows = charge particulars (Container, Clearance, Documentation, etc.)
 *   Columns = mode variants (FCL, LCL/AIR, etc.)
 * 
 * Supports:
 *   - Add/remove rows and columns
 *   - Per-row unit type selector
 *   - Optional succeeding rule per row (e.g., "P1,800 per succeeding container")
 *   - Remarks column
 *   - Read-only viewMode
 * 
 * @see /types/pricing.ts - ContractRateMatrix, ContractRateRow
 * @see /docs/blueprints/CONTRACT_QUOTATION_BLUEPRINT.md - Phase 1, Task 1.3
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Info } from "lucide-react";
import type { ContractRateMatrix, ContractRateRow, RateCategoryKind, RateRowTrigger, ServiceType } from "../../../types/pricing";
import { useEnumOptions } from "../../../hooks/useEnumOptions";

// ============================================
// TRIGGER (applies_when) SUGGESTIONS
// ============================================

/**
 * Maps known particular-name keywords to a suggested RateRowTrigger so the
 * editor can offer click-to-apply hints during the manual sweep. Suggestions
 * are NEVER auto-applied — Pricing reviews them via the trigger popover.
 * Order matters: more specific patterns first (e.g. "X-RAY" before generic).
 */
const TRIGGER_SUGGESTIONS: Array<{ pattern: RegExp; trigger: RateRowTrigger }> = [
  { pattern: /\bX[-\s]?RAY\b|\bXRAY\b/i, trigger: { kind: 'examination', value: 'X-ray' } },
  { pattern: /\bSPOT\s?CHECK\b/i,         trigger: { kind: 'examination', value: 'Spotcheck' } },
  { pattern: /\bDEA\b/i,                  trigger: { kind: 'examination', value: 'DEA' } },
  { pattern: /\bBAI\b/i,                  trigger: { kind: 'permit', value: 'BAI' } },
  { pattern: /\bSRA\b/i,                  trigger: { kind: 'permit', value: 'SRA' } },
  { pattern: /\bBPI\b/i,                  trigger: { kind: 'permit', value: 'BPI' } },
  { pattern: /\bFDA\b/i,                  trigger: { kind: 'permit', value: 'FDA' } },
  { pattern: /\bBPS\b/i,                  trigger: { kind: 'permit', value: 'BPS' } },
  { pattern: /\bLTO\b/i,                  trigger: { kind: 'permit', value: 'LTO' } },
];

function suggestTrigger(particular: string): RateRowTrigger | null {
  for (const { pattern, trigger } of TRIGGER_SUGGESTIONS) {
    if (pattern.test(particular)) return trigger;
  }
  return null;
}

function triggerLabel(t: RateRowTrigger | undefined): string {
  if (!t || t.kind === 'always') return 'TRIGGER';
  if (t.kind === 'examination') return `EXAM:${t.value}`;
  return `PERMIT:${t.value}`;
}

// ============================================
// UNIT OPTIONS
// ============================================

const UNIT_OPTIONS = [
  { value: "per_container", label: "Per Container" },
  { value: "per_shipment", label: "Per Shipment" },
  { value: "per_bl", label: "Per B/L" },
  { value: "per_set", label: "Per Set" },
  { value: "per_kg", label: "Per KG" },
  { value: "per_cbm", label: "Per CBM" },
  { value: "flat", label: "Flat Fee" },
];

// ============================================
// DEFAULT COLUMNS PER SERVICE TYPE
// ============================================

const DEFAULT_COLUMNS: Record<string, string[]> = {
  "Brokerage": ["FCL", "LCL / AIR"],
  "Forwarding": ["FCL", "LCL", "AIR"],
  "Trucking": ["Standard", "Wing Van", "Flat Bed"],
  "Marine Insurance": ["Standard"],
  "Others": ["Standard"],
};

// ============================================
// ID GENERATORS
// ============================================

const generateRowId = () => `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ============================================
// STYLES
// ============================================

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  backgroundColor: "var(--theme-bg-surface-subtle)",
  borderBottom: "1px solid var(--neuron-ui-border)",
  cursor: "pointer",
  userSelect: "none",
};

const tableHeaderCellStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--neuron-ink-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  borderBottom: "2px solid var(--neuron-ui-border)",
  backgroundColor: "var(--theme-bg-surface)",
  textAlign: "left",
};

const tableCellStyle: React.CSSProperties = {
  padding: "0",
  borderBottom: "1px solid var(--neuron-ui-border)",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "13px",
  color: "var(--neuron-ink-primary)",
  backgroundColor: "transparent",
  border: "none",
  outline: "none",
  fontFamily: "inherit",
};

const currencyInputStyle: React.CSSProperties = {
  ...inputStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const readOnlyValueStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "13px",
  color: "var(--neuron-ink-primary)",
};

const readOnlyCurrencyStyle: React.CSSProperties = {
  ...readOnlyValueStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

// ============================================
// PROPS
// ============================================

interface ContractRateMatrixEditorProps {
  matrix: ContractRateMatrix;
  onChange: (matrix: ContractRateMatrix) => void;
  viewMode?: boolean;
  serviceLabel?: string; // Override display label (e.g., "Customs Brokerage" instead of "Brokerage")
}

// ============================================
// SUB-COMPONENTS
// ============================================

/** Inline succeeding rule editor shown below a row */
function SucceedingRuleEditor({
  rule,
  onChange,
  onRemove,
  viewMode,
}: {
  rule: { rate: number; after_qty: number };
  onChange: (rule: { rate: number; after_qty: number }) => void;
  onRemove: () => void;
  viewMode?: boolean;
}) {
  if (viewMode) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px 10px 40px",
        fontSize: "12px",
        color: "var(--neuron-ink-muted)",
        backgroundColor: "var(--theme-bg-surface)",
      }}>
        <Info size={12} />
        <span>
          After first {rule.after_qty}: <strong style={{ color: "var(--neuron-ink-primary)" }}>
            {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(rule.rate)}
          </strong> per succeeding unit
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px 10px 40px",
      fontSize: "12px",
      color: "var(--neuron-ink-muted)",
      backgroundColor: "var(--theme-bg-surface)",
    }}>
      <Info size={12} style={{ flexShrink: 0 }} />
      <span style={{ whiteSpace: "nowrap" }}>After first</span>
      <input
        type="number"
        min={1}
        value={rule.after_qty}
        onChange={(e) => onChange({ ...rule, after_qty: parseInt(e.target.value) || 1 })}
        style={{
          width: "48px",
          padding: "4px 6px",
          fontSize: "12px",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "4px",
          textAlign: "center",
          color: "var(--neuron-ink-primary)",
        }}
      />
      <span>at</span>
      <div style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "4px",
        overflow: "hidden",
      }}>
        <span style={{
          padding: "4px 6px",
          fontSize: "12px",
          color: "var(--neuron-ink-muted)",
          backgroundColor: "var(--theme-bg-surface-subtle)",
          borderRight: "1px solid var(--neuron-ui-border)",
        }}>
          PHP
        </span>
        <input
          type="number"
          min={0}
          step={100}
          value={rule.rate || ""}
          onChange={(e) => onChange({ ...rule, rate: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          style={{
            width: "80px",
            padding: "4px 6px",
            fontSize: "12px",
            border: "none",
            outline: "none",
            textAlign: "right",
            color: "var(--neuron-ink-primary)",
          }}
        />
      </div>
      <span>per succeeding unit</span>
      <button
        onClick={onRemove}
        style={{
          marginLeft: "auto",
          padding: "2px",
          color: "var(--neuron-semantic-danger)",
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: 0.6,
        }}
        title="Remove succeeding rule"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ContractRateMatrixEditor({
  matrix,
  onChange,
  viewMode = false,
  serviceLabel,
}: ContractRateMatrixEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);
  const [editingColumnValue, setEditingColumnValue] = useState("");

  // Trigger popover value lists — fetched once per editor instance and passed
  // into each row to avoid one Supabase query per row.
  const examOptions = useEnumOptions('examination');
  const permitOptions = useEnumOptions('permits');

  const displayLabel = serviceLabel || matrix.service_type;
  const columns = matrix.columns;
  const rows = matrix.rows;
  const categories = matrix.categories;

  // Build a row.id → category.kind map so each RowGroup can conditionally
  // render the TRIGGER button (optional only) and warning badges (untagged
  // rows inside optional categories). Memoised on the shape that drives it.
  const rowKindMap = useMemo(() => {
    const map = new Map<string, RateCategoryKind>();
    if (categories) {
      for (const cat of categories) {
        const kind = cat.kind ?? 'standard';
        for (const r of cat.rows) map.set(r.id, kind);
      }
    }
    return map;
  }, [categories]);

  const updateCategoryKind = useCallback((categoryId: string, nextKind: RateCategoryKind) => {
    if (!categories) return;
    const nextCategories = categories.map((c) =>
      c.id === categoryId ? { ...c, kind: nextKind } : c
    );
    onChange({ ...matrix, categories: nextCategories });
  }, [matrix, onChange, categories]);

  // ---- Row CRUD ----

  const addRow = useCallback(() => {
    const emptyRates: Record<string, number> = {};
    columns.forEach((col) => { emptyRates[col] = 0; });

    const newRow: ContractRateRow = {
      id: generateRowId(),
      particular: "",
      rates: emptyRates,
      unit: "per_container",
      remarks: "",
    };

    onChange({ ...matrix, rows: [...rows, newRow] });
  }, [matrix, onChange, columns, rows]);

  const addGroupHeader = useCallback(() => {
    const groupRow: ContractRateRow = {
      id: generateRowId(),
      particular: "",
      rates: {},
      unit: "flat",
      remarks: "",
      group_label: "New Group",
    };
    onChange({ ...matrix, rows: [...rows, groupRow] });
  }, [matrix, onChange, rows]);

  const updateRow = useCallback((rowId: string, updates: Partial<ContractRateRow>) => {
    onChange({
      ...matrix,
      rows: rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)),
    });
  }, [matrix, onChange, rows]);

  const deleteRow = useCallback((rowId: string) => {
    onChange({ ...matrix, rows: rows.filter((r) => r.id !== rowId) });
  }, [matrix, onChange, rows]);

  const updateRowRate = useCallback((rowId: string, column: string, value: number) => {
    onChange({
      ...matrix,
      rows: rows.map((r) =>
        r.id === rowId ? { ...r, rates: { ...r.rates, [column]: value } } : r
      ),
    });
  }, [matrix, onChange, rows]);

  const toggleSucceedingRule = useCallback((rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    if (row.succeeding_rule) {
      // Remove rule
      const { succeeding_rule, ...rest } = row;
      onChange({ ...matrix, rows: rows.map((r) => (r.id === rowId ? rest as ContractRateRow : r)) });
    } else {
      // Add rule
      updateRow(rowId, { succeeding_rule: { rate: 0, after_qty: 1 } });
    }
  }, [matrix, onChange, rows, updateRow]);

  // ---- Column CRUD ----

  const addColumn = useCallback(() => {
    const newColName = `Mode ${columns.length + 1}`;
    const updatedRows = rows.map((r) => ({
      ...r,
      rates: { ...r.rates, [newColName]: 0 },
    }));
    onChange({ ...matrix, columns: [...columns, newColName], rows: updatedRows });
    // Auto-enter edit mode for the new column header
    setEditingColumnIndex(columns.length);
    setEditingColumnValue(newColName);
  }, [matrix, onChange, columns, rows]);

  const renameColumn = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    const trimmedName = newName.trim();

    // Don't allow duplicate column names
    if (columns.includes(trimmedName)) return;

    const updatedColumns = columns.map((c) => (c === oldName ? trimmedName : c));
    const updatedRows = rows.map((r) => {
      const newRates = { ...r.rates };
      newRates[trimmedName] = newRates[oldName] ?? 0;
      delete newRates[oldName];
      return { ...r, rates: newRates };
    });

    onChange({ ...matrix, columns: updatedColumns, rows: updatedRows });
  }, [matrix, onChange, columns, rows]);

  const deleteColumn = useCallback((colName: string) => {
    if (columns.length <= 1) return; // Must keep at least one column
    const updatedColumns = columns.filter((c) => c !== colName);
    const updatedRows = rows.map((r) => {
      const newRates = { ...r.rates };
      delete newRates[colName];
      return { ...r, rates: newRates };
    });
    onChange({ ...matrix, columns: updatedColumns, rows: updatedRows });
  }, [matrix, onChange, columns, rows]);

  const commitColumnRename = useCallback(() => {
    if (editingColumnIndex !== null) {
      const oldName = columns[editingColumnIndex];
      if (editingColumnValue.trim() && editingColumnValue.trim() !== oldName) {
        renameColumn(oldName, editingColumnValue.trim());
      }
      setEditingColumnIndex(null);
      setEditingColumnValue("");
    }
  }, [editingColumnIndex, editingColumnValue, columns, renameColumn]);

  // ---- Formatters ----

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);

  const getUnitLabel = (unitValue: string) =>
    UNIT_OPTIONS.find((u) => u.value === unitValue)?.label || unitValue;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "var(--neuron-radius-m)",
      overflow: "hidden",
      marginBottom: "16px",
      backgroundColor: "var(--theme-bg-surface)",
    }}>
      {/* Section Header */}
      <div
        style={sectionHeaderStyle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: "var(--neuron-ink-muted)" }} />
          ) : (
            <ChevronRight size={16} style={{ color: "var(--neuron-ink-muted)" }} />
          )}
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}>
            {displayLabel} Rate Card
          </span>
          <span style={{
            fontSize: "11px",
            color: "var(--neuron-ink-muted)",
            fontWeight: 400,
          }}>
            {rows.length} {rows.length === 1 ? "item" : "items"} &middot; {columns.length} {columns.length === 1 ? "mode" : "modes"}
          </span>
        </div>

        {!viewMode && (
          <div
            style={{ display: "flex", gap: "8px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={addColumn}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--neuron-brand-green-100)",
                border: "1px solid var(--neuron-brand-green)",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Plus size={12} />
              Column
            </button>
            <button
              onClick={addRow}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--neuron-brand-green-100)",
                border: "1px solid var(--neuron-brand-green)",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Plus size={12} />
              Row
            </button>
            <button
              onClick={addGroupHeader}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--theme-text-muted)",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Plus size={12} />
              Group
            </button>
          </div>
        )}
      </div>

      {/* Category dispatch settings — only renders when categories exist. Lets
          Pricing tell the engine how each category should be evaluated:
            Standard → every row applies (legacy behaviour)
            Optional → rows only apply when booking declares the matching fact
                       via applies_when (per-row TRIGGER popover below)
            Delivery → matches container type + delivery address (Phase 3)
          See /docs/blueprints/CATEGORY_DISPATCH_BLUEPRINT.md */}
      {isExpanded && categories && categories.length > 0 && !viewMode && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Category dispatch
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {categories.map((cat) => {
              const kind: RateCategoryKind = cat.kind ?? 'standard';
              return (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, fontSize: "12px", fontWeight: 600, color: "var(--neuron-ink-default)" }}>
                    {cat.category_name || "—"}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {(['standard', 'optional', 'delivery'] as const).map((k) => {
                      const selected = kind === k;
                      const colour = k === 'optional' ? '#92400E' : k === 'delivery' ? '#1E40AF' : 'var(--neuron-ink-default)';
                      const bg = selected
                        ? (k === 'optional' ? '#FEF3C7' : k === 'delivery' ? '#DBEAFE' : '#E5E7EB')
                        : 'transparent';
                      const border = selected
                        ? (k === 'optional' ? '1px solid #FCD34D' : k === 'delivery' ? '1px solid #93C5FD' : '1px solid #D1D5DB')
                        : '1px solid var(--neuron-ui-border)';
                      return (
                        <button
                          key={k}
                          onClick={() => updateCategoryKind(cat.id, k)}
                          style={{
                            padding: "3px 10px",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.3px",
                            textTransform: "uppercase",
                            background: bg,
                            color: selected ? colour : 'var(--neuron-ink-muted)',
                            border,
                            borderRadius: "4px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {isExpanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}>
            <colgroup>
              {/* Actions column (if editable) */}
              {!viewMode && <col style={{ width: "40px" }} />}
              {/* Particular */}
              <col style={{ width: "180px" }} />
              {/* Rate columns */}
              {columns.map((_, i) => (
                <col key={i} style={{ width: "140px" }} />
              ))}
              {/* Unit */}
              <col style={{ width: "140px" }} />
              {/* Remarks */}
              <col style={{ minWidth: "160px" }} />
            </colgroup>

            <thead>
              <tr>
                {!viewMode && <th style={{ ...tableHeaderCellStyle, width: "40px" }} />}
                <th style={tableHeaderCellStyle}>Particular</th>
                {columns.map((col, colIdx) => (
                  <th
                    key={col}
                    style={{
                      ...tableHeaderCellStyle,
                      textAlign: "right",
                      position: "relative",
                    }}
                  >
                    {!viewMode && editingColumnIndex === colIdx ? (
                      <input
                        autoFocus
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
                          width: "100%",
                          padding: "2px 4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          border: "1px solid var(--neuron-brand-green)",
                          borderRadius: "3px",
                          outline: "none",
                          textAlign: "right",
                          backgroundColor: "var(--theme-bg-surface)",
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                        <span
                          style={{ cursor: viewMode ? "default" : "pointer" }}
                          onDoubleClick={() => {
                            if (!viewMode) {
                              setEditingColumnIndex(colIdx);
                              setEditingColumnValue(col);
                            }
                          }}
                          title={viewMode ? undefined : "Double-click to rename"}
                        >
                          {col}
                        </span>
                        {!viewMode && columns.length > 1 && (
                          <button
                            onClick={() => deleteColumn(col)}
                            style={{
                              padding: "1px",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--neuron-ink-muted)",
                              opacity: 0.5,
                              lineHeight: 0,
                            }}
                            title={`Remove "${col}" column`}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                ))}
                <th style={tableHeaderCellStyle}>Unit</th>
                <th style={tableHeaderCellStyle}>Remarks</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (viewMode ? 3 : 4)}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--neuron-ink-muted)",
                      fontSize: "13px",
                      borderBottom: "1px solid var(--neuron-ui-border)",
                    }}
                  >
                    {viewMode
                      ? "No rate items defined"
                      : "No rate items yet. Click \"+ Row\" to add a charge particular."}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <RowGroup
                  key={row.id}
                  row={row}
                  columns={columns}
                  viewMode={viewMode}
                  onUpdateRow={updateRow}
                  onUpdateRate={updateRowRate}
                  onDeleteRow={deleteRow}
                  onToggleSucceeding={toggleSucceedingRule}
                  formatCurrency={formatCurrency}
                  getUnitLabel={getUnitLabel}
                  examOptions={examOptions}
                  permitOptions={permitOptions}
                  parentKind={rowKindMap.get(row.id) ?? 'standard'}
                />
              ))}
            </tbody>
          </table>

          {/* Add Row Footer (edit mode only) */}
          {!viewMode && rows.length > 0 && (
            <div
              onClick={addRow}
              style={{
                padding: "10px 16px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderTop: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            >
              <Plus size={14} />
              Add Particular
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// ROW GROUP (row + optional succeeding rule)
// ============================================

function RowGroup({
  row,
  columns,
  viewMode,
  onUpdateRow,
  onUpdateRate,
  onDeleteRow,
  onToggleSucceeding,
  formatCurrency,
  getUnitLabel,
  examOptions,
  permitOptions,
  parentKind,
}: {
  row: ContractRateRow;
  columns: string[];
  viewMode?: boolean;
  onUpdateRow: (id: string, updates: Partial<ContractRateRow>) => void;
  onUpdateRate: (id: string, column: string, value: number) => void;
  onDeleteRow: (id: string) => void;
  onToggleSucceeding: (id: string) => void;
  formatCurrency: (val: number) => string;
  getUnitLabel: (unit: string) => string;
  examOptions: string[];
  permitOptions: string[];
  /** Dispatch kind of the enclosing category. Defaults to 'standard' when unknown. */
  parentKind: RateCategoryKind;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [triggerPopoverOpen, setTriggerPopoverOpen] = useState(false);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerPopoverRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!triggerPopoverOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        triggerPopoverRef.current && !triggerPopoverRef.current.contains(e.target as Node) &&
        triggerButtonRef.current && !triggerButtonRef.current.contains(e.target as Node)
      ) {
        setTriggerPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [triggerPopoverOpen]);

  const hasTrigger = !!row.applies_when && row.applies_when.kind !== 'always';
  const suggestion = useMemo(() => suggestTrigger(row.particular || ''), [row.particular]);
  const showSuggestion = !viewMode && !hasTrigger && !!suggestion;

  const applyTrigger = (next: RateRowTrigger | undefined) => {
    if (!next || next.kind === 'always') {
      // Clear by re-emitting the row without applies_when
      const { applies_when, ...rest } = row;
      onUpdateRow(row.id, { ...rest, applies_when: undefined } as Partial<ContractRateRow>);
    } else {
      onUpdateRow(row.id, { applies_when: next });
    }
    setTriggerPopoverOpen(false);
  };

  // ---- Group Header Row ----
  if (row.group_label !== undefined) {
    const totalCols = columns.length + (viewMode ? 3 : 4); // actions(edit) + particular + rate cols + unit + remarks
    return (
      <tr
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ backgroundColor: "#F0F7F6" }}
      >
        {!viewMode && (
          <td style={{ ...tableCellStyle, textAlign: "center", borderBottom: "2px solid #0F766E" }}>
            <button
              onClick={() => onDeleteRow(row.id)}
              style={{
                padding: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neuron-semantic-danger)",
                opacity: isHovered ? 0.8 : 0.2,
                transition: "opacity 0.15s ease",
                lineHeight: 0,
              }}
              title="Remove group"
            >
              <Trash2 size={13} />
            </button>
          </td>
        )}
        <td
          colSpan={totalCols - (viewMode ? 0 : 1)}
          style={{
            ...tableCellStyle,
            borderBottom: "2px solid #0F766E",
            padding: "8px 10px",
          }}
        >
          {viewMode ? (
            <div style={{
              fontWeight: 700,
              fontSize: "13px",
              color: "var(--neuron-brand-green)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              {row.group_label || "—"}
            </div>
          ) : (
            <input
              type="text"
              value={row.group_label || ""}
              onChange={(e) => onUpdateRow(row.id, { group_label: e.target.value })}
              placeholder="e.g., Valenzuela City, Within Metro Manila"
              style={{
                ...inputStyle,
                fontWeight: 700,
                fontSize: "13px",
                color: "var(--neuron-brand-green)",
                backgroundColor: "transparent",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            />
          )}
        </td>
      </tr>
    );
  }

  // ---- Normal Data Row ----
  const isAtCost = row.is_at_cost === true;

  return (
    <>
      <tr
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          backgroundColor: isHovered && !viewMode ? "var(--neuron-state-hover)" : "transparent",
          transition: "background-color 0.1s ease",
        }}
      >
        {/* Actions */}
        {!viewMode && (
          <td style={{ ...tableCellStyle, textAlign: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
              <button
                onClick={() => onDeleteRow(row.id)}
                style={{
                  padding: "4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--neuron-semantic-danger)",
                  opacity: isHovered ? 0.8 : 0.2,
                  transition: "opacity 0.15s ease",
                  lineHeight: 0,
                }}
                title="Remove row"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </td>
        )}

        {/* Particular */}
        <td style={tableCellStyle}>
          {viewMode ? (
            <div style={readOnlyValueStyle}>
              <span style={{ fontWeight: 500 }}>{row.particular || "—"}</span>
            </div>
          ) : (
            <input
              type="text"
              value={row.particular}
              onChange={(e) => onUpdateRow(row.id, { particular: e.target.value })}
              placeholder="e.g., Container, Clearance"
              style={{ ...inputStyle, fontWeight: 500 }}
            />
          )}
        </td>

        {/* Rate Columns */}
        {columns.map((col) => (
          <td key={col} style={tableCellStyle}>
            {isAtCost ? (
              /* "At Cost" — show label instead of inputs */
              <div style={{
                padding: "7px 10px",
                fontSize: "13px",
                fontWeight: 500,
                fontStyle: "italic",
                color: "var(--theme-text-muted)",
                textAlign: "right",
                backgroundColor: viewMode ? "transparent" : "var(--theme-bg-surface-subtle)",
                borderRadius: "4px",
              }}>
                At Cost
              </div>
            ) : viewMode ? (
              <div style={readOnlyCurrencyStyle}>
                {(row.rates[col] ?? 0) > 0 ? formatCurrency(row.rates[col]) : "—"}
              </div>
            ) : (
              <input
                type="number"
                min={0}
                step={100}
                value={row.rates[col] ?? ""}
                onChange={(e) => onUpdateRate(row.id, col, parseFloat(e.target.value) || 0)}
                placeholder="0"
                style={currencyInputStyle}
              />
            )}
          </td>
        ))}

        {/* Unit */}
        <td style={tableCellStyle}>
          {isAtCost ? (
            <div style={{
              padding: "7px 10px",
              fontSize: "12px",
              color: "var(--theme-text-muted)",
              fontStyle: "italic",
            }}>
              —
            </div>
          ) : viewMode ? (
            <div style={readOnlyValueStyle}>
              {getUnitLabel(row.unit)}
            </div>
          ) : (
            <select
              value={row.unit}
              onChange={(e) => onUpdateRow(row.id, { unit: e.target.value })}
              style={{
                ...inputStyle,
                cursor: "pointer",
                appearance: "auto",
              }}
            >
              {UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </td>

        {/* Remarks */}
        <td style={tableCellStyle}>
          {viewMode ? (
            <div style={{ ...readOnlyValueStyle, color: "var(--neuron-ink-muted)", fontSize: "12px" }}>
              {row.remarks || "—"}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                type="text"
                value={row.remarks || ""}
                onChange={(e) => onUpdateRow(row.id, { remarks: e.target.value })}
                placeholder="Optional notes"
                style={{ ...inputStyle, fontSize: "12px", color: "var(--neuron-ink-muted)" }}
              />
              {/* At Cost toggle */}
              <button
                onClick={() => onUpdateRow(row.id, { is_at_cost: !isAtCost })}
                title={isAtCost ? "Switch to fixed rate" : "Mark as At Cost"}
                style={{
                  padding: "3px 6px",
                  background: isAtCost ? "#DBEAFE" : "none",
                  border: isAtCost ? "1px solid #93C5FD" : "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  color: isAtCost ? "#1D4ED8" : "var(--neuron-ink-muted)",
                  opacity: isAtCost ? 1 : (isHovered ? 0.6 : 0.2),
                  transition: "all 0.15s ease",
                  fontSize: "9px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  marginLeft: "2px",
                  letterSpacing: "0.3px",
                }}
              >
                {isAtCost ? "AT COST" : "$"}
              </button>
              {/* Succeeding rule toggle — hidden when at cost */}
              {!isAtCost && (
                <button
                  onClick={() => onToggleSucceeding(row.id)}
                  title={row.succeeding_rule ? "Remove tiered pricing" : "Add tiered pricing (succeeding rate)"}
                  style={{
                    padding: "4px 6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: row.succeeding_rule ? "#0F766E" : "var(--neuron-ink-muted)",
                    opacity: row.succeeding_rule ? 1 : (isHovered ? 0.6 : 0.2),
                    transition: "opacity 0.15s ease",
                    fontSize: "10px",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {row.succeeding_rule ? "TIERED" : "+TIER"}
                </button>
              )}
              {/* Trigger (applies_when) toggle — sets which booking fact gates this row.
                  Only renders inside 'optional' categories where the dispatcher
                  honours applies_when. For 'standard' categories every row applies
                  regardless, so a trigger would be misleading; for 'delivery'
                  categories the dispatcher uses a different matching algorithm
                  (container type + address) and applies_when is ignored. */}
              {parentKind === 'optional' && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  ref={triggerButtonRef}
                  onClick={() => setTriggerPopoverOpen((v) => !v)}
                  title={
                    hasTrigger
                      ? `Only applies when booking declares ${row.applies_when!.kind} "${row.applies_when!.value}". Click to change.`
                      : showSuggestion
                        ? `Suggested: ${triggerLabel(suggestion!)} — click to configure`
                        : 'Always applies. Click to gate by a booking fact.'
                  }
                  style={{
                    padding: '3px 6px',
                    background: hasTrigger ? '#FEF3C7' : (showSuggestion ? '#FEF9C3' : 'none'),
                    border: hasTrigger
                      ? '1px solid #FCD34D'
                      : (showSuggestion ? '1px dashed #FCD34D' : 'none'),
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: hasTrigger ? '#92400E' : (showSuggestion ? '#92400E' : 'var(--neuron-ink-muted)'),
                    opacity: hasTrigger || showSuggestion ? 1 : (isHovered ? 0.6 : 0.2),
                    transition: 'all 0.15s ease',
                    fontSize: '9px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    marginLeft: '2px',
                    letterSpacing: '0.3px',
                  }}
                >
                  {triggerLabel(row.applies_when)}
                </button>
                {triggerPopoverOpen && (
                  <div
                    ref={triggerPopoverRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      right: 0,
                      width: '280px',
                      backgroundColor: 'var(--theme-bg-surface)',
                      border: '1px solid var(--neuron-ui-border)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                      padding: '12px',
                      zIndex: 100,
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--neuron-ink-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Triggered by
                    </div>
                    {showSuggestion && (
                      <button
                        onClick={() => applyTrigger(suggestion!)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          marginBottom: '8px',
                          background: '#FEF9C3',
                          border: '1px dashed #FCD34D',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#92400E',
                          cursor: 'pointer',
                        }}
                      >
                        Suggested: {triggerLabel(suggestion!)} — apply
                      </button>
                    )}
                    {(['always', 'examination', 'permit'] as const).map((kind) => (
                      <label key={kind} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`trigger-${row.id}`}
                          checked={(row.applies_when?.kind ?? 'always') === kind}
                          onChange={() => {
                            if (kind === 'always') {
                              applyTrigger({ kind: 'always' });
                            } else {
                              const list = kind === 'examination' ? examOptions : permitOptions;
                              applyTrigger({ kind, value: row.applies_when?.value ?? list[0] ?? '' });
                            }
                          }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{kind === 'always' ? 'Always (no gate)' : kind}</span>
                      </label>
                    ))}
                    {row.applies_when && row.applies_when.kind !== 'always' && (
                      <select
                        value={row.applies_when.value ?? ''}
                        onChange={(e) => applyTrigger({ kind: row.applies_when!.kind, value: e.target.value })}
                        style={{
                          width: '100%',
                          marginTop: '6px',
                          padding: '5px 8px',
                          fontSize: '12px',
                          border: '1px solid var(--neuron-ui-border)',
                          borderRadius: '4px',
                          backgroundColor: 'var(--theme-bg-surface)',
                        }}
                      >
                        {(row.applies_when.kind === 'examination' ? examOptions : permitOptions).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
              )}
              {/* Misconfig warning: row sits inside an Optional category but has
                  no applies_when set. The dispatcher silently skips it (no bill
                  emitted), which over time silently undercharges. Surface it
                  here so Pricing can fix during the contract sweep. */}
              {parentKind === 'optional' && !hasTrigger && (
                <span
                  title="This row is in an Optional category but has no trigger set. The engine will skip it. Click TRIGGER to set what booking fact gates it."
                  style={{
                    padding: '3px 6px',
                    background: '#FEE2E2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '3px',
                    color: '#991B1B',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                    whiteSpace: 'nowrap',
                    marginLeft: '2px',
                  }}
                >
                  NO TRIGGER
                </span>
              )}
            </div>
          )}
        </td>
      </tr>

      {/* Succeeding Rule Row (inline, below the main row) — hidden when at cost */}
      {!isAtCost && row.succeeding_rule && (
        <tr>
          <td
            colSpan={columns.length + (viewMode ? 3 : 4)}
            style={{ padding: 0, borderBottom: "1px solid var(--neuron-ui-border)" }}
          >
            <SucceedingRuleEditor
              rule={row.succeeding_rule}
              onChange={(rule) => onUpdateRow(row.id, { succeeding_rule: rule })}
              onRemove={() => onToggleSucceeding(row.id)}
              viewMode={viewMode}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================
// FACTORY FUNCTION: Create empty matrix for a service
// ============================================

export function createEmptyMatrix(serviceType: ServiceType): ContractRateMatrix {
  const cols = DEFAULT_COLUMNS[serviceType] || ["Standard"];
  return {
    id: `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    service_type: serviceType,
    columns: cols,
    rows: [],
  };
}