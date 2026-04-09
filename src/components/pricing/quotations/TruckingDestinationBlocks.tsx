/**
 * TruckingDestinationBlocks
 *
 * Destination-first batch entry UI for Trucking rate matrices.
 * Instead of one row per truck-config × destination, the user adds a destination
 * and all 4 truck configs are pre-populated with cost inputs.
 *
 * Data model: zero changes — each enabled config is still a ContractRateRow
 * with particular = truck config label, remarks = destination, rates.Cost = price.
 *
 * The "+ Add Destination" button lives in the parent ContractRateCardV2 header.
 * When clicked, the parent creates 4 rows with a placeholder name and passes
 * that name via `newDestination` — this component auto-enters edit mode for it.
 *
 * @see /docs/blueprints/TRUCKING_DESTINATION_BLOCKS_BLUEPRINT.md
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Trash2, MapPin, Copy, ChevronDown, ChevronRight } from "lucide-react";
import type { ContractRateRow } from "../../../types/pricing";
import { getPresetsForService, type ChargeTypeOption } from "../../../utils/chargeTypeRegistry";

// ============================================
// CONSTANTS
// ============================================

/** Get the 4 trucking config presets in stable order */
const TRUCKING_CONFIGS = getPresetsForService("Trucking");

const generateRowId = () =>
  `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ============================================
// TYPES
// ============================================

/** A destination block groups rows by destination (remarks field) */
interface DestinationBlock {
  destination: string;
  configs: DestinationConfigEntry[];
}

/** One config line within a destination block */
interface DestinationConfigEntry {
  preset: ChargeTypeOption;
  enabled: boolean;       // false = N/A (no row emitted)
  cost: number;
  rowId?: string;         // ID of existing row (if enabled)
}

interface TruckingDestinationBlocksProps {
  rows: ContractRateRow[];
  onChangeRows: (rows: ContractRateRow[]) => void;
  viewMode?: boolean;
  /** When set, the block with this destination name auto-enters name edit mode */
  newDestination?: string | null;
  /** Called after the new destination edit mode is consumed */
  onNewDestinationCleared?: () => void;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TruckingDestinationBlocks({
  rows,
  onChangeRows,
  viewMode = false,
  newDestination = null,
  onNewDestinationCleared,
}: TruckingDestinationBlocksProps) {
  const [collapsedDestinations, setCollapsedDestinations] = useState<Set<string>>(new Set());

  // ── Group rows into destination blocks ──
  const blocks = useMemo(() => groupRowsIntoBlocks(rows), [rows]);

  // ── Handlers ──

  const deleteDestination = useCallback(
    (destination: string) => {
      onChangeRows(rows.filter((r) => r.remarks !== destination));
    },
    [rows, onChangeRows]
  );

  const renameDestination = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      onChangeRows(
        rows.map((r) =>
          r.remarks === oldName ? { ...r, remarks: trimmed, selection_group: trimmed } : r
        )
      );
    },
    [rows, onChangeRows]
  );

  const duplicateDestination = useCallback(
    (destination: string) => {
      const sourceRows = rows.filter((r) => r.remarks === destination);
      const copyName = `${destination} (Copy)`;
      let finalName = copyName;
      let counter = 2;
      const existingDests = new Set(rows.map((r) => r.remarks));
      while (existingDests.has(finalName)) {
        finalName = `${destination} (Copy ${counter})`;
        counter++;
      }

      const cloned = sourceRows.map((r) => ({
        ...r,
        id: generateRowId(),
        remarks: finalName,
        selection_group: finalName, // ✨ Auto-stamp for alternative row filtering
        rates: { ...r.rates },
      }));
      onChangeRows([...rows, ...cloned]);
    },
    [rows, onChangeRows]
  );

  const toggleConfig = useCallback(
    (destination: string, preset: ChargeTypeOption, currentlyEnabled: boolean) => {
      if (currentlyEnabled) {
        onChangeRows(
          rows.filter(
            (r) =>
              !(r.remarks === destination && r.charge_type_id === preset.id)
          )
        );
      } else {
        const newRow: ContractRateRow = {
          id: generateRowId(),
          particular: preset.label,
          charge_type_id: preset.id,
          rates: { Cost: 0 },
          unit: preset.defaultUnit || "per_container",
          remarks: destination,
          selection_group: destination, // ✨ Auto-stamp for alternative row filtering
        };
        onChangeRows([...rows, newRow]);
      }
    },
    [rows, onChangeRows]
  );

  const updateCost = useCallback(
    (rowId: string, value: number) => {
      onChangeRows(
        rows.map((r) =>
          r.id === rowId ? { ...r, rates: { ...r.rates, Cost: value } } : r
        )
      );
    },
    [rows, onChangeRows]
  );

  const toggleCollapse = (destination: string) => {
    setCollapsedDestinations((prev) => {
      const next = new Set(prev);
      if (next.has(destination)) {
        next.delete(destination);
      } else {
        next.add(destination);
      }
      return next;
    });
  };

  // ── Stats ──
  const totalDestinations = blocks.length;
  const totalActiveConfigs = rows.length;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div>
      {/* ── Destination Blocks ── */}
      {blocks.length === 0 ? (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            color: "var(--neuron-ink-muted)",
            fontSize: "13px",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "10px",
            backgroundColor: "var(--theme-bg-surface)",
          }}
        >
          <MapPin
            size={36}
            strokeWidth={1.2}
            style={{
              color: "#B0BAB6",
              margin: "0 auto 12px auto",
              display: "block",
            }}
          />
          <p style={{ margin: "0 0 4px 0", fontWeight: 500, color: "var(--theme-text-muted)", fontSize: "14px" }}>
            No destinations yet
          </p>
          <p style={{ margin: 0, fontSize: "13px" }}>
            Click "+ Add Destination" above to start entering trucking rates.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {blocks.map((block) => (
            <DestinationBlockCard
              key={block.destination}
              block={block}
              viewMode={viewMode}
              collapsed={collapsedDestinations.has(block.destination)}
              autoEditName={newDestination === block.destination}
              onAutoEditConsumed={onNewDestinationCleared}
              onToggleCollapse={() => toggleCollapse(block.destination)}
              onRename={(newName) => renameDestination(block.destination, newName)}
              onDelete={() => deleteDestination(block.destination)}
              onDuplicate={() => duplicateDestination(block.destination)}
              onToggleConfig={(preset, enabled) =>
                toggleConfig(block.destination, preset, enabled)
              }
              onUpdateCost={updateCost}
            />
          ))}
        </div>
      )}

      {/* ── Footer: Stats ── */}
      {totalDestinations > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: "12px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--neuron-ink-muted)",
            }}
          >
            {totalDestinations} {totalDestinations === 1 ? "destination" : "destinations"}
            {" "}&middot;{" "}
            {totalActiveConfigs} active {totalActiveConfigs === 1 ? "config" : "configs"}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// DESTINATION BLOCK CARD
// ============================================

function DestinationBlockCard({
  block,
  viewMode,
  collapsed,
  autoEditName,
  onAutoEditConsumed,
  onToggleCollapse,
  onRename,
  onDelete,
  onDuplicate,
  onToggleConfig,
  onUpdateCost,
}: {
  block: DestinationBlock;
  viewMode: boolean;
  collapsed: boolean;
  autoEditName?: boolean;
  onAutoEditConsumed?: () => void;
  onToggleCollapse: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleConfig: (preset: ChargeTypeOption, enabled: boolean) => void;
  onUpdateCost: (rowId: string, value: number) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(block.destination);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-enter edit mode for newly created destinations
  useEffect(() => {
    if (autoEditName && !isEditingName) {
      setEditNameValue("");
      setIsEditingName(true);
      if (onAutoEditConsumed) onAutoEditConsumed();
    }
  }, [autoEditName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const commitRename = () => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== block.destination) {
      onRename(trimmed);
    }
    setIsEditingName(false);
  };

  const activeCount = block.configs.filter((c) => c.enabled).length;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: isHovered && !viewMode ? "#C8D8D4" : "#E5E9E8",
        borderRadius: "10px",
        backgroundColor: "var(--theme-bg-surface)",
        overflow: "hidden",
        transition: "border-color 0.15s ease",
      }}
    >
      {/* ── Block Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          backgroundColor: "var(--theme-bg-surface-subtle)",
          borderBottom: collapsed ? "none" : "1px solid var(--neuron-ui-border)",
          minHeight: "42px",
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          style={{
            padding: "2px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#8A9490",
            lineHeight: 0,
            flexShrink: 0,
            transition: "color 0.15s ease",
          }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Location pin */}
        <MapPin size={14} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />

        {/* Destination name */}
        {isEditingName && !viewMode ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditNameValue(block.destination);
                setIsEditingName(false);
              }
            }}
            placeholder="Enter destination name (e.g., Valenzuela City)"
            style={{
              flex: 1,
              padding: "3px 8px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid #0F766E",
              borderRadius: "4px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <span
            onClick={() => {
              if (!viewMode) {
                setEditNameValue(block.destination);
                setIsEditingName(true);
              }
            }}
            style={{
              flex: 1,
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              cursor: viewMode ? "default" : "pointer",
              letterSpacing: "-0.01em",
            }}
            title={viewMode ? block.destination : "Click to rename"}
          >
            {block.destination}
          </span>
        )}

        {/* Collapsed summary */}
        {collapsed && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#8A9490",
              flexShrink: 0,
            }}
          >
            {activeCount} / {TRUCKING_CONFIGS.length} configs
          </span>
        )}

        {/* Action buttons */}
        {!viewMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              flexShrink: 0,
              opacity: isHovered ? 1 : 0,
              transition: "opacity 0.15s ease",
            }}
          >
            <button
              onClick={onDuplicate}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--theme-text-muted)",
                backgroundColor: "transparent",
                border: "1px solid #D9E1DE",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                e.currentTarget.style.color = "var(--theme-action-primary-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#D9E1DE";
                e.currentTarget.style.color = "#6B7A76";
              }}
              title="Duplicate this destination"
            >
              <Copy size={11} />
              Duplicate
            </button>
            <button
              onClick={onDelete}
              style={{
                padding: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neuron-semantic-danger)",
                opacity: 0.7,
                lineHeight: 0,
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "0.7";
              }}
              title="Delete this destination"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Config Rows (hidden when collapsed) ── */}
      {!collapsed && (
        <div style={{ padding: "4px 0" }}>
          {block.configs.map((config, idx) => (
            <ConfigRow
              key={config.preset.id}
              config={config}
              viewMode={viewMode}
              isLast={idx === block.configs.length - 1}
              onToggle={() => onToggleConfig(config.preset, config.enabled)}
              onUpdateCost={(val) => {
                if (config.rowId) onUpdateCost(config.rowId, val);
              }}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// CONFIG ROW (one truck config within a destination block)
// ============================================

function ConfigRow({
  config,
  viewMode,
  isLast,
  onToggle,
  onUpdateCost,
  formatCurrency,
}: {
  config: DestinationConfigEntry;
  viewMode: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUpdateCost: (value: number) => void;
  formatCurrency: (val: number) => string;
}) {
  const isNA = !config.enabled;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: viewMode ? "1fr minmax(120px, 160px)" : "28px 1fr minmax(120px, 160px)",
        alignItems: "center",
        gap: "0",
        padding: "5px 16px",
        borderBottom: isLast ? "none" : "1px solid #F0F2F1",
        transition: "opacity 0.15s ease",
        opacity: isNA ? 0.45 : 1,
      }}
    >
      {/* N/A toggle (edit mode only) */}
      {!viewMode && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <label style={{ cursor: "pointer", lineHeight: 0 }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={onToggle}
              style={{ display: "none" }}
            />
            <span
              style={{
                display: "inline-block",
                width: "14px",
                height: "14px",
                borderRadius: "3px",
                border: config.enabled ? "1.5px solid #0F766E" : "1.5px solid var(--neuron-ui-border)",
                backgroundColor: config.enabled ? "#0F766E" : "var(--theme-bg-surface)",
                position: "relative",
                flexShrink: 0,
                transition: "all 0.15s ease",
                cursor: "pointer",
              }}
            >
              {config.enabled && (
                <svg
                  viewBox="0 0 14 14"
                  width="14"
                  height="14"
                  style={{ position: "absolute", top: "-1px", left: "-1px" }}
                >
                  <path
                    d="M3.5 7.5L5.5 9.5L10.5 4.5"
                    stroke="white"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
          </label>
        </div>
      )}

      {/* Config label */}
      <div
        style={{
          fontSize: "13px",
          fontWeight: 500,
          color: isNA ? "#B0BAB6" : "#2C3E38",
          padding: "4px 8px",
          textDecoration: isNA ? "line-through" : "none",
          transition: "color 0.15s ease",
        }}
      >
        {config.preset.label}
        {isNA && viewMode && (
          <span style={{ marginLeft: "8px", fontSize: "11px", color: "#B0BAB6", fontStyle: "italic", textDecoration: "none", display: "inline-block" }}>
            N/A
          </span>
        )}
      </div>

      {/* Cost input / display */}
      <div style={{ padding: "2px 4px" }}>
        {isNA ? (
          <div
            style={{
              fontSize: "13px",
              color: "#C8D0CD",
              textAlign: "right",
              padding: "6px 8px",
              fontStyle: "italic",
            }}
          >
            &mdash;
          </div>
        ) : viewMode ? (
          <div
            style={{
              fontSize: "13px",
              color: "#2C3E38",
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              padding: "6px 8px",
              fontWeight: 500,
            }}
          >
            {config.cost > 0 ? formatCurrency(config.cost) : "\u2014"}
          </div>
        ) : (
          <input
            type="number"
            min={0}
            step={100}
            value={config.cost || ""}
            onChange={(e) => onUpdateCost(parseFloat(e.target.value) || 0)}
            placeholder="0"
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "13px",
              fontWeight: 500,
              color: "#2C3E38",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid #E0E6E4",
              borderRadius: "6px",
              outline: "none",
              fontFamily: "inherit",
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// GROUPING LOGIC
// ============================================

/**
 * Groups flat ContractRateRow[] into DestinationBlock[] for display.
 * - Rows are grouped by `remarks` (destination)
 * - Within each destination, all 4 trucking configs are shown
 * - Configs with a matching row are "enabled" (with cost + rowId)
 * - Configs without a row are "disabled" (N/A)
 * - Order: destinations appear in order of first occurrence
 */
function groupRowsIntoBlocks(rows: ContractRateRow[]): DestinationBlock[] {
  const destinationOrder: string[] = [];
  const byDestination: Record<string, ContractRateRow[]> = {};

  for (const row of rows) {
    const dest = row.remarks || "";
    if (!byDestination[dest]) {
      byDestination[dest] = [];
      destinationOrder.push(dest);
    }
    byDestination[dest].push(row);
  }

  return destinationOrder.map((destination) => {
    const destRows = byDestination[destination];

    const configs: DestinationConfigEntry[] = TRUCKING_CONFIGS.map((preset) => {
      const matchingRow = destRows.find(
        (r) =>
          r.charge_type_id === preset.id ||
          r.particular.toLowerCase() === preset.label.toLowerCase()
      );

      if (matchingRow) {
        return {
          preset,
          enabled: true,
          cost: matchingRow.rates?.Cost ?? 0,
          rowId: matchingRow.id,
        };
      }

      return {
        preset,
        enabled: false,
        cost: 0,
      };
    });

    return { destination, configs };
  });
}