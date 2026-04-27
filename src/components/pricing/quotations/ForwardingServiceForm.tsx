import { FormSelect } from "./FormSelect";
import { ContainerEntriesManager } from "./ContainerEntriesManager";
import type { ReactNode } from "react";

interface ContainerEntry {
  id: string;
  type: "20ft" | "40ft" | "45ft" | "";
  qty: number;
}

interface ForwardingFormData {
  incoterms?: string;
  cargoType?: string;
  commodityDescription?: string;
  deliveryAddress?: string;
  aodPod?: string;
  mode?: string;
  aolPol?: string;
  cargoNature?: string;
  
  // Conditional fields based on mode - NEW: Using containers array
  containers?: ContainerEntry[];
  // Legacy fields for backward compatibility
  fclContainerType?: "20ft" | "40ft" | "45ft" | "";
  fclQty?: number;
  lclGwt?: string;
  lclDims?: string;
  airGwt?: string;
  airCwt?: string;
  
  // Conditional based on incoterm
  collectionAddress?: string; // EXW
  carrierAirline?: string; // EXW/FOB/FCA
  transitTime?: string; // EXW/FOB/FCA
  route?: string; // EXW/FOB/FCA
  stackable?: boolean; // EXW/FOB/FCA - Changed to boolean for checkbox
  // Cross-service fields (also used in Brokerage)
  countryOfOrigin?: string;
  preferentialTreatment?: string;
}

interface ForwardingServiceFormProps {
  data: ForwardingFormData;
  onChange: (data: ForwardingFormData) => void;
  builderMode?: "inquiry" | "quotation"; // inquiry = BD users, quotation = PD users
  viewMode?: boolean; // When true, all inputs are disabled
  movement?: "IMPORT" | "EXPORT";
  contractMode?: boolean; // When true, show only scope fields, hide shipment-specific
  headerToolbar?: ReactNode; // Optional toolbar rendered right-aligned in header row
}

export function ForwardingServiceForm({ data, onChange, builderMode = "quotation", viewMode = false, movement = "IMPORT", contractMode = false, headerToolbar }: ForwardingServiceFormProps) {
  const updateField = (field: keyof ForwardingFormData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const isExport = movement === "EXPORT";
  const incoterm = data.incoterms || "";

  // Matrix: Delivery Address shows only for DAP, DDU, DDP regardless of movement direction.
  const showDeliveryAddress = ["DAP", "DDU", "DDP"].includes(incoterm);

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
          {contractMode ? "Forwarding — Contract Scope" : "Forwarding Service"}
        </h2>
        {headerToolbar}
      </div>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Incoterms */}
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-base)",
            marginBottom: "8px"
          }}>
            Incoterms *
          </label>
          <FormSelect
            value={data.incoterms || ""}
            onChange={(value) => updateField("incoterms", value)}
            options={[
              { value: "EXW", label: "EXW" },
              { value: "FOB", label: "FOB" },
              { value: "CFR", label: "CFR" },
              { value: "CIF", label: "CIF" },
              { value: "FCA", label: "FCA" },
              { value: "CPT", label: "CPT" },
              { value: "CIP", label: "CIP" },
              { value: "DAP", label: "DAP" },
              { value: "DDU", label: "DDU" },
              { value: "DDP", label: "DDP" }
            ]}
            placeholder="Select incoterm..."
            disabled={viewMode}
          />
        </div>

        {/* Cargo Type — hidden in contract mode (shipment-specific) */}
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
            placeholder="Select cargo type..."
            disabled={viewMode}
          />
        </div>
        )}

        {/* Cargo Nature — matrix: all incoterms, all movements */}
        <div>
          <label style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-base)",
            marginBottom: "8px"
          }}>
            Cargo Nature
          </label>
          <FormSelect
            value={data.cargoNature || ""}
            onChange={(value) => updateField("cargoNature", value)}
            options={[
              { value: "General Cargo", label: "General Cargo" },
              { value: "Dangerous Goods (DG)", label: "Dangerous Goods (DG)" },
              { value: "Perishables", label: "Perishables" },
              { value: "Valuables", label: "Valuables" },
              { value: "Temperature Controlled", label: "Temperature Controlled" }
            ]}
            placeholder="Select cargo nature..."
            disabled={viewMode}
          />
        </div>

        {/* Commodity Description & Delivery Address */}
        {!contractMode && (
        <div style={{ display: "grid", gridTemplateColumns: showDeliveryAddress ? "1fr 1fr" : "1fr", gap: "16px" }}>
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
              disabled={viewMode}
            />
          </div>
          {showDeliveryAddress && (
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
                disabled={viewMode}
              />
            </div>
          )}
        </div>
        )}

        {/* AOL/POL & AOD/POD */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-base)",
              marginBottom: "8px"
            }}>
              AOL/POL
            </label>
            <input
              type="text"
              value={data.aolPol || ""}
              onChange={(e) => updateField("aolPol", e.target.value)}
              placeholder="Airport/Port of Loading"
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
              AOD/POD
            </label>
            <input
              type="text"
              value={data.aodPod || ""}
              onChange={(e) => updateField("aodPod", e.target.value)}
              placeholder="Airport/Port of Discharge"
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
              disabled={viewMode}
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
            placeholder="Select mode..."
            disabled={viewMode}
          />
        </div>

        {/* Conditional Mode Fields — hidden in contract mode */}
        {!contractMode && data.mode === "FCL" && (
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
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

        {!contractMode && data.mode === "LCL" && (
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px"
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  GWT
                </label>
                <input
                  type="text"
                  value={data.lclGwt || ""}
                  onChange={(e) => updateField("lclGwt", e.target.value)}
                  placeholder="Enter GWT"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
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
                  disabled={viewMode}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  DIMS
                </label>
                <input
                  type="text"
                  value={data.lclDims || ""}
                  onChange={(e) => updateField("lclDims", e.target.value)}
                  placeholder="Enter dimensions"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
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
                  disabled={viewMode}
                />
              </div>
            </div>
          </div>
        )}

        {!contractMode && data.mode === "AIR" && (
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px"
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  GWT
                </label>
                <input
                  type="text"
                  value={data.airGwt || ""}
                  onChange={(e) => updateField("airGwt", e.target.value)}
                  placeholder="Enter GWT"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
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
                  disabled={viewMode}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-base)",
                  marginBottom: "6px"
                }}>
                  CWT
                </label>
                <input
                  type="text"
                  value={data.airCwt || ""}
                  onChange={(e) => updateField("airCwt", e.target.value)}
                  placeholder="Enter CWT"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
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
                  disabled={viewMode}
                />
              </div>
            </div>
          </div>
        )}

        {/* Conditional Incoterm-based Fields — hidden in contract mode */}
        {!contractMode && data.incoterms === "EXW" && (
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px"
          }}>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--neuron-ink-base)",
              marginBottom: "8px"
            }}>
              Collection Address (EXW)
            </label>
            <input
              type="text"
              value={data.collectionAddress || ""}
              onChange={(e) => updateField("collectionAddress", e.target.value)}
              placeholder="Enter collection address"
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
              disabled={viewMode}
            />
          </div>
        )}

        {/* Carrier/Transit/Route/Stackable — matrix: EXW/FOB/FCA, all movements */}
        {!contractMode && (data.incoterms === "EXW" || data.incoterms === "FOB" || data.incoterms === "FCA") && (
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px"
          }}>
            {builderMode === "inquiry" ? (
              // BD users: Show Transit Time and Stackable checkbox
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "12px" }}>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "6px"
                  }}>
                    Transit Time
                  </label>
                  <input
                    type="text"
                    value={data.transitTime || ""}
                    onChange={(e) => updateField("transitTime", e.target.value)}
                    placeholder="e.g., 10 Days"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "13px",
                      color: "var(--neuron-ink-base)",
                      backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      outline: "none",
                      cursor: viewMode ? "default" : "text"
                    }}
                    disabled={viewMode}
                  />
                </div>
                <div>
                  <label style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-base)",
                    marginBottom: "6px"
                  }}>
                    Stackable?
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => !viewMode && updateField("stackable", true)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: data.stackable === true ? "white" : "var(--neuron-ink-secondary)",
                        backgroundColor: data.stackable === true ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : (viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)"),
                        border: `1px solid ${data.stackable === true ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : "var(--neuron-ui-border)"}`,
                        borderRadius: "6px",
                        cursor: viewMode ? "default" : "pointer",
                        transition: "all 0.2s ease",
                        opacity: viewMode ? 0.7 : 1
                      }}
                      disabled={viewMode}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => !viewMode && updateField("stackable", false)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: data.stackable === false ? "white" : "var(--neuron-ink-secondary)",
                        backgroundColor: data.stackable === false ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : (viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)"),
                        border: `1px solid ${data.stackable === false ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : "var(--neuron-ui-border)"}`,
                        borderRadius: "6px",
                        cursor: viewMode ? "default" : "pointer",
                        transition: "all 0.2s ease",
                        opacity: viewMode ? 0.7 : 1
                      }}
                      disabled={viewMode}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // PD users: Show all fields (Carrier/Airline, Transit Time, Route, Stackable checkbox)
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-base)",
                      marginBottom: "6px"
                    }}>
                      Carrier/Airline
                    </label>
                    <input
                      type="text"
                      value={data.carrierAirline || ""}
                      onChange={(e) => updateField("carrierAirline", e.target.value)}
                      placeholder="Enter carrier"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "13px",
                        color: "var(--neuron-ink-base)",
                        backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        outline: "none",
                        cursor: viewMode ? "default" : "text"
                      }}
                      disabled={viewMode}
                    />
                  </div>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-base)",
                      marginBottom: "6px"
                    }}>
                      Transit Time
                    </label>
                    <input
                      type="text"
                      value={data.transitTime || ""}
                      onChange={(e) => updateField("transitTime", e.target.value)}
                      placeholder="e.g., 10 Days"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "13px",
                        color: "var(--neuron-ink-base)",
                        backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        outline: "none",
                        cursor: viewMode ? "default" : "text"
                      }}
                      disabled={viewMode}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "12px" }}>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-base)",
                      marginBottom: "6px"
                    }}>
                      Route
                    </label>
                    <input
                      type="text"
                      value={data.route || ""}
                      onChange={(e) => updateField("route", e.target.value)}
                      placeholder="e.g., MNL-SIN-LAX"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        fontSize: "13px",
                        color: "var(--neuron-ink-base)",
                        backgroundColor: viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                        border: "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        outline: "none",
                        cursor: viewMode ? "default" : "text"
                      }}
                      disabled={viewMode}
                    />
                  </div>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-base)",
                      marginBottom: "6px"
                    }}>
                      Stackable?
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => !viewMode && updateField("stackable", true)}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: data.stackable === true ? "white" : "var(--neuron-ink-secondary)",
                          backgroundColor: data.stackable === true ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : (viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)"),
                          border: `1px solid ${data.stackable === true ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : "var(--neuron-ui-border)"}`,
                          borderRadius: "6px",
                          cursor: viewMode ? "default" : "pointer",
                          transition: "all 0.2s ease",
                          opacity: viewMode ? 0.7 : 1
                        }}
                        disabled={viewMode}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => !viewMode && updateField("stackable", false)}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: data.stackable === false ? "white" : "var(--neuron-ink-secondary)",
                          backgroundColor: data.stackable === false ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : (viewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)"),
                          border: `1px solid ${data.stackable === false ? (viewMode ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)") : "var(--neuron-ui-border)"}`,
                          borderRadius: "6px",
                          cursor: viewMode ? "default" : "pointer",
                          transition: "all 0.2s ease",
                          opacity: viewMode ? 0.7 : 1
                        }}
                        disabled={viewMode}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}