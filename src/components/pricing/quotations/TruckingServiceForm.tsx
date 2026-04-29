import { FormSelect } from "./FormSelect";
import { FormComboBox } from "./FormComboBox";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TruckingLineItem } from "../../../types/pricing";
import { normalizeTruckingLineItems } from "../../../utils/contractQuantityExtractor";

interface TruckingFormData {
  pullOut?: string;
  deliveryAddress?: string;   // Legacy — derived from first line item
  truckType?: string;         // Legacy — derived from first line item
  qty?: number;               // Legacy — derived from first line item
  deliveryInstructions?: string;
  truckingLineItems?: TruckingLineItem[]; // ✨ Multi-line trucking
  
  // Export specific fields
  aolPol?: string; // Location to drop off the container
}

// Truck type options — shared constant to avoid duplication
const TRUCK_TYPE_OPTIONS = [
  { value: "4W", label: "4W" },
  { value: "6W", label: "6W" },
  { value: "10W", label: "10W" },
  { value: "20ft", label: "20ft" },
  { value: "40ft", label: "40ft" },
  { value: "45ft", label: "45ft" },
];

interface TruckingServiceFormProps {
  data: TruckingFormData;
  onChange: (data: TruckingFormData) => void;
  movement?: "IMPORT" | "EXPORT";
  viewMode?: boolean;
  contractMode?: boolean; // When true, show only scope fields (truckType), hide shipment-specific
  hideDestinations?: boolean;
  /** Known contract destinations for combobox dropdown (@see DESTINATION_COMBOBOX_BLUEPRINT.md Phase 3) */
  contractDestinations?: string[];
  headerToolbar?: ReactNode; // Optional toolbar rendered right-aligned in header row
}

export function TruckingServiceForm({ data, onChange, movement = "IMPORT", viewMode = false, contractMode = false, hideDestinations = false, contractDestinations, headerToolbar }: TruckingServiceFormProps) {
  const updateField = (field: keyof TruckingFormData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  // ✨ Multi-line trucking: normalize line items from data (handles legacy migration)
  const lineItems = normalizeTruckingLineItems(data);

  // ✨ Emit updated line items + keep legacy fields in sync (first item → legacy)
  const emitLineItems = (updated: TruckingLineItem[]) => {
    const first = updated[0];
    onChange({
      ...data,
      truckingLineItems: updated,
      // Legacy sync: first line item mirrors the flat fields
      deliveryAddress: first?.destination || "",
      truckType: first?.truckType || "",
      qty: first?.quantity || 1,
    });
  };

  const handleLineItemChange = (id: string, field: keyof TruckingLineItem, value: any) => {
    const updated = lineItems.map(li =>
      li.id === id ? { ...li, [field]: value } : li
    );
    emitLineItems(updated);
  };

  const handleAddLineItem = () => {
    emitLineItems([
      ...lineItems,
      {
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        destination: "",
        truckType: "",
        quantity: 1,
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) return; // Min 1 row
    emitLineItems(lineItems.filter(li => li.id !== id));
  };

  const isExport = movement === "EXPORT";

  // Shared input style factory
  const inputStyle = (disabled?: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--neuron-ink-base)",
    backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
    border: "1px solid var(--neuron-ui-border)",
    borderRadius: "6px",
    outline: "none",
    transition: "border-color 0.15s ease",
    cursor: disabled ? "default" : "text",
  });

  const focusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
  };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--neuron-ink-base)",
    marginBottom: "8px",
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "16px",
          fontWeight: 600,
          color: "var(--neuron-brand-green)",
          margin: 0,
        }}>
          {contractMode ? "Trucking — Contract Scope" : "Trucking Service"}
        </h2>
        {headerToolbar}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Route Fields — hidden in contract mode */}
        {!contractMode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Pickup / Pull Out */}
          <div>
            <label style={labelStyle}>
              {isExport ? "Pull Out" : "Pickup Location"}
            </label>
            <input
              type="text"
              value={data.pullOut || ""}
              onChange={(e) => updateField("pullOut", e.target.value)}
              placeholder={isExport ? "Enter pull out location" : "Enter pickup location"}
              style={inputStyle(viewMode)}
              onFocus={focusHandler}
              onBlur={blurHandler}
              disabled={viewMode}
            />
          </div>
          
          {/* Delivery Instructions (moved from bottom to pair with pullOut) */}
          <div>
            <label style={labelStyle}>
              Delivery Instructions
            </label>
            <input
              type="text"
              value={data.deliveryInstructions || ""}
              onChange={(e) => updateField("deliveryInstructions", e.target.value)}
              placeholder="Enter any special delivery instructions..."
              style={inputStyle(viewMode)}
              onFocus={focusHandler}
              onBlur={blurHandler}
              disabled={viewMode}
            />
          </div>
        </div>
        )}

        {/* AOL/POL for Export — hidden in contract mode */}
        {!contractMode && isExport && (
          <div>
            <label style={labelStyle}>
              AOL/POL
            </label>
            <input
              type="text"
              value={data.aolPol || ""}
              onChange={(e) => updateField("aolPol", e.target.value)}
              placeholder="Enter AOL/POL"
              style={inputStyle(viewMode)}
              onFocus={focusHandler}
              onBlur={blurHandler}
              disabled={viewMode}
            />
          </div>
        )}

        {/* ✨ DESTINATIONS — Multi-line trucking repeater (non-contract mode) */}
        {!contractMode && !hideDestinations && (
          <div>
            <label style={{ ...labelStyle, marginBottom: "12px" }}>
              Destinations <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
            </label>

            {/* Column headers — only shown when 2+ rows */}
            {lineItems.length > 1 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "5fr 3fr 2fr 28px",
                gap: "8px",
                marginBottom: "6px",
                paddingLeft: "2px",
              }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Destination
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Truck Type
                </span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Qty
                </span>
                <span />
              </div>
            )}

            {/* Line item rows */}
            <div style={{ display: "grid", gap: "6px" }}>
              {lineItems.map((li) => (
                <DispatchRow
                  key={li.id}
                  li={li}
                  isExport={isExport}
                  viewMode={viewMode}
                  canRemove={!viewMode && lineItems.length > 1}
                  showRemoveSlot={lineItems.length > 1}
                  onFieldChange={handleLineItemChange}
                  onRemove={handleRemoveLineItem}
                  inputStyle={inputStyle}
                  focusHandler={focusHandler}
                  blurHandler={blurHandler}
                  contractDestinations={contractDestinations}
                />
              ))}
            </div>

            {/* Ghost row — "+ Add destination" */}
            {!viewMode && (
              <button
                type="button"
                onClick={handleAddLineItem}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                  padding: "10px",
                  marginTop: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--theme-text-muted)",
                  backgroundColor: "transparent",
                  border: "1.5px dashed #D1D5DB",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  e.currentTarget.style.color = "var(--neuron-brand-teal)";
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-border-default)";
                  e.currentTarget.style.color = "var(--theme-text-muted)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Plus size={14} />
                Add destination
              </button>
            )}

            {/* Total summary */}
            {lineItems.length > 1 && (
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "8px",
                paddingRight: "42px",
              }}>
                <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                  Total: <strong style={{ color: "var(--neuron-ink-base)" }}>
                    {lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0)}
                  </strong> truck{lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0) !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contract mode: single truck type (contract scope only) */}
        {contractMode && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>
                Truck Type *
              </label>
              <FormSelect
                value={data.truckType || ""}
                onChange={(value) => updateField("truckType", value)}
                options={TRUCK_TYPE_OPTIONS}
                placeholder="Select truck type..."
                disabled={viewMode}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ✨ DispatchRow component — reusable for each line item
interface DispatchRowProps {
  li: TruckingLineItem;
  isExport: boolean;
  viewMode: boolean;
  canRemove: boolean;
  showRemoveSlot: boolean;
  onFieldChange: (id: string, field: keyof TruckingLineItem, value: any) => void;
  onRemove: (id: string) => void;
  inputStyle: (disabled?: boolean) => React.CSSProperties;
  focusHandler: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  blurHandler: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** When provided, destination renders as FormComboBox with contract options */
  contractDestinations?: string[];
}

function DispatchRow({ li, isExport, viewMode, canRemove, showRemoveSlot, onFieldChange, onRemove, inputStyle, focusHandler, blurHandler, contractDestinations }: DispatchRowProps) {
  // Convert contract destinations to combobox options
  const destinationOptions = contractDestinations && contractDestinations.length > 0
    ? contractDestinations.map(d => ({ value: d, label: d }))
    : null;

  return (
    <div
      key={li.id}
      style={{
        display: "grid",
        gridTemplateColumns: showRemoveSlot ? "5fr 3fr 2fr 28px" : "5fr 3fr 2fr",
        gap: "8px",
        alignItems: "center",
      }}
    >
      {/* Destination — ComboBox when contract destinations available, plain input otherwise */}
      {destinationOptions ? (
        <FormComboBox
          value={li.destination}
          onChange={(value) => onFieldChange(li.id, "destination", value)}
          options={destinationOptions}
          placeholder={isExport ? "Warehouse address" : "Select or type destination..."}
          disabled={viewMode}
        />
      ) : (
        <input
          type="text"
          value={li.destination}
          onChange={(e) => onFieldChange(li.id, "destination", e.target.value)}
          placeholder={isExport ? "Warehouse address" : "Delivery address"}
          style={{
            ...inputStyle(viewMode),
            padding: "8px 10px",
            fontSize: "13px",
          }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          disabled={viewMode}
        />
      )}

      {/* Truck Type */}
      <FormSelect
        value={li.truckType}
        onChange={(value) => onFieldChange(li.id, "truckType", value)}
        options={TRUCK_TYPE_OPTIONS}
        placeholder="Type..."
        disabled={viewMode}
      />

      {/* Quantity */}
      <input
        type="number"
        value={li.quantity || ""}
        onChange={(e) => onFieldChange(li.id, "quantity", parseInt(e.target.value) || 0)}
        placeholder="0"
        min="0"
        style={{
          ...inputStyle(viewMode),
          padding: "8px 6px",
          fontSize: "13px",
          textAlign: "center" as const,
        }}
        onFocus={focusHandler}
        onBlur={blurHandler}
        disabled={viewMode}
      />

      {/* Remove button */}
      {canRemove ? (
        <button
          type="button"
          onClick={() => onRemove(li.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            border: "1px solid var(--theme-border-default)",
            backgroundColor: "var(--theme-bg-surface)",
            cursor: "pointer",
            color: "var(--theme-text-muted)",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#FCA5A5";
            e.currentTarget.style.color = "#EF4444";
            e.currentTarget.style.backgroundColor = "#FEF2F2";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--theme-border-default)";
            e.currentTarget.style.color = "var(--theme-text-muted)";
            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
          }}
          title="Remove line"
        >
          <X size={14} />
        </button>
      ) : (
        <div style={{ width: "28px" }} /> // Spacer for alignment
      )}
    </div>
  );
}
