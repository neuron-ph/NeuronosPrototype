/**
 * QuantityDisplaySection
 *
 * Shared section that renders detected/used quantities for rate calculation sheets.
 * Supports two modes:
 *   - "editable": number inputs + Reset button + source descriptions + source chips
 *     (used by RateCalculationSheet at the booking level)
 *   - "readonly": static value badges, no source detail
 *     (used by QuotationRateBreakdownSheet at the quotation level)
 *
 * @see /docs/blueprints/RATE_TABLE_DRY_BLUEPRINT.md
 */

import { useState, useEffect } from "react";
import { Container, Ship, FileText, Stamp, RefreshCw, MapPin, Truck } from "lucide-react";
import type { BookingQuantities } from "../../../utils/contractRateEngine";
import type { TruckingLineItem } from "../../../types/pricing";

/** Number input that allows the field to be cleared while still propagating 0 upstream. */
function QuantityInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));

  // Re-sync when external value changes (e.g., Reset) — but don't fight the user mid-type.
  useEffect(() => {
    if (draft === "" && value === 0) return;
    if (Number(draft) !== value) setDraft(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9]/g, "");
        setDraft(next);
        onChange(next === "" ? 0 : parseInt(next, 10));
      }}
      onBlur={() => {
        if (draft === "") setDraft("0");
      }}
      className="w-16 h-8 text-center text-[13px] font-medium text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded-[4px] bg-[var(--theme-bg-surface)] focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none"
    />
  );
}

// ============================================
// TYPES
// ============================================

interface QuantityInput {
  label: string;
  key: keyof BookingQuantities;
  value: number;
  icon: React.ReactNode;
  /** Human-readable source description (editable mode only) */
  source?: string;
  /** Raw source entries for chip display (editable mode only) */
  sourceEntries?: string[];
}

interface QuantityDisplaySectionProps {
  mode: "editable" | "readonly";
  serviceType: string;
  quantities: BookingQuantities;
  resolvedMode: string;
  /** Only required in editable mode — the booking object for source inference */
  booking?: any;
  /** Only required in editable mode */
  onQuantityChange?: (key: keyof BookingQuantities, value: number) => void;
  /** Only required in editable mode */
  onReset?: () => void;
  /** Custom mode indicator text — overrides default */
  modeHintText?: string;
  /** Optional: selection context for trucking (destination + truck type display) */
  selectionContext?: {
    destination?: string;
    truckType?: string;
  };
  /** Optional: multi-line trucking line items for per-line display (@see MULTI_LINE_TRUCKING_BLUEPRINT.md) */
  truckingLineItems?: TruckingLineItem[];
}

// ============================================
// HELPERS
// ============================================

/** Pick first defined field across camelCase / snake_case variants */
function pickField(booking: any, ...keys: string[]): any {
  for (const k of keys) {
    if (booking?.[k] !== undefined && booking?.[k] !== null && booking?.[k] !== "") return booking[k];
  }
  return undefined;
}

/** Parse raw booking field into chip entries (handles arrays and delimited strings) */
function parseEntries(field: unknown): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field.map((s) => String(s).trim()).filter(Boolean);
  if (typeof field === "string") return field.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Describe where a quantity was derived from (editable mode) */
function describeSource(key: string, booking: any): string {
  if (!booking) return "";
  switch (key) {
    case "containers": {
      const containerField = pickField(booking, "containerNumbers", "container_numbers");
      if (containerField) {
        const count = parseEntries(containerField).length;
        if (count > 0) return `${count} container number${count !== 1 ? "s" : ""} on this booking`;
      }
      if (Array.isArray(booking.containers) && booking.containers.length > 0) {
        const c = booking.containers.length;
        return `${c} container${c !== 1 ? "s" : ""} on this booking`;
      }
      if (booking.qty20ft || booking.qty40ft || booking.qty45ft) return "Sum of qty20ft + qty40ft + qty45ft";
      const vehField = pickField(booking, "vehicleReferenceNumber", "vehicle_reference_number");
      if (vehField) {
        const count = parseEntries(vehField).length;
        return `${count} vehicle reference${count !== 1 ? "s" : ""} on this booking`;
      }
      return "No container numbers on this booking";
    }
    case "bls": {
      const mblField = pickField(booking, "mblMawb", "mbl_mawb");
      if (mblField) {
        const count = parseEntries(mblField).length;
        if (count > 0) return `${count} MBL/MAWB${count !== 1 ? "s" : ""} on this booking`;
      }
      return "No MBL/MAWB on this booking";
    }
    case "sets":
      return "One entry per booking";
    case "shipments":
      return "One shipment per booking";
    default:
      return "";
  }
}

/** Parse raw booking field into chip entries */
function extractSourceEntries(key: string, booking: any): string[] {
  if (!booking) return [];
  switch (key) {
    case "containers": {
      const containerField = pickField(booking, "containerNumbers", "container_numbers");
      if (containerField) return parseEntries(containerField);
      if (Array.isArray(booking.containers) && booking.containers.length > 0) {
        return booking.containers
          .map((c: any) => {
            const type = c?.type ? String(c.type) : "";
            const qty = c?.qty ?? 1;
            return type ? `${qty}× ${type}` : `${qty}× container`;
          });
      }
      const vehField = pickField(booking, "vehicleReferenceNumber", "vehicle_reference_number");
      if (vehField) return parseEntries(vehField);
      return [];
    }
    case "bls":
      return parseEntries(pickField(booking, "mblMawb", "mbl_mawb"));
    default:
      return [];
  }
}

/** Build the quantity input list based on service type */
function buildQuantityInputs(
  serviceType: string,
  quantities: BookingQuantities,
  booking?: any,
  includeSource: boolean = false
): QuantityInput[] {
  const type = serviceType.toLowerCase();
  const inputs: QuantityInput[] = [];

  if (type === "brokerage" || type === "forwarding") {
    inputs.push({
      label: "Containers",
      key: "containers",
      value: quantities.containers ?? 0,
      icon: <Container size={14} className="text-[var(--theme-action-primary-bg)]" />,
      ...(includeSource && {
        source: describeSource("containers", booking),
        sourceEntries: extractSourceEntries("containers", booking),
      }),
    });
    inputs.push({
      label: "Bills of Lading",
      key: "bls",
      value: quantities.bls ?? 0,
      icon: <FileText size={14} className="text-[var(--theme-action-primary-bg)]" />,
      ...(includeSource && {
        source: describeSource("bls", booking),
        sourceEntries: extractSourceEntries("bls", booking),
      }),
    });
    inputs.push({
      label: "Entry",
      key: "sets",
      value: quantities.sets ?? 1,
      icon: <Stamp size={14} className="text-[var(--theme-action-primary-bg)]" />,
      ...(includeSource && { source: describeSource("sets", booking) }),
    });
  } else if (type === "trucking") {
    inputs.push({
      label: "Trucks / Containers",
      key: "containers",
      value: quantities.containers ?? 0,
      icon: <Container size={14} className="text-[var(--theme-action-primary-bg)]" />,
      ...(includeSource && {
        source: describeSource("containers", booking),
        sourceEntries: extractSourceEntries("containers", booking),
      }),
    });
  } else {
    inputs.push({
      label: "Shipments",
      key: "shipments",
      value: quantities.shipments ?? 1,
      icon: <Ship size={14} className="text-[var(--theme-action-primary-bg)]" />,
      ...(includeSource && { source: describeSource("shipments", booking) }),
    });
  }

  return inputs;
}

// ============================================
// COMPONENT
// ============================================

export function QuantityDisplaySection({
  mode,
  serviceType,
  quantities,
  resolvedMode,
  booking,
  onQuantityChange,
  onReset,
  modeHintText,
  selectionContext,
  truckingLineItems,
}: QuantityDisplaySectionProps) {
  const isEditable = mode === "editable";
  const inputs = buildQuantityInputs(serviceType, quantities, booking, isEditable);

  const defaultHint = isEditable
    ? "Adjust quantities above to recalculate instantly"
    : "These values were derived from the quotation form";

  return (
    <div className="px-8 py-6 border-b border-[var(--theme-border-default)]">
      {/* Heading row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--theme-text-primary)] uppercase tracking-wide">
          {isEditable ? "Detected Quantities" : "Quantities Used"}
        </h3>
        {isEditable && onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-muted)] hover:text-[var(--theme-action-primary-bg)] transition-colors"
            title="Reset to auto-detected values"
          >
            <RefreshCw size={12} />
            Reset
          </button>
        )}
      </div>

      {/* Quantity rows */}
      <div className="space-y-3">
        {inputs.map((input) => (
          <div key={input.key}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[var(--theme-bg-surface-tint)] flex items-center justify-center shrink-0">
                {input.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--theme-text-primary)]">{input.label}</div>
                {isEditable && input.source && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--theme-text-muted)] truncate">{input.source}</span>
                  </div>
                )}
              </div>

              {/* Value display */}
              {isEditable ? (
                <QuantityInput
                  value={input.value}
                  onChange={(next) => onQuantityChange?.(input.key, next)}
                />
              ) : (
                <div className="w-16 h-8 flex items-center justify-center text-[13px] font-medium text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded-[4px] bg-[var(--neuron-pill-inactive-bg)]">
                  {input.value}
                </div>
              )}
            </div>

            {/* Source entry chips (editable mode only) */}
            {isEditable && input.sourceEntries && input.sourceEntries.length > 0 && (
              <div className="ml-11 mt-1.5 px-3 py-2.5 rounded-[6px] bg-[var(--neuron-pill-inactive-bg)] border border-[var(--theme-border-default)]">
                <div className="flex flex-wrap gap-1.5">
                  {input.sourceEntries.map((entry, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-2.5 py-1 rounded-[4px] bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[11px] text-[var(--theme-text-primary)]"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      {entry}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ✨ Multi-line trucking dispatch lines — replaces selectionContext when >1 line item */}
        {serviceType.toLowerCase() === "trucking" && truckingLineItems && truckingLineItems.length > 1 && (
          <div className="mt-1">
            <div className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide mb-2 ml-11">
              Destinations ({truckingLineItems.length})
            </div>
            {truckingLineItems.map((li) => (
              <div key={li.id} className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-md bg-[var(--theme-bg-surface-tint)] flex items-center justify-center shrink-0">
                  <Truck size={14} className="text-[var(--theme-action-primary-bg)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--theme-text-primary)]">
                    {li.destination || "—"}
                  </div>
                </div>
                <div className="h-8 flex items-center justify-center px-3 text-[12px] font-medium text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded-[4px] bg-[var(--neuron-pill-inactive-bg)] whitespace-nowrap">
                  {li.truckType || "—"} × {li.quantity}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Single-line trucking: legacy selectionContext (only when NOT showing multi-line) */}
        {serviceType.toLowerCase() === "trucking" && selectionContext
          && (!truckingLineItems || truckingLineItems.length <= 1) && (
          <>
            {selectionContext.truckType && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[var(--theme-bg-surface-tint)] flex items-center justify-center shrink-0">
                  <Truck size={14} className="text-[var(--theme-action-primary-bg)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--theme-text-primary)]">Truck Type</div>
                </div>
                <div className="h-8 flex items-center justify-center px-3 text-[13px] font-medium text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded-[4px] bg-[var(--neuron-pill-inactive-bg)]">
                  {selectionContext.truckType}
                </div>
              </div>
            )}
            {selectionContext.destination && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[var(--theme-bg-surface-tint)] flex items-center justify-center shrink-0">
                  <MapPin size={14} className="text-[var(--theme-action-primary-bg)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--theme-text-primary)]">Destination</div>
                </div>
                <div className="h-8 flex items-center justify-center px-3 text-[13px] font-medium text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded-[4px] bg-[var(--neuron-pill-inactive-bg)]">
                  {selectionContext.destination}
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}