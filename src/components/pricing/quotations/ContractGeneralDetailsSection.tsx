/**
 * Contract General Details Section
 * 
 * Renders contract-level fields (Port of Entry, Transportation, Type of Entry, Releasing)
 * between the basic contract info (GeneralDetailsSection) and the service-specific scope sections.
 * 
 * These fields apply to the entire contract, not to any single service.
 * Only rendered when quotationType === "contract".
 */
import { useState } from "react";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { DropdownTagInput } from "./DropdownTagInput";

// Port options for Philippines customs operations
const PORT_OPTIONS = [
  { value: "MICP", label: "MICP (Manila International Container Port)" },
  { value: "NAIA", label: "NAIA (Ninoy Aquino International Airport)" },
  { value: "POM", label: "POM (Port of Manila)" },
  { value: "Port of Subic", label: "Port of Subic" },
  { value: "Port of Batangas", label: "Port of Batangas" },
  { value: "Port of Cebu", label: "Port of Cebu" },
  { value: "Port of Davao", label: "Port of Davao" },
  { value: "Port of Cagayan de Oro", label: "Port of Cagayan de Oro" },
  { value: "Port of General Santos", label: "Port of General Santos" },
  { value: "Port of Zamboanga", label: "Port of Zamboanga" },
  { value: "Clark International Airport", label: "Clark International Airport" },
  { value: "Mactan-Cebu International Airport", label: "Mactan-Cebu International Airport" },
];

// Transportation mode options
const TRANSPORTATION_OPTIONS = [
  { value: "Air Freight", label: "Air Freight" },
  { value: "Sea Freight", label: "Sea Freight" },
];

// Type of Entry options
const TYPE_OF_ENTRY_OPTIONS = ["Consumption", "Warehousing", "PEZA"] as const;

// Releasing options
const RELEASING_OPTIONS = [
  { value: "Straight", label: "Straight" },
  { value: "Transfer", label: "Transfer" },
  { value: "Partial", label: "Partial" },
];

interface ContractGeneralDetailsData {
  port_of_entry: string[];
  transportation: string[];
  type_of_entry: string;
  releasing: string;
}

interface ContractGeneralDetailsSectionProps {
  data: ContractGeneralDetailsData;
  onChange: (data: ContractGeneralDetailsData) => void;
  viewMode?: boolean;
}

export function ContractGeneralDetailsSection({
  data,
  onChange,
  viewMode = false,
}: ContractGeneralDetailsSectionProps) {
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);

  const updateField = <K extends keyof ContractGeneralDetailsData>(
    field: K,
    value: ContractGeneralDetailsData[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <h2 style={{
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--neuron-brand-green)",
        margin: 0,
        marginBottom: "20px",
      }}>
        General Details
      </h2>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Row 1: Port of Entry/s + Transportation (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Port of Entry/s - Hybrid dropdown + tag input */}
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
              marginBottom: "8px",
            }}>
              Port of Entry/s
            </label>
            <DropdownTagInput
              value={data.port_of_entry}
              onChange={(values) => updateField("port_of_entry", values)}
              options={PORT_OPTIONS}
              placeholder="Select or search ports..."
              viewMode={viewMode}
              allowCustom
            />
          </div>

          {/* Transportation - Hybrid dropdown + tag input */}
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
              marginBottom: "8px",
            }}>
              Transportation
            </label>
            <DropdownTagInput
              value={data.transportation}
              onChange={(values) => updateField("transportation", values)}
              options={TRANSPORTATION_OPTIONS}
              placeholder="Select mode/s..."
              viewMode={viewMode}
            />
          </div>
        </div>

        {/* Row 2: Type of Entry + Releasing (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Type of Entry - Single select buttons */}
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
              marginBottom: "8px",
            }}>
              Type of Entry
            </label>
            {viewMode ? (
              <div style={{
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--neuron-ink-base)",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                minHeight: "38px",
                display: "flex",
                alignItems: "center",
              }}>
                {data.type_of_entry || "\u2014"}
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                {TYPE_OF_ENTRY_OPTIONS.map(entry => {
                  const isSelected = data.type_of_entry === entry;
                  const isHovered = hoveredEntry === `entry-${entry}`;

                  let bg = "white";
                  let border = "var(--neuron-ui-border)";
                  let color = "var(--neuron-ink-base)";

                  if (isSelected) {
                    bg = "var(--theme-action-primary-bg)";
                    border = "var(--theme-action-primary-bg)";
                    color = "white";
                  } else if (isHovered) {
                    bg = "var(--theme-bg-surface-tint)";
                    border = "var(--theme-action-primary-bg)";
                  }

                  return (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => updateField("type_of_entry", entry)}
                      onMouseEnter={() => setHoveredEntry(`entry-${entry}`)}
                      onMouseLeave={() => setHoveredEntry(null)}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color,
                        backgroundColor: bg,
                        border: `1px solid ${border}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {entry}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Releasing - Single select dropdown */}
          <div>
            <label style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 500,
              color: viewMode ? "var(--neuron-ink-secondary)" : "var(--neuron-ink-base)",
              marginBottom: "8px",
            }}>
              Releasing
            </label>
            {viewMode ? (
              <div style={{
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--neuron-ink-base)",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                minHeight: "38px",
                display: "flex",
                alignItems: "center",
              }}>
                {data.releasing || "\u2014"}
              </div>
            ) : (
              <CustomDropdown
                value={data.releasing}
                options={RELEASING_OPTIONS}
                onChange={(value) => updateField("releasing", value)}
                placeholder="Select releasing type..."
                fullWidth
                buttonStyle={{ padding: "10px 12px", fontSize: "13px", borderRadius: "6px" }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}