import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

export type SidePanelSize = "sm" | "md" | "lg" | "xl" | "full";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: SidePanelSize;
  width?: string; // Custom width override
  showCloseButton?: boolean;
  zIndexBase?: number;
}

export function SidePanel({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  width,
  showCloseButton = true,
  zIndexBase = 1100,
}: SidePanelProps) {
  
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Determine width based on size prop
  const getWidth = () => {
    if (width) return width;
    
    switch (size) {
      case "sm": return "400px";
      case "md": return "600px";
      case "lg": return "920px"; // Matches current BillingDetailsSheet
      case "xl": return "1200px";
      case "full": return "100%";
      default: return "600px";
    }
  };

  const panelWidth = getWidth();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 backdrop-blur-[2px]"
            onClick={onClose}
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.4)",
              zIndex: zIndexBase,
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ 
              type: "spring",
              damping: 30,
              stiffness: 300,
              duration: 0.3
            }}
            className="fixed right-0 top-0 h-full bg-[var(--theme-bg-surface)] shadow-2xl flex flex-col border-l border-[var(--theme-border-default)]"
            style={{ width: panelWidth, maxWidth: "100vw", zIndex: zIndexBase + 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Standard Header (Optional) */}
            {title && (
              <div className="px-12 py-6 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] flex items-center justify-between shrink-0">
                <div className="flex-1">
                   {typeof title === 'string' ? (
                       <h2 className="text-[20px] font-semibold text-[var(--theme-text-primary)]">{title}</h2>
                   ) : title}
                </div>
                
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-surface-subtle)] transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
               {children}
            </div>

            {/* Footer (Optional) */}
            {footer && (
              <div className="shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
