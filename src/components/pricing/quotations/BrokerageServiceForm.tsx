import { FormSelect } from "./FormSelect";
import { FormCheckbox } from "./FormCheckbox";
import { ContainerEntriesManager } from "./ContainerEntriesManager";
import { useState, type ReactNode } from "react";

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
  pods?: string[]; // ✨ CONTRACT: Multiple ports for contract mode
  mode?: string;
  cargoType?: string;
  commodityDescription?: string;
  deliveryAddress?: string;
  
  // FCL fields - NEW: Using containers array
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
  movement?: "IMPORT" | "EXPORT"; // Default to IMPORT if undefined
  viewMode?: boolean;
  contractMode?: boolean; // When true, show only scope fields (type, entry, pod, mode), hide shipment-specific fields
  headerToolbar?: ReactNode; // Optional toolbar rendered right-aligned in header row
}

export function BrokerageServiceForm({ data, onChange, movement = "IMPORT", viewMode = false, contractMode = false, headerToolbar }: BrokerageServiceFormProps) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const updateField = (field: keyof BrokerageFormData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const isExport = movement === "EXPORT";

  // Filter brokerage types for Export
  const brokerageTypes = isExport 
    ? ["Standard", "All-Inclusive"] 
    : ["Standard", "All-Inclusive", "Non-Regular"];

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
          {contractMode ? "Brokerage — Contract Scope" : "Brokerage Service"}
        </h2>
        {headerToolbar}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Brokerage Type Selection — hidden in contract mode (always Standard) */}
        {!contractMode && (
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-base)",
            marginBottom: "8px"
          }}>
            Brokerage Type *
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            {brokerageTypes.map(type => {
              const isSelected = data.brokerageType === type;
              const isHovered = hoveredType === type;
              
              // Compute styles based on state
              let backgroundColor = "var(--theme-bg-surface)";
              let borderColor = "var(--neuron-ui-border)";
              let textColor = "var(--neuron-ink-base)";
              let cursor = viewMode ? "default" : "pointer";
              let opacity = viewMode && !isSelected ? 0.6 : 1;

              if (isSelected) {
                backgroundColor = "var(--theme-action-primary-bg)";
                borderColor = "var(--theme-action-primary-bg)";
                textColor = "white";
              } else if (isHovered && !viewMode) {
                backgroundColor = "var(--theme-bg-surface-tint)";
                borderColor = "var(--theme-action-primary-bg)";
              }
              
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
                    color: textColor,
                    backgroundColor: backgroundColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: "6px",
                    cursor: cursor,
                    transition: "all 0.15s ease",
                    opacity: opacity
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* ✨ CONTRACT MODE: Info badges only (Type of Entry & POD moved to ContractGeneralDetailsSection) */}
        {contractMode && (
          <>
            {/* Contract info badge */}
            <div style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--theme-bg-surface-tint)",
                border: "1px solid #CCFBF1",
                borderRadius: "14px",
              }}>
                Standard
              </span>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "var(--theme-bg-surface-tint)",
                border: "1px solid #CCFBF1",
                borderRadius: "14px",
              }}>
                Multi-Modal
              </span>
              <span style={{
                fontSize: "11px",
                color: "var(--neuron-ink-muted)",
                fontStyle: "italic",
              }}>
                Brokerage contracts are always Standard type with Multi-Modal rate columns
              </span>
            </div>
          </>
        )}

        {/* Standard Brokerage Fields — only in project mode */}
        {!contractMode && data.brokerageType === "Standard" && (
          <>
            {/* Type of Entry */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Type of Entry
              </label>
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

            {/* POD / AOL/POL */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                {isExport ? "AOL/POL" : "Port of Discharge (POD)"}
              </label>
              <FormSelect
                value={data.pod || ""}
                onChange={(value) => updateField("pod", value)}
                options={[
                  { value: "NAIA", label: "NAIA" },
                  { value: "MICP", label: "MICP" },
                  { value: "POM", label: "POM" }
                ]}
                placeholder={isExport ? "Select AOL/POL..." : "Select POD..."}
                disabled={viewMode}
              />
            </div>

            {/* Mode */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Mode
              </label>
              <FormSelect
                value={data.mode || ""}
                onChange={(value) => updateField("mode", value)}
                options={[
                  { value: "FCL", label: "FCL" },
                  { value: "LCL", label: "LCL" },
                  { value: "AIR", label: "AIR" },
                  { value: "Multi-modal", label: "Multi-modal" }
                ]}
                placeholder="Select Mode..."
                disabled={viewMode}
              />
            </div>

            {/* Shipment-specific fields — hidden in contract mode */}
            {!contractMode && (
            <>
            {/* Cargo Type */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Cargo Type
              </label>
              <FormSelect
                value={data.cargoType || ""}
                onChange={(value) => updateField("cargoType", value)}
                options={[
                  { value: "Dry", label: "Dry" },
                  { value: "Reefer", label: "Reefer" },
                  { value: "Breakbulk", label: "Breakbulk" },
                  { value: "RORO", label: "RORO" }
                ]}
                placeholder="Select Cargo Type..."
                disabled={viewMode}
              />
            </div>

            {/* Commodity Description & Delivery Address */}
            <div style={{ display: "grid", gridTemplateColumns: isExport ? "1fr" : "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Commodity Description
                </label>
                <input
                  type="text"
                  value={data.commodityDescription || ""}
                  onChange={(e) => updateField("commodityDescription", e.target.value)}
                  placeholder="Enter commodity description"
                  disabled={viewMode}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    cursor: viewMode ? "default" : "text"
                  }}
                  onFocus={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>
              
              {/* Delivery Address - Hide for Export */}
              {!isExport && (
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    value={data.deliveryAddress || ""}
                    onChange={(e) => updateField("deliveryAddress", e.target.value)}
                    placeholder="Enter delivery address"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                      if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                      if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                </div>
              )}
            </div>

            {/* Conditional Mode Fields */}
            {data.mode === "FCL" && (
              <div style={{
                padding: "16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                marginTop: "20px"
              }}>
                <ContainerEntriesManager
                  containers={data.containers || []}
                  onChange={(containers) => updateField("containers", containers)}
                  disabled={viewMode}
                />
              </div>
            )}
            </>
            )}
          </>
        )}

        {/* All-Inclusive Brokerage Fields */}
        {data.brokerageType === "All-Inclusive" && (
          <>
            {/* Shipment-specific fields — hidden in contract mode */}
            {!contractMode && (
            <>
            {/* Commodity Description & Country of Origin */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Commodity Description
                </label>
                <input
                  type="text"
                  value={data.commodityDescription || ""}
                  onChange={(e) => updateField("commodityDescription", e.target.value)}
                  placeholder="Enter commodity description"
                  disabled={viewMode}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    cursor: viewMode ? "default" : "text"
                  }}
                  onFocus={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Country of Origin
                </label>
                <input
                  type="text"
                  value={data.countryOfOrigin || ""}
                  onChange={(e) => updateField("countryOfOrigin", e.target.value)}
                  placeholder="Enter country of origin"
                  disabled={viewMode}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    cursor: viewMode ? "default" : "text"
                  }}
                  onFocus={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>
            </div>

            {/* Preferential Treatment */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Preferential Treatment
              </label>
              <FormSelect
                value={data.preferentialTreatment || ""}
                onChange={(value) => updateField("preferentialTreatment", value)}
                options={[
                  { value: "Form E", label: "Form E" },
                  { value: "Form D", label: "Form D" },
                  { value: "Form AI", label: "Form AI" },
                  { value: "Form AK", label: "Form AK" },
                  { value: "Form JP", label: "Form JP" }
                ]}
                placeholder="Select preferential treatment..."
                disabled={viewMode}
              />
            </div>

            {/* POD, Cargo Type, Delivery Address */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  {isExport ? "AOL/POL" : "Port of Discharge (POD)"}
                </label>
                <FormSelect
                  value={data.pod || ""}
                  onChange={(value) => updateField("pod", value)}
                  options={[
                    { value: "NAIA", label: "NAIA" },
                    { value: "MICP", label: "MICP" },
                    { value: "POM", label: "POM" }
                  ]}
                  placeholder={isExport ? "Select AOL/POL..." : "Select POD..."}
                  disabled={viewMode}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Cargo Type
                </label>
                <FormSelect
                  value={data.cargoType || ""}
                  onChange={(value) => updateField("cargoType", value)}
                  options={[
                    { value: "Dry", label: "Dry" },
                    { value: "Reefer", label: "Reefer" },
                    { value: "Breakbulk", label: "Breakbulk" },
                    { value: "RORO", label: "RORO" }
                  ]}
                  placeholder="Select..."
                  disabled={viewMode}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Delivery Address
                </label>
                <input
                  type="text"
                  value={data.deliveryAddress || ""}
                  onChange={(e) => updateField("deliveryAddress", e.target.value)}
                  placeholder="Enter address"
                  disabled={viewMode}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    cursor: viewMode ? "default" : "text"
                  }}
                  onFocus={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>
            </div>

            {/* Mode */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Mode
              </label>
              <FormSelect
                value={data.mode || ""}
                onChange={(value) => updateField("mode", value)}
                options={[
                  { value: "FCL", label: "FCL" },
                  { value: "LCL", label: "LCL" },
                  { value: "AIR", label: "AIR" },
                  { value: "Multi-modal", label: "Multi-modal" }
                ]}
                placeholder="Select Mode..."
                disabled={viewMode}
              />
            </div>

            {/* Conditional Mode Fields */}
            {data.mode === "FCL" && (
              <div style={{
                padding: "16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px"
              }}>
                <ContainerEntriesManager
                  containers={data.containers || []}
                  onChange={(containers) => updateField("containers", containers)}
                  disabled={viewMode}
                />
              </div>
            )}
            </>
            )}
          </>
        )}

        {/* Non-Regular Brokerage Fields */}
        {data.brokerageType === "Non-Regular" && (
          <>
            {/* Type of Entry */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Type of Entry
              </label>
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

            {/* POD, Mode, Cargo Type */}
            <div style={{ display: "grid", gridTemplateColumns: contractMode ? "1fr 1fr" : "1fr 1fr 1fr", gap: "16px" }}>
              {/* POD */}
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  {isExport ? "AOL/POL" : "Port of Discharge (POD)"}
                </label>
                <FormSelect
                  value={data.pod || ""}
                  onChange={(value) => updateField("pod", value)}
                  options={[
                    { value: "NAIA", label: "NAIA" },
                    { value: "MICP", label: "MICP" },
                    { value: "POM", label: "POM" }
                  ]}
                  placeholder={isExport ? "Select AOL/POL..." : "Select POD..."}
                  disabled={viewMode}
                />
              </div>

              {/* Mode */}
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Mode
                </label>
                <FormSelect
                  value={data.mode || ""}
                  onChange={(value) => updateField("mode", value)}
                  options={[
                    { value: "FCL", label: "FCL" },
                    { value: "LCL", label: "LCL" },
                    { value: "AIR", label: "AIR" },
                    { value: "Multi-modal", label: "Multi-modal" }
                  ]}
                  placeholder="Select Mode..."
                  disabled={viewMode}
                />
              </div>

              {/* Cargo Type — hidden in contract mode */}
              {!contractMode && (
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Cargo Type
                </label>
                <FormSelect
                  value={data.cargoType || ""}
                  onChange={(value) => updateField("cargoType", value)}
                  options={[
                    { value: "Dry", label: "Dry" },
                    { value: "Reefer", label: "Reefer" },
                    { value: "Breakbulk", label: "Breakbulk" },
                    { value: "RORO", label: "RORO" }
                  ]}
                  placeholder="Select Cargo Type..."
                  disabled={viewMode}
                />
              </div>
              )}
            </div>

            {/* Shipment-specific fields — hidden in contract mode */}
            {!contractMode && (
            <>
            {/* Commodity Description & Delivery Address */}
            <div style={{ display: "grid", gridTemplateColumns: isExport ? "1fr" : "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "8px"
                }}>
                  Commodity Description
                </label>
                <input
                  type="text"
                  value={data.commodityDescription || ""}
                  onChange={(e) => updateField("commodityDescription", e.target.value)}
                  placeholder="Enter commodity description"
                  disabled={viewMode}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--neuron-ink-base)",
                    backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                    cursor: viewMode ? "default" : "text"
                  }}
                  onFocus={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                  }}
                  onBlur={(e) => {
                    if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  }}
                />
              </div>
              
              {!isExport && (
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    value={data.deliveryAddress || ""}
                    onChange={(e) => updateField("deliveryAddress", e.target.value)}
                    placeholder="Enter delivery address"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                      if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                      if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                </div>
              )}
            </div>

            {/* Conditional Mode Fields */}
            {data.mode === "FCL" && (
              <div style={{
                padding: "16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                marginTop: "16px"
              }}>
                <ContainerEntriesManager
                  containers={data.containers || []}
                  onChange={(containers) => updateField("containers", containers)}
                  disabled={viewMode}
                />
              </div>
            )}

            {data.mode === "LCL" && (
              <div style={{
                padding: "16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                marginTop: "16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Gross Weight (GWT)
                  </label>
                  <input
                    type="text"
                    value={data.lclGwt || ""}
                    onChange={(e) => updateField("lclGwt", e.target.value)}
                    placeholder="e.g. 1000 kg"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Dimensions (DIMS)
                  </label>
                  <input
                    type="text"
                    value={data.lclDims || ""}
                    onChange={(e) => updateField("lclDims", e.target.value)}
                    placeholder="e.g. 10x10x10 cm"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                </div>
              </div>
            )}

            {data.mode === "AIR" && (
              <div style={{
                padding: "16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                marginTop: "16px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px"
              }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Gross Weight (GWT)
                  </label>
                  <input
                    type="text"
                    value={data.airGwt || ""}
                    onChange={(e) => updateField("airGwt", e.target.value)}
                    placeholder="e.g. 500 kg"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "8px"
                  }}>
                    Chargeable Weight (CWT)
                  </label>
                  <input
                    type="text"
                    value={data.airCwt || ""}
                    onChange={(e) => updateField("airCwt", e.target.value)}
                    placeholder="e.g. 600 kg"
                    disabled={viewMode}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      transition: "border-color 0.15s ease",
                      cursor: viewMode ? "default" : "text"
                    }}
                    onFocus={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                    }}
                    onBlur={(e) => {
                        if (!viewMode) e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                    }}
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