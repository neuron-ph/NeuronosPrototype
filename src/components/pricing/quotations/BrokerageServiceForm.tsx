import { FormSelect } from "./FormSelect";
import { FormCheckbox } from "./FormCheckbox";
import { ContainerEntriesManager } from "./ContainerEntriesManager";
import { useState, type ReactNode } from "react";
import {
  buildBrokerageContext,
  isFieldVisible,
} from "../../../utils/quotation/quotationVisibility";

interface ContainerEntry {
  id: string;
  type: "20ft" | "40ft" | "45ft" | "";
  qty: number;
}

interface BrokerageFormData {
  brokerageType: "Standard" | "All-Inclusive" | "Non-Regular" | "";

  // Standard & Non-Regular
  typeOfEntry?: string;
  consumption?: boolean;
  warehousing?: boolean;
  peza?: boolean;

  // Common fields
  pod?: string;
  pods?: string[]; // CONTRACT: Multiple ports for contract mode
  mode?: string;
  cargoType?: string;
  commodityDescription?: string;
  deliveryAddress?: string;

  // FCL fields
  containers?: ContainerEntry[];
  // Legacy fields for backward compatibility
  fclContainerType?: "20ft" | "40ft" | "45ft" | "";
  fclQty?: number;

  // LCL fields
  lclGwt?: string;
  lclDims?: string;

  // AIR fields
  airGwt?: string;
  airCwt?: string;

  // All-Inclusive specific
  countryOfOrigin?: string;
  preferentialTreatment?: string;
}

interface BrokerageServiceFormProps {
  data: BrokerageFormData;
  onChange: (data: BrokerageFormData) => void;
  movement?: "IMPORT" | "EXPORT";
  viewMode?: boolean;
  contractMode?: boolean;
  lockToStandardType?: boolean;
  headerToolbar?: ReactNode;
}

export function BrokerageServiceForm({
  data,
  onChange,
  movement = "IMPORT",
  viewMode = false,
  contractMode = false,
  lockToStandardType = false,
  headerToolbar,
}: BrokerageServiceFormProps) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const updateField = (field: keyof BrokerageFormData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const isExport = movement === "EXPORT";

  // Non-Regular is export-restricted at the business level (existing product rule, preserved).
  const brokerageTypes = isExport
    ? ["Standard", "All-Inclusive"]
    : ["Standard", "All-Inclusive", "Non-Regular"];

  // Build schema context for visibility evaluation.
  const effectiveBrokerageType = lockToStandardType ? "Standard" : data.brokerageType;
  const ctx = buildBrokerageContext({ ...data, brokerageType: effectiveBrokerageType });

  // Whether any package is selected — gates the shared field sections.
  const hasPackage = !!effectiveBrokerageType;

  const inputStyle = (extraStyle?: React.CSSProperties) => ({
    width: "100%",
    padding: "10px 12px",
    fontSize: "13px",
    color: "var(--neuron-ink-base)",
    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
    border: "1px solid var(--neuron-ui-border)",
    borderRadius: "6px",
    outline: "none",
    transition: "border-color 0.15s ease",
    cursor: viewMode ? "default" : "text",
    ...extraStyle,
  });

  const onFocusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
  };

  const onBlurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--neuron-ink-base)",
    marginBottom: "8px",
  };

  const modeOverlayContainerStyle: React.CSSProperties = {
    padding: "16px",
    backgroundColor: "var(--theme-bg-surface-subtle)",
    border: "1px solid var(--neuron-ui-border)",
    borderRadius: "6px",
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
      }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-brand-green)", margin: 0 }}>
          {contractMode ? "Brokerage — Contract Scope" : "Brokerage Service"}
        </h2>
        {headerToolbar}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>

        {/* ── Package selector (quotation mode) ───────────────────────────── */}
        {!contractMode && !lockToStandardType && (
          <div>
            <label style={labelStyle}>Brokerage Type *</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {brokerageTypes.map(type => {
                const isSelected = data.brokerageType === type;
                const isHovered = hoveredType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => !viewMode && updateField("brokerageType", type)}
                    onMouseEnter={() => !viewMode && setHoveredType(type)}
                    onMouseLeave={() => !viewMode && setHoveredType(null)}
                    disabled={viewMode}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: isSelected ? "white" : "var(--neuron-ink-base)",
                      backgroundColor: isSelected
                        ? "var(--theme-action-primary-bg)"
                        : isHovered && !viewMode
                        ? "var(--theme-bg-surface-tint)"
                        : "var(--theme-bg-surface)",
                      border: `1px solid ${isSelected || (isHovered && !viewMode)
                        ? "var(--theme-action-primary-bg)"
                        : "var(--neuron-ui-border)"}`,
                      borderRadius: "6px",
                      cursor: viewMode ? "default" : "pointer",
                      transition: "all 0.15s ease",
                      opacity: viewMode && !isSelected ? 0.6 : 1,
                    }}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* ── Contract mode: static badge ─────────────────────────────────── */}
        {contractMode && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {["Standard", "Multi-Modal"].map(badge => (
              <span key={badge} style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--theme-bg-surface-tint)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "14px",
              }}>
                {badge}
              </span>
            ))}
            <span style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
              Brokerage contracts are always Standard type with Multi-Modal rate columns
            </span>
          </div>
        )}

        {/* ── Shared fields (shown for all packages once one is selected) ─── */}
        {hasPackage && (
          <>
            {/* Type of Entry — Standard and Non-Regular only (matrix: All-Inclusive = No) */}
            {isFieldVisible("type_of_entry", "Brokerage", ctx) && (
              <div>
                <label style={labelStyle}>Customs Entry Procedure Code</label>
                <div style={{ display: "flex", gap: "16px" }}>
                  <FormCheckbox
                    checked={data.consumption || false}
                    onChange={(checked) => updateField("consumption", checked)}
                    label="Consumption"
                    disabled={viewMode}
                  />
                  <FormCheckbox
                    checked={data.warehousing || false}
                    onChange={(checked) => updateField("warehousing", checked)}
                    label="Warehousing"
                    disabled={viewMode}
                  />
                  <FormCheckbox
                    checked={data.peza || false}
                    onChange={(checked) => updateField("peza", checked)}
                    label="PEZA"
                    disabled={viewMode}
                  />
                </div>
              </div>
            )}

            {/* AOD/POD — all packages */}
            <div>
              <label style={labelStyle}>{isExport ? "AOL/POL" : "Port of Discharge (POD)"}</label>
              <FormSelect
                value={data.pod || ""}
                onChange={(value) => updateField("pod", value)}
                options={[
                  { value: "NAIA", label: "NAIA" },
                  { value: "MICP", label: "MICP" },
                  { value: "POM", label: "POM" },
                ]}
                placeholder={isExport ? "Select AOL/POL..." : "Select POD..."}
                disabled={viewMode}
              />
            </div>

            {/* Mode — all packages */}
            <div>
              <label style={labelStyle}>Mode</label>
              <FormSelect
                value={data.mode || ""}
                onChange={(value) => updateField("mode", value)}
                options={[
                  { value: "FCL", label: "FCL" },
                  { value: "LCL", label: "LCL" },
                  { value: "AIR", label: "AIR" },
                  { value: "Multi-modal", label: "Multi-modal" },
                ]}
                placeholder="Select Mode..."
                disabled={viewMode}
              />
            </div>

            {/* Shipment-specific fields — hidden in contract mode */}
            {!contractMode && (
              <>
                {/* Cargo Type — all packages */}
                <div>
                  <label style={labelStyle}>Cargo Type</label>
                  <FormSelect
                    value={data.cargoType || ""}
                    onChange={(value) => updateField("cargoType", value)}
                    options={[
                      { value: "Dry", label: "Dry" },
                      { value: "Reefer", label: "Reefer" },
                      { value: "Breakbulk", label: "Breakbulk" },
                      { value: "RORO", label: "RORO" },
                    ]}
                    placeholder="Select Cargo Type..."
                    disabled={viewMode}
                  />
                </div>

                {/* Commodity Description — all packages */}
                <div>
                  <label style={labelStyle}>Commodity Description</label>
                  <input
                    type="text"
                    value={data.commodityDescription || ""}
                    onChange={(e) => updateField("commodityDescription", e.target.value)}
                    placeholder="Enter commodity description"
                    disabled={viewMode}
                    style={inputStyle()}
                    onFocus={onFocusHandler}
                    onBlur={onBlurHandler}
                  />
                </div>

                {/* Country of Origin — All-Inclusive only (matrix: Standard=No, Non-Regular=No) */}
                {isFieldVisible("country_of_origin", "Brokerage", ctx) && (
                  <div>
                    <label style={labelStyle}>Country of Origin</label>
                    <input
                      type="text"
                      value={data.countryOfOrigin || ""}
                      onChange={(e) => updateField("countryOfOrigin", e.target.value)}
                      placeholder="Enter country of origin"
                      disabled={viewMode}
                      style={inputStyle()}
                      onFocus={onFocusHandler}
                      onBlur={onBlurHandler}
                    />
                  </div>
                )}

                {/* Preferential Treatment — All-Inclusive only */}
                {isFieldVisible("preferential_treatment", "Brokerage", ctx) && (
                  <div>
                    <label style={labelStyle}>Preferential Treatment</label>
                    <FormSelect
                      value={data.preferentialTreatment || ""}
                      onChange={(value) => updateField("preferentialTreatment", value)}
                      options={[
                        { value: "Form E", label: "Form E" },
                        { value: "Form D", label: "Form D" },
                        { value: "Form AI", label: "Form AI" },
                        { value: "Form AK", label: "Form AK" },
                        { value: "Form JP", label: "Form JP" },
                      ]}
                      placeholder="Select preferential treatment..."
                      disabled={viewMode}
                    />
                  </div>
                )}

                {/* FCL overlay — Container Types and Quantity */}
                {data.mode === "FCL" && (
                  <div style={modeOverlayContainerStyle}>
                    <ContainerEntriesManager
                      containers={data.containers || []}
                      onChange={(containers) => updateField("containers", containers)}
                      disabled={viewMode}
                    />
                  </div>
                )}

                {/* LCL overlay — Gross Weight and Measurement */}
                {data.mode === "LCL" && (
                  <div style={{ ...modeOverlayContainerStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: "12px" }}>Gross Weight</label>
                      <input
                        type="text"
                        value={data.lclGwt || ""}
                        onChange={(e) => updateField("lclGwt", e.target.value)}
                        placeholder="e.g. 1000 kg"
                        disabled={viewMode}
                        style={inputStyle({ padding: "8px 10px" })}
                        onFocus={onFocusHandler}
                        onBlur={onBlurHandler}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: "12px" }}>Measurement</label>
                      <input
                        type="text"
                        value={data.lclDims || ""}
                        onChange={(e) => updateField("lclDims", e.target.value)}
                        placeholder="e.g. 10x10x10 cm"
                        disabled={viewMode}
                        style={inputStyle({ padding: "8px 10px" })}
                        onFocus={onFocusHandler}
                        onBlur={onBlurHandler}
                      />
                    </div>
                  </div>
                )}

                {/* AIR overlay — Gross Weight and Chargeable Weight */}
                {data.mode === "AIR" && (
                  <div style={{ ...modeOverlayContainerStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: "12px" }}>Gross Weight</label>
                      <input
                        type="text"
                        value={data.airGwt || ""}
                        onChange={(e) => updateField("airGwt", e.target.value)}
                        placeholder="e.g. 500 kg"
                        disabled={viewMode}
                        style={inputStyle({ padding: "8px 10px" })}
                        onFocus={onFocusHandler}
                        onBlur={onBlurHandler}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: "12px" }}>Chargeable Weight</label>
                      <input
                        type="text"
                        value={data.airCwt || ""}
                        onChange={(e) => updateField("airCwt", e.target.value)}
                        placeholder="e.g. 600 kg"
                        disabled={viewMode}
                        style={inputStyle({ padding: "8px 10px" })}
                        onFocus={onFocusHandler}
                        onBlur={onBlurHandler}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
