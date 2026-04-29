import { FileText, Package, MapPin, Plane, Ship, Truck, Container, Box, AlertTriangle, CheckCircle2 } from "lucide-react";
import { CustomDropdown } from "../../bd/CustomDropdown";
import type { BrokerageDetails, BrokerageSubtype, ShipmentType, Mode, CargoType } from "../../../types/pricing";

interface BrokerageFormV2Props {
  data: Partial<BrokerageDetails>;
  onChange: (data: Partial<BrokerageDetails>) => void;
}

export function BrokerageFormV2({ data, onChange }: BrokerageFormV2Props) {
  const updateField = (field: keyof BrokerageDetails, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div>
      <div style={{
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--neuron-ink-primary)",
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}>
        <FileText size={14} style={{ color: "var(--theme-action-primary-bg)" }} />
        SERVICE DETAILS
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "12px"
      }}>
        {/* Subtype */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Brokerage Subtype *
          </label>
          <CustomDropdown
            value={data.subtype || ""}
            onChange={(value) => updateField('subtype', value as BrokerageSubtype)}
            options={[
              { value: "Import Air", label: "Import Air", icon: <Plane size={16} /> },
              { value: "Import Ocean", label: "Import Ocean", icon: <Ship size={16} /> },
              { value: "Export Air", label: "Export Air", icon: <Plane size={16} /> },
              { value: "Export Ocean", label: "Export Ocean", icon: <Ship size={16} /> }
            ]}
            placeholder="Select subtype"
          />
        </div>

        {/* Shipment Type */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Shipment Type *
          </label>
          <CustomDropdown
            value={data.shipment_type || ""}
            onChange={(value) => updateField('shipment_type', value as ShipmentType)}
            options={[
              { value: "FCL", label: "FCL", icon: <Container size={16} /> },
              { value: "LCL", label: "LCL", icon: <Box size={16} /> },
              { value: "Consolidation", label: "Consolidation", icon: <Package size={16} /> },
              { value: "Break Bulk", label: "Break Bulk", icon: <Package size={16} /> }
            ]}
            placeholder="Select type"
          />
        </div>

        {/* Type of Entry */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Customs Entry Procedure Code
          </label>
          <input
            type="text"
            value={data.type_of_entry || ""}
            onChange={(e) => updateField('type_of_entry', e.target.value)}
            placeholder="e.g., Consumption Entry"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* POD */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            POD (Port of Discharge)
          </label>
          <input
            type="text"
            value={data.pod || ""}
            onChange={(e) => updateField('pod', e.target.value)}
            placeholder="e.g., Manila South Harbor"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* Mode */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Mode
          </label>
          <CustomDropdown
            value={data.mode || ""}
            onChange={(value) => updateField('mode', value as Mode)}
            options={[
              { value: "Air", label: "Air", icon: <Plane size={16} /> },
              { value: "Ocean", label: "Ocean", icon: <Ship size={16} /> },
              { value: "Land", label: "Land", icon: <Truck size={16} /> }
            ]}
            placeholder="Select mode"
          />
        </div>

        {/* Cargo Type */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Cargo Type
          </label>
          <CustomDropdown
            value={data.cargo_type || ""}
            onChange={(value) => updateField('cargo_type', value as CargoType)}
            options={[
              { value: "General", label: "General", icon: <Package size={16} /> },
              { value: "Perishable", label: "Perishable", icon: <AlertTriangle size={16} /> },
              { value: "Hazardous", label: "Hazardous", icon: <AlertTriangle size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> },
              { value: "Fragile", label: "Fragile", icon: <AlertTriangle size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
              { value: "High Value", label: "High Value", icon: <CheckCircle2 size={16} style={{ color: "var(--theme-status-success-fg)" }} /> }
            ]}
            placeholder="Select cargo type"
          />
        </div>

        {/* Commodity */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Commodity
          </label>
          <input
            type="text"
            value={data.commodity || ""}
            onChange={(e) => updateField('commodity', e.target.value)}
            placeholder="e.g., Electronic components, Pharmaceutical products"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* Declared Value */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Declared Value (₱)
          </label>
          <input
            type="number"
            value={data.declared_value || ""}
            onChange={(e) => updateField('declared_value', Number(e.target.value) || undefined)}
            placeholder="0.00"
            min="0"
            step="0.01"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)",
              textAlign: "right"
            }}
          />
        </div>

        {/* Delivery Address */}
        <div style={{ gridColumn: "2 / -1" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Delivery Address
          </label>
          <input
            type="text"
            value={data.delivery_address || ""}
            onChange={(e) => updateField('delivery_address', e.target.value)}
            placeholder="Full delivery address"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* Country of Origin */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Country of Origin
          </label>
          <input
            type="text"
            value={data.country_of_origin || ""}
            onChange={(e) => updateField('country_of_origin', e.target.value)}
            placeholder="e.g., China"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* Preferential Treatment */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            Preferential Treatment
          </label>
          <input
            type="text"
            value={data.preferential_treatment || ""}
            onChange={(e) => updateField('preferential_treatment', e.target.value)}
            placeholder="e.g., ASEAN, FTA"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* PSIC */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            PSIC
          </label>
          <input
            type="text"
            value={data.psic || ""}
            onChange={(e) => updateField('psic', e.target.value)}
            placeholder="PSIC code"
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: "13px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "4px",
              backgroundColor: "var(--theme-bg-surface)"
            }}
          />
        </div>

        {/* AEO */}
        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 500, color: "var(--theme-text-muted)", marginBottom: "4px" }}>
            AEO
          </label>
          <CustomDropdown
            value={data.aeo || ""}
            onChange={(value) => updateField('aeo', value)}
            options={[
              { value: "Yes", label: "Yes", icon: <CheckCircle2 size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
              { value: "No", label: "No" }
            ]}
            placeholder="Select AEO status"
          />
        </div>
      </div>
    </div>
  );
}