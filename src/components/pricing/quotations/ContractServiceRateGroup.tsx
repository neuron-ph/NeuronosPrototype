/**
 * ContractServiceRateGroup
 *
 * Wraps the single-matrix ContractRateCardV2 editor with a POD (port of
 * discharge / entry) dimension — "Idea 1": only ONE rate card is ever on
 * screen. A selector in the card header picks whose rates you're editing:
 *
 *   - "Default (all other ports)" → the global matrix (no pod_scope). Billed
 *     for every port that doesn't have its own rates.
 *   - a specific POD → that port's COMPLETE, standalone rate card. It does NOT
 *     stack on the default; it replaces it for that port. Picking a port for
 *     the first time seeds it as a copy of the default so you edit instead of
 *     retype. "Revert to default" removes the port's card.
 *
 * Because only one card shows at a time, there's no base-plus-addon illusion
 * and "Default" never sits beside a port. The rate engine selects a matrix per
 * booking via selectMatrixForPod() — this is its authoring counterpart.
 * Available PODs come from each service form's "Port of Discharge/s" list.
 *
 * @see /utils/contractRateEngine.ts — selectMatrixForPod (matching engine)
 */

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ContractRateCardV2, createEmptyMatrixV2 } from "./ContractRateCardV2";
import { CustomDropdown } from "../../bd/CustomDropdown";
import type { ContractRateMatrix, ContractRateRow, ServiceType } from "../../../types/pricing";

// Sentinel for the default / unscoped selection, and the in-menu reset action.
const DEFAULT = "__default__";
const RESET = "__reset__";

interface ContractServiceRateGroupProps {
  serviceType: string;
  /** All matrices for this service type (default + any POD-scoped). */
  matrices: ContractRateMatrix[];
  /** PODs the contract allows — from the service form's discharge-port list. */
  availablePods: string[];
  /** Splice the service's matrices back into the parent's full list. */
  onChange: (nextForService: ContractRateMatrix[]) => void;
  viewMode?: boolean;
}

const rand = () => Math.random().toString(36).slice(2, 7);
const newMatrixId = () => `matrix-${Date.now()}-${rand()}`;
const newCategoryId = () => `crc-${Date.now()}-${rand()}`;
const newRowId = () => `cr-${Date.now()}-${rand()}`;
const eqPod = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isGlobal = (m: ContractRateMatrix) => !m.pod_scope || m.pod_scope.length === 0;

/** Shorten a port label for compact display ("Cagayan de Oro Port (PHCGY)" → "Cagayan de Oro"). */
const shortPort = (label: string) => label.replace(/\s*\(.*?\)\s*$/, "").replace(/\s+Port$/i, "").trim() || label;

/** Deep-clone a matrix with fresh ids, scoped to a single POD. */
function seedMatrixForPod(src: ContractRateMatrix | undefined, serviceType: string, pod: string): ContractRateMatrix {
  const base = src ?? createEmptyMatrixV2(serviceType as ServiceType);
  const cloneRow = (r: ContractRateRow): ContractRateRow => ({ ...r, id: newRowId() });
  return {
    ...base,
    id: newMatrixId(),
    pod_scope: [pod],
    rows: (base.rows ?? []).map(cloneRow),
    categories: base.categories?.map((c) => ({
      ...c,
      id: newCategoryId(),
      rows: (c.rows ?? []).map(cloneRow),
    })),
  };
}

export function ContractServiceRateGroup({
  serviceType,
  matrices,
  availablePods,
  onChange,
  viewMode = false,
}: ContractServiceRateGroupProps) {
  const globalMatrix = useMemo(() => matrices.find(isGlobal), [matrices]);
  const matrixForPod = (pod: string) =>
    matrices.find((m) => (m.pod_scope ?? []).some((p) => eqPod(p, pod)));

  const [selected, setSelected] = useState<string>(DEFAULT);

  const replaceMatrix = (updated: ContractRateMatrix) =>
    onChange(matrices.map((m) => (m.id === updated.id ? updated : m)));
  const removeMatrix = (id: string) => onChange(matrices.filter((m) => m.id !== id));

  // v1: per-POD rate cards are Brokerage-only. Every other service (and
  // Brokerage with no PODs configured) renders as the plain single card.
  if (serviceType.toLowerCase() !== "brokerage" || availablePods.length === 0) {
    return globalMatrix ? (
      <ContractRateCardV2 matrix={globalMatrix} onChange={replaceMatrix} viewMode={viewMode} serviceLabel={serviceType} />
    ) : null;
  }

  const handleSelect = (value: string) => {
    // In-menu reset: drop the active POD's card and fall back to default.
    if (value === RESET) {
      if (podMatrix) removeMatrix(podMatrix.id);
      setSelected(DEFAULT);
      return;
    }
    if (value === DEFAULT || viewMode) {
      setSelected(value);
      return;
    }
    // Picking a port with no card yet → seed a copy of the default (one step).
    if (!matrixForPod(value)) {
      onChange([...matrices, seedMatrixForPod(globalMatrix, serviceType, value)]);
    }
    setSelected(value);
  };

  const activePod = selected === DEFAULT ? null : selected;
  const podMatrix = activePod ? matrixForPod(activePod) : undefined;
  // In view mode a port without its own card just shows the default (read-only).
  const cardMatrix = activePod ? podMatrix ?? globalMatrix : globalMatrix;
  const showingDefaultUnderPod = !!activePod && !podMatrix;

  const options = [
    { value: DEFAULT, label: "Default rates — all other PODs" },
    ...availablePods.map((p) => ({
      value: p,
      label: matrixForPod(p) ? `${shortPort(p)} · custom` : shortPort(p),
    })),
    // Reset lives in the menu — only offered when a custom POD is active.
    ...(!viewMode && podMatrix
      ? [{ value: RESET, label: "Reset to default rates", icon: <RotateCcw size={14} />, color: "var(--theme-status-danger-fg)" }]
      : []),
  ];

  const headerSlot = (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-[var(--theme-text-muted)]">POD:</span>
      <CustomDropdown value={selected} onChange={handleSelect} options={options} size="sm" align="left" />
    </div>
  );

  if (!cardMatrix) {
    return (
      <div className="rounded-xl border border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] p-7">
        {headerSlot}
        <div className="mt-4 rounded-lg border border-dashed border-[var(--theme-border-default)] px-6 py-8 text-center text-[13px] text-[var(--theme-text-muted)]">
          No default rate card yet for this service.
        </div>
      </div>
    );
  }

  return (
    <ContractRateCardV2
      // Re-mount the body when the selection changes so per-matrix internal state resets.
      key={selected}
      matrix={cardMatrix}
      // A port showing the default (view mode) is read-only; everything else edits its own matrix.
      onChange={showingDefaultUnderPod ? () => {} : replaceMatrix}
      viewMode={viewMode || showingDefaultUnderPod}
      serviceLabel={serviceType}
      headerSlot={headerSlot}
    />
  );
}
