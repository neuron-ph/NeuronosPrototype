import { createPortal } from "react-dom";
import { useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// NeuronModal — System Action Modal
//
// Use ONLY for irreversible system actions that require explicit user
// confirmation (delete, void, cancel, override). All other overlays should
// use Full Screen, SidePanel, or inline patterns per the Neuron surface
// hierarchy rule.
//
// Usage:
//   <NeuronModal
//     isOpen={open}
//     onClose={() => setOpen(false)}
//     title="Delete Quotation"
//     description="This action is permanent and cannot be undone."
//     confirmLabel="Delete Quotation"
//     confirmIcon={<Trash2 size={15} />}
//     onConfirm={handleDelete}
//     variant="danger"
//   />
// ─────────────────────────────────────────────────────────────────────────────

export type NeuronModalVariant = "danger" | "warning" | "info";

interface NeuronModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmIcon?: React.ReactNode;
  onConfirm: () => void;
  isLoading?: boolean;
  variant?: NeuronModalVariant;
}

const VARIANT_CONFIG: Record<NeuronModalVariant, {
  confirmBg: string;
  confirmHoverBg: string;
}> = {
  danger: {
    confirmBg: "#C94F3D",
    confirmHoverBg: "#B03A2A",
  },
  warning: {
    confirmBg: "#C88A2B",
    confirmHoverBg: "#A87020",
  },
  info: {
    confirmBg: "#237F66",
    confirmHoverBg: "#1E6D59",
  },
};

export function NeuronModal({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  confirmIcon,
  onConfirm,
  isLoading = false,
  variant = "danger",
}: NeuronModalProps) {
  const config = VARIANT_CONFIG[variant];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(18, 51, 43, 0.35)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "525px",
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5ECE9",
          borderRadius: "8px",
          boxShadow: "0 8px 32px 0 rgba(16, 24, 20, 0.12)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="neuron-modal-title"
        aria-describedby="neuron-modal-desc"
      >
        {/* Body */}
        <div style={{ padding: "20px 32px 16px" }}>
          {/* Title */}
          <h2
            id="neuron-modal-title"
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#12332B",
              letterSpacing: "-0.01em",
              marginBottom: "12px",
              lineHeight: "1.3",
              margin: "0 0 12px",
            }}
          >
            {title}
          </h2>

          {/* Description */}
          <p
            id="neuron-modal-desc"
            style={{
              fontSize: "14px",
              color: "#6B7A76",
              lineHeight: "1.5",
              margin: 0,
            }}
          >
            {description}
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", backgroundColor: "#EEF3F1", margin: "0 32px" }} />

        {/* Footer */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "10px",
          padding: "14px 32px",
        }}>
          {/* Cancel */}
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: "8px 18px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#12332B",
              backgroundColor: "transparent",
              border: "1px solid #E5ECE9",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F1F6F4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            Cancel
          </button>

          {/* Confirm */}
          <button
            onClick={() => { if (!isLoading) onConfirm(); }}
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 18px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#FFFFFF",
              backgroundColor: isLoading ? "#D1D5DB" : config.confirmBg,
              border: "none",
              borderRadius: "6px",
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.backgroundColor = config.confirmHoverBg;
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.backgroundColor = config.confirmBg;
            }}
          >
            {confirmIcon}
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
