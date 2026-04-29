import { createPortal } from "react-dom";
import { useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

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
  const reduced = useReducedMotion();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: reduced ? 0 : 0.18, ease: "easeOut" } },
    exit:   { opacity: 0, transition: { duration: reduced ? 0 : 0.14, ease: "easeIn" } },
  };

  const cardVariants = {
    hidden:  { opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 6 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: reduced ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] } },
    exit:    { opacity: 0, scale: reduced ? 1 : 0.97, y: reduced ? 0 : 3, transition: { duration: reduced ? 0 : 0.16, ease: "easeIn" } },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="neuron-modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
          onClick={onClose}
        >
          {/* Card */}
          <motion.div
            key="neuron-modal-card"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              width: "100%",
              maxWidth: "525px",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-default)",
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
              <h2
                id="neuron-modal-title"
                style={{
                  fontSize: "20px",
                  fontWeight: 600,
                  color: "var(--theme-text-primary)",
                  letterSpacing: "-0.01em",
                  margin: "0 0 12px",
                  lineHeight: "1.3",
                }}
              >
                {title}
              </h2>

              <p
                id="neuron-modal-desc"
                style={{
                  fontSize: "14px",
                  color: "var(--theme-text-muted)",
                  lineHeight: "1.5",
                  margin: 0,
                }}
              >
                {description}
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", backgroundColor: "var(--theme-border-subtle)", margin: "0 32px" }} />

            {/* Footer */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
              padding: "14px 32px",
            }}>
              {/* Cancel */}
              <motion.button
                onClick={onClose}
                disabled={isLoading}
                whileHover={reduced ? {} : { scale: 1.01 }}
                whileTap={reduced ? {} : { scale: 0.98 }}
                transition={{ duration: 0.12 }}
                style={{
                  padding: "8px 18px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--theme-text-primary)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                Cancel
              </motion.button>

              {/* Confirm */}
              <motion.button
                onClick={() => { if (!isLoading) onConfirm(); }}
                disabled={isLoading}
                whileHover={reduced ? {} : { scale: 1.02 }}
                whileTap={reduced ? {} : { scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "8px 18px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#FFFFFF",
                  backgroundColor: isLoading ? "var(--theme-border-default)" : config.confirmBg,
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
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
