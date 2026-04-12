import { Ship, MapPin } from "lucide-react";
import type { Project } from "../../types/pricing";
import { ProjectBookingsTabBD } from "./ProjectBookingsTabBD";

interface ServicesAndBookingsTabProps {
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onUpdate?: () => void;
}

export function ServicesAndBookingsTab({ project, currentUser, onUpdate }: ServicesAndBookingsTabProps) {
  return (
    <div style={{ 
      flex: 1,
      overflow: "auto"
    }}>
      {/* Main Content Area */}
      <div style={{ 
        padding: "32px 48px",
        maxWidth: "1400px",
        margin: "0 auto"
      }}>
        
        {/* Shipment Details Section */}
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "24px"
        }}>
          <h2 style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <Ship size={18} />
            Shipment Details
          </h2>

          <div style={{ display: "grid", gap: "20px" }}>
            {/* Row 1: Movement, Category, Shipment Type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <Field label="Movement" value={project.movement} />
              <Field label="Category" value={project.category} />
              <Field label="Shipment Type" value={project.shipment_type} />
            </div>

            {/* Row 2: POL/AOL and POD/AOD */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <Field label="POL/AOL" value={project.pol_aol} icon={<MapPin size={16} />} />
              <Field label="POD/AOD" value={project.pod_aod} icon={<MapPin size={16} />} />
            </div>

            {/* Row 3: Carrier, Transit Days, Incoterm */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <Field label="Carrier" value={project.carrier} />
              <Field label="Transit Days" value={project.transit_days} />
              <Field label="Incoterm" value={project.incoterm} />
            </div>

            {/* Row 4: Services */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Service/s
              </label>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                {project.services && project.services.length > 0 ? (
                  project.services.map((service, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "var(--theme-action-primary-bg)",
                        border: "1px solid var(--theme-action-primary-bg)",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "white",
                        cursor: "default"
                      }}
                    >
                      {service}
                    </span>
                  ))
                ) : (
                  <div style={{
                    padding: "10px 14px",
                    backgroundColor: "var(--theme-bg-page)",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "6px",
                    fontSize: "14px",
                    color: "var(--theme-text-muted)",
                    width: "100%"
                  }}>
                    No services selected
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Service Specifications & Bookings Section */}
        <ProjectBookingsTabBD 
          project={project} 
          currentUser={currentUser} 
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

// Helper component for displaying field labels and values
function Field({ 
  label, 
  value, 
  icon 
}: { 
  label: string; 
  value?: string | number | null; 
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--neuron-ink-base)",
        marginBottom: "8px"
      }}>
        {label}
      </label>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 14px",
        backgroundColor: "var(--theme-bg-page)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "6px",
        fontSize: "14px",
        color: value ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
      }}>
        {icon && <span style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }}>{icon}</span>}
        <span>{value || "—"}</span>
      </div>
    </div>
  );
}