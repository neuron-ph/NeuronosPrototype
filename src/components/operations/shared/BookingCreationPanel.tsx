/**
 * BookingCreationPanel
 *
 * Shared wrapper for all booking creation panels (Brokerage, Forwarding,
 * Trucking, Marine Insurance, Others). Encapsulates the slide-in shell,
 * booking-style header, scrollable form area, and sticky footer — all
 * previously duplicated ~120 lines × 5 panels.
 *
 * Uses `common/SidePanel` internally for backdrop, animation, ESC, scroll lock.
 *
 * @see /docs/blueprints/BOOKING_PANEL_DRY_BLUEPRINT.md
 */

import React from "react";
import { X } from "lucide-react";
import { SidePanel } from "../../common/SidePanel";

interface BookingCreationPanelProps {
  /** Controls panel visibility */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Icon rendered in the teal badge (e.g. <FileCheck size={20} />) */
  icon: React.ReactNode;
  /** Panel title (e.g. "New Brokerage Booking") */
  title: string;
  /** Subtitle text below the title */
  subtitle: string;
  /** HTML form id — connects the footer submit button to the form */
  formId: string;
  /** Form submit handler */
  onSubmit: (e: React.FormEvent) => void;
  /** Whether submit is in progress — disables button + shows "Creating..." */
  isSubmitting: boolean;
  /** Whether the form is valid — enables/disables submit button */
  isFormValid: boolean;
  /** Submit button label (default: "Create Booking") */
  submitLabel?: string;
  /** Icon shown in the submit button (e.g. <FileCheck size={16} />) */
  submitIcon?: React.ReactNode;
  /** Form fields — rendered inside the scrollable form area */
  children: React.ReactNode;
}

export function BookingCreationPanel({
  isOpen,
  onClose,
  icon,
  title,
  subtitle,
  formId,
  onSubmit,
  isSubmitting,
  isFormValid,
  submitLabel = "Create Booking",
  submitIcon,
  children,
}: BookingCreationPanelProps) {
  const horizontalPadding = "clamp(24px, 3vw, 40px)";

  // Build the custom header ReactNode for SidePanel
  const headerContent = (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--theme-bg-surface-tint)" }}
          >
            <span style={{ color: "var(--theme-action-primary-bg)" }}>{icon}</span>
          </div>
          <h2 style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
            {title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{
            color: "var(--neuron-ink-muted)",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <X size={20} />
        </button>
      </div>
      <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>{subtitle}</p>
    </div>
  );

  // Build the sticky footer
  const footerContent = (
    <div
      className="py-6 border-t flex items-center justify-end gap-3"
      style={{
        paddingLeft: horizontalPadding,
        paddingRight: horizontalPadding,
        borderColor: "var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="px-6 py-2.5 rounded-lg transition-colors"
        style={{
          border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-surface)",
          color: "var(--neuron-ink-secondary)",
          fontSize: "14px",
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
        }}
      >
        Cancel
      </button>
      <button
        type="submit"
        form={formId}
        disabled={!isFormValid || isSubmitting}
        className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
        style={{
          backgroundColor: isFormValid && !isSubmitting ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)",
          color: "var(--theme-action-primary-text)",
          fontSize: "14px",
          fontWeight: 600,
          border: "none",
          cursor: isFormValid && !isSubmitting ? "pointer" : "not-allowed",
          opacity: isFormValid && !isSubmitting ? 1 : 0.6,
        }}
        onMouseEnter={(e) => {
          if (isFormValid && !isSubmitting) {
            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
          }
        }}
        onMouseLeave={(e) => {
          if (isFormValid && !isSubmitting) {
            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
          }
        }}
      >
        {submitIcon}
        {isSubmitting ? "Creating..." : submitLabel}
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={headerContent}
      footer={footerContent}
      width="min(1120px, calc(100vw - 32px))"
      showCloseButton={false}
    >
      {/* Scrollable form area */}
      <div
        className="flex-1 overflow-auto py-8 h-full"
        style={{
          paddingLeft: horizontalPadding,
          paddingRight: horizontalPadding,
        }}
      >
        <form onSubmit={onSubmit} id={formId}>
          {children}
        </form>
      </div>
    </SidePanel>
  );
}
