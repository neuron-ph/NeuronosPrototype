import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import type { Project, QuotationNew } from "../../../../types/pricing";
import { QuotationPDFScreen } from "./QuotationPDFScreen";

interface PDFStudioOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  quotation?: QuotationNew;
  onSave: (data: any) => Promise<void>;
  currentUser?: { name: string; email: string } | null;
}

/**
 * Full-screen workspace overlay that hosts the PDF studio. Replaces the
 * old Form/PDF segmented toggle: editing happens on the form view; this
 * overlay is the publishing surface, opened from a single Print button.
 *
 * Not a centered dialog — this is a route-style takeover (cf. Figma
 * preview mode, Linear "Open as page"). QuotationPDFScreen handles its
 * own focus-mode sidebar collapse on mount.
 */
export function PDFStudioOverlay({ isOpen, onClose, project, quotation, onSave, currentUser }: PDFStudioOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[1190] bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />

          {/* Centered modal — 75% of the viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1200] bg-[var(--theme-bg-surface-subtle)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--theme-border-default)]"
            style={{ width: "85vw", height: "85vh" }}
            role="dialog"
            aria-modal="true"
            aria-label="PDF Studio"
          >
            <QuotationPDFScreen
              project={project}
              quotation={quotation}
              onClose={onClose}
              onSave={onSave}
              currentUser={currentUser}
              isEmbedded={false}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
