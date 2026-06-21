import { useState, useRef, useEffect } from "react";
import { Unlock, ChevronDown } from "lucide-react";

/**
 * NEU-022: the lock/unlock control for a LOCKED (converted) quotation.
 *
 * Lock and Unlock are the SAME control: a "🔒 Locked ▾" dropdown (mirrors the
 * adjacent StatusChangeButton). A manager holding the `amend` grant opens it and
 * picks "Unlock & Amend", which opens the editable amend session (the builder,
 * which carries the guardrail banner + Save/Cancel). The menu item's sublabel is
 * the guardrail, so there's no separate confirm/modal.
 */
export function UnlockAmendButton({ onUnlock, note }: { onUnlock: () => void; note?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Unlock this quotation to edit."
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: "36px",
          padding: "0 14px",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--theme-status-warning-fg)",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
      >
        <Unlock size={14} />
        Unlock to edit
        <ChevronDown size={14} style={{ color: "var(--theme-status-warning-fg)" }} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Unlock quotation"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "260px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onUnlock(); }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 16px",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <div style={{ marginTop: "2px" }}>
              <Unlock size={16} style={{ color: "var(--theme-status-warning-fg)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", color: "var(--theme-text-primary)", fontWeight: 500, marginBottom: "2px" }}>
                Unlock &amp; Amend
              </div>
              <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", lineHeight: "1.4" }}>
                {note ?? "Edits un-invoiced charges only."}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
