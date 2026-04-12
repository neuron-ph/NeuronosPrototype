import { Calendar, MapPin } from "lucide-react";
import type { Project, InquiryService } from "../../types/pricing";
import { useState } from "react";
import { ProjectServiceCard } from "./ProjectServiceCard";

interface ProjectDetailsTabProps {
  project: Project;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onUpdate?: () => void;
}

export function ProjectDetailsTab({ project, currentUser, onUpdate }: ProjectDetailsTabProps) {
  const servicesMetadata = project.services_metadata || [];

  // Format date
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div style={{ 
      padding: "32px 48px",
      maxWidth: "1400px",
      margin: "0 auto"
    }}>
      
      {/* General Details Section */}
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
          marginBottom: "20px"
        }}>
          General Details
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Customer and Contact Person Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Customer */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Customer
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: "var(--theme-text-primary)"
              }}>
                {project.customer_name || "—"}
              </div>
            </div>

            {/* Contact Person */}
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Contact Person
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.contact_person_name ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.contact_person_name || "—"}
              </div>
            </div>
          </div>

          {/* Services */}
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

          {/* Project Number and Quotation Reference */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Project Number
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: "var(--theme-text-primary)"
              }}>
                {project.project_number || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Quotation Reference
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.quotation_number ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.quotation_number || "—"}
              </div>
            </div>
          </div>

          {/* BD Owner and Operations Assigned */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                BD Owner
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.bd_owner_user_name ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.bd_owner_user_name || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Operations Assigned
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.ops_assigned_user_name ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.ops_assigned_user_name || "—"}
              </div>
            </div>
          </div>

          {/* Movement, Category, Shipment Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Movement
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.movement ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.movement || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Category
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.category ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.category || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Shipment Type
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.shipment_type ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.shipment_type || "—"}
              </div>
            </div>
          </div>

          {/* POL/AOL and POD/AOD */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                POL/AOL
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.pol_aol ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <MapPin size={16} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
                <span>{project.pol_aol || "—"}</span>
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                POD/AOD
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.pod_aod ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <MapPin size={16} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
                <span>{project.pod_aod || "—"}</span>
              </div>
            </div>
          </div>

          {/* Carrier, Transit Days, Incoterm */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Carrier
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.carrier ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.carrier || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Transit Days
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.transit_days ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.transit_days || "—"}
              </div>
            </div>

            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Incoterm
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: project.incoterm ? "var(--theme-text-primary)" : "var(--theme-text-muted)"
              }}>
                {project.incoterm || "—"}
              </div>
            </div>
          </div>

          {/* Created Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <label style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-base)",
                marginBottom: "8px"
              }}>
                Created Date
              </label>
              <div style={{
                padding: "10px 14px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                fontSize: "14px",
                color: "var(--theme-text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <Calendar size={16} style={{ color: "var(--theme-text-muted)" }} />
                {formatDate(project.created_at)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Service-specific Detail Cards with Bookings */}
      {servicesMetadata.map((service, idx) => (
        <ProjectServiceCard
          key={`${service.service_type}-${idx}`}
          service={service}
          project={project}
          currentUser={currentUser}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}